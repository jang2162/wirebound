/**
 * 우측의 코멘트 탭(설계서 「설계서 화면 구조」). **설계서에 읽는 사람이 말을 남기는 자리다.**
 *
 * ## 두 진실을 한 화면에서 합친다
 *
 * **번호는 문서에 있고 본문은 표에 있다.** 이 파일이 둘을 잇는 유일한 자리다 —
 * 코멘트의 `nodeId`로 문서에서 노드를 찾아 그 `marker`를 읽는다. 서버는 번호를 모르므로
 * 목록을 번호 순으로 주지 못한다(`created_at` 오름차순이다). **묶고 늘어놓는 것이 여기 일이다.**
 *
 * **선택한 노드의 것만 보이지 않는다.** 「설계서 화면 구조」의 그림이 *"① 검색폼 - … / ② 목록 - …"*로
 * **전부**를 보인다 — 코멘트 탭의 쓸모가 *"이 설계서에 어떤 말이 붙어 있는가"*를 훑는
 * 것이기 때문이다. 선택한 노드의 무리에는 표시를 달아 눈이 먼저 가게 한다.
 *
 * ## 무리가 셋이고, **"모른다"는 그 셋 중 하나가 아니다**
 *
 * | 무리 | 언제 | 순서 |
 * |---|---|---|
 * | 번호가 있는 노드 | 보통 | 번호 오름차순 |
 * | 번호가 없는 노드 | undo가 번호를 되돌렸다(번호를 문서에 두는 대가) | 코멘트가 달린 순서 |
 * | **문서에 없는 노드** | 코멘트가 달린 노드를 지웠다 | 코멘트가 달린 순서 |
 *
 * 셋째가 실재하는 이유는 `comments.node_id`에 FK가 없기 때문이다(노드는 테이블이 아니라
 * jsonb 안의 값이다). **감추지 않는다** — 감추면 사용자가 남긴 말이 소리 없이 사라진다.
 *
 * **그런데 문서를 아직/영영 못 읽은 상태가 따로 있다.** 그때 번호 표를 빈 표로 접으면
 * `markers.has(nodeId)`가 전부 `false`가 되어 **모든 코멘트를 셋째 무리로 단언한다** —
 * *"사라진 노드"*라고. **거짓말이고 사용자가 실제로 본다:** 페이지를 갈아탈 때마다 커밋 하나
 * 동안, 그리고 문서 조회가 실패한 뒤로는 계속.
 *
 * **`null`(못 읽었다)과 빈 값(없다)을 같은 것으로 접으면 화면이 거짓을 단언한다.**
 * **그래서 `present`가 `boolean`이 아니라 셋이다:**
 * `'yes' | 'no' | 'unknown'`. `'unknown'`이면 무엇도 단언하지 않고 그렇다고 말한다.
 *
 * ## 문서를 바꾸는 조작 셋
 *
 * 코멘트 작성·삭제·재번호는 서버에서 `marker`를 바꾸고 revision을 남긴다. 그 변화를
 * `store.applyMarkerChange`가 내 문서에 얹는다 — 그러지 않으면 캔버스에 번호가 안 뜨고
 * `headSeq`가 서버보다 뒤처진다.
 *
 * ## 탭을 오가도 쓰던 말이 남는다 — **페이지에 매인 것은 패널 밖에 든다**
 *
 * 새 코멘트 초안·고치던 코멘트를 이 패널의 `useState`로 들면 옆 탭을 한 번 눌렀다 돌아온
 * 것만으로 **경고 없이** 사라진다 — `routes/editor.tsx`가 안 보이는 탭을 DOM에서 빼기 때문이다.
 * 마운트마다 도는 이펙트가 초안을 비워도 같다. 코멘트는 **blur에 게시하면 안 되는** 글이라
 * (쓰다 만 말이 저절로 달린다) 속성 패널처럼 blur 커밋으로 막을 수도 없다 — «페이지 설명»과
 * 같은 결이다.
 *
 * 치던 중에 → 돌아와 본 상자(jsdom · Chrome):
 *
 * | 갈래 | `useState`로 들면 | 칸에 들면(지금) |
 * |---|---|---|
 * | 옆 탭 왕복 — 새 코멘트 | `""` | 초안 그대로 |
 * | 옆 탭 왕복 — 고치던 것 | 편집 칸째 닫힘 | 편집 칸과 글 그대로 |
 * | 모드 왕복(코멘트 탭을 보던 채) | 그대로 — 코멘트 탭은 두 모드에 다 있어 언마운트되지 않는다 | 같음 |
 * | 다른 노드를 고른다 | — | 상자가 그 노드의 초안이 된다(아래 «새 코멘트 초안은 노드마다 …») |
 * | 다른 페이지 → 복귀 | 버림 | 버림 — 규칙이다 |
 *
 * **고른 것 — `panel-drafts.tsx`의 칸에 든다.** «페이지 설명»과 **같은 provider**이고, 페이지가
 * 바뀌면 버리는 일(아래 조회 이펙트의 주석)도 그 provider가 **같은 자리에서 같은 값으로**
 * 한다. 두 벌의 장치를 두지 않는다.
 *
 * **초안만이 아니라 목록·쓰기 잠금·통지도 칸이다.** 초안만 올리면 저장의 생애가 마운트에
 * 남아 아래가 난다(게시를 3초 늦추고 Chrome 으로 잰 값):
 *
 * | 갈래 | 초안만 칸이면 | 목록·잠금·통지도 칸이면(지금) |
 * |---|---|---|
 * | 게시 중 탭 왕복 | 새 마운트의 상자가 **열려**(잠금이 마운트에 묶였다) 이어 쳐서 누르면 **게시가 둘 나간다** | 상자·단추가 꺼진 채다. 게시 1회, 응답 뒤 목록에 그 말이 선다 |
 * | 게시 중 옆 페이지로 | 옆 페이지의 상자가 앞 페이지의 게시 동안 **꺼져 있고**, 응답 뒤 **앞 페이지의 목록을 다시 받아 옆 페이지에 그린다** | 옆 페이지에서 바로 쓸 수 있고, 앞 페이지의 응답은 **어디에도 닿지 않는다** |
 *
 * 둘째 줄은 «페이지 설명»에서도 나는 부류다 — 다시 받기가 **게시를 시작한 렌더의
 * `pageId`**로 앞 페이지의 목록을 부른다. 케이스는 `test/panels/comment-panel.test.tsx`의
 * «탭·페이지를 오가도 …» 절이다.
 *
 * ### 새 코멘트 초안은 **노드마다** 든다 — 글은 쓴 노드에만 달린다
 *
 * 새 코멘트는 «지금 고른 노드»에 달린다(`submit`). 초안을 **한 칸**으로 들면, 쓰는 도중
 * 다른 노드를 고를 때 초안은 남고 **달릴 자리가 그 노드로 바뀐다** — 노드 X에 대해 쓴 글이
 * 노드 Y에 달린다. 코멘트 작성은 `marker`를 쓰고 revision을 남기므로 틀린 노드에 번호가 붙은
 * revision이 설계서에 남고, 수정은 본문만 바꿔 `nodeId`를 못 고친다. «페이지 설명»의
 * *"가리키는 페이지가 곧 뜻의 절반"*과 **같은 부류의 자료 오염**이다.
 *
 * | 쓰는 도중 다른 노드를 고른다 | 초안이 한 칸이면 | 노드마다면(지금) |
 * |---|---|---|
 * | 코멘트 탭에 머문 채 캔버스·트리로 | 초안이 남고 **대상이 바뀐다** | 상자가 **그 노드의 초안**(없으면 빈 칸)이 된다. 돌아오면 쓰던 글이 원래 노드를 대상으로 그대로 있다 |
 * | 속성 탭을 다녀오며 | 초안이 남고 **대상이 바뀐다** — 탭 왕복에 초안을 살리는 칸이 **여는 길**이다 | 같음(위 줄) |
 *
 * (지금 = jsdom 케이스 *"쓰던 코멘트는 쓴 노드에만 달린다 …"*와 Chrome — 두 길 다 상자가 빈 칸이
 * 됐다가 원래 노드로 돌아오면 글이 서고, 달면 DB 에 `n-tree:트리에 대해 쓴 말` 한 행.)
 *
 * 초안을 버리지 않는 근거인 *"쓰다가 옆 노드를 확인하는 일이 흔하다"*가 바로 대상이 바뀌는
 * 조작이다. 그 조작은 **초안을 옮기지 않고 칸을 바꾼다** — 옆 노드를 보고 돌아오면 쓰던 글이
 * 그대로다. **고른 노드의 무리에 붙는 표시만으로는 대상이 바뀐 것이 안 보인다** — 새 대상에
 * 코멘트가 이미 있을 때만 표시가 옮겨 가고, 없으면 표시가 사라질 뿐 새 대상을 가리키지 않는다.
 * 그래서 상자의 글이 그 노드의 것으로 바뀌고, 폼이 «달 곳: 번호 타입 (id)»를 말한다(`targetOf` —
 * 뷰 모드에는 아웃라인이 없어 폼 말고는 대상이 안 보인다).
 *
 * **페이지가 바뀌면 노드마다의 초안도 한 칸째 버린다** — 노드 id 는 그 페이지 안에서만 뜻이
 * 있다. «페이지 설명»의 초안 버리기와 이 규칙이 **같은 자리에서 같은 값으로** 돈다(`DRAFTS`가
 * 방문의 칸 하나다). 게시가 나가 있는 동안 다른 노드를 골라도 응답은 **보낸 노드의 초안만** 비운다.
 *
 * ### 잠금이 막지 못하는 길 둘 — 페이지 왕복 잠금만으로는 못 막고, 놓치면 **한 번호에 두 행**이 선다
 *
 * `BUSY`는 페이지 왕복에도 남지만(`panel-drafts.tsx`의 「잠금만은 그 페이지에 매단다」) 그것만으로는 아래 둘을 못
 * 막는다(막는 장치는 각 항목의 끝). 둘 다
 * 끝에 보이는 것이 같다 — **목록에 방금 단 말이 없고 잠금은 풀려 있다.** 사용자가 다시 달면
 * 같은 노드에 같은 말이 두 행 선다(`BUSY`의 주석이 막으려는 바로 그 상태다). jsdom 케이스는 없다.
 *
 * 1. **provider 째 내려가는 길.** 잠금을 provider 에 들면, 게시가 나가 있는 동안 프로젝트 목록을
 *    다녀올 때 잠금이 provider와 함께 사라져 돌아온 상자가 열려 있다. 거기서 다시 달고 앞 게시의
 *    응답이 늦게 오면 DB 에는 두 행이 있고 화면 목록에는 한 행만 보인다.
 *
 *    **막는 것:** 잠금은 에디터보다 오래 사는 장부(`write-ledger.tsx`)에
 *    들고, 게시 뒤의 다시 받기는 새로 선 방문에 닿는다. Chrome(프로젝트 목록 왕복): 돌아온 상자·
 *    단추가 **꺼져 있고**, 앞 게시의 응답이 오면 화면 목록 1행 · DB 1행 · 번호 1(새 셸의 실시간 연결이
 *    서버의 방송을 받아 새 스토어에 번호가 선다). 코멘트 수정도 화면·DB 가 같은 값(`"첫째 수정"`).
 *    응답이 영영 안 오면 10초 뒤 **같은 키로 다시 보내** 판정한다(`submit`의 `verify`) — 서버가 앞 게시를
 *    쥐고 있으면 다시 보낸 것이 같은 행 잠금 뒤에 줄을 서서 재생을 받는다. 그동안 상자는 잠겨 있어
 *    고쳐 다시 달 수도, 떠났다 와서 새로 칠 수도 없다. 시간 안의 **모르는 실패**도 같은 판정으로 간다(무엇이
 *    모르는 실패인지는 `knownRejection`의 표가 소유한다). **남는 입구는 초안과 키가 함께
 *    버려지는 길이다** — 새로고침 · 세션 만료는 초안과 키를 탭의 저장소에 비춰 막고(
 *    `panel-drafts.tsx` 「저장소에 비춘다」), 명시적 로그아웃은 일부러 지운다. **입구의 목록과 값은 `write-ledger.tsx`의
 *    «이것이 막지 못하는 것»이 소유한다** — 여기 옮겨 적지 않는다(옮겨 적으면 그 목록과 갈린다).
 * 2. **타이밍 창.** 가 → 나 → 가로 돌아와 건 목록 조회가 **게시가 커밋되기 전에 읽고, 게시 뒤의
 *    다시 받기보다 늦게** 오면, 다시 받기가 세운 목록(방금 단 말이 있다)을 덮는다 — 같은 페이지라
 *    조회 이펙트의 `alive`가 참이다. 방금 단 말이 목록에서 사라지고 잠금은 이미 풀려 있다.
 *
 *    **막는 것: 목록 칸은 늦게 *낸* 조회의 답만 받는다**(`issue`·`answered`). 다시 받기가
 *    잠금 밖이라(`refresh`) 다시 받기끼리도 도착 순서가 뒤집힐 수 있어서 선
 *    규칙인데, 돌아와 건 조회는 게시의 응답 **전에** 나가므로 같은 규칙에 걸린다. Chrome(route — 돌아와
 *    건 GET 을 곧바로 서버에서 읽히고 답만 붙잡았다): 게시 커밋 → 다시 받기가 `"매달린 말"`을 세움 →
 *    그 뒤 낡은 답(빈 표)이 와도 목록 그대로 · DB 1행. 붙잡힌 동안 그 방문은 «코멘트를 불러오는 중…»이다.
 *
 * ## 이 패널은 오류 경계 밖이다
 *
 * `apps/web/src`의 오류 경계는 캔버스의 `CanvasBoundary`와 테마 갤러리의 `GalleryBoundary`뿐이고
 * 이 패널은 어느 쪽 안에도 없다. 그래서 여기서 예외가
 * 새면 셸 전체가 흰 화면이 된다 — `panels/property-panel.tsx`가 같은 이유로 `nodeType`
 * 가드를 들고 있다. 이 파일이 그리는 값은 전부 문자열이고(모양 가드가
 * `api/http-client.ts`의 `SHAPES.comment`에서 이미 끊는다), 문서 순회는 던지지 않는
 * `walkSafely`를 쓴다.
 */
