// @vitest-environment node
/**
 * `structureAbilities`·`nodeSpot`의 계약. **화면 없이 돈다** — 판정이 컴포넌트 안에
 * 흩어지면 케이스가 화면을 지나야만 재진다.
 *
 * **이 파일이 지키는 가장 무거운 것은 "던지지 않는다"이다.** 두 함수는 렌더 중에 불리고
 * 구조 트리에는 오류 경계가 없다 — 던지면 셸 전체가 흰 화면이다(`panels/node-shape.ts`
 * 머리말의 실측).
 */
import type { PageDocument, WbNode } from '@wirebound/schema'
import { describe, expect, it } from 'vitest'
import '../../src/catalog-setup'
import { levelRefusals, nodeSpot, structureAbilities } from '../../src/edit/structure-actions'

function doc(root: WbNode): PageDocument {
  return { version: 1, root }
}

/**
 * 루트 밑에 형제 셋. 가운데(`n_mid`)가 `Card`(`many`)이고 양옆이 `Text`(`none`)다 —
 * 들여쓰기가 앞 형제의 `children`에 걸린다는 것을 한 문서에서 양쪽으로 잴 수 있다.
 */
function withSiblings(): PageDocument {
  return doc({
    id: 'n_root',
    type: 'Page',
    children: [
      { id: 'n_first', type: 'Text' },
      { id: 'n_mid', type: 'Card', children: [] },
      { id: 'n_last', type: 'Text' },
    ],
  })
}

/** 손자가 있는 문서. 내어쓰기(조부모가 있는가)를 재려면 깊이가 둘 필요하다. */
function withGrandchild(): PageDocument {
  return doc({
    id: 'n_root',
    type: 'Page',
    children: [
      {
        id: 'n_box',
        type: 'Card',
        children: [{ id: 'n_deep', type: 'Text' }],
      },
    ],
  })
}

/** 전부 `false`인 판정. "아무것도 못 한다"를 필드마다 적지 않으려고 둔다. */
const NOTHING = {
  addInside: false,
  addAfter: false,
  remove: false,
  moveUp: false,
  moveDown: false,
  indent: false,
  outdent: false,
}

