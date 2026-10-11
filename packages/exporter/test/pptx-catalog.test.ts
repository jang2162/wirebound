/**
 * **카탈로그를 안 설치하면 문장이 조용히 나빠진다** — `exportPptx`가 그것을 부르는지 잰다.
 *
 * 번들은 구조 판정(`bundle/index.ts` 의 `structuralErrors`)을 지나며 설치되지만 **PPTX는 그리지 않는다.** 그래서
 * 이 자리를 물려받지 못하고, 안 부르면 상호작용 문장의 **prop 이름이 영문 그대로** 나온다.
 * `packages/cli`의 `read/catalog.ts`가 `pageView`에 대해 같은 값을 재서 같은 말을 적었다.
 *
 * ---
 *
 * # 파일이 따로 있는 이유
 *
 * `resetRegistry()`는 **프로세스 전역**을 비운다. vitest 는 파일마다 격리해서 돌리므로
 * 여기서 비워도 다른 파일이 안 다친다 — 같은 파일에 다른 케이스를 두면 그쪽이 빈
 * 레지스트리를 보게 된다.
 */
import { resetRegistry, type PageDocument } from '@wirebound/schema'
import { findAll, parseXml, textOf } from '@wirebound/exporter/test-support'
import { beforeEach, describe, expect, it } from 'vitest'
import { exportPptx } from '../src/pptx/index'

const DOCUMENT: PageDocument = {
  version: 1,
  root: {
    id: 'n_000000000001',
    type: 'Page',
    children: [
      {
        id: 'n_000000000002',
        type: 'Button',
        props: { label: '검색' },
        marker: 1,
        interactions: [{ on: 'click', actions: [{ type: 'setProp', target: 'n_000000000003', prop: 'loading', value: true }] }],
      },
      { id: 'n_000000000003', type: 'List', props: {}, marker: 2 },
    ],
  },
}

function 첫슬라이드글자(): string[] {
  const { parts } = exportPptx({ pages: [{ title: '관리자 · 회원 · 목록', document: DOCUMENT }] })
  const slide = parts.find((part) => part.path === 'ppt/slides/slide1.xml')!
  return findAll(parseXml(slide.content as string), 'a:t').map(textOf)
}

describe('exportPptx 가 카탈로그를 설치한다', () => {
  beforeEach(() => {
    // **비운 상태에서 시작한다.** 다른 케이스가 이미 설치해 두었으면 이 자를 못 쓴다.
    resetRegistry()
  })

  /**
   * **prop 의 한국어 라벨은 카탈로그에서 온다.** 설치가 없으면 `propLabel`이 영문 prop
   * 이름(`loading`)을 그대로 쓴다 — 던지지도 않고 문장 개수도 그대로다.
   */
  it('prop 을 한국어 라벨로 부른다 — 안 부르면 영문 prop 이름이 나온다', () => {
    const 문장 = 첫슬라이드글자().find((text) => text.includes('클릭 시'))
    expect(문장).toBeDefined()
    expect(문장).not.toContain('loading')
    expect(문장).toContain('로딩 상태')
  })

  /** 노드 이름도 카탈로그가 준다(`COMPONENT_NOUNS`는 정적 표라 이쪽은 설치와 무관하다). */
  it('노드를 번호와 이름으로 부른다', () => {
    expect(첫슬라이드글자().some((text) => text.includes('① 검색 버튼'))).toBe(true)
  })

  /** **자가 진짜로 비운 상태를 본다** — 비우지 않으면 위 케이스가 공허하게 통과한다. */
  it('레지스트리를 비우면 실제로 빈다 — 카나리아', async () => {
    resetRegistry()
    const { listComponents } = await import('@wirebound/schema')
    expect(listComponents()).toHaveLength(0)
  })
})