import { useCallback, useEffect, type ReactElement } from 'react'
import type { PageDocument } from '@wirebound/schema'
import { useApi } from '../api/context'
import { refusedBeforeCommit, SignedOut, toFailure, type Failure } from '../api/failure'
import { ApiError, type ApiClient } from '../api/client'
import { isSessionUserChanged } from '../api/known-user'
import type { WriteConclusion, WriteNote } from './write-ledger'
import type { Comment, CommentCreated } from '../api/types'
import { walkSafely } from '../edit/safe-walk'
import { nodeTypeLabel } from './node-shape'
import { useRealtimeSetup } from '../realtime/context'
import { useSessionUser } from '../session/session-context'
import { useEditorStore, useEditorStoreInstance, useOpenDocument } from '../store/use-editor-store'
import { lockSlot, slotsOf, usePanelLock, usePanelSlot } from './panel-drafts'
import { MissedNotice, PendingNotice } from './pending-notice'

/** 이 모듈의 칸을 선언한다 — 같은 모듈이 다시 불리면(HMR) 같은 칸을 돌려준다(`panel-drafts.tsx`의 `slotsOf`). */
const slot = slotsOf(import.meta.url)

/** 페이지를 열지 않았을 때. */
const NO_PAGE = '페이지를 열면 코멘트가 보입니다'
/** 코멘트가 하나도 없을 때. */
const NO_COMMENTS = '아직 코멘트가 없습니다'
/** 노드를 고르지 않아 새 코멘트를 달 수 없을 때. */
const NO_TARGET = '코멘트를 달 노드를 캔버스나 구조 트리에서 고르세요'
/** 새 코멘트가 달릴 노드의 머리(`targetOf`). */
const TARGET = '달 곳'
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
/** 문서를 못 읽어 번호를 붙일 수 없을 때. **"사라진 노드"라고 단언하지 않는다**(`Group.present`). */
const NO_DOCUMENT = '문서를 읽지 못해 번호를 보일 수 없습니다'
/** 서버는 번호를 바꿨는데 내 문서에 얹지 못했을 때(`MARKERS_DIVERGED`). */
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
 * 게시가 **이미 달렸고 그 뒤 고쳐졌다**(`keyVerdict`). 실패가 아니다 — 목록의 글이 지금 글이다. 초안과 키는
 * 버렸다.
 */
