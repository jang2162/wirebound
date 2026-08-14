/**
 * **D2가 고른 갈래의 대가를 잰다** — 각 페이지가 셸을 통째로 갖는다.
 *
 * 계획이 *"재서 보고하라 — 페이지 하나당 바이트, 페이지가 늘 때 기울기"*라고 적은 자리다.
 * **수를 이 파일의 주석에 적지 않는다. 케이스가 만든다** — 값을 손으로 적으면 셸이 커진
 * 날 주석만 거짓이 된다. 여기 있는 것은 **관계**이고, 보고서가 그 관계를 실제 값으로 든다.
 *
 * ## 무엇이 늘어나나
 *
 * 셸 마크업 자체는 페이지마다 같은 크기다. 늘어나는 것은 **좌측 트리**다 — 페이지 하나가
 * 페이지 **전부**를 링크로 든다. 그래서 한 페이지 파일의 크기가 페이지 수에 비례하고,
 * 번들 전체는 페이지 수의 **제곱**으로 큰다.
 */
import { CATALOG_TYPES, listComponents, resetRegistry, type PageDocument } from '@wirebound/schema'
import { describe, expect, it } from 'vitest'
import { exportBundle } from '../src/bundle/index'
import { exportPage } from '../src/page'

const DOC: PageDocument = {
  version: 1,
  root: {
    id: 'n_000000000001',
    type: 'Page',
    children: [
      { id: 'n_000000000002', type: 'Text', props: { content: '회원 목록' } },
      { id: 'n_000000000003', type: 'List' },
    ],
  },
}

const encoder = new TextEncoder()

function bytes(value: string): number {
  return encoder.encode(value).length
}

function bundleOf(pageCount: number) {
  return exportBundle({
    pages: Array.from({ length: pageCount }, (_unused, index) => ({
      title: `페이지 ${index + 1}`,
      document: DOC,
    })),
  })
}

function firstPageBytes(pageCount: number): number {
  const bundle = bundleOf(pageCount)
  return bytes(bundle.files.find((file) => file.path === 'pages/페이지-1.html')!.content)
}

function htmlBytes(pageCount: number): number {
  return bundleOf(pageCount)
    .files.filter((file) => file.path.endsWith('.html'))
    .reduce((sum, file) => sum + bytes(file.content), 0)
}

describe('D2의 대가 — 셸이 페이지마다 반복된다', () => {
  it('셸이 페이지 한 장을 exportPage보다 크게 만든다', () => {
    const bare = bytes(exportPage({ document: DOC, title: '페이지 1' }).html)
    expect(firstPageBytes(1)).toBeGreaterThan(bare)
  })

  it('페이지가 늘면 각 페이지 파일이 커진다 — 트리가 전부를 든다', () => {
    expect(firstPageBytes(20)).toBeGreaterThan(firstPageBytes(1))
  })

  /** 늘어나는 양이 페이지 수에 **비례한다**. 줄당 비용이 일정하다는 뜻이다. */
  it('한 페이지 파일의 증가분이 페이지 수에 선형이다', () => {
    const perPageAt11 = (firstPageBytes(11) - firstPageBytes(1)) / 10
    const perPageAt21 = (firstPageBytes(21) - firstPageBytes(1)) / 20
    expect(Math.abs(perPageAt21 - perPageAt11)).toBeLessThan(perPageAt11 * 0.05)
  })

  /** 그래서 **전체는 제곱이다** — 페이지를 두 배로 늘리면 HTML 총량이 두 배를 넘는다. */
  it('HTML 총량이 페이지 수에 초선형이다', () => {
    expect(htmlBytes(40)).toBeGreaterThan(htmlBytes(20) * 2)
  })

  /** 자산은 페이지 수와 무관하다 — 그래서 링크로 걸었다(D6). */
  it('시트는 페이지 수와 무관하게 한 벌이다', () => {
    const assetsOf = (count: number) =>
      bundleOf(count)
        .files.filter((file) => file.path.startsWith('assets/'))
        .map((file) => bytes(file.content))
    expect(assetsOf(40)).toEqual(assetsOf(1))
  })
})

describe('재라 #7 — 페이지마다 exportPage를 불러도 카탈로그가 한 벌이다', () => {
  /**
   * 이월 §6이 *"멱등"*이라고 적었고 그 말이 뜻하는 관찰이 이것이다. **시간이 아니라 상태로
   * 잰다** — 시간은 기계마다 다르고 케이스에서 흔들린다. 보고서가 시간을 따로 든다.
   */
  it('페이지를 마흔 장 그려도 등록된 컴포넌트 수가 카탈로그와 같다', () => {
    resetRegistry()
    bundleOf(40)
    expect(listComponents()).toHaveLength(CATALOG_TYPES.length)
  })
})
