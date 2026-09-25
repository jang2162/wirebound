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
import { anchorOps, rebaseAnchored, sameOps, type AnchoredOp } from './anchored-ops'
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
  /**
   * `inverse`를 노드 id 로 붙잡은 것(`anchored-ops.ts`) — 그 revision 을 막 기록한 문서(ack 가 바탕에 접은 판)에서 적는다(`ackEdit`). 되돌리기가
   * 이것으로 지금 문서에서 경로를 다시 짓는다 — 그 사이 남이 같은 배열 앞자리에 넣었으면 `inverse`의 옛 자리는 **남의 노드**다. 서버 이력으로
   * 채운 스택(`restoreUndoStack`)은 지금 판에서 되짚은 문서에서 적는다. **없으면(`undefined` · `null`) `inverse`를 경로 그대로 쓴다** — ack 가 적을
   * 문서가 없었거나 `inverse`가 그 문서에 안 얹혀 붙잡지 못한 항목이다.
   */
  anchored?: AnchoredOp[] | null
  /**
   * **서버 이력으로 채운 항목은 되돌릴 때 붙잡는다**(`restoreUndoStack`) — 그 revision 을 기록한 문서를 그때 되짚어 짓고 붙잡는다(한 번 지으면
   * 든다). `null`이면 못 지었거나 못 붙잡았다 — 그 항목은 얹지 않는다(`#tryInverse`). 경로 그대로 보내지 않는다: 그 사이 남이 앞자리에
   * 넣었으면 남의 노드를 고친다.
   */
  anchorOnUse?: () => AnchoredOp[] | null
}

/** 서버 이력에서 온 revision 하나(`restoreUndoStack` · `undoHistoryNeed`의 인자). `seq`로 지금 판에서 이어지는지 본다. */
export interface RestoredRevision {
  revisionId: string
  seq: number
  inverse: PatchOp[]
}

/**
 * **새로고침으로 채울 되돌리기의 판**(`undoRestorePoint`) — 판을 실은 세대(`#queueEpoch`)와 그때의 번호. 판을 싣는 입구가 목록을 받는 동안
 * 판이 다시 실리거나 비면(재연결 · 복원 · 수습 · 떠남) 세대가 달라 그 답은 싣지 않는다.
 */
export interface UndoRestorePoint {
  readonly pageId: string
  readonly epoch: number
  /** 판을 실은 번호. 이 번호까지가 세션 앞의 이력이다 — 그 뒤의 내 revision 은 이 탭이 ack 로 이미 스택에 올렸다(`ackEdit`). */
  readonly seq: number
}

/** 끊긴 자리를 받는 조회 한 번의 크기(`undoHistoryNeed`) — 서버 상한과 같다(`apps/api/src/routes/revisions.ts`의 `limit`). */
export const UNDO_HISTORY_PAGE = 200

/** 되짚기 조회 하나(`undoHistoryNeed`). 답은 같은 값과 함께 `supplyUndoHistory`로 넘긴다 — `epoch`가 그 이력을 실은 판이다. */
export interface UndoHistoryNeed {
  readonly beforeSeq: number
  readonly limit: number
  readonly epoch: number
}

/** 새로고침으로 채운 항목의 되짚기 재료 — 목록 답을 실은 판(`headSeq`)에서 내 가장 옛 항목(`lowest`)까지의 `inverse`. */
interface RestoredHistory {
  readonly epoch: number
  readonly headSeq: number
  readonly lowest: number
  readonly inverses: Map<number, PatchOp[]>
  /** 첫 항목을 붙잡기 시작했다 — 되짚은 문서를 이어 쓰므로 그 뒤로는 받은 것을 더하지 않는다. */
  walked: boolean
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
  /**
   * **새로고침으로 채운 되돌리기의 이력을 받는 중인가**(`beginUndoHistoryLoad`) — 되돌리기 단추가 이것을 보고 꺼진다. 누른 뒤 답을 기다리는
   * 동안 다시 누르면 그 누름은 버린다(`edit/use-edit-commit.tsx`의 `undo`). 판을 싣거나 비우면 함께 풀린다.
   */
  undoHistoryLoading: boolean
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
    undoHistoryLoading: false,
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
 *
 * **한도 뒤에 사이 프레임이 늦게 와도 낡음은 안 풀린다 — 판정이다.** 그 프레임은 얹히지만 버린 번호는 이 탭에 다시 오지
 * 않는다(게시의 방송은 낸 연결을 뺀다) — 문서에 번호가 없고 `headSeq`는 서버보다 하나 뒤이며, 다음 프레임은 다시 갭이다(jsdom:
 * head 7 → 번호(9) 대기 → 한도 → 늦은 8 `applied` · head 8 · 번호 없음 · 낡음 `'gap'` → 남의 10 갭). 다시 읽기만 맞고, `'gap'`의
 * 문장(«받지 못한 변경이 있어 … 새로고침하면 맞춰집니다»)이 그대로 참이다. **버리지 않고 붙들었다가 늦은 프레임 뒤에 얹어
 * 낡음을 푸는 길은 고르지 않는다** — 그러려면 낡음이 «한도가 세운 것»인지 «프레임이 건너뛴 것»인지 스토어가 갈라 들어야 하고,
 * 둘이 겹친 판(한도 뒤 다른 갭)에서 푸는 쪽이 빠진 revision 을 남긴 채 최신처럼 보인다(`applyRemoteChange`의 «낡음은 건드리지
 * 않는다»와 같은 까닭).
 */
export const MARKER_FRAME_WAIT_MS = 3_000

/** 다시 읽는 창에 들고 있는 revision 의 한도(`#noteWindow`). 창 하나에 오는 것은 대개 몇 개다 — 이 수는 끝나지 않은 창이 쌓는 것을 끊는다. */
const WINDOW_CHANGES_LIMIT = 500

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
 * 기다리지 않는다(«받은 프레임은 미루지 않는다»).
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

/** 복원 신호 앞에 시작한 조회의 판에 두는 낡음(`loadPage`). */
const RESTORED_STALE: RemoteStale = { reason: 'restored' }

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

/** 처음 부를 때 한 번 짓고 그 값을 든다. */
function once<T>(make: () => T): () => T {
  let made = false
  let value: T
  return () => {
    if (!made) {
      value = make()
      made = true
    }
    return value
  }
}

/**
 * **`headSeq` 판(`head`)에서 거꾸로 되짚어 `seq` 판의 문서를 짓는 함수**(`restoreUndoStack`) — `seq + 1`부터 `headSeq`까지의 `inverse`를
 * 높은 번호부터 얹는다. 빠진 번호가 있거나 얹다가 던지면 그 아래는 `null`이다. 지은 문서를 들고 있다가 더 낮은 번호를 물으면 거기서 잇는다
 * — 되돌리기 스택은 번호가 내려가는 순서로 소비된다. 더 높은 번호를 물으면 `head`에서 다시 걷는다.
 */
function historyDocuments(head: PageDocument, headSeq: number, inverses: ReadonlyMap<number, PatchOp[]>): (seq: number) => PageDocument | null {
  let document: PageDocument | null = head
  let at = headSeq
  return (seq) => {
    if (seq > headSeq) return null
    if (seq > at) {
      document = head
      at = headSeq
    }
    while (document !== null && at > seq) {
      const inverse = inverses.get(at)
      try {
        document = inverse === undefined ? null : applyOps(document, inverse)
      } catch {
        document = null
      }
      at -= 1
    }
    return document
  }
}

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
   * **비우는 자리는 다른 페이지를 싣는 `loadPage` · `clearPage` · `reset` · 복원(`markRestored`), 그리고 기다림이 끝나는 자리다**
   * (`#settleWaitingMarkers`).
   * 같은 페이지를 다시 실으면 남은 것을 그 판에 제 차례로 얹는다(`loadPage`의 끝).
   */
  #waitingMarkers: { seq: number; markerOps: PatchOp[] }[] = []

  /** `#waitingMarkers`가 비지 않은 동안만 선다 — `MARKER_FRAME_WAIT_MS` 뒤 `'gap'` 낡음. */
  #markerWaitTimer: ReturnType<typeof setTimeout> | null = null

  /**
   * **마지막으로 서버에 낸 편집의 id**(`markSent`). 관측 상태가 아니라 `#pumping`처럼 제어 값이다. 답이 오면 그 편집은 큐에서
   * 빠지므로 지우지 않는다 — 묻는 쪽은 «이 편집이 그것인가»만 묻는다(`wasSent`).
   *
   * **`pending[0]`이 곧 나간 것이 아니다.** 리베이스가 나간 머리를 버리면(남의 변경과 부딪쳤다) 그 뒤의 안 보낸 편집이 머리가
   * 된다 — 머리로 가르면 안 보낸 것을 «반영됐는지 모름»으로 말한다.
   */
  #sentOpId: string | null = null

  /** 그 편집이 나갈 때 열려 있던 페이지 — 늦은 답이 지금 판의 것인지 가른다(`#orphanAck`). */
  #sentPageId: string | null = null

  /**
   * **나간 뒤 답을 받기 전에 판째 버린 편집의 id** — 판을 다시 실었거나(`loadPage`) 페이지를 옮기며 비웠다(`clearPage`). 그 편집의
   * 늦은 답은 이 화면의 일이 아니다(`wasAbandoned`). **리베이스가 버린 편집은 여기 들지 않는다** — 그 거절은 편집 실패 수습이
   * 받는다(`test/edit/ws-transport.test.tsx`의 «리베이스가 버린 편집의 409로 …»).
   */
  #abandonedOpId: string | null = null

  /** 마지막으로 나간 편집의 ops — 서버가 그 revision 으로 기록하는 바로 그 ops 다(`markSent`). */
  #sentOps: PatchOp[] | null = null