const EDITED_SINCE = '이 글은 이미 달렸고, 그 뒤 다른 곳에서 고쳐졌습니다 — 목록의 글이 지금 글입니다'
/**
 * 게시가 **이미 달렸고 그 뒤 지워졌다**(`keyVerdict`). 실패가 아니다 — 초안과 키는 버렸다. **누가
 * 지웠는지 말하지 않는다** — 서버도 모른다(묘비는 지운 사람을 적지 않는다. 제 손 · 남의 손 · 복원이 같은 답이다).
 */
const DELETED_SINCE = '이 글은 이미 달렸고, 그 뒤 지워졌습니다'

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

/**
 * 게시가 **달렸다** — 이 요청이 달았거나 재생을 받았다(`created`), 또는 **그 키의 게시가 이미 달렸고 그 뒤
 * 고쳐졌다 · 지워졌다**(`edited-since` · `deleted-since` — `keyVerdict`). 셋 다 «달림»이다.
 */
type Posted = { kind: 'created'; created: CommentCreated } | { kind: KeyVerdict }

/** 게시를 같은 키로 다시 보낸 결과(`submit`의 판정). 거절은 `knownRejection`의 `'resent'` 칸인 것뿐이다 — 그 밖은 모른다. */
type Reposted = { posted: true; result: Posted } | { posted: false; caught: unknown }

/**
 * **이 이슈 코드가 실린 409 는 «그 키의 게시는 이미 달렸고 그 뒤 고쳐졌다»다.** 서버는
 * 같은 키에 다른 글이 오면 409 를 내는데(`apps/api/README.md`의 «멱등 키»), 이 화면은 글을 고치면 새 키를 짓는다
 * (`POST_KEYS`) — 같은 키 · 다른 글이 되는 길은 **앞 게시가 달린 뒤 그 행이 고쳐진** 판뿐이다(같은 사람이 다른
 * 탭에서 고쳤다). 게시가 내는 409 는 이슈 코드가 있는 둘(`idempotency-key-reused` · `idempotency-key-deleted`)뿐이지만
 * 둘 다 `code`가 `conflict`라 **이슈 코드로만** 가른다 — 문장으로 가르지 않는다.
 *
 * **가르는 자리는 여기 하나이고, 받는 자리도 하나다**(`submit`의 `post`) — 첫 보내기와 다시 보낸 것(판정)이 같은
 * 함수를 지난다. 그래서 이 409 는 `knownRejection`의 표에 오지 않는다(그 표는 «안 달림»·«모름»을 가른다).
 *
 * 이것을 «안 달림»으로 확정하면 **초안과 키가 남는다.** 초안은 탭의 저장소에 비치므로 새로고침
 * 마다 같은 글 · 같은 키가 되살아나 누를 때마다 409 다(Chrome: 게시 «모름» → 새로고침 → 다른 탭이
 * 그 코멘트를 고침 → 되살린 글 달기 → 409 · 상자에 글 · 저장소에 키 · DB 는 고친 글 1행).
 */
/**
 * **그 키의 게시는 달렸다가 그 뒤 지워졌다.** 서버는 키가 있던 행을 지울 때 그 키를 기억하고
 * (`apps/api/src/db/migrations/0013-comment-tombstones.ts`) 같은 키가 다시 오면 새 행을 세우지 않고 위와 같은 꼴의
 * 409 에 이 이슈 코드를 싣는다. 키를 기억하지 않으면 그 사이 행이 지워졌을 때 같은 키 재전송이 **새 행을 세운다**(지운
 * 말이 되살아남 · 통지 없음). 이 409 도 «안 달림»이 아니다 — 확정으로 받으면 초안과 키가 남아, 누를 때마다 같은 409 다.
 */
type KeyVerdict = 'edited-since' | 'deleted-since'
const KEY_VERDICTS: Readonly<Record<string, KeyVerdict>> = {
  'idempotency-key-reused': 'edited-since',
  'idempotency-key-deleted': 'deleted-since',
}

/** 키를 보고 낸 409 면 그 판정, 아니면 `null`이다. **이슈 코드로만** 가른다 — 문장으로 가르지 않는다. */
function keyVerdict(caught: unknown): KeyVerdict | null {
  if (!(caught instanceof ApiError) || caught.code !== 'conflict') return null
  for (const issue of caught.issues) {
    const verdict = issue.code === undefined ? undefined : KEY_VERDICTS[issue.code]
    if (verdict !== undefined) return verdict
  }
  return null
}

/**
 * 게시의 실패가 **안 달렸다고 확정할 수 있는** 실패인가 — **무엇에 대해 묻는가**로 칸이 갈린다. 첫 보내기의
 * 실패(`uncertain` — `'sent'`)는 **그 요청 자신이** 커밋됐는가를, 같은 키로 다시 보낸 것의 실패(`verify` —
 * `'resent'`)는 **앞 게시가** 달렸는가를 묻는다. **두 칸의 가름은 이 표 하나가 소유한다** — 두 자리가 따로
 * 가르면 한쪽만 낡는다(`write-ledger.tsx`·`apps/api/README.md`의 «멱등 키»는 여기를 가리킨다). **첫 보내기 칸은 멱등 키와
 * 무관한 «그 요청이 커밋됐나»라서 편집 전송의 실패도 같은 함수로 가른다**(`api/failure.tsx`의 `refusedBeforeCommit`).
 *
 * | 실패 | 첫 보내기(`'sent'`) — 이 요청이 커밋됐나 | 다시 보낸 것(`'resent'`) — 앞 게시가 달렸나 |
 * |---|---|---|
 * | 4xx | **확정 안 됨** — 서버가 커밋 전에 거절했다 | **확정 안 달림** — 서버가 **이 키로 내 행을 찾아보고** 거절했다(키 판정이 권한 가드 앞이다) |
 * | **api 가 낸 500**(오류 봉투가 있다 — `ApiError.enveloped`) | **확정 안 됨** — 핸들러가 던진 것이고 커밋 전이다(아래) | **모른다** — 서버가 키를 **보기 전이나 도중에** 던졌을 수 있다. 그러면 앞 게시에 대해 아무것도 말하지 않는다(아래) |
 * | 연결 실패 · 502·503·504 · **봉투 없는 500** | **모른다** — 요청이 서버에 닿아 커밋됐을 수 있다 | **모른다** |
 * | **api 가 낸 503**(봉투가 있다) | **모른다** — DB 가 답하지 않았다(COMMIT 의 답을 잃었을 수 있다) | **모른다** |
 * | **409 `session-user-changed`**(쿠키의 사람이 다르다) | **확정 안 됨** — 인증 훅의 거절이다 | **모른다** — 키를 보기 전의 거절이다 |
 *
 * 401 은 두 칸 다 4xx 줄로 가지만 «안 달림»이 아니라 **«세션 끝»**이 된다 — `toFailure`가 로그인 화면으로
 * 바꾼다(`api/failure.tsx`). **이슈 코드 `idempotency-key-reused` · `idempotency-key-deleted`가 실린 409 는 이 표에 오지
 * 않는다** — 두 칸 다 «달림»이고, `submit`의 `post`가 먼저 받는다(`keyVerdict`).
 *
 * **봉투 500 이 두 칸에서 갈리는 까닭.** 두 자리가 한 칸을 쓰면 다시 보낸 것의 봉투 500 도 «안 달림»이
 * 된다. 그 500 이 «그 요청은 커밋 전»인 것은 참이지만, `verify`가 묻는
 * 것은 **앞 게시**다. 서버는 키를 가드 앞 재생(`findCommentByIdempotencyKey`·`findPageById`) · 가드의
 * `findMembership` · 핸들러의 `loadDocument`·`lockPageForEdit` 뒤에야 보므로(`apps/api/README.md`의 «멱등
 * 키») 그 사이의 DB 오류는 키를 못 본 답이다. Chrome(route + DB 오류 모델 — 첫 POST 를 서버에 보내 커밋시키고
 * 그 사이 `comments` 표 이름을 1.5s 바꾼 뒤 브라우저에는 502): 첫 게시 201 · DB 1행 → 다시 보낸 것이 가드 앞
 * 재생의 질의에서 봉투 500 → alert «응답이 없고, 반영됐는지 확인하지도
 * 못했습니다» · 상자·단추 **꺼짐** · «다시 확인» 1 → 표 이름이 돌아온 뒤 누르면 같은 키 **200(재생)** · 초안 비움 ·
 * 목록 `["밥의 말"]` · 장부 `[]` · **DB 1행**. 이 한 줄(`asked === 'sent'`)만 떼면 같은 절차에서 alert «서버 오류가
 * 발생했습니다» · 상자 열림 · «다시 확인» 없음 · 목록 `[]` → 고쳐 달면 **DB 두 행**이다.
 *
 * **4xx 줄은 서버의 판정 순서에 매여 있다 — 그 순서와 예외는 `apps/api/README.md`의 «멱등 키»가 소유한다.**
 * 서버는 인증 뒤 · 권한 앞에서 키를 본다. 키 판정이 권한 가드 **뒤**면, 첫 게시가 커밋된 뒤 역할이 내려가거나
 * 멤버에서 빠질 때 다시 보낸 것이 재생에 못 닿고 403·404 를 받는다 — 이 표가 그것을 «안 달림»으로 확정하고,
 * 권한을 되찾아 고쳐 달면 DB 두 행이다(Chrome route). 401 은 키 판정보다 먼저다(«세션
 * 끝»으로 가는 것은 위 표 아래).
 *
 * **«api 가 낸 500 은 커밋 전이다»의 근거는 코드다**(`apps/api/src/routes/comments.ts`의 게시 핸들러). 커밋
 * (`runWrite`가 끝난 것) 뒤에 도는 것은 셋이다: `notifyMarkerChange` — 방송은 `async`인 `broadcast.send`이고
 * 실패를 `.catch`로 삼킨다(`ws/notify.ts`) · 그 인자의 `requestEventActor` — 번호를 붙이는 갈래에서는 이미
 * 트랜잭션 **안에서** 같은 요청으로 `requestActor`를 불렀다(같은 값이라 여기서 새로 던질 길이 없다), 번호가
 * 있던 갈래는 `markerOps`가 비어 이 호출 전에 돌아간다 · 응답 객체 — 문자열·수뿐이라 직렬화가 던지지 않는다.
 * 핸들러 뒤에 도는 훅(`onSend`·`onResponse`)은 없다(`addHook`은 `onRoute`·`onRequest`뿐).
 *
 * **그런데 브라우저가 받은 500 이 늘 api 의 것은 아니다.** Vite 개발 프록시는 api 가 요청을 쥔 채 죽으면
 * `500 text/plain` 빈 본문을 준다(잰 값 — 행 잠금으로 게시를 막아 둔 채 api 프로세스를 내렸다: 1.5s 에
 * `500` · 본문 `""`). 그 판은 롤백됐지만 **커밋 직후에 죽어도 같은 모양**이다. 그래서 가르는 것은 숫자만이
 * 아니라 **봉투**다 — api 가 직접 낸 오류는 늘 봉투를 싣는다.
 *
 * **봉투가 있어도 500 이어야 한다 — 숫자도 본다.** 커밋 뒤에 던지는 자리가 없다는 위의 말은
 * **DB 가 COMMIT 에 답했을 때**의 말이다. COMMIT 은 커밋됐는데 그 답을 잃는 판이 있고, api 는 그때 죽지 않고
 * **봉투를 실은 503** 으로 낸다.
 * 무엇이 «DB 가 답하지 않았다»인지는 `apps/api/src/db/connection-loss.ts`가 소유한다. Chrome(COMMIT 응답만 떨구는
 * TCP 프록시)의 값은 그 파일이 든다.
 */
