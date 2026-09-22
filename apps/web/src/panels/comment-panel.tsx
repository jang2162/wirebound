/**
 * 우측의 코멘트 탭(설계 §9). **설계서에 읽는 사람이 말을 남기는 자리다.**
 *
 * ## 두 진실을 한 화면에서 합친다
 *
 * **번호는 문서에 있고 본문은 표에 있다**(계획서 D1). 이 파일이 둘을 잇는 유일한 자리다 —
 * 코멘트의 `nodeId`로 문서에서 노드를 찾아 그 `marker`를 읽는다. 서버는 번호를 모르므로
 * 목록을 번호 순으로 주지 못한다(`created_at` 오름차순이다). **묶고 늘어놓는 것이 여기 일이다.**
 *
 * **선택한 노드의 것만 보이지 않는다**(재라 #3). §9의 그림이 *"① 검색폼 - … / ② 목록 - …"*로
 * **전부**를 보인다 — 코멘트 탭의 쓸모가 *"이 설계서에 어떤 말이 붙어 있는가"*를 훑는
 * 것이기 때문이다. 선택한 노드의 무리에는 표시를 달아 눈이 먼저 가게 한다.
 *
 * ## 무리가 셋이고, **"모른다"는 그 셋 중 하나가 아니다** (리뷰 F)
 *
 * | 무리 | 언제 | 순서 |
 * |---|---|---|
 * | 번호가 있는 노드 | 보통 | 번호 오름차순 |
 * | 번호가 없는 노드 | undo가 번호를 되돌렸다(D2의 대가 1) | 코멘트가 달린 순서 |
 * | **문서에 없는 노드** | 코멘트가 달린 노드를 지웠다 | 코멘트가 달린 순서 |
 *
 * 셋째가 실재하는 이유는 `comments.node_id`에 FK가 없기 때문이다(노드는 테이블이 아니라
 * jsonb 안의 값이다). **감추지 않는다** — 감추면 사용자가 남긴 말이 소리 없이 사라진다.
 *
 * **그런데 문서를 아직/영영 못 읽은 상태가 따로 있다.** 앞 판은 `markersOf(null)`이 빈
 * 표를 내고 `markers.has(nodeId)`가 전부 `false`가 되어 **모든 코멘트를 셋째 무리로
 * 단언했다** — *"사라진 노드"*라고. **거짓말이고 사용자가 실제로 본다:** 페이지를 갈아탈
 * 때마다 커밋 하나 동안, 그리고 문서 조회가 실패한 뒤로는 계속.
 *
 * **`null`(못 읽었다)과 빈 값(없다)을 같은 것으로 접는 자리 —** 이 저장소가 네 번 만난
 * 부류다(P4c-3 이월 2번: W2의 저장 버튼 · P4c-3의 파일 읽기 · 리뷰 B5의 트랜잭션 ·
 * 그리고 여기). **그래서 `present`가 `boolean`이 아니라 셋이다:**
 * `'yes' | 'no' | 'unknown'`. `'unknown'`이면 무엇도 단언하지 않고 그렇다고 말한다.
 *
 * ## 문서를 바꾸는 조작 셋
 *
 * 코멘트 작성·삭제·재번호는 서버에서 `marker`를 바꾸고 revision을 남긴다(D2). 그 변화를
 * `store.applyMarkerChange`가 내 문서에 얹는다 — 그러지 않으면 캔버스에 번호가 안 뜨고
 * `headSeq`가 서버보다 뒤처진다.
 *
 * ## 탭을 오가도 쓰던 말이 남는다 — **페이지에 매인 것은 패널 밖에 든다** (8차)
 *
 * **결함이었다.** 새 코멘트 초안·고치던 코멘트를 이 패널의 `useState`로 들었더니 옆 탭을 한 번
 * 눌렀다 돌아온 것만으로 **경고 없이** 사라졌다. `routes/editor.tsx`가 안 보이는 탭을 DOM에서
 * 빼고, 조회 이펙트가 마운트마다 초안을 비웠다. 코멘트는 **blur에 게시하면 안 되는** 글이라
 * (쓰다 만 말이 저절로 달린다) 속성 패널처럼 blur 커밋으로 막을 수도 없다 — «페이지 설명»과
 * 같은 결이다.
 *
 * 실측(치던 중에 → 돌아와 본 상자):
 *
 * | 갈래 | 앞 판 (jsdom · Chrome) | 8차 (jsdom · Chrome) |
 * |---|---|---|
 * | 옆 탭 왕복 — 새 코멘트 | `""` | 초안 그대로 |
 * | 옆 탭 왕복 — 고치던 것 | 편집 칸째 닫힘 | 편집 칸과 글 그대로 |
 * | 모드 왕복(코멘트 탭을 보던 채) | 그대로 — 코멘트 탭은 두 모드에 다 있어 언마운트되지 않는다 | 같음 |
 * | 다른 노드를 고른다 | 그대로 — 달릴 대상이 새 노드로 바뀐다 | 같음 — **9차에 고쳤다**(아래) |
 * | 다른 페이지 → 복귀 | 버림 | 버림 — 규칙이다 |
 *
 * **고른 것 — `panel-drafts.tsx`의 칸에 든다.** «페이지 설명»과 **같은 provider**이고, 페이지가
 * 바뀌면 버리는 일(아래 조회 이펙트의 주석)도 그 provider가 **같은 자리에서 같은 값으로**
 * 한다. 두 벌의 장치를 두지 않았다.
 *
 * **초안만 올리지 않았다 — 목록·쓰기 잠금·통지도 칸이다.** 초안만 올리면 «페이지 설명»의 리뷰
 * N1이 여기서도 난다. 게시를 3초 늦추고 Chrome 으로 잰 앞 판의 값:
 *
 * | 갈래 | 앞 판 | 8차 |
 * |---|---|---|
 * | 게시 중 탭 왕복 | 새 마운트의 상자가 **열려**(잠금이 마운트에 묶였다) 이어 쳐서 누르면 **게시가 둘 나갔다** | 상자·단추가 꺼진 채다. 게시 1회, 응답 뒤 목록에 그 말이 선다 |
 * | 게시 중 옆 페이지로 | 옆 페이지의 상자가 앞 페이지의 게시 동안 **꺼져 있고**, 응답 뒤 **앞 페이지의 목록을 다시 받아 옆 페이지에 그렸다** | 옆 페이지에서 바로 쓸 수 있고, 앞 페이지의 응답은 **어디에도 닿지 않는다** |
 *
 * 둘째 줄이 «페이지 설명»의 리뷰 N2와 같은 부류다 — 다시 받기가 **게시를 시작한 렌더의
 * `pageId`**로 앞 페이지의 목록을 불렀다. 케이스는 `test/panels/comment-panel.test.tsx`의
 * «탭·페이지를 오가도 …» 절이다.
 *
 * ### 새 코멘트 초안은 **노드마다** 든다 — 글은 쓴 노드에만 달린다 (9차, 리뷰 N-C)
 *
 * 새 코멘트는 «지금 고른 노드»에 달린다(`submit`). 8차 판은 초안을 **한 칸**으로 들어, 쓰는 도중
 * 다른 노드를 고르면 초안은 남고 **달릴 자리가 그 노드로 바뀌었다** — 노드 X에 대해 쓴 글이
 * 노드 Y에 달린다. 코멘트 작성은 `marker`를 쓰고 revision을 남기므로(D2) 틀린 노드에 번호가 붙은
 * revision이 설계서에 남고, 수정은 본문만 바꿔 `nodeId`를 못 고친다. «페이지 설명»의 F1
 * (*"가리키는 페이지가 곧 뜻의 절반"*)과 **같은 부류의 자료 오염**이다(리뷰 판정).
 *
 * | 쓰는 도중 다른 노드를 고른다 | 7차까지 | 8차 | 9차 |
 * |---|---|---|---|
 * | 코멘트 탭에 머문 채 캔버스·트리로 | 초안이 남고 **대상이 바뀐다** | 같음 | 상자가 **그 노드의 초안**(없으면 빈 칸)이 된다. 돌아오면 쓰던 글이 원래 노드를 대상으로 그대로 있다 |
 * | 속성 탭을 다녀오며 | 초안을 잃는다(탭 왕복) | 초안이 남고 **대상이 바뀐다** — 8차가 탭 왕복에 초안을 살리며 **연 길**이다 | 같음(위 줄) |
 *
 * (7차까지·8차 = 리뷰 실측, Chrome. 9차 = jsdom 케이스 *"쓰던 코멘트는 쓴 노드에만 달린다 …"*와
 * Chrome 재측 — 두 길 다 상자가 빈 칸이 됐다가 원래 노드로 돌아오면 글이 서고, 달면 DB 에
 * `n-tree:트리에 대해 쓴 말` 한 행.)
 *
 * 8차 판이 «버리지 않는다»의 근거로 든 *"쓰다가 옆 노드를 확인하는 일이 흔하다"*가 바로 대상이
 * 바뀌는 조작이었다. 그 조작은 이제 **초안을 옮기지 않고 칸을 바꾼다** — 옆 노드를 보고 돌아오면
 * 쓰던 글이 그대로다. 그리고 그 판의 *"고른 노드의 무리에 붙는 표시가 함께 옮겨 가므로 화면이
 * 그것을 말한다"*는 **새 대상에 코멘트가 이미 있을 때만** 참이었다 — 없으면 표시가 사라질 뿐
 * 새 대상을 가리키지 않는다(리뷰 실측: `["1 n-tree"]` → `[]`). 9차에서는 상자의 글이 그 노드의
 * 것으로 바뀌어 대상이 바뀐 것이 보인다. **폼에 대상 이름을 적지는 않았다** — 뷰 모드에는
 * 아웃라인이 없어 대상이 아예 안 보이는 것(앞 판부터)과 함께 보고로 올린다.
 *
 * **페이지가 바뀌면 노드마다의 초안도 한 칸째 버린다** — 노드 id 는 그 페이지 안에서만 뜻이
 * 있다. 7차 F1과 이 규칙이 **같은 자리에서 같은 값으로** 도는 것은 그대로다(`DRAFTS`가 방문의
 * 칸 하나다). 게시가 나가 있는 동안 다른 노드를 골라도 응답은 **보낸 노드의 초안만** 비운다.
 *
 * ### 잠금이 막지 못하던 길 둘 — 끝에 **한 번호에 두 행**이 섰다 (9차 좁은 반증, Chrome)
 *
 * `BUSY`는 페이지 왕복에도 남지만(`panel-drafts.tsx`의 머리말 3) 아래 둘은 막지 못했다(**둘 다 이제
 * 막는다** — 각 항목의 끝). 둘 다
 * 끝에 보이는 것이 같다 — **목록에 방금 단 말이 없고 잠금은 풀려 있다.** 사용자가 다시 달면
 * 같은 노드에 같은 말이 두 행 선다(`BUSY`의 주석이 막으려던 바로 그 상태다). jsdom 케이스는 없다.
 *
 * 1. **provider 째 내려가는 길.** 게시가 나가 있는 동안 프로젝트 목록을 다녀오면 잠금이 provider와
 *    함께 사라져 돌아온 상자가 열려 있다. 거기서 다시 달고 앞 게시의 응답이 늦게 오면 DB 에는 두
 *    행이 있고 화면 목록에는 한 행만 보인다. 게시가 응답을 영영 못 받는 판에서는 잠금이 페이지·탭
 *    왕복에도 꺼진 채이다가 **이 길로만** 풀린다(`panel-drafts.tsx` «이것이 막지 못하는 것»).
 *
 *    **이월 Q·R 판(2026-09-21)에서 고쳤다** — 잠금은 에디터보다 오래 사는 장부(`write-ledger.tsx`)에
 *    들고, 게시 뒤의 다시 받기는 새로 선 방문에 닿는다. Chrome 재측(프로젝트 목록 왕복): 돌아온 상자·
 *    단추가 **꺼져 있고**, 앞 게시의 응답이 오면 화면 목록 1행 · DB 1행 · 번호 1(새 셸의 실시간 연결이
 *    서버의 방송을 받아 새 스토어에 번호가 섰다). 코멘트 수정도 화면·DB 가 같은 값(`"첫째 수정"`).
 *    응답이 영영 안 오면 10초 뒤 **같은 키로 다시 보내** 판정한다(`submit`의 `verify`) — 서버가 앞 게시를
 *    쥐고 있으면 다시 보낸 것이 같은 행 잠금 뒤에 줄을 서서 재생을 받는다. 그동안 상자는 잠겨 있어
 *    고쳐 다시 달 수도, 떠났다 와서 새로 칠 수도 없다. 시간 안의 **모르는 실패**(연결 끊김 · 502·503·504 ·
 *    봉투 없는 500)도 같은 판정으로 간다(`knownRejection` — 2026-09-22). **남는 입구는 하나다 — 새로고침·탭
 *    닫기**: 초안과 키가 함께 버려져 다시 친 같은 글이 새 키가 되고, 번호가 있는 노드면 두 행이 된다(Chrome
 *    — 값은 `write-ledger.tsx`의 «판정 뒤의 늦은 커밋»).
 * 2. **타이밍 창.** 가 → 나 → 가로 돌아와 건 목록 조회가 **게시가 커밋되기 전에 읽고, 게시 뒤의
 *    다시 받기보다 늦게** 오면, 다시 받기가 세운 목록(방금 단 말이 있다)을 덮는다 — 같은 페이지라
 *    조회 이펙트의 `alive`가 참이다. 방금 단 말이 목록에서 사라지고 잠금은 이미 풀려 있다.
 *
 *    **2026-09-22 에 닫았다 — 목록 칸은 늦게 *낸* 조회의 답만 받는다**(`issue`·`answered`). 다시 받기를
 *    잠금 밖으로 뺐더니(`refresh` — 리뷰 2-4 (b)) 다시 받기끼리도 도착 순서가 뒤집힐 수 있어서 넣은
 *    규칙인데, 돌아와 건 조회는 게시의 응답 **전에** 나가므로 같은 규칙에 걸린다. Chrome(route — 돌아와
 *    건 GET 을 곧바로 서버에서 읽히고 답만 붙잡았다): 게시 커밋 → 다시 받기가 `"매달린 말"`을 세움 →
 *    그 뒤 낡은 답(빈 표)이 와도 목록 그대로 · DB 1행. 붙잡힌 동안 그 방문은 «코멘트를 불러오는 중…»이다.
 *
 * ## 이 패널은 오류 경계 밖이다
 *
 * `apps/web/src` 전체에서 경계는 캔버스의 `CanvasBoundary` 하나다. 그래서 여기서 예외가
 * 새면 셸 전체가 흰 화면이 된다 — `panels/property-panel.tsx`가 같은 이유로 `nodeType`
 * 가드를 들고 있다. 이 파일이 그리는 값은 전부 문자열이고(모양 가드가
 * `api/http-client.ts`의 `SHAPES.comment`에서 이미 끊는다), 문서 순회는 던지지 않는
 * `walkSafely`를 쓴다.
 */
