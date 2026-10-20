/**
 * **두 DOM을 견주는 자.** `test/parity.test.tsx`가 쓰고, `apps/web`의 캔버스↔번들 케이스도
 * 같은 것을 쓴다.
 *
 * **왜 `test/`가 아니라 여기 있나.** 견주기가 서는 자리가 둘이다 — `packages/exporter`의
 * *"SSR과 클라이언트가 같은가"*와 `apps/web`의 *"진짜 캔버스와 번들이 같은가"*. `apps/web`은
 * `packages/exporter/test/`를 import할 수 없고(패키지 밖의 상대 경로다), **자를 두 벌 두면
 * *"같다"*의 뜻이 둘이 된다.** 그래서 패키지의 `exports`에 `./test-support`로 낸다.
 *
 * `dist`에 들어가지 않는다(`files`가 `dist`뿐이다). vitest도 이 디렉터리를 케이스로 집지
 * 않는다 — `unit` 프로젝트의 include가 각 패키지의 `test` 디렉터리만 본다.
 *
 * > **그 include 패턴을 블록 주석에 그대로 적지 마라.** `packages` 다음에 오는 별표와
 * > 빗금이 주석을 **거기서 닫고**, 뒤따르는 글자가 코드가 되어
 * > `ReferenceError: test is not defined`로 죽는다(요란하게 죽으므로 검사를 세울 자리는
 * > 아니다 — 컴파일러가 이미 잡는다).
 *
 * ---
 *
 * ## 견주는 단위
 *
 * 한 줄이 노드 하나이고 넷을 든다:
 *
 * 1. **자리** — 뿌리에서부터의 자식 인덱스 사슬(`0.2.1`). **순서가 여기 들어간다.**
 * 2. **태그 이름**(소문자).
 * 3. **속성 전부** — 이름과 값을 짝으로, **이름으로 정렬해서.** 설계서 「노드 속성」의 여섯
 *    속성이 여기 포함된다. 정렬하는 것은 속성의 출력 순서까지 계약으로 삼지 않기 위해서다 — HTML에서
 *    그 순서는 뜻이 없고 SSR과 클라이언트가 다르게 낼 이유가 있다.
 * 4. **텍스트** — **이어 붙은 텍스트 노드는 한 덩이로 본다.**
 *
 * **정규화가 셋 있고 셋 다 재서 넣었다** — 그냥 넣은 것이 아니라 두 경로가 실제로 갈렸고
 * 원인을 판정한 결과다(㉠ `style`의 적는 꼴 · ㉡ 텍스트 노드 경계 · ㉢ 선언 없는 `style`
 * 속성). `test/parity.test.tsx`와 `apps/web`의 캔버스 케이스가 갈린 원문을 값으로 들고,
 * **정규화가 접는 축만 접는지** 양방향으로 잰다.
 */

/**
 * **`style` 속성의 적는 꼴을 접는다 — 선언은 접지 않는다.**
 *
 * 실측(갈림 ㉠):
 *
 * | 경로 | `Grid`의 `style` 원문 |
 * |---|---|
 * | 화면 | `--wb-node-grid-columns: 3;` |
 * | 번들 | `--wb-node-grid-columns:3` |
 *
 * **원인은 렌더러도 exporter도 아니다.** 화면 쪽은 React 클라이언트가 `style` 객체를 CSSOM에
 * 하나씩 얹으므로 `getAttribute('style')`이 **CSSOM이 다시 적은 문자열**을 낸다. 번들 쪽은
 * HTML 파서가 속성 값을 **원문 그대로** 보관한다. 실브라우저도 같은 갈래를 갖는다 — 같은
 * 선언을 다르게 적은 것이지 다른 스타일이 아니다. `font` 같은 단축 속성은 화면 쪽에서
 * 낱개로 펼쳐지기까지 한다.
 *
 * 그래서 **양쪽을 같은 CSSOM에 넣어 되읽는다.** 접히는 것은 적는 꼴뿐이고, 선언이 하나라도
 * 늘거나 줄거나 값이 바뀌면 그대로 갈린다.
 *
 * **`probe`를 인자로 받는다** — 견주는 두 트리가 서로 다른 `Document`에 살기 때문이다
 * (하나는 화면, 하나는 `DOMParser`의 것). 모듈 수준 전역을 쓰면 어느 문서의 CSSOM으로
 * 재는지가 import 순서에 달린다.
 */
export function normalizeStyle(value: string, probe: HTMLElement): string {
  probe.setAttribute('style', value)
  const text = probe.style.cssText
  probe.removeAttribute('style')
  return text
}

type Item = { kind: 'element'; element: Element } | { kind: 'text'; text: string } | { kind: 'other'; label: string }

