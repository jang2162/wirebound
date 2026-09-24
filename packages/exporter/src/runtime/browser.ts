/**
 * **설계서 「HTML 정적 번들」의 `assets/runtime.js`가 될 함수 하나.**
 *
 * ---
 *
 * ## 이 파일이 브라우저로 나가는 방법 — `toString()`이다
 *
 * `runtime/plan.ts`가 `installRuntime.toString()`을 IIFE로 감싸 문자열로 낸다. 다른
 * 후보 둘(*"별도 엔트리를 빌드해 문자열로 읽는다"* · *"문자열 상수로 손으로 쓴다"*)의
 * 대가를 둘 다 피한다:
 *
 * - **타입 검사가 된다** — 이 파일은 TypeScript이고 `tsconfig.runtime.json`이 검사한다.
 * - **빌드 산출물을 파일로 읽지 않는다.** 단 받는 쪽이 받는 글자는 tsdown이 옮긴 것이라
 *   vitest가 옮긴 것과 같지 않다 — `build-test/dist-runtime.test.ts`가 나가는 글자를 따로
 *   잰다. tsdown은 함수 본문 안의 JSDoc 블록 주석까지 그 글자에 싣는다.
 * - **`fs`를 부르지 않는다** — `exportBundle`의 「파일 시스템을 모른다」가 그대로 산다.
 *
 * **대가는 하나다: 이 함수는 바깥 스코프를 하나도 참조할 수 없다.** `toString()`은 본문만
 * 내고 클로저는 따라가지 않는다. 그래서 여기에는 **import가 없고**(타입 import는 컴파일에서
 * 지워지므로 있어도 된다) 모듈 상수도 없다. 셸의 클래스 이름 같은 값이 `bundle/shell.tsx`와
 * **두 벌**인 것이 그 대가이고, 그것을 지키는 것은 아래 규율이 아니라 **케이스다** —
 * `test/runtime-bundle.test.ts`가 실제 번들을 jsdom에 올려 눌러 본다. 이름이 갈리면 그
 * 케이스가 죽는다.
 *
 * ## 왜 고전 스크립트인가
 *
 * `file://`에서 `<script type="module" src=…>`는 **CORS로 막힌다**
 * (origin이 `null`이라 `chrome`·`data`·`http`·`https` 밖의 스킴은 허용되지 않는다).
 * 인라인 모듈은 도는데 외부 모듈은 안 돈다 — 자산으로 뺀 파일이라 이쪽이 우리 자리다.
 *
 * **시트를 읽지 않는다.** `file://`에서는 `styleSheets[i].cssRules`가 두 시트 모두
 * `SecurityError`를 던진다 — 시트가 붙고 적용되는데도 그렇다. 이 파일에 `cssRules`가 없다.
 *
 * ## 판정하지 않는다
 *
 * **여기에는 `runInteraction`도 카탈로그도 zod도 없다.** 무엇이 일어나는지는 **내보낼 때
 * 이미 다 계산되어** 데이터로 실려 온다(`RuntimePlan`). 이 함수가 하는 것은 셋뿐이다:
 * *"눌린 자리를 찾아 계획을 꺼내고"* · *"겹layer를 DOM에 바른다"* · *"못 한 것을 말한다"*.
 *
 * 근거는 `runtime/plan.ts`의 머리말에 있다.
 */

/** 겹layer가 노드 하나에 얹는 것. `nodeId → { prop: value }`의 안쪽이다. */
export type RuntimeRecord = Record<string, unknown>

/** 액션 하나가 겹layer에 쓴 값. **`prop`이 `visible`이면 `setVisible`이다.** */
export interface RuntimeWrite {
  target: string
  prop: string
  value: unknown
}

/**
 * 렌더러 밖에서 처리할 요청(설계서 「상호작용」 「모델」의 `navigate`·`openModal`).
 *
 * **링크는 `href`가 든다** — 번들에 그 페이지가 있으면 상대 링크이고, 아니면
 * `null`이다. `null`을 조용히 넘기지 않는다.
 */
export interface RuntimeRequest {
  type: string
  target: string
  href: string | null
  /**
   * 링크를 못 만든 이유. **`href`가 `null`이면 반드시 있고, 아니면 `null`이다.**
   *
   * **문장을 내보내기가 짓는다.** 못 가는 이유가 하나가 아니기 때문이다 — 그 타겟을
   * 가진 페이지가 **없는** 것과 **둘 이상인** 것은 읽는 사람이 할 일이 다르다. 런타임이
   * 문장을 지으면 그 갈래를 런타임이 알아야 하고, 그러면 판정이 두 벌이 된다.
   */
  problem: string | null
}

