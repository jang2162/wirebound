/**
 * **배치 미리보기 문서**(`src/canvas/canvas-preview.ts`) — 스토어 문서에 보인 자리의 미리보기 노드를 끼운 사본. 새 타입은 그 자리에 새 노드를,
 * 옮기기는 그 노드(서브트리)의 사본을 새 자리에 끼우고 원본은 그대로 둔다. 미리보기 노드의 id 는 원본 id 와 겹치지 않는다(머리 `wb:preview:` — 문서 id 의 꼴(`NODE_ID_PATTERN`) 밖의 글자라 유효 문서의 id 와 겹칠 수 없다).
 * 화면에서 반투명으로 보이는지 · 판정에 안 잡히는지는 실브라우저 판(`build-test/canvas-preview.test.ts`).
 */
import { NODE_ID_PATTERN, type PageDocument, type WbNode } from '@wirebound/schema'
import { describe, expect, it } from 'vitest'
import { isPreviewId, previewDocument } from '../../src/canvas/canvas-preview'

/**
 * ```
 * n-root (Page)
 * ├ n-a    (Text)
 * ├ n-box  (Card)
 * │  ├ n-in1 (Text)
 * │  └ n-in2 (Text)
 * └ n-b    (Text)
 * ```
 */
const DOC: PageDocument = {
  version: 1,
  root: {
    id: 'n-root',
    type: 'Page',
    children: [
      { id: 'n-a', type: 'Text', props: { content: '가' } },
      {
        id: 'n-box',
        type: 'Card',
        children: [
          { id: 'n-in1', type: 'Text' },
          { id: 'n-in2', type: 'Text' },
        ],
      },
      { id: 'n-b', type: 'Text' },
    ],
  },
} as PageDocument

/** 모양 — 미리보기 노드는 `*타입(원본 id 또는 new)`. */
function shape(node: WbNode): unknown {
  const name = isPreviewId(node.id) ? `*${node.type}(${node.id.replace(/^wb:preview:/, '').replace(/^\d+$/, 'new')})` : node.id
  return Array.isArray(node.children) && node.children.length > 0 ? { [name]: node.children.map((child) => shape(child as WbNode)) } : name
}

describe('previewDocument — 새 타입', () => {
  it('그 부모의 그 차례에 새 노드를 끼운다 · 스토어 문서는 그대로다', () => {
    const before = JSON.stringify(DOC)
    const out = previewDocument(DOC, { placing: { kind: 'new', type: 'Divider' }, target: { parentId: 'n-box', index: 1, placement: 'after' } })
    expect(shape(out!.root as WbNode)).toEqual({ 'n-root': ['n-a', { 'n-box': ['n-in1', '*Divider(new)', 'n-in2'] }, 'n-b'] })
    expect(JSON.stringify(DOC)).toBe(before)
  })

  it('자식이 없는 부모 · 페이지 끝', () => {
    const empty = previewDocument(DOC, { placing: { kind: 'new', type: 'Divider' }, target: { parentId: 'n-a', index: 0, placement: 'inside' } })
    expect(shape(empty!.root as WbNode)).toEqual({ 'n-root': [{ 'n-a': ['*Divider(new)'] }, { 'n-box': ['n-in1', 'n-in2'] }, 'n-b'] })
    const end = previewDocument(DOC, { placing: { kind: 'new', type: 'Divider' }, target: { parentId: 'n-root', index: 3, placement: 'inside' } })
    expect(shape(end!.root as WbNode)).toEqual({ 'n-root': ['n-a', { 'n-box': ['n-in1', 'n-in2'] }, 'n-b', '*Divider(new)'] })
  })

  it('같은 입력이면 같은 미리보기 id 다 — 다시 그릴 때 React 가 같은 요소로 잇는다', () => {
    const a = previewDocument(DOC, { placing: { kind: 'new', type: 'Divider' }, target: { parentId: 'n-root', index: 0, placement: 'before' } })
    const b = previewDocument(DOC, { placing: { kind: 'new', type: 'Divider' }, target: { parentId: 'n-box', index: 2, placement: 'inside' } })
    const idOf = (doc: PageDocument | null) => JSON.stringify(doc).match(/"(wb:preview:[^"]+)"/)?.[1]
    expect(idOf(a)).toBe(idOf(b))
    expect(isPreviewId(idOf(a)!)).toBe(true)
  })
})

