/**
 * **끌기 진단 줄(`[wb-drag]`)** — 켜면 끌기 장치(`./use-pointer-drag.ts`) · 경로 층(`./use-placement.ts`) · 컴포넌트 목록 카드
 * (`palette/component-palette.tsx`)가 단계마다 콘솔에 한 줄을 낸다. 사람의 브라우저에서 «카드를 끌어도 안 선다» 가 다시 나면 그 줄로
 * 어느 단계에서 멈췄는지 가른다. 켜는 법 · 줄 모양 · 끄는 법 · 걷는 법은 `docs/guides/drag-debug.md` 가 정본이다.
 *
 * ## 켜는 법 — 주소 또는 `localStorage`, 앱이 뜰 때 한 번 읽는다
 *
 * 주소에 `?debugDrag=1` 이 있거나 `localStorage` 의 `wb-debug-drag` 가 `'1'` 이면 켠다. **이 모듈을 처음 적재할 때 한 번 읽는다** — 에디터
 * 라우트로 옮겨 가며 주소의 질의가 빠져도 그 탭은 켜진 채다. 끄려면 질의 없이 다시 열거나(`localStorage` 로 켰으면 키를 지우고) 새로고침한다.
 * `localStorage` 는 막힌 판(사생활 창 · 막은 사이트 데이터)에 던질 수 있어 try/catch 로 읽는다.
 *
 * ## 꺼진 판은 아무것도 안 짓는다
 *
 * 부르는 쪽은 늘 `dragDebug()?.line(…)` 꼴로 부른다 — 꺼지면 `dragDebug()` 가 `null` 이라 **`?.` 가 인자의 계산까지 건너뛴다**(문자열 ·
 * 객체 · 상자 재기가 안 돈다). 진단 전용 리스너(포인터 캡처 · 창 잃음 · 전역 누름)도 켠 판에만 건다. 꺼진 판이 더 하는 일은 모듈 변수
 * 하나를 읽는 것뿐이다(`test/drag/drag-debug.test.tsx` «꺼진 판»).
 *
 * ## 줄은 `console.info` 한 줄의 글이다
 *
 * **`console.debug` 가 아니다** — Chrome 은 `debug` 를 «Verbose» 수준으로 내 기본 콘솔(Default levels)에서 숨긴다. `info` 는 기본으로 보인다.
 * **객체가 아니라 글 한 줄로 낸다** — 콘솔의 객체는 접힌 채(`{…}`) 복사돼 사람이 붙여 준 글에 값이 안 남는다.
 *
 * 줄 모양 · 단계 표 · 까닭(`DropMiss`) 표는 정본 문서의 «줄 모양» · «단계» · «까닭(`why=`)» 절이 갖는다. `#n` 은 창의 모든 `pointerdown` 이 올리는
 * 번호(`begin`)라 카드 밖을 누른 것도 센다 — 누름이 카드에 닿았는지를 `down` 과 `press` 의 짝으로 가른다.
 */

/** 주소의 질의 이름 — `?debugDrag=1`. */
export const DRAG_DEBUG_QUERY = 'debugDrag'
/** `localStorage` 키 — 값이 `'1'` 이면 켠다. */
export const DRAG_DEBUG_STORAGE_KEY = 'wb-debug-drag'

/** 놓을 자리가 없는(`null`) 까닭 — 정본 문서 «까닭(`why=`)» 표. 경로 층 · `canvasHitAt` · `structureDropTarget` 이 낸다. */
export type DropMiss =
  // 경로 층(`./use-placement.ts`)
  | 'no-document'
  | 'stage-changed'
  | 'collapsed'
  | 'tree-miss'
  | 'no-canvas'
  | 'preview-gone'
  // `canvas/canvas-drop.ts` 의 `canvasHitAt`
  | 'no-frame-element'
  | 'outside-canvas'
  | 'beside-or-above-document'
  | 'over-layout-frame'
  | 'over-copy'
  // `edit/structure-drop.ts` 의 판정
  | 'no-root'
  | 'target-not-in-document'
  | 'not-container'
  | 'root-has-no-siblings'
  | 'parent-not-container'
  | 'not-accepted'
  | 'unknown-type'
  | 'ops-unbuildable'
  | 'locked'
  | 'self'
  | 'into-own-subtree'
  | 'same-place'

/** 진단 줄을 내는 것 — 켠 판에만 있다(`dragDebug()`). */
export interface DragDebug {
  /** 한 줄. `fields` 는 `키=값` 으로 이어 붙인다 — 값의 빈칸은 그대로 둔다(글 한 줄이면 된다). */
  line: (step: string, fields?: Record<string, string | number | boolean | null | undefined>) => void
  /** 새 누름 — 번호를 올리고 시간을 0 으로 잡는다. 전역 `pointerdown` 이 부른다. */
  begin: () => void
  /** 놓을 자리의 답 — 앞 줄과 같은 답이면 안 낸다(매 프레임이 아니라 바뀔 때만). */
  over: (signature: string, fields: Record<string, string | number | boolean | null | undefined>) => void
  /** 한 누름에 한 번만 내는 줄 — 개발 판의 `StrictMode` 가 ref 를 두 번 불러도 한 줄이다(이름표). */
  once: (step: string, fields?: Record<string, string | number | boolean | null | undefined>) => void
}

