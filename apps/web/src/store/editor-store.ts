/**
 * 에디터 셸이 공유하는 편집 상태. **React·DOM·`fetch`를 import하지 않는다.**
 *
 * P2b-2가 이 스토어에 낙관적 적용·롤백·리베이스·pending 큐·undo/redo 스택을 얹는다.
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
import { applyOps, type PageDocument, type PatchOp, type ValidationIssue } from '@wirebound/schema'
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
 * - `sending` — 요청이 하나 떠 있다(D6 — in-flight는 항상 하나).
 * - `recovering` — 실패해서 페이지를 다시 받는 중이다(D4).
 */
export type EditStatus = 'idle' | 'sending' | 'recovering'

/**
 * 편집이 실패한 이유. 화면에 그리는 것은 `shell/edit-alert.tsx` 하나다(D8).
 *
 * **`api/failure.tsx`의 `Failure`와 같은 모양이고 그쪽 값이 그대로 들어온다.** 그 타입을
 * import하지 않는 것은 이 파일이 런타임 의존을 갖지 않기 위해서다(머리말) — 그쪽은
 * React·react-router를 쓰는 `.tsx`다. **모양이 갈리면 `edit/use-edit-commit.tsx`의
 * 대입에서 컴파일이 막힌다** — 구조적 타이핑이라 필드가 어긋나는 순간 그 대입이 에러다.
 */
export type EditFailure = { kind: 'signed-out' } | { kind: 'message'; message: string }

/**
 * 되돌릴 수 있는 revision 하나. 설계 §7.3이 *"클라이언트가 자기 revision id 스택을
 * 보유한다"*고 했고, README가 *"응답의 `inverse`를 그대로 다시 `ops`로 보내면 그 편집이
 * 취소된다"*고 했다 — **둘 다 필요하다.** id는 새로고침 복원(D10)에서 중복을 거르는 데
 * 쓰고, `inverse`는 전송에 쓴다.
 *
 * **`inverse`는 서버가 만든 그대로다**(설계 §7.1). 클라이언트가 `invertOps`로 계산하지
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

/** 캔버스 뷰포트 폭 프리셋 (설계 §9). */
export const VIEWPORT_PRESETS = [1920, 1440, 1280, 1024, 768, 375] as const

export type ViewportWidth = (typeof VIEWPORT_PRESETS)[number]

