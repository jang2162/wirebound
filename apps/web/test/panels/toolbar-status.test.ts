/**
 * **도구모음 아래 상태줄의 문안 — 상태마다 무엇이 나오는가.**
 *
 * 재는 것은 `panels/toolbar-status.ts`의 두 순수 함수다. 그 파일이 값을 갖는 이유는
 * *"비활성 버튼의 이유가 `title`에만 있어 키보드·터치에서는 영영 안 보인다"*이고,
 * **어려운 부분은 이유를 하나로 좁히는 것**이다(꺼진 것이 여섯이면 이유도 여섯이다).
 * 그래서 이 파일이 잠그는 것은 *"문장이 나온다"*가 아니라 **어느 상태에서 어느 문장이
 * 나오고 어느 것이 안 나오는가** — 즉 사다리의 순서다.
 *
 * # `abilities`를 손으로 적지 않는다
 *
 * 불리언 일곱을 손으로 채우면 **실제로 도달하지 않는 조합**을 재게 된다. 예를 들어
 * `{ addAfter: false, remove: false, addInside: true }`는 손으로는 쉽게 적히지만
 * `structureAbilities`가 그 값을 내는 자리는 **루트 하나뿐**이고, 그것을 모른 채 케이스를
 * 적으면 사다리의 순서가 틀려도 안 죽는다.
 *
 * **그래서 문서와 트리를 짓고 진짜 판정 함수를 지난다** — `structureAbilities`와
 * `treeAbilities`가 그것이다. 케이스의 제목이 *"루트"*·*"잎"*이면 진짜로 그 자리의
 * 노드를 고른다. 카탈로그를 부르는 판정(`addInside`·`indent`)이 있으므로
 * `catalog-setup`을 들인다.
 *
 * # 이 파일이 보지 못하는 것
 *
 * - **화면에 서는지는 안 본다.** 그 줄이 실제로 서는지, `aria-describedby`가 활성 버튼에
 *   걸리는지, 알림 채널을 안 쓰는지는 셸을 지나는 셋이 잰다 —
 *   `./structure-toolbar.test.tsx`(구조) · `./menu-crud.test.tsx`(메뉴·`busy`) ·
 *   `../lock/soft-lock.test.tsx`(잠긴 조상). 자리를 지키는 CSS 값은
 *   `../shell-css-status.test.ts`다. 여기는 문안뿐이다.
 * - **잠금 판정은 안 재고 받는다.** `lock`은 `store.lockedBy`가 낸 값이고 그 판정은
 *   `store/editor-store.test.ts`(*"밖에서 온 루트 잠금"*)와
 *   `packages/schema/test/lock.test.ts`가 갖는다.
 */
import { describe, expect, it } from 'vitest'
import type { NodeLock, PageDocument, WbNode } from '@wirebound/schema'
import type { TreeMenuNode } from '../../src/api/types'
import { structureAbilities } from '../../src/edit/structure-actions'
import { treeAbilities, type TreeSelection } from '../../src/tree/tree-actions'
import { menuStatus, structureStatus } from '../../src/panels/toolbar-status'
import '../../src/catalog-setup'

