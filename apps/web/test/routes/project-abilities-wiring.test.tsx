/**
 * **판정과 화면의 배선만 본다.** `projectAbilities`를 가짜로 바꿔 `rename`·`remove`에
 * **서로 다른 값**을 주고, 두 화면이 그 둘을 각각 옳은 자리에 연결했는지 잰다 — `remove` 는 목록 줄의 삭제 단추, `rename` 은
 * 설정 페이지 «일반» 절의 칸 · 저장 단추다.
 *
 * **왜 따로 있나.** 오늘 서버에는 한쪽만 열리는 역할이 없어서 `projectAbilities`는 두 필드에
 * 늘 같은 값을 낸다 — 그래서 `project-crud.test.tsx`의 케이스들로는 **두 배선을 맞바꿔도
 * 아무것도 죽지 않는다.** 판정을 주입하면 값이 갈리고, 갈리면 배선이 드러난다 — 이 파일이
 * 그 자리다.
 *
 * **`vi.mock`은 파일마다 있어야 한다** — 호이스팅이 그것이 적힌 파일에서만 일어난다
 * (`test/editor-harness.tsx` 머리말의 실측).
 */
import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { App } from '../../src/app'
import type { ProjectView, SessionUser } from '../../src/api/types'
import { fakeApi, renderWithProviders } from '../helpers'
import { adminThemeView } from '../theme-loader'

/** 화면이 부르는 판정. 케이스가 이 값을 갈아 끼운다. */
const abilities = { rename: true, remove: true }

vi.mock('../../src/projects/project-actions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/projects/project-actions')>()
  return { ...actual, projectAbilities: () => abilities }
})

const USER: SessionUser = { id: 'u-1', email: 'me@example.com', name: '테스터' }
const PROJECT: ProjectView = {
  id: 'p-1', name: '관리자 콘솔', slug: 'ac', description: null, role: 'owner', themeRev: 0,
}

async function renderList(next: { rename: boolean; remove: boolean }): Promise<void> {
  abilities.rename = next.rename
  abilities.remove = next.remove
  renderWithProviders(<App />, {
    client: fakeApi({ me: async () => USER, listProjects: async () => [PROJECT] }),
    route: '/',
  })
  await screen.findByText('관리자 콘솔')
}

async function renderSettings(next: { rename: boolean; remove: boolean }): Promise<void> {
  abilities.rename = next.rename
  abilities.remove = next.remove
  renderWithProviders(<App />, {
    client: fakeApi({
      me: async () => USER,
      getProject: async () => PROJECT,
      getProjectTheme: async () => adminThemeView(),
      listThemePackages: async () => [],
    }),
    route: '/projects/p-1/settings',
  })
  await screen.findByRole('heading', { name: '관리자 콘솔 설정' })
}

const has = (name: string): boolean => screen.queryByRole('button', { name }) !== null

/** 설정 «일반» 절이 열렸는가 — 칸이 읽기 전용이 아니고 저장 단추가 있다. */
function generalOpen(): boolean {
  const general = screen.getByRole('region', { name: '일반' })
  const editable = !(within(general).getByLabelText('이름') as HTMLInputElement).readOnly
  const save = within(general).queryByRole('button', { name: '저장' }) !== null
  expect(editable).toBe(save)
  return editable
}

describe('판정과 화면의 배선', () => {
  it('rename만 열리면 목록에 삭제 버튼이 없다', async () => {
    await renderList({ rename: true, remove: false })
    expect(has('관리자 콘솔 삭제')).toBe(false)
  })

  it('rename만 열리면 설정 «일반» 이 열린다', async () => {
    await renderSettings({ rename: true, remove: false })
    expect(generalOpen()).toBe(true)
  })

  it('remove만 열리면 목록에 삭제 버튼이 있다', async () => {
    await renderList({ rename: false, remove: true })
    expect(has('관리자 콘솔 삭제')).toBe(true)
  })

  it('remove만 열리면 설정 «일반» 은 읽기 전용이다', async () => {
    await renderSettings({ rename: false, remove: true })
    expect(generalOpen()).toBe(false)
  })

  it('둘 다 닫히면 삭제 버튼이 없다', async () => {
    // 양성·음성 대조. 이것이 없으면 "늘 rename만 본다"는 구현도 위 둘 중 하나를 통과한다.
    await renderList({ rename: false, remove: false })
    expect(has('관리자 콘솔 삭제')).toBe(false)
  })

  it('둘 다 열리면 삭제 버튼이 있다', async () => {
    await renderList({ rename: true, remove: true })
    expect(has('관리자 콘솔 삭제')).toBe(true)
  })

  it('remove만 열렸을 때 삭제 확인까지 닿는다', async () => {
    // 버튼이 있는 것과 그것이 삭제 경로를 여는 것은 다르다.
    await renderList({ rename: false, remove: true })

    fireEvent.click(screen.getByRole('button', { name: '관리자 콘솔 삭제' }))

    expect(screen.getByLabelText('삭제하려면 프로젝트 이름을 입력하세요')).toBeDefined()
  })
})
