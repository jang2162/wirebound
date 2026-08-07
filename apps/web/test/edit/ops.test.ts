// @vitest-environment node
/**
 * `edit/ops.ts`의 계약 — prop 편집(`propOps`)과 구조 편집(`insertNodeOps`·`removeNodeOps`·
 * `moveNodeOps`). **순수 함수이고 React·DOM을 모른다** — 그래서 DOM 없는 환경에서 돈다
 * (`test/store/editor-store.test.ts`와 같은 이유).
 *
 * **왕복 대조가 이 파일의 핵심이다.** 경로를 손으로 적은 단언만 있으면 오프바이원을 못
 * 잡는다 — 만든 ops를 `applyOps`에 넣어 그 값이 실제로 들어가는지 본다.
 */
import {
  applyOps,
  collectNodeIds,
  findNode,
  invertOps,
  type PageDocument,
  type PatchOp,
  type WbNode,
} from '@wirebound/schema'
import { describe, expect, it } from 'vitest'
import { insertNodeOps, propOps, removeNodeOps } from '../../src/edit/ops'

function doc(root: WbNode): PageDocument {
  return { version: 1, root }
}

/** 루트 하나에 자식 하나. `props`는 인자로 준 것만 붙인다. */
function withChild(props?: Record<string, unknown>): PageDocument {
  return doc({
    id: 'n_root',
    type: 'Page',
    children: [{ id: 'n_a', type: 'Text', ...(props === undefined ? {} : { props }) }],
  })
}

/** 손자까지 있는 문서. 경로 조립이 깊이를 따라가는지 본다. */
function withGrandchild(): PageDocument {
  return doc({
    id: 'n_root',
    type: 'Page',
    children: [
      { id: 'n_skip', type: 'Container', children: [] },
      {
        id: 'n_box',
        type: 'Container',
        children: [
          { id: 'n_deep', type: 'Text', props: { title: '옛 제목' } },
        ],
      },
    ],
  })
}

/** 만든 ops를 실제로 적용해 그 노드의 `props`를 읽는다. 왕복 대조의 오른쪽이다. */
function propsAfter(document: PageDocument, ops: ReturnType<typeof propOps>, path: number[]): unknown {
  if (ops === null) throw new Error('ops가 null이라 적용할 수 없다')
  const next = applyOps(document, ops)
  let node: WbNode = next.root
  for (const index of path) {
    const child = node.children?.[index]
    if (child === undefined) throw new Error(`자식이 없다: ${path.join('/')}`)
    node = child
  }
  return node.props
}

