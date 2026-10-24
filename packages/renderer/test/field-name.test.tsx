// @vitest-environment jsdom
/**
 * **값 칸 조각이 받는 필드 이름**(`src/render.tsx` 의 `fieldNames` → `ViewProps.field` → SDK 기본 뷰의 `aria-label` · `aria-required`). Chrome
 * 접근성 트리로 잰 이름은 `packages/theme-kit/build-test/field-a11y.test.ts` 가 갖는다 — 여기서는 그 판이 안 싣는 갈래를 jsdom 의 DOM 속성으로 잰다.
 *
 * | 케이스 | 무엇이 거짓이면 죽나 |
 * |---|---|
 * | 상태로 숨은 형제 | 숨은 조각까지 세어 남은 하나가 «기간 1» 이 된다 |
 * | 라벨 고침 | 조각이 캐시에서 옛 이름을 돌려받는다 |
 * | 빈 라벨 · 필드 안의 카드 | 빈 이름 · 손자 조각에 필드 이름이 선다 |
 */
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { installCatalog, type PageDocument, type WbNode } from '@wirebound/schema'
import { renderDocument } from '@wirebound/renderer'

beforeAll(() => installCatalog())
afterEach(() => cleanup())

const doc = (children: WbNode[]): PageDocument =>
  ({ version: 4, viewStates: [{ id: 's_a', name: 'A' }], root: { id: 'n_root', type: 'Page', children } }) as unknown as PageDocument

function names(document: PageDocument, viewState: string | null = null): Record<string, [string | null, string | null]> {
  const { container } = render(<>{renderDocument(document, { viewState })}</>)
  const out: Record<string, [string | null, string | null]> = {}
  for (const element of container.querySelectorAll('[data-wb-id]')) {
    const type = element.getAttribute('data-wb-component')
    if (type === 'Field' || type === 'Page' || type === 'Card') continue
    out[element.getAttribute('data-wb-id')!] = [element.getAttribute('aria-label'), element.getAttribute('aria-required')]
  }
  cleanup()
  return out
}

describe('필드 이름', () => {
  it('상태로 숨은 형제는 안 센다 — 그 판에 서는 조각이 하나면 라벨 그대로', () => {
    const range: WbNode = {
      id: 'f',
      type: 'Field',
      props: { label: '기간', required: true },
      children: [{ id: 'd1', type: 'DateInput' }, { id: 'd2', type: 'DateInput', visibility: { mode: 'only', states: ['s_a'] } } as WbNode],
    }
    expect(names(doc([range]))).toEqual({ d1: ['기간', 'true'] })
    expect(names(doc([range]), 's_a')).toEqual({ d1: ['기간 1', 'true'], d2: ['기간 2', 'true'] })
  })

  it('라벨을 고치면 조각의 이름도 바뀐다 — 조각은 캐시에서 옛 이름을 돌려받지 않는다', () => {
    const piece: WbNode = { id: 'i', type: 'Input' }
    const before = doc([{ id: 'f', type: 'Field', props: { label: '이름' }, children: [piece] }])
    expect(names(before)).toEqual({ i: ['이름', null] })
    // 조각 객체는 그대로다 — 편집은 지나는 길의 노드(필드 · 뿌리)만 새 객체로 만든다.
    const after = doc([{ id: 'f', type: 'Field', props: { label: '성명', required: true }, children: [piece] }])
    expect(names(after)).toEqual({ i: ['성명', 'true'] })
  })

  it('빈 라벨이면 조각은 제 이름(안내 · 종류)으로 선다 · 필드 안의 카드 속 조각은 필드 이름을 안 받는다', () => {
    expect(
      names(
        doc([
          { id: 'f1', type: 'Field', props: { label: '  ' }, children: [{ id: 'a', type: 'Input', props: { placeholder: '안내' } }] },
          {
            id: 'f2',
            type: 'Field',
            props: { label: '묶음', required: true },
            children: [{ id: 'c', type: 'Card', children: [{ id: 'b', type: 'Select' }] }],
          },
        ]),
      ),
    ).toEqual({ a: ['안내', null], b: ['== 선택 ==', null] })
  })
})
