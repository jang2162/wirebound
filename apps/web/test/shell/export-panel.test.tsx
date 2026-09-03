/**
 * **내려받기 화면**(P8-4 T5 · D6·D7 · P10-3의 형식 토글). `<App />`을 라우트째 렌더한다
 * (`../editor-harness`).
 *
 * ## 무엇을 재는가
 *
 * *"내려받기 버튼이 조용히 성공하면 안 된다"*가 이 화면의 존재 이유다. 그래서 재는 것은
 * **화면이 무엇을 말하는가**이지 파일이 떨어지는가가 아니다(그것은 브라우저의 일이고
 * 이 환경에 다운로드가 없다).
 *
 * ## 하나짜리로 재지 않는다
 *
 * 경고 갈래들을 **함께 든 응답**과 **하나도 없는 응답** 둘로 잰다. 갈래 하나만 든 응답으로
 * 재면 화면이 여럿을 한 자리에 뭉뚱그려도 통과한다. pptx의 셋(`screenless`·`screenFailures`
 * ·`fontWarning`)도 같은 이유로 **셋을 함께 든** 픽스처로 잰다 — 특히 앞의 둘은 서버가
 * 일부러 가른 값이라(`services/export-pptx.ts`의 D5) **서로 다른 페이지**를 넣어 접히는지
 * 본다.
 *
 * ## 형식은 응답이 정하고, 화면은 그것을 따른다
 *
 * 두 형식이 **다른 것**을 말하므로(`api/types.ts`의 판별 유니온) 재는 축이 셋이다:
 * ① 고른 형식으로 부르는가 ② 형식마다 그 형식의 것만 그리는가 ③ 바꿀 때 앞 형식의 결과가
 * 남지 않는가(늦게 온 답까지 포함해서).
 */
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { ApiClient } from '../../src/api/client'
import { ApiError } from '../../src/api/client'
import type {
  ExportFormat,
  ExportPreview,
  HtmlExportPreview,
  PptxExportPreview,
} from '../../src/api/types'
import { PROJECT_ID, openPage, pageDoc } from '../editor-harness'

/**
 * **`title`은 서버가 조립한 번들 이름이다**(조상 메뉴가 붙어 있다 — P8-4 리뷰 발견 ①③).
 * 화면은 그것을 지어내지도 자르지도 않는다. 픽스처도 그 모양으로 둔다 — 맨 제목으로 두면
 * 케이스가 *"화면이 조상을 붙인다"*로 읽힌다.
 */