describe('propOps', () => {
  it('루트 자식의 prop을 바꾸는 경로를 만든다', () => {
    const document = withChild({ title: '옛 제목' })

    expect(propOps(document, 'n_a', 'title', '새 제목')).toEqual([
      { op: 'replace', path: '/root/children/0/props/title', value: '새 제목' },
    ])
  })

  it('깊이 중첩된 노드의 경로를 만든다', () => {
    // 앞에 형제가 하나 있으므로 인덱스가 0이 아니다 — 첫 자식만 보는 구현을 잡는다.
    const document = withGrandchild()

    expect(propOps(document, 'n_deep', 'title', '새 제목')).toEqual([
      { op: 'replace', path: '/root/children/1/children/0/props/title', value: '새 제목' },
    ])
  })

  it('props가 없던 노드에는 props 객체째로 add한다', () => {
    // **소스를 읽고 실측해 확정한 모양이다.** `props`가 없는 노드에
    // `replace /…/props/title`을 주면 `applyOps`의 `resolveSlot`이 `parent`를
    // `undefined`로 만들어 `경로를 찾을 수 없습니다`로 던진다(실측). op을 둘로 나누지
    // 않는 것은 하나면 되고 서버가 만들 `inverse`도 단순해지기 때문이다 —
    // 실측한 그 `inverse`는 `[{ op: 'remove', path: '/root/children/0/props' }]` 하나다.
    const document = withChild()

    expect(propOps(document, 'n_a', 'title', '새 제목')).toEqual([
      { op: 'add', path: '/root/children/0/props', value: { title: '새 제목' } },
    ])
  })

  it('props는 있는데 그 prop이 없으면 그 키만 add한다', () => {
    // **계획서의 표에 없던 갈래다.** 계획서는 "`props`가 있으면 `replace`"라고만 적었는데,
    // `props`는 있고 그 **키**가 없는 노드에 `replace`를 주면 `applyOps`의 `replaceAt`이
    // `Object.hasOwn`을 보고 `바꿀 키가 없습니다`로 던진다(실측). 그러면 D7이 요청을
    // 막으므로 **값이 없던 prop을 처음 켜는 편집이 아예 나가지 못한다.**
    //
    // 통째 `add`도 답이 아니다 — 그러면 아래 단언의 `other`가 지워진다.
    const document = withChild({ other: 1 })

    expect(propOps(document, 'n_a', 'title', '새 제목')).toEqual([
      { op: 'add', path: '/root/children/0/props/title', value: '새 제목' },
    ])
  })

  it('없는 노드면 null이다', () => {
    // 요청을 보내지 않는 신호다(D7). 여기서 던지면 화면이 렌더 도중 죽는다.
    expect(propOps(withChild({ title: 'x' }), 'n_missing', 'title', '새 제목')).toBeNull()
  })

  it('만든 ops를 applyOps에 넣으면 그 값이 들어간다', () => {
    // **왕복 대조.** 위의 경로 단언들만 있으면 오프바이원을 못 잡는다.
    const document = withChild({ title: '옛 제목', other: 1 })

    expect(propsAfter(document, propOps(document, 'n_a', 'title', '새 제목'), [0])).toEqual({
      title: '새 제목',
      other: 1,
    })
  })

  it('세 갈래 전부 왕복한다', () => {
    // 세 갈래(통째 add · 키 add · replace)를 같은 대조로 지나간다. 어느 하나가 던지면
    // `propsAfter`가 그 자리에서 깨진다.
    const cases: { name: string; document: PageDocument; expected: Record<string, unknown> }[] = [
      { name: 'props 없음', document: withChild(), expected: { title: '새 제목' } },
      { name: 'props 있고 키 없음', document: withChild({ other: 1 }), expected: { other: 1, title: '새 제목' } },
      { name: 'props 있고 키 있음', document: withChild({ title: '옛' }), expected: { title: '새 제목' } },
    ]

    for (const { name, document, expected } of cases) {
      expect(propsAfter(document, propOps(document, 'n_a', 'title', '새 제목'), [0]), name).toEqual(
        expected,
      )
    }
  })

  it('깊은 노드도 왕복한다', () => {
    const document = withGrandchild()

    expect(propsAfter(document, propOps(document, 'n_deep', 'title', '새 제목'), [1, 0])).toEqual({
      title: '새 제목',
    })
  })

  it('불리언·수·배열도 그대로 실린다', () => {
    // 컨트롤 위젯(Task 7~9)이 문자열 아닌 값을 낸다. 여기서 문자열로 굳히면 그때 막힌다.
    const document = withChild({ title: 'x' })

    for (const value of [true, 3, ['a', 'b'], null]) {
      expect(propOps(document, 'n_a', 'flag', value)).toEqual([
        { op: 'add', path: '/root/children/0/props/flag', value },
      ])
    }
  })

  it('서버가 만들 inverse를 여기서 재 둔다', () => {
    // **계획서가 답을 정하지 않은 자리다** — "`props`를 통째로 `add`한 편집의 `inverse`가
    // 무엇인지 재지 않았다". 서버는 `packages/schema`의 `invertOps`를 그대로 쓰므로
    // (`apps/api/src/services/edit-pipeline.ts`) 여기서 잰 값이 서버가 낼 값이다.
    // Task 10(undo)이 이 모양에 기댄다.
    const noProps = withChild()
    expect(invertOps(noProps, propOps(noProps, 'n_a', 'title', '새 제목') ?? [])).toEqual([
      { op: 'remove', path: '/root/children/0/props' },
    ])

    const otherKey = withChild({ other: 1 })
    expect(invertOps(otherKey, propOps(otherKey, 'n_a', 'title', '새 제목') ?? [])).toEqual([
      { op: 'remove', path: '/root/children/0/props/title' },
    ])

    const sameKey = withChild({ title: '옛' })
    expect(invertOps(sameKey, propOps(sameKey, 'n_a', 'title', '새 제목') ?? [])).toEqual([
      { op: 'replace', path: '/root/children/0/props/title', value: '옛' },
    ])
  })

  it('inverse를 되적용하면 원래 문서로 돌아간다', () => {
    // 위 케이스는 `inverse`의 **모양**만 본다. undo가 실제로 원래 상태로 돌아가는지는
    // 되적용해야 안다 — 세 갈래 전부 지나간다.
    for (const document of [withChild(), withChild({ other: 1 }), withChild({ title: '옛' })]) {
      const ops = propOps(document, 'n_a', 'title', '새 제목') ?? []
      const inverse = invertOps(document, ops)
      expect(applyOps(applyOps(document, ops), inverse)).toEqual(document)
    }
  })
})

// ---------------------------------------------------------------------------
// 구조 편집 — 여기부터 P2b-3
// ---------------------------------------------------------------------------

/** 형제 셋을 단 루트. 순서·인덱스를 재는 케이스가 이것을 쓴다. */
function withSiblings(): PageDocument {
  return doc({
    id: 'n_root',
    type: 'Page',
    children: [
      { id: 'n_a', type: 'Text' },
      { id: 'n_b', type: 'Text' },
      { id: 'n_c', type: 'Text' },
    ],
  })
}