import { useCallback, useEffect, type ReactElement } from 'react'
import type { PageDocument } from '@wirebound/schema'
import { useApi } from '../api/context'
import { SignedOut, toFailure, type Failure } from '../api/failure'
import { ApiError, type ApiClient } from '../api/client'
import type { Comment, CommentCreated } from '../api/types'
import { walkSafely } from '../edit/safe-walk'
import { useSessionUser } from '../session/session-context'
import { useEditorStore, useEditorStoreInstance, useOpenDocument } from '../store/use-editor-store'
import { lockSlot, slot, usePanelLock, usePanelSlot } from './panel-drafts'
import { PendingNotice } from './pending-notice'

/** 페이지를 열지 않았을 때. */
const NO_PAGE = '페이지를 열면 코멘트가 보입니다'
/** 코멘트가 하나도 없을 때. */
const NO_COMMENTS = '아직 코멘트가 없습니다'
/** 노드를 고르지 않아 새 코멘트를 달 수 없을 때. */
const NO_TARGET = '코멘트를 달 노드를 캔버스나 구조 트리에서 고르세요'
/** 조회가 이유 없이 실패했을 때. */
const LOAD_FAILED = '코멘트를 불러오지 못했습니다'
/** 쓰기 뒤의 목록 다시 받기가 도는 중(`refresh`). 쓰기는 끝났고 잠금은 풀렸다 — 표시만 아직이다. */
const REFRESHING = '목록을 다시 불러오는 중…'
/** 쓰기 뒤의 목록 다시 받기가 실패했다 — **쓰기는 끝났다.** 목록은 그 앞의 것 그대로다. */
const REFRESH_FAILED = '목록을 다시 불러오지 못했습니다'
/** 쓰기가 이유 없이 실패했을 때. */
const WRITE_FAILED = '코멘트를 저장하지 못했습니다'
/** 문서에 없는 노드에 붙은 코멘트의 무리 이름. */
const MISSING_NODE = '사라진 노드'
/** 문서를 못 읽어 번호를 붙일 수 없을 때. **"사라진 노드"라고 단언하지 않는다**(리뷰 F). */
const NO_DOCUMENT = '문서를 읽지 못해 번호를 보일 수 없습니다'
/** 서버는 번호를 바꿨는데 내 문서에 얹지 못했을 때(리뷰 ④). */
const DIVERGED = '번호를 화면에 반영하지 못했습니다 — 새로고침하면 맞춰집니다'
/**
 * 시간 안에 응답이 없어 목록을 다시 읽는 중(`panels/write-ledger.tsx`의 `'checking'`). **«실패»가
 * 아니다** — 서버가 이미 반영했을 수 있다.
 */
