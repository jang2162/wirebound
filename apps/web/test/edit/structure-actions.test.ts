// @vitest-environment node
/**
 * `structureAbilities`·`nodeSpot`의 계약. **화면 없이 돈다** — 판정이 컴포넌트 안에
 * 흩어지면 케이스가 화면을 지나야만 재진다(D3).
 *
 * **이 파일이 지키는 가장 무거운 것은 "던지지 않는다"이다.** 두 함수는 렌더 중에 불리고
 * 구조 트리에는 오류 경계가 없다 — 던지면 셸 전체가 흰 화면이다(`panels/node-shape.ts`
 * 머리말의 실측).
 */
import type { PageDocument, WbNode } from '@wirebound/schema'
import { describe, expect, it } from 'vitest'
import '../../src/catalog-setup'
import { nodeSpot, structureAbilities } from '../../src/edit/structure-actions'

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
    // 위 둘의 양성 대조다. 이것이 없으면 `moveUp`·`moveDown`을 항상 `false`로 굳힌
    // 구현도 통과한다.
    const abilities = structureAbilities(withSiblings(), 'n_mid')

    expect(abilities.moveUp).toBe(true)
    expect(abilities.moveDown).toBe(true)
  })

  it('앞 형제가 many면 들여쓸 수 있다', () => {
    // `n_last`의 앞 형제는 `n_mid`(Card)다.
    expect(structureAbilities(withSiblings(), 'n_last').indent).toBe(true)
  })

  it('앞 형제가 none이면 들여쓸 수 없다', () => {
    // **D3의 핵심 제약이다.** `n_mid`의 앞 형제는 `n_first`(Text)이고 자식을 담을 수
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

  it('카탈로그에 없는 타입은 안에 추가할 수 없다', () => {
    // 검증 전 문서가 스토어에 실린다(P2b-2). `getComponent`가 `undefined`를 준다.
    const document = doc({
      id: 'n_root',
      type: 'Page',
      children: [{ id: 'n_ghost', type: 'Nonexistent' }],
    })

    expect(structureAbilities(document, 'n_ghost').addInside).toBe(false)
  })

  it('카탈로그에 없는 타입도 지우고 옮길 수 있다', () => {
    // **계획서 D3의 산문 한 줄과 갈린 자리다 — 재서 갈랐다.** 계획서는 표 아래에
    // *"카탈로그에 없는 타입·모양이 깨진 노드는 전부 불가다"*라고 적었는데, 그렇게 하면
    // 사용자가 그 노드를 **치울 수단이 없어진다.**
    //
    // 실측: 카탈로그에 없는 타입의 노드가 하나라도 있으면 `validatePage`가
    // `unknown-type`을 내고, 편집 파이프라인 6단계가 그것을 `invalid`로 거절한다
    // (`apps/api/src/services/edit-pipeline.ts`). 다른 노드의 prop을 바꾸는 편집도,
    // 그 노드를 **옮기는** 편집도 이슈가 남는다 — **그 노드를 지우는 편집만 이슈가
    // 0이 된다.** 즉 삭제가 그 페이지를 다시 편집 가능하게 만드는 유일한 길이다.
    //
    // 계획서의 케이스 표도 좁은 해석과 맞는다 — 케이스 12는 `안에 추가`만 지목한다.
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
    // 아닌 노드가 스토어에 실린다는 것은 P2b-2가 확인했다.
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
    ]

    for (const { name, document, nodeId } of broken) {
      expect(() => structureAbilities(document, nodeId), name).not.toThrow()
      expect(() => nodeSpot(document, nodeId), name).not.toThrow()
    }
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

describe('nodeSpot', () => {
  it('부모와 인덱스를 낸다', () => {
    expect(nodeSpot(withSiblings(), 'n_last')).toEqual({
      parentId: 'n_root',
      index: 2,
      siblingCount: 3,
    })
  })

  it('깊은 노드의 자리도 낸다', () => {
    expect(nodeSpot(withGrandchild(), 'n_deep')).toEqual({
      parentId: 'n_box',
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
