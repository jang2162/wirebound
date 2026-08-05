import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { App } from '../../src/app'
import { ApiError, type ApiClient } from '../../src/api/client'
import type { ProjectDetail, SessionUser } from '../../src/api/types'
import { currentPath, fakeApi, renderWithProviders } from '../helpers'

const USER: SessionUser = { id: 'u-1', email: 'me@example.com', name: '테스터' }

/**
 * 서버가 준 문장이 그대로 화면에 오는지 보려면 화면이 하드코딩할 리 없는 문자열이어야
 * 한다. "목록을 불러오지 못했습니다" 같은 그럴듯한 문안을 박아 넣은 구현도 통과하는
 * 테스트는 아무것도 지키지 못한다.
 */
const SERVER_MESSAGE = '프로젝트 저장소가 응답하지 않습니다 [T5-LIST-4]'

/**
 * 화면의 문안을 여기 한 번 더 적어 둔다. 구현에서 상수를 import하면 문안이 엉뚱하게
 * 바뀌어도 테스트가 따라가 버려서, 사용자가 보는 문장을 아무도 지키지 않게 된다.
 */
const EMPTY_NOTICE = '참여 중인 프로젝트가 없습니다'
const LOADING_NOTICE = '불러오는 중…'
const UNKNOWN_FAILURE = '프로젝트 목록을 불러오지 못했습니다'

function project(overrides: Partial<ProjectDetail> = {}): ProjectDetail {
  return {
    id: 'p-1',
    name: '관리자 콘솔',
    slug: 'admin-console',
    description: '내부 운영 도구',
    role: 'owner',
    ...overrides,
  }
}

/**
 * 로그인된 상태로 목록 화면을 띄운다. 라우트 표를 함께 지나므로 `/`에 이 화면이 실제로
 * 걸려 있는지도 같이 검사된다.
 */
function renderList(listProjects: ApiClient['listProjects']): void {
  renderWithProviders(<App />, {
    client: fakeApi({ me: async () => USER, listProjects }),
    route: '/',
  })
}

describe('프로젝트 목록 화면', () => {
  it('프로젝트 목록을 이름으로 보여준다', async () => {
    renderList(async () => [project(), project({ id: 'p-2', name: '고객 포털', slug: 'portal' })])

    await screen.findByText('관리자 콘솔')
    screen.getByText('고객 포털')
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    // 양성 대조: 비었을 때의 안내는 비지 않았으면 보이면 안 된다. 이것이 없으면
    // 안내를 늘 그리는 구현도 "비면 안내를 보여준다"를 통과한다.
    expect(screen.queryByText(EMPTY_NOTICE)).toBeNull()
  })

  it('프로젝트를 누르면 그 프로젝트로 간다', async () => {
    renderList(async () => [project({ id: 'p-7', name: '고객 포털' })])

    const link = await screen.findByRole('link', { name: '고객 포털' })
    // 양성 대조: 누르기 전에는 목록에 있다. 이것이 없으면 처음부터 프로젝트 주소에
    // 있는 상태로도 아래 단언이 통과한다.
    expect(currentPath()).toBe('/')

    fireEvent.click(link)

    await waitFor(() => {
      expect(currentPath()).toBe('/projects/p-7')
    })
  })

  it('목록이 비면 안내를 보여준다', async () => {
    renderList(async () => [])

    await screen.findByText(EMPTY_NOTICE)
    // 빈 목록은 실패가 아니다. 오류 문구가 함께 뜨면 사용자는 뭔가 망가졌다고 읽는다.
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('조회에 실패하면 서버 메시지를 보여준다', async () => {
    renderList(async () => Promise.reject(new ApiError(500, 'internal', SERVER_MESSAGE)))

    await screen.findByText(SERVER_MESSAGE)
    // 실패는 "프로젝트가 없음"이 아니다. 둘을 같은 화면으로 뭉개면 사용자는 자기
    // 프로젝트가 사라졌다고 읽는다.
    expect(screen.queryByText(EMPTY_NOTICE)).toBeNull()
  })

  it('서버가 이유를 주지 않으면 화면이 가진 문장을 쓴다', async () => {
    // `http-client`가 네트워크 단절도 `ApiError`로 번역하지만, 화면이 보는 것은
    // `ApiClient` 인터페이스이지 그 구현이 아니다. `ApiError`가 아닌 값이 와도
    // 사용자에게 내부 문자열이 아니라 읽을 수 있는 문장이 가야 한다.
    renderList(async () => Promise.reject(new TypeError('Failed to fetch')))

    await screen.findByText(UNKNOWN_FAILURE)
    expect(screen.queryByText(/Failed to fetch/)).toBeNull()
  })

  it('클라이언트가 그 자리에서 던져도 화면이 살아남는다', async () => {
    // Promise를 돌려주지 않고 즉시 던지는 구현(테스트의 스텁 누락이 그렇다)을 흡수하지
    // 못하면 이펙트 밖으로 예외가 새어 나가 앱 트리 전체가 죽는다.
    renderList(() => {
      throw new TypeError('listProjects가 던졌다')
    })

    await screen.findByText(UNKNOWN_FAILURE)
  })

  it('로딩 중에는 목록도 빈 안내도 보이지 않는다', async () => {
    let deliver: (projects: ProjectDetail[]) => void = () => {}
    const pending = new Promise<ProjectDetail[]>((resolve) => {
      deliver = resolve
    })
    renderList(() => pending)

    // 로딩 중임을 화면이 실제로 말하는지부터 본다. 이것 없이 아래 단언만 하면
    // "아직 아무것도 안 그려졌다"를 "로딩을 구분한다"로 잘못 읽는다.
    await screen.findByText(LOADING_NOTICE)
    expect(screen.queryByText(EMPTY_NOTICE)).toBeNull()
    expect(screen.queryByRole('listitem')).toBeNull()

    // 양성 대조: 응답이 오면 그때 안내가 나오고 로딩 표시는 사라진다.
    deliver([])
    await screen.findByText(EMPTY_NOTICE)
    expect(screen.queryByText(LOADING_NOTICE)).toBeNull()
  })

  it('설명이 없는 프로젝트도 그린다', async () => {
    renderList(async () => [
      project({ id: 'p-1', name: '설명 있는 설계서', description: '한 줄 설명' }),
      project({ id: 'p-2', name: '설명 없는 설계서', description: null }),
    ])

    const named = await screen.findByText('설명 없는 설계서')
    // 양성 대조: 설명이 있는 쪽은 설명이 실제로 보인다. 이것이 없으면 설명을 아예
    // 그리지 않는 구현도 이 케이스를 통과한다.
    screen.getByText('한 줄 설명')
    // 설명이 없는 항목에는 이름만 남는다. 'null'이나 '설명 없음' 같은 대체 문구를
    // 끼워 넣으면 여기서 걸린다.
    expect(named.closest('li')?.textContent).toBe('설명 없는 설계서')
  })
})
