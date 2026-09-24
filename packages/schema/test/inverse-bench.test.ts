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

/**
 * **가장 빠른 한 번을 고른다.** 한 번만 재면 그 한 번에 걸린 GC·스케줄러 지연이
 * 그대로 측정값이 된다 — 전체 실행의 부하에서 이 파일의 비율 단언이 그렇게 죽는다
 * (아래 `move 역전이 …` 케이스의 주석).
 *
 * **최소값이 옳은 통계인 이유:** 재려는 것이 *"이 코드 경로가 얼마나 무거운가"*이고,
 * 바깥 소음은 시간을 **늘리기만** 한다(줄이지 않는다). 그러므로 최소값이 소음이 가장 적게
 * 섞인 표본이다. **구분력은 안 준다** — 진짜 회귀는 세 번 다 느리므로 최소값도 함께 오른다
 * (다시 재는 법: 아래 표의 e처럼 `inverseOfMove`에 문서 클론을 심으면 최소값 판에서도 죽는다).
 */
const SAMPLES = 3

function bestOfMs(fn: () => void): number {
  let best = Infinity
  for (let i = 0; i < SAMPLES; i += 1) best = Math.min(best, timeMs(fn))
  return best
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

    const moveMs = bestOfMs(() => invertOps(doc, moveOps()))
    const replaceMs = bestOfMs(() => invertOps(doc, replaceOps()))
    const ratio = moveMs / replaceMs

    /**
     * 절대 시간이 아니라 비율을 단언한다. **기준 비율은 2 안팎이다**(아래 표의 a — move
     * 19.63ms / replace 9.79ms, 셋 중 최소값. 다시 재는 법: 이 파일을 단독으로 돌리며 단언의
     * 메시지 인자 `move …ms / replace …ms`를 찍는다. 기계마다 절대값은 다르다).
     *
     * ---
     *
     * # 이 상한이 **무엇을** 잡는가 — 심어서 잰다
     *
     * 세는 단위: **변조 하나.** 다시 재는 법: 아래 «심은 것»을 `inverse.ts`에 심고 이 파일을
     * 돌린 뒤 복구한다. 값은 위와 같은 형태(최소값 3회)다.
     *
     * | # | 심은 것 | move | replace | 비율 | 이 케이스 |
     * |---|---|---|---|---|---|
     * | a | (기준) | 19.63ms | 9.79ms | **2.01** | 초록 |
     * | b | **모든 연산**에 문서 클론 1회(`invertOps`의 루프) | 29.17ms | 19.22ms | **1.52** | **초록** |
     * | c | `inverseOfMove`에만 클론 2회 | 39.07ms | 9.55ms | 4.09 | 초록 |
     * | d | `inverseOfMove`에만 클론 4회 | 59.12ms | 9.85ms | 6.00 | 초록 |
     * | e | `inverseOfMove`에만 클론 9회 | 106.57ms | 9.78ms | **10.90** | **죽는다** |
     *
     * **b가 요점이다.** *"연산마다 문서를 중첩 클론하는 종류의 회귀는 이 상한을 훌쩍
     * 넘긴다"*는 **거짓이다** — **양쪽 경로에 함께 실리는 회귀는 비율을 오히려 내린다**(2.01 → 1.52). 즉 이 케이스가
     * 잡는 것은 *"클론하는 회귀"*가 아니라 **`move` 경로에만 실리는 회귀**이고, 양쪽에
     * 실리는 것은 아래 둘째 케이스(절대 시간 백스톱)의 몫이다.
     *
     * ---
     *
     * # 부하는 두 경로에 함께 실리지 않는다
     *
     * *"부하가 걸린 기계에서는 두 값이 **함께** 늘어나므로 비율이 절대 시간보다 훨씬
     * 안정적이다"*는 **거짓이다.** 전체 실행의 부하에서는 **`move`만 튀고 `replace`는
     * 제자리일 수 있고**, 단일 표본이면 그 한 번에 비율이 8을 넘어 이 케이스가 죽는다.
     * 두 경로가 부하에 같은 정도로 노출되지 않는다 — `move`의 역이 서브트리를
     * `structuredClone`으로 품으므로 할당이 훨씬 많고, GC 지연이 그쪽에만 실린다.
     *
     * **그래서 상한이 아니라 표본 수로 다룬다**(위 `bestOfMs`). 상한을 올리면 진짜
     * 회귀를 놓치는 폭이 함께 넓어지고, 케이스를 격리하면 *"전체 실행에서 죽는다"*는
     * 사실만 감춰진다. **최소값은 소음을 걷어내면서 상한을 그대로 둔다** — 위 표의 e가
     * 최소값 판에서도 죽는 것으로 구분력이 안 줄었다는 것을 보인다.
     *
     * > **이것은 논증이지 측정이 아니다.** 부하가 걸린 회차를 일부러 만들 수 없으므로
     * > *"최소값이 그 실패를 없앤다"*를 재지 못한다.
     * > 논증은 이것이다: 소음은 시간을 늘리기만 하므로 최소값은 단일 표본보다 **작거나
     * > 같고**, 따라서 같은 실행에서 이 단언이 죽을 확률도 작거나 같다.
     */
    expect(ratio, `move ${moveMs.toFixed(2)}ms / replace ${replaceMs.toFixed(2)}ms`).toBeLessThan(8)
  })

  it('400노드 문서의 move 50건이 파국적으로 느려지지 않는다', () => {
    invertOps(doc, moveOps())
    // 여기도 최소값이다 — 이쪽은 상한이 넉넉해 부하에 덜 죽지만, 같은 부하를 같은 방식으로
    // 다루는 편이 낫다.
    const elapsed = bestOfMs(() => invertOps(doc, moveOps()))
    // 비율 테스트가 잡지 못하는 "둘 다 100배 느려짐"에 대한 백스톱이다.
    // 관측값 30ms 안팎(단언의 메시지 인자가 그 값이다) 대비 여유가 크므로 부하로는 걸리지 않는다.
    expect(elapsed, `${elapsed.toFixed(2)}ms`).toBeLessThan(2000)
  })
})