  /** 판째 버린 그 편집의 ops(`#abandonedOpId`) — 늦은 ack 가 오면 그 revision 을 얹는 데 쓴다(`#orphanAck`). */
  #abandonedOps: PatchOp[] | null = null

  /** 그 편집을 **페이지를 떠나며** 버렸는가(`clearPage` · `reset` · 다른 페이지의 `loadPage`) — 같은 페이지를 다시 실으며 버린 것과 가른다. */
  #abandonedLeaving = false

  /**
   * 떠나며 그 편집과 함께 버린 **안 보낸** 편집의 수 — 그 편집의 거절을 말할 때 합쳐 센다(`abandonedUnsent`). 그 답을 기다리는 동안 또 떠나며
   * 버린 것도 더한다(`#noteAbandoned`).
   */
  #abandonedUnsent = 0

  /** 그 편집과 함께 버린 것들이 있던 페이지 — 떠난 차례대로, 겹치지 않게(`abandonedPages`). */
  #abandonedPages: string[] = []

  /**
   * **떠나며 버린 편집을 말하는 통지**(`setLeaveNotice`) — 판을 비우는 자리(`clearPage` · `reset`)가 이것은 지우지 않는다. 그 통지는 떠난
   * 뒤의 화면에 서는 것이 요점이다 — 옮겨 간 페이지 · 프로젝트를 여는 비우기가 곧바로 지우면 한 번도 안 보인다. 프로젝트를 옮기면 캔버스의
   * 여는 이펙트(`routes/editor.tsx`의 `CanvasFrame`)가 판을 비우며 통지를 세우고, 셸의 `reset`은 같은 커밋에서 그 **뒤에** 돈다(React 는 자식의
   * 이펙트를 먼저 돌린다).
   *
   * **푸는 자리는 넷이다** — 새 편집 · 되돌리기(다른 통지로 덮거나 치운다) · 통지가 가리키는 페이지를 다시 연 판(`loadPage` —
   * `#leaveNoticePages`가 빈다) · 닫는 단추(`closeLeaveNotice`). 뒤의 둘이 없으면 편집을 못 내는 화면(뷰 모드 · viewer)에서 셸이 사는
   * 동안 남고, 그 페이지로 돌아와 화면이 서버 판을 보여도 «다시 열어 확인하세요»가 선다(Chrome).
   */
  #leaveNotice: EditFailure | null = null

  /** 떠남의 통지가 가리키는 페이지 가운데 아직 다시 안 연 것(`setLeaveNotice`의 `pages`). */
  #leaveNoticePages = new Set<string>()

  /** 마지막 `clearPage`가 비운 판의 페이지(`leftPage`). 비울 판이 없었으면 `null`이다. */
  #leftPageId: string | null = null

  /**
   * **큐를 통째로 갈아 낀 수** — 판을 싣거나(`loadPage`) 비울(`clearPage` · `reset`) 때마다 오른다. 그 뒤의 큐는 다른 판 위의 것이다.
   * 나간 편집이 어느 큐에서 나갔는지(`#sentQueue`)와 견줘, 그 실패가 지금 큐의 일인지 가른다(`sentFromOpenQueue`).
   */
  #queueEpoch = 0

  /** 마지막으로 나간 편집이 나갈 때의 `#queueEpoch`. */
  #sentQueue = -1

  /** 이 스토어가 지금 쓰는 프로젝트(`reset`) — 큐의 편집이 나갈 프로젝트다(`queueProjectId`). */
  #projectId: string | null = null

  /** 판 다시 싣기의 세대 — 시작한 수(`beginPageLoad`). */
  #pageLoadsBegun = 0

  /** 판을 정한 가장 나중 세대(`settlePageLoad`). 이 수 이하의 답은 싣지 않는다. */
  #pageLoadSettled = 0

  /**
   * **여는 조회가 도는 페이지** — 열린 페이지가 아닌 페이지를 읽기 시작했다(`beginPageLoad` — 여는 입구는 조회 전에 판을 비운다). 그 조회가
   * 도는 동안 온 그 페이지의 revision 을 창에 적는다(`#windowChanges`) — 룸이 프로젝트라 여는 동안에도 그 페이지의 프레임 · 늦은 ack 가
   * 온다. 판을 싣거나 비우면 지운다.
   */
  #openingPageId: string | null = null

  /**
   * **마지막 복원 신호가 왔을 때까지 시작한 조회 수**(`markRestored`). 이 수 이하의 세대가 읽은 판은 복원 앞의 판본일 수 있다 — 그 답을
   * 실어도 낡음(`'restored'`)을 그대로 둔다(`loadPage`).
   */
  #restoredAt = 0

