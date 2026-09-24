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
  installCatalog,
  invertOps,
  validatePage,
  type Interaction,
  type PageDocument,
  type PatchOp,
  type WbNode,
} from '@wirebound/schema'
import { beforeAll, describe, expect, it } from 'vitest'

// `validatePage`가 카탈로그를 본다 — 설치하지 않으면 모든 노드가 `unknown-type`이 된다.
beforeAll(() => {
  installCatalog()
})
import { insertNodeOps, interactionsOps, moveNodeOps, propOps, removeNodeOps, variantOps } from '../../src/edit/ops'

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
    // **"`props`가 있으면 `replace`"만으로는 모자란 갈래다.** `props`는 있고 그 **키**가 없는
    // 노드에 `replace`를 주면 `applyOps`의 `replaceAt`이 `Object.hasOwn`을 보고 `바꿀 키가
    // 없습니다`로 던진다(실측). 그러면 낙관적 적용이 실패해 요청이 막히므로 **값이 없던
    // prop을 처음 켜는 편집이 아예 나가지 못한다.**
    //
    // 통째 `add`도 답이 아니다 — 그러면 아래 단언의 `other`가 지워진다.
    const document = withChild({ other: 1 })

    expect(propOps(document, 'n_a', 'title', '새 제목')).toEqual([
      { op: 'add', path: '/root/children/0/props/title', value: '새 제목' },
    ])
  })

  it('없는 노드면 null이다', () => {
    // 요청을 보내지 않는 신호다. 여기서 던지면 화면이 렌더 도중 죽는다.
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
    // 컨트롤 위젯이 문자열 아닌 값을 낸다. 여기서 문자열로 굳히면 그때 막힌다.
    const document = withChild({ title: 'x' })

    for (const value of [true, 3, ['a', 'b'], null]) {
      expect(propOps(document, 'n_a', 'flag', value)).toEqual([
        { op: 'add', path: '/root/children/0/props/flag', value },
      ])
    }
  })

  it('서버가 만들 inverse를 여기서 재 둔다', () => {
    // **`props`를 통째로 `add`한 편집의 `inverse`가 무엇인지 여기서 잰다.** 서버는
    // `packages/schema`의 `invertOps`를 그대로 쓰므로(`apps/api/src/services/edit-pipeline.ts`)
    // 여기서 잰 값이 서버가 낼 값이다. undo가 이 모양에 기댄다.
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
// 구조 편집
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
    // 요청을 만들지 않는 신호다. 여기서 던지면 화면이 렌더 도중 죽는다.
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
    // 그러면 낙관적 적용이 실패해 요청이 막혀 **빈 컨테이너에 첫 자식을 넣는 편집이 아예 나가지 못한다.**
    //
    // 그래서 배열째 `add`한다. 카탈로그가 `many`인 타입이어도 문서에 `children` 키가
    // 없을 수 있다는 것은 `create-node.ts`가 그렇게 만들기 때문이다.
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
    // 보내 봐야 `applyOps`가 던지고 낙관적 적용에서 막힌다 — 그 전에 `null`로 끊는다.
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

describe('moveNodeOps', () => {
  it('같은 부모 안에서 앞으로 옮긴다', () => {
    const document = withSiblings()

    expect(childIds(applied(document, moveNodeOps(document, 'n_c', 'n_root', 0)), 'n_root'))
      .toEqual(['n_c', 'n_a', 'n_b'])
  })

  it('같은 부모 안에서 뒤로 옮긴다', () => {
    // **재서 정한 계약이다.** `[A,B,C]`에서 A를 인덱스 2로
    // 옮기면 `[B,C,A]`다(실측). `move`는 remove 후 add이므로 목적지 인덱스는 **값을 뺀
    // 배열**을 기준으로 읽히고, 그래서 결과 배열에서 그 노드가 놓이는 자리와 같아진다.
    //
    // 이 함수의 `index`는 그 성질을 그대로 계약으로 삼는다: **결과 배열에서의 인덱스**다.
    // 그래야 "한 칸 아래로"가 `index + 1`, "앞 형제 안 마지막"이 `앞형제.children.length`로
    // 자연스럽게 나온다 — 호출자가 방향에 따라 보정을 나눠 쓰지 않아도 된다.
    const document = withSiblings()

    expect(childIds(applied(document, moveNodeOps(document, 'n_a', 'n_root', 2)), 'n_root'))
      .toEqual(['n_b', 'n_c', 'n_a'])
  })

  it('한 칸 아래로는 index + 1이다', () => {
    // 위 계약이 툴바에서 쓰이는 모양이다. `n_a`가 0번이므로 1을 준다.
    const document = withSiblings()

    expect(childIds(applied(document, moveNodeOps(document, 'n_a', 'n_root', 1)), 'n_root'))
      .toEqual(['n_b', 'n_a', 'n_c'])
  })

  it('다른 부모로 옮긴다', () => {
    const document = withSubtree()
    const next = applied(document, moveNodeOps(document, 'n_tail', 'n_box', 0))

    expect(childIds(next, 'n_box')).toEqual(['n_tail', 'n_1', 'n_2'])
    expect(childIds(next, 'n_root')).toEqual(['n_box'])
  })

  it('목적지 부모가 뒤에 있으면 경로가 밀린 것을 보정한다', () => {
    // **실측으로만 보이는 자리다.** `move`는 remove 후 add이므로
    // 목적지 경로도 **값을 뺀 뒤** 문서를 기준으로 잡아야 한다. 소스가 목적지 부모보다
    // 앞에 있으면 뺀 순간 부모의 인덱스가 당겨지는데, 원본 기준 경로를 그대로 쓰면
    // `applyOps`가 `경로를 찾을 수 없습니다: /root/children/1/children/0`으로 던진다(실측).
    //
    // 여기서는 `n_first`(인덱스 0)를 `n_second`(인덱스 1) 안으로 옮긴다 — 뺀 뒤
    // `n_second`는 인덱스 0이다. **왕복 대조가 아니면 이 오프바이원이 안 잡힌다.**
    const document = doc({
      id: 'n_root',
      type: 'Page',
      children: [
        { id: 'n_first', type: 'Text' },
        { id: 'n_second', type: 'Card', children: [{ id: 'n_kid', type: 'Text' }] },
      ],
    })

    expect(moveNodeOps(document, 'n_first', 'n_second', 0)).toEqual([
      { op: 'move', from: '/root/children/0', path: '/root/children/0/children/0' },
    ])
    const next = applied(document, moveNodeOps(document, 'n_first', 'n_second', 0))
    expect(childIds(next, 'n_second')).toEqual(['n_first', 'n_kid'])
    expect(childIds(next, 'n_root')).toEqual(['n_second'])
  })

  it('children 키가 없는 부모로 옮기면 배열을 먼저 만든다', () => {
    // **`move` 하나로는 안 되는 자리다 — 실측했다.** `children` 키가 없는 노드로
    // `move … path /…/children/0`을 주면 `경로를 찾을 수 없습니다`로 던진다
    // (`insertNodeOps`의 같은 갈래와 같은 원인). 그래서 빈 배열을 먼저 놓는다.
    //
    // **op 둘의 경로 기준이 다르다.** `add`는 첫 op이라 **원본 문서** 기준이고,
    // `move`의 `path`는 그 앞의 remove가 지나간 뒤 기준이다. 여기서는 소스(`n_lead`,
    // 인덱스 0)가 목적지 부모(`n_empty`, 인덱스 1)보다 앞이라 둘이 실제로 갈린다 —
    // `add`는 `/root/children/1/children`, `move`는 `/root/children/0/children/0`이다.
    // 한 기준으로 통일하면 둘 다 던진다(아래 `경로 기준을 한쪽으로 통일하면 둘 다 던진다`).
    const document = doc({
      id: 'n_root',
      type: 'Page',
      children: [
        { id: 'n_lead', type: 'Text' },
        { id: 'n_empty', type: 'Card' },
      ],
    })

    expect(moveNodeOps(document, 'n_lead', 'n_empty', 0)).toEqual([
      { op: 'add', path: '/root/children/1/children', value: [] },
      { op: 'move', from: '/root/children/0', path: '/root/children/0/children/0' },
    ])
    const next = applied(document, moveNodeOps(document, 'n_lead', 'n_empty', 0))
    expect(childIds(next, 'n_empty')).toEqual(['n_lead'])
    expect(childIds(next, 'n_root')).toEqual(['n_empty'])
  })

  it('children 키가 없는 부모의 0이 아닌 자리는 null이다', () => {
    const document = doc({
      id: 'n_root',
      type: 'Page',
      children: [
        { id: 'n_lead', type: 'Text' },
        { id: 'n_empty', type: 'Card' },
      ],
    })

    expect(moveNodeOps(document, 'n_lead', 'n_empty', 1)).toBeNull()
  })

  it('자기 자손 안으로는 옮길 수 없다', () => {
    // **끊어진 트리가 만들어지는 것이 아니라 `applyOps`가 던진다** — 아래
    // `자손을 부모로 주면 null이다 —`가 그 값을 근거까지 담고 있다.
    expect(moveNodeOps(withSubtree(), 'n_box', 'n_1', 0)).toBeNull()
  })

  it('자기 자신을 부모로 삼을 수 없다', () => {
    expect(moveNodeOps(withSubtree(), 'n_box', 'n_box', 0)).toBeNull()
  })

  it('루트는 옮길 수 없다', () => {
    expect(moveNodeOps(withSiblings(), 'n_root', 'n_a', 0)).toBeNull()
  })

  it('없는 노드·없는 부모면 null이다', () => {
    expect(moveNodeOps(withSiblings(), 'n_missing', 'n_root', 0)).toBeNull()
    expect(moveNodeOps(withSiblings(), 'n_a', 'n_missing', 0)).toBeNull()
  })

  it('범위 밖 인덱스면 null이다', () => {
    // 같은 부모 안이면 **값을 뺀 뒤** 길이가 기준이다 — 형제가 셋이어도 2까지다.
    expect(moveNodeOps(withSiblings(), 'n_a', 'n_root', 3)).toBeNull()
    expect(moveNodeOps(withSiblings(), 'n_a', 'n_root', 2)).not.toBeNull()
    expect(moveNodeOps(withSiblings(), 'n_a', 'n_root', -1)).toBeNull()
  })

  it('children이 배열이 아닌 부모면 null이다', () => {
    const document = doc({
      id: 'n_root',
      type: 'Page',
      children: [
        { id: 'n_a', type: 'Text' },
        { id: 'n_bad', type: 'Card', children: 'nope' as unknown as WbNode[] },
      ],
    })

    expect(moveNodeOps(document, 'n_a', 'n_bad', 0)).toBeNull()
  })

  it('옮긴 뒤 서브트리가 통째로 따라간다', () => {
    const document = withSubtree()
    const next = applied(document, moveNodeOps(document, 'n_box', 'n_root', 1))

    expect(childIds(next, 'n_root')).toEqual(['n_tail', 'n_box'])
    expect(childIds(next, 'n_box')).toEqual(['n_1', 'n_2'])
    // 자손이 사라지거나 두 번 실리지 않았는지 — 전체 id 집합으로 본다.
    expect(collectNodeIds(next.root).sort()).toEqual(collectNodeIds(document.root).sort())
  })

  it('서버가 만들 inverse를 여기서 재 둔다', () => {
    // **소스를 읽으면 나오는 추론을 여기서 잰다** — *"목적지가 배열이면 덮어쓸 값이
    // 없으므로 반대 방향 `move` 하나"*. 서버는 `packages/schema`의 `invertOps`를 그대로
    // 쓰므로(`apps/api/src/services/edit-pipeline.ts`) 여기서 잰 값이 서버가 낼 값이다.
    //
    // **그 추론이 맞다** — 아래 셋이 전부 `move` 하나다. 다만 그것은 `move` op **하나만**
    // 낼 때의 이야기이고, `children` 배열을 먼저 만드는 갈래는 `inverse`도 둘이다(그 다음
    // 케이스). 이 함수가 재는 것은 "목적지가 배열인 `move`"까지다.
    const back = withSiblings()
    expect(invertOps(back, moveNodeOps(back, 'n_a', 'n_root', 2) ?? [])).toEqual([
      { op: 'move', from: '/root/children/2', path: '/root/children/0' },
    ])

    const forward = withSiblings()
    expect(invertOps(forward, moveNodeOps(forward, 'n_c', 'n_root', 0) ?? [])).toEqual([
      { op: 'move', from: '/root/children/0', path: '/root/children/2' },
    ])

    const across = withSubtree()
    expect(invertOps(across, moveNodeOps(across, 'n_tail', 'n_box', 0) ?? [])).toEqual([
      { op: 'move', from: '/root/children/0/children/0', path: '/root/children/1' },
    ])
  })

  it('배열을 만드는 갈래의 inverse는 둘이다', () => {
    // 위 케이스의 예외다. 빈 배열을 놓은 `add`의 역이 `remove /…/children`으로 함께
    // 오므로, undo 뒤 문서에 **빈 `children`이 남지 않는다**(실측 — `propOps`의 통째
    // `add`가 빈 `props`를 남기지 않는 것과 같은 성질).
    //
    // **역의 두 경로도 서로 다른 시점을 기준으로 읽힌다.** `invertOps`는 묶음 순서만
    // 뒤집으므로 먼저 `move`가 `n_lead`를 루트 인덱스 0으로 돌려놓고, 그 순간 `n_empty`가
    // 인덱스 1로 밀린 뒤에 `remove /root/children/1/children`이 온다. 아래 값은 **잰
    // 것이다** — 소스가 목적지보다 **뒤**에 있는 문서에서 잰 값(`/root/children/0/children`)을
    // 옮겨 적으면 틀린다.
    const document = doc({
      id: 'n_root',
      type: 'Page',
      children: [
        { id: 'n_lead', type: 'Text' },
        { id: 'n_empty', type: 'Card' },
      ],
    })
    const ops = moveNodeOps(document, 'n_lead', 'n_empty', 0) ?? []

    expect(invertOps(document, ops)).toEqual([
      { op: 'move', from: '/root/children/0/children/0', path: '/root/children/0' },
      { op: 'remove', path: '/root/children/1/children' },
    ])
  })

  it('자손을 부모로 주면 null이다 — applyOps가 던지는 것을 미리 끊는다', () => {
    // **근거는 "트리가 끊어진다"가 아니다.** 가드를
    // 우회해 그 op을 직접 만들면 끊어진 트리가 **만들어지지 않는다** — `move`가 `from`을
    // 먼저 빼므로 목적지 경로가 그 순간 문서에서 사라지고 `applyOps`가 던진다(실측).
    //
    // 그러니 이 판정이 막는 것은 "끊어진 트리"가 아니라 **`PatchError`**다. 그마저도
    // `EditorStore.applyEdit`이 `try/catch`로 잡아 `null`을 내므로 화면이 죽지는 않는다 —
    // 이 판정의 값어치는 **적용해 보기 전에 끊는 것**까지다.
    const document = withSubtree()

    expect(moveNodeOps(document, 'n_box', 'n_1', 0)).toBeNull()
    // 그 op을 손으로 만들면 무엇이 되는지 — 아래가 위 문장의 근거다.
    expect(() =>
      applyOps(document, [
        { op: 'move', from: '/root/children/0', path: '/root/children/0/children/0/children/0' },
      ]),
    ).toThrow(/경로를 찾을 수 없습니다/)
  })

  it('경로 기준을 한쪽으로 통일하면 둘 다 던진다', () => {
    // **`children` 키를 만드는 갈래에서 `add`와 `move`의 기준이 갈린다는 근거다.**
    // 한쪽으로 통일하면 *"둘 중 하나가 다른 노드를 가리킨다"*가 아니라 **둘 다 던진다.**
    // 결론(기준을 갈라야 한다)은 같다.
    const document = doc({
      id: 'n_root',
      type: 'Page',
      children: [
        { id: 'n_lead', type: 'Text' },
        { id: 'n_empty', type: 'Card' },
      ],
    })

    expect(() =>
      applyOps(document, [
        { op: 'add', path: '/root/children/1/children', value: [] },
        { op: 'move', from: '/root/children/0', path: '/root/children/1/children/0' },
      ]),
    ).toThrow(/경로를 찾을 수 없습니다/)
    expect(() =>
      applyOps(document, [
        { op: 'add', path: '/root/children/0/children', value: [] },
        { op: 'move', from: '/root/children/0', path: '/root/children/0/children/0' },
      ]),
    ).toThrow(/경로를 찾을 수 없습니다/)
    // 갈라 쓰는 지금 구현만 지나간다.
    expect(childIds(applied(document, moveNodeOps(document, 'n_lead', 'n_empty', 0)), 'n_empty'))
      .toEqual(['n_lead'])
  })

  it('inverse를 되적용하면 원래 문서로 돌아간다', () => {
    // 위 두 케이스는 `inverse`의 **모양**만 본다. undo가 실제로 제자리로 돌리는지는
    // 되적용해야 안다 — 갈래 넷을 전부 지나간다.
    const emptyDest = (): PageDocument =>
      doc({
        id: 'n_root',
        type: 'Page',
        children: [
          { id: 'n_lead', type: 'Text' },
          { id: 'n_empty', type: 'Card' },
        ],
      })
    const cases: { name: string; document: PageDocument; ops: PatchOp[] | null }[] = [
      { name: '같은 배열 뒤로', document: withSiblings(), ops: moveNodeOps(withSiblings(), 'n_a', 'n_root', 2) },
      { name: '같은 배열 앞으로', document: withSiblings(), ops: moveNodeOps(withSiblings(), 'n_c', 'n_root', 0) },
      { name: '다른 부모로', document: withSubtree(), ops: moveNodeOps(withSubtree(), 'n_tail', 'n_box', 0) },
      { name: '배열을 만들며', document: emptyDest(), ops: moveNodeOps(emptyDest(), 'n_lead', 'n_empty', 0) },
    ]

    for (const { name, document, ops } of cases) {
      if (ops === null) throw new Error(`${name}: ops가 null이다`)
      const inverse = invertOps(document, ops)
      expect(applyOps(applyOps(document, ops), inverse), name).toEqual(document)
    }
  })
})

describe('ops.ts의 방어선 — children 배열 안에 노드가 아닌 원소', () => {
  /**
   * **방어선이 없으면 넷이 다 던질 수 있다.** 대상 노드가 `null` 원소보다 **앞**에 있는
   * 문서에서는 `moveNodeOps`만 던지지만, 대상이 뒤에 있으면 `propOps`·`removeNodeOps`도
   * 던진다 — 셋 다 `findNodePath`를 지나고 그것이 `walkNodes`를 쓰기 때문이다(실측).
   *
   * `insertNodeOps(…, 'n_root', …)`는 루트가 첫 방문이라 순회가 `null`에 닿기 전에
   * 반환해 던지지 않는다 — 그 노드가 뒤에 있으면 그쪽도 던진다.
   */
  const afterNull = (): PageDocument =>
    doc({
      id: 'n_root',
      type: 'Page',
      children: [null as unknown as WbNode, { id: 'n_a', type: 'Text' }],
    })

  /** `null`이 다른 노드의 자식이다. 루트의 직계는 멀쩡하다. */
  const nestedNull = (): PageDocument =>
    doc({
      id: 'n_root',
      type: 'Page',
      children: [
        { id: 'n_box', type: 'Card', children: [null as unknown as WbNode] },
        { id: 'n_a', type: 'Text' },
      ],
    })

  it('넷 다 던지지 않는다', () => {
    // **`ops.ts` 머리말이 "던지지 않는다"를 계약으로 적은 자리다.** 이 함수들은 렌더
    // 중에도 불릴 수 있고 구조 트리·속성 패널은 오류 경계 밖이다.
    for (const [name, document] of [
      ['대상이 null 뒤', afterNull()],
      ['null이 중첩', nestedNull()],
    ] as const) {
      expect(() => propOps(document, 'n_a', 'content', 'x'), name).not.toThrow()
      expect(() => insertNodeOps(document, 'n_a', 0, NEW_NODE), name).not.toThrow()
      expect(() => removeNodeOps(document, 'n_a'), name).not.toThrow()
      expect(() => moveNodeOps(document, 'n_a', 'n_root', 0), name).not.toThrow()
    }
  })

  it('없는 노드를 찾아 순회가 끝까지 가도 던지지 않는다', () => {
    // 위 케이스는 대상을 찾은 시점에 멈춘다. 못 찾는 경우가 **순회를 끝까지** 돌므로
    // 노드가 아닌 원소를 전부 지나간다.
    for (const [name, document] of [
      ['대상이 null 뒤', afterNull()],
      ['null이 중첩', nestedNull()],
    ] as const) {
      expect(propOps(document, 'n_missing', 'content', 'x'), name).toBeNull()
      expect(removeNodeOps(document, 'n_missing'), name).toBeNull()
      expect(moveNodeOps(document, 'n_missing', 'n_root', 0), name).toBeNull()
    }
  })

  it('자손 판정도 서브트리에 노드가 아닌 원소가 있어도 던지지 않는다', () => {
    // `moveNodeOps`의 자손 판정은 **옮길 노드의 서브트리**를 훑는다 — 위 케이스들과
    // 다른 순회다.
    const document = doc({
      id: 'n_root',
      type: 'Page',
      children: [
        { id: 'n_box', type: 'Card', children: [null as unknown as WbNode] },
        { id: 'n_t', type: 'Text' },
      ],
    })

    expect(() => moveNodeOps(document, 'n_box', 'n_root', 1)).not.toThrow()
  })

  it('노드가 아닌 원소를 건너뛰어도 경로의 인덱스는 실제 자리다', () => {
    // **건너뛴 만큼 인덱스를 당기면 op이 다른 노드를 가리킨다.** `n_a`는 배열의 1번
    // 자리에 있고, `null`을 세지 않으면 0이 된다.
    const document = afterNull()

    expect(removeNodeOps(document, 'n_a')).toEqual([{ op: 'remove', path: '/root/children/1' }])
    // 왕복 대조 — 지운 뒤 남는 것이 `null` 하나다.
    expect(applied(document, removeNodeOps(document, 'n_a')).root.children).toEqual([null])
  })

  it('노드가 아닌 원소는 형제로 세지 않는다', () => {
    // `walkNodes`를 그대로 쓰면 `null`도 방문 대상이라 자손 판정·검색이 그것을 노드로
    // 본다. 여기서 재는 것은 검색이 그 원소를 **찾지 못한다**는 것이다.
    const document = afterNull()

    expect(propOps(document, 'n_root', 'x', 1)).not.toBeNull()
    expect(moveNodeOps(document, 'n_a', 'n_root', 0)).toEqual([
      { op: 'move', from: '/root/children/1', path: '/root/children/0' },
    ])
  })
})

/**
 * **`variantOps` — 경로를 가르는 자리.**
 *
 * `variant`는 props의 키가 아니라 **노드 봉투의 필드**다(설계서 「페이지 스키마 노드」). `propOps`를 재사용하면
 * `props` 안에 `variant`라는 키가 생겨 `z.strictObject`인 컴포넌트에서 `invalid-props`가
 * 되고, 그렇지 않은 곳에서는 **아무 데도 안 쓰이는 값이 조용히 저장된다.**
 */
describe('variantOps', () => {
  /** 루트 하나에 자식 하나. `variant`는 인자로 준 것만 붙인다. */
  function withVariant(variant?: string): PageDocument {
    return doc({
      id: 'n_root',
      type: 'Page',
      children: [
        { id: 'n_a', type: 'Card', props: { title: 'x' }, ...(variant === undefined ? {} : { variant }) },
      ],
    })
  }

  it('키가 있으면 replace다', () => {
    expect(variantOps(withVariant('default'), 'n_a', 'featured')).toEqual([
      { op: 'replace', path: '/root/children/0/variant', value: 'featured' },
    ])
  })

  it('키가 없으면 add다', () => {
    // `replace`를 주면 `applyOps`가 `바꿀 키가 없습니다`로 던지고 낙관적 적용이 편집을 삼킨다
    // (`propOps`의 가운데 갈래와 같은 원인).
    expect(variantOps(withVariant(), 'n_a', 'featured')).toEqual([
      { op: 'add', path: '/root/children/0/variant', value: 'featured' },
    ])
  })

  it('null이면 remove다 — replace null이 아니다', () => {
    // `WbNodeSchema.variant`가 `z.string().optional()`이라 `null`은 봉투 검증을 통과하지 못한다.
    expect(variantOps(withVariant('featured'), 'n_a', null)).toEqual([
      { op: 'remove', path: '/root/children/0/variant' },
    ])
  })

  it('그 근거 — replace null인 문서가 실제로 거절된다', () => {
    // **`edit/ops.ts`의 주석이 상태 코드를 적고 있다(422).** 그 근거가 되는 것은
    // `validatePage`가 내는 **코드와 severity**다 — `error`여야 설계서 「정방향 흐름」의 게이트가
    // 편집을 막는다(`warning`이면 통과한다). 산문으로만 두면 아무도 다시 재지 않는다.
    //
    // **그 자리는 `400`이 아니다** — 검증 게이트가 막는 것은 422다.
    const broken = applyOps(withVariant('default'), [
      { op: 'replace', path: '/root/children/0/variant', value: null },
    ])

    const issues = validatePage(broken)
    expect(issues.map((issue) => issue.code)).toEqual(['bad-document'])
    expect(issues[0]?.severity).toBe('error')
  })

  it('음성 대조 — remove한 문서는 통과한다', () => {
    const removed = applyOps(withVariant('default'), variantOps(withVariant('default'), 'n_a', null) ?? [])

    expect(validatePage(removed)).toEqual([])
  })

  it('없는 것을 지우려 하면 null이다 — 요청을 만들지 않는다', () => {
    expect(variantOps(withVariant(), 'n_a', null)).toBeNull()
  })

  it('문서에 없는 노드면 null이다', () => {
    expect(variantOps(withVariant('featured'), 'n_없음', 'default')).toBeNull()
  })

  it('경로가 /props/variant가 아니다 — 왕복으로 확인한다', () => {
    // **손으로 적은 경로 단언만으로는 부족하다.** 적용해서 값이 봉투에 들어가는지,
    // `props`가 그대로인지 함께 본다.
    const document = withVariant()
    const next = applyOps(document, variantOps(document, 'n_a', 'featured') ?? [])
    const node = findNode(next.root, 'n_a')

    expect(node?.variant).toBe('featured')
    expect(node?.props).toEqual({ title: 'x' })
  })

  it('서버가 만들 inverse를 여기서 재 둔다 — undo가 이 경로를 지난다', () => {
    // **`invertOps`가 `/variant`를 props와 다르게 다루지 않는다**(JSON Pointer 일반 처리다).
    // 서버는 `packages/schema`의 `invertOps`를 그대로 쓰므로(`apps/api/src/services/
    // edit-pipeline.ts`) 여기서 잰 값이 서버가 낼 값이다.
    const bare = withVariant()
    expect(invertOps(bare, variantOps(bare, 'n_a', 'featured') ?? [])).toEqual([
      { op: 'remove', path: '/root/children/0/variant' },
    ])

    const had = withVariant('default')
    expect(invertOps(had, variantOps(had, 'n_a', 'featured') ?? [])).toEqual([
      { op: 'replace', path: '/root/children/0/variant', value: 'default' },
    ])

    // 지우기의 역은 되살리기다 — 이것이 없으면 undo가 지운 변형을 못 돌려놓는다.
    expect(invertOps(had, variantOps(had, 'n_a', null) ?? [])).toEqual([
      { op: 'add', path: '/root/children/0/variant', value: 'default' },
    ])
  })

  it('inverse를 되적용하면 원래 문서로 돌아간다', () => {
    for (const [document, value] of [
      [withVariant(), 'featured'],
      [withVariant('default'), 'featured'],
      [withVariant('default'), null],
    ] as [PageDocument, string | null][]) {
      const ops = variantOps(document, 'n_a', value) ?? []
      const inverse = invertOps(document, ops)
      expect(applyOps(applyOps(document, ops), inverse)).toEqual(document)
    }
  })
})

/**
 * **`interactionsOps` — 상호작용은 노드 봉투의 필드다**(설계서 「페이지 스키마 노드」의
 * `{ id, type, props, variant, marker, interactions, children }`). 그래서 `variantOps`와
 * **같은 층**이고 경로도 한 단계 위다(`/…/interactions`, `/…/props/…`가 아니다).
 *
 * **코멘트와 다른 점:** 코멘트는 서버가 문서를 바꿔야 해서 따로 계약(`markerOps`)이
 * 있지만, **상호작용은 클라이언트가 바꾼다** — 이미 있는 낙관적 편집 경로를 그대로 탄다.
 *
 * **한 노드의 배열을 통째로 갈아 끼운다.** 액션 하나만 겨냥한 세밀한 op(`/…/interactions/0/
 * actions/1/prop`)을 만들지 않는 이유: 저작 UI가 하는 일이 *"이 노드의 규칙 목록을 이렇게
 * 바꾼다"*이고, 통째 `replace`의 `inverse`는 **앞 배열 하나**라 undo가 정확하다. 남의 편집을
 * 덮는 문제는 `baseSeq`의 낙관적 잠금이 409로 막는다.
 */
describe('interactionsOps', () => {
  /** 루트 하나에 자식 하나. `interactions`는 인자로 준 것만 붙인다. */
  function withInteractions(interactions?: Interaction[]): PageDocument {
    return doc({
      id: 'n_root',
      type: 'Page',
      children: [
        { id: 'n_a', type: 'Button', props: { label: '가' }, ...(interactions === undefined ? {} : { interactions }) },
      ],
    })
  }

  const RULE: Interaction = { on: 'click', actions: [{ type: 'setVisible', target: 'n_root', value: false }] }
  const OTHER: Interaction = { on: 'change', actions: [] }

  it('키가 있으면 replace다', () => {
    expect(interactionsOps(withInteractions([RULE]), 'n_a', [RULE, OTHER])).toEqual([
      { op: 'replace', path: '/root/children/0/interactions', value: [RULE, OTHER] },
    ])
  })

  it('키가 없으면 add다', () => {
    // `variantOps`와 같은 원인 — `replace`를 주면 `applyOps`가 `바꿀 키가 없습니다`로
    // 던지고 낙관적 적용이 편집을 삼킨다.
    expect(interactionsOps(withInteractions(), 'n_a', [RULE])).toEqual([
      { op: 'add', path: '/root/children/0/interactions', value: [RULE] },
    ])
  })

  /**
   * **빈 배열은 `remove`다.** 남기면 *"상호작용 없음"*의 표현이 두 벌(키 없음 / 빈 배열)이
   * 되고, 문서를 비교하는 자리마다 둘을 같게 다뤄야 한다. `WbNodeSchema.interactions`가
   * `.optional()`이라 키가 없는 것이 정상 상태다.
   */
  it('빈 배열을 주면 키를 지운다', () => {
    expect(interactionsOps(withInteractions([RULE]), 'n_a', [])).toEqual([
      { op: 'remove', path: '/root/children/0/interactions' },
    ])
  })

  it('지울 것이 없으면 null이다', () => {
    expect(interactionsOps(withInteractions(), 'n_a', [])).toBeNull()
  })

  it('문서에 없는 노드면 null이다', () => {
    expect(interactionsOps(withInteractions([RULE]), 'n_없음', [RULE])).toBeNull()
  })

  it('왕복 — 만든 ops를 적용하면 그 값이 실제로 들어간다', () => {
    const document = withInteractions()
    const next = applyOps(document, interactionsOps(document, 'n_a', [RULE]) ?? [])
    expect(findNode(next.root, 'n_a')?.interactions).toEqual([RULE])
    // 그 문서가 봉투 검증을 통과한다 — 통과하지 못하면 서버가 422로 거절한다.
    expect(validatePage(next).filter((issue) => issue.code === 'bad-document')).toEqual([])
  })

  it('지우면 키 자체가 사라진다', () => {
    const document = withInteractions([RULE])
    const next = applyOps(document, interactionsOps(document, 'n_a', []) ?? [])
    expect(Object.hasOwn(findNode(next.root, 'n_a') as object, 'interactions')).toBe(false)
  })

  it('inverse를 되적용하면 원래 문서로 돌아간다', () => {
    for (const [document, value] of [
      [withInteractions(), [RULE]],
      [withInteractions([RULE]), [RULE, OTHER]],
      [withInteractions([RULE]), []],
    ] as [PageDocument, Interaction[]][]) {
      const ops = interactionsOps(document, 'n_a', value) ?? []
      const inverse = invertOps(document, ops)
      expect(applyOps(applyOps(document, ops), inverse)).toEqual(document)
    }
  })
})
