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

/**
 * 부모가 둘인 트리 — 서로 다른 children 배열 사이의 move를 검증하기 위한 픽스처.
 * 첫 카드의 props는 값이 든 객체 키를 목적지로 쓰는 move를 위해
 * 스칼라(title)·객체(meta)·배열(tags)을 모두 갖는다.
 */
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
          props: { title: '첫 카드', meta: { author: '가' }, tags: ['ㄱ', 'ㄴ'] },
          children: [
            { id: 'n_000000000011', type: 'Text', props: { content: '가' } },
            { id: 'n_000000000012', type: 'Text', props: { content: '나' } },
          ],
        },
        {
          id: 'n_000000000020',
          type: 'Card',
          props: { title: '둘째 카드' },
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
    const ops: PatchOp[] = [{ op: 'replace', path: '/root/children/0/props/content', value: '다' }]
    expect(invertOps(doc(), ops)).toEqual([{ op: 'replace', path: '/root/children/0/props/content', value: '가' }])
    expect(roundtrip(ops)).toEqual(doc())
  })

  it('배열 add의 역은 그 자리의 remove다', () => {
    const ops: PatchOp[] = [{ op: 'add', path: '/root/children/1', value: { id: 'n_000000000004', type: 'Divider' } }]
    expect(invertOps(doc(), ops)).toEqual([{ op: 'remove', path: '/root/children/1' }])
    expect(roundtrip(ops)).toEqual(doc())
  })

  it('- 로 덧붙인 add의 역은 마지막 인덱스의 remove다', () => {
    const ops: PatchOp[] = [{ op: 'add', path: '/root/children/-', value: { id: 'n_000000000004', type: 'Divider' } }]
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
    expect(invertOps(doc(), ops)).toEqual([{ op: 'replace', path: '/root/children/0/type', value: 'Text' }])
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
    const ops: PatchOp[] = [{ op: 'move', from: '/root/children/0', path: '/root/children/1' }]
    expect(invertOps(doc(), ops)).toEqual([{ op: 'move', from: '/root/children/1', path: '/root/children/0' }])
    expect(roundtrip(ops)).toEqual(doc())
  })

  it('서로 다른 부모의 children 배열 사이로 옮기는 move의 역은 반대 방향 move다', () => {
    const ops: PatchOp[] = [{ op: 'move', from: '/root/children/0/children/0', path: '/root/children/1/children/1' }]
    expect(invertOps(nestedDoc(), ops)).toEqual([{ op: 'move', from: '/root/children/1/children/1', path: '/root/children/0/children/0' }])
    expect(nestedRoundtrip(ops)).toEqual(nestedDoc())
  })

  it('반대 방향(옮겨간 쪽에서 원래 자리로)으로도 부모 간 move가 왕복된다', () => {
    const ops: PatchOp[] = [{ op: 'move', from: '/root/children/1/children/0', path: '/root/children/0/children/2' }]
    expect(invertOps(nestedDoc(), ops)).toEqual([{ op: 'move', from: '/root/children/0/children/2', path: '/root/children/1/children/0' }])
    expect(nestedRoundtrip(ops)).toEqual(nestedDoc())
  })

  it('같은 배열 끝(-)으로 옮긴 move의 역은 제거 후 길이 자리에서 되돌린다', () => {
    // 길이 2인 배열에서 0번을 빼면 1이 되므로 `-`는 인덱스 1이다.
    const ops: PatchOp[] = [{ op: 'move', from: '/root/children/0', path: '/root/children/-' }]
    expect(invertOps(doc(), ops)).toEqual([{ op: 'move', from: '/root/children/1', path: '/root/children/0' }])
    expect(roundtrip(ops)).toEqual(doc())
  })

  it('같은 부모의 children 끝(-)으로 옮긴 move도 왕복한다', () => {
    const ops: PatchOp[] = [{ op: 'move', from: '/root/children/0/children/0', path: '/root/children/0/children/-' }]
    expect(invertOps(nestedDoc(), ops)).toEqual([{ op: 'move', from: '/root/children/0/children/1', path: '/root/children/0/children/0' }])
    expect(nestedRoundtrip(ops)).toEqual(nestedDoc())
  })

  it('다른 부모의 children 끝(-)으로 옮긴 move의 역은 그 배열의 원래 길이 자리다', () => {
    // 목적지 배열은 제거의 영향을 받지 않으므로 길이 1 그대로 → `-`는 인덱스 1
    const ops: PatchOp[] = [{ op: 'move', from: '/root/children/0/children/0', path: '/root/children/1/children/-' }]
    expect(invertOps(nestedDoc(), ops)).toEqual([{ op: 'move', from: '/root/children/1/children/1', path: '/root/children/0/children/0' }])
    expect(nestedRoundtrip(ops)).toEqual(nestedDoc())
  })

  it('반대 방향으로 다른 부모의 children 끝(-)에 붙인 move도 왕복한다', () => {
    const ops: PatchOp[] = [{ op: 'move', from: '/root/children/1/children/0', path: '/root/children/0/children/-' }]
    expect(invertOps(nestedDoc(), ops)).toEqual([{ op: 'move', from: '/root/children/0/children/2', path: '/root/children/1/children/0' }])
    expect(nestedRoundtrip(ops)).toEqual(nestedDoc())
  })

  it('비어 있던 객체 키로 옮긴 move의 역은 반대 방향 move 하나다', () => {
    const ops: PatchOp[] = [{ op: 'move', from: '/root/children/1/children/0', path: '/root/children/0/props/extra' }]
    expect(invertOps(nestedDoc(), ops)).toEqual([{ op: 'move', from: '/root/children/0/props/extra', path: '/root/children/1/children/0' }])
    expect(nestedRoundtrip(ops)).toEqual(nestedDoc())
  })

  it('값이 든 객체 키를 덮은 move의 역은 replace 뒤 add다', () => {
    // 되돌리는 move는 목적지 키를 통째로 지우므로 덮인 스칼라를 담을 자리가 없다.
    const ops: PatchOp[] = [{ op: 'move', from: '/root/children/1/children/0', path: '/root/children/0/props/title' }]
    expect(invertOps(nestedDoc(), ops)).toEqual([
      { op: 'replace', path: '/root/children/0/props/title', value: '첫 카드' },
      {
        op: 'add',
        path: '/root/children/1/children/0',
        value: { id: 'n_000000000021', type: 'Text', props: { content: '다' } },
      },
    ])
    expect(nestedRoundtrip(ops)).toEqual(nestedDoc())
  })

  it('덮인 값이 객체여도 그대로 되살린다', () => {
    const ops: PatchOp[] = [{ op: 'move', from: '/root/children/1/children/0', path: '/root/children/0/props/meta' }]
    expect(invertOps(nestedDoc(), ops)).toEqual([
      { op: 'replace', path: '/root/children/0/props/meta', value: { author: '가' } },
      {
        op: 'add',
        path: '/root/children/1/children/0',
        value: { id: 'n_000000000021', type: 'Text', props: { content: '다' } },
      },
    ])
    expect(nestedRoundtrip(ops)).toEqual(nestedDoc())
  })

  it('덮인 값이 배열이어도 그대로 되살린다', () => {
    const ops: PatchOp[] = [{ op: 'move', from: '/root/children/1/children/0', path: '/root/children/0/props/tags' }]
    expect(invertOps(nestedDoc(), ops)).toEqual([
      { op: 'replace', path: '/root/children/0/props/tags', value: ['ㄱ', 'ㄴ'] },
      {
        op: 'add',
        path: '/root/children/1/children/0',
        value: { id: 'n_000000000021', type: 'Text', props: { content: '다' } },
      },
    ])
    expect(nestedRoundtrip(ops)).toEqual(nestedDoc())
  })

  it('앞자리를 빼서 인덱스가 밀린 목적지로 덮어써도 왕복한다', () => {
    // /root/children/0 을 빼면 둘째 카드가 0번으로 밀린다. 목적지는 그 밀린 카드의 키다.
    // 옮긴 노드를 먼저 되돌려 넣으면 인덱스가 다시 밀려 목적지가 어긋나므로 replace가 앞이어야 한다.
    const ops: PatchOp[] = [{ op: 'move', from: '/root/children/0', path: '/root/children/0/props/title' }]
    expect(invertOps(nestedDoc(), ops)).toEqual([
      { op: 'replace', path: '/root/children/0/props/title', value: '둘째 카드' },
      { op: 'add', path: '/root/children/0', value: nestedDoc().root.children[0] },
    ])
    expect(nestedRoundtrip(ops)).toEqual(nestedDoc())
  })

  it('덮어쓰는 move가 섞인 목록도 역순으로 합쳐져 왕복한다', () => {
    const ops: PatchOp[] = [
      { op: 'move', from: '/root/children/1/children/0', path: '/root/children/0/props/title' },
      { op: 'replace', path: '/root/children/0/children/0/props/content', value: '라' },
    ]
    const inverses = invertOps(nestedDoc(), ops)
    expect(inverses.map((op) => op.op)).toEqual(['replace', 'replace', 'add'])
    expect(nestedRoundtrip(ops)).toEqual(nestedDoc())
  })

  it('- 로 끝나는 move의 역을 실제로 적용할 수 있다', () => {
    const ops: PatchOp[] = [{ op: 'move', from: '/root/children/0/children/0', path: '/root/children/1/children/-' }]
    const before = nestedDoc()
    const after = applyOps(before, ops)
    expect(after.root.children[1]!.children).toHaveLength(2)
    expect(() => applyOps(after, invertOps(before, ops))).not.toThrow()
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
