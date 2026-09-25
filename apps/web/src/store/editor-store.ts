/**
 * 에디터 셸이 공유하는 편집 상태. **React·DOM·`fetch`를 import하지 않는다.**
 *
 * 이 스토어가 낙관적 적용·롤백·리베이스·pending 큐·undo/redo 스택을 든다.
 * 그 로직은 화면 없이 단위 테스트할 수 있어야 하므로 이 파일은 브라우저 밖에서 돈다
 * (`apps/web/test/store/editor-store.test.ts`가 DOM 없는 환경에서 그것을 강제한다).
 * React 바인딩은 `use-editor-store.tsx`에 따로 있다.
 *
 * 상태는 **불변 객체 하나**다. 바뀐 필드가 있을 때만 새 객체로 교체하고, 그때만
 * 리스너를 부른다. 두 규칙 모두 `useSyncExternalStore` 때문이다 — 읽을 때마다 새
 * 객체를 만들면 스냅샷이 매 렌더 달라져 렌더가 멈추지 않고, 값이 같은데도 알리면
 * React가 헛일을 한다.
 *
 * `getState()`가 돌려준 객체를 **바꾸지 마라.** 스토어는 그 객체를 다음 비교의
 * 기준으로 들고 있으므로, 밖에서 고치면 변경이 알림 없이 새어 들어간다.
 */
import {
  applyOps,
  findLockConflict,
  findNodePath,
  lockPointers,
  type NodeLock,
  type PageDocument,
  type PatchOp,
  type ValidationIssue,
} from '@wirebound/schema'
import type { NodeLockView } from '../realtime/protocol'
import {
  ackPending,
  clearPending,
  nextPending,
  type EditKind,
  type PendingEdit,
} from './edit-queue'

/** 편집 모드. `view`는 편집 도구를 감추고 결과만 보여 준다. */
export type EditorMode = 'edit' | 'view'

/**
 * 편집 파이프라인이 지금 무엇을 하고 있는가.
 *
 * - `idle` — 보낼 것도 기다릴 것도 없다.
 * - `sending` — 요청이 하나 떠 있다(in-flight는 항상 하나).
 * - `recovering` — 실패해서 페이지를 다시 받는 중이다.
 */
export type EditStatus = 'idle' | 'sending' | 'recovering'

/**
 * 편집이 실패한 이유. 화면에 그리는 것은 `shell/edit-alert.tsx` 하나다.
 *
 * **`api/failure.tsx`의 `Failure`와 같은 모양이고 그쪽 값이 그대로 들어온다.** 그 타입을
 * import하지 않는 것은 이 파일이 런타임 의존을 갖지 않기 위해서다(머리말) — 그쪽은
 * React·react-router를 쓰는 `.tsx`다. **모양이 갈리면 `edit/use-edit-commit.tsx`의
 * 대입에서 컴파일이 막힌다** — 구조적 타이핑이라 필드가 어긋나는 순간 그 대입이 에러다.
 */
export type EditFailure = { kind: 'signed-out' } | { kind: 'message'; message: string }

/**
 * 되돌릴 수 있는 revision 하나. 설계서 「개인 undo/redo」가 *"클라이언트가 자기 revision id 스택을
 * 보유한다"*고 했고, README가 *"응답의 `inverse`를 그대로 다시 `ops`로 보내면 그 편집이
 * 취소된다"*고 했다 — **둘 다 필요하다.** id는 새로고침 복원에서 중복을 거르는 데
 * 쓰고, `inverse`는 전송에 쓴다.
 *
 * **`inverse`는 서버가 만든 그대로다**(설계서 「정방향 흐름」). 클라이언트가 `invertOps`로 계산하지
 * 않는다 — 클라이언트 상태가 낙관적으로 앞서 있을 수 있기 때문이다.
 */
export interface RevisionRef {
  revisionId: string
  inverse: PatchOp[]
}

/**
 * 새 `clientOpId`를 만드는 함수. **생성자 인자로 받는 것이 계약이다** — 이 스토어는
 * 순수 TS이고 전역 의존을 갖지 않는다(이 파일 머리말: React·DOM·`fetch`를 import하지
 * 않는다). 기본값만 `crypto.randomUUID`를 쓰므로 환경 의존이 한 줄에 갇히고, 테스트는
 * 결정적인 id를 주입할 수 있다.
 */
export interface EditorStoreOptions {
  nextOpId?: () => string
}

/** 캔버스 뷰포트 폭 프리셋 (설계서 「설계서 화면 구조」). */
export const VIEWPORT_PRESETS = [1920, 1440, 1280, 1024, 768, 375] as const

export type ViewportWidth = (typeof VIEWPORT_PRESETS)[number]

/** 줌 한계 (「설계서 화면 구조」). */
const MIN_ZOOM = 0.25
const MAX_ZOOM = 2

export interface EditorState {
  /**
   * **이 문서가 어느 페이지의 것인가.** 문서가 없으면 `null`이다.
   *
   * 문서·`headSeq`와 함께 실린다(`loadPage`). 이 필드가 없으면 스토어의 문서가 지금 열려
   * 있는 페이지의 것인지 **읽는 쪽이 대조할 수단이 없다** — 주소가 바뀐 뒤 문서를 비우는
   * 이펙트가 돌기까지의 커밋 하나 동안, 스토어는 앞 페이지의 것을 들고 있으면서 그렇다고
   * 말하지 않는다(실측은 `test/canvas/canvas.test.tsx`의
   * `주소가 바뀐 커밋에 앞 페이지가 그려지지 않는다`가 쓰는 장치가 잡는다).
   *
   * 그 창의 `headSeq`는 편집 요청의 `baseSeq`가 되므로, 대조를 **스토어 안에서**
   * 닫아 두는 편이 화면마다 따로 막는 것보다 안전하다.
   */
  openPageId: string | null
  /** 서버에서 받은 문서. 낙관적 패치가 여기에 적용된다. */
  document: PageDocument | null
  /**
   * **서버가 확인해 준 문서** — `headSeq` revision의 것이고, 위 `document`는 이것 위에
   * `pending`을 순서대로 얹은 결과다.
   *
   * ## 왜 문서를 둘 드는가 — 리베이스가 그것을 요구한다
   *
   * 「정방향 흐름」은 남의 변경을 *"자기 pending 위에 리베이스 적용"*하라고 적는다. **낙관 문서 위에
   * 남의 `ops`를 그냥 얹는 것은 리베이스가 아니다** — 서버는 남의 것을 **먼저** 기록하고 내
   * pending을 그 위에 적용하므로, 내가 반대 순서로 얹으면 두 문서가 갈린다(실측: 양쪽이
   * `-`로 배열에 더하면 순서가 뒤집힌다). 서버와 같은 순서로 만들려면 **남의 것을 얹을
   * 바탕**, 즉 내 낙관적 편집이 섞이지 않은 문서가 있어야 한다.
   *
   * **`document`에서 이것을 되계산할 수는 없다.** 되돌리려면 pending의 역패치가 필요한데,
   * 그것을 클라이언트가 만드는 것을 「정방향 흐름」이 막는다(*"`inverse`는 서버가 적용 직전 상태를
   * 보고 생성한다"*). 그래서 되계산 대신 **들고 있는다.**
   *
   * **`document`와 함께 실리고 함께 비워진다**(`loadPage`·`clearPage`). 둘 중 하나만 움직이는
   * 자리를 만들지 마라 — 그 순간 리베이스의 바탕이 조용히 틀려진다.
   */
  baseDocument: PageDocument | null
  /** 이 문서의 최신 revision seq. 편집 요청이 `baseSeq`로 쓴다. */
  headSeq: number
  selectedNodeId: string | null
  mode: EditorMode
  viewportWidth: ViewportWidth
  /** 0.25 ~ 2.0 */
  zoom: number
  /**
   * 보내지 않았거나 응답을 기다리는 편집. **`[0]`이 전송 중인 것이다**.
   * 큐를 옮기는 규칙은 `edit-queue.ts`에 순수 함수로 있다.
   */
  pending: PendingEdit[]
  /** 되돌릴 수 있는 revision. **끝이 top**(최근)이다 — `ackEdit`이 뒤에 쌓는다. */
  undoStack: RevisionRef[]
  /**
   * 되돌린 것을 다시 적용할 revision. undo가 만든 revision이 여기 쌓인다.
   *
   * **새 편집을 내면 비워진다**(표준 undo 의미론 — 되돌아갈 미래가 없어진다).
   * 새로고침 복원도 이것을 채우지 않는다: redo는 세션 안에서 undo를 눌러야 생긴다.
   */
  redoStack: RevisionRef[]
  editStatus: EditStatus
  /** 마지막 편집 실패. 새 편집을 내면 지워진다 — 남아 있으면 방금 낸 편집도 실패한 것으로 읽힌다. */
  editFailure: EditFailure | null
  /**
   * **서버가 마지막 편집 응답에 실어 보낸 문서 경고**(「정방향 흐름」).
   *
   * **실패가 아니다.** severity가 `warning`인 이슈는 저장을 막지 않고 문서에 남는다 —
   * 끊긴 상호작용 타겟이 그렇다(`error`로 두면 타겟이 된 노드를 지우는 편집이 422가 된다).
   * 그래서 `editFailure`와 갈라 둔다: 한 필드에 접으면 *"저장됐다"*와 *"저장되지 않았다"*가
   * 같은 값이 된다.
   *
   * **성공한 ack마다 통째로 갈아 끼운다.** 서버가 보내는 것은 *"이 편집 뒤 문서에 남은
   * 경고 전부"*이므로 누적하면 이미 고친 경고가 화면에 남는다. **경고가 없어졌으면 빈
   * 배열이 오고 화면에서 사라진다** — 그것이 사용자가 고쳤다는 신호다.
   */
  editWarnings: ValidationIssue[]
  /**
   * **지금 프로젝트에서 살아 있는 잠금 전부**(설계서 「소프트 잠금」). 서버가 `locks` 프레임으로 통째로
   * 준다 — 증분이 아니라 전부이므로 여기서 쌓지 않고 **갈아 끼운다.**
   *
   * **페이지가 섞여 있다.** 룸이 프로젝트 하나이기 때문이고, 읽는 쪽이
   * `openPageId`로 거른다 — 거르는 자리는 `lockedBy` 하나다.
   *
   * **타입을 전송 계층에서 가져온다.** 이 파일은 React·DOM·`fetch`를 모르지만
   * `realtime/protocol.ts`는 순수 타입 선언이라 그 규칙 안이다. 모양을 여기 다시 적으면
   * 서버가 필드를 하나 더할 때 두 벌이 갈린다.
   */
  locks: NodeLockView[]
  /**
   * **지금 보고 있는 사람.** 잠금 소유자 판정이 이 값을 쓴다(같은 사람의 다른
   * 탭에는 막히지 않는다).
   *
   * **`null`이면 모든 잠금이 남의 것이다.** 누구인지 모르는 채로 *"내 것일 수도 있다"*로
   * 흘려보내면 「소프트 잠금」의 1차 방어가 조용히 사라진다 — 모르는 쪽에서는 막는 것이 안전하다.
   */
  viewerUserId: string | null
  /**
   * **이 사람의 선택이 잠금을 거는가**(「소프트 잠금」 — *"노드를 선택하면 그 서브트리에 잠금을 건다"*). 셸의 `canEdit`에서 내린다
   * (`realtime/use-node-lock.ts` — 같은 값으로 잠금도 잡는다).
   *
   * **`false`면 남의 잠금이 고르기를 막지 않는다.** 남이 잡은 자리를 못 고르게 하는 까닭은 고르기가 곧 서브트리 claim 이기
   * 때문이다(두 사람이 같은 서브트리를 쥐면 서로 막힌다). viewer 는 고른 자리를 잡지 않으므로 막을 까닭이 없고, 막으면
   * 남이 잡은 동안 그 노드의 속성을 **읽지** 못한다. **판정은 그대로 스토어 한 자리다** — `selectNode` · 여는 경로의 루트
   * 자동 선택(`#selectionFor`) · 구조 트리의 `disabled`(`selectionBlockedBy`)가 이 값 하나를 본다. 배지(«○○ 편집 중»)와
   * 편집 차단(`lockedBy`)은 이 값과 무관하다 — 누가 잡았는지는 viewer 에게도 보인다.
   *
   * **기본은 `true`다** — 셸 없이 스토어를 쓰는 자리(테스트)는 *"선택이 곧 잠금"*인 모델 그대로다.
   */
  selectionClaims: boolean
  /**
   * **남의 변경을 받았는데 화면에 못 얹었다.** 못 얹은 적이 없으면 `null`이다. **한 번 서면 `loadPage`·`clearPage`만
   * 푼다** — 뒤이어 온 프레임을 얹어도 못 받은 revision 은 여전히 없다(`applyRemoteChange`의 `#rebaseOnto` 앞 주석).
   *
   * **`pending`이 차 있는 것은 못 얹는 이유가 아니다** — 남의 ops는 내 pending 위에 리베이스해
   * 얹는다(「정방향 흐름」). 못 얹는 이유는 셋뿐이고 전부 *"내 바탕이 서버 문서가 아니다"*에서
   * 온다(`applyRemoteChange`의 갈래 표).
   *
   * **`null`과 `{reason}`을 접지 마라.** 접으면 *"낡지 않았다"*와 *"낡았는데 왜인지 모른다"*가
   * 같은 값이 된다.
   */
  remoteStale: RemoteStale | null
  /**
   * **문서를 통째로 실은 횟수**(`loadPage`마다 +1). 편집 · 남의 변경은 문서를 고쳐 가지만 이것은 안 바뀐다 — 이 값이
   * 바뀌었다는 것은 **판이 서버 것으로 갈아 끼워졌다**는 뜻이다(페이지 열기 · 복원 · 재연결 재조회 · 실패 수습).
   *
   * 읽는 쪽은 캔버스의 상호작용 런타임 하나다(`canvas/canvas.tsx`의 `runtimeKey`) — 겹layer는 옛 문서 위의 시연이라,
   * 복원이 같은 id 의 노드를 되살리면 옛 시연이 새 문서에 얹힌다(Chrome: 뷰 모드에서 글을 숨긴 뒤 복원하면 되살아난 글이
   * 숨은 채였다).
   */
  documentLoads: number
}

