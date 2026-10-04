/**
 * **에디터 머리**(`src/routes/editor.tsx`) — 로고 · 이름 · 가운데 도구 · `…`(spec `docs/superpowers/specs/2026-09-30-editor-shell-design.md`
 * 「셸의 머리」 · 「`…` 메뉴」). 항목이 여는 것의 속(스냅샷 · 내보내기 · 로그아웃)은 그 화면의 파일이 잰다 — 여기는 **머리에 무엇이 달렸고
 * 무엇이 빠졌는가**와 `…` 가 무엇을 여는가다.
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { ProjectRole, ProjectView } from '../../src/api/types'
import { PROJECT_ID, PROJECT_NAME, SHELL_MENU, chooseFromShellMenu, openPage, pageDoc } from '../editor-harness'
import { openedMenu } from '../opened-menu'

const DOC = pageDoc({ id: 'n-root', type: 'Page', children: [] })

function project(role: ProjectRole): ProjectView {
  return { id: PROJECT_ID, name: PROJECT_NAME, slug: 'admin', description: null, role, themeRev: 0 }
}

async function open(role: ProjectRole): Promise<void> {
  await openPage(DOC, {
    apiOverrides: {
      getProject: async () => project(role),
      listSnapshots: async () => [],
      getExportPreview: async () => ({
        format: 'html',
        pages: [],
        duplicateTargets: [],
        brokenLinks: [],
        errors: [],
        themeId: null,
        themeWarning: null,
        fileName: 'admin.zip',
      }),
    },
  })
}

function header(): HTMLElement {
  const found = document.body.querySelector<HTMLElement>('.wb-shell-header')
  if (found === null) throw new Error('셸 머리를 찾지 못했습니다')
  return found
}

/** 머리 안의 단추 · 링크 이름 — 메뉴를 열지 않은 채. */
function controlNames(): string[] {
  return [...within(header()).queryAllByRole('button'), ...within(header()).queryAllByRole('link')].map(
    (element) => element.getAttribute('aria-label') ?? element.textContent ?? '',
  )
}

describe('머리에 선 것', () => {
  it('로고는 프로젝트 목록으로 가는 링크이고 그 옆에 이름이 제목이다', async () => {
    await open('owner')
    const brand = within(header()).getByRole('link', { name: '프로젝트 목록' })
    expect(brand.getAttribute('href')).toBe('/')
    // 글자 «wirebound»는 보이되 이름을 덮지 않는다 — 링크의 이름은 갈 곳이다.
    expect(brand.textContent).toContain('wirebound')
    expect(within(header()).getByRole('heading', { level: 1, name: PROJECT_NAME })).toBeTruthy()
  })

  it('가운데에 되돌리기 · 모드, 오른쪽 끝에 `…`', async () => {
    await open('editor')
    expect(within(header()).getByRole('group', { name: '편집 이력' })).toBeTruthy()
    expect(within(header()).getByRole('group', { name: '모드' })).toBeTruthy()
    const menu = within(header()).getByRole('button', { name: SHELL_MENU })
    expect(menu.getAttribute('aria-haspopup')).toBe('menu')
  })

  it('viewer 에게는 되돌리기가 없고 `…` 는 있다', async () => {
    await open('viewer')
    expect(within(header()).queryByRole('group', { name: '편집 이력' })).toBeNull()
    expect(within(header()).getByRole('button', { name: SHELL_MENU })).toBeTruthy()
  })

  it('머리에 스냅샷 · 내보내기 · 설정 · API 토큰 · 로그아웃 단추나 링크가 없다 — `…` 뒤로 갔다', async () => {
    await open('owner')
    const names = controlNames()
    for (const gone of ['스냅샷', '내보내기', '설정', 'API 토큰', '로그아웃', '프로젝트 목록으로 돌아가기']) {
      expect(names, gone).not.toContain(gone)
    }
  })
})

describe('`…` 메뉴', () => {
  it.each(['owner', 'editor', 'viewer'] as const)('%s 에게 항목 다섯이 이 차례로 서고 머리에 사람 이름이 있다', async (role) => {
    await open(role)
    fireEvent.click(within(header()).getByRole('button', { name: SHELL_MENU }))
    const menu = within(openedMenu(header())).getByRole('menu')
    expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      '계정 설정',
      '프로젝트 설정',
      '스냅샷',
      '프로젝트 내보내기',
      '로그아웃',
    ])
    // 하네스의 로그인한 사람.
    expect(within(openedMenu(header())).getByText('테스터')).toBeTruthy()
  })

  it('계정 설정 · 프로젝트 설정은 주소가 있는 링크다', async () => {
    await open('owner')
    fireEvent.click(within(header()).getByRole('button', { name: SHELL_MENU }))
    expect(screen.getByRole('menuitem', { name: '계정 설정' }).getAttribute('href')).toBe('/account')
    expect(screen.getByRole('menuitem', { name: '프로젝트 설정' }).getAttribute('href')).toBe(`/projects/${PROJECT_ID}/settings`)
  })

  it('«스냅샷»은 대화 상자 «스냅샷» 안에 목록 · 폼을 연다 — 닫으면 포커스가 `…` 로 돌아온다', async () => {
    await open('owner')
    chooseFromShellMenu('스냅샷')
    const dialog = screen.getByRole('dialog', { name: '스냅샷' })
    await within(dialog).findByText('아직 스냅샷이 없습니다.')
    expect(within(dialog).getByRole('region', { name: '스냅샷 저장' })).toBeTruthy()
    expect(dialog.contains(document.activeElement)).toBe(true)

    fireEvent.click(within(dialog).getByRole('button', { name: '닫기' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(within(header()).getByRole('button', { name: SHELL_MENU }))
  })

  it('«프로젝트 내보내기»는 대화 상자 안에 내보내기 몸체를 연다', async () => {
    await open('viewer')
    chooseFromShellMenu('프로젝트 내보내기')
    const dialog = screen.getByRole('dialog', { name: '프로젝트 내보내기' })
    expect(within(dialog).getByRole('group', { name: '내보내기 형식' })).toBeTruthy()
    await waitFor(() => expect(within(dialog).getByText('페이지 0장을 내보냅니다')).toBeTruthy())
  })
})
