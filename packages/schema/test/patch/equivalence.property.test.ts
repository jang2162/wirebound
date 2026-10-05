/**
 * 제품 구현(`applyOps` · `invertOps` — 사본 하나를 제자리로 진행)이 **연산마다 복제하는 단순
 * 구현**(`reference-patch.ts`)과 같은 결과를 내는가를 무작위 ops 로 잰다.
 *
 * 견주는 것은 셋이다 — 결과 문서 · 역연산 · 오류(클래스 · 문장 · `path`). 그리고 제품 구현만
 * 따로 지켜야 하는 성질 셋을 함께 본다: 던져도 입력 문서가 그대로다(원자성) · 입력 `ops`가
 * 그대로다 · 결과가 `ops`의 값을 참조하지 않는다.
 *
 * ops 는 문서의 실제 경로에서 고르되 일부러 틀린 경로(범위 밖 · 없는 키 · 루트 · 막힌 토큰 ·
 * 옮길 값 안으로의 move)를 섞는다. 틀린 op 이 나오면 거기서 목록을 끝낸다 — 그래서 앞의
 * op 들이 사본을 바꾼 **뒤에** 던지는 판이 매 회 섞인다.
 */
import fc from 'fast-check'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyOps } from '../../src/patch/apply'
import { invertOps } from '../../src/patch/inverse'
import { formatPointer, getByPointer } from '../../src/patch/pointer'
import type { PatchOp } from '../../src/patch/types'
import { referenceApplyOp, referenceApplyOps, referenceInvertOps } from './reference-patch'

type Json = null | boolean | number | string | Json[] | { [key: string]: Json }

/** 문서 안 모든 값의 포인터(루트 제외)와, 값을 넣을 수 있는 자리(배열 끝 · 새 키)를 모은다. */
function slotsOf(doc: Json): { existing: string[]; insertable: string[] } {
  const existing: string[] = []
  const insertable: string[] = []
  const walk = (value: Json, tokens: string[]) => {
    if (Array.isArray(value)) {
      value.forEach((child, index) => {
        existing.push(formatPointer([...tokens, String(index)]))
        insertable.push(formatPointer([...tokens, String(index)]))
        walk(child, [...tokens, String(index)])
      })
      insertable.push(formatPointer([...tokens, '-']))
      insertable.push(formatPointer([...tokens, String(value.length)]))
      return
    }
    if (value !== null && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) {
        existing.push(formatPointer([...tokens, key]))
        insertable.push(formatPointer([...tokens, key]))
        walk(child, [...tokens, key])
      }
      insertable.push(formatPointer([...tokens, 'k_new']))
      insertable.push(formatPointer([...tokens, 'a/b~c']))
    }
  }
  walk(doc, [])
  return { existing, insertable }
}

/** 틀린 경로. 어느 문서에서도 대개 던진다. */
const BOGUS = ['', 'root', '/nope/deeper', '/__proto__/x', '/constructor', '/k/-/x', '/arr/99', '/arr/-1', '/arr/01']

const leaf = fc.oneof(fc.constant(null), fc.boolean(), fc.integer({ min: -5, max: 5 }), fc.string({ maxLength: 3 }))
const jsonValue: fc.Arbitrary<Json> = fc.letrec<{ value: Json }>((tie) => ({
  value: fc.oneof(
    { depthSize: 'small', withCrossShrink: true },
    leaf,
    fc.array(tie('value'), { maxLength: 3 }),
    fc.dictionary(fc.constantFrom('a', 'b', 'k', 'arr', 'x'), tie('value'), { maxKeys: 3 }),
  ),
})).value

const rootDoc = fc.record({
  k: jsonValue,
  arr: fc.array(jsonValue, { maxLength: 4 }),
  obj: fc.dictionary(fc.constantFrom('a', 'b', 'c'), jsonValue, { maxKeys: 3 }),
})

interface Step {
  kind: number
  pick: number
  pick2: number
  bogus: number
  value: Json
}

