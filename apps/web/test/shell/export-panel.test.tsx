/**
 * **내려받기 화면**(P8-4 T5 · D6·D7). `<App />`을 라우트째 렌더한다(`../editor-harness`).
 *
 * ## 무엇을 재는가
 *
 * *"내려받기 버튼이 조용히 성공하면 안 된다"*가 이 화면의 존재 이유다. 그래서 재는 것은
 * **화면이 무엇을 말하는가**이지 파일이 떨어지는가가 아니다(그것은 브라우저의 일이고
 * 이 환경에 다운로드가 없다).
 *
 * ## 하나짜리로 재지 않는다
 *
 * 경고 세 갈래(그리지 못한 노드 · 겹친 경로 · 이어지지 않는 링크)를 **함께 든 응답**과
 * **하나도 없는 응답** 둘로 잰다. 갈래 하나만 든 응답으로 재면 화면이 셋을 한 자리에
 * 뭉뚱그려도 통과한다.
 */
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { ApiClient } from '../../src/api/client'
import { ApiError } from '../../src/api/client'
import type { ExportPreview } from '../../src/api/types'
import { PROJECT_ID, openPage, pageDoc } from '../editor-harness'

/**
 * **`title`은 서버가 조립한 번들 이름이다**(조상 메뉴가 붙어 있다 — P8-4 리뷰 발견 ①③).
 * 화면은 그것을 지어내지도 자르지도 않는다. 픽스처도 그 모양으로 둔다 — 맨 제목으로 두면
 * 케이스가 *"화면이 조상을 붙인다"*로 읽힌다.
 */
const 깨끗한: ExportPreview = {
  pages: [
    { id: 'pg-1', title: '관리자 회원 목록', target: 'page:관리자/회원/목록' },
    { id: 'pg-2', title: '관리자 회원 상세', target: 'page:관리자/회원/상세' },
  ],
  duplicateTargets: [],
  brokenLinks: [],
  errors: [],
  themeId: 't-1',
  fileName: 'wirebound-export-admin-console.zip',
}

const 어긋난: ExportPreview = {
  pages: [
    { id: 'pg-1', title: '관리자 회원 목록', target: 'page:관리자/회원/목록' },
    { id: 'pg-2', title: '관리자 회원 상세', target: 'page:관리자/회원/상세' },
    { id: 'pg-3', title: '관리자 회원 상세', target: 'page:관리자/회원/상세' },
  ],
  duplicateTargets: ['page:관리자/회원/상세'],
  brokenLinks: [
    { target: 'page:관리자/회원/등록', from: ['관리자 회원 목록'], reason: 'missing' },
    { target: 'page:관리자/회원/상세', from: ['관리자 회원 목록'], reason: 'ambiguous' },
  ],
  errors: [
    {
      path: 'pages/관리자-회원-목록.html',
      title: '관리자 회원 목록',
      error: { nodeId: 'n-x', message: '알 수 없는 타입: Blorb' },
    },
  ],
  themeId: null,
  fileName: 'wirebound-export-admin-console.zip',
}

function api(preview: ExportPreview | (() => Promise<ExportPreview>)): Partial<ApiClient> {
  return {
    getExportPreview: typeof preview === 'function' ? preview : async () => preview,
    exportUrl: (projectId) => `/api/projects/${projectId}/export`,
  }
}

async function open(overrides: Partial<ApiClient>): Promise<HTMLElement> {
  await openPage(pageDoc({ id: 'n-root', type: 'Page', children: [] }), { apiOverrides: overrides })
  fireEvent.click(screen.getByRole('button', { name: '내보내기' }))
  return screen.findByRole('group', { name: '내보내기' })
}

