/**
 * **하단 바**(`src/shell/shell-footer.tsx`) — 통지 줄과 «컴포넌트»가 여기 서고, 캔버스 도구(뷰포트 · 줌)는 머리에 서는가.
 *
 * 통지마다 그 통지를 세우는 **실물 길**로 세운다(편집 거절 · 경고가 실린 답 · 남의 복원 프레임 · 테마 번들 실패 · 멤버십 신호) — 부품을
 * 떼어 그리면 «셸이 그 부품을 어디에 달았나»를 못 잰다. 통지가 무엇을 말하는지는 그 부품의 파일이 잰다.
 *
 * # 이 자가 못 보는 것
 *
 * - **잘림 · 캔버스가 주는 것**은 jsdom 이 못 잰다(레이아웃이 없다) — 둘이 함께 선 판이 **DOM 에 둘 다 있는가**까지다. 실브라우저 판은
 *   `build-test/editor-shell-layout.test.ts`.
 */
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import type { PageDocument } from '@wirebound/schema'
import { describe, expect, it } from 'vitest'
import { ApiError } from '../../src/api/client'
import type { PatchResult, ProjectRole, ProjectView } from '../../src/api/types'
import { PROJECT_ID, PROJECT_NAME, openPage, pageDoc } from '../editor-harness'
import { fakeRealtime } from '../fake-realtime'
import { adminThemeView, staticBundleLoader } from '../theme-loader'
import { treeTool, structureRowName } from '../panels/tree-row'

const PAIR: PageDocument = pageDoc({
  id: 'n-root',
  type: 'Page',
  children: [
    { id: 'n-a', type: 'Text', props: {} },
    { id: 'n-b', type: 'Divider', props: {} },
  ],
})

function project(role: ProjectRole): ProjectView {
  return { id: PROJECT_ID, name: PROJECT_NAME, slug: 'admin', description: null, role, themeRev: 0 }
}

function footer(): HTMLElement {
  return screen.getByRole('contentinfo', { name: '하단 바' })
}

function header(): HTMLElement {
  const found = document.body.querySelector<HTMLElement>('.wb-shell-header')
  if (found === null) throw new Error('셸 머리를 찾지 못했습니다')
  return found
}

/** 그 자리의 통지(`status` · `alert`) 글. */
function notices(box: HTMLElement): string[] {
  return [...within(box).queryAllByRole('status'), ...within(box).queryAllByRole('alert')].map((element) => element.textContent ?? '')
}

/** 구조 트리에서 첫 줄을 골라 «아래로»를 낸다 — REST 로 나간다. */
async function moveDown(): Promise<void> {
  const tree = screen.getByRole('region', { name: '구조 트리' })
  fireEvent.click(within(tree).getByRole('button', { name: structureRowName('Text') }))
  fireEvent.click(treeTool(tree, '아래로'))
  await act(async () => {})
}

/**
 * **캔버스 도구는 머리의 «편집 / 뷰» 뒤 · `…` 앞에 선다**(`src/routes/editor.tsx` 의 `wb-shell-head-tools`) — 하단 바에는 «컴포넌트»만 남는다.
 * jsdom 에는 `matchMedia` 가 없어 머리는 늘 펼친 단계다(`src/shell/head-fold.ts`) — 좁은 창의 접힘은 `build-test/editor-head-tools.test.ts`.
 */