function knownRejection(caught: unknown, asked: 'sent' | 'resent'): boolean {
  // **첫 보내기 칸은 쓰기 전체의 «모름» 판정 그대로다**(`api/failure.tsx`의 `refusedBeforeCommit` — 편집 전송도 그것을 부른다).
  if (asked === 'sent') return refusedBeforeCommit(caught)
  if (!(caught instanceof ApiError)) return false
  // **«쿠키의 사람이 다르다»(409 `session-user-changed`)는 키를 보기 전의 거절이다**(서버는 인증 훅에서, 키 판정보다
  // 앞에서 낸다). 첫 보내기에는 «그 요청은 커밋 전»이 참이지만, 다시 보낸 것에는 앞 게시에 대해 아무것도 말하지 않는다 — 모른다.
  if (isSessionUserChanged(caught)) return false
  return caught.status >= 400 && caught.status < 500
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
 * 그것이 실패했으면 그 실패다. `null`이면 말할 것이 없다. 다시 받기는 **자기 번호가 칸에 있을 때만** 칸을
 * 고친다 — 게시 둘의 다시 받기가 겹치면 앞 것의 답이 뒤 것의 «도는 중»을 지우거나(방금 단 말이 없는 목록이
 * 말없이 선다) 앞 것의 실패가 뒤 것이 도는 동안 선다(jsdom 케이스 *"다시 받기가 둘 겹쳐 …"* 둘). **그 길은 실제
 * 화면에서 열린다** — Chrome(route: 목록 GET 을 서버에 곧바로 보내고 응답만 붙잡았다): 게시 1 이 201 을 받은 뒤
 * 다시 받기의 응답이 붙잡힌 채 상자·단추가 풀려 있어 0.3s 뒤 게시 2 가 나갔고(201), 다시 받기 둘이 함께 붙잡혔다.
 * 앞 것만 풀면 목록 `[첫째]` · «다시 불러오는 중» 남음, 뒤 것까지 풀면 `[첫째, 둘째]` · 말 없음.
 *
 * **말하는 것은 그 번호가 보이는 목록보다 새것일 때뿐이다**(아래 그리는 자리). 다시 받기가 매달린 채 탭을
 * 오가 새 조회가 목록을 세우면, 매달린 것은 이미 낡았다 — «다시 불러오는 중»이 남으면 거짓이다(Chrome: 탭
 * 왕복 뒤 목록에 방금 단 말이 서 있는데 그 문장이 남았다).
 */
const REFRESH = slot<{ at: number; failure: Failure | null } | null>('comments/refresh', null)
/**
 * 쓰기 중에는 조작을 막는다. 같은 코멘트가 두 번 나가면 번호는 하나인데 행이 둘이 된다.
 *
 * **잠금 칸이다** — 페이지를 떠났다 돌아와도 그 쓰기가 끝나기 전에는 풀리지 않는다(
 * 리셋에 버려지면, 가 → 나 → 가로 돌아와 쓰던 새 코멘트가 앞 게시의 응답에
 * 비워지고 고치던 **다른** 코멘트의 편집 칸이 앞 수정의 응답에 닫힌다. `panel-drafts.tsx`의
 * 「잠금만은 그 페이지에 매단다」). **값은 장부에 든다**(`write-ledger.tsx`) — 에디터를 떠났다 와도 풀리지 않는다.
 */
const BUSY = lockSlot('comments/busy')
/** 마지막 쓰기 실패. **성공하면 지운다** — 남아 있으면 방금 한 조작도 실패한 것으로 읽힌다. */
const WRITE_ERROR = slot<Failure | null>('comments/write-error', null)
/**
 * **서버는 번호를 바꿨는데 내 문서에 얹지 못했다**(`applyMarkerChange`가
 * `'diverged'`를 냈다). 서버가 센 경로가 내 바탕에 없는 경우다 — 보내지 않은 편집은 까닭이 아니다(스토어가 번호를 바탕에 얹고
 * 그 편집을 위에 다시 얹는다 — `#applyMarkerOps`).
 *
 * **버리지 않고 말한다.** 버리면 *"코멘트는 달렸는데 캔버스에 번호가 없고 아무도 그것을
 * 말하지 않는"* 상태가 된다 — «못 했다»를 «할 것 없다»로 접는 부류(머리말 «무리가 셋이고»)의 형태다.
 * **`'skipped'`는 말하지 않는다** — 그때는 화면이 이미 다른 페이지를 보고 있다. **`'waiting'`도 말하지 않는다** — 사이
 * 프레임이 오면 스토어가 얹고, 끝내 안 오면 스토어가 낡음으로 말한다(`shell/remote-alert.tsx`).
 */
const MARKERS_DIVERGED = slot<boolean>('comments/diverged', false)
/** 게시가 **이미 달렸고 그 뒤 고쳐졌다 · 지워졌다**(`keyVerdict`) — 통지다. 다음 게시가 달리면 지운다. */
const LANDED_SINCE_NOTICE = slot<KeyVerdict | null>('comments/landed-since', null)
/**
 * 새 코멘트 초안 — **노드마다**(위 머리말 «새 코멘트 초안은 노드마다 …»). 키는 노드 id이고 없으면
 * 빈 칸이다. **한 칸으로 들면 다른 노드를 고르는 순간 쓰던 글의 대상이 그 노드로 바뀐다.**
 */
const DRAFTS = slot<ReadonlyMap<string, string>>('comments/drafts', new Map(), {
  // **저장소에 비춘다**(`panel-drafts.tsx`의 「저장소에 비춘다」) — 노드 id → 글의 짝 목록으로.
  save: (drafts) => (drafts.size === 0 ? undefined : [...drafts]),
  load: (raw) => {
    const pairs = pairsOf(raw, (text): text is string => typeof text === 'string' && text !== '')
    return pairs === undefined ? undefined : new Map(pairs)
  },
})
/**
 * 새 코멘트 게시의 **멱등 키** — 노드마다, **그 글에** 매인다(`apps/api/README.md`의 «멱등 키»).
 *
 * 응답이 없어 «안 달림»으로 판정한 게시를 서버가 늦게 커밋할 수 있다(잰 값은 `write-ledger.tsx`의 머리말
 * «판정 뒤의 늦은 커밋»이 든다). 키가 없으면 그 사이 사용자가 다시 달 때 같은 글이 두 행이 된다. **같은 초안은 같은 키를 싣고**
 * 서버가 같은 키면 앞 행을 돌려주므로 한 행으로 합쳐진다.
 *
 * | 언제 | 키 |
 * |---|---|
 * | 그 노드의 글을 처음 보낸다 | 새로 짓는다(`crypto.randomUUID()` — `store/editor-store.ts`의 `clientOpId`와 같은 출처) |
 * | 응답이 없어 **판정한다** | **같은 키로 다시 보낸다** — 그것이 판정이다(`submit`의 `verify`) |
 * | 실패·거절 뒤 **같은 글**을 다시 보낸다 | **같은 키** |
 * | 글을 고쳐 보낸다 | **새 키** — 고친 글은 다른 게시다. 같은 키로 보내면 서버가 409 로 막는다 |
 * | 달렸다(응답 · 다시 보낸 것의 응답) | **버린다** — 같은 말을 일부러 또 다는 것은 새 게시다 |
 * | 다른 페이지를 연다 | 초안과 **함께** 버려진다(방문의 칸이다 — `panel-drafts.tsx`의 머리말 «한 값이 두 일을 한다»의 1) |
 * | 새로고침 · 세션 만료 · 에디터를 떠났다 **같은 페이지로** | 초안과 **함께** 산다(탭의 저장소 — `panel-drafts.tsx`의 「저장소에 비춘다」) |
 * | 명시적 로그아웃 | 초안과 **함께** 지워진다(`draft-store.tsx`) |
 *
 * **초안 쪽에 든다 — 장부가 아니다.** 키의 수명은 그 초안의 수명이다. 장부는 에디터를 떠나도
 * 살아, 거기 들면 초안이 버려진 뒤에도 키가 남는다 — 돌아와 같은 글을 새로 쳐 달면 앞 게시로
 * 합쳐진다. 일부러 같은 말을 다시 다는 사람의 게시가 사라지는 길이다. 대가도 적어 둔다: **다른 페이지를
 * 열었다** 오는 사이 늦게 커밋된 게시는 돌아와 새로 친 같은 글과 **합쳐지지 않는다**(새 키다). 시간 초과와 모르는
 * 실패의 판에서는 판정(같은 키로 다시 보내기)이 끝날 때까지 상자가 잠겨 있어 이 길이 안 선다 — 확정 실패
 * (`knownRejection`) 뒤라면 앞 게시가 안 달린 것이 확정이라 새 키여도 한 행이다(칸마다의 까닭과 예외는
 * `knownRejection`의 주석이 가리킨다). 서는 것은 **초안과 키가 함께 버려지는 입구** 뒤다(명시적 로그아웃 ·
 * 다른 페이지. 목록은 `write-ledger.tsx`의 «이것이 막지 못하는 것»).
 */
const POST_KEYS = slot<ReadonlyMap<string, { body: string; key: string }>>('comments/post-keys', new Map(), {
  // **키도 초안과 함께 저장소에 비춘다** — 셸이 죽었다 와도 같은 글이면 같은 키다.
  save: (keys) => (keys.size === 0 ? undefined : [...keys]),
  load: (raw) => {
    const pairs = pairsOf(
      raw,
      (held): held is { body: string; key: string } =>
        typeof held === 'object' &&
        held !== null &&
        typeof (held as { body?: unknown }).body === 'string' &&
        typeof (held as { key?: unknown }).key === 'string',
    )
    return pairs === undefined ? undefined : new Map(pairs.map(([nodeId, held]) => [nodeId, { body: held.body, key: held.key }]))
  },
})
/** 지금 고치고 있는 코멘트의 id. `null`이면 아무것도 안 고치는 중이다. 저장소에 비춘다(위 `DRAFTS`). */
const EDITING_ID = slot<string | null>('comments/editing-id', null, {
  save: (id) => id ?? undefined,
  load: (raw) => (typeof raw === 'string' ? raw : undefined),
})
/** 고치던 코멘트의 초안. 저장소에 비춘다(위 `DRAFTS`). */
const EDIT_DRAFT = slot<string>('comments/edit-draft', '', {
  save: (text) => (text === '' ? undefined : text),
  load: (raw) => (typeof raw === 'string' ? raw : undefined),
})

/**
 * 저장소에서 읽은 `[노드 id, 값]` 짝 목록 — **모양이 틀리면 칸째 버린다**(`undefined`). 짝 하나만 틀려도
 * 버리는 것은, 반만 되살린 초안이 온전해 보이면 나머지를 잃은 것을 아무도 모르기 때문이다.
 */
function pairsOf<V>(raw: unknown, valid: (value: unknown) => value is V): [string, V][] | undefined {
  if (!Array.isArray(raw)) return undefined
  const pairs: [string, V][] = []
  for (const pair of raw) {
    if (!Array.isArray(pair) || pair.length !== 2 || typeof pair[0] !== 'string' || !valid(pair[1])) return undefined
    pairs.push([pair[0], pair[1]])
  }
  return pairs
}

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
   * 노드가 문서에 있는가. **`boolean`이 아닌 것이 요점이다**(머리말 «무리가 셋이고») —
   * `'unknown'`은 *"문서를 못 읽어서 모른다"*이고 `'no'`(*"문서에 없다"*)와 다른 말이다.
   */
  present: 'yes' | 'no' | 'unknown'
  comments: Comment[]
}