/**
 * 초기 상태. 상수 하나를 공유하지 않고 매번 새로 만드는 것은, 스토어마다 자기
 * 객체를 갖게 해서 한쪽에서 새어 나간 수정이 다른 스토어에 옮지 않게 하기 위해서다.
 */
function initialState(): EditorState {
  return {
    openPageId: null,
    document: null,
    baseDocument: null,
    headSeq: 0,
    selectedNodeId: null,
    mode: 'edit',
    viewportWidth: 1280,
    zoom: 1,
    pending: [],
    undoStack: [],
    redoStack: [],
    editStatus: 'idle',
    editFailure: null,
    editWarnings: NO_WARNINGS,
    locks: NO_LOCKS,
    viewerUserId: null,
    selectionClaims: true,
    remoteStale: null,
    documentLoads: 0,
  }
}

/** 잠금이 없을 때 쓰는 배열. **참조를 고정한다** — `NO_WARNINGS`와 같은 이유다. */
const NO_LOCKS: NodeLockView[] = []

/**
 * 경고가 없을 때 쓰는 배열. **참조를 고정한다** — 매번 `[]`를 새로 만들면 경고 없는 편집이
 * 이어질 때마다 `#apply`가 변경으로 보고 구독자가 헛일을 한다(`clearPage`의 빈 큐와 같은 이유).
 */
const NO_WARNINGS: ValidationIssue[] = []

/**
 * `applyMarkerChange`의 결과. **`boolean`이 아닌 것이 요점이다** — 그 함수의 머리말에
 * 넷이 갈리는 근거가 있다.
 */
export type MarkerChangeResult = 'applied' | 'skipped' | 'diverged' | 'waiting'

/**
 * 번호 응답이 **사이 프레임을 기다리는** 한도(`applyMarkerChange`의 «내 다음 번호가 아니면 사이 프레임을 기다린다»). 넘기면
 * `'gap'` 낡음을 세운다.
 *
 * 그 프레임은 응답보다 **먼저 나갔다** — 사이 revision 은 번호를 매긴 쓰기가 페이지 행 잠금을 받기 전에 커밋됐고 서버는
 * 커밋 직후에 방송한다. 기다리는 것은 두 연결(WS · HTTP)의 지연 차뿐이다. 잰 값 [api]: 페이지 행을 쥔 채 «남의 구조
 * 편집 → 내 게시» 순으로 줄 세우고 풀면, localhost 에서는 프레임이 응답보다 4–8ms 앞서고, 서버→브라우저 WS 바이트만
 * 10ms 늦추는 TCP 프록시를 끼우면 6판 모두 응답이 먼저 닿는다. 패킷 하나를 다시 보내면(RTO 200ms 부터 두 배씩) 수백 ms
 * 가 붙는다 — 3초는 그 몇 번을 덮는다. 그보다 늦으면 «늦었다»가 아니라 «안 온다»로 본다(끊긴 연결 · 빠진 방송).
 */
export const MARKER_FRAME_WAIT_MS = 3_000

/**
 * 화면이 낡은 이유. **셋을 가른다 — 사용자가 할 일이 다르고, 무엇이 일어났는지도 다르다.**
 *
 * | `reason` | 무엇이 일어났나 | 사용자가 할 일 |
 * |---|---|---|
 * | `'gap'` | **프레임을 놓쳤다** — 온 `seq`가 내 다음 번호가 아니다 | 다시 붙으면 화면이 스스로 다시 읽는다. 안 풀리면 새로고침 |
 * | `'diverged'` | 얹으려다 `applyOps`가 던졌다 | 새로고침 |
 * | `'restored'` | 남이 **스냅샷을 복원했다** — 판이 통째로 갈렸다 | 새로고침 |
 *
 * **`'pending'`(*"보내지 않은 편집이 있어 미뤘다"*) 갈래는 없다** — 남의 변경은 리베이스로
 * 얹으므로 미룰 일이 없다. 그래서 자기 편집을 되받아 선 낡음이 `ackEdit`으로 안 풀리는
 * 자리도 **풀 낡음 자체가 안 서므로** 성립하지 않는다.
 *
 * **`'gap'`과 `'diverged'`를 접지 마라.** 둘 다 *"못 얹었다"*지만 원인이 정반대다 —
 * `'gap'`은 **못 받은 것이 있다**(연결이 끊겼거나 서버가 방송을 빠뜨렸다 — 이 탭은 어느 쪽인지 모른다)이고 `'diverged'`는 **받은 것을 내 문서가
 * 못 받아들인다**(보내지 않은 구조 편집과 부딪쳤다)이다. 진단이 다르면 다음 사람이 보는
 * 것도 달라야 한다.
 *
 * ## 세기가 있다 — 약한 진단이 센 진단을 덮지 않는다
 *
 * `#markStale`이 **같은 이유일 때만** 건너뛰고 이유 사이에 순위가 없으면, 복원 뒤 첫 편집
 * 프레임 하나가 `'restored'`를 `'gap'`으로 덮는다 — 복원이 `head_seq`를 밀어 올렸으므로 그
 * 프레임의 `seq`는 당연히 내 `headSeq + 1`이 아니다. **화면이 *"받지 못한 변경이 있다"*고
 * 말하는데 받지 못한 것이 없다** — 판이 통째로 갈렸다. 겪지 않은 실패를 말하는 부류다.
 *
 * **세기는 *"무엇이 무엇을 설명하는가"*로 정한다.**
 *
 * | 세기 | `reason` | 왜 그 자리인가 |
 * |---|---|---|
 * | 3 | `'restored'` | **판이 통째로 갈렸다.** 갭도 갈라짐도 그것의 결과다 — 원인이 증상을 덮으면 안 된다 |
 * | 2 | `'diverged'` | 지금 이 프레임을 내 바탕이 못 받아들인다. 가장 좁고 구체적인 실패다 |
 * | 1 | `'gap'` | 못 받은 것이 있다 |
 *
 * **숫자가 1부터인 것(0이 비어 있는 것)에는 뜻이 없다** — 세기는 **서로의 상대 순서**로만
 * 뜻이 있다.
 */
export interface RemoteStale {
  reason: 'gap' | 'diverged' | 'restored'
}

/**
 * 낡음 이유의 세기(위 표). **`#markStale`이 이것으로만 덮어쓸지 정한다** — 자리마다 조건을
 * 다시 쓰면 갈래가 늘 때 한 자리가 빠진다.
 *
 * **`Record<RemoteStale['reason'], number>`인 것이 계약이다** — 갈래를 하나 더하면 여기서
 * 컴파일이 막힌다. 세기를 안 정한 갈래가 `undefined`로 새어 나가면 비교가 조용히 거짓이 되고,
 * 그 갈래는 **무엇이든 덮는다.**
 */
const STALE_RANK: Record<RemoteStale['reason'], number> = {
  gap: 1,
  diverged: 2,
  restored: 3,
}

/**
 * `applyRemoteChange`의 결과. `MarkerChangeResult`에 없는 `'rebased'`·`'gap'`이 있고, 그쪽의 `'waiting'`은 없다 — 프레임은
 * 기다리지 않는다(«받은 프레임을 쌓아 두지 않는다»).
 */
export type RemoteChangeResult = 'applied' | 'skipped' | 'rebased' | 'gap' | 'diverged'

/**
 * `applyRemoteChange`가 돌려주는 것. **버린 것을 함께 낸다** — `loadPage`·`failEdits`가
 * 같은 모양이고 이유도 같다: 사용자는 자기 편집이 사라졌다는 것을 알아야 하고,
 * 그것을 **말하는 자리는 스토어가 아니라 부르는 쪽**이다(문안은 화면의 몫이다).
 */
export interface RemoteChange {
  result: RemoteChangeResult
  /**
   * 리베이스가 얹지 못해 버린 편집. **`'rebased'`가 아니면 항상 비어 있다.**
   *
   * 남이 내 pending의 경로를 지웠을 때다. **에러가 아니라 정상 흐름으로 다룬다** — 설계서
   * 「개인 undo/redo」가 undo의 같은 상태에 내린 판정과 **같은 성질**이다. 근거는
   * `applyRemoteChange`의 머리말에 있다.
   */
  dropped: PendingEdit[]
}

/** 아무것도 안 버린 결과. **참조를 고정한다** — `NO_WARNINGS`와 같은 이유다. */
const NO_DROPPED: PendingEdit[] = []

function unchanged(result: RemoteChangeResult): RemoteChange {
  return { result, dropped: NO_DROPPED }
}

/**
 * JSON 값 둘이 같은가(`holdsServerPage`). **객체의 키 순서를 보지 않는다** — 서버는 문서를 JSONB 로 두어 키 순서를 제
 * 규칙으로 바꿔 돌려주고, 내 바탕은 `applyOps`가 키를 붙인 순서다. `JSON.stringify`로 견주면 같은 문서가 «다르다»가 되어
 * 재조회가 늘 싣는다(되돌리기 이력을 이유 없이 잃는다). **값이 `undefined`인 키는 없는 키로 본다** — 직렬화하면 사라지는
 * 키라 서버 판에는 없다. 배열은 순서째 견준다(자식 순서가 곧 문서다).
 *
 * **재귀하지 않는다** — 깊은 문서에서 호출 스택을 쓰지 않게 훑을 쌍을 배열에 쌓는다.
 *
 * **비용은 같은 본문의 `JSON.parse`와 같은 급이다** — 같은 판이면 끝까지 훑는다(다르면 처음 어긋난 자리에서 멈춘다).
 * Node(V8) · Text 노드 N 개를 한 Section 에 둔 문서를 JSON 왕복하며 키 순서를 뒤집어 `holdsServerPage`로 견준 중앙값
 * (25 회): 1000 개(102KB) 0.23ms · 5000 개(512KB) 1.2ms · 20000 개(2MB) 5.5ms — 같은 본문의 `JSON.parse`는 0.21 · 1.0 ·
 * 4.2ms.
 */
function sameJson(left: unknown, right: unknown): boolean {
  const pairs: [unknown, unknown][] = [[left, right]]
  for (let pair = pairs.pop(); pair !== undefined; pair = pairs.pop()) {
    const [a, b] = pair
    if (a === b) continue
    if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
    if (Array.isArray(a) !== Array.isArray(b)) return false
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false
      for (let i = 0; i < a.length; i += 1) pairs.push([a[i], b[i]])
      continue
    }
    const aRecord = a as Record<string, unknown>
    const bRecord = b as Record<string, unknown>
    const aKeys = Object.keys(aRecord).filter((key) => aRecord[key] !== undefined)
    const bKeys = Object.keys(bRecord).filter((key) => bRecord[key] !== undefined)
    if (aKeys.length !== bKeys.length) return false
    for (const key of aKeys) {
      if (!Object.hasOwn(bRecord, key)) return false
      pairs.push([aRecord[key], bRecord[key]])
    }
  }
  return true
}