describe('내보내기 화면', () => {
  it('누르기 전에는 아무것도 안 부른다', async () => {
    let calls = 0
    await openPage(pageDoc({ id: 'n-root', type: 'Page', children: [] }), {
      apiOverrides: {
        ...api(깨끗한),
        getExportPreview: async () => {
          calls += 1
          return 깨끗한
        },
      },
    })

    // 셸이 뜨는 것만으로는 부르지 않는다 — 번들을 실제로 만들어 보는 요청이라 비싸다.
    expect(calls).toBe(0)
    cleanup()
  })

  it('누르면 실릴 페이지 수를 말한다', async () => {
    const panel = await open(api(깨끗한))
    expect(await within(panel).findByText('페이지 2장을 내보냅니다')).toBeTruthy()
  })

  it('페이지마다 상호작용에 적을 경로를 보인다', async () => {
    const panel = await open(api(깨끗한))
    const 경로 = await within(panel).findByRole('region', { name: '페이지 경로' })
    expect(within(경로).getByText('page:관리자/회원/목록')).toBeTruthy()
    expect(within(경로).getByText('page:관리자/회원/상세')).toBeTruthy()
  })

  it('서버가 준 이름으로 내려받는다 — 화면이 짓지 않는다', async () => {
    const panel = await open(api(깨끗한))
    const link = await within(panel).findByRole('link', {
      name: 'wirebound-export-admin-console.zip 내려받기',
    })
    expect(link.getAttribute('download')).toBe('wirebound-export-admin-console.zip')
    expect(link.getAttribute('href')).toBe(`/api/projects/${PROJECT_ID}/export`)
  })

  it('깨끗하면 경고를 하나도 안 그린다', async () => {
    const panel = await open(api(깨끗한))
    await within(panel).findByText('페이지 2장을 내보냅니다')

    expect(within(panel).queryByRole('region', { name: '그리지 못한 노드' })).toBeNull()
    expect(within(panel).queryByRole('region', { name: '겹친 페이지 경로' })).toBeNull()
    expect(within(panel).queryByRole('region', { name: '이어지지 않는 링크' })).toBeNull()
  })

  describe('어긋난 것을 미리 말한다', () => {
    it('그리지 못한 노드를 **페이지 이름으로** 말한다', async () => {
      const panel = await open(api(어긋난))
      const 구역 = await within(panel).findByRole('region', { name: '그리지 못한 노드' })

      expect(within(구역).getByText(/관리자 회원 목록/)).toBeTruthy()
      expect(within(구역).getByText(/알 수 없는 타입: Blorb/)).toBeTruthy()
      // **파일 경로를 짚지 않는다** — 아직 압축을 풀지 않은 사람에게 뜻이 없고,
      // `index.html`이 담는 첫 페이지의 오류에도 `pages/….html`이 붙는다(P8-3 이월 §1).
      expect(구역.textContent).not.toContain('pages/관리자-회원-목록.html')
    })

    it('겹친 경로를 말한다', async () => {
      const panel = await open(api(어긋난))
      const 구역 = await within(panel).findByRole('region', { name: '겹친 페이지 경로' })
      expect(within(구역).getByText('page:관리자/회원/상세')).toBeTruthy()
    })

    it('이어지지 않는 링크를 갈래마다 다르게 말한다', async () => {
      const panel = await open(api(어긋난))
      const 구역 = await within(panel).findByRole('region', { name: '이어지지 않는 링크' })

      expect(within(구역).getByText(/그 경로의 페이지가 없습니다/)).toBeTruthy()
      expect(within(구역).getByText(/그 경로의 페이지가 둘 이상입니다/)).toBeTruthy()
    })

    it('어긋난 것이 있어도 내려받을 수는 있다', async () => {
      const panel = await open(api(어긋난))
      expect(
        await within(panel).findByRole('link', { name: /내려받기$/ }),
      ).toBeTruthy()
    })
  })

  it('서버가 거절하면 그 문장을 말한다', async () => {
    const panel = await open(
      api(async () => {
        throw new ApiError(409, 'conflict', '내보낼 페이지가 없습니다')
      }),
    )
    expect(await within(panel).findByRole('alert')).toHaveProperty(
      'textContent',
      '내보낼 페이지가 없습니다',
    )
  })

  /**
   * **닫았다 다시 열면 다시 본다.** 이 화면이 말하는 것은 전부 *"지금 내보내면 무엇이
   * 나오는가"*인데, 그 사이 페이지를 고쳤을 수 있다. 낡은 답을 보이면 D6이 뒤집힌다.
   */
  it('다시 열면 다시 조회한다', async () => {
    let calls = 0
    await open({
      ...api(깨끗한),
      getExportPreview: async () => {
        calls += 1
        return 깨끗한
      },
    })
    await waitFor(() => expect(calls).toBe(1))

    fireEvent.click(screen.getByRole('button', { name: '내보내기' }))
    fireEvent.click(screen.getByRole('button', { name: '내보내기' }))
    await waitFor(() => expect(calls).toBe(2))
  })
})