/**
 * 문서에서 노드 id → `marker` 표를 만든다. **`walkSafely`를 쓴다** — 검증 전 문서가
 * 스토어에 실릴 수 있고, `walkNodes`는 `children` 안의 노드 아닌 원소에서 던진다
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
  // **문서가 없으면 `null`을 그대로 들고 간다** — 빈 표로 접으면 모든 노드가 "없다"가 된다(머리말 «무리가 셋이고»).
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

/**
 * **새 코멘트가 달릴 노드를 폼이 말한다.** «새 코멘트» 상자만으로는 어느 노드에 다는지가
 * 안 보인다 — 편집 모드에서는 캔버스의 아웃라인이 그것을 보이지만, **뷰 모드에는 아웃라인이 없고**(`canvas.tsx`의
 * `outlinedNodeId`) 캔버스를 눌러도 선택이 안 바뀐다. 폼이 말하지 않으면(Chrome): 편집 모드에서 본문을 고르고
 * 뷰 모드로 가 제목을 누른 뒤 달면 **본문에** 달리고(DB `n_ga_body`), 화면은 어느 쪽인지 한 번도 말하지 않는다.
 *
 * **값은 초안의 열쇠와 같은 하나다** — 고른 노드(`selectedNodeId`). 상자가 보이는 초안(`DRAFTS`의 키)도, 달 곳(`submit`)도
 * 그것이다(머리말 «새 코멘트 초안은 노드마다 …»). 다른 자리(아웃라인 · 호버)에서 읽으면 말하는 대상과 달리는 대상이 갈린다.
 *
 * **이름은 화면이 이미 쓰는 둘이다** — 번호와 id 는 아래 목록의 무리 머리가(`groupComments` — 번호가 없으면 `–`),
 * 타입은 구조 트리가 쓰는 것이다(`nodeTypeLabel`). 새 이름 체계를 짓지 않는다. 문서를 못 읽었거나 그 노드가 문서에
 * 없으면 id 만 말한다 — 모르는 번호·타입을 지어내지 않는다(`Group.present`의 `'unknown'`과 같은 결).
 */
