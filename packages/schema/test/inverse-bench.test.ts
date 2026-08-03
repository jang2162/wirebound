import { describe, expect, it } from 'vitest'
import type { PageDocument, WbNode } from '../src/node'
import { invertOps } from '../src/patch/inverse'
import type { PatchOp } from '../src/patch/types'

function buildDoc(nodeCount: number): PageDocument {
  const children: WbNode[] = []
  for (let i = 0; i < nodeCount; i += 1) {
    children.push({
      id: `n_${String(i).padStart(12, '0')}`,
      type: 'Text',
      props: { content: `노드 ${i}`, role: 'body' },
    })
  }
  return { version: 1, root: { id: 'n_root00000000', type: 'Page', children } }
}

function timeMs(fn: () => void): number {
  const start = performance.now()
  fn()
  return performance.now() - start
}

describe('invertOps 성능', () => {
  const doc = buildDoc(400)

  function moveOps(): PatchOp[] {
    const ops: PatchOp[] = []
    for (let i = 0; i < 50; i += 1) {
      ops.push({ op: 'move', from: `/root/children/${i}`, path: `/root/children/${i + 1}` })
    }
    return ops
  }

  function replaceOps(): PatchOp[] {
    const ops: PatchOp[] = []
    for (let i = 0; i < 50; i += 1) {
      ops.push({ op: 'replace', path: `/root/children/${i}/props/content`, value: `바뀜 ${i}` })
    }
    return ops
  }

  it('move 역전이 replace 역전의 8배를 넘지 않는다', () => {
    // 워밍업 — 첫 실행의 JIT 비용을 측정에서 뺀다.
    invertOps(doc, moveOps())
    invertOps(doc, replaceOps())

    const moveMs = timeMs(() => invertOps(doc, moveOps()))
    const replaceMs = timeMs(() => invertOps(doc, replaceOps()))
    const ratio = moveMs / replaceMs

    // 절대 시간이 아니라 비율을 단언한다. 부하가 걸린 기계에서는 두 값이 함께
    // 늘어나므로 비율이 절대 시간보다 훨씬 안정적이다. 관측 비율은 약 2배이고,
    // 연산마다 문서를 중첩 클론하는 종류의 회귀는 이 상한을 훌쩍 넘긴다.
    expect(ratio, `move ${moveMs.toFixed(2)}ms / replace ${replaceMs.toFixed(2)}ms`).toBeLessThan(8)
  })

  it('400노드 문서의 move 50건이 파국적으로 느려지지 않는다', () => {
    invertOps(doc, moveOps())
    const elapsed = timeMs(() => invertOps(doc, moveOps()))
    // 비율 테스트가 잡지 못하는 "둘 다 100배 느려짐"에 대한 백스톱이다.
    // 관측값 30ms 대비 여유가 크므로 부하로는 걸리지 않는다.
    expect(elapsed, `${elapsed.toFixed(2)}ms`).toBeLessThan(2000)
  })
})
