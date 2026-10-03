/**
 * 화면이 편집을 내는 통로. ops를 만들어 스토어에 넘기고 전송을 밟는다.
 *
 * **전송은 이펙트가 아니라 명시적 펌프다.** `useEffect`로 걸면 `pending`이 바뀔 때마다
 * 이펙트가 다시 돌아 "지금 보내는 중인가"를 ref로 따로 지켜야 하고, 그 ref와 이펙트의
 * 의존 배열이 어긋나는 날 두 요청이 동시에 나간다. 큐에서 다음을 꺼내 보내는 일을 함수
 * 하나에 두고 편집이 들어올 때 그것을 부르면, 조건이 코드에 보인다.
 *
 * **in-flight는 항상 하나다.** README가 요구한다 — *"앞 요청의 `seq`를 받아야 다음
 * `baseSeq`가 정해지기 때문이다. 어기면 두 번째 요청이 409를 받는다."* 그것을 지키는 것은
 * 아래 `pumpingRef`와 **한 번에 하나씩 `await`하는 루프**다. 루프가 도는 동안 들어온 편집은
 * 큐에 쌓이고, 앞 요청이 끝난 뒤 같은 루프가 그것을 집는다.
 */
import { useCallback } from 'react'
import type { Interaction, PatchOp } from '@wirebound/schema'
import { ApiError } from '../api/client'
import { useApi } from '../api/context'
import { refusedBeforeCommit, toFailure } from '../api/failure'
import type { RevisionInverse } from '../api/types'
import { useEditChannel, useLockChannel } from '../realtime/context'
import { EditNotSentError, UnansweredEditError, type EditChannel, type UnansweredCause } from '../realtime/edit-channel'
import { isPageOpen, useEditorStore, useEditorStoreInstance, useOpenPage } from '../store/use-editor-store'
import { MARKER_FRAME_WAIT_MS, type EditFailure, type EditStatus, type RestoredRevision, type UndoAttempt, type UndoHistoryNeed } from '../store/editor-store'
import { LOSS_RANK, type LossPart } from '../store/loss-notice'
import { interactionsOps, propOps, variantOps } from './ops'

/** 서버가 이유를 주지 않은 편집 실패에 쓸 문장(네트워크 단절 등). */
const EDIT_UNKNOWN_FAILURE = '편집을 저장하지 못했습니다'
/** 재조회마저 실패했을 때. 편집 실패와 갈라 적어야 사용자가 무엇이 남았는지 안다. */
const RECOVER_UNKNOWN_FAILURE = '편집에 실패한 뒤 페이지를 다시 불러오지도 못했습니다'

/**
 * **재조회까지 실패한 갈래에서 덧붙이는 문장** — *"실패했다고 말하는데 조작은 화면에
 * 남는다"*를 닫는 자리다.
 *
 * **이 갈래는 `loadPage`를 지나지 않는다.** 그래서 낙관적으로 적용된 편집이 문서에 그대로
 * 남고, 선택도 유지되어 화면이 아무것도 되돌리지 않는다 — 재조회가 **성공한** 갈래가
 * 문서·선택·큐를 서버 상태로 놓는 것과 정반대다. 사용자는 실패 알림을 보면서 **자기가
 * 방금 만든 것이 화면에 그대로 있는 것**을 본다.
 *
 * **되돌릴 문서가 없다 — 그것이 이 갈래의 성질이다.** 서버 상태를 못 읽었으므로 무엇으로
 * 되돌릴지 모른다. **문서를 비우는 쪽은 고르지 않았다:** 그러면 사용자가 보고 있던 것을
 * 통째로 잃고, 그 손실은 *"서버가 잠깐 답을 못 했다"*는 사유에 비해 너무 크다. **할 수
 * 있는 정직한 일은 그 상태를 말하는 것뿐이고**, 그것이 `'diverged'`에 내린 판정과
 * 같은 형태다(*"서버엔 번호가 있는데 내 화면엔 없다 — 새로고침하면 맞춰집니다"*).
 *
 * **우리 쪽 문장에만 붙인다.** 서버 문장을 고치지 않는 경계(`api/failure.tsx`)는 그대로다.
 */
const UNRECOVERED_NOTICE =
  '화면에 남아 있는 편집은 저장되지 않았습니다. 새로고침해 서버 상태를 확인하세요.'

/**
 * **실시간 연결이 열려 있는가** — 편집을 WS 로 낼지(`pump`) 가른다. 결과를 모르는 편집이 뒤늦게 커밋되면 화면에 저절로
 * 서는지(`unknownNotice`의 `live`)는 이것만으로 못 가른다 — 아래 `lateCommitArrives`.
 */
function realtimeOpen(channel: EditChannel | null): channel is EditChannel {
  return channel !== null && channel.ready()
}

/**
 * **결과를 모르는 편집이 뒤늦게 커밋되면 이 탭에 서는가** — `unknownNotice`의 `live`. 참인 판은 하나다: **편집을 실은 연결이
 * 사라졌고**(`UnansweredEditError` — `why`가 있다) **지금 새 연결이 열려 있다.** 그 커밋의 방송은 새 연결로 온다.
 *
 * **«연결이 열려 있다»만으로는 거짓이 된다.** 편집을 실은 연결이 **그대로** 열린 채 «모름»을 받았으면(5xx 프레임 — 서버가 COMMIT
 * 도중 DB 를 잃었다) 서버는 방송에서 보낸 연결을 빼고(`apps/api`의 `ws/broadcast.ts`), 끊기지 않았으니 재연결 재조회도 없다.
 * 수습의 다시 읽기가 커밋보다 먼저 읽었으면 그 편집은 영영 안 선다(Chrome — COMMIT 을 3s 로 늦추고 도중에 api↔DB 연결을 RST:
 * 12s 뒤 DB «고친 글» · 화면 «원문» · 소켓 열린 채). REST 의 «모름»(`why`가 없다)도 같은 쪽이다 — 커밋이 방송될지를 이 탭은
 * 모른다. 둘은 새로고침을 권한다.
 */
function lateCommitArrives(why: UnansweredCause | null, channel: EditChannel | null): boolean {
  return why !== null && realtimeOpen(channel)
}

/**
 * **보낸 편집의 결과를 모를 때의 문장** — 실패가 «그 요청은 커밋 전»을 확정하지 않는다(`api/failure.tsx`의
 * `refusedBeforeCommit` — 쓰기 장부의 «모름»과 같은 판정이다). 연결이 끊겼거나(오프라인 · 소켓 리셋), 이 탭이 연결을
 * 버렸거나(`UnansweredEditError`), 서버 앞단이 답 대신 5xx · 빈 본문을 줬다.
 *
 * **«취소됐다»도 «저장하지 못했다»도 거짓이다.** 편집은 서버에 닿았을 수 있다. 끊김의 문장(«편집을 저장하지 못했습니다 —
 * … 편집 1개가 취소됐습니다»)을 내면 서버는 그것을 커밋하고 화면에도 선다(Chrome — 행 잠금으로 편집을 서버에 붙잡은 채
 * 소켓을 RST 로 끊었다: WS 는 다시 붙은 연결의 다시 읽기로, REST 는 방송으로 화면에 고친 값). 사용자가 믿고 다시 하면
 * **두 번 선다.** 그래서 모른다고 말하고, 반영됐다면 화면이 저절로 맞춰지는지를 말한다 — 편집을 실은 연결이 사라졌고 문장을
 * 낼 때 새 연결이 열려 있으면 맞춰진다(방송 · 다시 붙은 연결의 다시 읽기 — `realtime/use-realtime.ts`의 «쿠키가 바뀌면»), 그 밖은
 * 새로고침을 권한다(아래 `settle` · `lateCommitArrives`). 되돌리기 이력이 비는 것은 그대로다 — 답(`inverse`)을 못 받았다.
 *
 * **«취소됐다»는 서버에 안 닿은 것에만 쓴다** — 답을 못 받은 편집은 하나다(in-flight는 한 번에 하나). **아직 안 보낸
 * 편집은 이 탭이 버렸다** — 그것은 따로 세어 취소됐다고 말한다.
 *
 * @param why 답을 못 받은 까닭 — 앞머리가 갈린다. `null`이면 REST 의 연결 실패 · 5xx 다(까닭을 단정하지 않는다).
 * @param outcome 다시 불러왔으면 `cancelled`(그러며 버린 **안 보낸** 편집 수), 다시 불러오지도 못했으면 `reason`(그 까닭).
 * @param sent 답을 못 받은 편집 수 — 한 수습에 하나지만 합친 통지는 여럿을 센다(`store/loss-notice.ts`).
 */