describe('previewDocument — 옮기기', () => {
  it('사본을 새 자리에 끼우고 원본은 제자리에 둔다 — 사본의 id 는 서브트리 전부 미리보기 id 다', () => {
    const out = previewDocument(DOC, { placing: { kind: 'node', id: 'n-box' }, target: { parentId: 'n-root', index: 2, placement: 'after' } })
    expect(shape(out!.root as WbNode)).toEqual({
      'n-root': ['n-a', { 'n-box': ['n-in1', 'n-in2'] }, 'n-b', { '*Card(n-box)': ['*Text(n-in1)', '*Text(n-in2)'] }],
    })
  })

  // 판정의 `index` 는 «옮긴 뒤 그 부모 안 차례»다(`edit/structure-drop.ts` 머리말) — 원본이 남은 문서에서는 같은 부모의 뒤쪽이면 하나 민다.
  it('같은 부모 안에서 뒤로 — 판정의 «옮긴 뒤 차례»를 원본이 남은 문서의 차례로 바꾼다', () => {
    const back = previewDocument(DOC, { placing: { kind: 'node', id: 'n-a' }, target: { parentId: 'n-root', index: 1, placement: 'after' } })
    expect(shape(back!.root as WbNode)).toEqual({ 'n-root': ['n-a', { 'n-box': ['n-in1', 'n-in2'] }, '*Text(n-a)', 'n-b'] })
    const front = previewDocument(DOC, { placing: { kind: 'node', id: 'n-b' }, target: { parentId: 'n-root', index: 0, placement: 'before' } })
    expect(shape(front!.root as WbNode)).toEqual({ 'n-root': ['*Text(n-b)', 'n-a', { 'n-box': ['n-in1', 'n-in2'] }, 'n-b'] })
  })

  it('다른 부모로 — 차례 그대로', () => {
    const out = previewDocument(DOC, { placing: { kind: 'node', id: 'n-b' }, target: { parentId: 'n-box', index: 1, placement: 'before' } })
    expect(shape(out!.root as WbNode)).toEqual({ 'n-root': ['n-a', { 'n-box': ['n-in1', '*Text(n-b)', 'n-in2'] }, 'n-b'] })
  })
})

describe('previewDocument — 못 끼우면 null', () => {
  it('부모가 문서에 없다 · 옮길 노드가 없다 · 카탈로그에 없는 타입', () => {
    expect(previewDocument(DOC, { placing: { kind: 'new', type: 'Divider' }, target: { parentId: 'n-gone', index: 0, placement: 'inside' } })).toBeNull()
    expect(previewDocument(DOC, { placing: { kind: 'node', id: 'n-gone' }, target: { parentId: 'n-root', index: 0, placement: 'before' } })).toBeNull()
    expect(previewDocument(DOC, { placing: { kind: 'new', type: 'NoSuch' }, target: { parentId: 'n-root', index: 0, placement: 'before' } })).toBeNull()
  })
})

describe('isPreviewId', () => {
  it('미리보기 머리만 — 문서의 id 꼴(`NODE_ID_PATTERN`)에는 그 머리가 없다', () => {
    expect(isPreviewId('wb:preview:0')).toBe(true)
    expect(isPreviewId('wb:preview:n-box')).toBe(true)
    expect(NODE_ID_PATTERN.test('wb:preview:0')).toBe(false)
    expect(isPreviewId('wb-preview-0')).toBe(false)
    expect(isPreviewId('n-box')).toBe(false)
    expect(isPreviewId('')).toBe(false)
  })
})