/**
 * ```
 * n-root (Page)             루트 — 페이지를 열면 여기가 고른 자리다
 * ├ n-a    (Text)           잎이자 맏이 — 자식을 못 담고 `moveUp`만 꺼진다
 * ├ n-box  (Card)           가운데 컨테이너 — 들여·내어만 꺼진다(말하지 않는 자리)
 * │  ├ n-p    (Section)     **앞 형제가 컨테이너**라 뒤엣것의 들여쓰기를 연다
 * │  │  └ n-solo (Card)     외동 **컨테이너** — 순서 문장이 나오는 자리
 * │  │       └ n-leaf (Button)  외동 **잎** — 잎이 외동을 이기는 자리
 * │  ├ n-full (Card)        **일곱이 다 켜지는 자리**
 * │  └ n-q    (Text)        막내
 * └ n-c    (Divider)        잎이자 막내
 * ```
 *
 * **형제를 셋 둔 것이 요점이다.** 둘이면 *"맨 앞"*과 *"맨 뒤"*가 같은 노드에 겹쳐,
 * `moveUp`·`moveDown` 중 하나만 꺼진 상태(= 사다리가 **말하지 않아야 하는** 상태)를
 * 만들 수 없다.
 *
 * **깊이가 셋인 것도 요점이다 — 이것을 얕게 지으면 "다 켜진 자리"가 이 문서에 없다.**
 * 일곱이 다 켜지려면 넷이 동시에 서야 한다: 부모가 루트가 아니고(`outdent`), **앞 형제가
 * 자식을 담을 수 있고**(`indent`), 앞뒤로 형제가 있고(`moveUp`·`moveDown`), 자기가
 * 컨테이너다(`addInside`). 루트의 자식만으로는 `outdent`가 영영 꺼져 있다.
 *
 * **외동 자리를 둘로 나눈 것도 그래서다.** 외동이 **잎**이면 잎 문장이 이기므로
 * (사다리 규칙 1), 순서 문장이 나오는 자리를 재려면 외동이 **컨테이너**여야 한다.
 * `n-solo`·`n-leaf`가 그 둘을 각각 맡는다 — 하나만 두면 사다리의 그 순서가 안 재진다.
 */
function doc(): PageDocument {
  const root: WbNode = {
    id: 'n-root',
    type: 'Page',
    children: [
      { id: 'n-a', type: 'Text' },
      {
        id: 'n-box',
        type: 'Card',
        children: [
          {
            id: 'n-p',
            type: 'Section',
            children: [
              { id: 'n-solo', type: 'Card', children: [{ id: 'n-leaf', type: 'Button' }] },
            ],
          },
          { id: 'n-full', type: 'Card' },
          { id: 'n-q', type: 'Text' },
        ],
      },
      { id: 'n-c', type: 'Divider' },
    ],
  }
  return { version: 1, root }
}

/**
 * 그 노드를 고른 상태의 상태줄 문안. 잠금은 기본이 없음이다.
 *
 * **잠금을 `structureAbilities`에도 넘긴다** — 화면에서 그 둘은 같은 값을 지나므로
 * (`panels/structure-toolbar.tsx`의 `useStructureCommands`), 여기서 상태줄에만 주면
 * **도달하지 않는 조합**(잠겼는데 판정은 켜져 있다)을 재게 된다.
 */
function statusOf(
  nodeId: string | null,
  lock: NodeLock | null = null,
  pageLock: NodeLock | null = null,
): string {
  const document = doc()
  return structureStatus({
    selectedNodeId: nodeId,
    isRoot: nodeId !== null && document.root.id === nodeId,
    lock,
    pageLock,
    abilities: structureAbilities(document, nodeId, lock),
  })
}

/**
 * ```
 * mn-1 관리자   pages: pg-1 회원목록, pg-2 회원상세
 * │ └ mn-1-1 회원   (자식 없음, 페이지 없음) — 외동
 * mn-2 포털     pages: pg-3 홈
 * mn-3 설정     비었다 · 형제가 둘 — **메뉴 쪽의 "할 말이 없는" 자리**
 * ```
 * **메뉴가 둘 이상인 것이 `reparent`의 전제다**(하나면 옮길 곳이 없어 페이지에서도 꺼진다).
 *
 * **`mn-3`이 따로 있는 이유가 있다.** 메뉴 쪽에서 아무 말도 하지 않으려면 **비어 있고**
 * (`remove`가 열린다) **형제가 있어야** 한다(순서 문장이 안 나온다). `mn-1-1`은 비었지만
 * 외동이고 `mn-2`는 형제가 있지만 페이지를 가졌다 — 둘 다 자기 문장이 나온다. 그 둘만
 * 두면 *"할 말이 없는 상태"*가 이 트리에 없다.
 */
function tree(): TreeMenuNode[] {
  return [
    {
      id: 'mn-1',
      title: '관리자',
      sortOrder: 0,
      pages: [
        { id: 'pg-1', title: '회원 목록', sortOrder: 0 },
        { id: 'pg-2', title: '회원 상세', sortOrder: 1 },
      ],
      children: [{ id: 'mn-1-1', title: '회원', sortOrder: 0, pages: [], children: [] }],
    },
    {
      id: 'mn-2',
      title: '포털',
      sortOrder: 1,
      pages: [{ id: 'pg-3', title: '홈', sortOrder: 0 }],
      children: [],
    },
    { id: 'mn-3', title: '설정', sortOrder: 2, pages: [], children: [] },
  ]
}