describe('structureAbilities', () => {
  it('고른 것이 없으면 아무것도 못 한다', () => {
    expect(structureAbilities(withSiblings(), null)).toEqual(NOTHING)
  })

  it('문서가 없으면 아무것도 못 한다', () => {
    expect(structureAbilities(null, 'n_mid')).toEqual(NOTHING)
  })

  it('문서에 없는 노드면 아무것도 못 한다', () => {
    expect(structureAbilities(withSiblings(), 'n_missing')).toEqual(NOTHING)
  })

  it('루트는 안에만 추가할 수 있다', () => {
    // 루트를 지우면 문서가 통째로 깨지고(`removeNodeOps`의 실측), 형제가 없으니
    // 순서·계층 이동도 갈 곳이 없다.
    expect(structureAbilities(withSiblings(), 'n_root')).toEqual({
      ...NOTHING,
      addInside: true,
    })
  })

  it('children이 none인 타입에는 안에 추가할 수 없다', () => {
    expect(structureAbilities(withSiblings(), 'n_first').addInside).toBe(false)
  })

  it('children이 many인 타입에는 안에 추가할 수 있다', () => {
    expect(structureAbilities(withSiblings(), 'n_mid').addInside).toBe(true)
  })

  it('첫 형제는 위로 못 간다', () => {
    const abilities = structureAbilities(withSiblings(), 'n_first')

    expect(abilities.moveUp).toBe(false)
    expect(abilities.moveDown).toBe(true)
  })

  it('막내는 아래로 못 간다', () => {
    const abilities = structureAbilities(withSiblings(), 'n_last')

    expect(abilities.moveDown).toBe(false)
    expect(abilities.moveUp).toBe(true)
  })

  it('가운데 형제는 위아래로 다 갈 수 있다', () => {
    // 위 둘의 양성 대조다.
    //
    // *"이것이 없으면 항상 `false`로 굳힌 구현도 통과한다"*가 **아니다** — 이 케이스를
    // 빼도 그 변이는 앞 두 케이스(`첫 형제는 위로 못 간다`·`막내는 아래로 못 간다`)에서
    // 죽는다. 두 케이스가 각각 **반대 방향까지** 단언하기 때문이다. 이 케이스가 더하는
    // 것은 "한 노드에서 둘이 동시에 참"이라는 자리 하나다.
    const abilities = structureAbilities(withSiblings(), 'n_mid')

    expect(abilities.moveUp).toBe(true)
    expect(abilities.moveDown).toBe(true)
  })

  it('앞 형제가 many면 들여쓸 수 있다', () => {
    // `n_last`의 앞 형제는 `n_mid`(Card)다.
    expect(structureAbilities(withSiblings(), 'n_last').indent).toBe(true)
  })

  it('앞 형제가 none이면 들여쓸 수 없다', () => {
    // **들여쓰기의 핵심 제약이다.** `n_mid`의 앞 형제는 `n_first`(Text)이고 자식을 담을 수
    // 없다 — 들여쓰면 그 문서는 `children-not-allowed`로 검증에 걸린다.
    expect(structureAbilities(withSiblings(), 'n_mid').indent).toBe(false)
  })

  it('첫 형제는 들여쓸 수 없다', () => {
    // 앞 형제가 아예 없다. `n_first`가 `Text`라서가 아니라는 것은 위 케이스와 갈린다.
    expect(structureAbilities(withSiblings(), 'n_first').indent).toBe(false)
  })

  it('부모가 루트면 내어쓸 수 없다', () => {
    // 나갈 곳이 문서 밖이다.
    expect(structureAbilities(withSiblings(), 'n_mid').outdent).toBe(false)
  })

  it('부모가 루트가 아니면 내어쓸 수 있다', () => {
    // 위 케이스의 양성 대조. `n_deep`의 부모는 `n_box`이고 그 위에 루트가 있다.
    expect(structureAbilities(withGrandchild(), 'n_deep').outdent).toBe(true)
  })

  it('루트와 같은 id를 가진 부모도 루트가 아니다', () => {
    // **참조 비교(`parent !== document.root`)가 id 비교와 갈리는 자리다.** 인과가 성립한다 —
    // 검증 전 문서에는 id가 중복된 노드가 올 수 있고(`validatePage`의 `duplicate-id`가
    // 검증에서 그것을 잡는다는 것이 곧 그런 문서가 존재한다는 뜻이다), id로 비교하면
    // 이 노드의 부모가 루트로 오판된다.
    const document = doc({
      id: 'n_root',
      type: 'Page',
      children: [{ id: 'n_root', type: 'Card', children: [{ id: 'n_deep', type: 'Text' }] }],
    })

    expect(structureAbilities(document, 'n_deep').outdent).toBe(true)
  })

  it('카탈로그에 없는 타입은 안에 추가할 수 없다', () => {
    // 검증 전 문서가 스토어에 실린다. `getComponent`가 `undefined`를 준다.
    const document = doc({
      id: 'n_root',
      type: 'Page',
      children: [{ id: 'n_ghost', type: 'Nonexistent' }],
    })

    expect(structureAbilities(document, 'n_ghost').addInside).toBe(false)
  })

  it('카탈로그에 없는 타입도 지우고 옮길 수 있다', () => {
    // *"카탈로그에 없는 타입·모양이 깨진 노드는 전부 불가다"*로 두면 사용자가 그 노드를
    // **치울 수단이 없어진다.**
    //
    // 실측: 카탈로그에 없는 타입의 노드가 하나라도 있으면 `validatePage`가
    // `unknown-type`을 내고, 편집 파이프라인 6단계가 그것을 `invalid`로 거절한다
    // (`apps/api/src/services/edit-pipeline.ts`). 다른 노드의 prop을 바꾸는 편집도,
    // 그 노드를 **옮기는** 편집도, 무관한 노드를 지우는 편집도 이슈가 남는다.
    //
    // **이슈를 0으로 만드는 것은 그 노드를 문서에서 없애는 편집이다** — 그 노드를 지우는
    // 편집뿐 아니라 **조상 삭제도 0**이다. 삭제가 탈출구다.
    //
    // 그래서 **카탈로그를 보는 조작(`addInside`·`indent`)만 타입에 걸고**, 자리만
    // 보는 조작은 자리로 판정한다. `removeNodeOps`·`moveNodeOps`는 타입을 읽지 않는다.
    const document = doc({
      id: 'n_root',
      type: 'Page',
      children: [
        { id: 'n_ghost', type: 'Nonexistent' },
        { id: 'n_ok', type: 'Text' },
      ],
    })
    const abilities = structureAbilities(document, 'n_ghost')

    expect(abilities.remove).toBe(true)
    expect(abilities.moveDown).toBe(true)
    expect(abilities.addAfter).toBe(true)
  })

  it('앞 형제가 카탈로그에 없으면 들여쓸 수 없다', () => {
    // 들여쓰기는 **앞 형제의** `children`을 보므로 타입을 모르면 판정할 수 없다.
    const document = doc({
      id: 'n_root',
      type: 'Page',
      children: [
        { id: 'n_ghost', type: 'Nonexistent' },
        { id: 'n_ok', type: 'Text' },
      ],
    })

    expect(structureAbilities(document, 'n_ok').indent).toBe(false)
  })

  it('모양이 깨진 노드도 던지지 않는다', () => {
    // **이 케이스가 방어선이다.** 이 함수는 렌더 중에 불리고 구조 트리에는 오류 경계가
    // 없다 — 던지면 셸 전체가 흰 화면이다. `type`이 객체이거나 `children`이 배열이
    // 아닌 노드도 스토어에 실린다(검증 전 문서가 실린다).
    const broken: { name: string; document: PageDocument; nodeId: string }[] = [
      {
        name: 'type이 객체',
        document: doc({
          id: 'n_root',
          type: 'Page',
          children: [{ id: 'n_bad', type: { nope: 1 } as unknown as string }],
        }),
        nodeId: 'n_bad',
      },
      {
        name: 'children이 문자열',
        document: doc({
          id: 'n_root',
          type: 'Page',
          children: [{ id: 'n_bad', type: 'Card', children: 'nope' as unknown as WbNode[] }],
        }),
        nodeId: 'n_bad',
      },
      {
        name: '루트의 children이 문자열',
        document: doc({ id: 'n_root', type: 'Page', children: 'nope' as unknown as WbNode[] }),
        nodeId: 'n_root',
      },
      {
        name: '루트의 type이 객체',
        document: doc({ id: 'n_root', type: { nope: 1 } as unknown as string, children: [] }),
        nodeId: 'n_root',
      },
      {
        name: '루트가 없다',
        document: { version: 1 } as unknown as PageDocument,
        nodeId: 'n_root',
      },
      {
        name: '루트가 null이다',
        document: { version: 1, root: null } as unknown as PageDocument,
        nodeId: 'n_root',
      },
      // **아래 넷은 `children` 배열의 원소 자체가 노드가 아닌 모양이다** — 위 여섯은
      // "노드의 필드가 깨진" 모양만 덮는다. 방어선이 없으면 대상이 그 원소보다 **뒤**에
      // 있을 때만 던진다 — 앞에 있으면 순회가 닿기 전에 반환한다.
      {
        name: 'children에 null 원소 (대상보다 앞)',
        document: doc({
          id: 'n_root',
          type: 'Page',
          children: [null as unknown as WbNode, { id: 'n_a', type: 'Text' }],
        }),
        nodeId: 'n_a',
      },
      {
        name: 'children에 null 원소 (중첩)',
        document: doc({
          id: 'n_root',
          type: 'Page',
          children: [
            { id: 'n_box', type: 'Card', children: [null as unknown as WbNode] },
            { id: 'n_a', type: 'Text' },
          ],
        }),
        nodeId: 'n_a',
      },
      {
        name: 'children에 undefined 원소',
        document: doc({
          id: 'n_root',
          type: 'Page',
          children: [undefined as unknown as WbNode, { id: 'n_a', type: 'Text' }],
        }),
        nodeId: 'n_a',
      },
      {
        name: '없는 노드를 찾아 순회가 끝까지 간다',
        document: doc({
          id: 'n_root',
          type: 'Page',
          children: [null as unknown as WbNode, { id: 'n_a', type: 'Text' }],
        }),
        nodeId: 'n_missing',
      },
    ]

    for (const { name, document, nodeId } of broken) {
      expect(() => structureAbilities(document, nodeId), name).not.toThrow()
      expect(() => nodeSpot(document, nodeId), name).not.toThrow()
    }
  })

  it('노드가 아닌 원소를 건너뛰어도 인덱스는 실제 자리다', () => {
    // **건너뛴 만큼 인덱스를 당기면 `nodeSpot`이 낸 값으로 만든 op이 다른 노드를
    // 가리킨다.** `n_a`는 배열의 1번 자리다.
    const document = doc({
      id: 'n_root',
      type: 'Page',
      children: [null as unknown as WbNode, { id: 'n_a', type: 'Text' }],
    })

    expect(nodeSpot(document, 'n_a')).toEqual({ parentId: 'n_root', zone: 'body', index: 1, siblingCount: 2 })
    // 앞에 원소가 하나 있으므로 위로 갈 수 있다고 판정한다 — 그 자리가 `null`이어도
    // `moveNodeOps`가 만드는 것은 배열 안의 자리 이동이라 성립한다.
    expect(structureAbilities(document, 'n_a').moveUp).toBe(true)
  })

  it('type이 객체인 노드는 안에 추가할 수 없고 지울 수는 있다', () => {
    // 위 케이스는 "던지지 않는다"만 본다. 판정 값까지 고정하지 않으면 전부 `true`를
    // 내는 구현도 통과한다.
    const document = doc({
      id: 'n_root',
      type: 'Page',
      children: [{ id: 'n_bad', type: { nope: 1 } as unknown as string }],
    })
    const abilities = structureAbilities(document, 'n_bad')

    expect(abilities.addInside).toBe(false)
    expect(abilities.remove).toBe(true)
  })

  it('children이 배열이 아닌 노드는 안에 추가할 수 없다', () => {
    // 카탈로그는 `Card`라 `many`지만 문서의 `children`이 배열이 아니다. 여기에 넣는
    // 편집은 `insertNodeOps`가 `null`로 막으므로(그쪽 실측), 버튼을 열어 두면
    // 눌러도 아무 일이 없는 자리가 된다.
    const document = doc({
      id: 'n_root',
      type: 'Page',
      children: [{ id: 'n_bad', type: 'Card', children: 'nope' as unknown as WbNode[] }],
    })

    expect(structureAbilities(document, 'n_bad').addInside).toBe(false)
  })
})