const CHECKING = '응답이 없어 반영됐는지 서버에서 확인하는 중입니다'
/** 다시 읽기(게시는 같은 키로 다시 보내기)도 실패했다 — 결과를 모른다. 잠금은 그대로다. */
const UNKNOWN = '응답이 없고, 반영됐는지 확인하지도 못했습니다'
/** 다시 읽었더니 그 코멘트의 본문이 고친 글과 다르다 — 편집 칸과 글은 남긴다. */
const NOT_EDITED = '응답이 없어 목록을 다시 읽었더니 이 수정은 저장되지 않았습니다'
/** 다시 읽었더니 그 코멘트가 아직 목록에 있다. */
const NOT_DELETED = '응답이 없어 목록을 다시 읽었더니 이 코멘트는 지워지지 않았습니다'

/**
 * 목록 칸. **`at`은 그 값을 낸 조회의 순서 번호다**(`issue`) — 칸은 늦게 낸 조회의 답만 받는다(`answered`).
 */
type LoadState =
  | { status: 'loading'; at: number }
  | { status: 'ready'; at: number; comments: Comment[] }
  | { status: 'failed'; at: number; failure: Failure }

/**
 * 목록 조회를 **낸 순서**. 쓰기 뒤의 다시 받기가 잠금 밖으로 나가면서(`refresh`) 조회 둘이 겹칠 수 있다 —
 * 앞 게시의 다시 받기가 늦게 와서 뒤 게시의 다시 받기가 세운 목록을 덮으면 **방금 단 말이 사라진다.**
 * 그래서 도착 순서가 아니라 낸 순서로 가른다. 페이지가 바뀌면 칸이 버려지므로 번호는 한 줄로 늘기만
 * 하면 된다 — 모듈에 하나 둔다.
 */
let issued = 0
function issue(): number {
  issued += 1
  return issued
}

/** `at`에 낸 조회의 답을 칸에 쓰는 갱신 — **그보다 늦게 낸 조회의 것이 이미 서 있으면 버린다.** */
function answered(at: number, next: LoadState): (prev: LoadState) => LoadState {
  return (prev) => (at < prev.at ? prev : next)
}

/** 게시를 같은 키로 다시 보낸 결과(`submit`의 판정). 거절은 `knownRejection`인 것뿐이다 — 그 밖은 모른다. */
type Reposted = { posted: true; created: CommentCreated } | { posted: false; caught: unknown }

/**
 * 게시의 실패가 **안 달렸다고 확정할 수 있는** 실패인가. 첫 보내기의 실패(`uncertain`)와 같은 키로 다시
 * 보낸 것의 실패(`verify`)가 **같은 이 함수**로 갈린다 — 두 자리가 따로 가르면 한쪽만 낡는다.
 *
 * | 실패 | 뜻 |
 * |---|---|
 * | 4xx | **확정** — 서버가 이 요청을 보고 거절했다 |
 * | **api 가 낸 500**(오류 봉투가 있다 — `ApiError.enveloped`) | **확정** — 핸들러가 던진 것이고 커밋 전이다(아래) |
 * | 연결 실패 · 502·503·504 · **봉투 없는 500** | **모른다** — 요청이 서버에 닿아 커밋됐을 수 있다 |
 *
 * **«api 가 낸 500 은 커밋 전이다»를 코드로 봤다**(`apps/api/src/routes/comments.ts`의 게시 핸들러). 커밋
 * (`runWrite`가 끝난 것) 뒤에 도는 것은 셋이다: `notifyMarkerChange` — 방송은 `async`인 `broadcast.send`이고
 * 실패를 `.catch`로 삼킨다(`ws/notify.ts`) · 그 인자의 `requestEventActor` — 번호를 붙이는 갈래에서는 이미
 * 트랜잭션 **안에서** 같은 요청으로 `requestActor`를 불렀다(같은 값이라 여기서 새로 던질 길이 없다), 번호가
 * 있던 갈래는 `markerOps`가 비어 이 호출 전에 돌아간다 · 응답 객체 — 문자열·수뿐이라 직렬화가 던지지 않는다.
 * 핸들러 뒤에 도는 훅(`onSend`·`onResponse`)은 없다(`addHook`은 `onRoute`·`onRequest`뿐).
 *
 * **그런데 브라우저가 받은 500 이 늘 api 의 것은 아니다.** Vite 개발 프록시는 api 가 요청을 쥔 채 죽으면
 * `500 text/plain` 빈 본문을 준다(잰 값 — 행 잠금으로 게시를 막아 둔 채 api 프로세스를 내렸다: 1.5s 에
 * `500` · 본문 `""`). 그 판은 롤백됐지만 **커밋 직후에 죽어도 같은 모양**이다. 그래서 가르는 것은 숫자가
 * 아니라 **봉투**다 — api 가 직접 낸 오류는 늘 봉투를 싣는다.
 */
function knownRejection(caught: unknown): boolean {
  if (!(caught instanceof ApiError)) return false
  if (caught.status >= 400 && caught.status < 500) return true
  return caught.status === 500 && caught.enveloped
}