const step: fc.Arbitrary<Step> = fc.record({
  kind: fc.nat({ max: 4 }),
  pick: fc.nat({ max: 10_000 }),
  pick2: fc.nat({ max: 10_000 }),
  bogus: fc.nat({ max: 19 }),
  value: jsonValue,
})

/** 한 걸음을 op 하나로 만든다. `bogus === 0`이면 틀린 경로를 쓴다. */
function opOf(doc: Json, s: Step): PatchOp {
  const { existing, insertable } = slotsOf(doc)
  const at = (list: string[], n: number) => (list.length === 0 ? '/nope' : list[n % list.length]!)
  const wrong = BOGUS[s.pick % BOGUS.length]!
  switch (s.kind) {
    case 0:
      return { op: 'add', path: s.bogus === 0 ? wrong : at(insertable, s.pick), value: s.value }
    case 1:
      return { op: 'remove', path: s.bogus === 0 ? wrong : at(existing, s.pick) }
    case 2:
      return { op: 'replace', path: s.bogus === 0 ? wrong : at(existing, s.pick), value: s.value }
    case 4: {
      // 반은 그 자리의 지금 값(맞음), 반은 무작위 값(대개 틀림). 넣을 자리(새 키 · 배열 끝)도 섞는다 — 없는 자리는 늘 틀림이다.
      const path = s.bogus === 0 ? wrong : s.pick2 % 3 === 2 ? at(insertable, s.pick) : at(existing, s.pick)
      let current: unknown
      try {
        current = getByPointer(doc, path)
      } catch {
        current = undefined
      }
      return { op: 'test', path, value: s.pick2 % 2 === 0 && current !== undefined ? structuredClone(current) : s.value }
    }
    default:
      // 목적지는 원래 문서의 자리에서 고른다 — 값을 뺀 뒤에는 없는 자리(출발지 안쪽 ·
      // 밀린 인덱스)가 섞여 move 의 던지는 갈래가 저절로 나온다.
      return { op: 'move', from: s.bogus === 0 ? wrong : at(existing, s.pick), path: at(insertable, s.pick2) }
  }
}

/** 기준 구현으로 진행하며 ops 를 만든다. 던지는 op 이 나오면 그것을 마지막으로 넣고 멈춘다. */
function buildOps(doc: Json, steps: Step[]): PatchOp[] {
  const ops: PatchOp[] = []
  let current = doc
  for (const s of steps) {
    const op = opOf(current, s)
    ops.push(op)
    try {
      current = referenceApplyOp(current, op)
    } catch {
      break
    }
  }
  return ops
}

type Outcome<T> = { ok: true; value: T } | { ok: false; name: string; message: string; path: unknown }

function run<T>(fn: () => T): Outcome<T> {
  try {
    return { ok: true, value: fn() }
  } catch (error) {
    const e = error as Error & { path?: unknown }
    return { ok: false, name: e.constructor.name, message: e.message, path: e.path }
  }
}

