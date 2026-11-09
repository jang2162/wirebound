// @vitest-environment jsdom
/**
 * **SDK 기본 `TreeView` 의 항목 계층**(`packages/theme-sdk/src/default-views/data.tsx` 의 `TreeEntries`)과, 판 5 문서를 옮긴 뒤의 화면이 판 5 화면과
 * 같은지(`@wirebound/schema` 의 `migrateDocument` — 판 5 → 6 은 `src/migrate-tree-items.ts`).
 *
 * | 케이스 | 무엇이 거짓이면 죽나 |
 * |---|---|
 * | 옛 뷰 · 새 뷰 | 옮긴 문서의 새 뷰 DOM 이 옛 뷰 DOM 과 단(옛 뷰의 단 변수 · 새 뷰의 자식 목록 겹 수) · 글 차례가 다르다 |
 * | 펼침 · 접힘 | 접힌 항목의 자식이 그려진다 · 표지가 ▾ · ▸ 가 아니다 · 잎에 표지 · `data-wb-open` 이 선다 |
 *
 * 옛 뷰는 판 5 의 기본 뷰를 이 파일에 얼려 둔 사본이다(`git show 2313575a^:packages/theme-sdk/src/default-views/data.tsx` 의 `TreeView`) — 그
 * 뷰가 SDK 에서 걷혀 이 자리 말고는 옛 화면을 그릴 길이 없다.
 */
import { cleanup, render } from '@testing-library/react'
import type { CSSProperties, ReactElement } from 'react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { installCatalog, migrateDocument, type PageDocument, type WbNode } from '@wirebound/schema'
import { renderDocument } from '@wirebound/renderer'

beforeAll(() => installCatalog())
afterEach(() => cleanup())

/** 판 5 기본 뷰의 사본 — 항목 i 를 단 `i % depth` 로(단은 `--wb-node-tree-level`). */
function OldTreeView(props: { items: string[]; depth: number }): ReactElement {
  return (
    <ul data-wb-component="Tree" data-wb-structure="indent">
      {props.items.map((label, index) => (
        <li key={`${label}-${index}`} data-wb-part="node" style={{ '--wb-node-tree-level': String(index % props.depth) } as CSSProperties}>
          <span data-wb-part="toggle">▸</span>
          <span data-wb-part="label">{label}</span>
        </li>
      ))}
    </ul>
  )
}

/** 옛 뷰 DOM 의 (단, 글) 차례. */
function oldRows(items: string[], depth: number): string[] {
  const { container } = render(<OldTreeView items={items} depth={depth} />)
  const rows = [...container.querySelectorAll<HTMLElement>('[data-wb-part="node"]')].map(
    (node) => `${node.style.getPropertyValue('--wb-node-tree-level')}:${node.querySelector('[data-wb-part="label"]')?.textContent ?? ''}`,
  )
  cleanup()
  return rows
}

/** 새 뷰 DOM 의 (단, 글) 차례 — 단은 그 줄을 품은 자식 목록(`children` 조각)의 겹 수다. */
function newRows(root: HTMLElement): string[] {
  return [...root.querySelectorAll<HTMLElement>('[data-wb-part="label"]')].map((label) => {
    let level = 0
    for (let at = label.parentElement; at !== null && at !== root; at = at.parentElement) {
      if (at.getAttribute('data-wb-part') === 'children') level += 1
    }
    return `${level}:${label.textContent ?? ''}`
  })
}

function drawn(node: WbNode, version = 6): HTMLElement {
  const doc = migrateDocument({ version, root: { id: 'n_root', type: 'Page', children: [node] } } as unknown as PageDocument)
  const { container } = render(<>{renderDocument(doc)}</>)
  const root = container.querySelector<HTMLElement>(`[data-wb-id="${node.id}"]`)
  if (root === null) throw new Error('트리가 안 그려졌다')
  return root
}

const labels = (count: number): string[] => Array.from({ length: count }, (_, index) => `항목 ${index + 1}`)

describe('판 5 문서를 옮긴 화면 = 판 5 화면', () => {
  it.each([
    [1, 4],
    [2, 7],
    [5, 13],
    [2, 0],
    [3, 1],
    [5, 100],
  ])('깊이 %i · 항목 %i — 단 · 글 차례가 같다', (depth, count) => {
    const items = labels(count)
    const before = oldRows(items, depth)
    // 카나리아 — 옛 뷰가 그 수만큼 그렸고, 깊이가 1 보다 크면 단 0 밖의 줄이 있다(단을 다 0 으로 읽는 자가 아니다).
    expect(before).toHaveLength(count)
    if (depth > 1 && count > 1) expect(before.some((row) => !row.startsWith('0:'))).toBe(true)
    const after = newRows(drawn({ id: 't', type: 'Tree', props: { items, depth } }, 5))
    expect(after).toEqual(before)
  })

  it('항목이 없던 판 5 트리는 옛 기본값(«항목 1» · «항목 2» · 깊이 2)의 화면 그대로다', () => {
    expect(newRows(drawn({ id: 't', type: 'Tree', props: {} }, 5))).toEqual(oldRows(['항목 1', '항목 2'], 2))
  })
})

describe('펼침 · 접힘', () => {
  const tree: WbNode = {
    id: 't',
    type: 'Tree',
    props: {
      items: [
        { label: '가', open: true, children: [{ label: '가-1' }, { label: '가-2', children: [{ label: '가-2-ㄱ' }] }] },
        { label: '나' },
      ],
    },
  }

  it('접힌 항목의 자식은 안 그린다 — 펼친 항목만 자식 목록을 갖는다', () => {
    const root = drawn(tree)
    expect(newRows(root)).toEqual(['0:가', '1:가-1', '1:가-2', '0:나'])
    expect(root.querySelectorAll('[data-wb-part="children"]')).toHaveLength(1)
  })

  it('표지 — 펼친 부모 ▾ · 접힌 부모 ▸ · 잎은 빈 칸이고 `data-wb-open` 이 없다', () => {
    const root = drawn(tree)
    const items = [...root.querySelectorAll<HTMLElement>('[data-wb-part="item"]')]
    const marks = items.map((item) => [
      item.querySelector(':scope > [data-wb-part="node"] > [data-wb-part="label"]')?.textContent,
      item.querySelector(':scope > [data-wb-part="node"] > [data-wb-part="toggle"]')?.textContent,
      item.getAttribute('data-wb-open'),
    ])
    expect(marks).toEqual([
      ['가', '▾', 'true'],
      ['가-1', '', null],
      ['가-2', '▸', 'false'],
      ['나', '', null],
    ])
  })
})