function targetOf(document: PageDocument | null, nodeId: string): string {
  if (document !== null) {
    for (const visit of walkSafely(document.root)) {
      if (visit.node.id !== nodeId) continue
      const marker = visit.node.marker
      const numbered = typeof marker === 'number' && Number.isInteger(marker) ? String(marker) : '–'
      return `${TARGET}: ${numbered} ${nodeTypeLabel(visit.node)} (${nodeId})`
    }
  }
  return `${TARGET}: ${nodeId}`
}

export function CommentPanel(props: {
  projectId: string
  pageId: string | undefined
  /**
   * 코멘트를 달고 · 고치고 · 지우고 · 재번호할 수 있는가 — 셸의 `canEdit`(`projectAbilities(role).editDesign`).
   * `false`면 **폼과 줄마다의 «수정» · «삭제»가 없다**(셸 `canEdit`의 표 «동작 입구»). 목록 · 번호 · 달 곳은 그대로 읽힌다 —
   * 설계서 「권한 모델」의 viewer *"편집·코멘트 모두 불가"* 는 **다는 것**이지 읽는 것이 아니다.
   */
  canEdit: boolean
}): ReactElement {
  const api = useApi()
  const store = useEditorStoreInstance()
  // 지금 연결의 id 를 읽는 자리 — 게시가 그것을 **보낼 때** 잡아 다시 보낼 때도 싣는다(`submit`).
  const connections = useRealtimeSetup()?.holder
  // **남의 코멘트는 고칠 수 없다**(서버가 막는다). `null`이면 아직 누구인지 모르는
  // 것이므로 수정 단추를 하나도 안 낸다 — 서버가 어차피 403으로 막는다.
  const currentUser = useSessionUser()
  // 문서는 `useOpenDocument`로 받는다 — 스토어의 문서가 **지금 주소의 것**일 때만 쓴다.
  const document = useOpenDocument(props.pageId)
  const selectedNodeId = useEditorStore(store, (s) => s.selectedNodeId)

  // **일곱 다 칸이다**(위 `LIST` 선언의 주석). 아래 쓰기 함수들은 **이 렌더의 페이지를 단다** —
  // 응답이 오기 전에 탭을 오갔으면 지금 떠 있는 본문에 닿고, 페이지를 옮겼으면 어디에도
  // 안 닿는다(`panel-drafts.tsx`의 머리말).
  const [state, setState] = usePanelSlot(LIST)
  const busyLock = usePanelLock(BUSY)
  const busy = busyLock.locked
  const [writeError, setWriteError] = usePanelSlot(WRITE_ERROR)
  const [diverged, setDiverged] = usePanelSlot(MARKERS_DIVERGED)
  const [landedSince, setLandedSince] = usePanelSlot(LANDED_SINCE_NOTICE)
  const [drafts, setDrafts] = usePanelSlot(DRAFTS)
  const [editingId, setEditingId] = usePanelSlot(EDITING_ID)
  // **viewer 에게는 고치는 중인 글이 없다.** 칸은 저장소에서 되살아나므로(`EDITING_ID`) 이 값으로 가리지 않으면 editor 때
  // 열어 둔 수정 상자가 강등 뒤 새로고침에 **그대로 선다** — 켜진 «저장» · 403 · 실패 문장 없음(그 문장은 폼 안이다) · 제 글의
  // 원문도 상자에 가린다. «수정» 단추(칸을 **세우는** 입구)만 가려서는 모자라다 — 세워진 칸을 **그리는** 갈래와 **보내는** `saveEdit`이
  // 이 한 값을 본다. 칸 자체는 **안 지운다** — 다시 editor 가 되면 초안이 돌아와야 한다(설명 초안 · 새 코멘트 초안과 같은 결정).
  const editing = props.canEdit ? editingId : null
  const [editDraft, setEditDraft] = usePanelSlot(EDIT_DRAFT)
  const [postKeys, setPostKeys] = usePanelSlot(POST_KEYS)
  const [refreshing, setRefreshing] = usePanelSlot(REFRESH)

  const { projectId, pageId } = props
  // 상자가 보이는 것은 **고른 노드의 초안**이다 — 새 코멘트가 달릴 자리와 같은 값을 본다.
  const draft = selectedNodeId === null ? '' : (drafts.get(selectedNodeId) ?? '')

  /**
   * **쓰기 뒤의 목록 다시 받기 — 잠금 밖이다.** 이것을 쓰기의 뒷일 안에서 기다리면,
   * 게시가 **커밋됐는데** 이 읽기가 매달릴 때 상자가 통지 없이 꺼진 채 F5 말고는 안 풀린다(Chrome). 쓰기가
   * 끝났으면 잠금은 풀려야 한다 — 표시를 새로 못 받은 것은 따로 말한다(`REFRESH`: 도는 중 · 실패).
   *
   * **읽기의 시간 제한은 일반 읽기의 것이다**(`api/http-client.ts`의 `READ_DEADLINE_MS` — 없으면 매달릴 때
   * «목록을 다시 불러오는 중»에 머문다). 넘으면 아래 실패 갈래로 간다. 잠금은 어느 쪽이든 풀려 있다. 실패하면 목록은 그 앞의 것 그대로 두고 그렇다고 말한다 — 401 이면 로그인
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
  // 대한 말로 읽힌다 — `page-description.tsx`가 같은 자리에서 같은 것을 한다. **초안·고치던 것을
  // 이 이펙트나 아래 조회 이펙트에서 지우면**, 둘 다 마운트마다 돌아 탭을 한 번
  // 누른 것만으로 쓰던 말이 사라진다(위 머리말 «탭을 오가도 …»).
  //
  // **의존이 비어 있는 것이 요점이다.** 페이지가 바뀔 때 버리는 것은 provider가 한다(칸
  // 일곱을 함께) — 여기서 `pageId`에도 돌면 같은 일을 두 자리가 하게 된다.
  useEffect(() => {
    setWriteError(null)
    setDiverged(false)
    setLandedSince(null)
    // 다시 받기의 실패도 지난 통지다. **도는 중인 것은 남긴다** — 아직 끝나지 않았다.
    setRefreshing((prev) => (prev?.failure == null ? prev : null))
  }, [])

  // **장부가 결말을 남기면 칸의 같은 통지를 지운다**(`page-description.tsx`의 같은 자리). 장부는 통지를 그리는 갈래
  // (폼 안의 `PendingNotice`)가 없으면 남기는데, 이 본문이 떠 있는 채 폼만 없는 판(강등된 viewer · 불러오는 중)에는 `settle`이 칸
  // (`WRITE_ERROR` · `LANDED_SINCE_NOTICE`)에도 같은 결말을 쓴다 — 지우지 않으면 폼이 돌아올 때 둘 다 선다. 남기는 것은 칸 쓰기 뒤다.
  const { missed } = busyLock
  useEffect(() => {
    if (missed === null) return
    setWriteError(null)
    setLandedSince(null)
  }, [missed, setWriteError, setLandedSince])

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
    // 그 규칙이 «페이지 설명»의 «페이지가 바뀌면 버린다»와 **같은 자리에서 같은 값으로** 돈다.
    let alive = true
    // 떠나면 요청째 끊는다(`ReadOptions.cancel` · `routes/editor.tsx`의 페이지 조회와 같다).
    const leave = new AbortController()
    const at = issue()
    setState({ status: 'loading', at })

    async function load(openPageId: string): Promise<void> {
      try {
        const comments = await api.listComments(projectId, openPageId, { cancel: leave.signal })
        if (!alive) return
        // **늦게 낸 다시 받기의 답이 이미 섰으면 버린다**(`answered`) — 돌아와 건 이 조회는 쓰기가
        // 커밋되기 전에 읽었을 수 있다(머리말 «잠금이 막지 못하는 길»의 2).
        setState(answered(at, { status: 'ready', at, comments }))
      } catch (caught) {
        if (!alive) return
        setState(answered(at, { status: 'failed', at, failure: toFailure(caught, LOAD_FAILED) }))
      }
    }

    void load(pageId)
    return () => {
      alive = false
      leave.abort()
    }
    // `setState`는 이 렌더의 페이지를 단 쓰기라 `pageId`와 함께만 바뀐다.
  }, [api, projectId, pageId])

  /**
   * 쓰기 하나를 장부에 올려 보낸다(`write-ledger.tsx`). **잠금은 장부가 쥐고 푼다** — 성공·실패·
   * 판정 어느 쪽이든 반드시 풀리고(안 그러면 실패 한 번에 패널이 영영 잠긴다), **뒷일(`done`·
   * `verified`)이 끝난 뒤에** 풀린다. **뒷일은 네트워크를 기다리지 않는다** — 목록 다시 받기는 잠금 밖에서
   * 돈다(`refresh`). 다시 받기를 잠금 안에서 기다리면 그것이 매달릴 때 게시가
   * 커밋됐는데도 상자가 말없이 꺼진 채다.
   *
   * `verified`는 시간 안에 응답이 없어 **판정했을 때**다 — 수정·삭제는 목록을 다시 읽고, 게시는
   * 같은 키로 다시 보낸다(`submit`). 반영되지 않았으면 그 실패를 돌려준다 — 초안·편집 칸은 남는다.
   *
   * **판정으로 끝난 쓰기는 번호 변화(`markerOps`)를 못 받았다.** 그 변화가 내 문서에 안 오는
   * 것은 **쓰기를 시작한 셸이 아직 떠 있을 때**뿐이다(`ownerLive`) — 서버가 방송에서 그 요청의
   * 연결을 빼기 때문이다. 셸이 내려갔다 새로 섰으면 새 셸은 **새 연결**이라 그 방송을 받는다
   * (Chrome 실측 — 에디터를 떠났다 온 사이 커밋된 게시의 번호가 새 스토어에 섰다). 그래서
   * 어긋났다고 말하는 것은 셸이 떠 있을 때만이다. **게시를 같은 키로 다시 보낸 것이 커밋해도(201) 같다** —
   * 다시 보낸 것이 첫 보내기의 연결을 싣기 때문이다(`submit`의 `origin` — 지금 연결을 실으면 새 셸이
   * 방송에서 빠진다).
   */
  const perform = useCallback(
    <T, V>(op: {
      send: (client: ApiClient, openPageId: string, signal: AbortSignal) => Promise<T>
      verify: (client: ApiClient, openPageId: string, signal: AbortSignal) => Promise<V>
      /** 성공을 화면에 옮긴다. 실패가 아닌데 말할 것이 있으면(`WriteNote` — 게시의 «이미 달렸고 그 뒤 …») 그것을 돌려준다. */
      done: (value: T, openPageId: string) => Promise<WriteNote | void> | WriteNote | void
      /**
       * 판정을 화면에 옮긴다. 반영되지 않았으면 그 실패를 돌려준다 — 초안·편집 칸은 남는다. 실패가 아닌데 말할 것이 있으면
       * `WriteNote`다(`done`과 같다).
       */
      verified: (verdict: V, ownerLive: boolean, openPageId: string) => Promise<WriteConclusion> | WriteConclusion
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
        // **돌려주는 것은 칸에 그린 결말 그대로다** — 그리는 본문이 없는 동안 끝나면 장부가 이것을 남긴다(`write-ledger.tsx`의
        // «떠나 있는 동안 끝난 실패» · «판정으로 끝난 쓰기도 전한다»). «이미 달렸고 그 뒤 고쳐졌다 · 지워졌다»
        // (`keyVerdict`)는 실패가 아니라 `done`(다시 보낸 것이면 `verified`)으로 오고 `WriteNote`를 돌려준다 — 칸에는
        // `LANDED_SINCE_NOTICE`로 그리고, 실패 칸(`WRITE_ERROR`)에는 안 쓴다.
        settle: async (outcome, ownerLive) => {
          try {
            if (outcome.kind === 'failed') {
              op.failed?.(openPageId)
              throw outcome.caught
            }
            if (outcome.kind === 'done') {
              const said = await op.done(outcome.value, openPageId)
              setWriteError(null)
              return said ?? null
            }
            const said = await op.verified(outcome.verdict, ownerLive, openPageId)
            setWriteError(said?.kind === 'note' ? null : said)
            return said
          } catch (caught) {
            const failure = toFailure(caught, WRITE_FAILED)
            setWriteError(failure)
            return failure
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
    // **다시 보낸 것도 첫 보내기의 연결을 싣는다**(`WriteOptions.connectionId`) — 같은 요청이다. 서버는 그
    // 연결을 방송에서 뺀다(응답의 `markerOps`를 낸 셸이 스스로 얹으므로). 다시 보낼 때 **지금**
    // 연결을 실으면, 그 사이 셸째 떠났다 왔을 때 그것은 **새 셸의** 연결이라 새 셸이 방송을 못 받는다 —
    // 응답의 번호는 내려간 셸의 스토어에 얹힌다(Chrome: 첫 게시를 route 에 붙잡아 둔 채 셸째 떠났다 오고,
    // 다시 보낸 것이 201 — 새 셸의 번호 칸 `–` · 통지 없음 · DB 의 번호 1 · 새로고침하면 `1`). 첫 보내기의
    // 연결이면 셸이 떠 있을 때는 지금과 같고, 내려갔으면 **아무도 빼지 않는다** — 서버는 id 가 같고 **요청과 같은
    // 세션인** 연결만 빼고 id 는 무작위다(`apps/api/src/ws/broadcast.ts`의 `sentBy` · `ws/connection-id.ts` — 세션을
    // 안 보면 api 재기동 뒤 그 옛 id 를 받은 **남의** 연결이 빠진다. 값은 그쪽이 적는다). 같은 셸에서 WS 가
    // 다시 붙은 판의 두 번 얹힘은 막지 못한다(`write-ledger.tsx`의 «이것이 막지 못하는 것»).
    const origin = connections?.get()
    // **첫 보내기와 다시 보낸 것이 이 함수 하나를 지난다** — «그 키의 게시는 이미 달렸고 그 뒤 고쳐졌다 · 지워졌다»
    // (`keyVerdict`)를 받는 자리가 여기 하나다.
    const post = async (client: ApiClient, openPageId: string, signal: AbortSignal): Promise<Posted> => {
      try {
        const created = await client.createComment(
          projectId,
          openPageId,
          { nodeId, body, idempotencyKey },
          origin === undefined ? { signal } : { signal, connectionId: origin },
        )
        return { kind: 'created', created }
      } catch (caught) {
        const verdict = keyVerdict(caught)
        if (verdict !== null) return { kind: verdict }
        throw caught
      }
    }

    /**
     * 달렸다 — 첫 응답이든 다시 보낸 것의 응답이든 뒷일은 같다. **«이미 달렸고 그 뒤 고쳐졌다 · 지워졌다»도
     * 달림이다**(`keyVerdict`) — 초안과 키를 버리고 목록을 다시 받고 그렇다고 말한다. 그 응답은 문서 변화를 싣지 않는다 —
     * 번호는 앞 게시가 붙였고 그 변화는 앞 게시의 응답이나 방송이 날랐다(어긋났는지 말할 값이 없다).
     */
    const landed = (posted: Posted, openPageId: string, ownerLive: boolean): WriteNote | void => {
      if (posted.kind === 'created') {
        // **문서 변화를 먼저 얹는다.** 목록을 다시 받아도 번호는 그 응답에 없다 —
        // 번호는 문서의 값이다. 결과를 **버리지 않는다**(`MARKERS_DIVERGED`).
        const { created } = posted
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
      } else {
        setDiverged(false)
      }
      setLandedSince(posted.kind === 'created' ? null : posted.kind)
      setPostKeys((prev) => {
        const next = new Map(prev)
        next.delete(nodeId)
        return next
      })
      // 초안은 **성공한 뒤에** 비운다. 실패했는데 비우면 사용자가 쓴 말이 사라진다.
      // **보낸 노드의 것만** 비운다 —
      // 게시가 나가 있는 동안 다른 노드를 골랐어도, 다른 노드에 써 둔 초안이 있어도.
      setDrafts((prev) => withDraft(prev, nodeId, ''))
      refresh(openPageId)
      // **«이미 달렸고 그 뒤 …»는 실패가 아닌 결말이다** — 칸에는 위 `setLandedSince`가 그리고, 그리는 본문이 없으면 장부가 이것을
      // 남긴다(`write-ledger.tsx`의 `WriteNote`). 특히 «지워졌다»는 목록 · 상자가 다 비어 이것 말고는 말할 자리가 없다.
      if (posted.kind !== 'created') return { kind: 'note', message: posted.kind === 'edited-since' ? EDITED_SINCE : DELETED_SINCE }
    }

    perform<Posted, Reposted>({
      send: (client, openPageId, signal) => post(client, openPageId, signal),
      // **판정은 같은 키로 다시 보내는 것이다**(목록을 다시 읽어 «같은 노드 · 같은 글 · 내가 쓴 것 ·
      // 보내기 전 목록에 없던 것»을 찾는 판정은 목록을 읽은 뒤 다른 곳에서 달린 같은
      // 글을 **이 게시로** 친다 — Chrome: 서버에 안 닿은 게시가 «달림»이 되고 초안이 지워진다).
      // 서버가 앞 게시를 커밋했으면 그 행을 돌려주고(재생 200), 아니었으면 지금 커밋한다(201) — **어느
      // 쪽이든 확정이다.** 앞 게시를 서버가 아직 쥐고 있으면 다시 보낸 것은 같은 페이지 행 잠금 뒤에
      // 줄을 서서 재생을 받는다(`apps/api`의 «잠금 안에서 한 번 더 본다»).
      verify: async (client, openPageId, signal) => {
        try {
          return { posted: true, result: await post(client, openPageId, signal) }
        } catch (caught) {
          // **키를 보고 낸 거절만 «안 달림»이다**(`knownRejection`의 `'resent'` 칸) — 서버는 권한을 보기 전에 이
          // 키로 내 행을 찾으므로 4xx 는 «그 순간 이 키의 내 행이 없다»이다. **api 의 봉투 500 은 여기서 모른다** —
          // 첫 보내기에서는 «그 요청이 커밋 전»이지만 여기서 묻는 것은 앞 게시다. 그 밖도 모른다 — «다시 확인».
          // **이 판정이 틀리는 판**(앞 게시가 아직 서버에서 커밋 중인데 가드가 거절한 판)은 `apps/api/README.md`의
          // «멱등 키»가 적는다 — 여기 옮겨 적지 않는다. 그 사이 고쳐진 · 지워진 행의 409 는 여기 오지 않는다 —
          // `post`가 «달림»으로 받는다(`keyVerdict`).
          if (knownRejection(caught, 'resent')) return { posted: false, caught }
          throw caught
        }
      },
      // **시간 안의 모르는 실패도 판정으로 간다.** 첫 게시가 서버에 닿았는데 브라우저가 502·연결 끊김을
      // 받은 판을 `'failed'`로 받으면 초안이 열리고, 고쳐 달면 새 키라 두 행이 된다
      // (Chrome route). 그래서 같은 키로 다시 보내 확정한다 — 그동안 상자는 잠겨 있다.
      uncertain: (caught) => !knownRejection(caught, 'sent'),
      done: (created, openPageId) => landed(created, openPageId, true),
      verified: (verdict, ownerLive, openPageId) => {
        // 거절됐으면 **초안과 키를 남긴다** — 같은 글을 다시 달면 같은 키다.
        if (!verdict.posted) return toFailure(verdict.caught, WRITE_FAILED)
        return landed(verdict.result, openPageId, ownerLive) ?? null
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
      // **실패하면 목록을 다시 받는다.** «지워지지 않았습니다» 판정 뒤 서버가 앞 삭제를 늦게
      // 커밋하면, 다시 누른 삭제는 409(페이지가 이미 변경되었습니다)를 받는데, 다시 받지 않으면 목록에는
      // **이미 지워진 코멘트가 남는다**(Chrome). 무엇이 참인지는 서버의 목록이 말한다 — 통지(409)는 그대로 둔다.
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
    // 그리는 갈래와 **같은 값**이다(`editing`) — 상자가 안 선 글은 보내지도 않는다.
    if (editing !== commentId) return
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
      // **목록으로는 판정할 것이 없다** — 재번호는 표를 안 건드리고 문서만 바꾼다. 다시
      // 눌러도 같은 결과이므로(서버가 그때의 문서 순서로 다시 매긴다) 두 번 반영될 것이 없다.
      // 응답을 못 받았으니 번호가 바뀌었어도 내 문서에 없다 — 그렇다고만 말한다.
      verify: async () => null,
      done: (change, openPageId) => {
        setDiverged(store.applyMarkerChange(openPageId, change) === 'diverged')
        // 목록은 다시 받지 않아도 된다 — 재번호는 **표를 안 건드린다**. 번호만 바뀌고
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
    // **세션이 끊겼으면 오류 문장이 아니라 로그인이다** — `routes/editor.tsx`의
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
      {/* **폼째 뺀다**(`canEdit`). 폼 안의 통지(실패 · 확인 중 · 어긋남)도 함께 가는데, 그것들은 전부 **내가 낸 쓰기**의
          뒷말이다. viewer 가 쓰기를 못 내는 것은 폼만의 일이 아니다 — 줄마다의 수정 상자도 `editing`(위)이 막아야 참이다.
          막지 않으면 저장소에서 되살아난 수정 상자가 폼 **밖**에서 쓰기를 내고, 그 실패가 설 자리는 뺀 폼 안이다.
          **장부가 남긴 결말만은 폼 밖에서도 말한다**(`MissedNotice` — 게시가 나가 있는 동안 제자리에서 강등되면 볼 자리가 여기뿐이다). */}
      {!props.canEdit && <MissedNotice lock={busyLock} />}
      {props.canEdit && (
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
          {/* **어느 노드에 다는가** — 두 모드 다(`targetOf`). 상자의 이름(«새 코멘트»)은 그대로 두고 설명으로 잇는다. */}
          {selectedNodeId !== null && (
            <p id="wb-comment-target" className="wb-shell-comment-target">
              {targetOf(document, selectedNodeId)}
            </p>
          )}
          <textarea
            id="wb-comment-draft"
            className="wb-shell-comment-input"
            {...(selectedNodeId === null ? {} : { 'aria-describedby': 'wb-comment-target' })}
            value={draft}
            rows={3}
            // **고른 노드가 없으면 아예 쓸 수 없다.** 눌러 봐야 실패할 자리를 열어 두지
            // 않는다 — 서버도 `nodeId` 없는 본문을 400으로 막는다.
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
            {/* 「설계서 화면 구조」의 *"문서 순서대로 재번호"* 버튼. 표는 안 건드리고 문서만 바꾼다. */}
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
          {/* **실패가 아니다** — 게시는 달렸었다(`keyVerdict`). */}
          {landedSince !== null && (
            <p className="wb-shell-panel-notice" role="status">
              {landedSince === 'edited-since' ? EDITED_SINCE : DELETED_SINCE}
            </p>
          )}
        </form>
      )}

      {/* **문서를 못 읽었으면 그렇다고 말한다**(머리말 «무리가 셋이고»). 코멘트는 그대로 보이되 번호
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
                {/* **`'unknown'`을 `'no'`와 갈라 말한다**. 문서를 못 읽었을 뿐인데
                    *"사라진 노드"*라고 적으면 화면이 거짓을 단언한다. */}
                {group.present === 'no' ? `${MISSING_NODE} (${group.nodeId})` : group.nodeId}
              </h3>
              <ul className="wb-shell-comment-list">
                {group.comments.map((comment) => (
                  <li key={comment.id} className="wb-shell-comment">
                    <p className="wb-shell-comment-author">{comment.authorName}</p>
                    {editing === comment.id ? (
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
                        {/* **수정은 작성자만 부를 수 있다**(남이 부르면 서버가
                            403으로 막는다). 눌러 봐야 실패할 버튼을 두지 않는다. */}
                        {props.canEdit && currentUser !== null && comment.authorId === currentUser.id && (
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
                        {/* **삭제는 editor면 누구나 한다** — 수정과 갈린다(서버도 그렇게 가른다). viewer 에게는 없다(`canEdit`) —
                            제 글이어도 그렇다(역할이 깎인 사람의 옛 글). */}
                        {props.canEdit && (
                          <button
                            type="button"
                            className="wb-shell-comment-delete"
                            disabled={busy}
                            onClick={() => remove(comment.id)}
                          >
                            삭제
                          </button>
                        )}
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