/** 그것을 고른 상태의 메뉴 상태줄 문안. `busy`는 기본이 `false`다. */
function menuStatusOf(selection: TreeSelection | null, busy = false): string {
  return menuStatus({ selection, busy, abilities: treeAbilities(tree(), selection) })
}

describe('구조 상태줄 — 고른 것이 무엇이라서 그런가', () => {
  it('아무것도 안 고르면 고르라고 말한다', () => {
    expect(statusOf(null)).toBe('트리에서 노드를 고르면 편집할 수 있습니다')
  })

  /**
   * **가장 흔한 자리다** — 페이지를 열면 스토어가 루트를 고른 채 시작한다
   * (`store/editor-store.ts`의 `#selectionFor`). 첫 화면의 회색이 여기서 나온다.
   */
  it('루트면 삭제·순서·계층을 못 바꾼다고 말한다', () => {
    expect(statusOf('n-root')).toBe('루트라 삭제·순서·계층을 바꿀 수 없습니다')
  })

  it('자식을 못 담는 잎이면 타입을 말한다', () => {
    expect(statusOf('n-a')).toBe('자식을 담지 못하는 타입입니다')
  })

  it('형제가 없으면 순서를 못 바꾼다고 말한다', () => {
    // **외동이면서 컨테이너인 자리다.** 외동이 잎이면 잎 문장이 이기므로(아래 사다리
    // 케이스), 여기서 `n-leaf`를 쓰면 이 케이스는 순서 문장을 재지 못한다.
    const abilities = structureAbilities(doc(), 'n-solo')
    expect([abilities.moveUp, abilities.moveDown, abilities.addInside]).toEqual([false, false, true])
    expect(statusOf('n-solo')).toBe('형제가 없어 순서를 바꿀 수 없습니다')
  })

  /**
   * **사다리 규칙 1 — 화면에 단서가 없는 쪽이 위다.** 형제가 없다는 것은 트리를 보면
   * 보이지만, 카탈로그가 자식을 막는다는 것은 **어디에도 안 보인다.** 순서를 뒤집으면
   * 이 케이스가 죽는다.
   */
  it('외동이면서 잎이면 잎 문장이 이긴다', () => {
    const abilities = structureAbilities(doc(), 'n-leaf')
    expect([abilities.moveUp, abilities.moveDown, abilities.addInside]).toEqual([
      false,
      false,
      false,
    ])
    expect(statusOf('n-leaf')).toBe('자식을 담지 못하는 타입입니다')
  })

  /**
   * **빈 문자열이지 문장이 아니다.** 상시 보이는 자리에 *"모두 쓸 수 있습니다"*를 두면
   * 정작 말할 것이 생겼을 때 눈이 그 자리를 이미 무시하고 있다.
   */
  it('다 켜져 있으면 아무 말도 하지 않는다', () => {
    const abilities = structureAbilities(doc(), 'n-full')
    // 전제를 값으로 못박는다 — 이것이 거짓이면 위 단언은 "다 켜진 상태"를 재지 않는다.
    // (`n-box`로는 안 된다: 부모가 루트라 `outdent`가, 앞 형제가 `Text`라 `indent`가 꺼진다.)
    expect(Object.values(abilities).every(Boolean)).toBe(true)
    expect(statusOf('n-full')).toBe('')
  })

  /**
   * **일부가 꺼져도 말하지 않는 자리가 있다.** `n-box`는 들여·내어가 꺼져 있지만
   * (부모가 루트 · 앞 형제가 잎) 그 둘은 **버튼 하나씩만** 죽인다 — 무리가 통째로 죽은
   * 것이 아니다. 이유는 그 버튼들의 `title`에 남는다.
   *
   * **이 케이스가 위의 "다 켜짐"과 다른 것을 잰다:** 저쪽은 *"할 말이 없으면 비운다"*이고
   * 이쪽은 *"꺼진 것이 있어도 무리가 아니면 안 말한다"*이다. 저것만 있으면 사다리에
   * `outdent`·`indent` 문장을 더해도 안 죽는다.
   */
  it('들여·내어만 꺼진 것은 말하지 않는다', () => {
    const abilities = structureAbilities(doc(), 'n-box')
    expect([abilities.indent, abilities.outdent]).toEqual([false, false])
    expect(statusOf('n-box')).toBe('')
  })

  /**
   * **말하지 않는 것도 계약이다.** `n-a`는 맏이라 `moveUp`이 꺼져 있지만, 무리(위로·아래로)가
   * 통째로 죽은 것이 아니므로 순서 문장을 띄우지 않는다 — 띄우면 선택을 옮길 때마다 문장이
   * 바뀌어 줄이 깜빡이고, 맨 앞·맨 뒤는 **트리를 보면 보인다.**
   */
  it('한쪽 순서만 꺼진 것은 말하지 않는다 — 무리가 통째로 죽었을 때만이다', () => {
    // **컨테이너로 잰다.** `n-a`(잎)로 재면 잎 문장이 먼저 이겨 버려 이 규칙이 안 재진다 —
    // `&&`를 `||`로 바꾸는 변조가 그때 **살아남는다**(실측: 0 사망). `n-p`는 자식을 담을 수
    // 있으므로 사다리가 순서 문장까지 내려오고, 거기서 *"통째로"*가 실제로 판정된다.
    const abilities = structureAbilities(doc(), 'n-p')
    expect([abilities.addInside, abilities.moveUp, abilities.moveDown]).toEqual([true, false, true])
    expect(statusOf('n-p')).toBe('')

    // 잎 쪽도 함께 둔다 — 이쪽이 재는 것은 *"순서보다 타입이 먼저"*다.
    expect(structureAbilities(doc(), 'n-a').moveUp).toBe(false)
    expect(statusOf('n-a')).toBe('자식을 담지 못하는 타입입니다')
  })

  it('문서에 없는 노드를 고르고 있으면 그렇게 말한다', () => {
    expect(statusOf('n-gone')).toBe('고른 노드가 문서에 없습니다')
  })
})