/** 결과 안의 모든 객체 · 배열. 참조를 견주려고 모은다. */
function objectsIn(value: unknown, into = new Set<unknown>()): Set<unknown> {
  if (value !== null && typeof value === 'object') {
    into.add(value)
    for (const child of Object.values(value)) objectsIn(child, into)
  }
  return into
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('제자리 적용이 연산마다 복제하는 구현과 같다', () => {
  it('문서 · 역연산 · 오류가 같고, 입력 문서와 ops 는 그대로다', () => {
    let threw = 0
    let threwAfterProgress = 0
    fc.assert(
      fc.property(rootDoc, fc.array(step, { minLength: 1, maxLength: 12 }), (doc, steps) => {
        const ops = buildOps(doc, steps)
        const docBefore = structuredClone(doc)
        const opsBefore = structuredClone(ops)

        const expectedApply = run(() => referenceApplyOps(doc, ops))
        const actualApply = run(() => applyOps(doc, ops))
        expect(actualApply).toEqual(expectedApply)

        const expectedInverse = run(() => referenceInvertOps(doc, ops))
        const actualInverse = run(() => invertOps(doc, ops))
        expect(actualInverse).toEqual(expectedInverse)

        expect(doc).toEqual(docBefore)
        expect(ops).toEqual(opsBefore)

        if (!actualApply.ok) {
          threw += 1
          if (ops.length > 1) threwAfterProgress += 1
          return
        }
        // 결과는 ops 의 값을 참조하지 않는다 — 뒤에 결과를 바꾸는 쪽이 호출자의 ops 를 못 건드린다.
        const inResult = objectsIn(actualApply.value)
        for (const op of ops) {
          if ('value' in op) for (const shared of objectsIn(op.value)) expect(inResult.has(shared)).toBe(false)
        }
        if (actualInverse.ok) expect(applyOps(actualApply.value, actualInverse.value)).toEqual(doc)
      }),
      { numRuns: 2000 },
    )
    // 비교가 성공 판만 본 것이 아님을 확인한다 — 던지는 판, 앞 op 이 사본을 바꾼 뒤 던지는 판이 섞였다.
    expect(threw).toBeGreaterThan(100)
    expect(threwAfterProgress).toBeGreaterThan(50)
  })

  /**
   * **시간이 아니라 횟수로 잰다.** 연산마다 문서를 복제하는 회귀는 두 경로(`move` · 나머지)에
   * 함께 실려 `inverse-bench.test.ts`의 비율을 움직이지 않고, 400노드에서 10ms 안팎이라 절대
   * 상한에도 안 걸린다. 서버는 이 둘을 페이지 행 잠금 안에서 부르므로(`apps/api/src/services/
   * edit-pipeline.ts`) 1MB 문서 · 200줄이면 그 회귀가 초 단위로 이벤트 루프를 멈춘다.
   */
  it('문서 전체를 한 번만 복제한다 — ops 수와 무관하다', () => {
    const doc = {
      version: 1,
      root: { id: 'n_root', children: Array.from({ length: 60 }, (_, i) => ({ id: `n_${i}`, props: { t: `${i}` } })) },
    }
    const ops: PatchOp[] = []
    for (let i = 0; i < 50; i += 1) {
      ops.push({ op: 'replace', path: `/root/children/${i}/props/t`, value: `바뀜 ${i}` })
      ops.push({ op: 'move', from: `/root/children/${i}`, path: `/root/children/${i + 1}` })
    }
    const spy = vi.spyOn(globalThis, 'structuredClone')
    const wholeDocClones = () => spy.mock.calls.filter(([value]) => value !== null && typeof value === 'object' && 'root' in value).length

    applyOps(doc, ops)
    const afterApply = wholeDocClones()
    invertOps(doc, ops)
    const afterInvert = wholeDocClones() - afterApply

    // 스파이가 실제로 불렸음을 먼저 본다 — 0 이 «안 셌다»가 아님을.
    expect(spy.mock.calls.length).toBeGreaterThan(50)
    expect({ afterApply, afterInvert }).toEqual({ afterApply: 1, afterInvert: 1 })
  })

  it('빈 목록이면 입력을 같은 참조로 돌려준다 — 복제하지 않는다', () => {
    const doc = { root: { children: [] } }
    expect(applyOps(doc, [])).toBe(doc)
    expect(referenceApplyOps(doc, [])).toBe(doc)
  })

  it('뒤 op 이 앞 op 이 넣은 값 안을 바꿔도 호출자의 ops 는 그대로다', () => {
    const inserted = { children: [] as unknown[] }
    const ops: PatchOp[] = [
      { op: 'add', path: '/root/box', value: inserted },
      { op: 'add', path: '/root/box/children/-', value: 'x' },
    ]
    const next = applyOps({ root: {} }, ops)
    expect(next).toEqual({ root: { box: { children: ['x'] } } })
    expect(inserted).toEqual({ children: [] })
  })
})
