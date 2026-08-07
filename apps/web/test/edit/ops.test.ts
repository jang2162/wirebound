// @vitest-environment node
/**
 * `propOps`의 계약. **순수 함수이고 React·DOM을 모른다** — 그래서 DOM 없는 환경에서 돈다
 * (`test/store/editor-store.test.ts`와 같은 이유).
 *
 * **왕복 대조가 이 파일의 핵심이다.** 경로를 손으로 적은 단언만 있으면 오프바이원을 못
 * 잡는다 — 만든 ops를 `applyOps`에 넣어 그 값이 실제로 들어가는지 본다.
 */
import { applyOps, invertOps, type PageDocument, type WbNode } from '@wirebound/schema'
import { describe, expect, it } from 'vitest'
import { propOps } from '../../src/edit/ops'

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