/** 자식 둘을 단 상자와 그 뒤 형제. 서브트리가 통째로 움직이는지 볼 때 쓴다. */
function withSubtree(): PageDocument {
  return doc({
    id: 'n_root',
    type: 'Page',
    children: [
      {
        id: 'n_box',
        type: 'Card',
        children: [
          { id: 'n_1', type: 'Text' },
          { id: 'n_2', type: 'Text' },
        ],
      },
      { id: 'n_tail', type: 'Text' },
    ],
  })
}

/** 만든 ops를 실제로 적용한 문서. `null`이면 그 자리에서 깨진다 — 왕복 대조의 왼쪽이다. */
function applied(document: PageDocument, ops: PatchOp[] | null): PageDocument {
  if (ops === null) throw new Error('ops가 null이라 적용할 수 없다')
  return applyOps(document, ops)
}

/** 어떤 노드의 자식 id 목록. 순서를 눈으로 읽을 수 있는 형태로 낸다. */
function childIds(document: PageDocument, nodeId: string): string[] {
  const node = findNode(document.root, nodeId)
  if (node === undefined) throw new Error(`노드가 없다: ${nodeId}`)
  return (node.children ?? []).map((child) => child.id)
}

const NEW_NODE: WbNode = { id: 'n_new', type: 'Text' }

describe('insertNodeOps', () => {
  it('루트의 자식으로 넣는다', () => {
    expect(insertNodeOps(withSiblings(), 'n_root', 0, NEW_NODE)).toEqual([
      { op: 'add', path: '/root/children/0', value: NEW_NODE },
    ])
  })

  it('중간 자리에 넣으면 뒤 형제가 밀린다', () => {
    const document = withSiblings()

    expect(childIds(applied(document, insertNodeOps(document, 'n_root', 1, NEW_NODE)), 'n_root'))
      .toEqual(['n_a', 'n_new', 'n_b', 'n_c'])
  })

  it('끝에 넣는다', () => {
    // 인덱스가 `children.length`다. `applyOps`의 `arrayIndex`가 `add`에만 그 자리를
    // 허용한다(`allowEnd`) — 실측: `add /root/children/3`은 형제가 셋일 때 통과하고
    // 넷일 때 `배열 인덱스가 범위를 벗어납니다`로 던진다.
    const document = withSiblings()

    expect(childIds(applied(document, insertNodeOps(document, 'n_root', 3, NEW_NODE)), 'n_root'))
      .toEqual(['n_a', 'n_b', 'n_c', 'n_new'])
  })

  it('깊이 중첩된 부모에도 넣는다', () => {
    const document = withSubtree()

    expect(insertNodeOps(document, 'n_box', 1, NEW_NODE)).toEqual([
      { op: 'add', path: '/root/children/0/children/1', value: NEW_NODE },
    ])
  })

  it('없는 부모면 null이다', () => {
    // 요청을 만들지 않는 신호다(D7). 여기서 던지면 화면이 렌더 도중 죽는다.
    expect(insertNodeOps(withSiblings(), 'n_missing', 0, NEW_NODE)).toBeNull()
  })

  it('넣은 뒤 문서가 그 노드를 담는다', () => {
    // **왕복 대조.** 위의 경로 단언들만 있으면 오프바이원을 못 잡는다 — 손자 자리에
    // 넣고 `findNode`로 되찾는다.
    const document = withSubtree()
    const next = applied(document, insertNodeOps(document, 'n_box', 2, NEW_NODE))

    expect(findNode(next.root, 'n_new')).toEqual(NEW_NODE)
    expect(childIds(next, 'n_box')).toEqual(['n_1', 'n_2', 'n_new'])
  })

  it('children 키가 없는 부모에는 배열째 add한다', () => {
    // **`propOps`의 첫 갈래와 같은 성질이다 — 실측했다.** `children` 키가 없는 노드에
    // `add /root/children/0/children/0`을 주면 `applyOps`의 `resolveSlot`이 마지막
    // 토큰만 남기고 따라 내려가다 `parent`를 `undefined`로 만들어
    // `경로를 찾을 수 없습니다: /root/children/0/children/0`으로 던진다(실측).
    // 그러면 D7이 요청을 막아 **빈 컨테이너에 첫 자식을 넣는 편집이 아예 나가지 못한다.**
    //
    // 그래서 배열째 `add`한다. 카탈로그가 `many`인 타입이어도 문서에 `children` 키가
    // 없을 수 있다는 것은 `create-node.ts`가 그렇게 만들기 때문이다(같은 웨이브).
    const document = doc({
      id: 'n_root',
      type: 'Page',
      children: [{ id: 'n_empty', type: 'Card' }],
    })

    expect(insertNodeOps(document, 'n_empty', 0, NEW_NODE)).toEqual([
      { op: 'add', path: '/root/children/0/children', value: [NEW_NODE] },
    ])
    expect(childIds(applied(document, insertNodeOps(document, 'n_empty', 0, NEW_NODE)), 'n_empty'))
      .toEqual(['n_new'])
  })

  it('children 키가 없는 부모에 0이 아닌 자리는 null이다', () => {
    // 배열째 `add`는 배열 하나를 통째로 놓는 것이라 "1번 자리"라는 것이 없다.
    const document = doc({ id: 'n_root', type: 'Page', children: [{ id: 'n_empty', type: 'Card' }] })

    expect(insertNodeOps(document, 'n_empty', 1, NEW_NODE)).toBeNull()
  })

  it('범위 밖 인덱스면 null이다', () => {
    // 보내 봐야 `applyOps`가 던지고 D7에 막힌다 — 그 전에 `null`로 끊는다.
    // 실측: 형제가 셋일 때 `add /root/children/4`는 `배열 인덱스가 범위를 벗어납니다`다.
    expect(insertNodeOps(withSiblings(), 'n_root', 4, NEW_NODE)).toBeNull()
    expect(insertNodeOps(withSiblings(), 'n_root', -1, NEW_NODE)).toBeNull()
  })

  it('children이 배열이 아닌 부모면 null이다', () => {
    // **깨진 문서를 조용히 덮지 않는다.** 실측: `children`이 문자열인 노드에 배열째
    // `add /…/children`을 주면 던지지 않고 **그 문자열을 지우고 배열로 갈아 끼운다** —
    // `addAt`이 객체 부모에서는 키 할당이기 때문이다. `propOps`가 `props`에 대해
    // 같은 판단을 한 것과 같은 자리다: 이 함수의 `null`은 "요청을 보내지 마라"이고,
    // 그것이 깨진 문서에 대해서도 맞는 답이다.
    const document = doc({
      id: 'n_root',
      type: 'Page',
      children: [{ id: 'n_bad', type: 'Card', children: 'nope' as unknown as WbNode[] }],
    })

    expect(insertNodeOps(document, 'n_bad', 0, NEW_NODE)).toBeNull()
  })
})