/** 줌 한계 (설계 §9). */
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
   * P2b-2에서는 그 창의 `headSeq`가 편집 요청의 `baseSeq`가 되므로, 대조를 **스토어 안에서**
   * 닫아 두는 편이 화면마다 따로 막는 것보다 안전하다.
   */
  openPageId: string | null
  /** 서버에서 받은 문서. P2b-2가 여기에 낙관적 패치를 적용한다. */
  document: PageDocument | null
  /** 이 문서의 최신 revision seq. P2b-2가 baseSeq로 쓴다. */
  headSeq: number
  selectedNodeId: string | null
  mode: EditorMode
  viewportWidth: ViewportWidth
  /** 0.25 ~ 2.0 */
  zoom: number
  /**
   * 보내지 않았거나 응답을 기다리는 편집. **`[0]`이 전송 중인 것이다**(D6).
   * 큐를 옮기는 규칙은 `edit-queue.ts`에 순수 함수로 있다.
   */
  pending: PendingEdit[]
  /** 되돌릴 수 있는 revision. **끝이 top**(최근)이다 — `ackEdit`이 뒤에 쌓는다. */
  undoStack: RevisionRef[]
  /**
   * 되돌린 것을 다시 적용할 revision. undo가 만든 revision이 여기 쌓인다.
   *
   * **새 편집을 내면 비워진다**(표준 undo 의미론 — 되돌아갈 미래가 없어진다).
   * 복원(D10)도 이것을 채우지 않는다: redo는 세션 안에서 undo를 눌러야 생긴다.
   */
  redoStack: RevisionRef[]
  editStatus: EditStatus
  /** 마지막 편집 실패. 새 편집을 내면 지워진다 — 남아 있으면 방금 낸 편집도 실패한 것으로 읽힌다. */
  editFailure: EditFailure | null
  /**
   * **서버가 마지막 편집 응답에 실어 보낸 문서 경고**(P5-3 D6, 설계 §7.1).
   *
   * **실패가 아니다.** severity가 `warning`인 이슈는 저장을 막지 않고 문서에 남는다 —
   * 끊긴 상호작용 타겟이 그렇다(P5-2 재라 #2가 실측으로 정했다). 그래서 `editFailure`와
   * 갈라 둔다: 한 필드에 접으면 *"저장됐다"*와 *"저장되지 않았다"*가 같은 값이 되고,
   * 그것이 이 저장소가 다섯 번 만난 부류다(P5-2 이월 §1).
   *
   * **성공한 ack마다 통째로 갈아 끼운다.** 서버가 보내는 것은 *"이 편집 뒤 문서에 남은
   * 경고 전부"*이므로 누적하면 이미 고친 경고가 화면에 남는다. **경고가 없어졌으면 빈
   * 배열이 오고 화면에서 사라진다** — 그것이 사용자가 고쳤다는 신호다.
   */
  editWarnings: ValidationIssue[]
  /**
   * **남의 변경을 받았는데 화면에 못 얹었다**(P3-1 D6). 얹은 경우엔 `null`이다.
   *
   * 이 슬라이스의 클라이언트는 **받기만 한다** — 편집은 여전히 REST로 나간다. 그래서
   * *"내 낙관적 편집이 pending인데 남의 ops가 오는"* 자리가 생기고, §7.1의 답
   * (*"자기 pending 위에 리베이스 적용"*)은 **P3-2다.** 그때까지 할 수 있는 정직한 일은
   * **미루고 그 사실을 말하는 것**이다 — `applyRemoteChange`의 머리말에 갈래 표가 있다.
   *
   * **`null`과 `{reason}`을 접지 마라.** 접으면 *"낡지 않았다"*와 *"낡았는데 왜인지 모른다"*가
   * 같은 값이 된다.
   */
  remoteStale: RemoteStale | null
}

/**
 * 초기 상태. 상수 하나를 공유하지 않고 매번 새로 만드는 것은, 스토어마다 자기
 * 객체를 갖게 해서 한쪽에서 새어 나간 수정이 다른 스토어에 옮지 않게 하기 위해서다.
 */
function initialState(): EditorState {
  return {
    openPageId: null,
    document: null,
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
    remoteStale: null,
  }
}

/**
 * 경고가 없을 때 쓰는 배열. **참조를 고정한다** — 매번 `[]`를 새로 만들면 경고 없는 편집이
 * 이어질 때마다 `#apply`가 변경으로 보고 구독자가 헛일을 한다(`clearPage`의 빈 큐와 같은 이유).
 */
const NO_WARNINGS: ValidationIssue[] = []

/**
 * `applyMarkerChange`의 결과. **`boolean`이 아닌 것이 요점이다** — 그 함수의 머리말에
 * 셋이 갈리는 근거가 있다.
 */
export type MarkerChangeResult = 'applied' | 'skipped' | 'diverged'

/**
 * 화면이 낡은 이유(P3-1 D6). **넷을 가른다 — 사용자가 할 일이 다르고, 무엇이 일어났는지도 다르다.**
 *
 * | `reason` | 무엇이 일어났나 | 사용자가 할 일 |
 * |---|---|---|
 * | `'pending'` | 보내지 않은 편집이 있어 남의 변경을 **미뤘다** | 편집이 저장되면 저절로 풀린다. 안 풀리면 새로고침 |
 * | `'gap'` | **프레임을 놓쳤다** — 온 `seq`가 내 다음 번호가 아니다 | 편집을 내면 저절로 풀린다(409 → 재조회). 안 내면 새로고침 |
 * | `'diverged'` | 얹으려다 `applyOps`가 던졌다 | 새로고침 |
 * | `'restored'` | 남이 **스냅샷을 복원했다** — 판이 통째로 갈렸다 | 새로고침 |
 *
 * **`'gap'`과 `'diverged'`를 접지 마라.** 둘 다 *"못 얹었다"*지만 원인이 정반대다 —
 * `'gap'`은 **못 받은 것이 있다**(연결이 끊겼다)이고 `'diverged'`는 **받은 것을 내 문서가
 * 못 받아들인다**(보내지 않은 구조 편집과 부딪쳤다)이다. 진단이 다르면 다음 사람이 보는
 * 것도 달라야 한다.
 */