/**
 * **이 탭의 칸 일곱** — 전부 `panel-drafts.tsx`의 칸이다. 이 본문은 탭을 옮기면
 * 언마운트되므로(`routes/editor.tsx`), 여기 `useState`로 들면 탭을 한 번 누르는 것만으로
 * 사라진다(위 머리말 «탭을 오가도 …»). **페이지가 바뀌면 그 provider가 여섯을 함께
 * 버린다** — 노드 id도 코멘트 id도 그 페이지 안에서만 뜻이 있다. 남는 하나는 쓰기 잠금이다
 * (`BUSY` — 그 페이지에 매인다).
 */
/** 목록. 쓰기 뒤의 다시 받기가 **여기를** 채운다 — 그래서 목록도 마운트 밖에 든다. */
const LIST = slot<LoadState>('comments/list', { status: 'loading', at: 0 })
/**
 * 쓰기 뒤의 목록 다시 받기 — **잠금 밖이라 따로 말한다**(`refresh`). **마지막으로 낸** 다시 받기의 번호와,
 * 그것이 실패했으면 그 실패다. `null`이면 말할 것이 없다.
 *
 * **말하는 것은 그 번호가 보이는 목록보다 새것일 때뿐이다**(아래 그리는 자리). 다시 받기가 매달린 채 탭을
 * 오가 새 조회가 목록을 세우면, 매달린 것은 이미 낡았다 — «다시 불러오는 중»이 남으면 거짓이다(Chrome: 탭
 * 왕복 뒤 목록에 방금 단 말이 서 있는데 그 문장이 남았다).
 */
const REFRESH = slot<{ at: number; failure: Failure | null } | null>('comments/refresh', null)
/**
 * 쓰기 중에는 조작을 막는다. 같은 코멘트가 두 번 나가면 번호는 하나인데 행이 둘이 된다.
 *
 * **잠금 칸이다** — 페이지를 떠났다 돌아와도 그 쓰기가 끝나기 전에는 풀리지 않는다(리뷰 N-A.
 * 8차 판은 이것이 리셋에 버려져, 가 → 나 → 가로 돌아와 쓰던 새 코멘트가 앞 게시의 응답에
 * 비워지고 고치던 **다른** 코멘트의 편집 칸이 앞 수정의 응답에 닫혔다. `panel-drafts.tsx`의
 * 머리말 3). **값은 장부에 든다**(`write-ledger.tsx`) — 에디터를 떠났다 와도 풀리지 않는다(이월 Q).
 */
const BUSY = lockSlot('comments/busy')
/** 마지막 쓰기 실패. **성공하면 지운다** — 남아 있으면 방금 한 조작도 실패한 것으로 읽힌다. */
const WRITE_ERROR = slot<Failure | null>('comments/write-error', null)
/**
 * **서버는 번호를 바꿨는데 내 문서에 얹지 못했다**(리뷰 ④ — `applyMarkerChange`가
 * `'diverged'`를 냈다). 보내지 않은 구조 편집이 그 노드를 이미 지운 경우다.
 *
 * **버리지 않고 말한다.** 버리면 *"코멘트는 달렸는데 캔버스에 번호가 없고 아무도 그것을
 * 말하지 않는"* 상태가 되고, 그것이 이 저장소가 네 번 만난 부류의 형태다.
 * **`'skipped'`는 말하지 않는다** — 그때는 화면이 이미 다른 페이지를 보고 있다.
 */
const MARKERS_DIVERGED = slot<boolean>('comments/diverged', false)
/**
 * 새 코멘트 초안 — **노드마다**(위 머리말 «새 코멘트 초안은 노드마다 …»). 키는 노드 id이고 없으면
 * 빈 칸이다. **한 칸으로 들면 다른 노드를 고르는 순간 쓰던 글의 대상이 그 노드로 바뀐다.**
 */
const DRAFTS = slot<ReadonlyMap<string, string>>('comments/drafts', new Map())
/**
 * 새 코멘트 게시의 **멱등 키** — 노드마다, **그 글에** 매인다(`apps/api/README.md`의 «멱등 키»).
 *
 * 응답이 없어 «안 달림»으로 판정한 게시를 서버가 늦게 커밋할 수 있다(`write-ledger.tsx`의 머리말 —
 * Chrome 13.4초). 그 사이 사용자가 다시 달면 같은 글이 두 행이 됐다. **같은 초안은 같은 키를 싣고**
 * 서버가 같은 키면 앞 행을 돌려주므로 한 행으로 합쳐진다.
 *
 * | 언제 | 키 |
 * |---|---|
 * | 그 노드의 글을 처음 보낸다 | 새로 짓는다(`crypto.randomUUID()` — `store/editor-store.ts`의 `clientOpId`와 같은 출처) |
 * | 응답이 없어 **판정한다** | **같은 키로 다시 보낸다** — 그것이 판정이다(`submit`의 `verify`) |
 * | 실패·거절 뒤 **같은 글**을 다시 보낸다 | **같은 키** |
 * | 글을 고쳐 보낸다 | **새 키** — 고친 글은 다른 게시다. 같은 키로 보내면 서버가 409 로 막는다 |
 * | 달렸다(응답 · 다시 보낸 것의 응답) | **버린다** — 같은 말을 일부러 또 다는 것은 새 게시다 |
 * | 페이지를 떠난다 · 에디터를 떠난다 | 초안과 **함께** 버려진다(방문의 칸이다 — `panel-drafts.tsx`의 머리말 1) |
 *
 * **초안 쪽에 든다 — 장부가 아니다.** 키의 수명은 그 초안의 수명이다. 장부는 에디터를 떠나도
 * 살아, 거기 들면 초안이 버려진 뒤에도 키가 남는다 — 돌아와 같은 글을 새로 쳐 달면 앞 게시로
 * 합쳐진다. 일부러 같은 말을 다시 다는 사람의 게시가 사라지는 길이다. 대가도 적어 둔다: 떠났다
 * 오는 사이 늦게 커밋된 게시는 돌아와 새로 친 같은 글과 **합쳐지지 않는다**(새 키다). 시간 초과와 모르는
 * 실패의 판에서는 판정(같은 키로 다시 보내기)이 끝날 때까지 상자가 잠겨 있어 이 길이 안 선다 — 확정 실패
 * (`knownRejection`) 뒤라면 앞 게시가 커밋될 수 없어 새 키여도 한 행이다. 서는 것은 새로고침 뒤뿐이다
 * (`write-ledger.tsx`의 «이것이 막지 못하는 것»).
 */
const POST_KEYS = slot<ReadonlyMap<string, { body: string; key: string }>>('comments/post-keys', new Map())
/** 지금 고치고 있는 코멘트의 id. `null`이면 아무것도 안 고치는 중이다. */
const EDITING_ID = slot<string | null>('comments/editing-id', null)
/** 고치던 코멘트의 초안. */
const EDIT_DRAFT = slot<string>('comments/edit-draft', '')

/** `drafts`에서 그 노드의 초안을 `text`로 바꾼 새 표. 빈 글이면 키를 지운다(없는 것과 같다). */
function withDraft(drafts: ReadonlyMap<string, string>, nodeId: string, text: string): ReadonlyMap<string, string> {
  const next = new Map(drafts)
  if (text === '') next.delete(nodeId)
  else next.set(nodeId, text)
  return next
}

/** 한 노드에 붙은 코멘트 묶음. `marker`는 문서에서 읽은 값이다(표에는 없다). */
interface Group {
  nodeId: string
  /** 그 노드의 번호. 노드가 없거나 번호가 없거나 **문서를 못 읽었으면** `null`이다. */
  marker: number | null
  /**
   * 노드가 문서에 있는가. **`boolean`이 아닌 것이 요점이다**(리뷰 F) —
   * `'unknown'`은 *"문서를 못 읽어서 모른다"*이고 `'no'`(*"문서에 없다"*)와 다른 말이다.
   */
  present: 'yes' | 'no' | 'unknown'
  comments: Comment[]
}