describe('구조 상태줄 — 잠금이 사다리의 맨 위다', () => {
  const LOCK: NodeLock = { nodeId: 'n-1', userId: 'u-bora', userName: '보라' }

  /**
   * **배지가 안 붙는 자리다.** 잠긴 노드 **자신**에게는 트리 줄에 *"보라 편집 중"*
   * 배지가 붙지만(`panels/structure-tree.tsx`), 막히는 것은 그 **서브트리 전체**다 —
   * 자동 선택된 루트는 문서 안 모든 노드의 조상이라, 남이 아무 노드나 잡으면 루트 줄이
   * `aria-current`인 채 회색이 된다. 상태줄이 말하지 않으면 **그 이유가 화면 어디에도 없다.**
   */
  it('루트가 남의 잠금에 막히면 이름을 말한다 — 배지가 안 붙는 자리다', () => {
    expect(statusOf('n-root', LOCK)).toBe('보라님이 편집 중이라 고를 수도 바꿀 수도 없습니다')
  })

  /**
   * **순서가 뒤집히면 이 케이스가 죽는다.** 루트 문장이 이겨 버리면 *"왜 회색인가"*의 답이
   * 틀린다 — 루트는 늘 루트였고 방금 바뀐 것은 잠금이다.
   */
  it('루트 문장보다 잠금이 먼저다', () => {
    expect(statusOf('n-root', LOCK)).not.toBe(statusOf('n-root'))
  })

  it('잠금은 잎의 타입 문장보다도 먼저다', () => {
    expect(statusOf('n-a', LOCK)).toBe('보라님이 편집 중이라 고를 수도 바꿀 수도 없습니다')
  })

  /**
   * **판정이 잠금을 보므로 생기는 조합이다.** 잠기면 `structureAbilities`가
   * `NOTHING`을 내므로 `addAfter`·`remove`가 둘 다 `false`인데, 그 값은 사다리의 아래
   * 칸이 *"고른 노드가 문서에 없습니다"*로 읽는 값과 **같다**. 순서를 뒤집으면 잠긴
   * 자리에서 없는 노드 이야기가 나온다 — 그 노드는 문서에 있다.
   */
  it('잠금이 «문서에 없다»보다 먼저다 — 잠기면 판정이 그쪽과 같은 값이 된다', () => {
    const abilities = structureAbilities(doc(), 'n-p', LOCK)
    expect(abilities.addAfter).toBe(false)
    expect(abilities.remove).toBe(false)

    expect(statusOf('n-p', LOCK)).toBe('보라님이 편집 중이라 고를 수도 바꿀 수도 없습니다')
  })

  it('잠금 소유자 이름을 그대로 싣는다 — 하드코딩이 아니다', () => {
    const other: NodeLock = { nodeId: 'n-1', userId: 'u-dahye', userName: '다혜' }
    expect(statusOf('n-root', other)).toBe('다혜님이 편집 중이라 고를 수도 바꿀 수도 없습니다')
  })

  /**
   * **맨 위는 잠금이 아니라 "고른 것이 없다"이다.** 고른 것이 없으면 막힐 자리도 없으므로
   * 남의 잠금을 말할 것이 없다 — 그때 이름을 띄우면 **없는 관계**를 말하게 된다.
   * (`store.lockedBy`가 선택 id를 받으므로 화면에서 이 조합은 오지 않는다. 순수 함수는
   * 그 보장을 모르므로 여기서 값으로 고정한다.)
   */
  it('고른 것이 없으면 잠금보다 그쪽이 먼저다', () => {
    expect(statusOf(null, LOCK)).toBe('트리에서 노드를 고르면 편집할 수 있습니다')
  })
})