describe('levelRefusals — 들여쓰기 · 내어쓰기가 갈 자리의 받는 타입 · 설 자리(리뷰 RV-ZE H1)', () => {
  /** 탭 둘 · 그 안 글, 카드 안 글, 카탈로그에 없는 타입이 든 카드. */
  const tabs = (): PageDocument =>
    doc({
      id: 'n_root',
      type: 'Page',
      children: [
        {
          id: 'n_tabs',
          type: 'Tabs',
          children: [
            { id: 'n_tp1', type: 'TabPanel', children: [{ id: 'n_t1', type: 'Text' }] },
            { id: 'n_tp2', type: 'TabPanel', children: [] },
          ],
        },
        {
          id: 'n_card',
          type: 'Card',
          children: [
            { id: 'n_k', type: 'Text' },
            { id: 'n_ghost', type: 'Nonexistent' },
          ],
        },
      ],
    })

  it('갈 자리가 그 노드를 안 받으면 다른 입구와 같은 문장이고 판정이 꺼진다 — 받으면 `null` 이고 켜진다', () => {
    const document = tabs()
    const of = (id: string) => ({ ...levelRefusals(document, id), on: structureAbilities(document, id) })
    expect({ t1: of('n_t1'), tp2: of('n_tp2'), k: of('n_k') }).toEqual({
      // 탭 패널 안 글의 내어쓰기는 탭 몸통이다(탭 패널만 받는다).
      t1: { indent: null, outdent: '탭에는 탭 패널만 놓을 수 있습니다', on: expect.objectContaining({ indent: false, outdent: false }) },
      // 탭 패널의 들여쓰기는 앞 탭 패널의 몸통 · 내어쓰기는 뿌리 몸통이다(탭 패널은 탭 안에만 선다).
      tp2: {
        indent: '탭 패널은 탭 안에만 놓을 수 있습니다',
        outdent: '탭 패널은 탭 안에만 놓을 수 있습니다',
        on: expect.objectContaining({ indent: false, outdent: false }),
      },
      k: { indent: null, outdent: null, on: expect.objectContaining({ indent: false, outdent: true }) },
    })
  })

  it('카탈로그에 없는 타입은 받는 타입 · 설 자리 판정에 안 걸린다 — 자리로만 판정한다(치울 길을 막지 않는다)', () => {
    expect(levelRefusals(tabs(), 'n_ghost')).toEqual({ indent: null, outdent: null })
    expect(structureAbilities(tabs(), 'n_ghost').outdent).toBe(true)
  })

  it('없는 노드 · 루트 · 고른 것 없음 · 문서 없음은 둘 다 `null` 이다', () => {
    expect([
      levelRefusals(tabs(), 'n_none'),
      levelRefusals(tabs(), 'n_root'),
      levelRefusals(tabs(), null),
      levelRefusals(null, 'n_t1'),
    ]).toEqual(Array(4).fill({ indent: null, outdent: null }))
  })
})