  /**
   * **다시 읽는 창 안에서 온 revision** — 남의 프레임 · 내 ack · 번호 응답. 그것이 올 때까지 시작한 조회 수(`begun`) · 페이지 · 번호 · 그
   * revision 의 ops(모르면 `null`)를 든다. 세대 `t`의 조회가 시작된 뒤에 온 것은 `begun >= t`다 — 그 조회는 그 커밋 앞을 읽었을 수 있다.
   * 판을 실으면 그 페이지 · 그 판 뒤의 것을 제 차례에 얹는다(`#replayWindow`).
   *
   * **적는 페이지는 열린 페이지와 여는 페이지다**(`#openingPageId`) — 여는 길은 조회 전에 판을 비우므로(`clearPage`) 열린
   * 페이지만 적으면 여는 조회의 창이 빈다(Chrome: 2쪽에서 1쪽을 여는 조회가 읽힌 뒤 밥이 1쪽에 넣은 글이 옛 답에 조용히 빠지고, 다음
   * 편집이 409 로 취소됐다).
   *
   * **조회가 시작되기 전에 온 것은 들지 않는다** — 서버는 커밋한 뒤 방송 · ack 를 내므로 그 뒤에 시작한 조회는 그 커밋을 읽는다.
   *
   * **판이 갈리면 버린다** — 복원 앞일 수 있는 판에 복원 뒤 revision 을 얹지 않는다. 다른 페이지를 싣거나 판을 비우면(`loadPage` ·
   * `clearPage` · `reset`) · 복원이 알려지면(`markRestored`) 그 페이지 밖의 것 · 전부를 버리고, 판을 정한 세대보다 앞에 시작한 조회의 몫은 정할
   * 때 버린다(`settlePageLoad`).
   */
  #windowChanges: { pageId: string; begun: number; seq: number; ops: PatchOp[] | null }[] = []

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
   * **`ticket`은 이 판을 읽은 조회의 세대다**(`beginPageLoad`) — 그 조회가 도는 동안 온 revision 을 이 판 뒤에 얹는다(`#windowChanges`).
   * 판을 싣는 입구는 넘긴다. 빠뜨리면 그 입구의 옛 답이 창 안의 ack 를 조용히 지운다.
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
  readonly loadPage = (pageId: string, document: PageDocument, headSeq: number, ticket?: number): PendingEdit[] => {
    const { pending, undoStack, redoStack } = this.#state
    this.#noteAbandoned(pending, this.#state.openPageId !== pageId)
    this.#queueEpoch += 1
    // 새로고침으로 채운 항목의 되짚기 재료도 그 판의 것이다 — 스택과 함께 버린다(받은 `inverse`를 쥐고 있다).
    this.#restoredHistory = null
    // **선택은 지우지 않고 다시 정한다** — 무엇으로 정하는지는 `#selectionFor`가 갖는다.
    // 여는 경로는 루트로 시작하고(죽은 화면을 없앤다), 같은 페이지를 다시 싣는 재조회는
    // 보고 있던 자리를 그대로 둔다.
    const selectedNodeId = this.#selectionFor(pageId, document)
    // 기다리던 번호 응답은 **이 페이지의 것일 때만** 남는다 — 아래 `#settleWaitingMarkers`.
    const samePage = this.#state.openPageId === pageId
    if (!samePage) this.#dropWaitingMarkers()
    // 창 안에 온 revision 은 이 페이지의 것만 얹는다(`#windowChanges`) — 여는 페이지의 창(`#openingPageId`)도 여기서 얹힌다.
    this.#windowChanges = this.#windowChanges.filter((change) => change.pageId === pageId)
    this.#openingPageId = null
    // **복원 신호보다 앞에 시작한 조회의 판이면 복원 배너를 둔다**(`#restoredAt`) — 그 판은 복원 앞을 읽었을 수 있다. 창도 얹지 않는다 — 신호
    // 뒤에 온 revision 은 복원 뒤 판의 것이라 복원 앞 판 뒤의 번호가 아니다.
    const beforeRestore = ticket !== undefined && ticket <= this.#restoredAt
    // **떠남의 통지가 가리키는 페이지를 다시 열면 그 페이지는 확인한 것이다**(`#leaveNotice`의 «푸는 자리») — 가리키는 것이 다 열렸으면
    // 통지를 푼다. 다른 통지가 서 있으면 그대로 둔다.
    const leaveSettled = this.#leaveNoticePages.delete(pageId) && this.#leaveNoticePages.size === 0 && this.#keptLeaveNotice() !== null
    if (leaveSettled) this.#leaveNotice = null
    this.#apply({
      ...(leaveSettled ? { editFailure: null } : {}),
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
      undoHistoryLoading: false,
      // **경고도 함께 버린다.** 문서가 서버 것으로 되돌아갔으므로 앞 편집의 경고는 지금
      // 문서의 것이 아니다. `getPage`는 경고를 싣지 않으므로 **다음 편집까지 모른다** —
      // 모르는 것을 "없다"로 두는 쪽을 골랐다: 남겨 두면 이미 사라진 문제를 말하게 된다.
      editWarnings: this.#state.editWarnings.length === 0 ? this.#state.editWarnings : NO_WARNINGS,
      // **낡음도 함께 푼다.** 이 자리가 페이지 상태를 서버 것으로 **놓는** 곳이므로, 여기를
      // 지나온 문서는 정의상 낡지 않았다. 안 풀면 *"새로고침하세요"*가 새로고침한 뒤에도
      // 남는다 — *"고쳤는데 고쳤다고 말하지 않는"* 부류다. **복원 신호 앞에 시작한 조회의 판만 예외다**(위 `beforeRestore`) — 푸는
      // 쪽이 복원 앞 판을 최신처럼 보이게 한다(스토어: 창 안 복원 신호 → 복원 앞 답 → 낡음 `null`).
      remoteStale: beforeRestore ? RESTORED_STALE : null,
      documentLoads: this.#state.documentLoads + 1,
    })
    // **다시 읽은 판에도 기다리던 번호 응답을 제 차례에 얹는다**(`applyMarkerChange`의 «내 다음 번호가 아니면 …») — 아래 창 얹기
    // 뒤다. 그 조회가 게시의 커밋 **앞**에 읽혔으면 번호는 이 판 바로 뒤의 revision 이고, 낸 탭은 그 방송을 안 받는다(연결 id 로
    // 빠진다) — 버리면 번호가 캔버스에 안 뜬 채 `headSeq`가 하나 뒤처진다. 커밋 뒤에 읽혔으면 판에 이미 있어 버린다.
    // **이 조회가 시작된 뒤 온 revision 을 실린 판 뒤에 제 차례로 얹는다.** 조회가 그 커밋 앞을 읽었으면 서버에는 있는데 이 판에는
    // 없다 — 남의 프레임은 다시 오지 않고, 내 편집은 큐에서 이미 빠졌다(방송은 낸 연결을 뺀다). 안 얹으면 `headSeq`가 거꾸로 간 채
    // 옛 판이 서고 다음 편집이 409 로 취소된다(Chrome: 배너 단추의 조회 답을 2.5s 붙잡은 사이 친 글이 ack 된 뒤 옛 답이 실려 캔버스
    // «원문» · 서버 그 글). 번호 응답은 그 뒤에 제 차례를 찾는다 — 얹은 만큼 `headSeq`가 올랐다.
    if (ticket !== undefined && !beforeRestore) this.#replayWindow(pageId, ticket)
    if (samePage) this.#settleWaitingMarkers()
    return pending
  }

  /**
   * 세대 `ticket`의 조회가 시작된 뒤 온 revision 을 막 실은 판 위에 번호 차례로 얹는다(`#windowChanges`). 판이 이미 품은 번호는 버린다.
   * **이어지지 않거나(사이 번호가 없다) ops 를 모르면 멈추고 `'gap'`**, 얹다가 던지면 `'diverged'`다 — 거기까지 얹은 판은 그대로 둔다.
   *
   * 얹는 ops 는 서버가 그 번호로 기록한 것 그대로라 경로를 다시 짓지 않는다 — 그 번호 바로 앞의 판(이 판) 위에서 서버가 적용한 것이다.
   * 큐는 비어 있다(`loadPage`가 방금 비웠다) — 바탕과 화면이 함께 간다.
   */
  #replayWindow(pageId: string, ticket: number): void {
    const { baseDocument, headSeq, selectedNodeId } = this.#state
    if (baseDocument === null) return
    const changes = this.#windowChanges
      .filter((change) => change.pageId === pageId && change.begun >= ticket)
      .sort((a, b) => a.seq - b.seq)
    let document = baseDocument
    let seq = headSeq
    let stale: RemoteStale['reason'] | null = null
    for (const change of changes) {
      if (change.seq <= seq) continue
      if (change.seq !== seq + 1 || change.ops === null) {
        stale = 'gap'
        break
      }
      try {
        document = applyOps(document, change.ops)
      } catch {
        stale = 'diverged'
        break
      }
      seq = change.seq
    }
    if (seq !== headSeq) {
      // 얹은 revision 이 고른 노드를 지웠으면 놓는다(`#selectionFor`의 «사라진 노드는 놓는다»).
      const keep = selectedNodeId === null || findNodePath(document.root, selectedNodeId) !== undefined
      this.#apply({ document, baseDocument: document, headSeq: seq, ...(keep ? {} : { selectedNodeId: null }) })
    }
    if (stale !== null) this.#markStale(stale)
  }

  /**
   * 다시 읽는 조회가 도는 동안 온 revision 을 적는다(`#windowChanges`). 도는 조회가 없으면 적지 않는다 — 다음 조회는 그 커밋을 읽는다.
   *
   * **한도(`WINDOW_CHANGES_LIMIT`)를 넘으면 앞의 것부터 버린다** — 실패로 끝나 판을 안 정한 조회가 있으면 «도는 조회»가 다음 판까지
   * 남는다. 버린 번호가 필요한 판은 얹다가 이어지지 않아 `'gap'`을 세운다(조용히 틀리지 않는다).
   */
  #noteWindow(pageId: string | null, seq: number, ops: PatchOp[] | null): void {
    if (pageId === null || this.#pageLoadsBegun <= this.#pageLoadSettled) return
    this.#windowChanges.push({ pageId, begun: this.#pageLoadsBegun, seq, ops })
    if (this.#windowChanges.length > WINDOW_CHANGES_LIMIT) this.#windowChanges = this.#windowChanges.slice(-WINDOW_CHANGES_LIMIT)
  }

  /**
   * **판을 서버에서 다시 읽기 시작한다 — 세대 번호를 받는다.** 조회를 내는 순간에 부른다. 답이 오면 `settlePageLoad`로 실어도
   * 되는지 묻는다.
   *
   * ## 왜 세대인가 — 두 조회가 겹치면 늦게 온 옛 판이 새 판을 덮는다
   *
   * 판을 싣는 입구가 여럿이고(아래 표) 서로 모른 채 조회를 낸다. 앞 조회의 답이 붙잡혀 늦게 오면, 뒤 조회가 실은 새 판 위에
   * 옛 판이 실린다 — 남이 넣은 노드가 사라지고 낡음도 안 선다(Chrome: 배너 단추의 조회를 붙잡은 채 남이 노드를 넣고 WS 를
   * 끊으면, 재연결 재조회가 head 4 를 실은 뒤 붙잡은 head 3 의 답이 그 노드를 지웠다).
   *
   * **`headSeq`로 막지 않는다 — 세대로 막는다.** 판을 정하는 것은 실은 답만이 아니다 — `holdsServerPage`로 같다고 보고 넘어간 답 ·
   * 페이지가 사라졌다고 답한 조회도 판을 정한다(`settlePageLoad`). «번호가 내려가면 버린다»에는 그 둘을 적을 자리가 없다.
   *
   * | 입구 | 자리 |
   * |---|---|
   * | 페이지 열기 | `routes/editor.tsx`의 `CanvasFrame` 여는 이펙트 |
   * | 재연결 재조회 | 같은 파일의 재연결 이펙트 |
   * | 복원 재조회 — 내 복원 · 남의 복원 배너의 단추 | 같은 파일의 복원 이펙트(`restoredToken`) |
   * | 편집 실패 수습 | `edit/use-edit-commit.tsx`의 `recover` |
   *
   * **판을 싣는 입구가 늘면 이 표에 줄을 더하고 세대를 받게 한다** — 안 받는 입구의 답은 세대를 모른 채 새 판을 덮는다.
   *
   * **읽는 페이지를 받는다** — 열린 페이지가 아니면(여는 입구는 조회 전에 판을 비운다) 그 페이지가 여는 페이지다(`#openingPageId`). 그 창에
   * 온 revision 도 적어야 실린 판 뒤에 얹힌다 — 입구마다 창 안의 남의 프레임 · 내 ack 가 옛 답 뒤에 남는지를 재는 판은
   * `test/edit/reload-sent-edits.test.tsx`의 «입구마다» 묶음이다.
   */
  readonly beginPageLoad = (pageId: string): number => {
    this.#pageLoadsBegun += 1
    if (this.#state.openPageId !== pageId) this.#openingPageId = pageId
    return this.#pageLoadsBegun
  }

  /**
   * **이 세대의 답으로 판을 정해도 되는가** — 참이면 정한 것으로 적는다. 부르는 쪽은 참일 때만 싣는다(`loadPage`) · 그대로 둔다
   * (`holdsServerPage`로 같다고 본 판) · 비운다(조회가 페이지가 사라졌다고 답한 판). 셋 다 «이 세대가 판을 정했다»다.
   *
   * **«더 나중에 시작한 조회가 이미 판을 정했으면» 거짓이다 — «더 나중에 시작한 조회가 있으면»이 아니다.** 뒤 조회가 아직 답을
   * 안 했을 때 앞 답을 버리면, 뒤 조회가 실패하거나(재연결 재조회는 실패를 조용히 둔다) 싣지 않고 넘어가는 판에서 **아무 답도
   * 안 실린다** — 편집 실패 수습이면 문서에 거절된 편집이 남은 채 큐만 빈다(수습은 문서를 되돌리지 않는다 — `failEdits`), 페이지
   * 열기면 캔버스가 «불러오는 중»에 머문다. 앞 답을 먼저 실어도 뒤 답이 오면 그 위에 실린다.
   *
   * **세대가 닫지 않는 판은 창 얹기가 닫는다**(`#windowChanges`) — 조회 하나의 창 안에서 얹힌 남의 프레임 · 내 ack 는 다툴 다른 조회가
   * 없어 그 조회의 옛 답이 싣는다. 뒤에 시작한 조회가 먼저 읽힌 판(두 연결의 순서가 뒤집혔다)도 뒤 답이 옛 판을 싣는다. 둘 다 그 사이의
   * 커밋이 조회가 시작된 뒤 프레임 · ack 로 왔으므로 실린 판 뒤에 제 차례로 얹힌다. 복원 앞일 수 있는 판은 복원 신호로 가른다
   * (`#restoredAt`).
   */
  readonly settlePageLoad = (ticket: number): boolean => {
    if (ticket <= this.#pageLoadSettled) return false
    this.#pageLoadSettled = ticket
    // 이 세대보다 앞에 시작한 조회는 더는 판을 못 정한다 — 그 조회들만 얹을 몫은 버린다(`#windowChanges`).
    this.#windowChanges = this.#windowChanges.filter((change) => change.begun >= ticket)
    return true
  }

  /** 더 나중에 시작한 조회가 이미 판을 정했는가 — 정하지 않고 묻기만 한다(판을 정하지 않는 실패 갈래가 쓴다). */
  readonly pageLoadSuperseded = (ticket: number): boolean => ticket <= this.#pageLoadSettled

  /**
   * **이 편집을 서버로 낸다**(전송 루프가 요청을 내기 직전에 부른다). 판을 다시 실으며 이 편집을 버리면 «취소됐다»가 아니라
   * «반영됐는지 모른다»다 — 서버에 닿아 커밋됐을 수 있다(`wasSent`).
   */
  readonly markSent = (clientOpId: string): void => {
    this.#sentOpId = clientOpId
    const head = nextPending(this.#state.pending)
    this.#sentOps = head !== null && head.clientOpId === clientOpId ? head.ops : null
    this.#sentPageId = this.#state.openPageId
    this.#sentQueue = this.#queueEpoch
  }

  /**
   * **마지막으로 나간 편집이 지금 큐에서 나갔는가** — 그 뒤로 판을 싣거나 비우지 않았는가(`#queueEpoch`). 거짓이면 그 편집의 실패는
   * 지금 큐의 일이 아니다 — 지금 큐는 다른 판 위에 쌓였다(편집 실패 수습 `recover`가 큐를 비우기 전에 본다).
   *
   * **페이지 id 로 가르지 않는다.** 1쪽 → 2쪽 → 1쪽으로 돌아오면 id 는 같은데 큐는 다시 연 판 위의 것이다. 판째 버린 편집
   * (`wasAbandoned`)은 이 판정의 한 꼴이다 — 이것은 큐에 없던 편집(리베이스가 먼저 버린 것)까지 본다.
   */
  readonly sentFromOpenQueue = (): boolean => this.#sentQueue === this.#queueEpoch

  /**
   * **버린 편집이 이미 나간 것인가.** 판을 다시 싣는 자리(`loadPage`의 반환)가 «취소»와 «모름»을 가른다. 나간 편집은 커밋 뒤에
   * 버려져도 이 탭에 돌아오지 않는다 — 답(ack)은 큐에 없어 버려지고(`ackEdit`), 방송은 낸 연결을 뺀다.
   */
  readonly wasSent = (edit: PendingEdit): boolean => edit.clientOpId === this.#sentOpId

  /** 이 편집을 나간 뒤 판째 버렸는가(`#abandonedOpId`). 전송 루프가 그 늦은 거절을 수습하지 않는 데 쓴다. */
  readonly wasAbandoned = (clientOpId: string): boolean => clientOpId === this.#abandonedOpId

  /**
   * **큐의 주인 페이지** — 큐의 편집은 늘 이 페이지의 것이다(큐는 페이지를 옮길 때 비워진다 — `clearPage` · 다른 페이지의 `loadPage`).
   * 전송 루프가 편집을 보낼 경로다(`edit/use-edit-commit.tsx`의 `pump`). 화면이 문서를 읽는 관문(`useOpenPage`)이 아니다 — 주소와
   * 대조하지 않는다. 큐와 같은 순간의 값이라야 하기 때문이다.
   */
  readonly queuePageId = (): string | null => this.#state.openPageId

  /**
   * **큐의 주인 프로젝트** — 셸이 프로젝트를 옮기며 `reset`에 넘긴 값이다. 전송 루프는 앞 편집의 답을 기다리는 동안 프로젝트가 바뀌어도
   * 이어서 돌므로, 그 훅이 쥔 `projectId`로 보내면 옮겨 간 프로젝트의 편집이 앞 프로젝트 경로로 나간다(jsdom: `/projects/앞/pages/새
   * 페이지/ops`). 넘긴 적이 없으면(셸 없이 스토어를 쓰는 자리) `null` — 부르는 쪽이 제 값을 쓴다.
   */
  readonly queueProjectId = (): string | null => this.#projectId

  /**
   * **이 편집을 페이지를 떠나며 버렸는가**(`#abandonedLeaving`). 그 편집의 거절은 수습하지 않지만 말은 해야 한다 — 떠나기 전 화면에는
   * 그 편집이 서 있었다(리베이스가 남의 변경 위로 옮겨 409 뒤 다시 내려던 편집이면 더 그렇다: Chrome — 1쪽 «삭제»가 줄 선 사이 밥이
   * 앞 형제를 지워 리베이스가 옮겼고, 409 가 오기 전에 2쪽으로 옮기자 서버 1쪽에 그 글이 남았다 · 통지 0). 같은 페이지를 다시 실으며
   * 버린 것은 그 자리에서 «모름»으로 이미 말했다.
   */
  readonly abandonedOnLeave = (clientOpId: string): boolean => clientOpId === this.#abandonedOpId && this.#abandonedLeaving

  /**
   * **떠나며 판째 버린 나간 편집과 함께 버린 안 보낸 편집의 수**(`#abandonedUnsent`). 그 편집의 거절을 말하는 문장이 합쳐 센다 — 안 보낸
   * 것은 떠나는 순간 이미 말했지만, 통지 자리가 하나라 거절의 문장이 그 말을 덮는다.
   */
  readonly abandonedUnsent = (): number => this.#abandonedUnsent

  /** **그 편집과 함께 버린 것들이 있던 페이지**(`#abandonedPages`) — 거절의 문장이 페이지 수를 싣고, 통지는 이 페이지들을 다시 열면 풀린다. */
  readonly abandonedPages = (): readonly string[] => this.#abandonedPages

  /**
   * 나간 편집을 판째 버리면 적는다(`#abandonedOpId`). 떠나며 버렸으면 함께 버린 안 보낸 편집의 수와 떠난 페이지도 적는다.
   *
   * **떠나며 버린 나간 편집의 답을 기다리는 동안 또 떠나면 그 수에 더한다.** 그 동안 옮겨 간 페이지에서 친 편집은 그 답 뒤에 줄 서 한
   * 번도 안 나간다(in-flight 는 하나다). 떠나는 순간 그 수를 말하지만(`routes/editor.tsx`의 `leavePage`) 통지 자리가 하나라 거절의 문장이
   * 그 말을 덮는다 — 첫 떠남만 세면 둘째 떠남의 것이 합친 문장에서 빠진다(Chrome: 1쪽 편집이 줄 선 채 2쪽에서 치고 3쪽으로 옮긴 뒤 거절
   * — 잃은 것 둘 · «보낸 편집 1개가»). **답을 기다리는지는 «마지막으로 나간 것이 그 편집인가»로 가른다** — 답이 오면 전송 루프는 쌓인
   * 편집을 곧바로 내고(`markSent`), 쌓인 것이 없으면 멈췄다가 다음 편집을 곧바로 낸다. 그래서 그 편집이 마지막으로 나간 채 안 보낸
   * 편집이 버려지는 판은 답을 기다리는 판뿐이다.
   */
  #noteAbandoned(dropped: readonly PendingEdit[], leaving: boolean): void {
    const page = this.#state.openPageId ?? this.#sentPageId
    if (!dropped.some((edit) => edit.clientOpId === this.#sentOpId)) {
      if (leaving && this.#abandonedLeaving && this.#abandonedOpId === this.#sentOpId && dropped.length > 0) {
        this.#abandonedUnsent += dropped.length
        if (page !== null && !this.#abandonedPages.includes(page)) this.#abandonedPages = [...this.#abandonedPages, page]
      }
      return
    }
    this.#abandonedOpId = this.#sentOpId
    this.#abandonedOps = this.#sentOps
    this.#abandonedLeaving = leaving
    this.#abandonedUnsent = leaving ? dropped.length - 1 : 0
    this.#abandonedPages = leaving && page !== null ? [page] : []
  }

  /**
   * **내 바탕이 곧 이 서버 판인가** — 같은 페이지 · 같은 `headSeq` · **같은 문서**일 때만 참이다. 재연결 재조회가 다시
   * 읽은 판을 싣지 않고 넘어가도 되는지를 이것 하나로 묻는다(`routes/editor.tsx`의 재연결 이펙트).
   *
   * **번호 말고 문서도 견준다 — 번호로는 서버 쪽 판본만 가른다.** 한 페이지 id 에서 번호가 같으면 서버 문서도 같다(서버가 되살린
   * 페이지도 옛 판본이 쓴 번호 뒤에서 센다 — `apps/api/src/repos/pages.ts`의 `insertPageWithId`). 그래도 문서를 견주는 것은 이 탭의
   * 바탕이 그 번호의 서버 문서와 같다는 것을 번호가 보증하지 않기 때문이다 — 바탕은 이 탭이 프레임 · ack 를 얹어 지은 것이라, 얹기가
   * 서버와 갈리면(얹기 결함 · 번호를 못 알아본 빠진 프레임) 번호는 같고 문서는 다르다. 그 판을 «같다»로 넘기면 편집 경로가 자리(index)
   * 기반이라 다음 편집이 **남의 노드를 덮는다.** 재연결마다 도는 비용(아래)으로 그 벽을 산다.
   *
   * **바탕을 서버 판과 견주고, 화면(`document`)을 «바탕 + 큐»와 견준다.** 바탕이 서버가 기록한 문서이고(내 낙관적 편집이 안
   * 섞였다), `document`는 보내지 않은 편집만큼 앞서 있다 — 그 편집은 넘어간 뒤 그 바탕 위에 그대로 나간다.
   *
   * **바탕만 보면 «바탕 + 큐 = 화면»을 전제한다 — 편집 실패 수습 중에는 깨져 있다.** 수습은 큐만 비우고(`failEdits`) 화면은 그
   * 조회의 `loadPage`가 되돌린다. 그 조회가 붙잡힌 사이 이 판정이 «같다»로 판을 정하면 되돌릴 유일한 답이 세대에 밀려, 거절된
   * 편집이 화면에 남는다(Chrome: 수습의 조회 답을 7s 붙잡은 사이 WS 가 다시 붙어 3/3 — 캔버스 «앨리스가 친 글» · 서버 «원문»).
   * 수습의 재조회까지 실패한 판(화면에 저장 안 된 편집이 남는다)도 같다 — 다음 재연결이 판을 싣는다.
   *
   * **화면을 서버 판과 곧바로 견주지 않는다.** 큐에 편집이 있으면 화면은 늘 서버 판과 다르다 — 그러면 다시 붙을 때 읽는 동안 친
   * 편집(한도를 넘겨 답을 못 받은 것 포함)을 버리고 «취소»라 말하며 되돌리기 이력을 비운다. 전제가 선 판에서 동작이 그대로인 쪽을
   * 골랐다(`test/store/remote-change.test.ts`의 «보내지 않은 편집이 있어도 바탕이 서버 판이면 같은 판이다»가 지킨다). 큐가 바탕에 안
   * 얹히면(불변식이 깨졌다) 같지 않은 것으로 본다.
   *
   * **비용**: 바탕 · 화면을 한 번씩 훑는다(`sameJson`) — 같은 본문의 `JSON.parse`와 같은 급이다(잰 값은 `sameJson`의 머리말).
   * 막 실은 판은 둘이 같은 참조라 화면 쪽이 공짜고, 큐가 있으면 그 ops 를 바탕에 얹는 값이 더 든다. vitest(jsdom) · 한 Section 에
   * Text 20000 개(1.7MB) · 키 순서를 뒤집은 서버 판 · 25 회 중앙값: 막 실은 판 3.3ms · ack 뒤(바탕과 화면이 다른 객체) 6.7ms(바탕만
   * 견주면 3.3ms) · 보내지 않은 편집 하나 16ms(12ms) — 같은 본문의 `JSON.parse` 3.4ms. 재조회는 연결이 다시 붙을 때만 돌고, 그
   * 조회가 이미 같은 문서를 내려받아 파싱했다.
   */
  readonly holdsServerPage = (pageId: string, headSeq: number, document: PageDocument): boolean => {
    const { openPageId, baseDocument, document: current, pending } = this.#state
    if (openPageId !== pageId || this.#state.headSeq !== headSeq || baseDocument === null || current === null) return false
    if (!sameJson(baseDocument, document)) return false
    let expected = baseDocument
    for (const edit of pending) {
      try {
        expected = applyOps(expected, edit.ops)
      } catch {
        return false
      }
    }
    return sameJson(current, expected)
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
   * **새로고침으로 채울 되돌리기의 판** — 판을 실은 바로 뒤에 부른다(`routes/editor.tsx`의 `restoreUndo`). 목록 답을 실을 때
   * (`restoreUndoStack`) 이것과 견줘, 그 사이 판이 다시 실렸거나 비었으면 버린다. 열린 판이 없으면 `null`.
   */
  readonly undoRestorePoint = (): UndoRestorePoint | null => {
    const { openPageId, document, headSeq } = this.#state
    if (openPageId === null || document === null) return null
    return { pageId: openPageId, epoch: this.#queueEpoch, seq: headSeq }
  }

  /**
   * **되짚으려면 더 받아야 할 이력** — 되돌리기의 맨 위가 새로고침으로 채운 항목인데, 그 이력을 실은 판에서 내 가장 옛 항목까지 거꾸로
   * 되짚는 길에 빠진 번호가 있으면 그 가장 높은 번호부터 아래로 빠진 구간을 받는 조회(`seq < beforeSeq` · 최신순 `limit`개)를 낸다. 받은
   * 답은 같은 값과 함께 `supplyUndoHistory`로 넘긴다. 빠진 것이 없거나 · 맨 위가 세션 항목이거나 · 이미 되짚기 시작했거나 · 판이 갈렸으면
   * `null`.
   *
   * **누를 때 묻는다**(`edit/use-edit-commit.tsx`의 `undo`) — 페이지를 열 때 받지 않는다. 문서 통째 교체 revision 은 문서 두 벌이라 그것이
   * 낀 페이지를 열 때 미리 받으면 되돌리기를 안 눌러도 응답이 수백 MB 다(api: 노드 2000 문서 교체 200 개 → 한 조회 185MB). 세션 항목은
   * 이력 없이 되돌리므로 그 위에서는 묻지 않는다.
   *
   * 빠진 번호는 남의 revision(코멘트 번호 포함 · 토큰으로 낸 내 것)이거나, 목록을 읽은 뒤 · 목록 답 전에 온 프레임 · 내 ack 의
   * revision 이다 — 목록은 내 것만이고 그 뒤의 것은 서버가 목록을 읽은 판에 없었다. **되짚는 판은 목록 답을 실은 판이다**
   * (`restoreUndoStack`) — 그 뒤에 판이 올라도 구간은 늘지 않는다. 한 조회의 상한(`UNDO_HISTORY_PAGE`)을 넘으면 받은 것을 넘기고 다시 묻는다.
   */
  readonly undoHistoryNeed = (): UndoHistoryNeed | null => {
    const history = this.#restoredHistory
    if (history === null || history.epoch !== this.#queueEpoch || history.walked) return null
    const { undoStack } = this.#state
    if (undoStack[undoStack.length - 1]?.anchorOnUse === undefined) return null
    let missing: number | null = null
    for (let seq = history.headSeq; seq > history.lowest; seq -= 1) {
      if (!history.inverses.has(seq)) {
        missing = seq
        break
      }
    }
    if (missing === null) return null
    // 빠진 구간의 아래 끝 — «그 아래가 모두 찬 데»까지만 끊는다. 이미 가진 번호에서 끊으면 구멍마다 조회가 하나씩 들어, 둘이 번갈아 고친
    // 페이지에서 회수 한도가 먼저 찬다(jsdom: 번갈아 10 번 → 조회 3 회 limit 1 · 되돌리기 3 · 건너뜀 7). 구간 안의 가진 번호는 다시 받는다.
    let bottom = history.lowest
    while (bottom + 1 < missing && history.inverses.has(bottom + 1)) bottom += 1
    return { beforeSeq: missing + 1, limit: Math.min(UNDO_HISTORY_PAGE, missing - bottom), epoch: history.epoch }
  }

  /**
   * 되짚기 조회의 답을 싣는다(`undoHistoryNeed`). 그 이력을 실은 판이 아니거나(다시 실림 · 떠남) 이미 되짚기 시작했으면 싣지 않고 `false`.
   * 누가 냈든 받는다 — 되짚기에는 `inverse`만 쓴다.
   */
  readonly supplyUndoHistory = (need: UndoHistoryNeed, revisions: readonly RestoredRevision[]): boolean => {
    const history = this.#restoredHistory
    if (history === null || !this.undoHistoryLive(need) || history.walked) return false
    for (const revision of revisions) {
      if (revision.seq > history.lowest && revision.seq <= history.headSeq) history.inverses.set(revision.seq, revision.inverse)
    }
    return true
  }

  /** 그 조회를 낸 판이 아직 열려 있는가 — 판을 다시 싣거나 비우면 `false`다. */
  readonly undoHistoryLive = (need: UndoHistoryNeed): boolean =>
    this.#restoredHistory?.epoch === need.epoch && this.#queueEpoch === need.epoch

  /** 되짚기 이력을 받기 시작한다 — 되돌리기 단추가 꺼진다(`undoHistoryLoading`). 그 판이 아니면 아무것도 안 한다. */
  readonly beginUndoHistoryLoad = (need: UndoHistoryNeed): void => {
    if (this.undoHistoryLive(need)) this.#apply({ undoHistoryLoading: true })
  }

  /** 받기를 끝낸다. 그 사이 판이 갈렸으면 그 판이 이미 풀었다 — 새 판의 받기를 건드리지 않는다. */
  readonly endUndoHistoryLoad = (need: UndoHistoryNeed): void => {
    if (this.undoHistoryLive(need)) this.#apply({ undoHistoryLoading: false })
  }

  /**
   * 서버가 준 내 revision으로 undo 스택을 채운다 — **세션 항목 아래에** 서버 번호 순으로 싣는다.
   *
   * **`mine`은 `seq` 내림차순(최신이 앞)이다** — 서버 응답 순서 그대로 받는다. 이 스토어의
   * 스택은 **끝이 top**이므로 여기서 뒤집어 싣는다. (*"뒤집지 마라"*는 스택을 "앞이 top"으로
   * 두는 표현을 전제한 말이라 여기에 안 맞는다. 재는 것은 배열 모양이 아니라
   * **어느 것이 먼저 undo되는가**이고, `restoreUndoStack은 최신이 top이 되게 싣는다`가
   * 그것을 고정한다.)
   *
   * ## 판을 실은 번호까지만 싣는다 — 그 뒤는 세션 항목이다
   *
   * 목록 답은 판을 실은 뒤에 온다. 그 사이 이 탭이 고친 편집은 ack 로 이미 스택에 올랐다(`ackEdit`) — 스택을 갈아 끼우면 그것이 사라진다
   * (Chrome: 목록 답을 붙잡은 채 «가»를 고치고 놓으면, 스택을 갈아 끼우는 판은 되돌리기가 꺼지거나 첫 되돌리기가 세션 편집 대신 앞 편집을 되돌린다). 그래서
   * 판을 실은 번호(`point.seq`) 이하의 내 revision 만 **그 아래에** 끼운다 — 그 뒤의 내 revision 은 세션 항목이 이미 든다. 세션 항목의 번호는
   * 모두 판을 실은 번호보다 크므로 이것이 서버 번호 순이다. redo 스택은 건드리지 않는다 — 세션 안에서 되돌린 것이다.
   *
   * **판이 갈렸으면 버린다** — 목록을 받는 동안 판이 다시 실리거나(재연결 · 복원 · 수습) 비었으면(떠남) 세대(`point.epoch`)가 다르다. 다시 싣는
   * 입구는 스택을 채우지 않는다(`routes/editor.tsx`의 `applyServerPage`). 한 판에 한 번만 싣는다.
   *
   * ## 그 revision 을 기록한 문서에서 노드 id 로 붙잡는다 — 되돌릴 때
   *
   * 서버의 `inverse`는 그 revision 을 막 기록한 문서의 자리 경로다. 그 뒤 남이 같은 배열 앞자리에 넣었으면 옛 자리가 **남의 노드**를
   * 가리키고 서버는 받은 경로를 그대로 적용한다(설계서 「정방향 흐름」 — Chrome: 경로 그대로 보내는 판은 밥이 맨 앞에 넣은 판에서 «나»의 되돌리기가
   * «가»를 고쳤다). 그래서 세션 안 항목(`ackEdit`)처럼 **그 revision 을 막 기록한 문서에서 노드 id 로 붙잡는다**. 그 문서는 이것을 부른 판의
   * 바탕에서 그 뒤 revision 의 `inverse`를 차례로 얹어 되짚는다 — 내 것이든 남의 것이든 받은 것으로. 목록에 없는 번호(남의 것 · 목록 답 전에 온
   * 프레임 · 내 ack)는 처음 누를 때 받는다(`undoHistoryNeed` · `supplyUndoHistory`) — 되짚는 판이 여기서 정해지므로 그 뒤에 판이 올라도 받을
   * 구간은 늘지 않는다. `others`는 이미 받은 것을 함께 넘기는 자리다.
   *
   * **되짚기와 붙잡기는 되돌릴 때 한다**(`RevisionRef.anchorOnUse`) — 한 항목에 `anchorOps`(op 마다 문서 복제)와 `applyOps` 한 번씩이라, 페이지를
   * 열 때 50 항목을 다 하면 메인 스레드가 문서 크기 × op 수만큼 멈춘다(노드 6000 · 50 항목 × 20 op: 열 때 다 하면 2.7s · 되돌릴 때 하면 열 때 0ms ·
   * 첫 누름 0.16s — vitest node 환경에서 새 스토어에 `loadPage` → `restoreUndoStack` → `startUndo`를 `performance.now()`로 잰다). 누를 때는 맨
   * 위 항목 하나와 그 사이 번호만큼이다. 되짚는 문서는 항목끼리 나눠 쓴다 — 스택은 번호가 내려가는 순서로 소비된다.
   *
   * **못 짓거나 못 붙잡는 항목도 싣는다 — 누르면 건너뛰고 그 수를 말한다**(`#startFrom`의 `skipped` → «되돌릴 수 없는 편집 N개를
   * 건너뛰었습니다»). 되짚는 길에 받지 못한 번호가 남았거나(한 누름에 받는 구간의 한도 밖) 얹히지 않는 `inverse`에서 그 아래 항목이 그렇다. 싣지 않으면
   * 아무도 그 사실을 말하지 않는다.
   */
  readonly restoreUndoStack = (
    mine: readonly RestoredRevision[],
    options: { others?: readonly RestoredRevision[]; point?: UndoRestorePoint } = {},
  ): void => {
    const point = options.point ?? this.undoRestorePoint()
    if (point === null || this.#undoRestoredEpoch === point.epoch) return
    const walk = this.#undoHistory(point, { mine, others: options.others })
    if (walk === null || walk.restorable.length === 0) return
    this.#undoRestoredEpoch = point.epoch
    const history: RestoredHistory = { epoch: point.epoch, headSeq: walk.headSeq, lowest: walk.lowest, inverses: walk.inverses, walked: false }
    this.#restoredHistory = history
    const recordedAt = historyDocuments(walk.head, walk.headSeq, walk.inverses)
    const restored = walk.restorable.map(
      (revision): RevisionRef => ({
        revisionId: revision.revisionId,
        inverse: revision.inverse,
        anchorOnUse: once(() => {
          // 되짚기 시작 — 그 뒤로는 더 받지 않는다(`undoHistoryNeed`). 받지 못한 번호 아래의 항목은 못 짓고 누를 때 건너뛴다.
          history.walked = true
          const recorded = recordedAt(revision.seq)
          return recorded === null ? null : anchorOps(recorded, revision.inverse)
        }),
      }),
    )
    this.#apply({ undoStack: [...restored.reverse(), ...this.#state.undoStack] })
  }

  /** 마지막으로 되돌리기를 채운 판의 세대(`restoreUndoStack` — 한 판에 한 번). */
  #undoRestoredEpoch = -1

  /** 새로고침으로 채운 항목을 되짚을 재료(`restoreUndoStack`) — 누를 때 빠진 구간을 받아 채운다(`supplyUndoHistory`). 판을 싣거나 비우면 버린다. */
  #restoredHistory: RestoredHistory | null = null

  /**
   * 되짚기의 재료 — 판이 `point`의 것일 때만 낸다. 실을 내 revision(판을 실은 번호 이하 · 최신순), 그 가장 옛 번호, 되짚을 `inverse`(그 번호
   * 위 · 지금 번호 이하).
   */
  #undoHistory(
    point: UndoRestorePoint,
    history: { mine: readonly RestoredRevision[]; others?: readonly RestoredRevision[] | undefined },
  ): {
    head: PageDocument
    headSeq: number
    restorable: RestoredRevision[]
    lowest: number
    inverses: Map<number, PatchOp[]>
  } | null {
    const { openPageId, baseDocument, headSeq } = this.#state
    if (openPageId !== point.pageId || this.#queueEpoch !== point.epoch || baseDocument === null) return null
    const ids = new Set<string>()
    const restorable = history.mine
      .filter((revision) => revision.seq <= point.seq && !ids.has(revision.revisionId) && ids.add(revision.revisionId))
      .sort((a, b) => b.seq - a.seq)
    const lowest = restorable[restorable.length - 1]?.seq ?? headSeq
    const inverses = new Map<number, PatchOp[]>()
    for (const revision of [...history.mine, ...(history.others ?? [])]) {
      if (revision.seq > lowest && revision.seq <= headSeq) inverses.set(revision.seq, revision.inverse)
    }
    return { head: baseDocument, headSeq, restorable, lowest, inverses }
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
   * `applyOps`가 던질 수 있다 — 서버가 센 경로가 내 **바탕**에 없으면(바탕이 서버와 갈라졌다). 보내지 않은 편집은 까닭이
   * 아니다 — 번호는 바탕에 얹고 그 편집을 위에 다시 얹는다(`#applyMarkerOps`). **그때 `headSeq`만 올리지 않는다.** 올리면 *"화면에는 번호가 없는데 다음 편집은
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
   * | `'skipped'` | **다른 페이지가 열려 있거나 문서가 없다** — 그 페이지를 여는 중이면 창에 적는다(`#windowChanges`) | 없다 — 그 화면은 이미 딴 것을 보고 있다 |
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
   * **그래서 기다렸다가 제 차례에 얹는다** — 사이 revision 을 얹어 `headSeq`를 올리는 자리마다 이어서 얹는다. 남의 것이면
   * 프레임(`applyRemoteChange`)이고, **내 것이면 프레임이 안 온다**(발신 제외) — 내 편집의 ack(`ackEdit`) · 내 다른 번호 응답(아래
   * 곧바로 얹는 갈래)으로 온다. 한 자리라도 빠지면 받지 않은 것이 없는데 한도 뒤 `'gap'`이 서고 번호가 끝내 안 뜬다. 곧바로
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
    if (openPageId !== pageId || document === null || baseDocument === null) {
      // **여는 조회가 도는 페이지면 창에 적는다**(`applyRemoteChange`의 같은 줄) — 게시의 방송은 낸 연결을 빼므로 이 응답이 그 revision 이
      // 이 탭에 오는 유일한 길이다. 그 조회가 이 커밋 앞을 읽었으면 실린 판 뒤에 얹는다(Chrome: 게시를 행 잠금에 줄 세운 채 떠났다
      // 돌아오고, 다시 여는 조회가 그 커밋 앞을 읽자 번호가 캔버스에 없고 다음 편집이 409 로 취소됐다). 문서가 안 바뀐 응답은 revision 이
      // 아니다(아래 «`markerOps`가 비면 …»).
      if (pageId === this.#openingPageId && change.markerOps.length > 0) this.#noteWindow(pageId, change.seq, change.markerOps)
      return 'skipped'
    }

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

    if (!this.#applyMarkerOps(change)) return 'diverged'
    // 이 번호가 기다리던 번호의 사이 revision 이었을 수 있다(위 «그래서 기다렸다가 …»).
    this.#settleWaitingMarkers()
    return 'applied'
  }

  /**
   * 번호 ops 를 바탕에 얹고 보내지 않은 편집을 그 위에 다시 얹은 뒤 `headSeq`를 `seq`로 옮긴다. **`seq === headSeq + 1`일 때만
   * 부른다**(`applyMarkerChange`의 «내 다음 번호가 아니면 사이 프레임을 기다린다»). 못 얹으면 아무것도 안 움직이고 거짓이다.
   *
   * **`document`에 곧바로 얹지 않는다 — 리베이스다**(`#rebaseOnto`와 같은 길). 경로는 서버가 `seq - 1` 문서에서 센 것이고 그
   * 문서는 바탕이다 — 보내지 않은 편집이 얹힌 `document`가 아니다. 보내지 않은 구조 편집이 앞에 노드를 넣었으면 같은 경로가
   * **그 편집이 만든 노드**를 가리킨다(jsdom: head 7 `[n_a, n_b]` · E1 글 고침 · E2 맨 앞에 `n_new` · `n_b`에 단 게시(9)의 응답이
   * E1 ack 보다 먼저 → ack 뒤 화면 `n_new, n_a#1, n_b` · 서버 `n_new, n_a, n_b#1` · 낡음 없음). 보내지 않은 삭제가 그 노드를
   * 지웠어도 같다 — 바탕에는 노드가 있어 얹히고, 삭제는 그 위에 다시 얹힌다.
   */
  #applyMarkerOps(change: { seq: number; markerOps: PatchOp[] }): boolean {
    const { baseDocument, pending } = this.#state
    if (baseDocument === null) return false
    let nextBase: PageDocument
    let document: PageDocument
    try {
      // **바탕에 얹는다** — 이 변경은 서버가 이미 기록한 것이므로 바탕이 그것을 모르면 다음 리베이스가 **번호 없는 문서** 위에서
      // 만들어진다. 여기서 던지면 서버가 센 경로가 내 바탕에 없다 — 바탕이 서버와 갈라졌다.
      nextBase = applyOps(baseDocument, change.markerOps)
      document = nextBase
      // **보내지 않은 편집은 버리지 않는다** — 하나라도 다시 못 얹으면 아무것도 안 움직인다. `#rebaseOnto`처럼 버리면 부르는
      // 쪽(코멘트 응답)이 버린 편집을 말할 자리가 없다. 번호 ops 는 `marker` 칸만 바꾸므로 편집이 그것에 걸려 못 얹히는 판은
      // 코드로 못 찾았다 — 그래도 조용히 잃지 않게 «못 얹음»으로 모은다(부르는 쪽이 말한다).
      for (const edit of pending) document = applyOps(document, edit.ops)
    } catch {
      // **`headSeq`도 안 올린다** — 올리면 문서와 revision 번호가 조용히 갈라진다. 셋(문서·바탕·`headSeq`)이 함께 간다.
      return false
    }

    this.#apply({ document, baseDocument: nextBase, headSeq: change.seq })
    this.#noteWindow(this.#state.openPageId, change.seq, change.markerOps)
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
   * 기다리던 번호 응답을 **제 차례가 온 만큼** 얹는다 — `headSeq`를 올린 뒤마다 부른다: 프레임(`applyRemoteChange`) · 내 편집의
   * ack(`ackEdit`) · 곧바로 얹은 번호 응답(`applyMarkerChange`) · 같은 페이지를 다시 실은 판(`loadPage`). `giveUp`을 주면 남은
   * 것을 버리고 그 낡음을 세운다(한도를 넘겼다). 얹다가 던지면 `'diverged'`다.
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
   * ## 받은 프레임은 미루지 않는다
   *
   * 리베이스는 프레임을 **미루지 않고** 곧바로 얹는다. `'gap'` 갈래도 미뤄 두었다가 얹지 않는다(모르는 번호의 ops는 애초에 받은 적이
   * 없다). **다시 읽는 창 안에서만 적어 둔다**(`#windowChanges`) — 얹든 못 얹든 적고, 실린 판 뒤에 제 차례면 얹는다. 보내는 쪽은 REST든
   * WS든 같은 `applyEdit`을 지나 `baseSeq` 일치를 요구받는다(`apps/api/src/ws/patch.ts`).
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
    if (openPageId !== pageId || document === null || baseDocument === null) {
      // **여는 조회가 도는 페이지면 창에 적는다**(`#openingPageId`) — 그 조회가 이 커밋 앞을 읽었으면 실린 판 뒤에 얹는다.
      if (pageId === this.#openingPageId) this.#noteWindow(pageId, change.seq, change.ops)
      return unchanged('skipped')
    }
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
    // **다시 읽는 창 안이면 얹든 못 얹든 적는다**(`#windowChanges`) — 여기서 갭이던 번호도 실릴 판에서는 제 차례일 수 있다.
    this.#noteWindow(pageId, change.seq, change.ops)

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
   * **버린 것도 경로를 다시 지은 것도 없으면 `pending` 배열의 참조를 그대로 둔다** — 새 배열을 만들면 `#apply`가
   * 변경으로 보고 큐를 구독하는 쪽이 프레임마다 헛일을 한다(`NO_WARNINGS`와 같은 이유).
   */
  #rebaseOnto(nextBase: PageDocument, seq: number, extra: Partial<EditorState>): PendingEdit[] {
    const { pending } = this.#state
    const kept: PendingEdit[] = []
    const dropped: PendingEdit[] = []
    let document = nextBase

    let moved = false

    for (const edit of pending) {
      // **붙잡은 편집은 노드 id 로 경로를 다시 짓는다**(`anchored-ops.ts`) — 경로 그대로 얹으면 남이 같은 배열 앞자리에 넣거나 뺀 판에서 **다른
      // 노드**에 얹히고, 409 뒤 다시 내기가 그 경로를 서버에 보낸다. 다시 지은 ops 가 곧 그 편집의 ops 다 — 나갈 요청(`nextRequest`)도 그것을 낸다.
      if (edit.anchored) {
        const rebased = rebaseAnchored(document, edit.anchored)
        if (rebased === null) {
          dropped.push(edit)
          continue
        }
        document = rebased.document
        if (sameOps(rebased.ops, edit.ops)) {
          kept.push(edit)
        } else {
          kept.push({ ...edit, ops: rebased.ops })
          moved = true
        }
        continue
      }
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
      pending: dropped.length === 0 && !moved ? pending : kept,
    })
    return dropped
  }

  /**
   * **판이 통째로 갈렸다고 표시한다.** 남이 스냅샷을 복원하면 페이지가 사라지거나 생기고
   * 문서가 통째로 바뀌므로 `ops`로 표현되지 않는다 — 얹을 것이 없고, 할 수 있는 정직한
   * 일은 그 사실을 말하는 것뿐이다.
   */
  readonly markRestored = (): void => {
    // 기다리던 번호도 버린다 — 그 경로가 복원 앞 판의 것인지 이 탭은 가르지 못한다.
    this.#dropWaitingMarkers()
    // 창 안의 revision 도 버린다(`#windowChanges`) — 도는 조회가 복원 앞을 읽었으면 그 판 뒤의 것이 아니다.
    this.#windowChanges = []
    // **지금 도는 조회는 복원 앞을 읽었을 수 있다** — 그 답이 실려도 이 낡음을 풀지 않는다(`loadPage`의 `beforeRestore`). 판을 정하지 못하게
    // 하지는 않는다(세대를 올려 `settlePageLoad`를 거짓으로): 여는 조회면 캔버스가 «불러오는 중»에 머물고, 수습의 조회면 거절된 편집을
    // 되돌리는 유일한 답이 버려진다.
    this.#restoredAt = this.#pageLoadsBegun
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
   *
   * **버린 편집을 돌려준다**(`loadPage`와 같다) — 떠나는 화면이 그 수를 말한다(`routes/editor.tsx`의 `leavePage`). 답을 기다리던 편집 뒤에
   * 쌓인 편집은 서버에 한 번도 안 갔다 — 말없이 버리면 사용자는 저장된 줄 안다(Chrome: 앞 편집이 행 잠금에 선 사이 같은 칸을 다시 고치고
   * 옮기자, 서버에는 앞 편집만 · 통지 0).
   */
  readonly clearPage = (): PendingEdit[] => {
    const { pending, undoStack, redoStack } = this.#state
    this.#leftPageId = this.#state.openPageId
    this.#noteAbandoned(pending, true)
    this.#queueEpoch += 1
    this.#restoredHistory = null
    this.#windowChanges = []
    this.#openingPageId = null
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
      undoHistoryLoading: false,
      editStatus: 'idle',
      // 떠나며 버린 편집을 말하는 통지만 남긴다(`#leaveNotice`).
      editFailure: this.#keptLeaveNotice(),
      editWarnings: this.#state.editWarnings.length === 0 ? this.#state.editWarnings : NO_WARNINGS,
      remoteStale: null,
    })
    return pending
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
    // **만든 문서에서 노드 id 로 붙잡는다** — 리베이스가 그 id 의 자리로 경로를 다시 짓는다(`anchored-ops.ts`). 만든 문서는 지금 `document`다
    // (낙관 적용 전) — 이 편집의 ops 는 그 위에서 지어졌다.
    const source = this.#state.document
    const anchored = source === null ? null : anchorOps(source, ops)
    // `pending`을 **새 배열로** 만드는 것이 계약이다 — `#apply`가 참조 비교를 하므로
    // 제자리에서 `push`하면 알림이 안 간다.
    this.#apply({
      ...extra,
      document,
      pending: [...this.#state.pending, { clientOpId, ops, baseSeq: this.#state.headSeq, kind, anchored }],
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

      // 건너뛴 항목이 문서를 바꾸지 않으므로 후보마다 **같은 문서**에 시험한다. **붙잡은 항목은 노드 id 로 경로를 다시 짓는다**
      // (`RevisionRef.anchored`) — 그 사이 남이 앞자리에 넣었으면 `inverse`의 옛 자리가 남의 노드를 가리킨다. 경로의 노드가 사라졌으면 못 얹는다.
      const attempt = this.#tryInverse(document, ref)
      if (attempt === null) {
        stack = rest
        skipped += 1
        continue
      }
      const { ops, document: next } = attempt

      // **낙관적 적용보다 먼저 묻는다 — 순서가 계약이다.** 뒤로 옮기면 «깜빡임»이 아니라
      // **항목이 사라진다.** 변조로 쟀다(이 판정을 아래 `#enqueue` **뒤로** 옮긴다):
      // `test/lock/undo-locks.test.tsx`의 케이스가 죽고, 그때 undo 스택이
      // **2 → 1**로 «소비»된다. `#enqueue`가 낙관 적용과 함께 그 항목을 스택에서 빼는데
      // 훅(`edit/use-edit-commit.tsx`의 `step`)은 `blocked`를 보고 펌프를 안 밟으므로,
      // **문서는 되돌아간 채 남고 요청은 나가지 않으며 잠금이 풀린 뒤 다시 눌러도 그 항목은
      // 이미 없다.** 되돌아갔다가 재조회로 복귀하는 깜빡임은 그보다 나은 판이다.
      const blocked =
        openPageId === null ? null : this.#lockConflict(openPageId, document, lockPointers(ops))
      if (blocked !== null) {
        // **건너뛴 것만 버리고 막힌 것은 남긴다.** `stack`은 이미 건너뛴 만큼 좁혀져 있고
        // 그 맨 위가 막힌 항목이다 — 잠금이 풀리면 다음 누름이 바로 그것을 집는다.
        if (skipped > 0) this.#apply(kind === 'undo' ? { undoStack: stack } : { redoStack: stack })
        return { clientOpId: null, skipped, blocked }
      }

      const clientOpId = this.#enqueue(
        next,
        // **서버가 준 `inverse`를 보낸다**(「정방향 흐름」). 클라이언트가 `invertOps`로 계산하지 않는다 — 클라이언트 상태가 낙관적으로 앞서
        // 있을 수 있기 때문이다. 다시 짓는 것은 경로뿐이다(`#tryInverse`).
        ops,
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

  /** 되돌리기 항목을 `document`에 얹어 본다 — 붙잡았으면 경로를 다시 짓고, 아니면 `inverse` 그대로. 못 얹으면 `null`. */
  #tryInverse(document: PageDocument, ref: RevisionRef): { ops: PatchOp[]; document: PageDocument } | null {
    if (ref.anchorOnUse !== undefined) {
      // 서버 이력으로 채운 항목 — 못 붙잡았으면 얹지 않는다(경로 그대로 보내면 남의 노드를 고칠 수 있다).
      const anchored = ref.anchorOnUse()
      return anchored === null ? null : rebaseAnchored(document, anchored)
    }
    if (ref.anchored) return rebaseAnchored(document, ref.anchored)
    try {
      return { ops: ref.inverse, document: applyOps(document, ref.inverse) }
    } catch {
      return null
    }
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
    if (nextPendingQueue === pending) {
      this.#orphanAck(clientOpId, result.seq)
      return
    }

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

    // 서버가 준 `inverse`를 **그대로** 싣는다(「정방향 흐름」). 붙잡는 문서는 그 revision 을 기록한 판(방금 접은 바탕)이다 — 바탕을 못 접었으면
    // (갈라졌다) 붙잡지 않는다.
    const recorded = nextBase !== null && this.#state.remoteStale?.reason !== 'diverged' ? nextBase : null
    const ref: RevisionRef = {
      revisionId: result.revisionId,
      inverse: result.inverse,
      anchored: recorded === null ? null : anchorOps(recorded, result.inverse),
    }
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
    // 내 편집이 기다리던 번호의 사이 revision 이었을 수 있다 — 그 프레임은 내게 안 온다(`applyMarkerChange`의 «그래서 기다렸다가 …»).
    this.#settleWaitingMarkers()
    // 서버가 이 번호로 기록한 ops 는 보낸 그것이다(`markSent`).
    this.#noteWindow(this.#state.openPageId, result.seq, clientOpId === this.#sentOpId ? this.#sentOps : head?.ops ?? null)
  }

  /**
   * **큐에 없는 편집의 ack** — 판을 다시 실으며 나간 편집을 버렸는데(`wasSent`) 그 편집이 서버에 커밋됐다. 다시 읽은 판이 그 커밋
   * **앞**을 읽었으면(`seq > headSeq`) 서버에는 있는데 이 판에는 없는 revision 이다 — 방송은 낸 연결을 빼므로 이 탭에 다시 오지 않는다.
   *
   * **바로 다음 번호이고 보낼 편집이 없으면 얹는다** — 서버가 그 번호로 기록한 것은 보낸 ops 그대로이고(`#abandonedOps`), 그 번호 바로
   * 앞의 판이 지금 판이다. 통지(«반영됐는지 모름 — 반영됐다면 곧 화면에 나타납니다»)가 그것으로 참이 된다. **그 밖이면 낡음(`'gap'`)을
   * 세운다** — 사이 번호가 없거나, 그 판 위에 보낼 편집이 쌓였다(얹으면 그 편집을 리베이스해야 하는데 버린 것을 말할 자리가 없다). 다시
   * 읽는 창 안이면 그 조회의 판에 얹을 몫으로도 적는다(`#windowChanges`).
   *
   * **나갈 때 열려 있던 페이지가 지금 열린 페이지일 때만이다** — 페이지를 옮긴 뒤의 답은 이 판과 무관하다. 그 페이지를 다시 여는
   * 중이면(떠났다 돌아오는 길) 여는 조회의 창에 적는다(`#openingPageId`) — 그 조회가 이 커밋 앞을 읽었으면 실린 판 뒤에 얹힌다.
   */
  #orphanAck(clientOpId: string, seq: number): void {
    const { openPageId, document, baseDocument, headSeq, pending } = this.#state
    if (clientOpId !== this.#abandonedOpId) return
    if (this.#sentPageId !== null && this.#sentPageId === this.#openingPageId && openPageId !== this.#sentPageId) {
      this.#noteWindow(this.#openingPageId, seq, this.#abandonedOps)
      return
    }
    if (openPageId === null || openPageId !== this.#sentPageId || document === null) return
    const ops = this.#abandonedOps
    this.#noteWindow(openPageId, seq, ops)
    if (seq <= headSeq) return
    if (seq === headSeq + 1 && ops !== null && pending.length === 0 && baseDocument !== null) {
      let next: PageDocument
      try {
        next = applyOps(baseDocument, ops)
      } catch {
        this.#markStale('diverged')
        return
      }
      this.#apply({ document: next, baseDocument: next, headSeq: seq })
      this.#settleWaitingMarkers()
      return
    }
    this.#markStale('gap')
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
   * **떠나며 버린 편집을 말한다** — 판을 비우는 자리가 지우지 않는 통지다(`#leaveNotice`). 새 편집 · 다른 통지는 그대로 덮는다. `pages`는 그
   * 통지가 «다시 열어 확인하세요»라고 가리키는 페이지다 — 그 페이지를 전부 다시 열면 풀린다(`loadPage`).
   */
  readonly setLeaveNotice = (message: string, pages: readonly string[]): void => {
    const notice: EditFailure = { kind: 'message', message }
    this.#leaveNotice = notice
    this.#leaveNoticePages = new Set(pages)
    this.#apply({ editFailure: notice })
  }

  /**
   * **마지막 `clearPage`가 비운 판의 페이지** — 떠나는 화면이 버린 편집을 말할 때 통지가 가리킬 페이지다(`routes/editor.tsx`의 `leavePage`). 화면이
   * 스토어의 `openPageId`를 곧장 읽지 않게 여기서 준다(`test/store-access.test.ts`).
   */
  readonly leftPage = (): string | null => this.#leftPageId

  /** 지금 통지가 떠남의 통지인가 — 통지 자리(`shell/edit-alert.tsx`)가 닫는 단추를 그릴지 가른다. */
  readonly isLeaveNotice = (failure: EditFailure | null): boolean => failure !== null && failure === this.#leaveNotice

  /** **떠남의 통지를 닫는다**(통지 자리의 단추). 다른 통지가 서 있으면 건드리지 않는다. */
  readonly closeLeaveNotice = (): void => {
    const shown = this.#keptLeaveNotice() !== null
    this.#leaveNotice = null
    this.#leaveNoticePages = new Set()
    if (shown) this.#apply({ editFailure: null })
  }

  /** 지금 통지가 떠남의 통지면 그것, 아니면 `null` — 판을 비우는 자리가 둘 통지다. */
  #keptLeaveNotice(): EditFailure | null {
    const { editFailure } = this.#state
    return editFailure !== null && editFailure === this.#leaveNotice ? editFailure : null
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
   * 페이지 하나를 닫는 것은 `clearPage`다 — 그쪽은 보기 설정을 남긴다. 옮겨 가는 프로젝트를 받는다(`queueProjectId`).
   */
  readonly reset = (projectId: string | null = null): void => {
    this.#projectId = projectId
    this.#noteAbandoned(this.#state.pending, true)
    this.#queueEpoch += 1
    this.#restoredHistory = null
    this.#windowChanges = []
    this.#openingPageId = null
    this.#dropWaitingMarkers()
    // 떠나며 버린 편집을 말하는 통지는 남긴다(`#leaveNotice`) — 캔버스의 여는 이펙트가 프로젝트를 옮기며 먼저 판을 비우고 그 통지를 세운다.
    this.#apply({ ...initialState(), editFailure: this.#keptLeaveNotice() })
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
