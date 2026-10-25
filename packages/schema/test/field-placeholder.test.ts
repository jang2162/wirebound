/**
 * **필드와 자리표시자가 서로의 안에 설 때** — 필드의 값 칸(`Field` 몸통 — 무엇이든 받는다)에 자리표시자가, 자리표시자의 몸통에 필드가 선다. 둘은 다른
 * 트랙에서 들어와(값 칸 · 몸통) 서로를 모른 채 지어졌다. 판마다 검증 오류가 없는지와 그림 걷기(`imageIdsIn` · `clearImages` — 붙이기 · 모듈 저장 ·
 * 번들이 부른다)가 겹친 안쪽까지 닿는지를 잰다. 그리기는 `packages/renderer/test/field-placeholder.test.tsx`.
 *
 * | 케이스 | 무엇이 거짓이면 죽나 |
 * |---|---|
 * | 필드 값 칸 안의 자리표시자 | 값 칸이 입력 조각만 받게 좁혀진다(`accepts`). 늘 남과 함께 죽는다 — 받는 타입 목록은 `component/catalog.test.ts`
 * «받는 타입 제약은 탭 하나다», 값 칸이 무엇이든 받는다는 것은 `component/compose-input.test.ts` «값 구역은 몸통 하나이고 …» 가 소유하고, 이
 * 케이스는 그 판에서 걷기 · 비우기가 값 칸 안까지 닿는지를 함께 잰다 |
 * | 자리표시자 몸통 안의 필드 | 그림을 든 자리표시자에서 걷기가 멈춰 몸통 안 필드의 그림을 못 본다 |
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { clearImages, imageIdsIn, installCatalog, validatePage, type PageDocument, type WbNode } from '../src'

beforeAll(() => installCatalog())

const A = 'a'.repeat(64)
const B = 'b'.repeat(64)

const page = (children: WbNode[]): PageDocument =>
  ({ version: 5, root: { id: 'n_root', type: 'Page', children } }) as unknown as PageDocument

/** 오류만 — 경고는 이 판들과 무관한 축이다. */
function errorsOf(doc: PageDocument): string[] {
  return validatePage(doc)
    .filter((issue) => issue.severity !== 'warning')
    .map((issue) => `${issue.path} ${issue.message}`)
}

describe('필드 × 자리표시자', () => {
  it('필드 값 칸 안의 자리표시자 — 검증 오류 0 · 그림을 걷고 비운다(필드 · 형제 조각은 그대로)', () => {
    const field: WbNode = {
      id: 'n_field',
      type: 'Field',
      props: { label: '증빙', required: true },
      children: [
        { id: 'n_input', type: 'Input' },
        { id: 'n_ph', type: 'Placeholder', props: { label: '첨부 미리보기', image: A } },
      ],
    }
    const doc = page([field])
    expect(errorsOf(doc)).toEqual([])
    expect(imageIdsIn([doc.root])).toEqual([A])

    const { nodes, cleared } = clearImages([doc.root], new Set([A]))
    expect(cleared).toBe(1)
    const after = nodes[0]!.children![0]!
    expect(after.props).toEqual(field.props)
    expect(after.children!.map((child) => [child.id, child.type, child.props])).toEqual([
      ['n_input', 'Input', undefined],
      ['n_ph', 'Placeholder', { label: '첨부 미리보기' }],
    ])
    expect(errorsOf({ ...doc, root: nodes[0]! })).toEqual([])
  })

  it('자리표시자 몸통 안의 필드 — 검증 오류 0 · 바깥 그림과 필드 값 칸 안의 그림을 둘 다 걷고, 고른 것만 비운다', () => {
    const outer: WbNode = {
      id: 'n_outer',
      type: 'Placeholder',
      props: { label: '배너', image: A, width: 600, height: 200 },
      children: [
        {
          id: 'n_field',
          type: 'Field',
          props: { label: '문구' },
          children: [
            { id: 'n_input', type: 'Input' },
            { id: 'n_inner', type: 'Placeholder', props: { label: '아이콘', image: B } },
          ],
        },
      ],
    }
    const doc = page([outer])
    expect(errorsOf(doc)).toEqual([])
    expect(imageIdsIn([doc.root])).toEqual([A, B])

    const inner = clearImages([doc.root], new Set([B]))
    expect(inner.cleared).toBe(1)
    expect(imageIdsIn(inner.nodes)).toEqual([A])
    expect(errorsOf({ ...doc, root: inner.nodes[0]! })).toEqual([])

    expect(clearImages([doc.root], new Set([A, B])).cleared).toBe(2)
  })
})
