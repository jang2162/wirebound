import { describe, expect, it } from 'vitest'
import { applyOps } from '../../src/patch/apply'
import { invertOps } from '../../src/patch/inverse'
import type { PatchOp } from '../../src/patch/types'

function doc() {
  return {
    version: 1,
    root: {
      id: 'n_000000000001',
      type: 'Page',
      children: [
        { id: 'n_000000000002', type: 'Text', props: { content: '가' } },
        { id: 'n_000000000003', type: 'Text', props: { content: '나' } },
      ],
    },
  }
}

function roundtrip(ops: PatchOp[]) {
  const before = doc()
  const after = applyOps(before, ops)
  const inverses = invertOps(before, ops)
  return applyOps(after, inverses)
}

/** 부모가 둘인 트리 — 서로 다른 children 배열 사이의 move를 검증하기 위한 픽스처 */
function nestedDoc() {
  return {
    version: 1,
    root: {
      id: 'n_000000000001',
      type: 'Page',
      children: [
        {
          id: 'n_000000000010',
          type: 'Card',
          children: [
            { id: 'n_000000000011', type: 'Text', props: { content: '가' } },
            { id: 'n_000000000012', type: 'Text', props: { content: '나' } },
          ],
        },
        {
          id: 'n_000000000020',
          type: 'Card',
          children: [{ id: 'n_000000000021', type: 'Text', props: { content: '다' } }],
        },
      ],
    },
  }
}

function nestedRoundtrip(ops: PatchOp[]) {
  const before = nestedDoc()
  const after = applyOps(before, ops)
  const inverses = invertOps(before, ops)
  return applyOps(after, inverses)
}

describe('invertOps', () => {
  it('replace의 역은 옛 값으로의 replace다', () => {
    const ops: PatchOp[] = [
      { op: 'replace', path: '/root/children/0/props/content', value: '다' },
    ]
    expect(invertOps(doc(), ops)).toEqual([
      { op: 'replace', path: '/root/children/0/props/content', value: '가' },
    ])
    expect(roundtrip(ops)).toEqual(doc())
  })

  it('배열 add의 역은 그 자리의 remove다', () => {
    const ops: PatchOp[] = [
      { op: 'add', path: '/root/children/1', value: { id: 'n_000000000004', type: 'Divider' } },
    ]
    expect(invertOps(doc(), ops)).toEqual([{ op: 'remove', path: '/root/children/1' }])
    expect(roundtrip(ops)).toEqual(doc())
  })

  it('- 로 덧붙인 add의 역은 마지막 인덱스의 remove다', () => {
    const ops: PatchOp[] = [
      { op: 'add', path: '/root/children/-', value: { id: 'n_000000000004', type: 'Divider' } },
    ]
    expect(invertOps(doc(), ops)).toEqual([{ op: 'remove', path: '/root/children/2' }])
    expect(roundtrip(ops)).toEqual(doc())
  })

  it('새 객체 키를 넣은 add의 역은 remove다', () => {
    const ops: PatchOp[] = [{ op: 'add', path: '/root/children/0/marker', value: 1 }]
    expect(invertOps(doc(), ops)).toEqual([{ op: 'remove', path: '/root/children/0/marker' }])
    expect(roundtrip(ops)).toEqual(doc())
  })

  it('기존 객체 키를 덮어쓴 add의 역은 replace다', () => {
    const ops: PatchOp[] = [{ op: 'add', path: '/root/children/0/type', value: 'Divider' }]
    expect(invertOps(doc(), ops)).toEqual([
      { op: 'replace', path: '/root/children/0/type', value: 'Text' },
    ])
    expect(roundtrip(ops)).toEqual(doc())
  })

  it('remove의 역은 옛 값의 add다', () => {
    const ops: PatchOp[] = [{ op: 'remove', path: '/root/children/0' }]
    expect(invertOps(doc(), ops)).toEqual([
      {
        op: 'add',
        path: '/root/children/0',
        value: { id: 'n_000000000002', type: 'Text', props: { content: '가' } },
      },
    ])
    expect(roundtrip(ops)).toEqual(doc())
  })

  it('move의 역은 반대 방향 move다', () => {
    const ops: PatchOp[] = [
      { op: 'move', from: '/root/children/0', path: '/root/children/1' },
    ]
    expect(invertOps(doc(), ops)).toEqual([
      { op: 'move', from: '/root/children/1', path: '/root/children/0' },
    ])
    expect(roundtrip(ops)).toEqual(doc())
  })

  it('서로 다른 부모의 children 배열 사이로 옮기는 move의 역은 반대 방향 move다', () => {
    const ops: PatchOp[] = [
      { op: 'move', from: '/root/children/0/children/0', path: '/root/children/1/children/1' },
    ]
    expect(invertOps(nestedDoc(), ops)).toEqual([
      { op: 'move', from: '/root/children/1/children/1', path: '/root/children/0/children/0' },
    ])
    expect(nestedRoundtrip(ops)).toEqual(nestedDoc())
  })

  it('반대 방향(옮겨간 쪽에서 원래 자리로)으로도 부모 간 move가 왕복된다', () => {
    const ops: PatchOp[] = [
      { op: 'move', from: '/root/children/1/children/0', path: '/root/children/0/children/2' },
    ]
    expect(invertOps(nestedDoc(), ops)).toEqual([
      { op: 'move', from: '/root/children/0/children/2', path: '/root/children/1/children/0' },
    ])
    expect(nestedRoundtrip(ops)).toEqual(nestedDoc())
  })

  it('여러 연산의 역은 역순으로 나온다', () => {
    const ops: PatchOp[] = [
      { op: 'replace', path: '/root/children/0/props/content', value: '다' },
      { op: 'remove', path: '/root/children/1' },
    ]
    const inverses = invertOps(doc(), ops)
    expect(inverses[0]!.op).toBe('add')
    expect(inverses[1]!.op).toBe('replace')
    expect(roundtrip(ops)).toEqual(doc())
  })

  it('입력 문서를 변경하지 않는다', () => {
    const original = doc()
    invertOps(original, [{ op: 'remove', path: '/root/children/0' }])
    expect(original.root.children).toHaveLength(2)
  })
})