/** `startUndo`·`startRedo`의 결과. 건너뛴 수는 「개인 undo/redo」의 안내에 쓴다. */
export interface UndoAttempt {
  /** 큐에 들어간 편집의 id. 적용할 수 있는 항목이 없었으면 `null`이다. */
  clientOpId: string | null
  /** 적용할 수 없어 버린 항목 수. */
  skipped: number
  /**
   * 되돌리려던 항목을 막은 **남의** 잠금. 없으면 `null`이다(「소프트 잠금」의 1차 방어).
   *
   * **`skipped`와 결이 다르다 — 그래서 필드를 갈랐다.** `skipped`는 「개인 undo/redo」의 *"그 사이 다른
   * 사람이 대상 노드를 지운 경우"*이고 **되돌아오지 않는다.** 잠금은 「소프트 잠금」이 TTL·하트비트·
   * 연결 종료로 **곧 풀리게** 설계한 상태라, 그 항목은 **스택에 그대로 남는다** — 설계서 「에러 처리」의
   * 잠금 충돌 행대로 안내만 하고 자동으로 다시 보내지 않으므로, 풀린 뒤 사용자가 다시 누르면 된다.
   * 한 필드에 접으면 *"영영 못 되돌린다"*와 *"지금은 못 되돌린다"*가 같은 값이 된다.
   */
  blocked: NodeLock | null
}

/** 아무것도 시작하지 못한 결과. 부르는 쪽이 세 필드를 매번 적지 않게 여기 둔다. */
const NO_ATTEMPT: UndoAttempt = { clientOpId: null, skipped: 0, blocked: null }

type Listener = () => void

export class EditorStore {
  #state: EditorState = initialState()

  readonly #listeners = new Set<Listener>()

  readonly #nextOpId: () => string

  /**
   * 전송 루프가 돌고 있는가. **관측 상태가 아니라 제어 플래그라 `#state` 밖에 있다.**
   *
   * **훅이 아니라 스토어가 드는 것이 요점이다.** `use-edit-commit.tsx`의 `ref`가 이것을
   * 들면 `useEditCommit`을 부르는 자리가 여럿일 때 각자 자기 `ref`를 갖는다 — 실측: 그
   * 트리에서 편집을 각각 내면 `maxInFlight`가 **2**가 되어 *in-flight는 항상 하나*가 깨진다.
   * 스토어에 두면 인스턴스 수와 무관해진다.
   *
   * **부르는 자리는 여럿이다** — `routes/editor.tsx`의 undo/redo, `panels/structure-toolbar.tsx`,
   * `panels/property-panel.tsx`, `panels/interaction-panel.tsx`. **수를 적지 않는다:** 적어 둔
   * 수는 패널이 늘 때마다 낡는다. 재는 것은 수가 아니라 **인스턴스 수와 무관하다**는 성질이고, 그것을 잡는 것은
   * `test/edit/use-edit-commit.test.tsx`의 in-flight 케이스다.
   */
  #pumping = false

  /**
   * **사이 프레임을 기다리는 번호 응답**(`applyMarkerChange`의 «내 다음 번호가 아니면 사이 프레임을 기다린다») — `seq` 오름차순.
   * 관측 상태가 아니라 `#pumping`처럼 제어 값이라 `#state` 밖에 있다. 화면에 뜻하는 바는 «아직 안 얹었다»뿐이고, 끝내 못
   * 얹으면 `remoteStale`로 말한다.
   *
   * **비우는 자리는 다른 페이지를 싣는 `loadPage` · `clearPage` · `reset`, 그리고 기다림이 끝나는 자리다**(`#settleWaitingMarkers`).
   * 같은 페이지를 다시 실으면 남은 것을 그 판에 제 차례로 얹는다(`loadPage`의 끝).
   */
  #waitingMarkers: { seq: number; markerOps: PatchOp[] }[] = []

  /** `#waitingMarkers`가 비지 않은 동안만 선다 — `MARKER_FRAME_WAIT_MS` 뒤 `'gap'` 낡음. */
  #markerWaitTimer: ReturnType<typeof setTimeout> | null = null

  constructor(options: EditorStoreOptions = {}) {
    // `crypto.randomUUID`를 여기서 한 번만 참조한다. 이 줄이 이 파일의 유일한 전역
    // 의존이고, 주입하면 그것마저 없어진다. **jsdom·Node에 그 함수가 있는지는 재지
    // 않았다** — 기본 생성자로 편집을 적용하는 케이스
    // (`test/store/editor-store.test.ts`의 `기본 생성자는 인자 없이도 만들어진다`)가
    // 지나가는 것으로 그 환경에서 문자열이 나온다는 것까지만 안다.
    this.#nextOpId = options.nextOpId ?? (() => crypto.randomUUID())
  }

  /**
   * 공개 메서드를 프로토타입 메서드가 아니라 화살표 필드로 두는 이유: React가 이
   * 함수들을 인스턴스에서 떼어 내 받는다. `useSyncExternalStore(store.subscribe, ...)`가
   * 그렇고, 이벤트 핸들러도 `onClick={store.reset}` 형태로 넘길 수 있다. 프로토타입
   * 메서드면 그 순간 `this`를 잃는다.
   */
  readonly getState = (): EditorState => this.#state

  /** 구독을 등록하고 **해제 함수**를 돌려준다. */
  readonly subscribe = (listener: Listener): (() => void) => {
    this.#listeners.add(listener)
    return () => {
      this.#listeners.delete(listener)
    }
  }

