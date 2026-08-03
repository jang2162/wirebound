import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import type { PageDocument, WbNode } from '../../src/node'
import { applyOp, applyOps } from '../../src/patch/apply'
import { invertOps } from '../../src/patch/inverse'
import type { PatchOp } from '../../src/patch/types'
import { walkNodes } from '../../src/tree'

function seedDocument(): PageDocument {
  return {
    version: 1,
    root: {
      id: 'n_000000000001',
      type: 'Page',
      children: [
        {
          id: 'n_000000000002',
          type: 'Card',
          props: { title: '카드', subtitle: '' },
          children: [
            { id: 'n_000000000003', type: 'Text', props: { content: '가', role: 'body' } },
            { id: 'n_000000000004', type: 'Text', props: { content: '나', role: 'body' } },
          ],
        },
        { id: 'n_000000000005', type: 'List', props: { items: 3, pagination: true } },
        { id: 'n_000000000006', type: 'Divider', props: { direction: 'horizontal' } },
      ],
    },
  }
}

let nextId = 100

/** 시드에서 현재 문서에 유효한 연산 하나를 고른다. 만들 수 없으면 null. */
function pickOp(doc: PageDocument, seed: number): PatchOp | null {
  const visits = [...walkNodes(doc.root)].filter((visit) => visit.parent !== null)
  if (visits.length === 0) return null

  const visit = visits[seed % visits.length]!
  const kind = Math.floor(seed / 7) % 4

  if (kind === 0) {
    // 자식 배열 끝에 새 노드를 덧붙인다
    const target = visit.parent!
    if (!target.children) return null
    return {
      op: 'add',
      path: `${parentPath(visit.path)}/-`,
      value: { id: `n_gen${String((nextId += 1)).padStart(9, '0')}`, type: 'Divider' },
    }
  }

  if (kind === 1) {
    return { op: 'remove', path: visit.path }
  }

  if (kind === 2) {
    return { op: 'replace', path: `${visit.path}/type`, value: 'Divider' }
  }

  // move: 형제가 둘 이상일 때만
  const siblings = visit.parent!.children ?? []
  if (siblings.length < 2) return null
  const targetIndex = (visit.index + 1) % siblings.length
  return {
    op: 'move',
    from: visit.path,
    path: `${parentPath(visit.path)}/${targetIndex}`,
  }
}

/** `/root/children/2` → `/root/children` */
function parentPath(path: string): string {
  return path.slice(0, path.lastIndexOf('/'))
}

function hasNodes(root: WbNode): boolean {
  return (root.children?.length ?? 0) > 0
}

describe('패치 왕복 속성', () => {
  it('임의 편집 시퀀스를 적용한 뒤 역적용하면 원본과 같다', () => {
    fc.assert(
      fc.property(fc.array(fc.nat({ max: 10_000 }), { minLength: 1, maxLength: 25 }), (seeds) => {
        const original = seedDocument()
        let current: PageDocument = original
        const ops: PatchOp[] = []

        for (const seed of seeds) {
          if (!hasNodes(current.root)) break
          const op = pickOp(current, seed)
          if (!op) continue
          let next: PageDocument
          try {
            next = applyOp(current, op)
          } catch {
            continue // 이 시드로는 유효하지 않은 연산 — 건너뛴다
          }
          ops.push(op)
          current = next
        }

        const inverses = invertOps(original, ops)
        const restored = applyOps(current, inverses)
        expect(restored).toEqual(original)
      }),
      { numRuns: 300 },
    )
  })

  it('빈 연산 목록의 역은 빈 목록이다', () => {
    expect(invertOps(seedDocument(), [])).toEqual([])
  })
})
