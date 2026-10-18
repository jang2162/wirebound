/** 상호작용 트리거. 설계서 「모델」(상호작용) */
export type InteractionTrigger = 'click' | 'change' | 'select' | 'submit'

/** 상호작용 액션. 고정 5종이며 스크립트는 허용하지 않는다. */
export type InteractionAction =
  | { type: 'setProp'; target: string; prop: string; value: unknown }
  | { type: 'setVisible'; target: string; value: boolean }
  | { type: 'switchTab'; target: string; tab: number }
  | { type: 'navigate'; target: string }
  | { type: 'openModal'; target: string }

export interface Interaction {
  on: InteractionTrigger
  actions: InteractionAction[]
}

/**
 * 페이지·레이아웃 스키마의 노드.
 * id는 생성 후 바뀌지 않으며 코멘트·상호작용·잠금·패치 경로의 공통 앵커다.
 */
export interface WbNode {
  id: string
  type: string
  /**
   * 사람이 붙인 이름. 노드를 가리키는 자리마다 타입 이름 대신(또는 곁에) 선다(`display.ts`). 모양 — 앞뒤 공백이 없는
   * 1 ~ `NODE_ALIAS_MAX` 자 한 줄 — 은 봉투(`envelope.ts`의 `WbNodeSchema`)가 본다. 문서 안에서 유일할 필요는 없다.
   */
  alias?: string
  props?: Record<string, unknown>
  variant?: string
  /**
   * 부모 안에서의 몫 — 정수 `WEIGHT_MIN` ~ `WEIGHT_MAX`. 부모가 `Flex` 면 남는 폭을 몫대로 나누고(`flex-grow`), `Grid` · 열을 정한
   * `SearchForm` 이면 차지할 칸 수다(부모 열 수로 자른다). 그 밖의 부모에서는 아무 일도 없고 값만 남는다. 없으면 테마 · 기본 배치 그대로다.
   * 카탈로그 prop 이 아니라 노드 필드인 까닭은 정본 설계서 「페이지 스키마 노드」.
   */
  weight?: number
  /**
   * 화면 상태에 따른 보임(정본 설계서 「페이지 스키마 노드」의 화면 상태). 없으면 모든 상태에서 보인다. 판정은 `visibility.ts`의
   * `isVisibleIn` 하나다 — 렌더러 · 에디터 · exporter · MCP 가 같이 쓴다. 모양은 봉투(`envelope.ts`의 `VisibilitySchema`)가 본다.
   */
  visibility?: NodeVisibility
  marker?: number
  interactions?: Interaction[]
  children?: WbNode[]
}

/**
 * 노드의 상태 보임. `only` — 나열한 상태(와 그 자손 상태)에서만 보인다. `except` — 나열한 상태(와 그 자손 상태)에서 숨는다.
 * `states` 는 1개 이상 · 겹침 없음 · 페이지 `viewStates` 의 id 또는 `DEFAULT_VIEW_STATE`(«기본» 화면 — 자손이 없다).
 */
export interface NodeVisibility {
  mode: 'only' | 'except'
  states: string[]
}

/** 별칭 글자 수의 상한(코드 포인트로 센다). */
export const NODE_ALIAS_MAX = 60

/** 노드 몫(`WbNode.weight`)의 범위. 12 는 격자 열 수의 상한(`Grid.columns`)과 같다. */
export const WEIGHT_MIN = 1
export const WEIGHT_MAX = 12

declare const documentKind: unique symbol

/**
 * 페이지 문서. 렌더링 시 레이아웃의 Slot 자리에 주입된다.
 *
 * `documentKind`는 컴파일 타임 전용 팬텀 프로퍼티다. 런타임 값이 없고
 * JSON 직렬화에도 나타나지 않는다. LayoutDocument와 뒤바뀌는 것을
 * 컴파일러가 잡게 하려고 존재한다.
 */
export interface PageDocument {
  version: number
  root: WbNode
  /**
   * 화면 상태 목록(설계서 「페이지 스키마 노드」의 화면 상태). 없거나 비면 상태가 없는 페이지다 — «기본»은 목록에 없고 늘 있다.
   * 루트 노드가 아니라 문서에 두는 까닭: 카탈로그의 `states`(컴포넌트의 불리언 상태)와 이름이 겹치지 않고, 목록 편집
   * (`/viewStates/…`)이 루트 노드 잠금 — 페이지 안의 어떤 잠금과도 조상 관계다 — 에 막히지 않는다(`lock.ts`의 겹침은 `/root`
   * 아래 경로끼리만 선다). 모양은 봉투(`envelope.ts`의 `ViewStatesSchema`)가 본다.
   */
  viewStates?: ViewState[]
  readonly [documentKind]?: 'page'
}

/**
 * 화면 상태 하나. `id`는 노드 id 와 같은 규칙으로 화면이 짓고 이름을 바꿔도 그대로다 — 노드 보임(`NodeVisibility.states`)이 가리키는
 * 값이다. `parent`는 목록의 다른 상태 id 다(고리 없음 · 깊이 `VIEW_STATE_DEPTH_MAX` 이하). 자식 상태는 부모의 경우를 좁힌 것이라 부모에서
 * 보이는 것을 물려받는다(«로그인 > 관리자»). 형제 차례는 목록 차례다.
 */
export interface ViewState {
  id: string
  name: string
  parent?: string
}

/** 상태 트리의 깊이 상한 — 뿌리 상태가 1 이다(«로그인 > 관리자 > 최고 관리자»까지). */
export const VIEW_STATE_DEPTH_MAX = 3

/** «기본» 화면(상태를 고르지 않은 화면)의 표지. 노드 보임에 넣을 수 있고 상태 id 로 쓸 수 없다(봉투가 거절한다). */
export const DEFAULT_VIEW_STATE = 'default'

/** 상태 이름 글자 수의 상한(코드 포인트로 센다). */
export const VIEW_STATE_NAME_MAX = 30

/** 한 페이지의 상태 수 상한. */
export const VIEW_STATES_MAX = 20

/** 기본 가지의 `StateCase.props.state`. 상태 id 로 쓸 수 없다(봉투가 거절한다). */
export const DEFAULT_CASE = 'default'

/**
 * 테마가 그리지 않는 카탈로그 타입 — 렌더러가 직접 다루는 투명 노드다(`StateSwitch`는 가지 하나를, `StateCase`는 자식만 그린다).
 * 테마 manifest 는 이 타입을 선언할 수 없고(`unknown-component` 와 같은 결 — `packages/themes`의 `checkComponents`) 테마 갤러리 ·
 * SDK 기본 뷰 · 컴포넌트 팔레트에 서지 않는다. 카탈로그 전부를 도는 인구조사는 이 목록으로 그 둘을 가른다.
 */
export const THEMELESS_TYPES: readonly string[] = ['StateSwitch', 'StateCase']

/** 레이아웃 문서. Slot 노드를 정확히 하나 품는다 (설계서 「레이아웃」). */
export interface LayoutDocument {
  version: number
  root: WbNode
  readonly [documentKind]?: 'layout'
}

/** 페이지와 레이아웃 양쪽을 받는 함수의 파라미터 타입. */
export type AnyDocument = PageDocument | LayoutDocument

const HEX = '0123456789abcdef'

/** `n_` + 소문자 hex 12자 형식의 노드 id를 만든다. */
export function createNodeId(): string {
  const bytes = new Uint8Array(6)
  globalThis.crypto.getRandomValues(bytes)
  let out = 'n_'
  for (const byte of bytes) {
    out += HEX[byte >> 4]! + HEX[byte & 0x0f]!
  }
  return out
}