export interface RemoteStale {
  reason: 'pending' | 'gap' | 'diverged' | 'restored'
}

/** `applyRemoteChange`의 결과. `MarkerChangeResult`에 `'deferred'`·`'gap'`이 더 있다. */
export type RemoteChangeResult = 'applied' | 'skipped' | 'deferred' | 'gap' | 'diverged'

/** `startUndo`·`startRedo`의 결과. 건너뛴 수는 §7.3의 안내에 쓴다. */
export interface UndoAttempt {
  /** 큐에 들어간 편집의 id. 적용할 수 있는 항목이 없었으면 `null`이다. */
  clientOpId: string | null
  /** 적용할 수 없어 버린 항목 수. */
  skipped: number
}

type Listener = () => void

export class EditorStore {
  #state: EditorState = initialState()

  readonly #listeners = new Set<Listener>()

  readonly #nextOpId: () => string

  /**
   * 전송 루프가 돌고 있는가. **관측 상태가 아니라 제어 플래그라 `#state` 밖에 있다.**
   *
   * **훅이 아니라 스토어가 드는 것이 요점이다.** 앞 판은 `use-edit-commit.tsx`의 `ref`가
   * 이것을 들었는데, `useEditCommit`을 부르는 자리가 여럿이면 각자 자기 `ref`를 갖는다 —
   * 실측: 그 트리에서 편집을 각각 내면 `maxInFlight`가 **2**가 되어 D6가 깨진다.
   * 스토어에 두면 인스턴스 수와 무관해진다.
   *
   * **지금 그 자리는 셋이다**(세어 고쳤다 — 앞 판은 "둘"이라고 적었는데 P2b-3이 구조 툴바를
   * 더하면서 늘었다): `routes/editor.tsx`의 undo/redo, `panels/structure-toolbar.tsx`,
   * `panels/property-panel.tsx`.
   */
  #pumping = false

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
   * **왜 큐까지 여기서 비우나.** 앞 판은 문서·`headSeq`·`openPageId`·선택 넷만 갈아 끼우고
   * `pending`을 남겼는데, 실패 복구의 재조회가 그 틈에서 편집을 고아로 만들었다. 실측한
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
    // 선택을 함께 지운다. 노드 id는 문서 안에서만 뜻이 있으므로, 다른 페이지의 id가
    // 남으면 선택 표시가 존재하지 않는 노드를 가리킨다.
    this.#apply({
      openPageId: pageId,
      document,
      headSeq,
      selectedNodeId: null,
      // **이미 비어 있으면 같은 배열을 그대로 넘긴다**(`clearPage`와 같은 이유) — 빈 배열을
      // 새로 만들면 참조가 달라져 `pending`을 구독하는 쪽이 페이지를 열 때마다 헛일을 한다.
      pending: pending.length === 0 ? pending : [],
      // **undo·redo 스택도 함께 비운다.** 문서가 서버 것으로 되돌아갔으므로 그 전 revision의
      // `inverse`를 되보내면 서버 상태와 어긋난다. 페이지를 여는 경로의 복원은 Task 11이
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
      // 남는다 — 이 저장소가 만난 *"고쳤는데 고쳤다고 말하지 않는"* 부류다.
      remoteStale: null,
    })
    return pending
  }

  /**
   * 서버가 준 내 revision으로 undo 스택을 채운다(D10).
   *
   * **인자는 `seq` 내림차순(최신이 앞)이다** — 서버 응답 순서 그대로 받는다. 이 스토어의
   * 스택은 **끝이 top**이므로 여기서 뒤집어 싣는다. (계획서는 "뒤집지 마라"고 적었는데,
   * 그것은 스택을 "앞이 top"으로 두는 표현을 전제한 말이다. 재는 것은 배열 모양이 아니라
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
   * **서버가 코멘트 경로에서 낸 문서 변화를 내 문서에 반영한다**(P5-1).
   *
   * 코멘트를 달거나 지우거나 재번호하면 서버가 노드의 `marker`를 바꾸고 revision을
   * 남긴다(계획서 D2). 그 변화를 여기서 받아야 캔버스에 번호가 뜨고, `headSeq`가 서버와
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
   * 남는다 — 이 저장소가 반복해 겪은 부류다(P4c-3 이월의 둘째 줄).
   *
   * 둘 다 안 움직이면 **다음 편집이 409를 받고 복구 경로가 페이지를 다시 받는다** —
   * 시끄럽지만 수렴한다. 조용히 갈라지는 쪽보다 낫다.
   *
   * ## 결과가 셋인 것이 계약이다 (리뷰 ④의 판정)
   *
   * 앞 판은 `boolean`을 냈고 **부르는 쪽이 그것을 버렸다.** `false`의 원인 셋이 사용자에게
   * 뜻하는 바가 서로 다른데 한 값으로 접혀 있었던 것이 문제다 — **`null`과 빈 값을 같은
   * 것으로 접는 그 부류다**(P4c-3 이월 2번).
   *
   * | 결과 | 언제 | 화면이 할 일 |
   * |---|---|---|
   * | `'applied'` | 반영했다 | 없다 |
   * | `'skipped'` | **다른 페이지가 열려 있거나 문서가 없다** | 없다 — 그 화면은 이미 딴 것을 보고 있다 |
   * | `'diverged'` | **`applyOps`가 던졌다** | **말해야 한다** — 서버에는 번호가 있는데 내 화면에는 없다 |
   *
   * `'diverged'`를 조용히 넘기면 *"코멘트는 달렸는데 캔버스에 번호가 없고 아무도 그것을
   * 말하지 않는"* 상태가 된다. 그것이 이 저장소가 네 번 만난 부류의 형태다.
   *
   * ## `markerOps`가 비면 `headSeq`도 안 건드린다
   *
   * 앞 판은 그때도 `headSeq`를 `seq`로 맞췄다. **틀렸다** — 그 `seq`는 서버가 요청을 받은
   * 시점의 `head_seq`이고 **내 문서가 그 revision 위에 서 있다는 뜻이 아니다.** 내가
   * 뒤처져 있으면 그 값을 받아 *"나는 최신이다"*라고 믿게 되고, 앞서 있으면(내 낙관적
   * 편집이 ack된 뒤라면) 값이 **내려간다.** 서버가 아무것도 안 바꿨으면 클라이언트도
   * 아무것도 안 바꾸는 것이 맞는다.
   */
  readonly applyMarkerChange = (
    pageId: string,
    change: { seq: number; markerOps: PatchOp[] },
  ): MarkerChangeResult => {
    const { openPageId, document } = this.#state
    // 다른 페이지로 옮긴 뒤 도착한 응답이다. 여기서 `headSeq`를 건드리면 새 페이지의
    // 편집이 남의 revision 번호 위에서 만들어진다(`ackEdit`의 늦은 ack 가드와 같은 자리).
    if (openPageId !== pageId || document === null) return 'skipped'

    // 문서가 안 바뀐 요청이다(이미 번호가 있는 노드에 코멘트를 더 달았거나, 마지막이 아닌
    // 코멘트를 지웠거나, 바꿀 것 없는 재번호). **아무것도 안 건드린다**(위 머리말).
    if (change.markerOps.length === 0) return 'applied'

    let next: PageDocument
    try {
      next = applyOps(document, change.markerOps)
    } catch {
      // 보내지 않은 구조 편집이 그 노드를 이미 지웠다. **`headSeq`도 안 올린다** —
      // 올리면 문서와 revision 번호가 조용히 갈라진다.
      return 'diverged'
    }

    this.#apply({ document: next, headSeq: change.seq })
    return 'applied'
  }

  /**
   * **남이 낸 문서 변경을 내 문서에 얹는다**(P3-1 D6 · §7.1의 *"[타인] ops 수신"*).
   *
   * `applyMarkerChange`와 **같은 모양이지만 갈래가 하나 더 있다.** 그쪽은 코멘트 응답을
   * 받는 자리이고 이쪽은 WebSocket 프레임을 받는 자리인데, 결정적으로 다른 것은
   * **내가 그 사이에 보내지 않은 편집을 들고 있을 수 있다**는 점이다.
   *
   * ## pending이 비어 있지 않으면 미룬다 — 그리고 말한다
   *
   * §7.1은 *"자기 pending 위에 리베이스 적용"*이라고 적었고 **그것은 P3-2다.** 지금 얹으면
   * 내 낙관적 편집이 만든 경로 위에 남의 ops가 얹혀 두 문서가 **조용히** 갈라진다. 그래서
   * 미룬다. 미루면 화면이 낡고, **낡았다는 것을 `remoteStale`이 말한다** — 조용히 덮는 쪽은
   * 이 저장소가 여섯 번 만난 부류다.
   *
   * **미룬 ops를 쌓아 두지 않는다.** 이 슬라이스의 전송은 REST이고 서버는 `baseSeq`가
   * `head_seq`와 **정확히 같을 때만** 받는다 — 남의 변경이 먼저 기록됐으면 내 pending은
   * 반드시 409를 받고, 그 복구 경로가 페이지를 다시 받아 `loadPage`로 놓는다. 즉 미룬 것은
   * **저절로 수렴한다.** 쌓아 두면 그 큐가 두 번째 진실이 되고, 수렴한 뒤 그것을 또 얹는다.
   *
   * ## `seq`가 내 다음 번호가 아니면 얹지 않는다 — 리뷰가 뚫은 자리
   *
   * 앞 판은 `change.seq > headSeq`이기만 하면 얹었다. **`seq === headSeq + 1`인지는 아무도
   * 안 봤고**, 그래서 프레임을 하나라도 놓치면 이렇게 됐다(리뷰가 실증했다):
   *
   * - 놓친 revision의 ops가 내 문서에 **영영 안 들어온다** — 뒤늦게 와도 `seq <= headSeq`라
   *   건너뛴다.
   * - 그런데 **`headSeq`는 서버와 같아진다.** 그러면 다음 편집이 `stale` 409조차 안 받고,
   *   **틀린 문서 위에서 만든 `ops`가 서버의 옳은 문서에 그대로 적용된다.**
   *   `add /root/children/-`는 조용히 성공하고, 인덱스를 쓰는 `remove`는 **남의 노드를 지운다.**
   * - `applyOps`가 던지는 모양이면 `'diverged'`로 잡히지만 **가장 흔한 추가에서는 안 던진다.**
   *   그래서 *가끔* 조용하다 — 이 저장소가 여러 번 만난 부류의 새 얼굴이다.
   *
   * **프레임 유실은 사고가 아니라 설계다.** 이 슬라이스가 재연결을 얹었고(브라우저가 그것을
   * 안 주므로 — 재라 #5), 끊긴 동안 남이 낸 편집의 프레임은 사라진다. 다시 붙어도 페이지를
   * 다시 읽지 않는다. **재연결마다 이 창이 열린다.**
   *
   * **판정: 얹지 않고 `headSeq`도 안 올린다.** 그러면 둘이 동시에 성립한다 —
   *
   * 1. **화면이 말한다**(`remoteStale.reason === 'gap'`).
   * 2. **저절로 수렴한다.** `headSeq`가 뒤처진 채 남으므로 다음 편집이 `stale` 409를 받고,
   *    `edit/use-edit-commit.tsx`의 복구 경로가 페이지를 다시 받아 `loadPage`로 놓는다.
   *    `'pending'` 갈래가 기대는 것과 **같은 수렴 장치**다.
   *
   * **여기서 스스로 다시 읽지 않는 것도 판정이다.** 페이지 상태를 서버 것으로 놓는 자리는
   * `loadPage` 하나이고 그 앞뒤 순서(undo 스택 복원이 뒤에 온다 — D10)를 아는 것은
   * `routes/editor.tsx`다. 스토어가 자기 조회를 갖게 하면 페이지를 여는 경로가 둘이 된다.
   * **자동 재조회는 P3-2의 것이다** — 리베이스가 어차피 *"내가 seq n까지 전부 받았다"*를
   * 전제하므로 그때 같은 자리를 손봐야 한다.
   *
   * ## 갈래 표
   *
   * | 결과 | 언제 | `remoteStale` |
   * |---|---|---|
   * | `'skipped'` | 다른 페이지가 열려 있거나 문서가 없거나 **이미 아는 seq**다 | 그대로 |
   * | `'deferred'` | 보내지 않은 편집이 있다 | `'pending'` |
   * | `'gap'` | **`seq`가 내 다음 번호가 아니다** | `'gap'` |
   * | `'diverged'` | `applyOps`가 던졌다 | `'diverged'` |
   * | `'applied'` | 얹었다. `headSeq`가 `seq`가 된다 | `null`로 푼다 |
   *
   * **`seq <= headSeq`가 `'skipped'`인 것이 요점이다.** 발신자 제외 헤더를 안 실은 클라이언트는
   * **자기 편집을 자기가 되받는다**(`ws/notify.ts`). 그때 그 ops를 한 번 더 얹으면 문서가
   * 두 번 바뀐다.
   *
   * **갭 검사가 pending 검사보다 뒤에 있다.** pending이 차 있으면 어차피 안 얹으므로 갭인지
   * 아닌지는 그 판에서 뜻이 없고, `'pending'`이 *"내가 낸 편집이 끝나면 풀린다"*는 더 좁고
   * 더 정확한 진단이다.
   *
   * **`headSeq`와 문서는 함께 움직이거나 둘 다 안 움직인다** — `applyMarkerChange`의 그 문단이
   * 여기에도 그대로 적용된다.
   */
  readonly applyRemoteChange = (
    pageId: string,
    change: { seq: number; ops: PatchOp[]; warnings: ValidationIssue[] },
  ): RemoteChangeResult => {
    const { openPageId, document, headSeq, pending } = this.#state
    if (openPageId !== pageId || document === null) return 'skipped'
    // 이미 아는 revision이다(내 편집이 되돌아온 경우를 포함한다).
    if (change.seq <= headSeq) return 'skipped'

    if (pending.length > 0) {
      this.#markStale('pending')
      return 'deferred'
    }

    // 놓친 revision이 있다. **얹지도 `headSeq`를 올리지도 않는다**(위 머리말).
    if (change.seq !== headSeq + 1) {
      this.#markStale('gap')
      return 'gap'
    }

    let next: PageDocument
    try {
      next = applyOps(document, change.ops)
    } catch {
      this.#markStale('diverged')
      return 'diverged'
    }

    // **경고도 갈아 끼운다.** 서버가 보내는 것은 *"이 편집 뒤 문서에 남은 경고 전부"*이고
    // (`editWarnings`의 계약), 얹었다는 것은 내 문서가 그 문서가 됐다는 뜻이다. 안 갈면
    // 남이 만든 경고를 **편집을 낸 사람만** 보게 되어, 사실 2가 막으려던 그 갈라짐이
    // 접속 방식 대신 *"누가 냈느냐"*로 되살아난다.
    this.#apply({
      document: next,
      headSeq: change.seq,
      remoteStale: null,
      editWarnings: change.warnings.length === 0 ? NO_WARNINGS : change.warnings,
    })
    return 'applied'
  }

  /**
   * **판이 통째로 갈렸다고 표시한다.** 남이 스냅샷을 복원하면 페이지가 사라지거나 생기고
   * 문서가 통째로 바뀌므로 `ops`로 표현되지 않는다 — 얹을 것이 없고, 할 수 있는 정직한
   * 일은 그 사실을 말하는 것뿐이다(P6-2 이월 §9가 지목한 자리).
   */
  readonly markRestored = (): void => {
    this.#markStale('restored')
  }

  /**
   * 낡음을 표시한다. **이미 같은 이유로 낡아 있으면 아무것도 안 한다** — 같은 값을 다시
   * 넣으면 참조가 달라져 구독자가 프레임마다 헛일을 한다(`NO_WARNINGS`와 같은 이유).
   */
  #markStale(reason: RemoteStale['reason']): void {
    if (this.#state.remoteStale?.reason === reason) return
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
    this.#apply({
      openPageId: null,
      document: null,
      headSeq: 0,
      selectedNodeId: null,
      // **편집 상태도 함께 비운다.** 빠뜨리면 페이지를 옮긴 뒤 앞 페이지의 pending이 새
      // 페이지 경로로 전송되고, 앞 페이지의 revision이 새 페이지의 undo 스택에 남는다.
      //
      // **이미 비어 있으면 같은 배열을 그대로 넘긴다.** 빈 배열을 새로 만들어 넣으면
      // 참조가 달라져 `#apply`가 변경으로 보고, 문서가 없는 상태에서 부르는 `clearPage`가
      // 매번 알리게 된다 — 화면이 페이지를 열 때마다 조회 시작 시점에 이것을 부르므로
      // (`routes/editor.tsx`의 `CanvasFrame`) 구독자가 페이지마다 헛일을 한다.
      // (`clearPage는 이미 비어 있으면 알리지 않는다`가 이 줄을 지킨다 — 실제로 잡혔다.)
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
   * 적용할 수 없으면 `null`이다 — `null`은 **요청을 보내지 마라**는 신호다(D7).
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
   * **적용 불가는 에러가 아니라 정상 흐름이다**(설계 §7.3) — 그 항목을 버리고 다음으로
   * 넘어간다. 그 경로가 없으면 다른 사람이 지운 노드를 되돌릴 때 스택 맨 위에 갇힌다.
   * 전부 적용 불가면 스택을 비우고 `clientOpId: null`을 낸다 — 남겨 두면 다음 undo가 같은
   * 항목을 또 시도한다.
   */
  readonly startUndo = (): UndoAttempt => this.#startFrom('undo')

  /** redo 한 단계. `startUndo`와 같은 규칙을 redo 스택에 쓴다. */
  readonly startRedo = (): UndoAttempt => this.#startFrom('redo')

  #startFrom(kind: 'undo' | 'redo'): UndoAttempt {
    const { document } = this.#state
    if (document === null) return { clientOpId: null, skipped: 0 }

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

      const clientOpId = this.#enqueue(
        next,
        // **서버가 준 `inverse`를 그대로 보낸다**(설계 §7.1). 클라이언트가 `invertOps`로
        // 계산하지 않는다 — 클라이언트 상태가 낙관적으로 앞서 있을 수 있기 때문이다.
        ref.inverse,
        kind,
        kind === 'undo' ? { undoStack: rest } : { redoStack: rest },
      )
      return { clientOpId, skipped }
    }

    if (skipped > 0) {
      this.#apply(kind === 'undo' ? { undoStack: [] } : { redoStack: [] })
    }
    return { clientOpId: null, skipped }
  }

  /**
   * 전송 루프를 시작해도 되는지. **`true`면 시작한 것이고 반드시 `endPump()`로 닫아야 한다.**
   * 이미 돌고 있으면 `false`다(D6 — in-flight는 항상 하나).
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
   * 읽어야 README 4단계(*"응답의 `seq`가 다음 요청의 `baseSeq`다"*)가 지켜진다.
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

    // 서버가 준 `inverse`를 **그대로** 싣는다(설계 §7.1).
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
   * 편집이 실패했다. 큐를 비우고 **버린 것을 돌려준다**(통지에 쓴다 — D8).
   *
   * **문서는 되돌리지 않는다.** 롤백 경로는 재조회 하나뿐이다(D4) — 로컬 `inverse`로
   * 되돌리면 클라이언트가 낙관적으로 앞서 있는 만큼 서버와 어긋난다(설계 §7.1이 `inverse`를
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

  readonly selectNode = (nodeId: string | null): void => {
    this.#apply({ selectedNodeId: nodeId })
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