/**
 * **«안 골랐다» 칸이 둘로 갈린다.**
 *
 * 고른 것이 없어도 쓸 수 있는 조작이 둘 있고(`패턴 넣기`·`프리셋`) 그 둘은 **페이지에
 * 남의 잠금이 하나라도 있으면 함께 꺼진다.** 그래서 그 상태에서는 **도구 아홉이 전부
 * 회색이다.** 그때도 *"고르면 편집할 수 있습니다"* 하나만 말하면, 페이지 전체가 잠긴
 * 판에서는 **고를 수 있는 줄이 하나도 없는데** 고르라고 말하게 된다(셸을 띄워 잰 표가
 * `panels/toolbar-status.ts` 머리말에 있다).
 *
 * **`lock`과 `pageLock`은 다른 값이다.** 위 묶음의 마지막 케이스가 재는 것은 `lock`이고
 * (선택이 없으면 언제나 `null`이라 그 조합은 화면에 오지 않는다), 여기는 `pageLock`이다.
 */
describe('구조 상태줄 — 안 골랐을 때 페이지 잠금', () => {
  const PAGE_LOCK: NodeLock = { nodeId: 'n-1', userId: 'u-bora', userName: '보라' }

  /**
   * **«고르면 된다»를 되풀이하지 않는 것이 판단이다.** 잠금이 서브트리 하나만 덮은
   * 판에서는 고르는 것이 실제로 답이지만 페이지 전체가 잠긴 판에서는 아니고(그 판에서는
   * 트리 줄이 **전부** 회색이다), 이 함수는 둘을 가르지 못한다. 그래서 **둘 다에서 참인
   * 것만** 말한다 — 지금 쓸 수 있는 도구가 없다는 것과 그 원인.
   *
   * 대조는 위 묶음의 `아무것도 안 고르면 고르라고 말한다`가 갖는다.
   */
  it('안 골랐는데 페이지에 남의 잠금이 있으면 원인을 말한다', () => {
    expect(statusOf(null, null, PAGE_LOCK)).toBe(
      '보라님이 편집 중이라 지금은 쓸 수 있는 도구가 없습니다',
    )
  })

  /**
   * **문안을 다시 적지 않고 «이름만 바뀐다»를 잰다.** 위 케이스가 글자를 소유하므로
   * 여기서 전문을 한 벌 더 두면 문안을 고칠 때 **둘이 함께 죽어** 어느 축이 깨졌는지가
   * 안 갈린다. 이 형태면 문안을 바꿔도 살아 있고 이름을 박으면 혼자 죽는다.
   */
  it('잠금 소유자 이름을 그대로 싣는다 — 하드코딩이 아니다', () => {
    const other: NodeLock = { nodeId: 'n-1', userId: 'u-dahye', userName: '다혜' }
    expect(statusOf(null, null, other)).toBe(
      statusOf(null, null, PAGE_LOCK).replace('보라', '다혜'),
    )
    // 양쪽이 빈 문자열로 같아지는 것을 막는다 — 그러면 이 케이스가 아무것도 안 잰다.
    expect(statusOf(null, null, other)).toContain('다혜')
  })

  /**
   * **이 칸은 «고른 것이 없을 때»뿐이다.** 고른 것이 있으면 아래 칸들이 *"고른 것이
   * 무엇이라서"*를 답해야 한다 — `n-a`는 잠긴 서브트리 밖이라 실제로 편집할 수 있고,
   * 그때 남의 잠금을 대표 이유로 띄우면 **틀린 이유**를 말하게 된다.
   *
   * **둘째 단언이 이 케이스가 혼자 지는 자리다.** 다 켜진 자리에서도 `프리셋` 하나는
   * 잠겨 있는데, 그것을 빈 줄에 얹고 싶어지는 것이 자연스러운 변형이다 — 그러면 사다리
   * 규칙 2(*"무리가 통째로 죽었을 때만"*)를 어기고, 남이 아무 노드나 잡는 동안 **일곱이
   * 다 켜진 화면에 잠금 문장이 상주한다.**
   */
  it('고른 것이 있으면 페이지 잠금이 이 칸을 대신하지 않는다', () => {
    expect(statusOf('n-a', null, PAGE_LOCK)).toBe('자식을 담지 못하는 타입입니다')
    expect(statusOf('n-full', null, PAGE_LOCK)).toBe('')
  })
})

