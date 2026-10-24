// @vitest-environment jsdom
/**
 * **필드와 자리표시자가 서로의 안에 설 때의 그리기** — 필드 이름(`src/render.tsx` 의 `fieldNames`)은 `Field` 의 값 칸에 선 입력 조각만 세고, 자리표시자의
 * 그림(`RenderOptions.assetUrl` → SDK `useAsset`)과 몸통(`content`)은 겹친 자리에서도 선다. 검증 · 그림 걷기는 `packages/schema/test/field-placeholder.test.ts`.
 *
 * | 케이스 | 무엇이 거짓이면 죽나 |
 * |---|---|
 * | 필드 값 칸 안의 자리표시자 | 자리표시자도 값 조각으로 세어 형제 입력이 «라벨 1» 이 된다 |
 * | 자리표시자 몸통 안의 필드 | 필드가 아닌 부모(자리표시자의 `label`)도 몸통 조각에 이름을 준다 |
 */
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { installCatalog, type PageDocument, type WbNode } from '@wirebound/schema'
import { renderDocument } from '@wirebound/renderer'

beforeAll(() => installCatalog())
afterEach(() => cleanup())

const A = 'a'.repeat(64)
const B = 'b'.repeat(64)

const doc = (children: WbNode[]): PageDocument =>
  ({ version: 4, root: { id: 'n_root', type: 'Page', children } }) as unknown as PageDocument

/** 그림 id → 표본 주소. 그리는 자리마다 다른 주소를 주는 것을 흉내 낸다. */
const assetUrl = (id: string): string => `/asset/${id.slice(0, 4)}`

function draw(children: WbNode[]): HTMLElement {
  return render(<>{renderDocument(doc(children), { assetUrl })}</>).container
}

const byId = (container: HTMLElement, id: string): HTMLElement => container.querySelector<HTMLElement>(`[data-wb-id="${id}"]`)!

/** 노드 뿌리의 바로 밑 조각 이름 — 자리표시자가 라벨 · 그림 · 몸통 가운데 무엇을 세웠나. */
const partsOf = (element: HTMLElement): string[] =>
  [...element.children].map((child) => child.getAttribute('data-wb-part') ?? child.tagName.toLowerCase())

describe('필드 × 자리표시자 — 그리기', () => {
  it('필드 값 칸 안의 자리표시자 — 입력은 필드 이름을 그대로 받고, 자리표시자는 이름을 안 받고 제 그림을 그린다', () => {
    const container = draw([
      {
        id: 'n_field',
        type: 'Field',
        props: { label: '증빙', required: true },
        children: [
          { id: 'n_input', type: 'Input' },
          { id: 'n_ph', type: 'Placeholder', props: { label: '첨부 미리보기', image: A } },
        ],
      },
    ])
    const field = byId(container, 'n_field')
    const input = byId(container, 'n_input')
    const ph = byId(container, 'n_ph')
    expect(field.contains(ph)).toBe(true)
    // 값 조각은 입력 하나 — 자리표시자를 세면 «증빙 1» 이 된다.
    expect([input.getAttribute('aria-label'), input.getAttribute('aria-required')]).toEqual(['증빙', 'true'])
    expect([ph.getAttribute('aria-label'), ph.getAttribute('aria-required')]).toEqual([null, null])
    expect(partsOf(ph)).toEqual(['image'])
    const image = ph.querySelector('img')!
    expect([image.getAttribute('src'), image.getAttribute('alt')]).toEqual(['/asset/aaaa', '첨부 미리보기'])
  })

  it('자리표시자 몸통 안의 필드 — 몸통이 서고 라벨은 안 서며, 필드 안 입력은 필드 라벨을 · 몸통에 바로 선 입력은 제 이름을 받고 안쪽 자리표시자도 제 그림을 그린다', () => {
    const container = draw([
      {
        id: 'n_outer',
        type: 'Placeholder',
        props: { label: '배너', image: A, width: 600, height: 200 },
        children: [
          {
            id: 'n_field',
            type: 'Field',
            props: { label: '문구' },
            children: [{ id: 'n_input', type: 'Input' }],
          },
          { id: 'n_loose', type: 'Input', props: { placeholder: '검색어' } },
          { id: 'n_inner', type: 'Placeholder', props: { label: '아이콘', image: B } },
        ],
      },
    ])
    const outer = byId(container, 'n_outer')
    expect(partsOf(outer)).toEqual(['image', 'content'])
    expect(outer.querySelector(':scope > img')!.getAttribute('data-wb-frame')).toBe('box')
    expect(outer.querySelector(':scope > [data-wb-part="content"]')!.contains(byId(container, 'n_field'))).toBe(true)
    expect(byId(container, 'n_input').getAttribute('aria-label')).toBe('문구')
    // 자리표시자의 `label` 은 필드 라벨이 아니다 — 몸통에 바로 선 입력은 제 안내 문구로 선다.
    expect(byId(container, 'n_loose').getAttribute('aria-label')).toBe('검색어')
    expect(byId(container, 'n_inner').querySelector('img')!.getAttribute('src')).toBe('/asset/bbbb')
  })
})