const 깨끗한: HtmlExportPreview = {
  format: 'html',
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

const 어긋난: HtmlExportPreview = {
  format: 'html',
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

/**
 * pptx가 깨끗한 판. **`pages`는 HTML 갈래와 같은 모양이다**(서버가 그렇게 낸다) —
 * 픽스처도 같은 값으로 두어 *"화면이 pptx에서 경로를 안 보인다"*가 **값이 없어서**가
 * 아니라 **안 그려서**인 것을 잰다.
 */
const pptx깨끗한: PptxExportPreview = {
  format: 'pptx',
  pages: [
    { id: 'pg-1', title: '관리자 회원 목록', target: 'page:관리자/회원/목록' },
    { id: 'pg-2', title: '관리자 회원 상세', target: 'page:관리자/회원/상세' },
  ],
  screenless: [],
  screenFailures: [],
  fontWarning: null,
  fileName: 'wirebound-export-admin-console.pptx',
}

/**
 * pptx의 셋이 **전부 든** 판. **`screenless`와 `screenFailures`에 다른 페이지를 넣는다** —
 * 같은 페이지를 넣으면 화면이 둘을 한 자리에 접어도 케이스가 통과한다(서버가 두 값을 가른
 * 근거가 바로 그것이다: *"아직 아무도 안 만들었다"*와 *"만들려다 실패했다"*).
 */
const pptx어긋난: PptxExportPreview = {
  format: 'pptx',
  pages: [
    { id: 'pg-1', title: '관리자 회원 목록', target: 'page:관리자/회원/목록' },
    { id: 'pg-2', title: '관리자 회원 상세', target: 'page:관리자/회원/상세' },
  ],
  screenless: ['관리자 회원 목록'],
  screenFailures: [{ title: '관리자 회원 상세', reason: '페이지를 여는 데 실패했습니다: timeout' }],
  fontWarning: '이 서버에 한글 글꼴이 없어 화면 이미지를 그리지 않았습니다',
  fileName: 'wirebound-export-admin-console.pptx',
}

function api(
  preview: ExportPreview | ((format: ExportFormat) => Promise<ExportPreview>),
): Partial<ApiClient> {
  return {
    getExportPreview:
      typeof preview === 'function' ? (_projectId, format) => preview(format) : async () => preview,
    // **주소를 만드는 자리는 하나다**(`api/client.ts`). 가짜도 그 계약대로 형식을 받는다 —
    // 여기서 형식을 무시하면 *"pptx를 보고 zip을 받는"* 상태를 케이스가 못 잡는다.
    exportUrl: (projectId, format) => `/api/projects/${projectId}/export?format=${format}`,
  }
}

/** 형식마다 다른 것을 내는 가짜. */
function 형식별(html: ExportPreview, pptx: ExportPreview) {
  return async (format: ExportFormat): Promise<ExportPreview> => (format === 'pptx' ? pptx : html)
}

async function open(overrides: Partial<ApiClient>): Promise<HTMLElement> {
  await openPage(pageDoc({ id: 'n-root', type: 'Page', children: [] }), { apiOverrides: overrides })
  fireEvent.click(screen.getByRole('button', { name: '내보내기' }))
  return screen.findByRole('group', { name: '내보내기' })
}

/** 열고 **PPTX로 바꾼** 상자. 그 형식의 무언가가 그려질 때까지 기다린다. */
async function openPptx(overrides: Partial<ApiClient>): Promise<HTMLElement> {
  const panel = await open(overrides)
  await within(panel).findByText(/페이지 \d+장을 내보냅니다/)
  fireEvent.click(within(panel).getByRole('button', { name: 'PPTX' }))
  await within(panel).findByRole('region', { name: '슬라이드에 실릴 페이지' })
  return panel
}

/**
 * **경고 구역들이 내려받기 링크보다 앞에 있는가**(D6 — 아래 두면 사람이 누르고 나서 본다).
 *
 * **두 갈래가 지키는 규칙은 하나인데 그리는 자리가 둘이라** 재는 자리도 갈리면 한쪽만
 * 고쳐진 채 남는다. 갈래마다 다른 것은 경고의 **이름들**뿐이므로 그것만 받는다.
 */
function 경고가링크보다앞(panel: HTMLElement, 이름들: readonly string[]): void {
  const link = within(panel).getByRole('link', { name: /내려받기$/ })

  for (const 이름 of 이름들) {
    const 구역 = within(panel).getByRole('region', { name: 이름 })
    // `DOCUMENT_POSITION_FOLLOWING`(4) — 링크가 구역보다 **뒤에** 있다.
    expect(구역.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  }
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
    expect(link.getAttribute('href')).toBe(`/api/projects/${PROJECT_ID}/export?format=html`)
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

    /**
     * 경고가 내려받기 링크보다 **먼저** 온다(D6). **pptx 갈래에도 같은 케이스가 있다** —
     * 규칙은 하나인데 자리가 둘이라, 한쪽만 재면 다른 쪽은 주석만 남고 조용히 뒤집힌다.
     */
    it('경고 셋이 내려받기 링크보다 앞에 있다', async () => {
      const panel = await open(api(어긋난))
      await within(panel).findByRole('region', { name: '그리지 못한 노드' })

      경고가링크보다앞(panel, ['그리지 못한 노드', '겹친 페이지 경로', '이어지지 않는 링크'])
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

  describe('형식 토글 (P10-3)', () => {
    it('여는 순간엔 HTML 번들을 부른다', async () => {
      const 부른것: ExportFormat[] = []
      await open({
        ...api(형식별(깨끗한, pptx깨끗한)),
        getExportPreview: async (_projectId, format) => {
          부른것.push(format)
          return format === 'pptx' ? pptx깨끗한 : 깨끗한
        },
      })

      // **둘을 동시에 부르지 않는다** — 이 조회는 번들을 실제로 만들어 보고, pptx는 거기에
      // 더해 페이지를 한 장씩 그린다. 여는 순간의 값은 하나여야 한다.
      await waitFor(() => expect(부른것).toEqual(['html']))
    })

    it('PPTX를 고르면 그 형식으로 다시 부른다', async () => {
      const 부른것: ExportFormat[] = []
      const panel = await open({
        ...api(형식별(깨끗한, pptx깨끗한)),
        getExportPreview: async (_projectId, format) => {
          부른것.push(format)
          return format === 'pptx' ? pptx깨끗한 : 깨끗한
        },
      })
      await within(panel).findByRole('region', { name: '페이지 경로' })

      fireEvent.click(within(panel).getByRole('button', { name: 'PPTX' }))

      await waitFor(() => expect(부른것).toEqual(['html', 'pptx']))
    })

    it('이미 고른 형식을 다시 눌러도 다시 부르지 않는다', async () => {
      let calls = 0
      const panel = await open({
        ...api(깨끗한),
        getExportPreview: async () => {
          calls += 1
          return 깨끗한
        },
      })
      await within(panel).findByRole('region', { name: '페이지 경로' })

      fireEvent.click(within(panel).getByRole('button', { name: 'HTML 번들' }))

      await waitFor(() => expect(calls).toBe(1))
    })

    /** 눌린 쪽만 표시하면 보조 기술은 나머지 버튼이 토글인지 알 수 없다(셸 머리의 `모드`와 같다). */
    it('두 버튼이 다 눌림 상태를 말하고, 고른 쪽만 눌려 있다', async () => {
      const panel = await openPptx(api(형식별(깨끗한, pptx깨끗한)))

      expect(within(panel).getByRole('button', { name: 'PPTX' }).getAttribute('aria-pressed')).toBe('true')
      expect(within(panel).getByRole('button', { name: 'HTML 번들' }).getAttribute('aria-pressed')).toBe(
        'false',
      )
    })

    it('닫았다 열면 HTML 번들로 돌아온다', async () => {
      const 부른것: ExportFormat[] = []
      const panel = await openPptx({
        ...api(형식별(깨끗한, pptx깨끗한)),
        getExportPreview: async (_projectId, format) => {
          부른것.push(format)
          return format === 'pptx' ? pptx깨끗한 : 깨끗한
        },
      })
      expect(부른것).toEqual(['html', 'pptx'])

      // 닫고 다시 연다.
      fireEvent.click(within(panel).getByRole('button', { name: 'PPTX' }))
      fireEvent.keyDown(document, { key: 'Escape' })
      fireEvent.click(screen.getByRole('button', { name: '내보내기' }))

      const 다시 = await screen.findByRole('group', { name: '내보내기' })
      await within(다시).findByRole('region', { name: '페이지 경로' })
      expect(부른것[부른것.length - 1]).toBe('html')
      expect(within(다시).getByRole('button', { name: 'HTML 번들' }).getAttribute('aria-pressed')).toBe(
        'true',
      )
    })
  })

  describe('PPTX가 말하는 것', () => {
    it('셋을 각각 다른 자리에서 말한다', async () => {
      const panel = await openPptx(api(형식별(깨끗한, pptx어긋난)))

      const 글꼴 = within(panel).getByRole('region', { name: '글꼴 경고' })
      expect(within(글꼴).getByText('이 서버에 한글 글꼴이 없어 화면 이미지를 그리지 않았습니다')).toBeTruthy()
      expect(within(panel).getByRole('region', { name: '화면 이미지가 없는 페이지' })).toBeTruthy()
      expect(within(panel).getByRole('region', { name: '화면 이미지를 그리다 실패한 페이지' })).toBeTruthy()
    })

    /**
     * **접으면 화면이 거짓을 말한다**(`services/export-pptx.ts`의 D5). 두 값에 **다른**
     * 페이지가 들어 있으므로, 한 자리에 뭉치면 각 구역이 남의 페이지까지 담게 된다.
     */
    it('안 그린 것과 그리다 죽은 것을 접지 않는다', async () => {
      const panel = await openPptx(api(형식별(깨끗한, pptx어긋난)))

      const 없음 = within(panel).getByRole('region', { name: '화면 이미지가 없는 페이지' })
      expect(within(없음).getByText('관리자 회원 목록')).toBeTruthy()
      expect(없음.textContent).not.toContain('관리자 회원 상세')

      const 실패 = within(panel).getByRole('region', { name: '화면 이미지를 그리다 실패한 페이지' })
      // 이유가 붙는 쪽이다 — 뭉뚱그리면 왜 실패했는지 아는 길이 다시 사라진다.
      expect(within(실패).getByText(/관리자 회원 상세 — 페이지를 여는 데 실패했습니다: timeout/)).toBeTruthy()
      expect(실패.textContent).not.toContain('관리자 회원 목록')
    })

    it('깨끗하면 셋을 하나도 안 그린다', async () => {
      const panel = await openPptx(api(형식별(깨끗한, pptx깨끗한)))

      expect(within(panel).queryByRole('region', { name: '글꼴 경고' })).toBeNull()
      expect(within(panel).queryByRole('region', { name: '화면 이미지가 없는 페이지' })).toBeNull()
      expect(within(panel).queryByRole('region', { name: '화면 이미지를 그리다 실패한 페이지' })).toBeNull()
    })

    /** 경고가 내려받기 링크보다 **먼저** 온다 — 아래 두면 사람이 누르고 나서 본다(D6). */
    it('경고 셋이 내려받기 링크보다 앞에 있다', async () => {
      const panel = await openPptx(api(형식별(깨끗한, pptx어긋난)))

      경고가링크보다앞(panel, [
        '글꼴 경고',
        '화면 이미지가 없는 페이지',
        '화면 이미지를 그리다 실패한 페이지',
      ])
    })

    /**
     * **슬라이드 사이에는 링크가 생기지 않는다** — 그 경로가 pptx 안에서 아무것도 가리키지
     * 않으므로 보이지 않는다. 픽스처는 그 값을 **들고 있다**(위 `pptx깨끗한`) — 값이 없어서가
     * 아니라 안 그려서인 것을 잰다.
     */
    it('페이지 경로 대신 실릴 페이지 제목을 보인다', async () => {
      const panel = await openPptx(api(형식별(깨끗한, pptx깨끗한)))

      expect(within(panel).queryByRole('region', { name: '페이지 경로' })).toBeNull()
      const 목록 = within(panel).getByRole('region', { name: '슬라이드에 실릴 페이지' })
      expect(within(목록).getByText('관리자 회원 목록')).toBeTruthy()
      expect(panel.textContent).not.toContain('page:관리자/회원/목록')
    })

    it('내려받기 주소와 이름이 pptx를 따른다', async () => {
      const panel = await openPptx(api(형식별(깨끗한, pptx깨끗한)))

      const link = within(panel).getByRole('link', {
        name: 'wirebound-export-admin-console.pptx 내려받기',
      })
      expect(link.getAttribute('download')).toBe('wirebound-export-admin-console.pptx')
      expect(link.getAttribute('href')).toBe(`/api/projects/${PROJECT_ID}/export?format=pptx`)
    })
  })

  /**
   * **앞 형식의 결과가 남으면 화면이 거짓을 말한다.** 두 갈래는 다른 것을 말하므로
   * (`api/types.ts`의 판별 유니온) 섞여 보이는 순간 경고와 내려받기 링크가 서로 다른
   * 응답에서 나온 것이 된다.
   */
  describe('형식을 바꾸면 앞 형식의 결과가 안 남는다', () => {
    it('바꾸면 앞 형식의 구역이 사라진다', async () => {
      const panel = await openPptx(api(형식별(어긋난, pptx어긋난)))

      expect(within(panel).queryByRole('region', { name: '페이지 경로' })).toBeNull()
      expect(within(panel).queryByRole('region', { name: '그리지 못한 노드' })).toBeNull()
      expect(within(panel).queryByRole('region', { name: '겹친 페이지 경로' })).toBeNull()
      expect(within(panel).queryByRole('region', { name: '이어지지 않는 링크' })).toBeNull()
      expect(within(panel).getByRole('link', { name: /\.pptx 내려받기$/ })).toBeTruthy()
    })

    it('부르는 동안엔 앞 형식의 결과가 이미 없다', async () => {
      let 놓아주기: (() => void) | undefined
      const panel = await open(
        api(async (format) => {
          if (format === 'html') return 어긋난
          await new Promise<void>((resolve) => {
            놓아주기 = resolve
          })
          return pptx어긋난
        }),
      )
      await within(panel).findByRole('region', { name: '페이지 경로' })

      fireEvent.click(within(panel).getByRole('button', { name: 'PPTX' }))

      // 아직 아무 답도 안 왔는데 앞 형식의 것이 남아 있으면 안 된다.
      expect(within(panel).queryByRole('region', { name: '페이지 경로' })).toBeNull()
      expect(within(panel).queryByRole('link', { name: /내려받기$/ })).toBeNull()
      expect(within(panel).getByRole('status')).toBeTruthy()

      놓아주기?.()
      await within(panel).findByRole('region', { name: '슬라이드에 실릴 페이지' })
    })

    /**
     * **늦게 온 답이 화면을 덮으면 안 된다.** pptx는 페이지를 그리느라 html보다 오래 걸리므로
     * (P10-2 D6) pptx를 눌렀다 html로 되돌리면 먼저 보낸 pptx가 나중에 도착한다.
     */
    it('늦게 온 앞 형식의 답이 뒤 형식의 화면을 덮지 않는다', async () => {
      let 놓아주기: (() => void) | undefined
      let pptx답함 = 0
      const panel = await open(
        api(async (format) => {
          if (format === 'html') return 깨끗한
          await new Promise<void>((resolve) => {
            놓아주기 = resolve
          })
          pptx답함 += 1
          return pptx깨끗한
        }),
      )
      await within(panel).findByRole('region', { name: '페이지 경로' })

      fireEvent.click(within(panel).getByRole('button', { name: 'PPTX' }))
      fireEvent.click(within(panel).getByRole('button', { name: 'HTML 번들' }))
      await within(panel).findByRole('region', { name: '페이지 경로' })

      // 이제야 pptx가 답한다.
      놓아주기?.()
      await waitFor(() => expect(pptx답함).toBe(1))

      expect(within(panel).queryByRole('region', { name: '슬라이드에 실릴 페이지' })).toBeNull()
      expect(within(panel).getByRole('region', { name: '페이지 경로' })).toBeTruthy()
      expect(within(panel).getByRole('button', { name: 'HTML 번들' }).getAttribute('aria-pressed')).toBe(
        'true',
      )
    })

    /**
     * **반대 순서도 잰다 — 버리는 규칙이 형식에 매여 있지 않다는 것이 이 케이스의 몫이다.**
     *
     * 위 케이스가 서는 근거는 *"pptx가 html보다 느리다"*라는 **사실**이지만, `load()`가 드는
     * 것은 표(`latest`) 하나이지 형식이 아니다. 그리고 늦게 오는 쪽이 html인 순서는 지어낸
     * 것이 아니다 — **열자마자 PPTX를 누르면** 그것이 그대로 이 순서다(여는 순간의 조회는
     * html이다). 한 방향만 재면 *"html 답은 표를 안 보고 받는다"*가 통과한다 — 그 구현을
     * 심어 위 케이스는 살고 이 케이스만 죽는 것을 재서 확인했다.
     */
    it('늦게 온 html 답이 뒤에 고른 pptx 화면을 덮지 않는다', async () => {
      let 놓아주기: (() => void) | undefined
      let html답함 = 0
      const panel = await open(
        api(async (format) => {
          if (format === 'pptx') return pptx깨끗한
          await new Promise<void>((resolve) => {
            놓아주기 = resolve
          })
          html답함 += 1
          return 깨끗한
        }),
      )
      // 여는 순간의 html이 아직 안 왔다 — 이 상태에서 형식을 바꾸는 것이 이 순서다.
      await within(panel).findByRole('status')

      fireEvent.click(within(panel).getByRole('button', { name: 'PPTX' }))
      await within(panel).findByRole('region', { name: '슬라이드에 실릴 페이지' })

      // 이제야 html이 답한다.
      놓아주기?.()
      await waitFor(() => expect(html답함).toBe(1))

      expect(within(panel).queryByRole('region', { name: '페이지 경로' })).toBeNull()
      expect(within(panel).getByRole('region', { name: '슬라이드에 실릴 페이지' })).toBeTruthy()
      expect(within(panel).getByRole('link', { name: /\.pptx 내려받기$/ })).toBeTruthy()
      expect(within(panel).getByRole('button', { name: 'PPTX' }).getAttribute('aria-pressed')).toBe(
        'true',
      )
    })
  })

  /**
   * **닫는 장치가 실제로 이 화면에 붙어 있는가.** 장치 자체(왜 `mousedown`인지·토글이 두 번
   * 처리되지 않는지·리스너가 남지 않는지)는 `popover-dismiss.test.tsx`가 재고, 여기서는
   * **배선**만 본다 — 훅이 있어도 ref를 안 걸면 아무것도 실패하지 않은 채 안 닫힌다.
   */
  describe('닫기 (공용 장치의 배선)', () => {
    it('바깥을 누르면 닫힌다', async () => {
      const panel = await open(api(깨끗한))
      await within(panel).findByText('페이지 2장을 내보냅니다')

      // 셸 머리 밖의 아무 자리 — 캔버스를 쓴다.
      fireEvent.mouseDown(screen.getByRole('main', { name: '캔버스' }))

      expect(screen.queryByRole('group', { name: '내보내기' })).toBeNull()
      expect(screen.getByRole('button', { name: '내보내기' }).getAttribute('aria-expanded')).toBe('false')
    })

    it('Escape로 닫힌다', async () => {
      const panel = await open(api(깨끗한))
      await within(panel).findByText('페이지 2장을 내보냅니다')

      fireEvent.keyDown(document, { key: 'Escape' })

      expect(screen.queryByRole('group', { name: '내보내기' })).toBeNull()
    })

    it('안쪽을 눌러도 안 닫힌다', async () => {
      const panel = await open(api(깨끗한))
      const 경로 = await within(panel).findByRole('region', { name: '페이지 경로' })

      fireEvent.mouseDown(경로)

      expect(screen.getByRole('group', { name: '내보내기' })).toBeTruthy()
    })
  })
})