/**
 * 문서에서 노드 id → `marker` 표를 만든다. **`walkSafely`를 쓴다** — 검증 전 문서가
 * 스토어에 실릴 수 있고(P2b-2), `walkNodes`는 `children` 안의 노드 아닌 원소에서 던진다
 * (`edit/safe-walk.ts`의 실측). 이 패널은 오류 경계 밖이라 그 예외가 셸을 지운다.
 *
 * `marker`가 정수가 아닌 값이면 없는 것으로 다룬다 — 봉투 검증이 막지만 그 문서가 여기
 * 오지 않는다는 보장은 검증 **전** 문서에 대해서는 없다.
 */
function markersOf(document: PageDocument): Map<string, number | null> {
  const markers = new Map<string, number | null>()

  for (const visit of walkSafely(document.root)) {
    const marker = visit.node.marker
    markers.set(visit.node.id, typeof marker === 'number' && Number.isInteger(marker) ? marker : null)
  }
  return markers
}

/**
 * 코멘트를 노드별로 묶고 늘어놓는다. **순서가 이 함수의 계약이다**(위 머리말의 표).
 *
 * 묶음 안의 순서는 서버가 준 그대로다 — `created_at` 오름차순이라 먼저 한 말이 먼저다.
 */
export function groupComments(comments: readonly Comment[], document: PageDocument | null): Group[] {
  // **문서가 없으면 `null`을 그대로 들고 간다** — 빈 표로 접으면 모든 노드가 "없다"가 된다(리뷰 F).
  const markers = document === null ? null : markersOf(document)
  const groups = new Map<string, Group>()

  for (const comment of comments) {
    const existing = groups.get(comment.nodeId)
    if (existing) {
      existing.comments.push(comment)
      continue
    }
    const present: Group['present'] =
      markers === null ? 'unknown' : markers.has(comment.nodeId) ? 'yes' : 'no'
    groups.set(comment.nodeId, {
      nodeId: comment.nodeId,
      marker: present === 'yes' ? (markers?.get(comment.nodeId) ?? null) : null,
      present,
      comments: [comment],
    })
  }

  // **`Map`의 순회 순서가 삽입 순서**라, 번호 없는 두 무리는 코멘트가 달린 순서로 남는다.
  // `sort`가 안정 정렬이므로(ES2019부터 규격이다) 그 순서가 아래 정렬을 지나도 보존된다.
  return [...groups.values()].sort((a, b) => rank(a) - rank(b) || (a.marker ?? 0) - (b.marker ?? 0))
}

/**
 * 무리의 등급. 작을수록 앞이다 — 번호 있음 → 번호 없음 → 사라진 노드.
 *
 * **`'unknown'`은 뒤로 밀지 않는다.** 그것은 *"이 노드가 나쁘다"*가 아니라 *"내가 모른다"*
 * 이고, 모르는 것을 뒤로 몰면 사용자가 그것을 문제로 읽는다. 문서를 못 읽었으면 **전부**
 * `'unknown'`이므로 순서는 코멘트가 달린 순서 그대로 남는다.
 */
function rank(group: Group): number {
  if (group.present === 'unknown') return 1
  if (group.present === 'no') return 2
  return group.marker === null ? 1 : 0
}

