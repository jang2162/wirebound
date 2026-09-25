// @vitest-environment node
/**
 * **노드 id 로 붙잡은 ops 가 바뀐 문서에서 제 노드를 찾아가는가**(`src/store/anchored-ops.ts`). 판은 늘 «내 op 을 만든 문서 → 남이 같은 배열
 * 앞자리를 바꾼 문서»다 — 경로 그대로 얹으면 던지지 않고 **다른 노드**에 얹히는 판이라야 이 장치를 잰다.
 */
import { applyOps, CURRENT_DOCUMENT_VERSION, type PageDocument, type PatchOp, type WbNode } from '@wirebound/schema'
import { describe, expect, it } from 'vitest'
import { anchorOps, rebaseAnchored } from '../../src/store/anchored-ops'

const text = (id: string, content = id): WbNode => ({ id, type: 'Text', props: { content } })

function doc(children: WbNode[]): PageDocument {
  return { version: CURRENT_DOCUMENT_VERSION, root: { id: 'n_root', type: 'Container', children } }
}

/** `[가, 나, 다]` — 내 op 은 늘 «나»(자리 1)를 겨눈다. */
const MINE = doc([text('ga'), text('na'), text('da')])
/** 남이 맨 앞에 넣은 판 — 경로 그대로면 자리 1 은 «가»다. */
const FRONT_ADDED = applyOps(MINE, [{ op: 'add', path: '/root/children/0', value: text('bob') }])
/** 남이 첫째를 뺀 판 — 경로 그대로면 자리 1 은 «다»다. */
const FRONT_REMOVED = applyOps(MINE, [{ op: 'remove', path: '/root/children/0' }])

function contents(document: PageDocument): string[] {
  return (document.root.children ?? []).map((node) => String(node.props?.content ?? node.id))
}

/** `MINE`에서 지은 `ops`를 `target`으로 옮긴 결과. 못 얹으면 `null`. */
function rebase(ops: PatchOp[], target: PageDocument, source: PageDocument = MINE) {
  const anchored = anchorOps(source, ops)
  expect(anchored).not.toBeNull()
  return rebaseAnchored(target, anchored!)
}

describe('노드를 가리키는 op 은 그 id 의 지금 자리로 간다', () => {
  it.each([
    ['맨 앞에 넣은 판', FRONT_ADDED, '/root/children/2', ['bob', 'ga', 'da']],
    ['첫째를 뺀 판', FRONT_REMOVED, '/root/children/0', ['da']],
  ])('삭제 — %s', (_name, target, path, after) => {
    const result = rebase([{ op: 'remove', path: '/root/children/1' }], target)
    expect(result?.ops).toEqual([{ op: 'remove', path }])
    expect(contents(result!.document)).toEqual(after)
  })

  it.each([
    ['맨 앞에 넣은 판', FRONT_ADDED, '/root/children/2/props/content', ['bob', 'ga', '고침', 'da']],
    ['첫째를 뺀 판', FRONT_REMOVED, '/root/children/0/props/content', ['고침', 'da']],
  ])('필드 고침 — %s', (_name, target, path, after) => {
    const result = rebase([{ op: 'replace', path: '/root/children/1/props/content', value: '고침' }], target)
    expect(result?.ops).toEqual([{ op: 'replace', path, value: '고침' }])
    expect(contents(result!.document)).toEqual(after)
  })

  it('남이 그 노드를 다른 부모로 옮겼으면 옮긴 자리로 간다', () => {
    const nested = doc([{ id: 'box', type: 'Container', children: [] }, text('na')])
    const movedIn = applyOps(nested, [{ op: 'move', from: '/root/children/1', path: '/root/children/0/children/0' }])
    const result = rebase([{ op: 'replace', path: '/root/children/1/props/content', value: '고침' }], movedIn, nested)
    expect(result?.ops).toEqual([{ op: 'replace', path: '/root/children/0/children/0/props/content', value: '고침' }])
  })

  it('남이 그 노드를 지웠으면 못 얹는다', () => {
    const gone = applyOps(MINE, [{ op: 'remove', path: '/root/children/1' }])
    expect(rebase([{ op: 'replace', path: '/root/children/1/props/content', value: '고침' }], gone)).toBeNull()
    expect(rebase([{ op: 'remove', path: '/root/children/1' }], gone)).toBeNull()
  })

  it('노드 밖의 경로는 그대로다', () => {
    const result = rebase([{ op: 'replace', path: '/version', value: CURRENT_DOCUMENT_VERSION }], FRONT_ADDED)
    expect(result?.ops).toEqual([{ op: 'replace', path: '/version', value: CURRENT_DOCUMENT_VERSION }])
  })
})