/** 실행하지 못한 액션 하나. **문장은 `schema`의 검증기가 만든 것 그대로다.** */
export interface RuntimeIssue {
  index: number
  actionIndex: number
  message: string
}

/**
 * **DOM 이벤트 하나가 노드 하나에서 났을 때 일어나는 전부.** 내보낼 때 `runInteraction`이
 * 계산했다.
 */
export interface RuntimeEvent {
  nodeId: string
  /** `click` · `change` · `submit`. 트리거 4종은 이미 여기로 접혔다. */
  dom: string
  writes: RuntimeWrite[]
  requests: RuntimeRequest[]
  issues: RuntimeIssue[]
  /** 반응한 **규칙**의 자리(`interactions` 배열의 인덱스). 문장화와 견주는 열쇠다. */
  rules: number[]
}

/** 한 페이지가 받는 전부. */
export interface RuntimePlan {
  events: RuntimeEvent[]
  /**
   * `nodeId` → 상태 열쇠 → 그 상태의 HTML. 열쇠는 `stateKey`가 만든다.
   *
   * **이것이 있어야 상호작용이 *동작*한다.** 정적 번들에는 React가 없으므로 겹layer를
   * 다시 그릴 방법이 없고, 그래서 내보낼 때 **같은 렌더러로** 미리 그려 둔다.
   */
  variants: Record<string, Record<string, string>>
  /**
   * 계획을 실을 수 없었던 이유. `null`이면 정상이다.
   *
   * **조용히 비우지 않는다** — 상호작용이 있는데 아무 일도 안 일어나면 읽는 사람은 그것이
   * 문서 탓인지 도구 탓인지 가를 수 없다. 값이 있으면 런타임이 그것을 띄운 채로 시작한다.
   */
  disabled: string | null
}

/**
 * 번들의 페이지에서 런타임을 세운다. **이 함수 하나가 `assets/runtime.js`의 전부다.**
 *
 * 바깥 스코프를 참조하지 않는다(위 머리말). 안에서 쓰는 이름은 전부 이 본문 안에 있다.
 */
