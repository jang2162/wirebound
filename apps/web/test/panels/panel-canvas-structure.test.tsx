/**
 * **속성 패널이 거르는 구조와 캔버스가 그리는 구조가 같다.**
 *
 * `visibleWhen`은 «지금 그려지는 구조»를 묻는다. 캔버스는 테마가 고른 구조로 그리므로 패널이 카탈로그의
 * 첫 구조를 보면 둘이 갈린다 — 시스템 테마 넷(`saas-marketing`·`portal`·`commerce`·`docs`)이 `List`를
 * `table` 아닌 것으로 그리는데, 그때 패널이 «컬럼»을 내밀면 캔버스에는 없는 속성을 고치게 된다
 * (`table` 밖의 `List` 구현체는 `columns`를 읽지 않는다 — `packages/renderer/src/structures/data.tsx`).
 *
 * **단언은 캔버스의 `data-wb-structure`를 기준으로 삼는다.** 기대 구조를 여기서 따로 계산하면 판정이
 * 두 벌이 되어, 둘이 함께 틀린 채 초록이 된다. 캔버스가 실제로 단 값과 패널의 필드를 맞댄다.
 *
 * `<App />`을 라우트째 렌더한다 — 캔버스와 패널이 한 셸 안에서 같은 표를 보는지가 요점이라, 패널만
 * 떼어 렌더하면 그 배선이 끊겨 있어도 초록이다.
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { resolveTheme, SYSTEM_THEME_IDS, systemTheme, themeStructures } from '@wirebound/themes'
import { describe, expect, it, vi } from 'vitest'
import type { ApiClient } from '../../src/api/client'
import type { ProjectTheme } from '../../src/api/types'
import { openPage, pageDoc, requireNode } from '../editor-harness'
import '../../src/catalog-setup'

const DOC = pageDoc({
  id: 'n-root',
  type: 'Page',
  children: [{ id: 'n-list', type: 'List', props: { columns: ['이름', '이메일'], items: 3 } }],
})

const COLUMNS_LABEL = '컬럼'

function panel(): HTMLElement {
  return screen.getByRole('complementary', { name: '우측 패널' })
}

function labels(): string[] {
  return [...panel().querySelectorAll('.wb-shell-prop-label')].map((element) => element.textContent ?? '')
}

function selectList(): void {
  const tree = screen.getByRole('region', { name: '구조 트리' })
  fireEvent.click(within(tree).getByRole('button', { name: 'List' }))
}

function canvasStructure(): string | null {
  return requireNode('n-list').getAttribute('data-wb-structure')
}

/**
 * 테마가 캔버스에 닿기를 기다릴 값. 캔버스는 테마를 받기 전에 카탈로그의 첫 구조로 먼저 그리므로,
 * 그 창에서 맞대면 두 쪽이 함께 `table`이라 무엇도 재지 못한다.
 */
function themeListStructure(id: string): string {
  const { theme } = resolveTheme(systemTheme(id))
  const structure = themeStructures(theme)['List']
  if (structure === undefined) throw new Error(`${id} 테마가 List 구조를 고르지 않았다`)
  return structure
}

function fixedTheme(id: string): Partial<ApiClient> {
  return {
    getProjectTheme: async () => ({ themeId: `th-${id}`, theme: systemTheme(id) ?? null, issues: [] }),
  }
}

describe('속성 패널과 캔버스의 구조', () => {
  // **표본이 두 갈래를 다 담는지 먼저 본다.** 모든 테마가 `table`을 고르면 아래 케이스는
  // 패널이 카탈로그의 첫 구조를 봐도 초록이다. 혼자 죽지는 않는다 — «고르개로 테마를 바꾸면 …»이
  // `portal`을 `table` 아닌 쪽으로 전제하므로 함께 죽는다. 이 케이스의 몫은 원인을 이름으로 말하는 것이다.
  it('시스템 테마 가운데 List를 table로 그리는 것과 아닌 것이 다 있다', () => {
    const structures = SYSTEM_THEME_IDS.map(themeListStructure)
    expect(structures).toContain('table')
    expect(structures.some((structure) => structure !== 'table')).toBe(true)
  })

  it.each(SYSTEM_THEME_IDS)('%s: 캔버스가 table일 때만 패널에 컬럼이 있다', async (id) => {
    await openPage(DOC, { apiOverrides: fixedTheme(id) })
    const expected = themeListStructure(id)
    await waitFor(() => expect(canvasStructure()).toBe(expected))

    selectList()

    // 양성 대조: 패널이 List를 그리고 있다. 이것이 없으면 아무것도 안 그리는 패널도 통과한다.
    expect(labels()).toContain('항목 수')
    expect(labels().includes(COLUMNS_LABEL)).toBe(canvasStructure() === 'table')
  })

  /**
   * **테마를 바꾸면 패널도 따라간다.** 고르개는 캔버스에만 재조회 신호를 준다
   * (`routes/editor.tsx`의 `themeReloadToken`) — 패널이 테마를 따로 읽으면 이 신호를 못 받아
   * 옛 구조에 머문다. 노드를 고른 채로 바꾸는 것은, 다시 고르면 패널이 새로 그려져 낡은 값이 가려지기 때문이다.
   */
  it('고르개로 테마를 바꾸면 고른 노드의 필드가 새 구조를 따른다', async () => {
    let chosen = 'admin'
    const theme = (): ProjectTheme => ({
      themeId: `th-${chosen}`,
      theme: systemTheme(chosen) ?? null,
      issues: [],
    })
    const setProjectTheme = vi.fn(async (_projectId: string, themeId: string | null) => {
      chosen = (themeId ?? '').replace(/^th-/, '')
      return theme()
    })
    await openPage(DOC, {
      apiOverrides: {
        listProjectThemes: async () =>
          ['admin', 'portal'].map((id) => ({ id: `th-${id}`, system: true, theme: systemTheme(id)! })),
        getProjectTheme: async () => theme(),
        setProjectTheme,
      },
    })
    await waitFor(() => expect(canvasStructure()).toBe('table'))
    selectList()
    expect(labels()).toContain(COLUMNS_LABEL)

    fireEvent.change(screen.getByRole('combobox', { name: '테마' }), { target: { value: 'th-portal' } })

    await waitFor(() => expect(canvasStructure()).toBe(themeListStructure('portal')))
    expect(labels()).toContain('항목 수')
    expect(labels()).not.toContain(COLUMNS_LABEL)
  })
})