describe('넣을 자리는 앞 형제 뒤다', () => {
  it('«나» 뒤에 넣는 편집은 남이 앞에 넣어도 «나» 뒤에 선다', () => {
    const result = rebase([{ op: 'add', path: '/root/children/2', value: text('mine') }], FRONT_ADDED)
    expect(result?.ops).toEqual([{ op: 'add', path: '/root/children/3', value: text('mine') }])
    expect(contents(result!.document)).toEqual(['bob', 'ga', 'na', 'mine', 'da'])
  })

  it('남이 같은 틈에 넣었으면 앞 형제 바로 뒤다 — 뒤 형제 앞이 아니다', () => {
    const sameGap = applyOps(MINE, [{ op: 'add', path: '/root/children/2', value: text('bob') }])
    const result = rebase([{ op: 'add', path: '/root/children/2', value: text('mine') }], sameGap)
    expect(contents(result!.document)).toEqual(['ga', 'na', 'mine', 'bob', 'da'])
  })

  it('op 이 여럿인 넣기(패턴)는 뒤 op 의 앞 형제가 앞 op 이 넣은 노드다', () => {
    const ops: PatchOp[] = [
      { op: 'add', path: '/root/children/1', value: text('m1') },
      { op: 'add', path: '/root/children/2', value: text('m2') },
    ]
    const result = rebase(ops, FRONT_ADDED)
    expect(contents(result!.document)).toEqual(['bob', 'ga', 'm1', 'm2', 'na', 'da'])
  })

  it('맨 앞에 넣는 편집은 맨 앞이다 — 남이 그 앞에 넣었어도', () => {
    const result = rebase([{ op: 'add', path: '/root/children/0', value: text('mine') }], FRONT_ADDED)
    expect(contents(result!.document)).toEqual(['mine', 'bob', 'ga', 'na', 'da'])
  })

  it('앞 형제가 사라졌으면 뒤 형제 앞이다', () => {
    const naGone = applyOps(MINE, [{ op: 'remove', path: '/root/children/1' }])
    const result = rebase([{ op: 'add', path: '/root/children/2', value: text('mine') }], naGone)
    expect(contents(result!.document)).toEqual(['ga', 'mine', 'da'])
  })

  it('끝에 넣는 편집은 앞 형제가 사라져도 끝이다', () => {
    const daGone = applyOps(MINE, [{ op: 'remove', path: '/root/children/2' }])
    const result = rebase([{ op: 'add', path: '/root/children/3', value: text('mine') }], daGone)
    expect(contents(result!.document)).toEqual(['ga', 'na', 'mine'])
  })

  it('양옆 형제가 함께 사라졌으면 살아 있는 더 앞의 형제 뒤다 — 옛 index 로 떨어지지 않는다', () => {
    const four = doc([text('a'), text('b'), text('c'), text('d')])
    // b · c 가 지워지고 맨 앞에 x · y 가, a · d 사이에 z 가 들어왔다 — 옛 index 2 는 남이 넣은 x 뒤고, 뒤 형제 d 앞은 z 뒤다.
    const bobs = applyOps(four, [
      { op: 'remove', path: '/root/children/2' },
      { op: 'remove', path: '/root/children/1' },
      { op: 'add', path: '/root/children/0', value: text('x') },
      { op: 'add', path: '/root/children/0', value: text('y') },
      { op: 'add', path: '/root/children/3', value: text('z') },
    ])
    const result = rebase([{ op: 'add', path: '/root/children/2', value: text('mine') }], bobs, four)
    expect(contents(result!.document)).toEqual(['y', 'x', 'a', 'mine', 'z', 'd'])
  })

  /** 형제는 원래 거리 순으로 본다 — 앞 형제 줄을 끝까지 먼저 보면 원래 틈을 떠나 남이 그 사이에 넣은 노드들 앞에 선다. */
  it('바로 앞 형제가 사라지고 바로 뒤 형제가 살았으면 뒤 형제 바로 앞이다 — 더 먼 앞 형제 뒤로 가지 않는다', () => {
    const four = doc([text('a'), text('b'), text('c'), text('d')])
    const bobs = applyOps(four, [
      { op: 'remove', path: '/root/children/1' },
      { op: 'add', path: '/root/children/1', value: text('x') },
      { op: 'add', path: '/root/children/2', value: text('y') },
      { op: 'add', path: '/root/children/3', value: text('z') },
    ])
    const result = rebase([{ op: 'add', path: '/root/children/2', value: text('mine') }], bobs, four)
    expect(contents(result!.document)).toEqual(['a', 'x', 'y', 'z', 'mine', 'c', 'd'])
  })

  it('앞 형제가 다 사라졌으면 살아 있는 더 뒤의 형제 앞이다', () => {
    const four = doc([text('a'), text('b'), text('c'), text('d')])
    const bobs = applyOps(four, [
      { op: 'remove', path: '/root/children/2' },
      { op: 'remove', path: '/root/children/1' },
      { op: 'remove', path: '/root/children/0' },
      { op: 'add', path: '/root/children/0', value: text('x') },
    ])
    // 앞 형제 a · b 와 바로 뒤 형제 c 가 없다 — 남은 뒤 형제 d 앞이다. 옛 index 2 면 d 뒤(끝)다.
    const result = rebase([{ op: 'add', path: '/root/children/2', value: text('mine') }], bobs, four)
    expect(contents(result!.document)).toEqual(['x', 'mine', 'd'])
  })

  it('«아래로»는 옮기는 노드와 목적지를 둘 다 다시 짓는다', () => {
    const result = rebase([{ op: 'move', from: '/root/children/1', path: '/root/children/2' }], FRONT_ADDED)
    expect(result?.ops).toEqual([{ op: 'move', from: '/root/children/2', path: '/root/children/3' }])
    expect(contents(result!.document)).toEqual(['bob', 'ga', 'da', 'na'])
  })

  it('op 이 둘인 이동(빈 부모에 배열을 먼저 놓음)도 뒤 op 을 앞 op 을 얹은 문서에서 짓는다', () => {
    const source = doc([text('ga'), { id: 'box', type: 'Container' }, text('na')])
    const ops: PatchOp[] = [
      { op: 'add', path: '/root/children/1/children', value: [] },
      { op: 'move', from: '/root/children/2', path: '/root/children/1/children/0' },
    ]
    const target = applyOps(source, [{ op: 'add', path: '/root/children/0', value: text('bob') }])
    const result = rebase(ops, target, source)
    expect(result?.ops).toEqual([
      { op: 'add', path: '/root/children/2/children', value: [] },
      { op: 'move', from: '/root/children/3', path: '/root/children/2/children/0' },
    ])
  })
})