describe('removeNodeOps', () => {
  it('노드를 지우면 서브트리째 사라진다', () => {
    const document = withSubtree()
    const next = applied(document, removeNodeOps(document, 'n_box'))

    // **자식 id까지 본다.** 부모만 확인하면 자식이 어딘가 남아도 통과한다.
    expect(collectNodeIds(next.root)).toEqual(['n_root', 'n_tail'])
  })

  it('루트는 지울 수 없다', () => {
    // **`applyOps`가 막아 주지 않는다 — 실측했다.** `remove /root`는 던지지 않고
    // 문서에서 `root` 키를 지워 `{ version: 1 }`을 만든다(`removeAt`의 객체 분기가
    // `Object.hasOwn`을 통과하기 때문). 그러면 낙관적 적용이 성공해 큐에 들어가고,
    // 화면은 루트 없는 문서를 그리게 된다. 그 방어가 여기에 있다.
    expect(removeNodeOps(withSiblings(), 'n_root')).toBeNull()
  })

  it('없는 노드면 null이다', () => {
    expect(removeNodeOps(withSiblings(), 'n_missing')).toBeNull()
  })

  it('지운 뒤 뒤 형제의 인덱스가 당겨진다', () => {
    // 배열 `remove`의 성질이다 — `splice`가 뒤를 당긴다. 경로를 손으로 적는 호출자가
    // 이것을 잊으면 다음 op이 다른 노드를 가리킨다.
    const document = withSiblings()

    expect(childIds(applied(document, removeNodeOps(document, 'n_a')), 'n_root'))
      .toEqual(['n_b', 'n_c'])
  })

  it('서버가 만들 inverse는 서브트리를 통째로 품은 add 하나다', () => {
    // `propOps`의 같은 이름 케이스와 같은 근거다 — 서버는 `packages/schema`의
    // `invertOps`를 그대로 쓴다(`apps/api/src/services/edit-pipeline.ts`). undo가
    // 지운 노드를 자식까지 되살리는 것이 이 모양에 달려 있다.
    const document = withSubtree()
    const ops = removeNodeOps(document, 'n_box') ?? []

    expect(invertOps(document, ops)).toEqual([
      {
        op: 'add',
        path: '/root/children/0',
        value: {
          id: 'n_box',
          type: 'Card',
          children: [
            { id: 'n_1', type: 'Text' },
            { id: 'n_2', type: 'Text' },
          ],
        },
      },
    ])
    expect(applyOps(applyOps(document, ops), invertOps(document, ops))).toEqual(document)
  })
})