  /**
   * 서버에서 받은 페이지를 싣는다. **페이지 상태를 서버 것으로 놓는 자리는 여기 하나다.**
   * 그래서 편집 큐와 undo 스택도 여기서 함께 재설정하고, **버려진 pending을 돌려준다**
   * (알림이 실제 영향받은 수를 말해야 한다 — `edit/use-edit-commit.tsx`).
   *
   * **`pageId`를 함께 받는 것이 계약이다.** 넷이 한 번의 `#apply`로 들어가므로 "어느
   * 페이지의 문서이고 어느 revision인가"가 스토어 안에서 어긋날 수 없다 — 읽는 쪽은
   * `openPageId`를 주소와 대조하기만 하면 된다(`use-editor-store.tsx`의 `useOpenDocument`).
   *
   * **왜 큐까지 여기서 비우나.** 문서·`headSeq`·`openPageId`·선택 넷만 갈아 끼우고
   * `pending`을 남기면, 실패 복구의 재조회가 그 틈에서 편집을 고아로 만든다. 실측한
   * 경로: 편집A가 409를 받아 `recover()`가 `failEdits()`로 큐를 비우고 `getPage`를 기다리는
   * 동안 편집B를 내면, B는 큐에 들어가지만 펌프가 이미 돌고 있어 전송되지 않고, 이어 도착한
   * `loadPage`가 문서를 서버 것으로 갈아 끼워도 큐에 그대로 남는다. 그 뒤 편집C가 펌프를
   * 깨우면 **B가 재조회 이후의 `baseSeq` 위에서 서버로 나간다** — 사용자는 "취소됐다"고
   * 들은 편집이 적용된 문서를 보게 된다(실측: 알림은 `편집 1개가 취소됐습니다`인데 실제로
   * 나간 요청은 `{baseSeq:42, v:"편집B"}`였고 undo 스택도 2가 됐다).
   *
   * `clearPage`가 넷을 **함께 비우는** 것과 대칭이다. 재설정이 한 곳에 있으면 다음 사람이
   * 재조회 경로를 새로 만들어도 같은 틈이 안 생긴다.
   */
  readonly loadPage = (pageId: string, document: PageDocument, headSeq: number): PendingEdit[] => {
    const { pending, undoStack, redoStack } = this.#state
    // **선택은 지우지 않고 다시 정한다** — 무엇으로 정하는지는 `#selectionFor`가 갖는다.
    // 여는 경로는 루트로 시작하고(죽은 화면을 없앤다), 같은 페이지를 다시 싣는 재조회는
    // 보고 있던 자리를 그대로 둔다.
    const selectedNodeId = this.#selectionFor(pageId, document)
    // 기다리던 번호 응답은 **이 페이지의 것일 때만** 남는다 — 아래 `#settleWaitingMarkers`.
    const samePage = this.#state.openPageId === pageId
    if (!samePage) this.#dropWaitingMarkers()
    this.#apply({
      openPageId: pageId,
      document,
      // **바탕도 서버 문서다.** 여기를 지나온 순간 낙관적 편집은 하나도 안 얹혀 있다 —
      // 아래에서 `pending`을 함께 비우는 것과 같은 사실의 다른 면이다.
      baseDocument: document,
      headSeq,
      selectedNodeId,
      // **이미 비어 있으면 같은 배열을 그대로 넘긴다**(`clearPage`와 같은 이유) — 빈 배열을
      // 새로 만들면 참조가 달라져 `pending`을 구독하는 쪽이 페이지를 열 때마다 헛일을 한다.
      pending: pending.length === 0 ? pending : [],
      // **undo·redo 스택도 함께 비운다.** 문서가 서버 것으로 되돌아갔으므로 그 전 revision의
      // `inverse`를 되보내면 서버 상태와 어긋난다. 페이지를 여는 경로의 복원은
      // `GET .../revisions?mine=true`로 **이 호출 뒤에** 따로 채운다 — 순서가 뒤바뀌면
      // 방금 채운 스택을 이것이 지운다(`routes/editor.tsx`에 그 순서가 있다).
      undoStack: undoStack.length === 0 ? undoStack : [],
      redoStack: redoStack.length === 0 ? redoStack : [],
      // **경고도 함께 버린다.** 문서가 서버 것으로 되돌아갔으므로 앞 편집의 경고는 지금
      // 문서의 것이 아니다. `getPage`는 경고를 싣지 않으므로 **다음 편집까지 모른다** —
      // 모르는 것을 "없다"로 두는 쪽을 골랐다: 남겨 두면 이미 사라진 문제를 말하게 된다.
      editWarnings: this.#state.editWarnings.length === 0 ? this.#state.editWarnings : NO_WARNINGS,
      // **낡음도 함께 푼다.** 이 자리가 페이지 상태를 서버 것으로 **놓는** 곳이므로, 여기를
      // 지나온 문서는 정의상 낡지 않았다. 안 풀면 *"새로고침하세요"*가 새로고침한 뒤에도
      // 남는다 — *"고쳤는데 고쳤다고 말하지 않는"* 부류다.
      remoteStale: null,
      documentLoads: this.#state.documentLoads + 1,
    })
    // **다시 읽은 판에도 기다리던 번호 응답을 제 차례에 얹는다**(`applyMarkerChange`의 «내 다음 번호가 아니면 …»). 그 조회가
    // 게시의 커밋 **앞**에 읽혔으면 번호는 이 판 바로 뒤의 revision 이고, 낸 탭은 그 방송을 안 받는다(연결 id 로 빠진다) —
    // 버리면 번호가 캔버스에 안 뜬 채 `headSeq`가 하나 뒤처진다. 커밋 뒤에 읽혔으면 판에 이미 있어 버린다.
    if (samePage) this.#settleWaitingMarkers()
    return pending
  }

  /**
   * **내 바탕이 곧 이 서버 판인가** — 같은 페이지 · 같은 `headSeq` · **같은 문서**일 때만 참이다. 재연결 재조회가 다시
   * 읽은 판을 싣지 않고 넘어가도 되는지를 이것 하나로 묻는다(`routes/editor.tsx`의 재연결 이펙트).
   *
   * **`headSeq`만으로는 모자란다 — 한 페이지 id 안에서도 단조가 아니다.** 지워진 페이지를 스냅샷 복원이 되살리면 같은
   * id 로 `head_seq` 0 부터 다시 센다. 끊긴 사이 그렇게 되살아나 남이 편집하면 번호가 우연히 내 것과 같아지고, 번호만
   * 보는 판은 옛 문서를 둔다 — 편집 경로가 자리(index) 기반이라 다음 편집이 **남의 노드를 덮는다**(Chrome: 되살아난
   * 페이지 앞에 남이 글을 넣어 head 1 == 내 head 1 → 안 싣고 통지 0, 내가 «원문»을 고치자 서버에서는 남의 글이 바뀌었다).
   * 복원 방송(`restored`)은 끊긴 동안 온 것이라 받지 못했다.
   *
   * **견주는 것은 `baseDocument`다 — `document`가 아니다.** 바탕이 서버가 기록한 문서이고(내 낙관적 편집이 안 섞였다),
   * `document`는 보내지 않은 편집만큼 앞서 있다.
   *
   * **비용**: 문서를 한 번 훑는다(`sameJson`) — 같은 본문의 `JSON.parse`와 같은 급이다(잰 값은 `sameJson`의 머리말).
   * 재조회는 연결이 다시 붙을 때만 돌고, 그 조회가 이미 같은 문서를 내려받아 파싱했다 — 비용이 그만큼 한 번 더 든다.
   */
  readonly holdsServerPage = (pageId: string, headSeq: number, document: PageDocument): boolean => {
    const { openPageId, baseDocument } = this.#state
    return openPageId === pageId && this.#state.headSeq === headSeq && sameJson(baseDocument, document)
  }

  /**
   * `loadPage`가 놓을 선택. **두 경로가 갈린다.**
   *
   * ## 페이지를 여는 경로 — 루트를 고른다
   *
   * 여기서 `null`을 놓으면 **페이지를 연 직후가 항상 죽은 화면**이다.
   * 브라우저에서 잰 값: 구조 편집 도구 9개 중 7개가 꺼지고(`안에 추가`의 `title`이
   * *"자식을 담을 수 있는 타입이어야 하고, children이 배열이어야 합니다"*, `아래 추가`·`삭제`가
   * *"루트가 아닌 노드를 고르세요"*), 속성 패널은 *"노드를 고르면 속성이 보입니다"*만 그린다.
   * 사용자는 아무 안내 없이 트리에서 루트를 한 번 눌러야 시작할 수 있다 — **클릭 한 번으로
   * 풀린다**는 것이 곧 스토어가 그 선택을 스스로 놓아도 된다는 근거다.
   *
   * ## 같은 페이지를 다시 싣는 경로 — 자리를 뺏지 않는다
   *
   * `loadPage`를 지나는 길은 셋이고(페이지 열기 · 재연결/복원 재조회 · 편집 실패 복구)
   * **뒤의 둘은 사용자가 아무것도 안 했는데 돈다.** 그때 선택을 루트로 옮기면 편집하던
   * 사람의 자리를 뺏는다 — 속성 패널이 다른 노드를 그리고 다음 `안에 추가`가 엉뚱한 자리에
   * 꽂힌다. 그래서 그 갈래는 들고 있던 선택을 그대로 둔다.
   *
   * **가르는 값은 `openPageId`와 문서다.** 화면은 **여는 경로에서만** 조회를 시작하며
   * `clearPage()`를 부르므로(`routes/editor.tsx`의 `CanvasFrame`), 그 둘이 아직 이 페이지의
   * 것이라는 사실이 곧 *"다시 싣는 중"*이다. `pageId` 비교만으로는 안 된다 — 같은 페이지를
   * 닫았다 다시 여는 것도 **여는** 경로다(심어서 잰다: *"마지막으로 실은 `pageId`"*를 따로
   * 들고 그것만 비교하는 구현으로 바꾸면 케이스가 죽는다).
   *
   * **`&& current !== null`은 지워도 아무 케이스도 안 죽는다 — 그래도 남긴다.** 도달할 수
   * 없기 때문이다:
   * `openPageId`와 `document`를 쓰는 자리는 `initialState`(둘 다 `null`)·`loadPage`(둘 다
   * 세팅)·`clearPage`(둘 다 `null`) 셋뿐이라 **둘은 함께 움직인다.**
   *
   * 남기는 근거는 `structure-toolbar.tsx`의 `removeSelected`가 `commitOps` 반환값을 남긴
   * 것과 같다 — **지금 통과하는 이유가 다른 성질에 기대고 있다.** 여기서는 그 성질이
   * *"`clearPage`가 넷을 함께 비운다"*이고(그 성질은 `clearPage는 openPageId·문서·headSeq·
   * 선택을 비운다`가 지킨다), 깨지는 날 이 조건이 마지막 방벽이다. 없으면 그때 다시 싣는
   * 갈래로 새어 **죽은 화면이 조용히 돌아온다** — 이 함수가 없애려던 바로 그것이다.
   * 같은 파일의 형제 판정 둘(`applyRemoteChange`·`ackEdit`)도 *"이 페이지가 실려 있나"*를
   * `openPageId !== pageId || document === null`로 **둘 다** 본다.
   *
   * **사용자가 명시적으로 푼 선택(`selectNode(null)` — 캔버스 빈 곳)도 그 갈래에 들어간다.**
   * 페이지가 열려 있는 동안의 `null`은 사용자가 놓은 것이므로 재조회가 되살리지 않는다.
   *
   * ## 사라진 노드는 놓는다
   *
   * 다시 싣는 갈래에서 들고 있던 선택이 새 문서에 없으면 `null`이다 — 남이 지웠거나 스냅샷
   * 복원으로 문서가 통째로 갈린 판이다. 그대로 두면 선택이 **존재하지 않는 노드**를 가리키고,
   * 그 위에서 만든 편집은 없는 경로를 건드린다. 여기서도 루트로 옮기지는 않는다: 사용자가
   * 하지 않은 재조회가 자리를 옮기는 것은 같은 이유로 안 된다.
   *
   * ## 잠긴 자리는 자동으로도 고르지 않는다
   *
   * 여는 경로의 루트 선택도 「소프트 잠금」의 1차 방어를 지난다. `selectNode`가 막는 것을 이 자리가
   * 뒷문으로 통과시키면 **판정이 두 벌**이 되고, 그 순간 화면은 남이 잠근 서브트리를 고른
   * 채로 시작한다. 루트는 문서 전체의 조상이므로 **남이 그 페이지 안 어디든 잡고 있으면**
   * 부딪친다 — 그때는 `null`이다.
   */
  #selectionFor(pageId: string, document: PageDocument): string | null {
    const { openPageId, document: current, selectedNodeId } = this.#state
    if (openPageId === pageId && current !== null) {
      if (selectedNodeId === null) return null
      return findNodePath(document.root, selectedNodeId) === undefined ? null : selectedNodeId
    }
    const rootId = document.root.id
    return this.#blocksSelection(pageId, document, rootId) === null ? rootId : null
  }

  /**
   * 서버가 준 내 revision으로 undo 스택을 채운다.
   *
   * **인자는 `seq` 내림차순(최신이 앞)이다** — 서버 응답 순서 그대로 받는다. 이 스토어의
   * 스택은 **끝이 top**이므로 여기서 뒤집어 싣는다. (*"뒤집지 마라"*는 스택을 "앞이 top"으로
   * 두는 표현을 전제한 말이라 여기에 안 맞는다. 재는 것은 배열 모양이 아니라
   * **어느 것이 먼저 undo되는가**이고, `restoreUndoStack은 최신이 top이 되게 싣는다`가
   * 그것을 고정한다.)
   *
   * **redo 스택은 비운다.** 복원한 항목은 redo를 갖지 않는다 — redo는 세션 안에서 undo를
   * 눌러야 생긴다.
   */
  readonly restoreUndoStack = (revisions: readonly RevisionRef[]): void => {
    const { redoStack } = this.#state
    this.#apply({
      undoStack: [...revisions].reverse(),
      redoStack: redoStack.length === 0 ? redoStack : [],
    })
  }

  /**
   * **서버가 코멘트 경로에서 낸 문서 변화를 내 문서에 반영한다**.
   *
   * 코멘트를 달거나 지우거나 재번호하면 서버가 노드의 `marker`를 바꾸고 revision을
   * 남긴다. 그 변화를 여기서 받아야 캔버스에 번호가 뜨고, `headSeq`가 서버와
   * 맞아 다음 편집의 `baseSeq`가 어긋나지 않는다.
   *
   * **문서를 통째로 받지 않고 `ops`를 받는 것이 요점이다.** 서버가 낸 문서에는 아직 보내지
   * 않은 낙관적 편집이 없으므로, 그것으로 갈아 끼우면 **사용자가 방금 친 값이 화면에서
   * 사라진다.** 같은 ops를 내 문서 위에 얹으면 그 편집이 그대로 남는다.
   *
   * **`loadPage`가 아닌 이유도 같다** — 그쪽은 페이지 상태를 서버 것으로 **놓는** 자리라
   * 큐와 undo·redo 스택을 함께 비운다. 코멘트를 달 때마다 undo가 사라지면 안 된다.
   *
   * ## 문서와 `headSeq`는 함께 움직이거나 둘 다 안 움직인다
   *
   * `applyOps`가 던질 수 있다 — 보내지 않은 구조 편집이 그 노드를 이미 지웠으면 경로가
   * 없다. **그때 `headSeq`만 올리지 않는다.** 올리면 *"화면에는 번호가 없는데 다음 편집은
   * 번호가 있는 revision 위에서 만들어지는"* 상태가 되고, 그 어긋남은 아무도 모르는 채
   * 남는다.
   *
   * 둘 다 안 움직이면 **다음 편집이 409를 받고 복구 경로가 페이지를 다시 받는다** —
   * 시끄럽지만 수렴한다. 조용히 갈라지는 쪽보다 낫다.
   *
   * ## 결과가 셋인 것이 계약이다
   *
   * `boolean`을 내면 `false`의 원인 셋이 한 값으로 접히고 **부르는 쪽이 그것을 버리게 된다.**
   * 셋은 사용자에게 뜻하는 바가 서로 다르다 — **`null`과 빈 값을 같은 것으로 접는 그
   * 부류다.**
   *
   * | 결과 | 언제 | 화면이 할 일 |
   * |---|---|---|
   * | `'applied'` | 반영했다 — 또는 **그 revision 이 이미 내 문서에 있다**(`seq <= headSeq` — 그 프레임이 응답보다 먼저 왔다) | 없다 |
   * | `'skipped'` | **다른 페이지가 열려 있거나 문서가 없다** | 없다 — 그 화면은 이미 딴 것을 보고 있다 |
   * | `'diverged'` | **`applyOps`가 던졌다** | **말해야 한다** — 서버에는 번호가 있는데 내 화면에는 없다 |
   * | `'waiting'` | **`seq`가 내 다음 번호보다 앞이다** — 사이 프레임을 기다린다(아래 절) | 없다 — 끝내 못 얹으면 스토어가 `remoteStale`로 말한다 |
   *
   * `'diverged'`를 조용히 넘기면 *"코멘트는 달렸는데 캔버스에 번호가 없고 아무도 그것을
   * 말하지 않는"* 상태가 된다.
   *
   * ## 내 다음 번호가 아니면 사이 프레임을 기다린다
   *
   * `markerOps`의 경로는 **서버가 `seq - 1` 문서에서 센 것이다.** 그 문서가 내 문서일 때만(`seq === headSeq + 1`) 내 문서에
   * 얹어 맞는다. 게시는 번호를 페이지 행을 잠근 **뒤**의 문서로 매기므로(`apps/api/README.md` 「코멘트와 번호」), 게시가 잠금을
   * 기다리는 동안 남의 편집이 커밋되면 응답의 `seq`는 내가 아직 못 받은 revision **뒤**의 것이다. 그 프레임이 응답보다 늦게
   * 닿는 판에서 번호를 그냥 얹으면 **조용히 틀린다** — 남이 노드를 옮겼으면 번호가 **다른 노드**에 붙고, `headSeq`가 `seq`로
   * 뛰어 늦게 온 그 프레임은 «이미 아는 번호»로 버려지고(갭도 안 선다), 그 뒤 경로로 낸 편집이 서버에서 **남의 노드를
   * 고친다**(jsdom: head 7 `[n_a, n_b]` → 남이 `n_b`를 맨 앞으로(8) → 게시(9)의 응답이 먼저 닿으면 화면 `n_a#1 n_b` · 서버
   * `n_b#1 n_a` · 낡음 없음).
   *
   * **그래서 기다렸다가 제 차례에 얹는다** — 사이 프레임이 오면 `applyRemoteChange`가 그것을 얹은 뒤 이어서 얹는다. 곧바로
   * 낡음(`'gap'`)을 세우고 다시 읽게 하는 길은 고르지 않았다: 그 프레임은 응답보다 **먼저 나갔고**(`MARKER_FRAME_WAIT_MS`)
   * 몇 ms 늦을 뿐이라, 그 길은 흔한 판마다 받지 못한 것이 없는데 «받지 못한 변경이 있다»를 세운다 — 낡음은 프레임이 풀지
   * 않으므로 새로고침까지 남는다. 서버가 게시에 `baseSeq`를 받아 그 문서의 경로를 내는 길도 안 닫는다 — 경로가 맞아도 사이
   * revision 은 여전히 빠진 채 `headSeq`만 뛴다.
   *
   * **끝내 안 오면 말한다** — `MARKER_FRAME_WAIT_MS` 안에 제 차례가 안 오면 기다리던 것을 버리고 `'gap'` 낡음을 세운다
   * (`#settleWaitingMarkers`). 기다리는 동안 문서 · `headSeq`는 안 움직인다 — 그 사이 낸 편집은 옛 `baseSeq`로 나가 409 를 받고
   * 다시 읽는다(위 «둘 다 안 움직이면»과 같은 수렴).
   *
   * ## `markerOps`가 비면 `headSeq`도 안 건드린다
   *
   * 그때 `headSeq`를 `seq`로 맞추면 **틀린다** — 그 `seq`는 서버가 요청을 받은
   * 시점의 `head_seq`이고 **내 문서가 그 revision 위에 서 있다는 뜻이 아니다.** 내가
   * 뒤처져 있으면 그 값을 받아 *"나는 최신이다"*라고 믿게 되고, 앞서 있으면(내 낙관적
   * 편집이 ack된 뒤라면) 값이 **내려간다.** 서버가 아무것도 안 바꿨으면 클라이언트도
   * 아무것도 안 바꾸는 것이 맞는다.
   */
  readonly applyMarkerChange = (
    pageId: string,
    change: { seq: number; markerOps: PatchOp[] },
  ): MarkerChangeResult => {
    const { openPageId, document, baseDocument, headSeq } = this.#state
    // 다른 페이지로 옮긴 뒤 도착한 응답이다. 여기서 `headSeq`를 건드리면 새 페이지의
    // 편집이 남의 revision 번호 위에서 만들어진다(`ackEdit`의 늦은 ack 가드와 같은 자리).
    if (openPageId !== pageId || document === null || baseDocument === null) return 'skipped'

    // 문서가 안 바뀐 요청이다(이미 번호가 있는 노드에 코멘트를 더 달았거나, 마지막이 아닌
    // 코멘트를 지웠거나, 바꿀 것 없는 재번호). **아무것도 안 건드린다**(위 머리말).
    if (change.markerOps.length === 0) return 'applied'

    // **그 revision 의 프레임이 먼저 왔다** — 서버는 연결 id 를 안 실은 요청(코멘트 삭제 · 재번호)의 방송을 낸 탭에도
    // 보낸다. 한 번 더 얹으면 같은 변경이 두 번 들어간다: 번호를 지우는 `remove`는 두 번째에 던져 **번호가 이미 지워진
    // 화면에 «반영하지 못했습니다»**가 서고(jsdom), 그 뒤 revision 까지 받았으면 옛 문서의 경로를 새 문서에 얹는다.
    if (change.seq <= headSeq) return 'applied'

    if (change.seq !== headSeq + 1) {
      this.#waitForFrames(change)
      return 'waiting'
    }

    return this.#applyMarkerOps(change) ? 'applied' : 'diverged'
  }

  /**
   * 번호 ops 를 문서와 바탕에 얹고 `headSeq`를 `seq`로 옮긴다. **`seq === headSeq + 1`일 때만 부른다**(`applyMarkerChange`의
   * «내 다음 번호가 아니면 사이 프레임을 기다린다»). 던지면 아무것도 안 움직이고 거짓이다.
   */
  #applyMarkerOps(change: { seq: number; markerOps: PatchOp[] }): boolean {
    const { document, baseDocument } = this.#state
    if (document === null || baseDocument === null) return false
    let next: PageDocument
    let nextBase: PageDocument
    try {
      next = applyOps(document, change.markerOps)
      // **바탕에도 같이 얹는다**. 이 변경은 서버가 이미 기록한 것이므로 바탕이
      // 그것을 모르면 다음 리베이스가 **번호 없는 문서** 위에서 만들어진다. 둘 중 하나만
      // 던지면 아무것도 안 움직인다 — 셋(문서·바탕·`headSeq`)이 함께 가는 자리다.
      nextBase = applyOps(baseDocument, change.markerOps)
    } catch {
      // 보내지 않은 구조 편집이 그 노드를 이미 지웠다. **`headSeq`도 안 올린다** —
      // 올리면 문서와 revision 번호가 조용히 갈라진다.
      return false
    }

    this.#apply({ document: next, baseDocument: nextBase, headSeq: change.seq })
    return true
  }

  /** 번호 응답을 사이 프레임이 올 때까지 든다. 처음 들 때 한도를 건다(`MARKER_FRAME_WAIT_MS`). */
  #waitForFrames(change: { seq: number; markerOps: PatchOp[] }): void {
    const waiting = this.#waitingMarkers.filter((held) => held.seq !== change.seq)
    waiting.push({ seq: change.seq, markerOps: change.markerOps })
    waiting.sort((a, b) => a.seq - b.seq)
    this.#waitingMarkers = waiting
    this.#markerWaitTimer ??= setTimeout(() => {
      this.#markerWaitTimer = null
      this.#settleWaitingMarkers('gap')
    }, MARKER_FRAME_WAIT_MS)
  }

  /**
   * 기다리던 번호 응답을 **제 차례가 온 만큼** 얹는다 — 프레임을 얹은 뒤(`applyRemoteChange`) · 같은 페이지를 다시 실은 뒤
   * (`loadPage`) 부른다. `giveUp`을 주면 남은 것을 버리고 그 낡음을 세운다(한도를 넘겼다). 얹다가 던지면 `'diverged'`다.
   *
   * **갭 · 갈라짐 프레임에서는 부르지 않는다** — 그때 이미 선 낡음이 기다리던 번호의 몫까지 말하고(한도가 세우는 `'gap'`은 그보다
   * 약하거나 같다), 사이 revision 이 안 얹혔으니 기다리던 것도 제 차례가 안 온다.
   */
  #settleWaitingMarkers(giveUp?: RemoteStale['reason']): void {
    if (this.#waitingMarkers.length === 0) return
    if (giveUp === undefined) {
      while (this.#waitingMarkers.length > 0) {
        const next = this.#waitingMarkers[0]!
        // 아직 사이 프레임이 남았다 — 한도를 그대로 두고 계속 기다린다.
        if (next.seq > this.#state.headSeq + 1) return
        this.#waitingMarkers = this.#waitingMarkers.slice(1)
        // 그 revision 의 프레임이 왔다(연결 id 를 안 실은 요청이면 낸 탭에도 방송이 온다) — 이미 문서에 있다.
        if (next.seq <= this.#state.headSeq) continue
        if (!this.#applyMarkerOps(next)) {
          giveUp = 'diverged'
          break
        }
      }
    }
    if (giveUp !== undefined) this.#markStale(giveUp)
    this.#dropWaitingMarkers()
  }

  /** 기다리던 번호 응답과 한도를 버린다 — `#waitingMarkers`의 «비우는 자리». */
  #dropWaitingMarkers(): void {
    if (this.#markerWaitTimer !== null) clearTimeout(this.#markerWaitTimer)
    this.#markerWaitTimer = null
    this.#waitingMarkers = []
  }

  /**
   * **남이 낸 문서 변경을 내 문서에 얹는다**(설계서 「정방향 흐름」의 *"[타인] ops 수신 → 자기 pending 위에
   * 리베이스 적용"*).
   *
   * `applyMarkerChange`와 같은 모양이지만 갈래가 더 있다. 그쪽은 코멘트 응답을 받는
   * 자리이고 이쪽은 WebSocket 프레임을 받는 자리인데, 결정적으로 다른 것은 **내가 그 사이에
   * 보내지 않은 편집을 들고 있을 수 있다**는 점이다.
   *
   * ## 리베이스는 바탕을 갈아 끼우고 내 pending을 다시 얹는 것이다
   *
   * ```
   * baseDocument ← baseDocument + 남의 ops      // 서버가 기록한 순서 그대로
   * document     ← baseDocument + pending…      // 내 낙관적 편집을 그 위에 다시
   * ```
   *
   * **낙관 문서에 남의 `ops`를 그냥 얹는 것이 아니다.** 그러면 순서가 서버와 반대가 되어 두
   * 문서가 **조용히** 갈린다. 바탕을 따로 드는 이유가 그것이고, 근거는
   * `baseDocument`의 머리말에 있다.
   *
   * **`@wirebound/schema`의 `applyOps` 하나면 된다** — 변환(OT) 함수가 필요하지 않다.
   * 재서 확인한 것 둘: `applyOps`는 입력 문서를 건드리지 않고(바탕을 그대로 들고 있어도
   * 된다), 이렇게 만든 문서는 **서버가 내 pending을 적용했을 때의 문서와 같다**(같은 바탕에
   * 같은 순서로 같은 ops를 적용하기 때문이다).
   *
   * **그 등식이 지켜지는 조건이 갭 검사다.** 바탕이 서버 문서와 같아야 하므로, 이 프레임이
   * 내 다음 번호일 때만 얹는다. **그 전제를 `remoteStale === null`로 읽으면 안 된다** — 낡음이 없다는 것은 *"못 받은 것을
   * 아직 알아채지 못했다"*는 뜻일 뿐이고(끊긴 동안의 프레임은 번호 차이로 드러나기 전까지 안 보인다), 반대로 낡음이 선
   * 뒤에도 다음 번호는 온다. 그래서 검사하는 것은 낡음이 아니라 `change.seq === headSeq + 1`이다.
   *
   * **갭은 pending이 있든 없든 검사한다** — **갭이 난 바탕 위에 내 pending을 다시 얹으면
   * 서버와 다른 문서가 나오고, 그것은 조용하다.**
   *
   * ## 얹지 못하는 pending은 버린다 — 에러가 아니다
   *
   * 남이 내 pending이 가리키는 노드를 지웠으면 그 편집은 새 바탕에 얹히지 않는다. 설계서
   * 「개인 undo/redo」가 undo의 같은 상태를 이렇게 정한다: *"적용 불가는 에러가 아니라 **정상 흐름으로
   * 처리한다** — 스택에서 제거하고 안내한 뒤 다음으로 넘어간다."*
   *
   * **판정: 같은 성질이다.** 셋이 같다 — (1) 원인이 같다(남이 그 노드를 지웠다), (2) 내가
   * 되돌리거나 다시 시도할 방법이 없다, (3) 멈추는 것이 답이 아니다(나머지 항목은 그대로
   * 얹힌다). **다른 것은 무엇이 버려지는가뿐이다** — undo에서는 되돌릴 기회를, 여기서는 보내지
   * 않은 편집을 잃는다. 그래서 **버린 것을 돌려주고**(위 `RemoteChange`) 부르는 쪽이
   * 말한다. 버렸다는 것을 말하지 않으면 사용자가 친 값이 조용히 사라진다.
   *
   * ## 받은 프레임을 쌓아 두지 않는다
   *
   * 리베이스는 프레임을 **미루지 않으므로** 쌓아 둘 것 자체가 생기지 않는다. 남는 것은
   * `'gap'` 갈래뿐이고 그쪽도 안 쌓는다(모르는 번호의 ops는 애초에 받은 적이 없다). 보내는
   * 쪽은 REST든 WS든 같은 `applyEdit`을 지나 `baseSeq` 일치를 요구받는다(`apps/api/src/ws/patch.ts`).
   *
   * ## 갈래 표
   *
   * | 결과 | 언제 | `remoteStale` |
   * |---|---|---|
   * | `'skipped'` | 다른 페이지가 열려 있거나 문서가 없거나 **이미 아는 seq**이거나 **내가 낸 편집이 되돌아왔다** | 그대로 |
   * | `'gap'` | **`seq`가 내 다음 번호가 아니다** | `'gap'` |
   * | `'diverged'` | 바탕에 `applyOps`가 던졌다 | `'diverged'` |
   * | `'applied'` | 얹었다. pending이 없었다 | 그대로 — **프레임은 낡음을 풀지 않는다**(푸는 것은 `loadPage`·`clearPage`) |
   * | `'rebased'` | 얹고 내 pending을 그 위에 다시 올렸다 | 그대로 |
   *
   * ## 자기 편집이 되돌아오는 창 — 리베이스가 그것을 두 배로 만든다
   *
   * 보통은 서버가 발신자를 제외한다(`ws/broadcast.ts`의 `except`). **성립하지 않는
   * 창이 있다:** 편집이 REST로 나가는 동안(소켓이 아직 안 열려 `x-wb-connection-id`가 없다)
   * 그 소켓이 열려 룸에 들어오면, 뒤이어 나가는 브로드캐스트를 **낸 사람이 되받는다.**
   *
   * **리베이스는 그것을 바탕에 얹고
   * 내 pending을 그 위에 다시 올리므로 같은 편집이 두 번 들어간다** — 바탕과 문서 둘 다
   * 서버와 갈라지고, 그 갈라짐은 조용하다. 그래서 갈래가 둘이다:
   *
   * | 언제 | 무엇이 막나 |
   * |---|---|
   * | 이미 ack된 내 편집 | `seq <= headSeq` |
   * | **아직 ack 안 된 내 편집** | **`clientOpId`가 내 pending에 있다** |
   *
   * 뒤의 것을 위해 서버가 그 값을 프레임에 싣는다(`ws/protocol.ts`).
   *
   * **`headSeq`와 두 문서는 함께 움직이거나 셋 다 안 움직인다** — `applyMarkerChange`의
   * 그 문단이 여기에도 그대로 적용된다.
   */
  readonly applyRemoteChange = (
    pageId: string,
    change: { seq: number; ops: PatchOp[]; warnings: ValidationIssue[]; clientOpId?: string },
  ): RemoteChange => {
    const { openPageId, document, baseDocument, headSeq, pending } = this.#state
    if (openPageId !== pageId || document === null || baseDocument === null) return unchanged('skipped')
    // 이미 아는 revision이다(ack이 이미 지나간 내 편집을 포함한다).
    if (change.seq <= headSeq) return unchanged('skipped')
    // **아직 ack되지 않은 내 편집이 되돌아온 것이다**(위 머리말의 되받기 창). 얹으면 같은
    // 편집이 바탕과 문서에 두 번 들어간다 — 그 갈라짐은 조용하다.
    //
    // **큐 전체를 본다(`some`) — 머리만 보지 않는다.** 지금 되받을 수 있는 것은 이미 보낸
    // 편집뿐이고 보내는 것은 언제나 머리이므로 **두 구현이 관측상 같다**(머리만 보게 바꿔도
    // 죽는 케이스가 없다). 넓은 쪽을 두는 이유는 그 등식이 *"in-flight는 항상 하나"*에 매여
    // 있어서다 — 그 전제가 흔들리면 머리만 보는 판은 조용히 틀린다.
    if (change.clientOpId !== undefined && pending.some((edit) => edit.clientOpId === change.clientOpId)) {
      return unchanged('skipped')
    }

    // 놓친 revision이 있다. **얹지도 `headSeq`를 올리지도 않는다**(위 머리말).
    if (change.seq !== headSeq + 1) {
      this.#markStale('gap')
      return unchanged('gap')
    }

    let nextBase: PageDocument
    try {
      nextBase = applyOps(baseDocument, change.ops)
    } catch {
      this.#markStale('diverged')
      return unchanged('diverged')
    }

    // **경고도 갈아 끼운다.** 서버가 보내는 것은 *"이 편집 뒤 문서에 남은 경고 전부"*이고
    // (`editWarnings`의 계약), 얹었다는 것은 내 바탕이 그 문서가 됐다는 뜻이다. 안 갈면
    // 남이 만든 경고를 **편집을 낸 사람만** 보게 되어, 접속 방식 대신 *"누가 냈느냐"*로
    // 갈라짐이 되살아난다.
    //
    // **낡음(`remoteStale`)은 건드리지 않는다 — 프레임은 얹혀도 낡음을 풀지 않는다.** 푸는 것은 판을 서버 것으로 놓는
    // `loadPage`·`clearPage` 둘뿐이다. 낡음이 섰다는 것은 **이 탭이 끝내 못 받은 revision 이 있다**는 뜻이다 — 갭이면
    // 번호가 건너뛴 프레임을 버렸고(서버는 지난 프레임을 다시 보내지 않는다), 갈라짐이면 제 번호의 프레임을 못 얹었고,
    // 복원이면 판이 통째로 갈렸다. 그 뒤 «다음 번호» 프레임이 와도 빠진 것은 여전히 빠져 있다 — 늦게 온 그 번호(서버가
    // 순서를 바꿔 보냈거나, 커밋 답을 잃은 편집을 다시 낸 재방송)를 얹고 낡음을 풀면 **빠진 revision 을 남긴 채 화면이
    // 최신처럼 보인다**(jsdom: `loadPage(…, 4)` → 6 → 늦은 5 가 `applied` · head 5 · 낡음 `null` · 6 의 노드 없음).
    //
    // **그 프레임은 얹는다 — 버리지 않는다.** 번호가 이어지므로 바탕 + 그 ops 는 서버의 그 revision 문서와 같다(리베이스의
    // 등식이 검사하는 것은 낡음이 아니라 번호다 — 위 머리말). 얹으면 화면이 서버에 한 걸음 더 가깝고 낡았다는 말은
    // 그대로 서 있다. 버려도 낡음은 그대로라 얻는 것이 없다.
    const dropped = this.#rebaseOnto(nextBase, change.seq, {
      editWarnings: change.warnings.length === 0 ? NO_WARNINGS : change.warnings,
    })
    // **이 프레임을 기다리던 번호 응답이 있으면 이어서 얹는다**(`applyMarkerChange`의 «내 다음 번호가 아니면 …»).
    this.#settleWaitingMarkers()
    return { result: pending.length === 0 ? 'applied' : 'rebased', dropped }
  }

  /**
   * 바탕을 갈아 끼우고 그 위에 `pending`을 **순서대로 다시 얹는다.** 얹히지 않는 것은
   * 버리고 돌려준다.
   *
   * **셋이 한 번의 `#apply`로 움직인다**(바탕·문서·`headSeq`). 나눠 쓰면 그 사이 커밋에서
   * 문서와 revision 번호가 어긋난 상태가 화면에 보인다 — `applyMarkerChange`가 *"둘 다
   * 움직이거나 둘 다 안 움직인다"*로 못박은 것과 같은 자리다.
   *
   * **버린 것이 없으면 `pending` 배열의 참조를 그대로 둔다** — 새 배열을 만들면 `#apply`가
   * 변경으로 보고 큐를 구독하는 쪽이 프레임마다 헛일을 한다(`NO_WARNINGS`와 같은 이유).
   */
  #rebaseOnto(nextBase: PageDocument, seq: number, extra: Partial<EditorState>): PendingEdit[] {
    const { pending } = this.#state
    const kept: PendingEdit[] = []
    const dropped: PendingEdit[] = []
    let document = nextBase

    for (const edit of pending) {
      let next: PageDocument
      try {
        next = applyOps(document, edit.ops)
      } catch {
        dropped.push(edit)
        continue
      }
      document = next
      kept.push(edit)
    }

    this.#apply({
      ...extra,
      baseDocument: nextBase,
      document,
      headSeq: seq,
      pending: dropped.length === 0 ? pending : kept,
    })
    return dropped
  }

  /**
   * **판이 통째로 갈렸다고 표시한다.** 남이 스냅샷을 복원하면 페이지가 사라지거나 생기고
   * 문서가 통째로 바뀌므로 `ops`로 표현되지 않는다 — 얹을 것이 없고, 할 수 있는 정직한
   * 일은 그 사실을 말하는 것뿐이다.
   */
  readonly markRestored = (): void => {
    this.#markStale('restored')
  }

  /**
   * 낡음을 표시한다. **자기보다 센 진단은 덮지 않는다**(`RemoteStale`의 세기 표).
   *
   * **같은 이유면 아무것도 안 하는 것도 이 비교가 함께 한다**(`>=`) — 같은 값을 다시 넣으면
   * 참조가 달라져 구독자가 프레임마다 헛일을 한다(`NO_WARNINGS`와 같은 이유).
   */
  #markStale(reason: RemoteStale['reason']): void {
    const current = this.#state.remoteStale
    if (current !== null && STALE_RANK[current.reason] >= STALE_RANK[reason]) return
    this.#apply({ remoteStale: { reason } })
  }

  /**
   * 열린 페이지가 없어졌을 때. `loadPage`의 짝이다 — `openPageId`·문서·`headSeq`·선택을
   * 함께 비운다. 넷이 한 번에 움직여야 "문서는 없는데 어느 페이지가 열려 있다고 말하는"
   * 중간 상태가 생기지 않는다.
   *
   * 모드·뷰포트 폭·줌은 **건드리지 않는다.** 그 셋은 페이지가 아니라 보는 사람에게 매인
   * 값이라, 페이지를 닫았다고 되돌리면 사용자가 맞춰 둔 화면이 이유 없이 초기화된다.
   * 프로젝트를 떠날 때 그것까지 지우는 것은 `reset`의 몫이다.
   */
  readonly clearPage = (): void => {
    const { pending, undoStack, redoStack } = this.#state
    this.#dropWaitingMarkers()
    this.#apply({
      openPageId: null,
      document: null,
      baseDocument: null,
      headSeq: 0,
      selectedNodeId: null,
      // **편집 상태도 함께 비운다.** 빠뜨리면 페이지를 옮긴 뒤 앞 페이지의 pending이 새
      // 페이지 경로로 전송되고, 앞 페이지의 revision이 새 페이지의 undo 스택에 남는다.
      //
      // **이미 비어 있으면 같은 배열을 그대로 넘긴다.** 빈 배열을 새로 만들어 넣으면
      // 참조가 달라져 `#apply`가 변경으로 보고, 문서가 없는 상태에서 부르는 `clearPage`가
      // 매번 알리게 된다 — 화면이 페이지를 열 때마다 조회 시작 시점에 이것을 부르므로
      // (`routes/editor.tsx`의 `CanvasFrame`) 구독자가 페이지마다 헛일을 한다.
      // (`clearPage는 이미 비어 있으면 알리지 않는다`가 이 줄을 지킨다.)
      pending: pending.length === 0 ? pending : [],
      undoStack: undoStack.length === 0 ? undoStack : [],
      redoStack: redoStack.length === 0 ? redoStack : [],
      editStatus: 'idle',
      editFailure: null,
      editWarnings: this.#state.editWarnings.length === 0 ? this.#state.editWarnings : NO_WARNINGS,
      remoteStale: null,
    })
  }

  /**
   * 편집을 **낙관적으로 적용하고** 큐에 넣는다. 성공하면 그 편집의 `clientOpId`,
   * 적용할 수 없으면 `null`이다 — `null`은 **요청을 보내지 마라**는 신호다.
   *
   * `applyOps`가 던지는 것은 클라이언트가 만든 잘못된 ops다(없는 경로 등). 서버에 보내
   * 봐야 409/422를 받고 재조회 비용만 든다. 그 자리에서 멈추는 편이 싸다.
   *
   * **`headSeq`는 여기서 올리지 않는다.** 그 값은 서버가 revision을 기록한 뒤에야 정해지고
   * (`ackEdit`), 미리 올리면 다음 편집이 아직 없는 revision을 `baseSeq`로 쓴다.
   */
  readonly applyEdit = (ops: PatchOp[], kind: EditKind = 'edit'): string | null => {
    const { document, redoStack } = this.#state
    if (document === null) return null

    let next: PageDocument
    try {
      next = applyOps(document, ops)
    } catch {
      // **id를 소비하지 않는다** — 생성기를 주입한 의미(결정적인 id)가 실패한 편집 때문에
      // 어긋나지 않도록 발급을 적용 뒤로 미룬다.
      return null
    }

    return this.#enqueue(next, ops, kind, {
      // **새 편집은 redo 스택을 비운다**(표준 undo 의미론 — 되돌아갈 미래가 없어진다).
      // undo·redo가 만드는 항목은 그 자리를 건드리면 안 된다: undo가 자기 redo를 지운다.
      redoStack: kind === 'edit' && redoStack.length > 0 ? [] : redoStack,
    })
  }

  /**
   * 문서와 큐를 한 번에 옮긴다. `applyEdit`·`startUndo`·`startRedo`가 공유한다 —
   * 셋이 각자 `#apply`를 부르면 "낙관 적용과 큐 삽입이 함께 일어난다"가 세 벌이 된다.
   */
  #enqueue(
    document: PageDocument,
    ops: PatchOp[],
    kind: EditKind,
    extra: Partial<EditorState>,
  ): string {
    const clientOpId = this.#nextOpId()
    // `pending`을 **새 배열로** 만드는 것이 계약이다 — `#apply`가 참조 비교를 하므로
    // 제자리에서 `push`하면 알림이 안 간다.
    this.#apply({
      ...extra,
      document,
      pending: [...this.#state.pending, { clientOpId, ops, baseSeq: this.#state.headSeq, kind }],
    })
    return clientOpId
  }

  /**
   * undo 한 단계. 스택 top부터 **적용 가능한 것을 찾아** 낙관적으로 적용하고 큐에 넣는다.
   *
   * **적용 불가는 에러가 아니라 정상 흐름이다**(「개인 undo/redo」) — 그 항목을 버리고 다음으로
   * 넘어간다. 그 경로가 없으면 다른 사람이 지운 노드를 되돌릴 때 스택 맨 위에 갇힌다.
   * 전부 적용 불가면 스택을 비우고 `clientOpId: null`을 낸다 — 남겨 두면 다음 undo가 같은
   * 항목을 또 시도한다.
   *
   * # 남의 잠금 안을 건드리는 되돌리기는 여기서 멈춘다 (「소프트 잠금」의 1차 방어)
   *
   * **되돌리기의 판정 단위는 «고른 노드»가 아니라 `inverse` **ops**다.** 그래서 서버가
   * 재는 것과 **같은 함수에 같은 입력**을 넣을 수 있다 — 툴바는 그럴 수 없어 «전부 끈다»를
   * 골랐지만(`edit/structure-actions.ts`의 표 — 선택이 편집보다 엄격한 대가), 되돌리기에는
   * 선택이 없으므로 맞출 것이 ops뿐이다.
   *
   * ## 무엇을 보증하고 무엇을 안 보증하나 — 좁혀 적는다
   *
   * 이것은 **낙관적 1차 방어**다. 보증은 *"**누를 때** 서 있던 잠금"*까지다.
   *
   * - **막는다 — 누를 때 이미 선 잠금.** 그 범위 안에서 과차단도 과소차단도 0이다(아래 표의
   *   여섯 줄이 그것이고, 요청이 아예 안 나가므로 스택도 그대로다).
   * - **못 막는다 — 누름과 전송 사이에 오는 잠금.** 화면이 잠금을 아는 것은 WS 프레임이
   *   도착한 뒤이고, `#startFrom`이 통과시킨 뒤 요청이 서버에 닿기까지의 창은 남는다. 그때는
   *   요청이 나가고 **서버의 2차 방어**(`apps/api`의 `lock/check.ts`)가 423으로 받으며,
   *   아래 «이력을 통째로 잃는다»가 **그대로 밟힌다.** 재서 확인했다 — 스택 2에서 눌러
   *   `[200, 200, 423]` · **undo 0 · redo 0**.
   *
   * **그 창은 이 판정이 지울 수 있는 것이 아니다** — 어느 낙관적 1차 방어에도 있다. 지우려면
   * 423을 받은 `recover`가 *"이력 전부가 아니라 그 항목만 버린다"*로 바뀌어야 하고(설계서
   * 「에러 처리」가 undo 실패에 대해 적은 그것), 그것은 `loadPage`가 두 스택을 비우는 자리를 바꾸는 일이다.
   *
   * **막는 자리가 훅이 아니라 여기인 것은 구조 편집을 툴바가 아니라 `useStructureCommands`에서
   * 끄는 것과 같은 이유다**(그래야 단축키까지 막힌다). **그런데 되돌리기에는 막을
   * 단축키가 아예 없다 — 세어서 확인했다.** 키를 받는 자리는 두 트리의 `SHORTCUTS`뿐이고
   * (`panels/structure-tree.tsx` **일곱**, `panels/menu-tree.tsx` **다섯**) 그 열둘의 실물
   * `match`에 `Cmd/Ctrl`+`Z`·`Cmd`+`Shift`+`Z`·`Ctrl`+`Y`를 먹여도 걸리는 것이 **0**이다.
   * 그래서 입구는 셸 헤더의 버튼 둘뿐이지만, **여기서 막으면 입구가 늘어도 그것이 판정 밖으로
   * 새지 않는다.**
   *
   * **막은 항목은 버리지 않는다.** 진짜 서버로 잰 값이 아래이고(`inverse`는 서버가 준 그대로
   * 되보냈다), 왼쪽 넷이 이 자리에서 멈추고 오른쪽 둘은 그대로 나간다:
   *
   * | 되돌리는 것 | 나가는 포인터 | 서버 |
   * |---|---|---|
   * | 내가 만든 노드를 남이 잠갔다 | `remove /root/children/2` | **423** |
   * | 내가 고친 노드를 남이 잠갔다 | `replace /root/children/1/children/0/props/content` | **423** |
   * | 지운 노드를 되살리는데 그 **부모**가 잠겼다 | `add /root/children/1/children/0` | **423** |
   * | 되살리는 인덱스에 잠긴 **형제**가 앞당겨 와 있다 | `add /root/children/0` | **423** |
   * | 잠금과 무관한 편집 | `replace /root/children/0/children/0/props/content` | 통과 |
   * | 내가 만든 노드의 **형제**가 잠겼다 | `remove /root/children/2` | 통과 |
   *
   * **막지 않으면 이력을 통째로 잃는다 — 재서 안다.** 423은 `use-edit-commit.tsx`의
   * `recover`로 가고 그 재조회의 `loadPage`가 **두 스택을 비운다.** 스택이 2일 때 눌러도
   * undo 0 · redo 0이 되고 되돌리기 버튼이 비활성이 된다. 「에러 처리」가 undo 실패에 대해
   * 적은 것(*"그 항목만 스택에서 버리고 나머지는 그대로 쓴다"*)과 어긋나는 값이다.
   */
  readonly startUndo = (): UndoAttempt => this.#startFrom('undo')

  /** redo 한 단계. `startUndo`와 같은 규칙을 redo 스택에 쓴다. */
  readonly startRedo = (): UndoAttempt => this.#startFrom('redo')

  #startFrom(kind: 'undo' | 'redo'): UndoAttempt {
    const { document, openPageId } = this.#state
    if (document === null) return NO_ATTEMPT

    let stack = kind === 'undo' ? this.#state.undoStack : this.#state.redoStack
    let skipped = 0

    while (stack.length > 0) {
      const ref = stack[stack.length - 1]
      const rest = stack.slice(0, -1)
      if (ref === undefined) break

      let next: PageDocument
      try {
        // 건너뛴 항목이 문서를 바꾸지 않으므로 후보마다 **같은 문서**에 시험한다.
        next = applyOps(document, ref.inverse)
      } catch {
        stack = rest
        skipped += 1
        continue
      }

      // **낙관적 적용보다 먼저 묻는다 — 순서가 계약이다.** 뒤로 옮기면 «깜빡임»이 아니라
      // **항목이 사라진다.** 변조로 쟀다(이 판정을 아래 `#enqueue` **뒤로** 옮긴다):
      // `test/lock/undo-locks.test.tsx`의 케이스가 죽고, 그때 undo 스택이
      // **2 → 1**로 «소비»된다. `#enqueue`가 낙관 적용과 함께 그 항목을 스택에서 빼는데
      // 훅(`edit/use-edit-commit.tsx`의 `step`)은 `blocked`를 보고 펌프를 안 밟으므로,
      // **문서는 되돌아간 채 남고 요청은 나가지 않으며 잠금이 풀린 뒤 다시 눌러도 그 항목은
      // 이미 없다.** 되돌아갔다가 재조회로 복귀하는 깜빡임은 그보다 나은 판이다.
      const blocked =
        openPageId === null ? null : this.#lockConflict(openPageId, document, lockPointers(ref.inverse))
      if (blocked !== null) {
        // **건너뛴 것만 버리고 막힌 것은 남긴다.** `stack`은 이미 건너뛴 만큼 좁혀져 있고
        // 그 맨 위가 막힌 항목이다 — 잠금이 풀리면 다음 누름이 바로 그것을 집는다.
        if (skipped > 0) this.#apply(kind === 'undo' ? { undoStack: stack } : { redoStack: stack })
        return { clientOpId: null, skipped, blocked }
      }

      const clientOpId = this.#enqueue(
        next,
        // **서버가 준 `inverse`를 그대로 보낸다**(「정방향 흐름」). 클라이언트가 `invertOps`로
        // 계산하지 않는다 — 클라이언트 상태가 낙관적으로 앞서 있을 수 있기 때문이다.
        ref.inverse,
        kind,
        kind === 'undo' ? { undoStack: rest } : { redoStack: rest },
      )
      return { clientOpId, skipped, blocked: null }
    }

    if (skipped > 0) {
      this.#apply(kind === 'undo' ? { undoStack: [] } : { redoStack: [] })
    }
    return { clientOpId: null, skipped, blocked: null }
  }

  /**
   * 전송 루프를 시작해도 되는지. **`true`면 시작한 것이고 반드시 `endPump()`로 닫아야 한다.**
   * 이미 돌고 있으면 `false`다(in-flight는 항상 하나).
   */
  readonly beginPump = (): boolean => {
    if (this.#pumping) return false
    this.#pumping = true
    return true
  }

  readonly endPump = (): void => {
    this.#pumping = false
  }

  /**
   * 지금 보낼 요청. 큐가 비어 있으면 `null`이다.
   *
   * **`baseSeq`를 여기서 붙이는 것이 요점이다.** 큐에 담긴 `PendingEdit.baseSeq`는 그
   * 편집을 **만들 때**의 값이라 앞 편집이 ack되며 이미 낡았다. 전송 시점의 `headSeq`를
   * 읽어야 `apps/api/README.md` 「편집 파이프라인」 절의 4단계(*"응답의 `seq`가 다음 요청의
   * `baseSeq`다"*)가 지켜진다.
   *
   * **부르는 쪽이 `headSeq`를 직접 읽지 않게 하려는 것이기도 하다.** 그 필드는 페이지와
   * 함께 실리고 함께 비워지므로 주소와 대조한 뒤에 써야 하는데(`test/store-access-guard.ts`),
   * 전송은 이펙트 뒤의 비동기 흐름이라 훅으로 읽은 값이 이미 낡아 있다. 스토어가 자기
   * `#state`에서 그 순간의 값을 붙이면 낡을 창이 없고, "어느 페이지의 편집인가"는 큐가
   * `clearPage`에서 함께 비워지는 것으로 닫힌다.
   */
  readonly nextRequest = (): { clientOpId: string; ops: PatchOp[]; baseSeq: number } | null => {
    const head = nextPending(this.#state.pending)
    if (head === null) return null
    return { clientOpId: head.clientOpId, ops: head.ops, baseSeq: this.#state.headSeq }
  }

  /**
   * 성공한 편집 하나를 큐에서 지우고 `headSeq`를 올린다. undo 스택에 push한다.
   *
   * **큐의 `[0]`과 id가 맞을 때만 움직인다**(`edit-queue.ts`의 `ackPending`). 늦게 도착한
   * 응답이 `headSeq`를 올리면 다음 편집의 `baseSeq`가 서버보다 앞서고, 그 편집은 409를
   * 받는다.
   */
  readonly ackEdit = (
    clientOpId: string,
    result: { seq: number; revisionId: string; inverse: PatchOp[]; warnings?: ValidationIssue[] },
  ): void => {
    const { pending, undoStack, redoStack } = this.#state
    // 큐에서 빼기 **전에** 종류를 읽는다 — 어느 스택에 쌓을지가 그것으로 갈린다.
    const head = nextPending(pending)
    const nextPendingQueue = ackPending(pending, clientOpId)
    // 같은 참조면 맞는 ack가 아니었다는 뜻이다. 그때 `headSeq`나 스택을 건드리면
    // 모르는 응답이 상태를 바꾸게 된다.
    if (nextPendingQueue === pending) return

    // **ack된 편집은 이제 서버의 것이다 — 바탕에 접어 넣는다**. 안 접으면 바탕이
    // `headSeq`보다 뒤처지고, 다음 리베이스가 낡은 문서 위에서 만들어진다.
    //
    // **여기서 던지지 않는 것은 큐의 불변식이 지킨다:** `pending[0]`은 항상 바탕에 그대로
    // 얹히는 편집이다(리베이스가 얹히지 않는 것을 버리므로). 그래도 값으로 받는 것은,
    // 불변식이 깨진 판에서 **문서와 바탕이 조용히 갈라지는 것**보다 화면이 낡았다고 말하는
    // 편이 낫기 때문이다.
    //
    // **아래 `catch`는 지워도 죽는 케이스가 없다.** 그 갈래로 들어가는 판을 공개 API로
    // 만들 수 없어서다 — 큐에 넣는 것은 `#enqueue` 하나이고 그것은 지금 문서에 얹히는
    // ops만 넣는다. **지워도 되는 신호로 읽지 마라:** 리베이스가 얹히지 않는 것을 버리는
    // 것을 그만두거나, 큐에 넣는 두 번째 경로가 생기면 그 순간 이것이 유일한 방벽이 된다.
    let nextBase = this.#state.baseDocument
    if (nextBase !== null && head !== null) {
      try {
        nextBase = applyOps(nextBase, head.ops)
      } catch {
        this.#markStale('diverged')
      }
    }

    // 서버가 준 `inverse`를 **그대로** 싣는다(「정방향 흐름」).
    const ref: RevisionRef = { revisionId: result.revisionId, inverse: result.inverse }
    // **undo가 만든 revision은 redo 스택으로 간다.** 그 revision의 `inverse`는 원래 편집을
    // 다시 적용하는 것이므로 undo 스택에 쌓으면 같은 편집을 무한히 되돌리게 된다.
    // redo가 만든 것은 반대로 다시 undo 스택으로 간다.
    const undone = head?.kind === 'undo'

    // **경고는 ack와 함께 움직인다.** 맞지 않는 ack에서 돌아간 위쪽 `return` 뒤이므로,
    // 늦게 도착한 응답의 경고가 지금 문서의 것으로 실리지 않는다 — `headSeq`를 그 자리에서
    // 막는 것과 같은 근거다.
    const warnings = result.warnings ?? NO_WARNINGS
    this.#apply({
      pending: nextPendingQueue,
      baseDocument: nextBase,
      headSeq: result.seq,
      undoStack: undone ? undoStack : [...undoStack, ref],
      redoStack: undone ? [...redoStack, ref] : redoStack,
      // 둘 다 비어 있으면 참조를 유지한다(위 `NO_WARNINGS`).
      editWarnings:
        warnings.length === 0 && this.#state.editWarnings.length === 0
          ? this.#state.editWarnings
          : warnings,
    })
  }

  /**
   * 편집이 실패했다. 큐를 비우고 **버린 것을 돌려준다**(통지에 쓴다).
   *
   * **문서는 되돌리지 않는다.** 롤백 경로는 재조회 하나뿐이다 — 로컬 `inverse`로
   * 되돌리면 클라이언트가 낙관적으로 앞서 있는 만큼 서버와 어긋난다(「정방향 흐름」이 `inverse`를
   * 서버가 만들게 한 것과 같은 이유). 문서를 서버 상태로 맞추는 것은 부르는 쪽의 재조회다.
   */
  readonly failEdits = (): PendingEdit[] => {
    const current = this.#state.pending
    const { pending, dropped } = clearPending(current)
    // `clearPage`와 같은 이유로 이미 빈 큐는 참조를 유지한다.
    this.#apply({ pending: current.length === 0 ? current : pending, editStatus: 'recovering' })
    return dropped
  }

  readonly setEditStatus = (editStatus: EditStatus): void => {
    this.#apply({ editStatus })
  }

  /** 실패 통지를 세우거나(`Failure`) 치운다(`null`). 그리는 것은 `shell/edit-alert.tsx`다. */
  readonly setEditFailure = (editFailure: EditFailure | null): void => {
    this.#apply({ editFailure })
  }

  /**
   * 노드 하나를 고른다. **남이 잠근 자리는 고르지 않는다** — 「소프트 잠금」의 1차 방어다.
   *
   * **막는 자리가 여기 하나인 것이 요점이다.** 고르는 길은 셋이다(구조 트리·캔버스·구조
   * 편집이 만든 노드로 옮기는 것) — 화면마다 막으면 규칙이 세 벌이 되고, 새로 고르는
   * 자리가 늘 때 그 자리에는 규칙이 없다.
   *
   * **조용히 무시하지 않는다.** 왜 안 골라지는지는 그 줄의 *"○○ 편집 중"* 배지가 말한다
   * (`panels/structure-tree.tsx`) — 같은 판정에서 나온 것이라 둘이 어긋날 수 없다.
   */
  readonly selectNode = (nodeId: string | null): void => {
    if (nodeId !== null && this.selectionBlockedBy(nodeId) !== null) return
    this.#apply({ selectedNodeId: nodeId })
  }

  /**
   * 그 노드를 **고르는 것을 막는** 남의 잠금 — `lockedBy`에 `selectionClaims`를 얹은 것이다. 선택이 잠금을
   * 걸지 않는 사람(viewer)에게는 늘 `null`이다. 구조 트리의 `disabled`가 이것을 본다 — 배지는 `lockedBy`를 그대로 본다.
   */
  readonly selectionBlockedBy = (nodeId: string): NodeLock | null => {
    const { document, openPageId } = this.#state
    if (document === null || openPageId === null) return null
    return this.#blocksSelection(openPageId, document, nodeId)
  }

  /**
   * 선택이 잠금을 거는지를 바꾼다(`selectionClaims` — 셸의 `canEdit`이 실행 중에 바뀌면 이리 온다).
   *
   * **켜지는 순간(승격) 들고 있던 선택이 남의 잠금에 막히면 놓는다.** viewer 였을 때는 남이 잡은 자리를 고를 수 있었으므로,
   * 그대로 두면 곧 셸이 그 자리를 잡으려 한다(`useNodeLock`). 서버가 그 획득을 거절하므로(`apps/api/src/ws/lock.ts`)
   * **겹친 잠금**은 서지 않지만, 막힌 자리를 든 채 있으면 입구가 전부 꺼진 선택이 남을 뿐이다 — 그래서 놓는다.
   * 루트로 옮기지 않는다 — `#selectionFor`의 «사라진 노드는 놓는다»와 같다(사용자가 안 한 일로 자리를 옮기지 않는다).
   * 꺼지는 순간(강등)에는 선택을 그대로 둔다 — 막을 것이 줄 뿐이다.
   */
  readonly setSelectionClaims = (selectionClaims: boolean): void => {
    const { selectedNodeId, document, openPageId } = this.#state
    // 판정은 `#lockConflictAt` 그대로다 — 새 값이 켜짐일 때만 묻는다(`#blocksSelection`은 아직 앞 값을 본다). 한 번의
    // `#apply`로 둘을 함께 놓는다 — 둘로 나누면 구독자가 «켜졌는데 막힌 자리를 고른 채»인 상태를 한 번 본다.
    const blocked =
      selectionClaims &&
      selectedNodeId !== null &&
      document !== null &&
      openPageId !== null &&
      this.#lockConflictAt(openPageId, document, selectedNodeId) !== null
    this.#apply(blocked ? { selectionClaims, selectedNodeId: null } : { selectionClaims })
  }

  /** 고르기를 막는 잠금 — 판정의 자리는 `#lockConflictAt` 하나이고, 여기는 `selectionClaims`를 얹을 뿐이다. */
  #blocksSelection(pageId: string, document: PageDocument, nodeId: string): NodeLock | null {
    return this.#state.selectionClaims ? this.#lockConflictAt(pageId, document, nodeId) : null
  }

  /**
   * 그 노드를 **고를 수 없게 막는 남의 잠금**. 없으면 `null`이다(「소프트 잠금」).
   *
   * **판정 자체는 `@wirebound/schema`의 `findLockConflict`가 한다** — 서버의 2차 방어가
   * 부르는 바로 그 함수다. 두 방어가 나뉜 것은 **자리**이지 판정이 아니다: 판정이 두 벌이면
   * 화면이 통과시킨 편집을 서버가 거절하고, 사용자는 값을 쳤는데 저장이 안 되는 것을 보되
   * **왜인지 화면에 없다.**
   *
   * **선택은 서브트리를 통째로 claim하는 것이므로** 남의 잠금을 품기만 해도 막힌다 — 그
   * 성질과 대가는 `packages/schema/test/lock.test.ts`의 `선택이 편집보다 엄격하다`가 잰다.
   */
  readonly lockedBy = (nodeId: string): NodeLock | null => {
    const { document, openPageId } = this.#state
    if (document === null || openPageId === null) return null
    return this.#lockConflictAt(openPageId, document, nodeId)
  }

  /**
   * 노드 **하나를 고르는** 자리의 잠금. `lockedBy`와 `#selectionFor`가 공유한다 —
   * 둘 다 *"이 노드를 고를 수 있나"*를 묻고, 그 물음이 포인터로 바뀌는 자리가 여기다.
   *
   * **잠금이 없으면 문서를 뒤지지 않는다 — 순서가 계약이다.** `findNodePath`는 검증 전
   * 문서에서 **던진다**(`children` 배열 안의 `null` — `edit/safe-walk.ts`의 머리말). 이
   * 패널·구조 트리는 오류 경계 밖이라 던지면 `.wb-shell`이 통째로 사라진다. 실측: 이 두 줄을
   * 뒤집으면 `test/panels/property-panel.test.tsx`의 *"children 배열 안에 노드가 아닌 원소가
   * 있어도 노드를 고를 수 있다"*가 `reading 'id'`로 죽는다. 잠금이 하나도 없는 흔한 판에서
   * 그 문서를 여는 것이 그 케이스이고, 지금 이 순서가 그것을 지킨다.
   *
   * **문서에 없는 노드는 부딪칠 자리가 없다.** 경로가 없으면 `null`이고, 그 판정은
   * `findLockConflict`의 *"가리키는 노드가 문서에 없는 잠금은 아무것도 막지 못한다"*와
   * 같은 방향이다.
   */
  #lockConflictAt(pageId: string, document: PageDocument, nodeId: string): NodeLock | null {
    if (this.#state.locks.length === 0) return null
    const path = findNodePath(document.root, nodeId)
    if (path === undefined) return null
    return this.#lockConflict(pageId, document, [path])
  }

  /**
   * 잠금 판정의 **본체 한 자리**. **포인터를 받는 것이 요점이다** — 「소프트 잠금」이 나눈 두 방어가
   * 같은 함수에 **다른 자리**를 넣는 형태이고(`lock.ts`의
   * `LockConflictInput.pointers` 주석), 화면 안에서도 그 자리가 둘이다:
   *
   * | 묻는 것 | 넣는 포인터 | 부르는 쪽 |
   * |---|---|---|
   * | 이 노드를 고를 수 있나 | `findNodePath(root, nodeId)` 하나 | `lockedBy` |
   * | 이 되돌리기를 낼 수 있나 | `lockPointers(inverse)` 전부 | `#startFrom` |
   *
   * **`findLockConflict`를 부르는 자리는 `apps/web` 전체에 여기 하나다**
   * (`test/lock/one-verdict.test.ts`가 소스에서 센다). 둘째 갈래가 생겼다고 호출을 하나 더
   * 두면 그 순간 판정이 두 벌이 된다.
   *
   * **페이지와 문서를 인자로 받는 것도 그대로다** — `loadPage`가 첫 선택을 정할 때는 그 둘이
   * 아직 `#state`에 들어가 있지 않다(들어간 뒤에 물으면 `#apply`가 두 번 돌아 구독자가 두 번
   * 깬다).
   */
  #lockConflict(pageId: string, document: PageDocument, pointers: readonly string[]): NodeLock | null {
    const { locks, viewerUserId } = this.#state
    if (locks.length === 0) return null
    return findLockConflict({
      root: document.root,
      locks: locks.filter((lock) => lock.pageId === pageId),
      pointers,
      // 누구인지 모르면 어느 잠금과도 같지 않은 값이 되어 **전부 남의 것**이 된다.
      viewerUserId: viewerUserId ?? '',
    })
  }

  /**
   * 서버가 보낸 잠금 목록으로 갈아 끼운다(「소프트 잠금」). **전부를 받는다** — 증분이면 하나를 놓친
   * 화면의 배지가 조용히 남는다.
   */
  readonly setLocks = (locks: NodeLockView[]): void => {
    this.#apply({ locks: locks.length === 0 && this.#state.locks.length === 0 ? this.#state.locks : locks })
  }

  /** 지금 보고 있는 사람. 소유자 판정이 이 값을 쓴다. */
  readonly setViewer = (viewerUserId: string | null): void => {
    this.#apply({ viewerUserId })
  }

  readonly setMode = (mode: EditorMode): void => {
    this.#apply({ mode })
  }

  readonly setViewportWidth = (width: ViewportWidth): void => {
    // 런타임에는 타입이 없다. 프리셋 밖의 폭은 화면의 어떤 선택지와도 대응하지
    // 않으므로 무시하고 마지막 유효 값을 유지한다.
    if (!(VIEWPORT_PRESETS as readonly number[]).includes(width)) return
    this.#apply({ viewportWidth: width })
  }

  readonly setZoom = (zoom: number): void => {
    // NaN은 `Math.min`·`Math.max`를 그대로 통과하므로 클램프만으로는 막히지 않는다.
    if (Number.isNaN(zoom)) return
    this.#apply({ zoom: Math.min(Math.max(zoom, MIN_ZOOM), MAX_ZOOM) })
  }

  /**
   * 프로젝트를 떠날 때. 문서만 지우면 이전 프로젝트의 선택·줌이 다음 프로젝트에 남는다.
   * 페이지 하나를 닫는 것은 `clearPage`다 — 그쪽은 보기 설정을 남긴다.
   */
  readonly reset = (): void => {
    this.#dropWaitingMarkers()
    this.#apply(initialState())
  }

  /**
   * 바뀐 필드가 있을 때만 상태를 교체하고 알린다. 값이 같은데도 교체하면
   * `getState()`의 참조가 달라져 구독자가 헛일을 한다.
   */
  #apply(next: Partial<EditorState>): void {
    let changed = false
    for (const key of Object.keys(next) as (keyof EditorState)[]) {
      if (next[key] !== this.#state[key]) {
        changed = true
        break
      }
    }
    if (!changed) return

    this.#state = { ...this.#state, ...next }
    // 사본을 순회한다 — 리스너가 알림을 받는 중에 구독을 해제할 수 있다.
    for (const listener of [...this.#listeners]) listener()
  }
}
