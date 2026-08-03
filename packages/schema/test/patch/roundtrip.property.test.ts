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

function newNode(): WbNode {
  return { id: `n_gen${String((nextId += 1)).padStart(9, '0')}`, type: 'Divider' }
}

/**
 * 시드에서 현재 문서에 유효한 연산 하나를 고른다. 만들 수 없으면 null.
 * add는 배열 끝(`-`)·배열 중간·이미 있는 객체 키·없던 객체 키를,
 * move는 구체적 인덱스와 `-`를(같은 배열·다른 배열 모두) 낸다.
 */
function pickOp(doc: PageDocument, seed: number): PatchOp | null {
  const visits = [...walkNodes(doc.root)].filter((visit) => visit.parent !== null)
  if (visits.length === 0) return null

  const visit = visits[seed % visits.length]!
  /** 형제 배열의 경로 (`/…/children`) */
  const siblingsPath = parentPath(visit.path)

  switch (Math.floor(seed / 7) % 9) {
    case 0:
      // 자식 배열 끝에 새 노드를 덧붙인다
      return { op: 'add', path: `${siblingsPath}/-`, value: newNode() }

    case 1:
      // 배열 한가운데(자기 자리)에 새 노드를 끼워 넣는다
      return { op: 'add', path: `${siblingsPath}/${visit.index}`, value: newNode() }

    case 2:
      return { op: 'remove', path: visit.path }

    case 3:
      return { op: 'replace', path: `${visit.path}/type`, value: 'Divider' }

    case 4:
      // 이미 있는 객체 키를 덮어쓰는 add — 역이 remove가 아니라 replace여야 한다
      return { op: 'add', path: `${visit.path}/type`, value: 'Divider' }

    case 5:
      // 없던 객체 키를 만드는 add — 역은 remove다 (같은 노드에 두 번째면 replace가 된다)
      return { op: 'add', path: `${visit.path}/marker`, value: seed % 97 }

    case 6: {
      // move: 형제가 둘 이상일 때만, 구체적인 인덱스로
      const siblings = visit.parent!.children ?? []
      if (siblings.length < 2) return null
      return {
        op: 'move',
        from: visit.path,
        path: `${siblingsPath}/${(visit.index + 1) % siblings.length}`,
      }
    }

    case 7:
      // move: 같은 배열의 끝(-)으로
      return { op: 'move', from: visit.path, path: `${siblingsPath}/-` }

    default: {
      // move: 아무 노드의 children 끝(-)으로.
      // move는 remove 후 add이므로 목적지는 **값을 뺀 뒤** 문서에서 골라야 항상 유효하다.
      let afterRemove: PageDocument
      try {
        afterRemove = applyOp(doc, { op: 'remove', path: visit.path })
      } catch {
        return null
      }
      const targets = [...walkNodes(afterRemove.root)].filter((v) => v.node.children !== undefined)
      if (targets.length === 0) return null
      const target = targets[Math.floor(seed / 11) % targets.length]!
      return { op: 'move', from: visit.path, path: `${target.path}/children/-` }
    }
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
