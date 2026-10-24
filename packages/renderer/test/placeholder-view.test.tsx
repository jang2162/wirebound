// @vitest-environment jsdom
/**
 * **자리표시자 기본 뷰**(`@wirebound/theme-sdk` 의 `PlaceholderView` · `placeholderVars`) — 정한 그리기 값만 뿌리의 노드 변수로 싣고, 몸통이 있으면
 * 라벨 대신 몸통을 그린다. 계산된 색(테마가 변수를 따르는가)은 jsdom 이 못 재 `packages/theme-kit/build-test/shots.test.ts` 가 잰다.
 */
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { installCatalog, type PageDocument } from '@wirebound/schema'
import { defaultViewsCss, PLACEHOLDER_VARS, placeholderVars } from '@wirebound/theme-sdk'
import { renderDocument } from '@wirebound/renderer'

beforeAll(() => {
  installCatalog()
})

afterEach(() => {
  cleanup()
})

function draw(node: Record<string, unknown>): HTMLElement {
  const doc = {
    version: 4,
    root: { id: 'page', type: 'Page', children: [{ id: 'ph', type: 'Placeholder', ...node }] },
  } as unknown as PageDocument
  const { container } = render(<>{renderDocument(doc)}</>)
  return container.querySelector<HTMLElement>('[data-wb-id="ph"]')!
}

/** 뿌리 inline style 의 `--wb-node-placeholder-*` 만. */
function vars(element: HTMLElement): Record<string, string> {
  const out: Record<string, string> = {}
  for (let i = 0; i < element.style.length; i++) {
    const name = element.style.item(i)
    if (name.startsWith('--wb-node-placeholder-')) out[name] = element.style.getPropertyValue(name)
  }
  return out
}

describe('자리표시자 기본 뷰', () => {
  it('정한 값 여덟을 단위와 함께 변수로 싣는다 · 표지 둘', () => {
    const el = draw({
      props: {
        width: 240,
        height: 64,
        background: '#fde047',
        border: 'solid',
        borderColor: '#dc2626',
        radius: 12,
        color: '#7c2d12',
        fontSize: 15,
        align: 'start',
        padding: 6,
      },
    })
    expect(vars(el)).toEqual({
      '--wb-node-placeholder-width': '240px',
      '--wb-node-placeholder-height': '64px',
      '--wb-node-placeholder-radius': '12px',
      '--wb-node-placeholder-font-size': '15px',
      '--wb-node-placeholder-padding': '6px',
      '--wb-node-placeholder-background': '#fde047',
      '--wb-node-placeholder-border-color': '#dc2626',
      '--wb-node-placeholder-color': '#7c2d12',
    })
    expect(el.getAttribute('data-wb-border')).toBe('solid')
    expect(el.getAttribute('data-wb-align')).toBe('start')
  })

  it('안 정한 값 · 빈 색은 싣지 않는다 — 테마 기본', () => {
    expect(vars(draw({ props: { label: '빈 칸', background: '', color: '' } }))).toEqual({})
  })

  it('placeholderVars 는 꼴 밖의 값을 안 싣는다 — 테마 뷰가 검증 전 값을 넘겨도 url( · ; · } 가 변수로 안 간다', () => {
    expect(
      placeholderVars({
        background: 'url(https://example.com/x.png)',
        borderColor: '#2563eb;color:red',
        color: '#FFFFFF',
        width: Number.POSITIVE_INFINITY,
        height: '64',
      }),
    ).toEqual({})
  })

  it('몸통이 없으면 라벨 · 있으면 라벨 대신 몸통', () => {
    const empty = draw({ props: { label: '광고' } })
    expect(empty.querySelector('[data-wb-part="label"]')?.textContent).toBe('광고')
    expect(empty.querySelector('[data-wb-part="content"]')).toBeNull()
    cleanup()
    const filled = draw({ props: { label: '광고' }, children: [{ id: 't', type: 'Text', props: { content: '퀴즈' } }] })
    expect(filled.querySelector('[data-wb-part="label"]')).toBeNull()
    expect(filled.querySelector('[data-wb-part="content"] [data-wb-id="t"]')?.textContent).toBe('퀴즈')
  })

  it('기본 CSS 가 자리표시자 뿌리마다 변수 여덟을 끊는다 — 바깥 값이 안쪽 자리표시자에 물려지지 않게', () => {
    expect(PLACEHOLDER_VARS).toHaveLength(8)
    const css = defaultViewsCss()
    const reset = /:where\(\[data-wb-component="Placeholder"\]\) \{([^}]*)\}/.exec(css)?.[1] ?? ''
    for (const name of PLACEHOLDER_VARS) expect(reset, name).toContain(`${name}: initial;`)
  })
})