/**
 * 자식을 견줄 단위로 편다. **이어 붙은 텍스트 노드를 한 덩이로 합친다.**
 *
 * 실측(갈림 ㉡ — 뷰가 글 한 줄을 JSX 자식 둘로 내는 자리에서 난다. 예: `EntryForm:sectioned` 의 `sectionTitle` 을
 * `구획 {번호}` 로 그리는 테마 뷰):
 *
 * | 경로 | `sectionTitle`의 자식 |
 * |---|---|
 * | 화면 | 텍스트 노드 **둘** — `"구획 "`, `"1"` |
 * | 번들 | 텍스트 노드 **하나** — `"구획 1"` |
 *
 * **원인은 HTML이 텍스트 노드 경계를 적을 수 없다는 것이다.** 화면 쪽 둘은 JSX가 자식
 * 둘로 만든 것이고, `renderToStaticMarkup`은 그것을 이어 붙여 낸다(하이드레이션용
 * `<!-- -->` 구분자를 넣는 것은 `renderToString`이고 정적 마크업은 넣지 않는다). 어떤
 * 직렬화→파싱 왕복도 그 경계를 잃는다.
 *
 * **보이는 글자는 같다.** 그리고 그 경계에 기대는 것이 없다 — 셀렉터도 CSS도 텍스트 노드를
 * 겨냥하지 못한다.
 *
 * 주석 노드는 합치지 않고 그대로 남긴다. 오늘 두 경로 다 내지 않지만 생기면 갈리는 편이
 * 낫다 — 이 정규화가 덮는 것은 **경계**이지 **노드의 종류**가 아니다.
 */
function childItems(node: Node): Item[] {
  const items: Item[] = []
  for (const child of [...node.childNodes]) {
    if (child.nodeType === child.TEXT_NODE) {
      const last = items.at(-1)
      if (last?.kind === 'text') last.text += child.nodeValue ?? ''
      else items.push({ kind: 'text', text: child.nodeValue ?? '' })
      continue
    }
    if (child.nodeType === child.ELEMENT_NODE) {
      items.push({ kind: 'element', element: child as Element })
      continue
    }
    items.push({ kind: 'other', label: `#node${child.nodeType} ${child.nodeValue ?? ''}` })
  }
  return items
}

/**
 * **선언이 하나도 없는 `style` 속성은 없는 것으로 본다.**
 *
 * 실측(갈림 ㉢ — **진짜 캔버스에서만 난다**):
 *
 * | 언제 | `Tree:accordion`의 `node` 조각 |
 * |---|---|
 * | 테마 없이 그린 뒤(=`Tree:indent`) 테마가 와서 다시 그리면 | `style=""` |
 * | 처음부터 그 테마로 그리면 | `style` 속성이 **없다** |
 * | 번들(SSR) | 없다 |
 *
 * **원인은 React의 재조정이다.** 구조가 `indent`에서 `accordion`으로 바뀌면 React가 같은
 * `<li>`를 재사용하고 `--wb-node-tree-level` 선언만 지운다 — 속성은 남고 값이 빈다. 캔버스가
 * 늘 그 경로를 지나는 것은 테마를 **서버에서 늦게** 받기 때문이다(`useProjectTheme`의 첫
 * 상태가 `loading`이고 그때 테마는 `null`이다).
 *
 * **선언이 0개이므로 스타일이 다른 것이 아니다.** ㉠과 같은 부류의 판정이다 — 우리가 견주는
 * 것은 **선언**이지 속성의 글자가 아니다. 선언이 하나라도 있으면 그대로 갈린다.
 */
function attributeLine(attr: Attr, probe: HTMLElement): string | null {
  if (attr.name !== 'style') return `${attr.name}=${JSON.stringify(attr.value)}`
  const declarations = normalizeStyle(attr.value, probe)
  return declarations === '' ? null : `style=${JSON.stringify(declarations)}`
}

/** 원소 하나를 한 줄로. 자리·태그·속성을 든다. */
function describeElement(element: Element, path: string, probe: HTMLElement): string {
  const attrs = [...element.attributes]
    .map((attr) => attributeLine(attr, probe))
    .filter((line): line is string => line !== null)
    .sort()
    .join(' ')
  return `${path} <${element.tagName.toLowerCase()}> ${attrs}`
}

function describeItems(items: Item[], path: string, lines: string[], probe: HTMLElement): void {
  items.forEach((item, index) => {
    const here = `${path}.${index}`
    if (item.kind === 'text') {
      lines.push(`${here} #text ${item.text}`)
      return
    }
    if (item.kind === 'other') {
      lines.push(`${here} ${item.label}`)
      return
    }
    lines.push(describeElement(item.element, here, probe))
    describeItems(childItems(item.element), here, lines, probe)
  })
}

/**
 * 트리 하나를 줄의 목록으로 편다. 두 목록이 같으면 두 DOM이 같다.
 *
 * CSSOM 프로브는 **그 트리가 사는 문서**에서 만든다 — 화면과 번들이 서로 다른 `Document`에
 * 살고, 정규화가 어느 CSSOM을 쓰는지가 결과에 걸리기 때문이다.
 */
export function describeTree(root: Element): string[] {
  const probe = root.ownerDocument.createElement('div')
  const lines = [describeElement(root, '0', probe)]
  describeItems(childItems(root), '0', lines, probe)
  return lines
}