describe('구조 상태줄 — 루트는 자기 문장을 잃지 않는다', () => {
  /**
   * **루트가 자식을 못 담아도 루트 문장이다.** 그때는 일곱이 전부 꺼지는데, 그것을
   * *"문서에 없는 노드"*로 읽으면 거짓말이 된다 — 고른 노드는 있고 그것이 루트다.
   * 검증 전 문서가 스토어에 실릴 수 있어(`structure-actions.ts`의 계약) 값으로 고정한다.
   */
  it('자식을 못 담는 루트도 루트라고 말한다', () => {
    const broken: PageDocument = { version: 1, root: { id: 'n-root', type: 'Text' } }
    const abilities = structureAbilities(broken, 'n-root')
    expect(Object.values(abilities).some(Boolean)).toBe(false)

    const status = structureStatus({
      selectedNodeId: 'n-root',
      isRoot: true,
      lock: null,
      pageLock: null,
      abilities,
    })

    expect(status).toBe('루트라 삭제·순서·계층을 바꿀 수 없습니다')
  })
})

describe('메뉴 상태줄', () => {
  /**
   * **판정 문안을 붙이지 않는다.** 조작이 나가 있는 동안은 아홉이 전부 꺼지는데, 그때
   * *"메뉴를 고르세요"*가 뜨면 거짓말이다 — 곧 풀릴 상태이고 고른 것은 이미 있다.
   * `menu-toolbar.tsx`의 `title`이 같은 이유로 `busy`를 안 보는 것과 한 짝이다.
   */
  it('busy면 보내는 중이라고 말한다 — 고른 것을 탓하지 않는다', () => {
    const status = menuStatusOf({ kind: 'menu', id: 'mn-1' }, true)
    expect(status).toBe('조작을 보내는 중입니다')
    expect(status).not.toContain('고르')
  })

  it('busy는 사다리의 맨 위다 — 고른 것이 없어도 보내는 중이 이긴다', () => {
    expect(menuStatusOf(null, true)).toBe('조작을 보내는 중입니다')
  })

  it('아무것도 안 고르면 고르라고 말한다', () => {
    expect(menuStatusOf(null)).toBe('메뉴나 페이지를 고르면 편집할 수 있습니다')
  })

  it('페이지면 하위 추가·계층 이동이 안 된다고 말한다', () => {
    expect(menuStatusOf({ kind: 'page', id: 'pg-1' })).toBe('페이지라 하위 추가·계층 이동이 안 됩니다')
  })

  it('하위가 있는 메뉴면 삭제가 막힌 이유를 말한다', () => {
    expect(menuStatusOf({ kind: 'menu', id: 'mn-1' })).toBe('하위가 있는 메뉴라 삭제할 수 없습니다')
  })

  /**
   * **메뉴 쪽에는 "다 켜진 상태"가 없다** — `옮기기`(reparent)가 메뉴 선택에서 언제나
   * 꺼진다(`tree/tree-actions.ts`). 그 하나만 꺼진 것을 말하려면 *"무리가 통째로 죽었을
   * 때만"* 규칙을 어겨야 하므로 빈 문자열이고, 이유는 그 버튼의 `title`에 남는다.
   */
  it('빈 메뉴이고 형제가 있으면 아무 말도 하지 않는다 — reparent 하나가 꺼진 것은 말하지 않는다', () => {
    const abilities = treeAbilities(tree(), { kind: 'menu', id: 'mn-3' })
    // 전제 셋을 값으로 못박는다: `옮기기`는 꺼졌고, 삭제는 열렸고(비었다), 형제가 있다.
    expect(abilities.reparent).toBe(false)
    expect(abilities.remove).toBe(true)
    expect(abilities.moveUp).toBe(true)
    expect(menuStatusOf({ kind: 'menu', id: 'mn-3' })).toBe('')
  })

  it('페이지를 가진 메뉴도 삭제가 막힌다 — 자식 메뉴만 보는 구현과 갈린다', () => {
    // `mn-2`는 자식 메뉴가 없고 페이지만 있다. 서버는 그때도 409다(`tree-actions.ts`의 실측).
    expect(menuStatusOf({ kind: 'menu', id: 'mn-2' })).toBe('하위가 있는 메뉴라 삭제할 수 없습니다')
  })

  it('형제가 없는 외동 메뉴는 순서를 못 바꾼다고 말한다', () => {
    expect(menuStatusOf({ kind: 'menu', id: 'mn-1-1' })).toBe('형제가 없어 순서를 바꿀 수 없습니다')
  })

  it('트리에 없는 것을 고르고 있으면 그렇게 말한다', () => {
    expect(menuStatusOf({ kind: 'menu', id: 'mn-gone' })).toBe('고른 것이 트리에 없습니다')
    expect(menuStatusOf({ kind: 'page', id: 'pg-gone' })).toBe('고른 것이 트리에 없습니다')
  })
})

