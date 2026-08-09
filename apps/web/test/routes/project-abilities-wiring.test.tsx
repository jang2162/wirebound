/**
 * **판정과 화면의 배선만 본다**(P2b-5 W5). `projectAbilities`를 가짜로 바꿔 `rename`·`remove`에
 * **서로 다른 값**을 주고, 목록이 그 둘을 각각 옳은 버튼에 연결했는지 잰다.
 *
 * **왜 따로 있나.** 오늘 서버에는 한쪽만 열리는 역할이 없어서 `projectAbilities`는 두 필드에
 * 늘 같은 값을 낸다 — 그래서 `project-crud.test.tsx`의 케이스들로는 **두 배선을 맞바꿔도
 * 아무것도 죽지 않는다**(실측: 0 사망). 앞 판은 그것을 *"닫는 케이스를 만들지 못했다"*로
 * 적었는데 **틀렸다**: 판정을 주입하면 값이 갈리고, 갈리면 배선이 드러난다.
 *
 * **`vi.mock`은 파일마다 있어야 한다** — 호이스팅이 그것이 적힌 파일에서만 일어난다
 * (`test/editor-harness.tsx` 머리말의 실측).
 */
import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { App } from '../../src/app'
import type { ProjectDetail, SessionUser } from '../../src/api/types'
import { fakeApi, renderWithProviders } from '../helpers'

/** 화면이 부르는 판정. 케이스가 이 값을 갈아 끼운다. */
const abilities = { rename: true, remove: true }

vi.mock('../../src/projects/project-actions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/projects/project-actions')>()
  return { ...actual, projectAbilities: () => abilities }
})

const USER: SessionUser = { id: 'u-1', email: 'me@example.com', name: '테스터' }
const PROJECT: ProjectDetail = {
  id: 'p-1', name: '관리자 콘솔', slug: 'ac', description: null, role: 'owner',
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

const has = (name: string): boolean => screen.queryByRole('button', { name }) !== null

describe('판정과 버튼의 배선', () => {
  it('rename만 열리면 수정 버튼만 있다', async () => {
    await renderList({ rename: true, remove: false })

    expect(has('관리자 콘솔 수정')).toBe(true)
    expect(has('관리자 콘솔 삭제')).toBe(false)
  })

  it('remove만 열리면 삭제 버튼만 있다', async () => {
    await renderList({ rename: false, remove: true })

    expect(has('관리자 콘솔 수정')).toBe(false)
    expect(has('관리자 콘솔 삭제')).toBe(true)
  })

  it('둘 다 닫히면 둘 다 없고, 둘 다 열리면 둘 다 있다', async () => {
    // 양성·음성 대조. 이것이 없으면 "늘 rename만 본다"는 구현도 위 둘 중 하나를 통과한다.
    await renderList({ rename: false, remove: false })
    expect(has('관리자 콘솔 수정')).toBe(false)
    expect(has('관리자 콘솔 삭제')).toBe(false)
  })

  it('둘 다 열리면 둘 다 있다', async () => {
    await renderList({ rename: true, remove: true })
    expect(has('관리자 콘솔 수정')).toBe(true)
    expect(has('관리자 콘솔 삭제')).toBe(true)
  })

  it('remove만 열렸을 때 삭제 확인까지 닿는다', async () => {
    // 버튼이 있는 것과 그것이 삭제 경로를 여는 것은 다르다.
    await renderList({ rename: false, remove: true })

    fireEvent.click(screen.getByRole('button', { name: '관리자 콘솔 삭제' }))

    expect(screen.getByLabelText('삭제하려면 프로젝트 이름을 입력하세요')).toBeDefined()
  })
})
