import { describe, expect, it } from 'vitest'
import { applyOp, applyOps } from '../../src/patch/apply'
import { PatchError } from '../../src/patch/types'

interface TestChild {
  id: string
  type: string
  props: { content: string }
  marker?: number
}

interface TestDoc {
  version: number
  root: { id: string; type: string; children: TestChild[] }
}

function doc(): TestDoc {
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

describe('applyOp — replace', () => {
  it('객체 값을 바꾼다', () => {
    const next = applyOp(doc(), {
      op: 'replace',
      path: '/root/children/0/props/content',
      value: '다',
    })
    expect(next.root.children[0]!.props.content).toBe('다')
  })

  it('입력을 변경하지 않는다', () => {
    const original = doc()
    applyOp(original, { op: 'replace', path: '/root/children/0/props/content', value: '다' })
    expect(original.root.children[0]!.props.content).toBe('가')
  })

  it('없는 키를 바꾸려 하면 던진다', () => {
    expect(() =>
      applyOp(doc(), { op: 'replace', path: '/root/children/0/props/missing', value: 1 }),
    ).toThrow(PatchError)
  })
})

describe('applyOp — add', () => {
  it('배열 인덱스에 삽입한다', () => {
    const next = applyOp(doc(), {
      op: 'add',
      path: '/root/children/1',
      value: { id: 'n_000000000004', type: 'Divider' },
    })
    expect(next.root.children.map((c) => c.id)).toEqual([
      'n_000000000002',
      'n_000000000004',
      'n_000000000003',
    ])
  })

  it('- 는 배열 끝에 덧붙인다', () => {
    const next = applyOp(doc(), {
      op: 'add',
      path: '/root/children/-',
      value: { id: 'n_000000000004', type: 'Divider' },
    })
    expect(next.root.children).toHaveLength(3)
    expect(next.root.children[2]!.id).toBe('n_000000000004')
  })

  it('객체에 새 키를 넣는다', () => {
    const next = applyOp(doc(), { op: 'add', path: '/root/children/0/marker', value: 1 })
    expect(next.root.children[0]!.marker).toBe(1)
  })

  it('배열 범위를 벗어나면 던진다', () => {
    expect(() => applyOp(doc(), { op: 'add', path: '/root/children/9', value: {} })).toThrow(
      PatchError,
    )
  })
})

describe('applyOp — remove', () => {
  it('배열 요소를 지운다', () => {
    const next = applyOp(doc(), { op: 'remove', path: '/root/children/0' })
    expect(next.root.children.map((c) => c.id)).toEqual(['n_000000000003'])
  })

  it('객체 키를 지운다', () => {
    const next = applyOp(doc(), { op: 'remove', path: '/root/children/0/props/content' })
    expect(next.root.children[0]!.props).toEqual({})
  })

  it('없는 경로면 던진다', () => {
    expect(() => applyOp(doc(), { op: 'remove', path: '/root/children/9' })).toThrow(PatchError)
  })
})

describe('applyOp — move', () => {
  it('배열 안에서 자리를 옮긴다', () => {
    const next = applyOp(doc(), {
      op: 'move',
      from: '/root/children/0',
      path: '/root/children/1',
    })
    expect(next.root.children.map((c) => c.id)).toEqual([
      'n_000000000003',
      'n_000000000002',
    ])
  })

  it('없는 출발 경로면 던진다', () => {
    expect(() =>
      applyOp(doc(), { op: 'move', from: '/root/children/9', path: '/root/children/0' }),
    ).toThrow(PatchError)
  })
})

describe('applyOps', () => {
  it('연산을 순서대로 적용한다', () => {
    const next = applyOps(doc(), [
      { op: 'replace', path: '/root/children/0/props/content', value: '다' },
      { op: 'remove', path: '/root/children/1' },
    ])
    expect(next.root.children).toHaveLength(1)
    expect(next.root.children[0]!.props.content).toBe('다')
  })

  it('빈 목록이면 같은 내용을 돌려준다', () => {
    expect(applyOps(doc(), [])).toEqual(doc())
  })
})