export function CommentPanel(props: { projectId: string; pageId: string | undefined }): ReactElement {
  const api = useApi()
  const store = useEditorStoreInstance()
  // **남의 코멘트는 고칠 수 없다**(서버의 재라 #2). `null`이면 아직 누구인지 모르는
  // 것이므로 수정 단추를 하나도 안 낸다 — 서버가 어차피 403으로 막는다.
  const currentUser = useSessionUser()
  // 문서는 `useOpenDocument`로 받는다 — 스토어의 문서가 **지금 주소의 것**일 때만 쓴다.
  const document = useOpenDocument(props.pageId)
  const selectedNodeId = useEditorStore(store, (s) => s.selectedNodeId)

  // **일곱 다 칸이다**(위 `LIST` 선언의 주석). 아래 쓰기 함수들은 **이 렌더의 페이지를 단다** —
  // 응답이 오기 전에 탭을 오갔으면 지금 떠 있는 본문에 닿고, 페이지를 옮겼으면 어디에도
  // 안 닿는다(`panel-drafts.tsx`의 머리말 — 리뷰 N1·N2).
  const [state, setState] = usePanelSlot(LIST)
  const busyLock = usePanelLock(BUSY)
  const busy = busyLock.locked
  const [writeError, setWriteError] = usePanelSlot(WRITE_ERROR)
  const [diverged, setDiverged] = usePanelSlot(MARKERS_DIVERGED)
  const [drafts, setDrafts] = usePanelSlot(DRAFTS)
  const [editingId, setEditingId] = usePanelSlot(EDITING_ID)
  const [editDraft, setEditDraft] = usePanelSlot(EDIT_DRAFT)
  const [postKeys, setPostKeys] = usePanelSlot(POST_KEYS)
  const [refreshing, setRefreshing] = usePanelSlot(REFRESH)

  const { projectId, pageId } = props
  // 상자가 보이는 것은 **고른 노드의 초안**이다 — 새 코멘트가 달릴 자리와 같은 값을 본다.
  const draft = selectedNodeId === null ? '' : (drafts.get(selectedNodeId) ?? '')

  /**
   * **쓰기 뒤의 목록 다시 받기 — 잠금 밖이다**(리뷰 2-4 (b)). 앞 판은 이것을 쓰기의 뒷일 안에서 기다려,
   * 게시가 **커밋됐는데** 이 읽기가 매달리면 상자가 통지 없이 꺼진 채 F5 말고는 안 풀렸다(Chrome). 쓰기가
   * 끝났으면 잠금은 풀려야 한다 — 표시를 새로 못 받은 것은 따로 말한다(`REFRESH`: 도는 중 · 실패).
   *
   * **읽기에는 시간 제한이 없다**(일반 읽기다 — 판정용이 아니다). 매달리면 «목록을 다시 불러오는 중»에
   * 머물지만 잠금은 풀려 있다. 실패하면 목록은 그 앞의 것 그대로 두고 그렇다고 말한다 — 401 이면 로그인
   * 화면이다(`toFailure`).
   *
   * 칸에 쓰는 것은 **이 렌더의 페이지와 세대를 단 쓰기**라(`usePanelSlot`) 페이지를 옮겼거나 세션이 바뀌었으면
   * 어디에도 안 닿는다.
   */
  const refresh = (openPageId: string): void => {
    const at = issue()
    setRefreshing({ at, failure: null })
    api.listComments(projectId, openPageId).then(
      (comments) => {
        setState(answered(at, { status: 'ready', at, comments }))
        setRefreshing((prev) => (prev?.at === at ? null : prev))
      },
      (caught: unknown) =>
        setRefreshing((prev) => (prev?.at === at ? { at, failure: toFailure(caught, REFRESH_FAILED) } : prev)),
    )
  }

  // **마운트될 때 지난 통지를 지운다 — 초안·고치던 것·쓰기 잠금은 지우지 않는다.**
  //
  // 통지(쓰기 실패·번호 어긋남)는 지난 조작의 결과라 탭을 다녀온 뒤에도 떠 있으면 지금 화면에
  // 대한 말로 읽힌다 — `page-description.tsx`가 같은 자리에서 같은 것을 한다. **앞 판은 아래
  // 조회 이펙트에서 초안·고치던 것까지 함께 지웠고**, 그 이펙트는 마운트마다 돌아 탭을 한 번
  // 누른 것만으로 쓰던 말이 사라졌다(위 머리말 «탭을 오가도 …»).
  //
  // **의존이 비어 있는 것이 요점이다.** 페이지가 바뀔 때 버리는 것은 provider가 한다(칸
  // 일곱을 함께) — 여기서 `pageId`에도 돌면 같은 일을 두 자리가 하게 된다.
  useEffect(() => {
    setWriteError(null)
    setDiverged(false)
    // 다시 받기의 실패도 지난 통지다. **도는 중인 것은 남긴다** — 아직 끝나지 않았다.
    setRefreshing((prev) => (prev?.failure == null ? prev : null))
  }, [])

  useEffect(() => {
    if (pageId === undefined) {
      setState({ status: 'ready', at: issue(), comments: [] })
      return
    }

    // 응답이 오기 전에 다른 페이지로 옮기거나 이 본문이 내려가면 결과를 버린다
    // (`routes/editor.tsx`와 같은 가드). 페이지 쪽은 칸의 쓰기 가드도 막는다.
    //
    // **페이지가 바뀌면 앞 페이지에 쓰던 초안·고치던 것도 버린다 — 여기가 아니라
    // `panel-drafts.tsx`의 provider가.** 노드 id도 코멘트 id도 그 페이지 안에서만 뜻이 있다.
    // 그 규칙이 «페이지 설명»의 F1과 **같은 자리에서 같은 값으로** 돈다.
    let alive = true
    const at = issue()
    setState({ status: 'loading', at })

    async function load(openPageId: string): Promise<void> {
      try {
        const comments = await api.listComments(projectId, openPageId)
        if (!alive) return
        // **늦게 낸 다시 받기의 답이 이미 섰으면 버린다**(`answered`) — 돌아와 건 이 조회는 쓰기가
        // 커밋되기 전에 읽었을 수 있다(리뷰 N-E · 머리말 «잠금이 막지 못하는 길»의 2).
        setState(answered(at, { status: 'ready', at, comments }))
      } catch (caught) {
        if (!alive) return
        setState(answered(at, { status: 'failed', at, failure: toFailure(caught, LOAD_FAILED) }))
      }
    }

    void load(pageId)
    return () => {
      alive = false
    }
    // `setState`는 이 렌더의 페이지를 단 쓰기라 `pageId`와 함께만 바뀐다.
  }, [api, projectId, pageId])

  /**
   * 쓰기 하나를 장부에 올려 보낸다(`write-ledger.tsx`). **잠금은 장부가 쥐고 푼다** — 성공·실패·
   * 판정 어느 쪽이든 반드시 풀리고(안 그러면 실패 한 번에 패널이 영영 잠긴다), **뒷일(`done`·
   * `verified`)이 끝난 뒤에** 풀린다. **뒷일은 네트워크를 기다리지 않는다** — 목록 다시 받기는 잠금 밖에서
   * 돈다(`refresh`). 8차부터 이월 Q·R 판까지는 다시 받기를 잠금 안에서 기다렸고, 그것이 매달리면 게시가
   * 커밋됐는데도 상자가 말없이 꺼진 채였다(리뷰 2-4 (b)).
   *
   * `verified`는 시간 안에 응답이 없어 **판정했을 때**다(이월 R) — 수정·삭제는 목록을 다시 읽고, 게시는
   * 같은 키로 다시 보낸다(`submit`). 반영되지 않았으면 그 실패를 돌려준다 — 초안·편집 칸은 남는다.
   *
   * **판정으로 끝난 쓰기는 번호 변화(`markerOps`)를 못 받았다.** 그 변화가 내 문서에 안 오는
   * 것은 **쓰기를 시작한 셸이 아직 떠 있을 때**뿐이다(`ownerLive`) — 서버가 방송에서 그 요청의
   * 연결을 빼기 때문이다. 셸이 내려갔다 새로 섰으면 새 셸은 **새 연결**이라 그 방송을 받는다
   * (Chrome 실측 — 에디터를 떠났다 온 사이 커밋된 게시의 번호가 새 스토어에 섰다). 그래서
   * 어긋났다고 말하는 것은 셸이 떠 있을 때만이다.
   */
  const perform = useCallback(
    <T, V>(op: {
      send: (client: ApiClient, openPageId: string, signal: AbortSignal) => Promise<T>
      verify: (client: ApiClient, openPageId: string, signal: AbortSignal) => Promise<V>
      done: (value: T, openPageId: string) => Promise<void> | void
      /** 판정을 화면에 옮긴다. 반영되지 않았으면 그 실패를 돌려준다 — 초안·편집 칸은 남는다. */
      verified: (verdict: V, ownerLive: boolean, openPageId: string) => Promise<Failure | null> | Failure | null
      /** 시간 안에 실패했을 때 실패 통지 **말고** 더 할 일. 없으면 통지만 한다. */
      failed?: (openPageId: string) => void
      /** 모르는 실패면 판정으로 보낸다(`write-ledger.tsx`의 `TrackedWrite.uncertain`). 게시만 준다. */
      uncertain?: (caught: unknown) => boolean
    }): void => {
      if (pageId === undefined || busy) return
      const openPageId = pageId
      void busyLock.run<T, V>({
        send: (signal) => op.send(api, openPageId, signal),
        ...(op.uncertain === undefined ? {} : { uncertain: op.uncertain }),
        verify: (signal) => op.verify(api, openPageId, signal),
        settle: async (outcome, ownerLive) => {
          try {
            if (outcome.kind === 'failed') {
              op.failed?.(openPageId)
              throw outcome.caught
            }
            if (outcome.kind === 'done') {
              await op.done(outcome.value, openPageId)
              setWriteError(null)
              return
            }
            setWriteError(await op.verified(outcome.verdict, ownerLive, openPageId))
          } catch (caught) {
            setWriteError(toFailure(caught, WRITE_FAILED))
          }
        },
      })
    },
    [api, busy, busyLock, pageId, setWriteError],
  )

  /** 지금 문서에서 그 노드에 번호가 있는가. 문서를 못 읽었으면 «없다»로 본다 — 어긋남을 말하는 쪽이다. */
  const numbered = (nodeId: string): boolean =>
    document !== null && typeof markersOf(document).get(nodeId) === 'number'

  const submit = (): void => {
    const nodeId = selectedNodeId
    const body = draft.trim()
    if (body === '' || nodeId === null) return
    const hadMarker = numbered(nodeId)
    // **같은 글이면 같은 키**(위 `POST_KEYS`). 보내기 **전에** 적는다 — 응답이 오기 전에 탭을 오가도
    // 칸이라 남고, 실패하면 그대로 남아 다시 보낼 때 실린다.
    const held = postKeys.get(nodeId)
    const idempotencyKey = held !== undefined && held.body === body ? held.key : crypto.randomUUID()
    setPostKeys((prev) => new Map(prev).set(nodeId, { body, key: idempotencyKey }))
    const post = (client: ApiClient, openPageId: string, signal?: AbortSignal): Promise<CommentCreated> =>
      client.createComment(
        projectId,
        openPageId,
        { nodeId, body, idempotencyKey },
        signal === undefined ? undefined : { signal },
      )

    /** 달렸다 — 첫 응답이든 다시 보낸 것의 응답이든 뒷일은 같다. */
    const landed = (created: CommentCreated, openPageId: string, ownerLive: boolean): void => {
      // **문서 변화를 먼저 얹는다.** 목록을 다시 받아도 번호는 그 응답에 없다 —
      // 번호는 문서의 값이다(D1). 결과를 **버리지 않는다**(리뷰 ④).
      const applied = store.applyMarkerChange(openPageId, created)
      // **바뀐 것이 없다는데 서버는 번호가 있다고 한다** — 보낼 때 내 문서의 그 노드에 번호가
      // 없었으면 어긋났다. 멱등 키의 재생이 그 길이다: 앞 게시가 번호를 붙인 응답을 못 받았다
      // (같은 셸이면 서버의 방송도 이 연결을 뺀다 — `perform`의 주석). **셸이 새로 섰으면 말하지
      // 않는다** — 앞 게시는 옛 연결로 나갔으므로 그 방송이 새 셸에 닿았다(`perform`의 주석). Chrome:
      // 게시가 매달린 동안 셸째 떠났다 와서 재생을 받은 판 — 새 셸의 번호 칸 `1` · 통지 없음. 이
      // 조건을 빼면 번호가 보이는데 «반영하지 못했습니다»가 선다. **jsdom 에는 방송이 없어 이 조건을
      // 재는 케이스가 없다** — Chrome 으로 잰 조건이다.
      const missed = created.markerOps.length === 0 && created.marker !== null && !hadMarker
      setDiverged(applied === 'diverged' || (applied === 'applied' && missed && ownerLive))
      setPostKeys((prev) => {
        const next = new Map(prev)
        next.delete(nodeId)
        return next
      })
      // 초안은 **성공한 뒤에** 비운다. 실패했는데 비우면 사용자가 쓴 말이 사라진다
      // (P4c-3 이월의 둘째 줄이 말하는 부류의 반대편이다). **보낸 노드의 것만** 비운다 —
      // 게시가 나가 있는 동안 다른 노드를 골랐어도, 다른 노드에 써 둔 초안이 있어도.
      setDrafts((prev) => withDraft(prev, nodeId, ''))
      refresh(openPageId)
    }

    perform<CommentCreated, Reposted>({
      send: (client, openPageId, signal) => post(client, openPageId, signal),
      // **판정은 같은 키로 다시 보내는 것이다**(2026-09-21 — 앞 판은 목록을 다시 읽어 «같은 노드 · 같은
      // 글 · 내가 쓴 것 · 보내기 전 목록에 없던 것»을 찾았다. 그러면 목록을 읽은 뒤 다른 곳에서 달린 같은
      // 글을 **이 게시로** 쳤다 — 리뷰 2-2, Chrome: 서버에 안 닿은 게시가 «달림»이 되고 초안이 지워졌다).
      // 서버가 앞 게시를 커밋했으면 그 행을 돌려주고(재생 200), 아니었으면 지금 커밋한다(201) — **어느
      // 쪽이든 확정이다.** 앞 게시를 서버가 아직 쥐고 있으면 다시 보낸 것은 같은 페이지 행 잠금 뒤에
      // 줄을 서서 재생을 받는다(`apps/api`의 «잠금 안에서 한 번 더 본다»).
      verify: async (client, openPageId, signal) => {
        try {
          return { posted: true, created: await post(client, openPageId, signal) }
        } catch (caught) {
          // **확정인 거절이면 «안 달림»이다**(`knownRejection`) — 같은 키 · 같은 글을 거절했다면 앞 게시도
          // 커밋될 수 없다(키가 없으니 같은 판정을 받는다). 그 밖은 모른다 — «다시 확인». **예외 하나** — 앞
          // 게시가 달렸고 그 사이 **다른 탭에서 고쳐졌으면** 409 다(서버의 재생 비교가 지금 행을 본다 —
          // `apps/api/README.md`의 «멱등 키», 이월). 그때 이 판정은 «안 달림»이 틀린다.
          if (knownRejection(caught)) return { posted: false, caught }
          throw caught
        }
      },
      // **시간 안의 모르는 실패도 판정으로 간다**(2026-09-22 — 코디네이터 판정). 앞 판은 첫 게시가 서버에
      // 닿았는데 브라우저가 502·연결 끊김을 받으면 `'failed'`라 초안이 열렸고, 고쳐 달면 새 키라 두 행이었다
      // (Chrome route). 이제 같은 키로 다시 보내 확정한다 — 그동안 상자는 잠겨 있다.
      uncertain: (caught) => !knownRejection(caught),
      done: (created, openPageId) => landed(created, openPageId, true),
      verified: (verdict, ownerLive, openPageId) => {
        // 거절됐으면 **초안과 키를 남긴다** — 같은 글을 다시 달면 같은 키다.
        if (!verdict.posted) return toFailure(verdict.caught, WRITE_FAILED)
        landed(verdict.created, openPageId, ownerLive)
        return null
      },
    })
  }

  const remove = (commentId: string): void => {
    const target = state.status === 'ready' ? state.comments.find((comment) => comment.id === commentId) : undefined
    const hadMarker = target !== undefined && numbered(target.nodeId)

    perform({
      send: (client, openPageId, signal) => client.deleteComment(projectId, openPageId, commentId, { signal }),
      verify: async (client, openPageId, signal) => {
        const at = issue()
        const comments = await client.listComments(projectId, openPageId, { signal })
        return { at, comments, gone: !comments.some((comment) => comment.id === commentId) }
      },
      done: (change, openPageId) => {
        setDiverged(store.applyMarkerChange(openPageId, change) === 'diverged')
        refresh(openPageId)
      },
      // **실패하면 목록을 다시 받는다**(리뷰 4번). «지워지지 않았습니다» 판정 뒤 서버가 앞 삭제를 늦게
      // 커밋하면, 다시 누른 삭제는 409(페이지가 이미 변경되었습니다)를 받는데 목록에는 **이미 지워진 코멘트가
      // 남아** 있었다(Chrome). 무엇이 참인지는 서버의 목록이 말한다 — 통지(409)는 그대로 둔다.
      failed: (openPageId) => refresh(openPageId),
      verified: ({ at, comments, gone }, ownerLive) => {
        setState(answered(at, { status: 'ready', at, comments }))
        if (!gone) return { kind: 'message', message: NOT_DELETED }
        // 그 노드의 마지막이었으면 서버가 번호를 지웠다 — 응답을 못 받았으니 내 문서에는 남아 있다.
        setDiverged(ownerLive && hadMarker && !comments.some((comment) => comment.nodeId === target?.nodeId))
        return null
      },
    })
  }

  const saveEdit = (commentId: string): void => {
    const body = editDraft.trim()
    if (body === '') return

    perform({
      send: (client, openPageId, signal) =>
        client.updateComment(projectId, openPageId, commentId, { body }, { signal }),
      verify: async (client, openPageId, signal) => {
        const at = issue()
        const comments = await client.listComments(projectId, openPageId, { signal })
        return { at, comments, saved: comments.find((comment) => comment.id === commentId)?.body === body }
      },
      done: (_comment, openPageId) => {
        setEditingId(null)
        refresh(openPageId)
      },
      verified: ({ at, comments, saved }) => {
        setState(answered(at, { status: 'ready', at, comments }))
        if (!saved) return { kind: 'message', message: NOT_EDITED }
        setEditingId(null)
        return null
      },
    })
  }

  const renumber = (): void => {
    perform({
      send: (client, openPageId, signal) => client.renumberComments(projectId, openPageId, { signal }),
      // **목록으로는 판정할 것이 없다** — 재번호는 표를 안 건드리고 문서만 바꾼다(D4). 다시
      // 눌러도 같은 결과이므로(서버가 그때의 문서 순서로 다시 매긴다) 두 번 반영될 것이 없다.
      // 응답을 못 받았으니 번호가 바뀌었어도 내 문서에 없다 — 그렇다고만 말한다.
      verify: async () => null,
      done: (change, openPageId) => {
        setDiverged(store.applyMarkerChange(openPageId, change) === 'diverged')
        // 목록은 다시 받지 않아도 된다 — 재번호는 **표를 안 건드린다**(D4). 번호만 바뀌고
        // 그 번호는 문서에서 읽는다.
      },
      verified: (_verdict, ownerLive) => {
        setDiverged(ownerLive)
        return null
      },
    })
  }

  if (pageId === undefined) {
    return <p className="wb-shell-panel-notice">{NO_PAGE}</p>
  }

  if (state.status === 'loading') {
    return (
      <p className="wb-shell-panel-notice" role="status">
        코멘트를 불러오는 중…
      </p>
    )
  }

  if (state.status === 'failed') {
    // **세션이 끊겼으면 오류 문장이 아니라 로그인이다**(D5) — `routes/editor.tsx`의
    // 캔버스 실패가 같은 판정을 한다. 여기서 문장만 그리면 사용자가 새로고침 말고는
    // 로그인 화면에 갈 길이 없다.
    if (state.failure.kind === 'signed-out') return <SignedOut />
    return (
      <p className="wb-shell-panel-notice" role="alert">
        {state.failure.message}
      </p>
    )
  }

  const groups = groupComments(state.comments, document)
  // 다시 받기가 **보이는 목록보다 새것일 때만** 말한다(`REFRESH`의 주석).
  const refreshNotice = refreshing !== null && refreshing.at > state.at ? refreshing : null

  return (
    <div className="wb-shell-comments">
      <form
        className="wb-shell-comment-form"
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        <label className="wb-shell-comment-label" htmlFor="wb-comment-draft">
          새 코멘트
        </label>
        <textarea
          id="wb-comment-draft"
          className="wb-shell-comment-input"
          value={draft}
          rows={3}
          // **고른 노드가 없으면 아예 쓸 수 없다.** 눌러 봐야 실패할 자리를 열어 두지
          // 않는다(P2b-2 D7과 같은 판단) — 서버도 `nodeId` 없는 본문을 400으로 막는다.
          disabled={selectedNodeId === null || busy}
          onChange={(event) => {
            if (selectedNodeId === null) return
            const text = event.target.value
            setDrafts((prev) => withDraft(prev, selectedNodeId, text))
          }}
        />
        {selectedNodeId === null && <p className="wb-shell-panel-notice">{NO_TARGET}</p>}
        <div className="wb-shell-comment-actions">
          <button
            type="submit"
            className="wb-shell-comment-submit"
            disabled={selectedNodeId === null || busy || draft.trim() === ''}
          >
            코멘트 달기
          </button>
          {/* §9의 *"문서 순서대로 재번호"* 버튼. 표는 안 건드리고 문서만 바꾼다(D4). */}
          <button type="button" className="wb-shell-comment-renumber" disabled={busy} onClick={renumber}>
            문서 순서대로 재번호
          </button>
        </div>
        {writeError !== null &&
          (writeError.kind === 'signed-out' ? (
            <SignedOut />
          ) : (
            <p className="wb-shell-panel-notice" role="alert">
              {writeError.message}
            </p>
          ))}
        <PendingNotice lock={busyLock} checking={CHECKING} unknown={UNKNOWN} />
        {/* **쓰기는 끝났고 표시만 아직이다** — 잠금과 따로 말한다(`refresh`). */}
        {refreshNotice !== null && refreshNotice.failure === null && (
          <p className="wb-shell-panel-notice" role="status">
            {REFRESHING}
          </p>
        )}
        {refreshNotice?.failure != null &&
          (refreshNotice.failure.kind === 'signed-out' ? (
            <SignedOut />
          ) : (
            <p className="wb-shell-panel-notice" role="alert">
              {refreshNotice.failure.message === REFRESH_FAILED
                ? REFRESH_FAILED
                : `${REFRESH_FAILED} — ${refreshNotice.failure.message}`}
            </p>
          ))}
        {/* **실패가 아니라 어긋남이다** — 코멘트는 저장됐고 번호만 화면에 못 얹었다.
            그래서 `alert`가 아니라 `status`이고 문안도 *"실패했다"*가 아니다. */}
        {diverged && (
          <p className="wb-shell-panel-notice" role="status">
            {DIVERGED}
          </p>
        )}
      </form>

      {/* **문서를 못 읽었으면 그렇다고 말한다**(리뷰 F). 코멘트는 그대로 보이되 번호
          자리가 비는 이유를 화면이 스스로 설명한다 — 조용히 `–`만 두면 사용자는 번호가
          없는 것으로 읽는다. */}
      {document === null && state.comments.length > 0 && (
        <p className="wb-shell-panel-notice" role="status">
          {NO_DOCUMENT}
        </p>
      )}

      {groups.length === 0 ? (
        <p className="wb-shell-panel-notice">{NO_COMMENTS}</p>
      ) : (
        <ul className="wb-shell-comment-groups">
          {groups.map((group) => (
            <li
              key={group.nodeId}
              className="wb-shell-comment-group"
              // 고른 노드의 무리에 표시를 단다. `aria-current`는 "여럿 중 지금 것"을
              // 뜻하는 표준 자리라 보조 기술도 그대로 읽는다.
              {...(group.nodeId === selectedNodeId ? { 'aria-current': true as const } : {})}
            >
              <h3 className="wb-shell-comment-group-title">
                <span className="wb-shell-comment-marker">{group.marker ?? '–'}</span>{' '}
                {/* **`'unknown'`을 `'no'`와 갈라 말한다**(리뷰 F). 문서를 못 읽었을 뿐인데
                    *"사라진 노드"*라고 적으면 화면이 거짓을 단언한다. */}
                {group.present === 'no' ? `${MISSING_NODE} (${group.nodeId})` : group.nodeId}
              </h3>
              <ul className="wb-shell-comment-list">
                {group.comments.map((comment) => (
                  <li key={comment.id} className="wb-shell-comment">
                    <p className="wb-shell-comment-author">{comment.authorName}</p>
                    {editingId === comment.id ? (
                      <>
                        <label className="wb-shell-comment-label" htmlFor={`wb-comment-edit-${comment.id}`}>
                          코멘트 수정
                        </label>
                        <textarea
                          id={`wb-comment-edit-${comment.id}`}
                          className="wb-shell-comment-input"
                          value={editDraft}
                          rows={3}
                          disabled={busy}
                          onChange={(event) => setEditDraft(event.target.value)}
                        />
                        <button
                          type="button"
                          className="wb-shell-comment-save"
                          disabled={busy || editDraft.trim() === ''}
                          onClick={() => saveEdit(comment.id)}
                        >
                          저장
                        </button>
                        <button
                          type="button"
                          className="wb-shell-comment-cancel"
                          disabled={busy}
                          onClick={() => setEditingId(null)}
                        >
                          취소
                        </button>
                      </>
                    ) : (
                      <>
                        <p className="wb-shell-comment-body">{comment.body}</p>
                        {/* **수정은 작성자만 부를 수 있다**(서버 재라 #2 — 남이 부르면
                            403이다). 눌러 봐야 실패할 버튼을 두지 않는다. */}
                        {currentUser !== null && comment.authorId === currentUser.id && (
                          <button
                            type="button"
                            className="wb-shell-comment-edit"
                            disabled={busy}
                            onClick={() => {
                              setEditingId(comment.id)
                              setEditDraft(comment.body)
                            }}
                          >
                            수정
                          </button>
                        )}
                        {/* **삭제는 editor면 누구나 한다** — 수정과 갈린다(서버 재라 #2). */}
                        <button
                          type="button"
                          className="wb-shell-comment-delete"
                          disabled={busy}
                          onClick={() => remove(comment.id)}
                        >
                          삭제
                        </button>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
