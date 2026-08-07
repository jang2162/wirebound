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
import { applyOps, type PageDocument, type PatchOp } from '@wirebound/schema'
import { ackPending, clearPending, type PendingEdit } from './edit-queue'

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
  /** 되돌릴 수 있는 revision. 최근 것이 끝이다. */
  undoStack: RevisionRef[]
  editStatus: EditStatus
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
    editStatus: 'idle',
  }
}

type Listener = () => void

export class EditorStore {
  #state: EditorState = initialState()

  readonly #listeners = new Set<Listener>()

  readonly #nextOpId: () => string

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
   * 서버에서 받은 페이지를 싣는다. `headSeq`는 P2b-2가 baseSeq로 쓴다.
   *
   * **`pageId`를 함께 받는 것이 계약이다.** 셋이 한 번의 `#apply`로 들어가므로 "어느
   * 페이지의 문서이고 어느 revision인가"가 스토어 안에서 어긋날 수 없다 — 읽는 쪽은
   * `openPageId`를 주소와 대조하기만 하면 된다(`use-editor-store.tsx`의 `useOpenDocument`).
   */
  readonly loadPage = (pageId: string, document: PageDocument, headSeq: number): void => {
    // 선택을 함께 지운다. 노드 id는 문서 안에서만 뜻이 있으므로, 다른 페이지의 id가
    // 남으면 선택 표시가 존재하지 않는 노드를 가리킨다.
    this.#apply({ openPageId: pageId, document, headSeq, selectedNodeId: null })
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
    const { pending, undoStack } = this.#state
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
      editStatus: 'idle',
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
  readonly applyEdit = (ops: PatchOp[]): string | null => {
    const { document, headSeq, pending } = this.#state
    if (document === null) return null

    let next: PageDocument
    try {
      next = applyOps(document, ops)
    } catch {
      // **id를 소비하지 않는다** — 생성기를 주입한 의미(결정적인 id)가 실패한 편집 때문에
      // 어긋나지 않도록 발급을 적용 뒤로 미룬다.
      return null
    }

    const clientOpId = this.#nextOpId()
    // `pending`을 **새 배열로** 만드는 것이 계약이다 — `#apply`가 참조 비교를 하므로
    // 제자리에서 `push`하면 알림이 안 간다.
    this.#apply({ document: next, pending: [...pending, { clientOpId, ops, baseSeq: headSeq }] })
    return clientOpId
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
    result: { seq: number; revisionId: string; inverse: PatchOp[] },
  ): void => {
    const { pending, undoStack } = this.#state
    const nextPendingQueue = ackPending(pending, clientOpId)
    // 같은 참조면 맞는 ack가 아니었다는 뜻이다. 그때 `headSeq`나 스택을 건드리면
    // 모르는 응답이 상태를 바꾸게 된다.
    if (nextPendingQueue === pending) return

    this.#apply({
      pending: nextPendingQueue,
      headSeq: result.seq,
      // 서버가 준 `inverse`를 **그대로** 싣는다(설계 §7.1).
      undoStack: [...undoStack, { revisionId: result.revisionId, inverse: result.inverse }],
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