describe('캔버스 도구는 머리에 있다', () => {
  it('뷰포트 폭 · 줌(축소 · 값 · 확대 · 화면 맞춤)이 머리의 모드 뒤 · `…` 앞에 있고 하단 바에는 «컴포넌트»만 있다', async () => {
    await openPage(PAIR)
    expect(within(header()).getByRole('combobox', { name: '뷰포트 폭' })).toBeTruthy()
    const zoom = within(header()).getByRole('group', { name: '줌' })
    expect(
      within(zoom)
        .getAllByRole('button')
        .map((button) => button.getAttribute('aria-label') ?? button.textContent),
    ).toEqual(['축소', '확대', '화면 맞춤'])
    expect(within(zoom).getByText('100%')).toBeTruthy()
    const order = [...header().querySelectorAll<HTMLElement>('[aria-label="모드"], select, [aria-label="줌"], [aria-haspopup="menu"]')].map(
      (element) => element.getAttribute('aria-label') ?? element.tagName.toLowerCase(),
    )
    // 상태 전환기(`shell/view-state-switcher.tsx`)는 머리 도구의 맨 앞이다 — 이 판은 상태 목록이 없어 «기본».
    // «보기»(`shell/view-menu.tsx`)는 «배치 선» 곁 · 모드 앞이다 — 하네스 테마가 영역을 선언하지 않아 꺼진 채 선다.
    expect(order).toEqual(['화면 상태: 기본', '보기', '모드', 'select', '줌', '더 보기'])

    expect(within(footer()).queryByRole('combobox', { name: '뷰포트 폭' })).toBeNull()
    expect(within(footer()).queryByRole('group', { name: '줌' })).toBeNull()
    expect(
      within(footer())
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['컴포넌트'])
  })

  it('뷰 모드에서도 뷰포트 폭 · 줌은 머리에 그대로다', async () => {
    await openPage(PAIR)
    fireEvent.click(within(header()).getByRole('button', { name: '뷰 모드' }))
    expect([
      within(header()).queryAllByRole('combobox', { name: '뷰포트 폭' }).length,
      within(header()).queryAllByRole('group', { name: '줌' }).length,
      within(footer())
        .queryAllByRole('button')
        .map((button) => button.textContent),
    ]).toEqual([1, 1, ['모듈']])
  })
})

describe('통지는 하단 바에 선다', () => {
  it('편집 실패(alert)', async () => {
    await openPage(PAIR, {
      apiOverrides: {
        patchOps: async () => {
          throw new ApiError(409, 'conflict', '남이 먼저 고쳤습니다 [T-FOOT]')
        },
      },
    })
    await moveDown()
    await waitFor(() => expect(notices(footer()).join(' | ')).toContain('[T-FOOT]'))
    expect(within(footer()).getByRole('alert').textContent).toContain('[T-FOOT]')
    expect(notices(header())).toEqual([])
  })

  it('편집 경고(status)', async () => {
    const answer: PatchResult = {
      seq: 8,
      revisionId: 'rev-8',
      inverse: [],
      schemaVersion: 1,
      warnings: [{ code: 'missing-interaction-target', severity: 'warning', nodeId: 'n-a', path: '/root', message: '끊긴 대상 [T-WARN]' }],
    } as PatchResult
    await openPage(PAIR, { apiOverrides: { patchOps: async () => answer } })
    await moveDown()
    await waitFor(() => expect(notices(footer()).join(' | ')).toContain('[T-WARN]'))
    expect(notices(header())).toEqual([])
  })

  it('테마를 못 실음(status)', async () => {
    await openPage(PAIR, {
      bundleLoader: staticBundleLoader({ 'system-admin@0.1.0': 'fail' }),
      apiOverrides: { getProjectTheme: async () => adminThemeView() },
    })
    await waitFor(() => expect(notices(footer()).join(' | ')).toContain('테마를 불러오지 못해'))
    expect(notices(header())).toEqual([])
  })

  /** 둘이 함께 선다 — 남의 복원(`RemoteAlert`)과 권한 바뀜. 한 자리를 덮어쓰지 않고 둘 다 DOM 에 있다(잘리지 않는지는 실브라우저). */
  it('남의 변경과 권한 바뀜이 함께 서면 둘 다 하단 바에 있다', async () => {
    let role: ProjectRole = 'editor'
    const rt = fakeRealtime(PROJECT_ID, 'u-1')
    await openPage(PAIR, { realtime: rt.realtime, apiOverrides: { getProject: async () => project(role) } })
    rt.open()

    rt.deliver({ type: 'restored', projectId: PROJECT_ID, snapshotId: 's1' })
    role = 'viewer'
    rt.deliver({ type: 'membership-changed', projectId: PROJECT_ID })
    await waitFor(() => expect(notices(footer()).join(' | ')).toContain('편집 권한이 없어져'))

    const said = notices(footer())
    expect(said.some((text) => text.includes('스냅샷이 복원됐습니다'))).toBe(true)
    expect(said.some((text) => text.startsWith('편집 권한이 없어져'))).toBe(true)
    expect(notices(header())).toEqual([])
  })
})