describe('nodeSpot', () => {
  it('부모와 인덱스를 낸다', () => {
    expect(nodeSpot(withSiblings(), 'n_last')).toEqual({
      parentId: 'n_root',
      zone: 'body',
      index: 2,
      siblingCount: 3,
    })
  })

  it('구역 안 노드는 그 구역 · 그 구역 안의 자리 · 그 구역의 형제 수를 낸다 — 몸통과 섞어 세지 않는다', () => {
    const document: PageDocument = {
      version: 4,
      root: {
        id: 'n_root',
        type: 'Page',
        children: [
          {
            id: 'n_card',
            type: 'Card',
            children: [{ id: 'n_body', type: 'Text' }],
            zones: {
              headEnd: [
                { id: 'n_x', type: 'Button' },
                { id: 'n_y', type: 'Button' },
              ],
            },
          },
        ],
      },
    }
    expect(nodeSpot(document, 'n_y')).toEqual({ parentId: 'n_card', zone: 'headEnd', index: 1, siblingCount: 2 })
    expect(nodeSpot(document, 'n_body')).toEqual({ parentId: 'n_card', zone: 'body', index: 0, siblingCount: 1 })
  })

  it('깊은 노드의 자리도 낸다', () => {
    expect(nodeSpot(withGrandchild(), 'n_deep')).toEqual({
      parentId: 'n_box',
      zone: 'body',
      index: 0,
      siblingCount: 1,
    })
  })

  it('루트의 nodeSpot은 null이다', () => {
    expect(nodeSpot(withSiblings(), 'n_root')).toBeNull()
  })

  it('없는 노드면 null이다', () => {
    expect(nodeSpot(withSiblings(), 'n_missing')).toBeNull()
  })

  it('부모 id가 문자열이 아니면 null이다', () => {
    // `parentId`는 그대로 `moveNodeOps`·`insertNodeOps`에 들어가 `findNodePath`의
    // 검색 키가 된다. 문자열이 아니면 그 조회가 아무것도 찾지 못하므로 여기서 끊는다.
    const document = doc({
      id: { nope: 1 } as unknown as string,
      type: 'Page',
      children: [{ id: 'n_a', type: 'Text' }],
    })

    expect(nodeSpot(document, 'n_a')).toBeNull()
  })
})