function unknownNotice(
  why: UnansweredCause | null,
  outcome: { cancelled: number; live: boolean } | { reason: string },
  sent = 1,
): string {
  const lead =
    why === 'renewed'
      ? '다른 탭에서 다시 로그인해 실시간 연결을 새로 붙이느라 '
      : why === 'lost'
        ? '실시간 연결이 끊겨 '
        : ''
  const head = `${lead}보낸 편집${sent > 1 ? ` ${sent}개` : ''}의 답을 받지 못했습니다 — 서버에 반영됐는지 알 수 없습니다.`
  if ('reason' in outcome) return `${head} ${outcome.reason} — 새로고침해 서버 상태를 확인하세요.`
  const tail = outcome.cancelled > 0 ? ` 아직 보내지 않은 편집 ${outcome.cancelled}개는 취소됐습니다.` : ''
  // **«곧 화면에 나타납니다»는 뒤늦은 커밋이 이 탭에 올 때만 참이다**(`lateCommitArrives`). 다시 읽기가 커밋 전의 판을
  // 읽었으면(서버가 그 편집을 쥔 채 끊겼다) 뒤늦은 커밋을 화면에 세우는 길은 방송 · 재연결 재조회 둘뿐인데 둘 다 WS 가 있어야
  // 한다(Chrome: WS 를 막은 탭에서 서버가 쥔 편집을 RST — 5s 뒤에도 화면 «원문» · DB «고친 글»). 사람이 «안 나타났으니
  // 안 됐다»로 읽고 다시 하면 두 번 선다.
  //
  // **«다시 붙는 중»을 셋째 꼬리로 가르지 않는다**(«다시 붙으면 나타납니다»). 연결은 끊기면 늘 다시 붙으려 하지만 붙는다는
  // 보장이 없다 — 멤버에서 빠진 사람의 소켓은 다시 안 붙는다(Chrome — 프록시 연결 0). 그 문장을 믿고 기다리는 사람은 영영
  // 기다린다. 새로고침 꼬리는 붙든 안 붙든 참이다(붙으면 저절로 맞춰지는 것은 대가다 — 문장이 보수적일 뿐 거짓은 아니다).
  const settle = outcome.live
    ? '페이지를 서버 상태로 다시 불러왔고, 반영됐다면 곧 화면에 나타납니다.'
    : // **까닭을 적지 않는다** — 이 꼬리는 연결이 닫힌 판과 편집을 실은 연결이 열린 채인 판이 함께 쓴다. «실시간 연결이 열려
      // 있지 않아»는 뒤쪽에서 거짓이다(Chrome — 열린 소켓으로 503 프레임을 받은 판).
      '페이지를 서버 상태로 다시 불러왔지만, 그 뒤에 반영되면 화면에 나타나지 않을 수 있습니다. 새로고침해 서버 상태를 확인하세요.'
  return `${head} ${settle}${tail}`
}

/**
 * **떠난 페이지에서 보낸 편집이 거절됐을 때의 문장**(전송 루프의 `abandonedOnLeave`). 서버가 커밋 전에 거절했으면(`refusedBeforeCommit`)
 * 저장되지 않은 것이고, 그 밖은 반영됐는지 모른다(`unknownNotice`와 같은 판정). 둘 다 그 페이지를 다시 열어 보라고 한다 — 이 화면은 그
 * 페이지를 안 들고 있다.
 *
 * **그 편집과 함께 버린 안 보낸 편집(`unsent`)을 합쳐 센다** — 떠나는 순간 그 수를 말했지만(`leftUnsentNotice`) 떠남의 조각은 하나라
 * (`EditorStore.setLeaveNotice`) 이 문장이 그 말을 대신한다. 보낸 편집은 늘 하나다(in-flight 는 하나). 그 답을 기다리는 동안 또 떠났으면 버린 것이 여러 페이지에 있다(`pages` —
 * `EditorStore.abandonedPages`) — 페이지 수를 싣는다. «그 페이지»라고 하면 사용자는 하나만 다시 연다.
 */
function leftBehindNotice(caught: unknown, unsent: number, pages: number, reopened: boolean): string {
  const failure = toFailure(caught, EDIT_UNKNOWN_FAILURE)
  const where = pages > 1 ? `떠난 페이지 ${pages}곳에서` : '떠난 페이지에서'
  const reopen = pages > 1 ? '그 페이지들을 다시 열어 확인하세요.' : '그 페이지를 다시 열어 확인하세요.'
  if (refusedBeforeCommit(caught) && failure.kind === 'message') {
    const lost = unsent > 0 ? `보낸 편집 1개와 보내지 않은 편집 ${unsent}개가` : '보낸 편집 1개가'
    // **이미 다시 열었으면 다시 열라고 하지 않는다**(`EditorStore.abandonedPagesReopened`) — 커밋 전에 거절됐으니 다시 연 판이 서버 상태다.
    return `${failure.message} — ${where} ${lost} 저장되지 않았습니다.${reopened ? '' : ` ${reopen}`}`
  }
  const also = unsent > 0 ? `없고, 보내지 않은 편집 ${unsent}개는 저장되지 않았습니다` : '없습니다'
  return `${where} 보낸 편집 1개는 답을 받지 못해 서버에 반영됐는지 알 수 ${also} — ${reopen}`
}

/**
 * **떠나며 버린 안 보낸 편집의 문장** — 페이지를 옮기는 순간 말한다(`routes/editor.tsx`의 `leavePage`). 앞 편집의 답을 기다리는 동안 쌓인
 * 편집은 서버에 한 번도 안 갔다. **보내고 떠나지 않는다** — 그 편집은 답을 기다리는 앞 편집의 결과 위에서 지어졌고(앞 편집이 거절되면 낼 수
 * 없다), 떠난 페이지는 이 탭이 프레임을 얹지 않아 남의 편집 위로 옮길 바탕이 없다. 떠난 뒤 그 페이지로 돌아오면 늦은 답과 다시 연 판을
 * 맞춰야 한다 — 열려 있지 않은 페이지에 편집을 내는 새 갈래다.
 */
export function leftUnsentNotice(unsent: number): string {
  return `떠난 페이지에서 아직 보내지 않은 편집 ${unsent}개는 저장되지 않았습니다 — 그 페이지를 다시 열어 확인하세요.`
}

/** `promise`가 풀리거나 `ms`가 지나면 풀린다 — 먼저 오는 쪽. 타이머는 남기지 않는다. */
function settledWithin(promise: Promise<void>, ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms)
    void promise.then(() => {
      clearTimeout(timer)
      resolve()
    })
  })
}

/**
 * **이 편집 실패는 결과를 모르는가** — 서버가 커밋 전에 거절했거나(`refusedBeforeCommit`) 프레임이 나가지 못했으면(`EditNotSentError`) 안다:
 * 안 됐다. 그 밖은 서버에 닿았을 수 있다. 수습의 문장(`recover`)과 거절 표시(`EditorStore.markRefused`)가 이 판정 하나를 쓴다.
 */
function unknownOutcome(caught: unknown): boolean {
  return !(caught instanceof EditNotSentError || refusedBeforeCommit(caught))
}

/** 결과를 모르는 판에서 다시 불러오지도 못했을 때, 서버가 이유를 주지 않으면 쓸 문장(`unknownNotice`의 `reason`). */
const UNANSWERED_RECOVER_FAILURE = '페이지를 다시 불러오지도 못했습니다'

