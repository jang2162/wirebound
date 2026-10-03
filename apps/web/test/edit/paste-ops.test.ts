/**
 * `edit/paste-ops.ts` — 붙이기 · 복제 · 여럿 지우기의 연산 묶음.
 *
 * **패치 엔진을 실제로 돌린다** — 만든 묶음을 차례로 적용한 문서가 무엇인지(어디에 섰나 · 검증을 지나나)를 본다. 연산 모양만 보면 앞 연산이 민
 * 좌표를 못 잰다.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import {
  MAX_OPS_PER_EDIT,
  applyOps,
  collectNodeIds,
  installCatalog,
  invertOps,
  partitionIssues,
  validatePage,
  type PageDocument,
  type WbNode,
} from '@wirebound/schema'
import { duplicateOps, pasteOps, removeManyOps, tooManyOpsNotice } from '../../src/edit/paste-ops'
import { STRUCTURE_WHY_DISABLED } from '../../src/panels/tree-row-actions'

beforeAll(() => {
  installCatalog()
})

/**
 * ```
 * root
 * ├ a (Text)
 * ├ box (Card)
 * │ └ b1 (Button)
 * └ c (Divider)
 * ```
 */
function doc(): PageDocument {
  return {
    version: 1,
    root: {
      id: 'root',
      type: 'Page',
      children: [
        { id: 'a', type: 'Text' },
        { id: 'box', type: 'Card', children: [{ id: 'b1', type: 'Button' }] },
        { id: 'c', type: 'Divider' },
      ],
    },
  }
}

function idsUnder(document: PageDocument, parentId: string): string[] {
  const walk = (node: WbNode): WbNode | undefined =>
    node.id === parentId ? node : (node.children ?? []).map(walk).find((found) => found !== undefined)
  return (walk(document.root)?.children ?? []).map((node) => node.id)
}

/** 적용한 문서 — 묶음이 아니면 던진다(케이스가 그 갈래를 기대하지 않는다). */
function applied(document: PageDocument, edit: ReturnType<typeof pasteOps>): PageDocument {
  if ('reason' in edit) throw new Error(`묶음이 아니라 이유가 왔다: ${edit.reason}`)
  return applyOps(document, edit.ops)
}

const P1: WbNode = { id: 'p1', type: 'Text', props: { content: '하나' } }
const P2: WbNode = { id: 'p2', type: 'Divider' }
const P3: WbNode = { id: 'p3', type: 'Section', children: [{ id: 'p3c', type: 'Text' }] }

describe('pasteOps', () => {
  it('기준 노드 바로 뒤에 차례대로 — 노드 셋', () => {
    const edit = pasteOps(doc(), 'a', [P1, P2, P3])
    const after = applied(doc(), edit)

    expect(idsUnder(after, 'root')).toEqual(['a', 'p1', 'p2', 'p3', 'box', 'c'])
    expect(edit).toMatchObject({ insertedIds: ['p1', 'p2', 'p3'] })
    expect(partitionIssues(validatePage(after)).errors).toEqual([])
  })

  it('자식 안의 기준 노드면 그 부모 안 바로 뒤에', () => {
    const after = applied(doc(), pasteOps(doc(), 'b1', [P1, P2]))
    expect(idsUnder(after, 'box')).toEqual(['b1', 'p1', 'p2'])
  })

  it('기준이 없거나 루트거나 문서에 없으면 루트 끝', () => {
    for (const anchor of [null, 'root', 'gone']) {
      const after = applied(doc(), pasteOps(doc(), anchor, [P1, P2]))
      expect(idsUnder(after, 'root')).toEqual(['a', 'box', 'c', 'p1', 'p2'])
    }
  })

  it('루트에 children 키가 없어도 끝에 붙는다', () => {
    const bare: PageDocument = { version: 1, root: { id: 'root', type: 'Page' } }
    expect(idsUnder(applied(bare, pasteOps(bare, null, [P1, P2])), 'root')).toEqual(['p1', 'p2'])
  })

  it('붙인 노드는 marker 를 안 든다 — 코멘트는 따라가지 않는다', () => {
    const marked: WbNode = { id: 'm', type: 'Section', marker: 3, children: [{ id: 'mc', type: 'Text', marker: 4 }] }
    const after = applied(doc(), pasteOps(doc(), 'a', [marked]))
    const pasted = after.root.children![1]!
    expect(pasted).not.toHaveProperty('marker')
    expect(pasted.children![0]).not.toHaveProperty('marker')
    // 입력은 그대로다.
    expect(marked.marker).toBe(3)
  })

  it('부모가 자식을 안 받으면 `+` 의 문장 — 편집 0', () => {
    // 검증 전 문서 — 자식을 못 담는 타입 밑에 자식이 있다. 그 자식 뒤에 붙이면 부모가 안 받는다.
    const broken: PageDocument = {
      version: 1,
      root: { id: 'root', type: 'Page', children: [{ id: 't', type: 'Text', children: [{ id: 'in', type: 'Text' }] }] },
    }
    expect(pasteOps(broken, 'in', [P1])).toEqual({ reason: STRUCTURE_WHY_DISABLED.addInside })
  })

  it(`연산이 ${MAX_OPS_PER_EDIT} 개를 넘으면 보내기 전에 막는다 — 상한은 받는다`, () => {
    const many = (count: number): WbNode[] => Array.from({ length: count }, (_, i) => ({ id: `n${i}`, type: 'Divider' }))
    expect(pasteOps(doc(), null, many(MAX_OPS_PER_EDIT + 1))).toEqual({ reason: tooManyOpsNotice(MAX_OPS_PER_EDIT + 1) })
    const edit = pasteOps(doc(), null, many(MAX_OPS_PER_EDIT))
    expect('ops' in edit && edit.ops.length).toBe(MAX_OPS_PER_EDIT)
  })

  it('넣고 나서 문서에 새 error 가 서면 이유를 말한다 — 이미 있던 error 는 붙이기 탓이 아니다', () => {
    // 지금 문서와 id 가 겹치는 노드(재발급을 안 거친 것) — duplicate-id 가 새로 선다.
    const clash = pasteOps(doc(), null, [{ id: 'a', type: 'Text' }])
    expect('reason' in clash && clash.reason).toContain('id가 중복됩니다: a')

    const alreadyBroken: PageDocument = {
      version: 1,
      root: { id: 'root', type: 'Page', children: [{ id: 'x', type: 'NoSuchType' }] },
    }
    expect('ops' in pasteOps(alreadyBroken, null, [P1])).toBe(true)
  })

  it('되돌리기 하나로 통째로 돌아온다 — 역연산이 붙이기 전 문서를 낸다', () => {
    const edit = pasteOps(doc(), 'a', [P1, P2, P3])
    if ('reason' in edit) throw new Error(edit.reason)
    const after = applyOps(doc(), edit.ops)
    expect(applyOps(after, invertOps(doc(), edit.ops))).toEqual(doc())
  })
})