export function installRuntime(): void {
  const canvas = document.querySelector('.wb-export-canvas')
  const status = document.querySelector('.wb-export-status')
  const dataNode = document.getElementById('wb-export-runtime-data')
  if (canvas === null || status === null) return

  /** 상태 줄. **빈 목록이면 줄 자체를 감춘다** — 빈 상자가 남으면 목업이 밀린다. */
  const say = (lines: readonly string[]): void => {
    status.textContent = ''
    for (const line of lines) {
      const item = document.createElement('p')
      item.className = 'wb-export-status-line'
      item.textContent = line
      status.appendChild(item)
    }
    if (lines.length === 0) status.setAttribute('hidden', '')
    else status.removeAttribute('hidden')
  }

  if (dataNode === null) {
    say(['상호작용 데이터를 찾지 못했습니다'])
    return
  }

  let plan: RuntimePlan
  try {
    plan = JSON.parse(dataNode.textContent ?? '') as RuntimePlan
  } catch {
    say(['상호작용 데이터를 읽지 못했습니다'])
    return
  }

  if (plan.disabled !== null) {
    say([plan.disabled])
    return
  }

  /**
   * 상태 열쇠. **`runtime/plan.ts`의 같은 이름 함수와 글자까지 같아야 한다** — 갈리면
   * 미리 그려 둔 판을 못 찾는다. 두 벌인 것은 이 파일이 import를 가질 수 없기 때문이고
   * (머리말), 갈렸을 때 죽는 자리는 `test/runtime-bundle.test.ts`의 실제 클릭이다.
   *
   * `visible`은 열쇠에 안 넣는다 — 그것은 그리는 값이 아니라 **DOM에서 뺄지**를 정하는
   * 값이라 판이 따로 없다.
   */
  const stateKey = (record: RuntimeRecord): string => {
    const keys = Object.keys(record).filter((key) => key !== 'visible')
    keys.sort()
    return keys.length === 0 ? '' : JSON.stringify(keys.map((key) => [key, record[key]]))
  }

  /** 겹layer. 문서를 안 바꾸고 그 위에 얹는다. */
  const overlay: Record<string, RuntimeRecord> = {}

  /** 아무도 누르기 전의 캔버스. **매 적용을 여기서 다시 시작한다** — 되돌릴 것이 없다. */
  const pristine = canvas.innerHTML

  /** id → 그 노드의 엘리먼트. `innerHTML`을 갈아 끼울 때마다 다시 만든다. */
  const indexNodes = (): Map<string, Element> => {
    const found = new Map<string, Element>()
    for (const element of canvas.querySelectorAll('[data-wb-id]')) {
      const id = element.getAttribute('data-wb-id')
      if (id !== null && !found.has(id)) found.set(id, element)
    }
    return found
  }

  /** 뿌리에서 얼마나 깊은가. **바깥부터 갈아 끼워야** 안쪽 판이 살아남는다. */
  const depthOf = (element: Element): number => {
    let depth = 0
    for (let node = element.parentElement; node !== null; node = node.parentElement) depth += 1
    return depth
  }

  /**
   * **번호 마커를 목업 위에 겹쳐 그린다.**
   *
   * 짝은 이미 실려 있다 — 코멘트 탭의 각 줄이 `data-wb-marker-for`(노드 id)와
   * `data-wb-marker`(번호)를 든다. **문서를 다시 읽지 않는다.**
   *
   * **기준을 여기서 다시 정하지 않는 것이 요점이다.** 줄에 `data-wb-marker`가 있으면
   * 번호이고 없으면 아니다 — 즉 코멘트 탭이 쓴 기준을 그대로 따른다. 캔버스가 쓰는
   * `Number.isInteger`(0과 음수도 그린다)를 옮겨 오면 **같은 번들 안에서 두 줄이 갈린다.**
   *
   * 자리는 **그린 뒤에 잰다** — 정적 HTML에는 그 값이 없다(좌표는 브라우저가 그려야 생긴다).
   */
  const drawMarkers = (): void => {
    const old = canvas.querySelector('.wb-export-markers')
    if (old !== null) old.remove()

    // **코멘트 탭의 줄만 본다.** 겹layer의 배지도 `data-wb-marker-for`를 들므로 문서 전체를
    // 훑으면 자기가 그린 것을 다시 읽을 수 있다.
    const lines = document.querySelectorAll('#wb-export-panel-comments [data-wb-marker-for]')
    if (lines.length === 0) return

    const nodes = indexNodes()
    const base = canvas.getBoundingClientRect()
    const layer = document.createElement('div')
    layer.className = 'wb-export-markers'
    layer.setAttribute('aria-hidden', 'true')

    const drawn = new Set<string>()
    for (const line of lines) {
      const nodeId = line.getAttribute('data-wb-marker-for')
      const marker = line.getAttribute('data-wb-marker')
      // **`marker`가 없으면 번호가 아니다 — 그것이 코멘트 탭의 기준이고 자리가 여기 하나다.**
      // 셀렉터에도 `[data-wb-marker]`를 넣어 이 줄과 **둘 다** 거르면 둘이 서로의 잉여라
      // 어느 하나를 지워도 아무것도 안 죽는다. 타입이 이 줄을 요구하는 것도 아니다 —
      // `textContent`가 `string | null`을 받고 템플릿 리터럴도 `null`을 삼킨다(가드를 지워도
      // typecheck가 통과한다). **기준을 한 자리에 둔다.**
      if (nodeId === null || marker === null || drawn.has(nodeId)) continue
      const target = nodes.get(nodeId)
      // 숨겨진 노드·그리지 못한 노드에는 마커가 없다. 캔버스도 같다.
      if (target === undefined) continue
      drawn.add(nodeId)

      const box = target.getBoundingClientRect()
      const badge = document.createElement('span')
      badge.className = 'wb-export-marker'
      badge.setAttribute('data-wb-marker-for', nodeId)
      badge.title = `코멘트 ${marker}번`
      badge.textContent = marker
      badge.style.left = `${box.left - base.left}px`
      badge.style.top = `${box.top - base.top}px`
      layer.appendChild(badge)
    }

    if (layer.childElementCount > 0) canvas.appendChild(layer)
  }

  /**
   * 겹layer를 DOM에 바른다.
   *
   * **원본에서 다시 시작한다.** 되돌리기를 따로 두면 *"무엇을 되돌려야 하는가"*가 상태가
   * 되고, 그 상태가 틀리면 화면이 조용히 어긋난다. 여기서는 되돌릴 것이 없다.
   */
  const paint = (): string[] => {
    const missing: string[] = []
    canvas.innerHTML = pristine

    const nodes = indexNodes()
    const ids = Object.keys(overlay).filter((id) => nodes.has(id))
    ids.sort((a, b) => depthOf(nodes.get(a)!) - depthOf(nodes.get(b)!))

    for (const id of ids) {
      // 바깥을 갈아 끼운 뒤라 참조가 낡았다. 그때마다 다시 찾는다.
      const element = canvas.querySelector(`[data-wb-id="${id.replace(/["\\]/g, '\\$&')}"]`)
      // 숨겨진 조상 아래였으면 이미 DOM에 없다 — 캔버스와 같다.
      if (element === null) continue

      const record = overlay[id]!
      if (record['visible'] === false) {
        // **감추지 않고 뺀다.** `display:none`으로 두면 테마가 그것을 덮어 되살릴 수 있어
        // *"숨겨졌다"*가 아니게 된다(`renderer`의 `renderNodeIn`이 같은 근거를 적었다).
        element.remove()
        continue
      }

      const key = stateKey(record)
      if (key === '') continue
      const html = plan.variants[id]?.[key]
      if (html === undefined) {
        missing.push(`이 상태의 화면이 번들에 없습니다: ${id}`)
        continue
      }
      element.outerHTML = html
    }

    drawMarkers()
    return missing
  }

  /** 이 DOM 이벤트가 이 노드에서 났을 때 할 일. 없으면 `undefined`다. */
  const eventFor = (nodeId: string, dom: string): RuntimeEvent | undefined =>
    plan.events.find((item) => item.nodeId === nodeId && item.dom === dom)

  /**
   * 눌린 자리에서 바깥으로 올라가며 반응할 노드를 모은다. **안쪽이 먼저다** —
   * 웹 앱에서는 핸들러가 노드마다 붙어 버블링이 그 순서를 만든다. 위임으로 받는 여기서는
   * 그 순서를 손으로 만들어야 한다.
   */
  const chain = (from: EventTarget | null, dom: string): RuntimeEvent[] => {
    const out: RuntimeEvent[] = []
    let node = from instanceof Element ? from : null
    while (node !== null && canvas.contains(node)) {
      const id = node.getAttribute('data-wb-id')
      if (id !== null) {
        const found = eventFor(id, dom)
        if (found !== undefined) out.push(found)
      }
      node = node.parentElement
    }
    return out
  }

  /**
   * 조작 하나가 일어났다.
   *
   * **알림은 *"마지막 조작이 만든 것"*이다 — 규칙이 없는 자리를 눌러도 앞 조작의 줄을
   * 비운다.** 그러지 않으면 깨진 규칙을 누른 뒤 아무 데나 누를 때 그 문장이 남아, 읽는
   * 사람이 **방금 누른 것이 실패한 줄 안다.**
   *
   * **`apps/web`의 캔버스가 이미 같은 규칙으로 같은 갈래를 닫았다**(`canvas.tsx`의
   * `beginGesture` — *"조작이 시작될 때 비우고 그 조작 동안 일어난 것을 쌓는다"*). 그쪽은
   * 노드마다 핸들러가 붙어 **캡처 단계**가 필요하지만, 여기는 위임이라 이 함수 하나가 그
   * 조작의 전부를 본다 — **비우기와 쌓기가 같은 호출 안에 있다.**
   */
  const handle = (dom: string, event: Event): void => {
    const hits = chain(event.target, dom)
    if (hits.length === 0) {
      say([])
      return
    }

    // **이 줄을 지우면 폼 제출이 페이지를 떠난다.** 와이어프레임에는 제출을 보낼 곳이 없는데
    // `<form>`은 막지 않으면 문서를 떠나고, 그러면 겹layer가 통째로 사라진다. 웹 앱의
    // 런타임도 같은 자리에서 같은 것을 한다(`renderer`의 `handlersFor`).
    if (dom === 'submit') event.preventDefault()

    const lines: string[] = []
    let go: string | null = null

    for (const hit of hits) {
      for (const write of hit.writes) {
        overlay[write.target] = { ...overlay[write.target], [write.prop]: write.value }
      }
      for (const issue of hit.issues) lines.push(issue.message)
      for (const request of hit.requests) {
        // **조용히 아무 일도 안 일어나게 두지 않고, 조용히 엉뚱한 데로도 안 간다.**
        // 무엇이 잘못됐는지는 내보내기가 이미 문장으로 지어 뒀다.
        if (request.href !== null) {
          if (go === null) go = request.href
        } else if (request.problem !== null) {
          lines.push(request.problem)
        }
      }
      if (
        hit.writes.length === 0 &&
        hit.issues.length === 0 &&
        hit.requests.length === 0
      ) {
        lines.push('이 규칙에는 실행할 액션이 없습니다')
      }
    }

    lines.push(...paint())
    say(lines)
    if (go !== null) window.location.href = go
  }

  for (const dom of ['click', 'change', 'submit']) {
    canvas.addEventListener(dom, (event) => {
      handle(dom, event)
    })
  }

  // 마커는 **자리**를 재므로 폭이 바뀌면 다시 재야 한다. 캔버스도 같은 이유로 다시 잰다.
  window.addEventListener('resize', () => {
    drawMarkers()
  })

  drawMarkers()
  say([])
}