/** 켠 판의 로거. 꺼지면 `null`. */
let current: DragDebug | null = null
/** 전역 누름 리스너를 걷는 것 — 다시 읽을 때 앞 것을 걷는다. */
let detachGlobal: (() => void) | null = null

/** 켰으면 로거, 꺼졌으면 `null` — 부르는 쪽은 `dragDebug()?.line(…)` 로 부른다(머리말 «꺼진 판은 아무것도 안 짓는다»). */
export function dragDebug(): DragDebug | null {
  return current
}

/** 요소를 짧게 — `태그.첫클래스[카드 타입 · 트리 id]`. */
export function describeElement(target: unknown): string {
  if (typeof target !== 'object' || target === null || (target as Node).nodeType !== 1) return String(target)
  const element = target as Element
  const tag = element.tagName.toLowerCase()
  const className = typeof element.className === 'string' ? element.className.trim().split(/\s+/)[0] : ''
  const mark =
    element.getAttribute('data-wb-palette-card') ??
    element.getAttribute('data-tree-id') ??
    element.getAttribute('data-wb-id') ??
    element.getAttribute('aria-label')
  return `${tag}${className === '' || className === undefined ? '' : `.${className}`}${mark === null ? '' : `[${mark}]`}`
}

/** 좌표를 소수 한 자리까지 — 줄을 짧게. */
export function round(value: number): number {
  return Math.round(value * 10) / 10
}

function format(fields: Record<string, string | number | boolean | null | undefined> | undefined): string {
  if (fields === undefined) return ''
  let out = ''
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue
    out += ` ${key}=${value === null ? 'null' : String(value)}`
  }
  return out
}

function createLogger(): DragDebug {
  let seq = 0
  let since = 0
  let lastOver: string | null = null
  const said = new Set<string>()
  const now = (): number => (typeof performance === 'undefined' ? Date.now() : performance.now())
  const line: DragDebug['line'] = (step, fields) => {
    // eslint-disable-next-line no-console -- 이 모듈이 내는 것이 콘솔 줄이다(머리말).
    console.info(`[wb-drag] #${seq} +${Math.round(now() - since)}ms ${step}${format(fields)}`)
  }
  return {
    line,
    begin: () => {
      seq += 1
      since = now()
      lastOver = null
      said.clear()
    },
    over: (signature, fields) => {
      if (signature === lastOver) return
      lastOver = signature
      line('over', fields)
    },
    once: (step, fields) => {
      if (said.has(step)) return
      said.add(step)
      line(step, fields)
    },
  }
}

/** 주소 · `localStorage` 를 읽어 켤지 정한다. 막힌 저장소는 꺼진 것으로 읽는다. */
function switchedOn(): 'query' | 'storage' | null {
  try {
    if (new URLSearchParams(window.location.search).get(DRAG_DEBUG_QUERY) === '1') return 'query'
  } catch {
    // 주소를 못 읽는 판(숙주 없음)은 꺼진 것이다.
  }
  try {
    if (window.localStorage.getItem(DRAG_DEBUG_STORAGE_KEY) === '1') return 'storage'
  } catch {
    // 막힌 저장소(사생활 창 · 막은 사이트 데이터) — 꺼진 것이다.
  }
  return null
}

/**
 * **주소 · `localStorage` 를 다시 읽는다** — 모듈이 적재될 때 한 번 부르고, 테스트가 판을 바꾼 뒤 부른다. 켜지면 «켜짐» 한 줄(브라우저 ·
 * 배율 · 창 크기 — 확대 판을 가르는 값)을 내고 창의 모든 누름을 `down` 줄로 센다(붙잡는 단계 — 카드에 누름이 닿기 전의 대상을 적는다).
 */
export function readDragDebugSwitch(): DragDebug | null {
  detachGlobal?.()
  detachGlobal = null
  current = null
  if (typeof window === 'undefined') return null
  const source = switchedOn()
  if (source === null) return null
  const logger = createLogger()
  current = logger
  logger.line('on', {
    source,
    dpr: window.devicePixelRatio,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    ua: typeof navigator === 'undefined' ? undefined : navigator.userAgent,
  })
  const down = (raw: Event): void => {
    const event = raw as PointerEvent
    logger.begin()
    logger.line('down', {
      pointer: event.pointerType,
      id: event.pointerId,
      button: event.button,
      x: round(event.clientX),
      y: round(event.clientY),
      target: describeElement(event.target),
    })
  }
  window.addEventListener('pointerdown', down, true)
  detachGlobal = () => window.removeEventListener('pointerdown', down, true)
  return logger
}

readDragDebugSwitch()