describe('duplicateOps', () => {
  function counter(): () => string {
    let next = 0
    return () => `dup${++next}`
  }

  it('제 바로 뒤에 사본 — 사본 id 는 새 것이고 자손도 새 id', () => {
    const edit = duplicateOps(doc(), ['box'], counter())
    const after = applied(doc(), edit)
    expect(idsUnder(after, 'root')).toEqual(['a', 'box', 'dup2', 'c'])
    expect(idsUnder(after, 'dup2')).toEqual(['dup3'])
    expect(edit).toMatchObject({ insertedIds: ['dup2'] })
    expect(new Set(collectNodeIds(after.root)).size).toBe(collectNodeIds(after.root).length)
  })

  it('노드 여럿이면 노드마다 제 바로 뒤 — 앞 사본이 민 좌표를 따라간다', () => {
    const after = applied(doc(), duplicateOps(doc(), ['a', 'c'], counter()))
    expect(idsUnder(after, 'root')).toEqual(['a', 'dup2', 'box', 'c', 'dup4'])
  })

  it('사본 안을 가리키는 대상은 사본을 따라가고, 밖을 가리키는 대상은 그대로다', () => {
    const withTargets: PageDocument = {
      version: 1,
      root: {
        id: 'root',
        type: 'Page',
        children: [
          { id: 'dlg', type: 'Section' },
          {
            id: 'sec',
            type: 'Section',
            children: [
              { id: 'tabs', type: 'Tabs' },
              {
                id: 'btn',
                type: 'Button',
                interactions: [
                  {
                    on: 'click',
                    actions: [
                      { type: 'switchTab', target: 'tabs', tab: 1 },
                      { type: 'setVisible', target: 'dlg', value: true },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    }
    const after = applied(withTargets, duplicateOps(withTargets, ['sec'], counter()))
    const copy = after.root.children![2]!
    const [tabsCopy, btnCopy] = copy.children!
    expect(btnCopy!.interactions![0]!.actions.map((action) => action.target)).toEqual([tabsCopy!.id, 'dlg'])
    expect(validatePage(after)).toEqual([]) // 끊긴 대상(warning)도 없다
  })

  it('사본은 marker 를 안 든다', () => {
    const marked: PageDocument = { version: 1, root: { id: 'root', type: 'Page', children: [{ id: 'm', type: 'Text', marker: 1 }] } }
    const after = applied(marked, duplicateOps(marked, ['m'], counter()))
    expect(after.root.children![0]!.marker).toBe(1)
    expect(after.root.children![1]).not.toHaveProperty('marker')
  })

  it('루트 · 문서에 없는 노드는 `+` 의 «아래 추가» 문장', () => {
    expect(duplicateOps(doc(), ['root'])).toEqual({ reason: STRUCTURE_WHY_DISABLED.addAfter })
    expect(duplicateOps(doc(), ['gone'])).toEqual({ reason: STRUCTURE_WHY_DISABLED.addAfter })
  })
})

describe('removeManyOps', () => {
  it('형제 셋을 지운다 — 앞 연산이 민 좌표를 따라간다', () => {
    const ops = removeManyOps(doc(), ['a', 'box', 'c'])!
    expect(ops).toEqual([
      { op: 'remove', path: '/root/children/0' },
      { op: 'remove', path: '/root/children/0' },
      { op: 'remove', path: '/root/children/0' },
    ])
    expect(idsUnder(applyOps(doc(), ops), 'root')).toEqual([])
  })

  it('뒤에서부터 줘도 남는 것이 맞다', () => {
    const ops = removeManyOps(doc(), ['c', 'a'])!
    expect(idsUnder(applyOps(doc(), ops), 'root')).toEqual(['box'])
  })

  it('조상이 함께 든 노드는 따로 지우지 않는다', () => {
    const ops = removeManyOps(doc(), ['b1', 'box'])!
    expect(ops).toEqual([{ op: 'remove', path: '/root/children/1' }])
  })

  it('루트 · 문서에 없는 노드가 있으면 null', () => {
    expect(removeManyOps(doc(), ['a', 'root'])).toBeNull()
    expect(removeManyOps(doc(), ['a', 'gone'])).toBeNull()
  })
})