/**
 * **두 줄이 같은 어휘를 쓰는가.** 사용자는 좌측에서 두 툴바를 위아래로 함께 본다 —
 * 같은 뜻을 다른 말로 하면 두 도구가 다른 규칙을 따르는 것으로 읽힌다.
 */
describe('두 상태줄의 어휘', () => {
  it('형제가 없다는 말은 양쪽이 같은 문장이다', () => {
    expect(statusOf('n-solo')).toBe(menuStatusOf({ kind: 'menu', id: 'mn-1-1' }))
    // 양쪽이 **빈 문자열로** 같아지는 것을 막는다 — 그러면 이 케이스가 아무것도 안 잰다.
    expect(statusOf('n-solo')).toBe('형제가 없어 순서를 바꿀 수 없습니다')
  })

  it('할 말이 없으면 양쪽 다 빈 문자열이다 — 자리를 지키는 것은 CSS다', () => {
    expect(statusOf('n-full')).toBe('')
    expect(menuStatusOf({ kind: 'menu', id: 'mn-3' })).toBe('')
  })

  it('말할 것이 있는 문장은 마침표 없이 끝난다 — 한 줄짜리 문장이다', () => {
    const spoken = [
      statusOf(null),
      statusOf('n-root'),
      statusOf('n-a'),
      statusOf('n-1'),
      menuStatusOf(null),
      menuStatusOf({ kind: 'page', id: 'pg-1' }),
      menuStatusOf({ kind: 'menu', id: 'mn-1' }, true),
    ]
    for (const sentence of spoken) {
      expect(sentence).not.toBe('')
      expect(sentence.endsWith('.')).toBe(false)
    }
  })
})