/**
 * **수습이 말하는 잃음의 조각**(`EditorStore.tellLoss`) — 서버가 거절한 편집. 합치면 버린 수를 더하고 서버 문장은 뒤에 온 것이다(문장 전체는
 * 열쇠에 넣지 않는다 — 409 의 번호가 거절마다 달라 조각이 는다. 머리만 넣는다 — `refusalHead`).
 *
 * **뒤에 시작한 조회가 판을 먼저 정한 판에서도 «다시 불러왔고»를 말한다** — 이 수습은 싣지 않았지만 화면은 그 조회가 읽은 서버 판이다(그
 * 조회가 싣거나 · 같은 판이라 넘어갔다 — `EditorStore.settlePageLoad`). 그 조회는 잃은 것이 없으면 말하지 않으므로(재연결 재조회) 빼면 화면이
 * 되돌아간 까닭이 사라진다. 두 조회가 저마다 잃은 것은 조각을 이어 함께 말한다.
 *
 * **서버 문장과 우리 문장 사이에 구분자를 둔다.** 공백 하나로 붙이면 두 문장이 한
 * 문장처럼 읽힌다 — 카탈로그 위반의 이유가 **타입 이름으로 끝나기** 때문에
 * `알 수 없는 컴포넌트 타입: 없는타입 페이지를 …`가 되어 **"없는타입 페이지를"이
 * 하나의 명사구**가 된다.
 *
 * **`unknown-type` 하나의 문제가 아니다.** 이 경로가 실제로 받는 문장을 api 하네스로
 * 재 보니 **끝에 마침표를 두는 것이 하나도 없다:**
 *
 *   409 `페이지가 이미 변경되었습니다 (요청 baseSeq 99, 현재 0)`        ← 괄호로 끝난다
 *   409 `편집을 적용할 수 없습니다: 바꿀 값을 찾을 수 없습니다: /root/…`  ← **경로로 끝난다**
 *   422 `알 수 없는 컴포넌트 타입: 없는타입`                          ← 타입 이름으로 끝난다
 *   400 `잘못된 입력: 예상 타입은 array, 받은 타입은 undefined입니다`
 *
 * **위 넷은 서버에 실재하는 문장이다** — 지어낸 예로 논지를 세우지 않는다. 둘째 줄은
 * **경로로 끝나서** 우리 문장과 붙으면 더 읽기 어렵다. 즉 어떤 문장이 와도 붙는다 —
 * **이어 붙이는 형태 자체가 이 부류를 만든다.**
 *
 * **서버 문장에 마침표를 덧붙이지 않는 이유:** 그것은 서버가 쓴 문장을 고치는 것이고,
 * `api/failure.tsx`가 *"화면이 문안을 다시 쓰면 서버가 이유를 바꿔도 사용자는 옛
 * 이유를 듣는다"*로 세운 경계를 넘는다. 구분자는 **우리 쪽 문장에 붙이는 것**이라
 * 그 경계 안이다.
 */
function refusedLoss(caught: unknown, message: string, lost: number): LossPart {
  return {
    // **열쇠는 거절의 `code`와 문장의 머리다** — 까닭마다 한 조각이다. 열쇠가 하나면 서로 다른 두 거절이 합쳐져 뒤 까닭으로 읽힌다(jsdom: 409
    // `conflict` 뒤 `locked` → «밥님이 편집 중인 노드입니다 — … 편집 2개»). `code`만으로도 모자란다 — 서버가 `stale` · `patch-failed`를 둘 다
    // `conflict`로 낸다(`http/edit-outcome.ts` — 클라이언트의 대응이 같아서다). 문장 전체는 넣지 않는다 — `409`의 번호가 문장에만 있어 거절마다
    // 조각이 는다.
    key: `recover:${caught instanceof ApiError ? caught.code : 'other'}:${refusalHead(message)}`,
    rank: LOSS_RANK.cancelled,
    counts: [lost],
    render: ([count]) => `${message} — 페이지를 서버 상태로 다시 불러왔고, 편집 ${count ?? 0}개가 취소됐습니다.`,
  }
}

/**
 * **거절 문장의 머리** — 첫 `(` · `:` 앞. 서버 문장은 까닭을 앞에, 번호 · 경로 · 속 까닭을 그 뒤에 둔다(`http/edit-outcome.ts` ·
 * `@wirebound/schema`의 `migrateDocument`): `페이지가 이미 변경되었습니다 (요청 baseSeq 9, 현재 10)` · `편집을 적용할 수 없습니다: 바꿀 값을 찾을
 * 수 없습니다: /root/…` · `지원하지 않는 문서 버전: 3` · `문서에 NUL 문자(U+0000)를 …`. 머리에 번호가 드는 문장이 생기면 거절마다 조각이 는다 —
 * `test/edit/refusal-head.test.ts`가 서버 문장으로 잰다.
 */