describe('전제가 바뀐 op 은 얹지 않는다', () => {
  it('빈 컨테이너에 첫 자식을 배열째 넣는 편집은 남이 먼저 자식을 넣었으면 못 얹는다 — 남의 자식을 덮는다', () => {
    const source = doc([{ id: 'box', type: 'Container' }])
    const ops: PatchOp[] = [{ op: 'add', path: '/root/children/0/children', value: [text('mine')] }]
    const target = applyOps(source, [{ op: 'add', path: '/root/children/0/children', value: [text('bob')] }])
    expect(rebase(ops, target, source)).toBeNull()
    // 음성 대조: 그 사이 다른 자리만 바뀌었으면 얹는다.
    expect(rebase(ops, applyOps(source, [{ op: 'add', path: '/root/children/0', value: text('bob') }]), source)).not.toBeNull()
  })

  it('없던 필드를 만드는 `add`는 남이 먼저 그 필드를 만들었으면 못 얹는다 — 남의 값을 덮는다', () => {
    const source = doc([{ id: 'bare', type: 'Text' }])
    const ops: PatchOp[] = [{ op: 'add', path: '/root/children/0/props', value: { content: '내 글' } }]
    const target = applyOps(source, [{ op: 'add', path: '/root/children/0/props', value: { content: '밥의 글', level: 2 } }])
    expect(rebase(ops, target, source)).toBeNull()
  })

  it('자식 줄을 통째로 갈아 끼우는 편집(프리셋)은 그 사이 자식 줄이 바뀌었으면 못 얹는다', () => {
    const ops: PatchOp[] = [{ op: 'replace', path: '/root/children', value: [text('preset')] }]
    expect(rebase(ops, FRONT_ADDED)).toBeNull()
    // 음성 대조: 자식 줄은 그대로이고 글만 바뀌었으면 얹는다.
    const edited = applyOps(MINE, [{ op: 'replace', path: '/root/children/0/props/content', value: '밥' }])
    expect(rebase(ops, edited)).not.toBeNull()
  })
})