export function refusalHead(message: string): string {
  return message.split(/[(:]/, 1)[0]!.trim()
}

/** **결과를 모르는 편집의 조각**(`unknownNotice`) — 답을 못 받은 편집 수와 함께 버린 안 보낸 편집 수를 센다. 열쇠는 문장의 갈래다. */
function unknownLoss(why: UnansweredCause | null, cancelled: number, live: boolean): LossPart {
  return {
    key: `recover-unknown:${why ?? 'rest'}:${String(live)}`,
    rank: LOSS_RANK.unknown,
    counts: [1, cancelled],
    render: ([sent, count]) => unknownNotice(why, { cancelled: count ?? 0, live }, sent ?? 1),
  }
}

/**
 * 되돌릴 수 없는 항목을 건너뛰었을 때의 안내(설계서 「개인 undo/redo」).
 *
 * **에러가 아니라 정상 흐름이다** — 다른 사람이 그 노드를 지웠으면 내 `inverse`가 적용되지
 * 않는 것이 당연하고, 그때 할 일은 멈추는 것이 아니라 다음 항목으로 넘어가는 것이다.
 * 자리는 편집 실패와 같은 `role="alert"` 하나를 쓴다 — 사용자가 누른 행동의 결과라는
 * 점이 같고, 자리를 나누면 그 하나뿐인 통지 규칙이 흩어진다.
 */
function skippedNotice(skipped: number, applied: boolean): string {
  const head = skippedHead(skipped)
  return applied ? `${head} 그 앞의 편집을 되돌렸습니다.` : `${head} 되돌릴 것이 더 없습니다.`
}

/** 건너뛴 것만 말하는 앞 문장 — 되짚기 이력을 받는 동안과 받지 못했을 때도 쓴다(`undo` · `loadUndoHistory`). */
function skippedHead(skipped: number): string {
  return `되돌릴 수 없는 편집 ${skipped}개를 건너뛰었습니다.`
}

/**
 * 남의 잠금에 막혀 되돌리지 못했을 때의 안내(설계서 「소프트 잠금」 · 「에러 처리」의 잠금 충돌 —
 * *"발생 시 안내 — 자동 재시도하지 않는다"*. 다시 누르는 것은 사람이다).
 *
 * **위 `skippedNotice`와 갈라 적는다.** 그쪽은 *"그 편집은 이제 없다"*이고 이쪽은
 * *"지금은 안 된다"*다 — 사용자가 다음에 할 일이 다르므로(포기 / 기다림) 문장도 다르다.
 * 뒷문장이 그 차이를 말하는 자리이고, 그것이 없으면 사용자는 이력이 사라진 줄 안다.
 *
 * **건너뛴 것이 함께 있으면 앞에 붙인다.** 둘은 서로 다른 항목에서 났고(건너뛴 것은
 * 버려졌다, 막힌 것은 남아 있다) 한쪽만 말하면 나머지가 조용히 사라진다.
 *
 * # 왜 상태줄이 아니라 여기인가
 *
 * 상태줄(`panels/toolbar-status.ts`)이 «왜 회색인가»를 말하는 자리이고 잠금이 그 사다리
 * 맨 위에 있다. **되돌리기는 그 사다리에 안 올린다** — 그 줄이 답하는
 * 물음이 *"지금 **고른 것**이 무엇이라서 그런가"*인데 되돌리기는 **선택과 무관**하고, 자리도
 * 구조 트리가 아니라 셸 헤더의 `편집 이력` 묶음이다(`routes/editor.tsx`의 `UndoTools`).
 * 그 줄에 얹으면 사다리가 자기 것이 아닌 물음에 답하게 되고, 구조 트리를 안 보고 있는
 * 사용자에게는 어차피 안 보인다.
 */
function lockedNotice(userName: string, skipped: number): string {
  const head = skipped > 0 ? `되돌릴 수 없는 편집 ${skipped}개를 건너뛰었습니다. 그 앞의 편집은 ` : ''
  return `${head}${userName}님이 편집 중이라 되돌릴 수 없습니다. 잠금이 풀리면 그대로 되돌릴 수 있습니다.`
}

/**
 * 새로고침으로 채운 되돌리기의 되짚기 이력을 누를 때 받는 횟수(`undo`). 한 조회는 `UNDO_HISTORY_PAGE`(200)개까지라 그보다 긴 구간은 받은
 * 것을 넘기고 다시 묻는다 — 그래도 남으면 받은 데까지로 되짚고 못 지은 항목은 누를 때 건너뛰고 그 수를 말한다.
 */
const UNDO_HISTORY_ROUNDS = 3

/** 되짚기 이력 조회가 이유 없이 실패했을 때(네트워크 등). */
const UNDO_HISTORY_FAILURE = '되돌리기 이력을 불러오지 못했습니다'
/** 되짚기 이력을 못 받았을 때 덧붙인다 — 되돌리지 않았고 항목은 그대로 남아 다시 누르면 다시 받는다. */
const UNDO_HISTORY_NOTICE = '되돌리지 않았습니다. 다시 누르면 다시 불러옵니다.'

/**
 * 서버의 `id`가 스택의 `revisionId`다. 두 이름을 맞추는 자리를 여기 하나로 둔다 — 스토어가 `RevisionInverse`를 알면 `apps/web`의 HTTP
 * 경계가 스토어까지 새어 든다. 목록(`routes/editor.tsx`의 `restoreUndo`)과 되짚기 조회(`undo`)가 함께 쓴다.
 */
export function restoredRevisions(revisions: readonly RevisionInverse[]): RestoredRevision[] {
  return revisions.map((revision) => ({ revisionId: revision.id, seq: revision.seq, inverse: revision.inverse }))
}

/** `commitOps`의 선택 인자. */
export interface CommitOptions {
  /**
   * **누른 때의 통지** — 누른 뒤 답을 기다렸다가 내는 편집(페이지 목록을 읽은 뒤의 붙이기 — `shell/editor-keys.tsx`)이 준다. 기다리는 동안
   * 잃음 조각이 섰으면(`EditorStore.tellLoss` — 수습 · 판을 다시 싣는 읽기) 그 편집이 치우지 않는다. 주지 않으면 앞 통지를 늘 치운다.
   */
  pressed?: EditFailure | null
}

export interface EditCommit {
  /** 노드의 prop 하나를 바꾼다. 적용할 수 없으면 아무 일도 일어나지 않는다. */
  commitProp: (nodeId: string, prop: string, value: unknown) => void
  /**
   * 노드의 `variant`를 바꾼다. **`commitProp`과 갈라 두는 것이 요점이다** — `variant`는
   * props의 키가 아니라 봉투의 필드라 patch 경로가 한 단계 위다(`edit/ops.ts`의 `variantOps`).
   * `null`이면 지운다(기본 표현으로 되돌리기).
   */
  commitVariant: (nodeId: string, variant: string | null) => void
  /**
   * 노드의 `interactions`를 통째로 갈아 끼운다(설계서 「상호작용」의 「모델」). **`commitVariant`와 같은 층이다** —
   * `interactions`도 props의 키가 아니라 봉투의 필드라 patch 경로가 한 단계 위다.
   * 빈 배열이면 키를 지운다(`edit/ops.ts`의 `interactionsOps`).
   *
   * **새 계약이 아니다.** 상호작용은 **클라이언트가** 문서를 바꾸므로 코멘트의
   * `markerOps` 같은 서버 왕복이 필요 없고, 이미 있는 낙관적 편집 경로를 그대로 탄다.
   */
  commitInteractions: (nodeId: string, interactions: readonly Interaction[]) => void
  /**
   * 이미 만들어진 `ops`를 낸다. **낸 편집이 큐에 들어갔으면 `true`다.**
   *
   * `ops`가 `null`인 것은 `edit/ops.ts`의 생성기들이 "요청을 만들지 마라"를 말하는
   * 방식이고, 그대로 넘길 수 있게 받아 준다 — 부르는 쪽마다 `null` 검사를 두면
   * 그중 하나가 빠지는 날 잘못된 요청이 나간다.
   *
   * **반환값이 있는 것은 구조 편집 때문이다.** 삭제는 편집이 큐에 들어간 뒤에만 선택을
   * 옮긴다.
   *
   * **"실패했는데 옮기면 노드는 그대로인데 선택만 부모로 간다"는 인과는 거짓이다.**
   * 툴바 쪽 주석과 같은 사실을 말하므로 한쪽만 고치면 둘이 갈린다. 잰 값 둘:
   *
   * - **서버 실패는 이 반환값과 무관하다.** `commitOps`는 큐에 넣고 `true`를 내며 409는
   *   그 뒤에 온다. **그리고 그때 선택은 툴바가 옮겨 둔 부모 그대로다** — `loadPage`가
   *   **같은 페이지를 다시 싣는 경로에서는 선택을 건드리지 않으므로** 두 경로가 갈리지 않는다
   *   (`store/editor-store.ts`의 `#selectionFor`).
   * - **로컬 실패 경로는 호출자의 앞선 가드가 먼저 잡는다.** 그래서 이 반환값 검사는
   *   지워도 죽는 케이스가 없다(`panels/structure-toolbar.tsx`의 `removeSelected`·`addNode` 주석에
   *   무엇이 덮는지 적어 두었다).
   */
  commitOps: (ops: PatchOp[] | null, options?: CommitOptions) => boolean
  /** 한 단계 되돌린다. **서버에는 새 편집으로 나간다** — 서버에 undo 개념은 없다(README). */
  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean
  status: EditStatus
}

export function useEditCommit(props: { projectId: string; pageId: string }): EditCommit {
  const { projectId, pageId } = props
  const api = useApi()
  const channel = useEditChannel()
  const lockChannel = useLockChannel()
  const store = useEditorStoreInstance()
  const open = useOpenPage(pageId)
  const status = useEditorStore(store, (s) => s.editStatus)
  // 되짚기 이력을 받는 동안은 둘 다 꺼진다(`undo`의 `loadUndoHistory`) — 누른 것은 받은 뒤 한 번 되돌린다. **다시 실행도 끄는 까닭**: 받는
  // 동안 다시 실행이 맨 위에 세션 편집을 올리면 받은 뒤 그 되돌리기를 말없이 버린다(맨 위 비교). 받는 창은 조회 한 번이고 다시 실행 스택은
  // 그대로라, 받은 뒤 누르면 된다 — 막히는 것은 그 창 안의 누름뿐이다.
  const canUndo = useEditorStore(store, (s) => s.undoStack.length > 0 && !s.undoHistoryLoading)
  const canRedo = useEditorStore(store, (s) => s.redoStack.length > 0 && !s.undoHistoryLoading)

  /**
   * 실패 하나를 수습한다. **실패 종류로 갈리지 않는다** — 409든 422든 네트워크든
   * 페이지를 다시 받아 서버 상태로 수렴한다. 왜 항목별 롤백이 아닌지는 설계서 「정방향 흐름」에 있다:
   * `inverse`를 서버가 만드는 것과 같은 이유로, 클라이언트가 계산한 되돌리기는 낙관적으로
   * 앞서 있는 만큼 틀릴 수 있다.
   *
   * **세션이 끊긴 실패 하나만 갈린다.** 다시 받아도 401이고 그 사이 요청만 쌓이므로
   * 재조회하지 않는다. 통지 자리(`shell/edit-alert.tsx`)가 그 값을 보고 `<SignedOut />`을
   * 그리면 세션 무효화 경로로 이어진다.
   *
   * **문장만 갈리는 실패가 하나 있다 — 결과를 모르는 편집**(`unknownNotice`). 수습은 같고(다시 불러와
   * 서버 상태로) 그 편집을 «취소됐다»고 말하지 않는다 — 서버에 닿았을 수 있다.
   *
   * @param pageId 실패한 편집이 나간 페이지 — 이 훅의 `pageId`가 아니다(`pump`의 «큐의 주인»).
   * @param projectId 그 페이지의 프로젝트 — 같은 까닭으로 이 훅의 `projectId`가 아니다.
   */
  const recover = useCallback(
    async (caught: unknown, pageId: string, projectId: string): Promise<void> => {
      const failure = toFailure(caught, EDIT_UNKNOWN_FAILURE)
      if (failure.kind === 'signed-out') {
        // 큐는 비운다 — 로그인하고 돌아와도 그 편집들은 이미 낡은 `baseSeq` 위에 있다.
        store.failEdits()
        store.setEditStatus('idle')
        store.setEditFailure(failure)
        return
      }
      // **그 편집이 나간 큐가 지금 큐가 아니면 아무것도 쓰지 않는다**(`EditorStore.sentFromOpenQueue`) — 이 아래의 첫 쓰기
      // (`failEdits`)가 **지금 큐**를 비운다. 판을 싣거나 비운 뒤의 큐는 다른 판 위의 것이라 이 실패와 무관하고, 판째 버린 편집은
      // 전송 루프가 이미 거른다(`wasAbandoned`). 여기 닿는 것은 리베이스가 먼저 버려 큐에 없던 편집이다 — 그 409 가 페이지를 옮긴
      // 뒤 오면 새 페이지의 큐를 말없이 비웠다(Chrome: 1쪽 편집이 행 잠금에 선 사이 밥의 삭제로 리베이스에서 버려지고, 2쪽에서 친
      // 글은 화면에만 남아 한 번도 안 나갔다). 통지 · 상태 · 세대도 쓰지 않는다 — 그 실패의 판은 이 화면에 없다. 전송 루프는 이어
      // 지금 큐를 보낸다.
      if (!store.sentFromOpenQueue()) return

      // **결과를 모르는가**(`unknownOutcome`) — 수습은 같고(다시 불러와 서버 상태로) 말만 다르다(`unknownNotice`).
      const unknown = unknownOutcome(caught)
      const why = caught instanceof UnansweredEditError ? caught.why : null
      const dropped = store.failEdits()
      /**
       * **이 페이지를 떠나면 요청째 끊는다**(`ReadOptions.cancel`). «떠남»은 **스토어가 이 페이지를 더는
       * 열고 있지 않은 것**이다(`openPageId`) — 이 훅을 부른 본문(속성 패널 …)은 탭마다 내려가지만 수습은 스토어의 일이라 본문의
       * 수명에 매지 않는다. 끊지도 거르지도 않으면, 이 조회(1MB 일 수 있다)가 도는 동안 옆 페이지로 가도 끝까지 내려받고
       * **늦게 온 답이 `loadPage`로 스토어를 앞 페이지로 되돌린다**(jsdom — `test/edit/edit-recovery-leave.test.tsx`). 셸째 내려가면
       * 스토어도 버려지므로 끊는 신호가 없다 — 그 조회는 끝까지 돈다(남는 틈).
       */
      const leave = new AbortController()
      const stillOpen = (): boolean => isPageOpen(store, pageId)
      const stop = store.subscribe(() => {
        if (!stillOpen()) leave.abort()
      })
      // 판을 싣는 입구다 — 세대를 받는다(`EditorStore.beginPageLoad`의 표).
      const ticket = store.beginPageLoad(pageId)
      try {
        const page = await api.getPage(projectId, pageId, { cancel: leave.signal })
        // **떠났으면 싣지 않는다** — 끊기 전에 답이 와 있었을 수 있다. 버린 편집의 통지도 이제 이 화면의 말이 아니다.
        if (!stillOpen()) return
        // **`loadPage`가 그 사이 들어온 편집까지 버리고 그것을 돌려준다.** 재조회는 왕복
        // 하나라 그 동안 새 편집이 큐에 쌓일 수 있고, 비우지 않으면 "취소됐다"고 알린 편집이
        // 나중에 새 `baseSeq` 위에서 서버로 나간다(`store/editor-store.ts`에 실측이 있다).
        //
        // **더 나중에 시작한 조회가 판을 이미 정했으면 싣지 않는다** — 그 판이 이 답보다 새것이고, 그 사이 들어온 편집도 그
        // 판이 버리며 말했다. 이 실패의 통지는 그대로 한다(버린 것은 `failEdits`가 센 것뿐이다).
        const alsoDropped = store.settlePageLoad(ticket) ? store.loadPage(pageId, page.schema, page.headSeq, ticket) : []
        // 버린 수는 **센 값이다** — 전송에 실패한 것, 큐에 남아 있던 것, 재조회를 기다리는
        // 동안 들어온 것을 합친 것이고, 셋 다 문서가 서버 것으로 되돌아가며 사라졌다.
        const lost = dropped.length + alsoDropped.length
        // **앞 잃음을 덮지 않고 잇는다**(`EditorStore.tellLoss`) — 이 답을 기다리는 동안 다른 쪽이 말한 잃음(판을 먼저 실은 조회 · 리베이스
        // 버림)이 서 있을 수 있다.
        if (unknown) {
          // 버린 것 중 하나(큐의 머리)가 답을 못 받은 그 편집이다 — 나머지는 안 보냈다.
          store.tellLoss(unknownLoss(why, lost - 1, lateCommitArrives(why, channel)))
          return
        }
        store.tellLoss(refusedLoss(caught, failure.message, lost))
      } catch (recoverCaught) {
        // **떠났으면 말하지도 비우지도 않는다** — 끊긴 조회의 거절이거나 떠난 뒤의 실패다. 아래 `failEdits`는 **지금 열린 페이지의**
        // 큐를 비운다 — 떠난 페이지의 수습이 옆 페이지의 편집을 버리면 안 된다.
        if (!stillOpen()) return
        // **더 나중에 시작한 조회가 판을 이미 정했으면 그 판이 서버 것이다** — 문서는 되돌아갔고 그 뒤에 낸 편집은 그 판 위의
        // 것이라 버리지 않는다. 실패의 통지만 한다(판은 다시 실렸다).
        if (store.pageLoadSuperseded(ticket)) {
          store.tellLoss(
            unknown
              ? unknownLoss(why, dropped.length - 1, lateCommitArrives(why, channel))
              : refusedLoss(caught, failure.message, dropped.length),
          )
          return
        }
        // **재조회를 기다리는 동안 들어온 편집은 여기서도 버린다.** 서버 상태를 모르는 채
        // 그것을 보내면 낡은 `baseSeq` 위에서 기록된다(실측: 이 줄이 없으면 그 편집이
        // `baseSeq 7`로 나간다 — 재조회가 성공한 판의 42와 달리 서버가 다시 409를 낼 값이다).
        store.failEdits()
        // **여기서 다시 재조회하지 않는다.** 서버가 계속 실패하는 동안 요청이 쌓인다 —
        // 세션 확인에 자동 재시도를 두지 않은 것과 같은 판단이다.
        const recoverFailure = toFailure(
          recoverCaught,
          unknown ? UNANSWERED_RECOVER_FAILURE : RECOVER_UNKNOWN_FAILURE,
        )
        if (recoverFailure.kind === 'signed-out') {
          // 세션이 끊긴 것은 여기서 말하지 않는다 — `EditAlert`이 `<SignedOut />`으로
          // 화면을 갈아 끼우므로 남아 있는 화면 자체가 없다.
          store.setEditFailure(recoverFailure)
        } else if (unknown) {
          // **«저장되지 않았습니다»가 여기서도 거짓이다** — 결과를 모르는 편집은 서버에 닿았을 수 있다.
          const reason = recoverFailure.message
          store.tellLoss({
            key: `recover-unknown-failed:${why ?? 'rest'}`,
            rank: LOSS_RANK.unknown,
            counts: [1],
            render: ([sent]) => unknownNotice(why, { reason }, sent ?? 1),
          })
        } else {
          // **성공 갈래와 같은 형식으로 우리 문장을 덧붙인다**(구분자 `—`도 같다 — `refusedLoss`의 실측).
          // **판을 다시 실으면 이 문장은 거짓이다**(`untilLoad`) — «화면에 남아 있는 편집»을 그 판이 치운다.
          const message = `${recoverFailure.message} — ${UNRECOVERED_NOTICE}`
          store.tellLoss({ key: 'recover-failed', rank: LOSS_RANK.cancelled, counts: [], render: () => message, untilLoad: true })
        }
      } finally {
        stop()
        store.setEditStatus('idle')
      }
    },
    [api, channel, store],
  )

  const pump = useCallback(async (): Promise<void> => {
    // **가드는 스토어가 든다.** 훅의 `ref`에 두면 `useEditCommit`을 부르는 자리가 둘일 때
    // (속성 패널과 undo/redo 버튼) 각자 자기 것을 갖는다 — 실측: 그 트리에서 편집을 각각
    // 내면 `maxInFlight`가 2가 되어 «in-flight는 항상 하나»가 깨진다.
    if (!store.beginPump()) return
    /**
     * **이 거절을 수습하지 않고 넘기는가** — 판째 버렸거나(떠나며 버렸으면 말한다) 리베이스가 버렸다. 번호 쓰기를 기다린 **뒤에도** 부른다 —
     * 기다리는 동안 페이지를 떠나거나(판째 버림) 남의 프레임이 이 편집을 버리면(리베이스) 기다림 앞의 판정이 낡는다(Chrome: 기다리는 사이
     * 떠나면 수습이 판을 비운 뒤라 물러나 편집을 말없이 잃었다 · jsdom: 리베이스가 버린 편집을 수습해 그 뒤 편집을 버렸다).
     */
    const passedOver = (clientOpId: string, caught: unknown): boolean => {
      // **세션이 끊긴 것만 수습으로 보낸다** — 그 통지(`<SignedOut />`)는 어느 편집의 실패든 같다.
      if (toFailure(caught, EDIT_UNKNOWN_FAILURE).kind === 'signed-out') return false
      // **판째 버린 편집의 거절은 수습하지 않고 다음 편집으로 간다**(`EditorStore.wasAbandoned`). 판을 다시 실으며 버렸으면 그
      // 편집을 «반영됐는지 모름»으로 이미 말했고(`routes/editor.tsx`의 `resyncNotice`) 실린 판에 그 편집이 없다 — 거절은 그
      // 판이 맞다는 뜻이라 되돌릴 것이 없다. 페이지를 옮기며 버렸으면 이 실패는 지금 페이지의 일이 아니다. 수습하면 그 뒤에 낸
      // 편집을 버리고(`failEdits`) 판을 한 번 더 읽고, 통지에 «편집 0개가 취소됐습니다»를 더한다(jsdom) — 페이지를
      // 옮겼으면 새 페이지의 편집을 버린다.
      if (store.wasAbandoned(clientOpId)) {
        // **페이지를 떠나며 버렸으면 그 거절은 말한다**(`EditorStore.abandonedOnLeave`) — 떠나기 전 화면에는 그 편집이 서 있었고, 떠날
        // 때는 아무 말도 안 했다. 수습(다시 읽기 · 큐 비우기)은 여전히 안 한다 — 그 판은 이 화면에 없다.
        // 판을 비우는 자리가 지우지 않는 통지로 세운다(`EditorStore.setLeaveNotice`) — 그 뒤에 또 옮겨도 남는다.
        if (store.abandonedOnLeave(clientOpId)) {
          const pages = store.abandonedPages()
          // 다시 연 뒤의 커밋 전 거절이면 가리킬 페이지가 없다 — 통지는 닫는 단추 · 새 편집으로 풀린다.
          const settled = store.abandonedPagesReopened() && refusedBeforeCommit(caught)
          store.setLeaveNotice(
            leftBehindNotice(caught, store.abandonedUnsent(), pages.length, settled),
            settled ? [] : pages,
            refusedBeforeCommit(caught) ? LOSS_RANK.cancelled : LOSS_RANK.unknown,
          )
        }
        return true
      }
      // **리베이스가 이 나간 편집을 버렸으면 그 거절은 수습하지 않는다**(`EditorStore.wasRebaseDropped`) — 버린 것은 이미 말했고
      // 바탕 · 큐는 남의 판 위에 맞다. 수습하면 그 뒤에 낸 편집을 버리고 통지에 «편집 0개가 취소됐습니다»를 더한다.
      return store.wasRebaseDropped(clientOpId)
    }
    try {
      for (;;) {
        // **`baseSeq`는 스토어가 전송 시점에 붙인다.** 훅으로 읽은 `headSeq`는 앞 편집이
        // ack되며 이미 낡아 있다 — ack의 `setState`는 이 루프가 도는 microtask 뒤에야
        // 커밋되기 때문이다.
        const request = store.nextRequest()
        /**
         * **큐의 주인은 스토어가 연 페이지다 — 이 훅의 `pageId`가 아니다.** 큐는 페이지를 옮길 때 비워지므로(`clearPage` · 다른
         * 페이지의 `loadPage`) 그 안의 편집은 늘 `openPageId`의 것이다. 이 루프는 앞 편집의 답을 기다리는 동안 페이지가 바뀌어도
         * 이어서 돈다 — 답이 온 편집은 큐에 없어 버려지고(`ackEdit`) 다음 머리는 **새 페이지의 편집**이다. 훅의 `pageId`로 보내면
         * 그것이 앞 페이지 경로로 나가, 번호가 맞으면 서버가 **앞 페이지에 받는다**(Chrome: 1쪽 편집을 행 잠금에 줄 세운 채 2쪽으로
         * 옮겨 친 글이 1쪽에 저장 · 2쪽 그대로 · 화면은 2쪽에 그 글 · 통지 0).
         */
        const target = store.queuePageId()
        // 프로젝트도 큐의 주인 것이다(`EditorStore.queueProjectId`) — 셸 없이 스토어를 쓰는 자리는 이 훅의 값이다.
        const project = store.queueProjectId() ?? projectId
        if (request === null || target === null) {
          if (store.getState().editStatus === 'sending') store.setEditStatus('idle')
          return
        }

        store.setEditStatus('sending')
        // 이 편집은 이제 서버에 닿을 수 있다 — 판을 다시 실으며 버리면 «모름»이다(`EditorStore.wasSent`).
        store.markSent(request.clientOpId)
        // **설계서 「소프트 잠금」의 *"편집 중 하트비트로 갱신"*.** 타이머를 두지 않고 **편집이 나가는 순간**에
        // 매다는 것이 판정이다: 그 절이 갱신의 조건으로 적은 것이 *"편집 중"*이고, 타이머를
        // 두면 케이스가 시간을 기다리게 된다. 잡은 것이 없으면 아무것도 안 나간다.
        //
        // **여기가 전송의 유일한 통로다** — 속성·구조·undo·redo가 전부 이 루프를 지난다.
        // `commitOps`에 달면 undo/redo가 빠진다.
        lockChannel?.refresh()
        try {
          // **WS가 붙어 있으면 그리로 낸다**(설계서 「정방향 흐름」). 없으면 REST다: 그 경로는
          // 남아 있어야 하고(설계서 「LLM 편집 경로」의 MCP가 REST로 들어온다), `RealtimeProvider` 없이 도는 화면은
          // 여전히 그쪽으로 편집한다.
          //
          // **갈리는 것은 전송뿐이다.** 두 경로가 같은 `applyEdit`을 지나고(`ws/patch.ts`),
          // 같은 모양의 실패를 내며(`patch-error`가 REST 봉투를 그대로 싣는다), 여기 아래의
          // `ackEdit`·`recover`도 같은 것을 받는다.
          const result =
            realtimeOpen(channel)
              ? await channel.send({ pageId: target, ...request })
              : await api.patchOps(project, target, request)
          // **응답의 `warnings`가 여기로 함께 들어간다.** 서버는 응답에 그것을 싣는다 —
          // 여기서 넘기지 않으면 **읽는 코드가 0건**이 되어 경고가 아무 데도 안 남는다.
          // 스토어가 ack와 **함께** 싣는 것이 요점이다 — 늦게 도착한
          // 응답의 경고가 지금 문서의 것으로 실리지 않는다(`ackEdit`의 가드 뒤에 있다).
          store.ackEdit(request.clientOpId, result)
        } catch (caught) {
          // **이 보내기가 커밋되지 않은 것이 확정된 실패면 적는다**(`EditorStore.markRefused`) — 이 편집은 아래 기다림 · 수습 동안 큐에 남거나
          // 버려진다. 버려지면 로그아웃이 그것을 «모름»이 아니라 «저장되지 않았다»로 센다(`discardTally`). 큐에 남은 동안은 다시 나갈 수 있어 «모름»이다.
          if (!unknownOutcome(caught)) store.markRefused(request.clientOpId)
          if (passedOver(request.clientOpId, caught)) continue
          // **리베이스가 그 사이에 이 편집을 옮겨 놓았으면 다시 낸다.**
          //
          // **이것이 없으면 리베이스가 서버에 닿지 않는다(실측).** 서버는 `baseSeq`가
          // `head_seq`와 정확히 같을 때만 받으므로, 내 편집이 떠 있는 동안 남의 편집이
          // 기록되면 내 것은 **반드시** 409를 받는다. 그 409를 곧바로 `recover`에 넘기면
          // 재조회가 큐를 통째로 비우므로, 방금 리베이스한 편집도 함께 사라진다. 즉
          // **리베이스의 결과가 한 왕복 뒤에 지워진다.**
          //
          // 다시 내는 조건은 둘이다 — 큐의 머리가 **여전히 이 편집**이고(리베이스가 그것을
          // 버리지 않았다), 그 사이 `headSeq`가 **움직였다**(다른 revision이 기록됐다).
          // 조건이 `headSeq`의 이동이므로 **끝난다:** 서버가 새 revision을 만들어야만 한 번
          // 더 시도하고, 아니면 그대로 `recover`로 간다.
          //
          // **이 갈래는 프레임이 실패보다 먼저 올 때만 돈다 — 재 보면 거의 늘 그 순서다.**
          //
          // | 순서 | 언제 | 무엇이 도나 |
          // |---|---|---|
          // | 프레임 먼저 | 잰 판 전부 — 두 편집을 동시에 내도 | 여기 |
          // | 실패 먼저 | 진 쪽의 요청이 이긴 쪽의 커밋 **뒤** · 방송 **전**에 닿을 때(잰 판에서는 안 났다) | 아래 `recover` |
          //
          // [api 값] 두 WS 연결이 같은 `baseSeq`로 같은 prop 을 바꾸는 `patch`를 간격 0 · 1 · 2 · 5 · 10 · 15 · 20 · 30 ·
          // 50ms 로 30 판씩 보내면, 진 쪽이 이긴 쪽의 `page-changed`를 제 `patch-error`보다 먼저 받았다 — 270/270(별도
          // 프로세스의 서버와 클라이언트로도, 같은 프로세스 하네스 `withRealApi`로도 같다). 동시에 내면 진 쪽은 이긴 쪽이 쥔
          // 페이지 행에서 기다렸다가 그 커밋 뒤에 낡음을 본다(파이프라인 3단계 — 1단계의 잠금 뒤다). 방송은 그 커밋 직후에
          // 나간다. 실패가 먼저 오려면 진 쪽의 요청이 방송이 룸 연결마다 조회를 `await`하는 틈에 닿아야 해서 좁다 —
          // 거기로 가도 **덜 좋아질 뿐 틀리지 않는다**(아래 `recover`의 재조회). 다시 재는 법: 위 간격대로 두 연결의
          // `patch`를 보내고 진 쪽의 수신 순서를 센다. `test/edit/ws-transport.test.tsx`가 두 순서를 가짜 서버로 나란히 잰다.
          //
          // **409로 좁히는 것은 판정이다.** *"문서가 내 밑에서 움직였다"*는 부류가 그것뿐이고
          // (`http/edit-outcome.ts`의 표), 401·422까지 다시 내면 고쳐지지 않는 실패에 왕복을
          // 하나 더 쓴다.
          let head = store.nextRequest()
          // **번호 쓰기의 답을 기다리는 중이면 그 답까지 기다린 뒤 다시 본다**(`EditorStore.beginMarkerWrite`) — 번호 revision 에 밀린
          // 409 인데 번호가 아직 안 왔다(번호는 REST 응답으로만 온다 · 이 409 와 다른 연결이다). 답이 번호를 얹으면 리베이스가 이 편집을
          // 그 뒤로 옮겨 아래 갈래가 다시 낸다. 한도(`MARKER_FRAME_WAIT_MS`)가 지나면 그대로 본다.
          if (
            caught instanceof ApiError &&
            caught.status === 409 &&
            head !== null &&
            head.clientOpId === request.clientOpId &&
            head.baseSeq === request.baseSeq &&
            store.markerWritePending()
          ) {
            await settledWithin(store.markerWritesSettled(), MARKER_FRAME_WAIT_MS)
            if (passedOver(request.clientOpId, caught)) continue
            head = store.nextRequest()
          }
          if (
            caught instanceof ApiError &&
            caught.status === 409 &&
            head !== null &&
            head.clientOpId === request.clientOpId &&
            head.baseSeq !== request.baseSeq
          ) {
            continue
          }
          // `recover`가 큐를 비우므로 남은 편집이 다시 나가지 않고, 재조회가 문서를 서버 것으로 맞춘다(그 편집이 지금 큐에서 나갔을 때).
          await recover(caught, target, project)
          // **수습 뒤에도 큐가 남으면 잇는다** — 더 나중에 시작한 조회가 판을 먼저 정해 수습이 싣지 않았고 그 판 위에서 편집을 더
          // 냈거나(`recover`의 세대 갈래), 수습 중에 페이지를 옮겨 새 페이지에서 편집했거나, 그 실패가 지금 큐의 일이 아니라 수습이
          // 큐를 건드리지 않았다(`recover`의 첫 가드). 그 편집은 이 루프만 보낸다 — 여기서 끝내면
          // 다음 편집이 펌프를 깨울 때까지 큐에 선다. 보내는 곳은 위의 «큐의 주인»이다.
        }
      }
    } finally {
      store.endPump()
    }
  }, [api, channel, lockChannel, projectId, store, recover])

  /**
   * 스택에서 한 단계 꺼내 보낸다. undo와 redo가 같은 규칙을 쓰므로 한 곳에 둔다 —
   * 다른 것은 어느 스택을 보느냐뿐이고, 그 판단은 스토어 안에 있다.
   *
   * **남의 잠금도 그 판단 안이다**(「소프트 잠금」의 1차 방어). 여기서 `locks`를 뒤지지 않고 스토어가
   * 낸 `blocked`를 받는 것이 요점이다 — 화면이 잠금 목록을 손에 쥐는 자리는 하나여야 하고
   * (`test/lock/one-verdict.test.ts`), 되돌리기 버튼을 **비활성으로 만들지 않은 것도** 그
   * 규칙 때문이다: 비활성이 되려면 셸 헤더가 잠금 목록을 구독해 다시 그려야 한다.
   * 대신 **누르면 이 자리가 이유를 말한다** — undo가 이미 쓰는 통로이고(위 `skippedNotice`),
   * 「개인 undo/redo」가 *"적용 불가는 에러가 아니라 정상 흐름"*으로 정한 자리와 같다.
   */
  /**
   * **누른 뒤 답을 기다렸다가 세우는 통지**(되짚기 이력 — `loadUndoHistory`). 기다리는 동안 잃음 조각이 섰으면(리베이스 버림 · 수습 · 떠남의
   * 거절 — `EditorStore.tellLoss`) 치우지도 덮지도 않는다 — 누른 때의 통지가 아니라 그 뒤에 온 잃음이다. 제 문장은 가장 약한 조각으로 그 뒤에
   * 잇는다(jsdom: 이력을 받는 동안 선 «편집 1개를 버렸습니다»를 받은 뒤의 `setEditFailure(null)`이 지웠고, 조회 실패의 문장이 덮었다). 누른
   * 뒤 선 것이 없으면 누른 때와 같다 — 앞 통지를 치우거나 갈아 끼운다. 세션이 끊긴 통지는 늘 세운다.
   */
  const lossArrivedSince = useCallback(
    (pressed: EditFailure | null): boolean => store.getState().editFailure !== pressed && store.showsLoss(),
    [store],
  )
  const sayAfterWait = useCallback(
    (pressed: EditFailure | null, failure: EditFailure | null): void => {
      if (!lossArrivedSince(pressed) || failure?.kind === 'signed-out') {
        store.setEditFailure(failure)
        return
      }
      if (failure === null) return
      const { message } = failure
      store.tellLoss({ key: 'undo-after-wait', rank: LOSS_RANK.history, counts: [], render: () => message })
    },
    [store, lossArrivedSince],
  )

  const settle = useCallback(
    (attempt: UndoAttempt, carried: number, pressed?: EditFailure | null): void => {
      // 되짚기 이력을 기다린 뒤면(`pressed` — 누른 때의 통지) 그 사이 선 잃음을 지키며 말한다(`sayAfterWait`).
      const say = (failure: EditFailure | null): void => (pressed === undefined ? store.setEditFailure(failure) : sayAfterWait(pressed, failure))
      // 앞서 같은 누름이 건너뛴 것(`carried` — 되짚기 이력을 받기 전에 버린 세션 항목)도 함께 센다.
      const skipped = carried + attempt.skipped
      // **잠금이 먼저다.** 건너뛴 것이 함께 있어도 사용자가 지금 답을 기다리는 물음은
      // *"왜 안 되돌아갔나"*이고, 그 답은 잠금이다. 건너뛴 수는 문장 안에 함께 실린다.
      if (attempt.blocked !== null) {
        say({
          kind: 'message',
          message: lockedNotice(attempt.blocked.userName, skipped),
        })
        // **큐에 들어간 것이 없으므로 펌프도 밟지 않는다** — 스토어가 낙관적 적용조차
        // 안 했다(`#startFrom`이 그 앞에서 멈춘다).
        return
      }
      if (skipped > 0) {
        say({
          kind: 'message',
          message: skippedNotice(skipped, attempt.clientOpId !== null),
        })
      } else {
        // 앞 통지를 치운다 — 남겨 두면 방금 누른 undo도 실패한 것으로 읽힌다.
        say(null)
      }

      if (attempt.clientOpId === null) return
      void pump()
    },
    [store, pump, sayAfterWait],
  )

  const step = useCallback(
    (start: () => UndoAttempt): void => {
      // 지금 열린 페이지가 아니면 아무것도 하지 않는다(`commitProp`과 같은 대조).
      if (open === null) return
      settle(start(), 0)
    },
    [open, settle],
  )

  /**
   * **새로고침으로 채운 항목의 되짚기 이력을 받고 되돌린다**(`EditorStore.undoHistoryNeed`) — 페이지를 열 때 받지 않고 처음 누를 때 받는다
   * (`routes/editor.tsx`의 `restoreUndo`). 받는 동안 단추가 꺼지고(`undoHistoryLoading`), 그 사이 누른 것은 버린다.
   *
   * - **판이 갈리면(떠남 · 다시 실림) 조회를 끊고 아무것도 안 한다** — 첫 쓰기(`supplyUndoHistory`) 앞에서 판으로 가른다. 스택은 그 판이 이미 비웠다.
   * - **받는 동안 맨 위가 바뀌면 되돌리지 않는다** — 세션 편집의 ack 가 위에 올랐으면 누른 때 되돌리려던 것이 아니다. 받은 이력은 남으므로 다시
   *   누르면 바로 되돌린다. 다시 실행은 받는 동안 꺼져 맨 위를 바꾸지 않는다(`canRedo`).
   * - **조회가 실패하면 되돌리지 않고 그렇다고 말한다** — 항목은 그대로 두고 다시 누르면 다시 받는다. 받은 데까지로 되짚으면 못 지은 항목이
   *   건너뛰어져 스택에서 사라진다 — 한 번의 끊김으로 이력을 잃는다. 세션이 끊겼으면 그 통지(`<SignedOut />`)로 간다.
   */
  const loadUndoHistory = useCallback(
    async (first: UndoHistoryNeed, skipped: number): Promise<void> => {
      const target = store.queuePageId()
      const project = store.queueProjectId() ?? projectId
      if (target === null) return
      const { undoStack } = store.getState()
      const top = undoStack[undoStack.length - 1]
      // 누른 때의 통지 — 받는 동안 선 잃음을 가른다(`sayAfterWait`).
      const pressed = store.getState().editFailure
      const leave = new AbortController()
      const stop = store.subscribe(() => {
        if (!store.undoHistoryLive(first)) leave.abort()
      })
      store.beginUndoHistoryLoad(first)
      try {
        let need: UndoHistoryNeed | null = first
        for (let round = 0; need !== null && round < UNDO_HISTORY_ROUNDS; round += 1) {
          const asked: UndoHistoryNeed = need
          let more: RestoredRevision[]
          try {
            more = restoredRevisions(
              await api.listRevisionsBefore(project, target, { beforeSeq: asked.beforeSeq, limit: asked.limit }, { cancel: leave.signal }),
            )
          } catch (caught) {
            if (!store.undoHistoryLive(first)) return
            const failure = toFailure(caught, UNDO_HISTORY_FAILURE)
            const head = skipped > 0 ? `${skippedHead(skipped)} ` : ''
            sayAfterWait(pressed, failure.kind === 'signed-out' ? failure : { kind: 'message', message: `${head}${failure.message} — ${UNDO_HISTORY_NOTICE}` })
            return
          }
          if (!store.supplyUndoHistory(asked, more)) return
          // 물은 가장 높은 번호가 없으면(서버에 없다) 다시 물어도 같다.
          if (!more.some((revision) => revision.seq === asked.beforeSeq - 1)) break
          need = store.undoHistoryNeed()
        }
        const now = store.getState().undoStack
        if (!store.undoHistoryLive(first) || now[now.length - 1] !== top) return
        store.endUndoHistoryLoad(first)
        settle(store.startUndo({ historyLoaded: true }), skipped, pressed)
      } finally {
        stop()
        store.endUndoHistoryLoad(first)
      }
    },
    [api, projectId, store, settle, sayAfterWait],
  )

  /**
   * 되돌리기 한 단계. 새로고침으로 채운 항목에 닿았는데 되짚기 이력이 모자라면 스토어가 멈추고 조회를 낸다(`UndoAttempt.history`) — 맨 위가 그
   * 항목이든, 맨 위 세션 항목을 건너뛰고 닿았든. 받은 뒤 되돌리고, 건너뛴 세션 항목은 그 결과와 함께 센다. 받는 동안은 건너뛴 것만 말한다.
   */
  const undo = useCallback(() => {
    if (open === null || store.getState().undoHistoryLoading) return
    const attempt = store.startUndo()
    if (attempt.history === undefined) {
      settle(attempt, 0)
      return
    }
    if (attempt.skipped > 0) store.setEditFailure({ kind: 'message', message: skippedHead(attempt.skipped) })
    void loadUndoHistory(attempt.history, attempt.skipped)
  }, [open, store, settle, loadUndoHistory])

  const redo = useCallback(() => {
    // 받는 동안은 버린다 — 단추가 먼저 막는다(`canRedo`). `undo`의 같은 가드와 짝이다.
    if (store.getState().undoHistoryLoading) return
    step(store.startRedo)
  }, [step, store])

  /**
   * 편집 하나를 큐에 넣고 전송을 밟는다. **`commitProp`과 구조 편집(구조 트리의 명령)이
   * 공유하는 유일한 통로다** — 둘이 각자 `applyEdit` + `pump`를 쓰면 그 사이에 끼는
   * 규칙(열린 페이지 대조·통지 치우기)이 두 벌이 되고, 한쪽만 고쳐지는 날이 온다.
   */
  const commitOps = useCallback(
    (ops: PatchOp[] | null, options: CommitOptions = {}): boolean => {
      // 지금 열린 페이지가 아니면 편집을 만들지 않는다. `useOpenPage`가 주소와 대조한
      // 결과이므로, 주소가 바뀐 뒤 스토어가 아직 앞 페이지를 들고 있는 커밋에서도 여기가
      // `null`이다. **그 대조를 지우면 앞 페이지의 ops가 다음 페이지 경로로 나간다** —
      // `test/edit/use-edit-commit.test.tsx`의 `스토어가 다른 페이지를 들고 있으면…`이
      // 그것을 잡고, `test/store-access.test.ts`의 가드는 "우회를 썼다"는 사실을 잡는다.
      // **둘은 다른 것을 잡는다:** 가드는 소스 텍스트라 우회의 존재만 알고 무엇이
      // 잘못되는지 말하지 못하고, 동작 케이스는 그 반대다.
      if (open === null) return false
      // 만드는 쪽이 "요청을 보내지 마라"라고 답한 것이다(`edit/ops.ts` 머리말).
      if (ops === null) return false
      // 로컬 적용이 실패했다 — 클라이언트가 만든 잘못된 `ops`다. 보내 봐야 서버도 같은
      // 자리에서 거절한다.
      if (store.applyEdit(ops) === null) return false

      // 앞 실패의 통지를 치운다. 남겨 두면 사용자가 방금 낸 편집도 실패했다고 읽는다. **누른 뒤 기다렸다가 내는 편집(`pressed`)은 그 사이
      // 선 잃음을 치우지 않는다** — 누른 때의 통지가 아니라 그 뒤에 온 잃음이다(`sayAfterWait`와 같은 규칙 · `CommitOptions`).
      if (options.pressed === undefined || !lossArrivedSince(options.pressed)) store.setEditFailure(null)
      void pump()
      return true
    },
    [open, store, pump, lossArrivedSince],
  )

  const commitProp = useCallback(
    (nodeId: string, prop: string, value: unknown): void => {
      // **재조회 중(`editStatus === 'recovering'`)에도 편집을 받는다.** 막는 판을 고르지
      // 않은 이유 둘: 재조회는 왕복 하나로 짧고, 입력을 막으려면 컨트롤 넷이 각자 비활성
      // 상태를 다뤄야 해서 범위가 는다. 대신 그 창에서 들어온 편집은 `loadPage`가 문서를
      // 서버 것으로 놓을 때 함께 버려지고, 알림이 그 수를 합쳐 말한다 — 사용자가 낸 편집이
      // 조용히 되살아나지 않는 것이 요점이고 그것은 스토어 쪽에서 닫힌다.
      //
      // **`open`을 여기서도 보는 것은 `open.document`가 필요해서다.** 열린 페이지 대조
      // 자체는 `commitOps`가 다시 한다 — 그쪽이 그 규칙을 갖는 자리다.
      if (open === null) return

      // 문서에 없는 노드면 `propOps`가 `null`을 내고 `commitOps`가 그 자리에서 돌아온다.
      commitOps(propOps(open.document, nodeId, prop, value))
    },
    [open, commitOps],
  )

  const commitVariant = useCallback(
    (nodeId: string, variant: string | null): void => {
      // `commitProp`과 같은 이유로 `open`을 본다 — `open.document`가 필요하다.
      // 열린 페이지 대조 자체는 `commitOps`가 다시 한다.
      if (open === null) return

      // 지울 것이 없거나 노드가 문서에 없으면 `variantOps`가 `null`을 내고 그 자리에서 끝난다.
      commitOps(variantOps(open.document, nodeId, variant))
    },
    [open, commitOps],
  )

  const commitInteractions = useCallback(
    (nodeId: string, interactions: readonly Interaction[]): void => {
      // `commitProp`·`commitVariant`와 같은 이유로 `open`을 본다 — `open.document`가 필요하다.
      // 열린 페이지 대조 자체는 `commitOps`가 다시 한다.
      if (open === null) return

      // 지울 것이 없거나 노드가 문서에 없으면 `interactionsOps`가 `null`을 내고 그 자리에서 끝난다.
      commitOps(interactionsOps(open.document, nodeId, interactions))
    },
    [open, commitOps],
  )

  return {
    commitProp,
    commitVariant,
    commitInteractions,
    commitOps,
    undo,
    redo,
    canUndo,
    canRedo,
    status,
  }
}
