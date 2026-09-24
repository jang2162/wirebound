/**
 * **내려받기 화면**(HTML 번들 · PPTX 형식 토글). `<App />`을 라우트째 렌더한다
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
 * 일부러 가른 값이라(`apps/api`의 `services/export-pptx.ts` 머리말 «`screenless`와 실패를
 * 가른다») **서로 다른 페이지**를 넣어 접히는지
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
import { currentPath, expiringSession } from '../helpers'

/**
 * **`title`은 서버가 조립한 번들 이름이다**(조상 메뉴가 붙어 있다).
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

/**
 * 늦게 오는 **실패**가 낼 문장. 케이스가 *"이 문장이 화면에 없다"*를 짚으므로 한 자리에
 * 둔다 — 두 벌로 적으면 한쪽만 고친 채 통과한다. 갈래를 안 가리는 것은 케이스마다 늦게
 * 오는 실패가 하나뿐이기 때문이다.
 */
const 늦은실패 = '앞 형식을 만들지 못했습니다'

function api(
  preview: ExportPreview | ((format: ExportFormat) => Promise<ExportPreview>),
): Partial<ApiClient> {
  return {
    getExportPreview:
      typeof preview === 'function' ? (_projectId, format) => preview(format) : async () => preview,
    // 받은 형식을 바이트에 싣는다 — 형식을 무시하면 *"pptx를 보고 zip을 받는"* 상태를 케이스가 못 잡는다.
    downloadExport: async (_projectId, format) => new Blob([format]),
  }
}

/** 형식마다 다른 것을 내는 가짜. */
function 형식별(html: ExportPreview, pptx: ExportPreview) {
  return async (format: ExportFormat): Promise<ExportPreview> => (format === 'pptx' ? pptx : html)
}

/**
 * **한 형식의 답을 붙잡아 두는 가짜.** 늦게 오는 답은 손에 쥐고 있다가 놓아야 만들어지는데,
 * 그 장치를 케이스마다 한 벌씩 두면 경합을 재는 자리가 갈린다 — 순서는 전부 같고 **늦게
 * 오는 것이 성공이냐 실패냐**만 다르다(`load()`의 try·catch 쪽 표 검사는 같은 규칙의
 * 두 자리다).
 *
 * `붙잡을형식`의 조회는 `놓아주기()` 전까지 답하지 않는다. 놓으면 `늦은답()`이 내는 것을
 * 답하는데, **그것이 던지면 늦게 오는 실패**가 된다. `도착함()`은 그 답이 `load()`에 실제로
 * 닿은 횟수다 — 놓자마자 재면 아직 아무것도 안 흐른 것을 *"버렸다"*로 읽는다.
 */
function 붙잡는(붙잡을형식: ExportFormat, 늦은답: () => ExportPreview, 빠른답: ExportPreview) {
  let 풀기: (() => void) | undefined
  let 도착 = 0

  return {
    /** `api()`에 그대로 넘기는 가짜. */
    가짜: async (format: ExportFormat): Promise<ExportPreview> => {
      if (format !== 붙잡을형식) return 빠른답
      await new Promise<void>((resolve) => {
        풀기 = resolve
      })
      도착 += 1
      return 늦은답()
    },
    놓아주기: (): void => {
      풀기?.()
    },
    도착함: (): number => 도착,
  }
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
 * **경고 구역들이 내려받기 링크보다 앞에 있는가**(아래 두면 사람이 누르고 나서 본다).
 *
 * **두 갈래가 지키는 규칙은 하나인데 그리는 자리가 둘이라** 재는 자리도 갈리면 한쪽만
 * 고쳐진 채 남는다. 갈래마다 다른 것은 경고의 **이름들**뿐이므로 그것만 받는다.
 */
function 경고가링크보다앞(panel: HTMLElement, 이름들: readonly string[]): void {
  const link = within(panel).getByRole('button', { name: /내려받기$/ })

  for (const 이름 of 이름들) {
    const 구역 = within(panel).getByRole('region', { name: 이름 })
    // `DOCUMENT_POSITION_FOLLOWING`(4) — 링크가 구역보다 **뒤에** 있다.
    expect(구역.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  }
}

/**
 * **저장을 본다** — 화면은 받은 blob 에 주소를 걸어 임시 앵커를 누른다(`saveBlob`). jsdom 에는 `URL.createObjectURL`이 없고
 * 앵커를 눌러도 아무 데도 가지 않으므로 둘을 갈아 끼워 **무엇을 어떤 이름으로 저장했나**를 적는다. 끝나면 되돌린다.
 */
function 저장을본다(): { 저장한(): { fileName: string; text: string }[]; 되돌리기(): void } {
  const blobs = new Map<string, Blob>()
  let clicked = 0
  const texts: { fileName: string; text: string }[] = []
  const created = URL.createObjectURL
  const revoked = URL.revokeObjectURL
  const click = HTMLAnchorElement.prototype.click
  URL.createObjectURL = (blob: Blob) => {
    const url = `blob:test/${blobs.size}`
    blobs.set(url, blob)
    return url
  }
  URL.revokeObjectURL = () => undefined
  HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
    const blob = blobs.get(this.href)
    if (blob === undefined) return click.call(this)
    clicked += 1
    const fileName = this.download
    // jsdom 의 `Blob`에는 `text()`가 없다 — `FileReader`로 읽는다.
    const reader = new FileReader()
    reader.onload = () => texts.push({ fileName, text: String(reader.result) })
    reader.readAsText(blob)
  }
  return {
    // 글자를 다 읽은 뒤에만 낸다 — 읽는 중에 재면 «저장 안 함»으로 읽힌다.
    저장한: () => (texts.length === clicked ? texts : []),
    되돌리기: () => {
      URL.createObjectURL = created
      URL.revokeObjectURL = revoked
      HTMLAnchorElement.prototype.click = click
    },
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
    const 저장 = 저장을본다()
    try {
      const panel = await open(api(깨끗한))
      fireEvent.click(await within(panel).findByRole('button', { name: 'wirebound-export-admin-console.zip 내려받기' }))
      await waitFor(() => expect(저장.저장한()).toHaveLength(1))
      expect(저장.저장한()[0]).toEqual({ fileName: 'wirebound-export-admin-console.zip', text: 'html' })
    } finally {
      저장.되돌리기()
    }
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
      // `index.html`이 담는 첫 페이지의 오류에도 `pages/….html`이 붙는다.
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
        await within(panel).findByRole('button', { name: /내려받기$/ }),
      ).toBeTruthy()
    })

    /**
     * 경고가 내려받기 링크보다 **먼저** 온다. **pptx 갈래에도 같은 케이스가 있다** —
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
   * 나오는가"*인데, 그 사이 페이지를 고쳤을 수 있다. 낡은 답을 보이면 경고가 지금 내보낼 것과 어긋난다.
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

  describe('형식 토글', () => {
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
     * **접으면 화면이 거짓을 말한다**(`services/export-pptx.ts` 머리말 «`screenless`와 실패를 가른다»). 두 값에 **다른**
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

    /** 경고가 내려받기 링크보다 **먼저** 온다 — 아래 두면 사람이 누르고 나서 본다. */
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

    it('내려받는 형식과 이름이 pptx를 따른다', async () => {
      const 저장 = 저장을본다()
      try {
        const panel = await openPptx(api(형식별(깨끗한, pptx깨끗한)))
        fireEvent.click(within(panel).getByRole('button', { name: 'wirebound-export-admin-console.pptx 내려받기' }))
        await waitFor(() => expect(저장.저장한()).toHaveLength(1))
        expect(저장.저장한()[0]).toEqual({ fileName: 'wirebound-export-admin-console.pptx', text: 'pptx' })
      } finally {
        저장.되돌리기()
      }
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
      expect(within(panel).getByRole('button', { name: /\.pptx 내려받기$/ })).toBeTruthy()
    })

    it('부르는 동안엔 앞 형식의 결과가 이미 없다', async () => {
      const 늦은 = 붙잡는('pptx', () => pptx어긋난, 어긋난)
      const panel = await open(api(늦은.가짜))
      await within(panel).findByRole('region', { name: '페이지 경로' })

      fireEvent.click(within(panel).getByRole('button', { name: 'PPTX' }))

      // 아직 아무 답도 안 왔는데 앞 형식의 것이 남아 있으면 안 된다.
      expect(within(panel).queryByRole('region', { name: '페이지 경로' })).toBeNull()
      expect(within(panel).queryByRole('button', { name: /내려받기$/ })).toBeNull()
      expect(within(panel).getByRole('status')).toBeTruthy()

      늦은.놓아주기()
      await within(panel).findByRole('region', { name: '슬라이드에 실릴 페이지' })
    })

    /**
     * **늦게 온 답이 화면을 덮으면 안 된다.** pptx는 페이지를 그리느라 html보다 오래 걸리므로
     * pptx를 눌렀다 html로 되돌리면 먼저 보낸 pptx가 나중에 도착한다.
     */
    it('늦게 온 앞 형식의 답이 뒤 형식의 화면을 덮지 않는다', async () => {
      const 늦은 = 붙잡는('pptx', () => pptx깨끗한, 깨끗한)
      const panel = await open(api(늦은.가짜))
      await within(panel).findByRole('region', { name: '페이지 경로' })

      fireEvent.click(within(panel).getByRole('button', { name: 'PPTX' }))
      fireEvent.click(within(panel).getByRole('button', { name: 'HTML 번들' }))
      await within(panel).findByRole('region', { name: '페이지 경로' })

      // 이제야 pptx가 답한다.
      늦은.놓아주기()
      await waitFor(() => expect(늦은.도착함()).toBe(1))

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
     * 심으면 위 케이스는 살고 이 케이스만 죽는다.
     */
    it('늦게 온 html 답이 뒤에 고른 pptx 화면을 덮지 않는다', async () => {
      const 늦은 = 붙잡는('html', () => 깨끗한, pptx깨끗한)
      const panel = await open(api(늦은.가짜))
      // 여는 순간의 html이 아직 안 왔다 — 이 상태에서 형식을 바꾸는 것이 이 순서다.
      await within(panel).findByRole('status')

      fireEvent.click(within(panel).getByRole('button', { name: 'PPTX' }))
      await within(panel).findByRole('region', { name: '슬라이드에 실릴 페이지' })

      // 이제야 html이 답한다.
      늦은.놓아주기()
      await waitFor(() => expect(늦은.도착함()).toBe(1))

      expect(within(panel).queryByRole('region', { name: '페이지 경로' })).toBeNull()
      expect(within(panel).getByRole('region', { name: '슬라이드에 실릴 페이지' })).toBeTruthy()
      expect(within(panel).getByRole('button', { name: /\.pptx 내려받기$/ })).toBeTruthy()
      expect(within(panel).getByRole('button', { name: 'PPTX' }).getAttribute('aria-pressed')).toBe(
        'true',
      )
    })

    /**
     * **늦게 온 실패도 버린다** — `load()`의 catch 쪽 표 검사. 성공 쪽 둘이 재는 것과 같은
     * 규칙이 같은 함수 안에 두 자리로 있으므로, 성공 쪽만 재면 catch 쪽은 아무도 안 잰다.
     *
     * 버리지 않으면 사람이 보는 것은 이렇다: 형식을 바꿔 새 형식이 이미 그려져 있는데
     * **앞 형식의 오류 문장**이 그 위를 덮는다 — 화면 전체가 `role="alert"` 하나로 바뀌므로
     * 새 형식의 미리보기가 통째로 사라진다.
     */
    it('늦게 온 pptx 실패가 뒤에 고른 html 화면을 덮지 않는다', async () => {
      const 늦은 = 붙잡는(
        'pptx',
        () => {
          throw new ApiError(500, 'internal', 늦은실패)
        },
        깨끗한,
      )
      const panel = await open(api(늦은.가짜))
      await within(panel).findByRole('region', { name: '페이지 경로' })

      fireEvent.click(within(panel).getByRole('button', { name: 'PPTX' }))
      fireEvent.click(within(panel).getByRole('button', { name: 'HTML 번들' }))
      await within(panel).findByRole('region', { name: '페이지 경로' })

      // 이제야 pptx가 죽었다고 답한다.
      늦은.놓아주기()
      await waitFor(() => expect(늦은.도착함()).toBe(1))

      expect(within(panel).queryByRole('alert')).toBeNull()
      expect(panel.textContent).not.toContain(늦은실패)
      expect(within(panel).getByRole('region', { name: '페이지 경로' })).toBeTruthy()
      expect(within(panel).getByRole('button', { name: /\.zip 내려받기$/ })).toBeTruthy()
    })

    /**
     * **실패 쪽도 두 방향을 잰다 — 근거는 성공 쪽과 같다.**
     *
     * catch 에는 `preview`가 없지만 그 조회의 형식(`next`)은 클로저에 있어 *"html 실패는
     * 표를 안 보고 띄운다"*가 **그대로 쓰인다.** 그 구현을 심으면 위 케이스를 포함해 이 파일에서
     * 이 케이스 말고는 전부 통과한다 — 한 방향은 부족하다. 순서도 지어낸 것이 아니다: **열자마자 PPTX를
     * 누르면** 늦게 죽는 쪽이 여는 순간의 html 조회다.
     */
    it('늦게 온 html 실패가 뒤에 고른 pptx 화면을 덮지 않는다', async () => {
      const 늦은 = 붙잡는(
        'html',
        () => {
          throw new ApiError(500, 'internal', 늦은실패)
        },
        pptx깨끗한,
      )
      const panel = await open(api(늦은.가짜))
      await within(panel).findByRole('status')

      fireEvent.click(within(panel).getByRole('button', { name: 'PPTX' }))
      await within(panel).findByRole('region', { name: '슬라이드에 실릴 페이지' })

      // 이제야 html이 죽었다고 답한다.
      늦은.놓아주기()
      await waitFor(() => expect(늦은.도착함()).toBe(1))

      expect(within(panel).queryByRole('alert')).toBeNull()
      expect(panel.textContent).not.toContain(늦은실패)
      expect(within(panel).getByRole('region', { name: '슬라이드에 실릴 페이지' })).toBeTruthy()
      expect(within(panel).getByRole('button', { name: /\.pptx 내려받기$/ })).toBeTruthy()
    })
  })

  /**
   * **앞 요청은 끊는다**(`shell/export-panel.tsx` 머리말 «앞 요청은 끊는다»). 표가 늦은 답을 화면에서 버려도 요청이
   * 살아 있으면 서버는 그 내보내기를 끝까지 돌고, 이 사람의 다음 미리보기가 그 뒤에 선다. 재는 것은 **받은 끊는 신호가
   * 끊겼는가**다 — 끊긴 요청이 서버에서 어떻게 되는지는 `apps/api`의 `export-worker-abort.test.ts`가 잰다.
   */
  describe('앞 요청은 끊는다', () => {
    /** 부른 조회마다 받은 끊는 신호를 적는다. 끊길 때까지 답하지 않는다 — 끊기면 실제 요청처럼 거절한다. */
    function 매달린() {
      const 받은: { format: ExportFormat; cancel: AbortSignal | undefined }[] = []
      const getExportPreview: ApiClient['getExportPreview'] = (_projectId, format, options) => {
        받은.push({ format, cancel: options?.cancel })
        return new Promise<ExportPreview>((_resolve, reject) => {
          options?.cancel?.addEventListener('abort', () => reject(new ApiError(0, 'internal', '끊었다')))
        })
      }
      return { overrides: { ...api(깨끗한), getExportPreview }, 받은 }
    }

    it('토글로 닫으면 부르던 조회를 끊는다', async () => {
      const 가짜 = 매달린()
      await open(가짜.overrides)
      await waitFor(() => expect(가짜.받은).toHaveLength(1))
      expect(가짜.받은[0]!.cancel?.aborted).toBe(false)

      fireEvent.click(screen.getByRole('button', { name: '내보내기' }))
      expect(가짜.받은[0]!.cancel?.aborted).toBe(true)
    })

    it('Escape 로 닫아도 끊는다 — 닫는 길이 공용 장치여도', async () => {
      const 가짜 = 매달린()
      await open(가짜.overrides)
      await waitFor(() => expect(가짜.받은).toHaveLength(1))

      fireEvent.keyDown(document, { key: 'Escape' })
      expect(screen.queryByRole('group', { name: '내보내기' })).toBeNull()
      expect(가짜.받은[0]!.cancel?.aborted).toBe(true)
    })

    it('형식을 바꾸면 앞 형식의 조회를 끊고 새 조회는 살린다', async () => {
      const 가짜 = 매달린()
      const panel = await open(가짜.overrides)
      await waitFor(() => expect(가짜.받은).toHaveLength(1))

      fireEvent.click(within(panel).getByRole('button', { name: 'PPTX' }))
      await waitFor(() => expect(가짜.받은).toHaveLength(2))
      expect(가짜.받은.map((call) => [call.format, call.cancel?.aborted])).toEqual([
        ['html', true],
        ['pptx', false],
      ])
    })

    it('화면이 내려가면 끊는다', async () => {
      const 가짜 = 매달린()
      await open(가짜.overrides)
      await waitFor(() => expect(가짜.받은).toHaveLength(1))

      cleanup()
      expect(가짜.받은[0]!.cancel?.aborted).toBe(true)
    })
  })

  /**
   * **내려받기의 실패를 이 상자가 말한다**(`shell/export-panel.tsx` «내려받기는 받아 온 뒤 저장한다»). 앵커로 받을 때는 그
   * 실패가 브라우저의 내려받기 목록에만 `canceled`로 남았다 — 미리보기가 된 뒤 서버가 503 · 409 로 거절하는 판이 그것이다.
   */
  describe('내려받기가 실패하면 그 이유를 말한다', () => {
    function 거절하는(error: unknown) {
      const 받은: { projectId: string; format: ExportFormat }[] = []
      const downloadExport: ApiClient['downloadExport'] = async (projectId, format) => {
        받은.push({ projectId, format })
        throw error
      }
      return { overrides: { ...api(깨끗한), downloadExport }, 받은 }
    }

    it('서버의 문장을 그대로 말하고 저장하지 않는다 — 503 · 409', async () => {
      for (const error of [
        new ApiError(503, 'internal', '내 내보내기가 이미 돌고 있습니다 — 앞의 것이 끝난 뒤 다시 시도하세요'),
        new ApiError(409, 'conflict', '내보낼 페이지가 없습니다'),
      ]) {
        const 저장 = 저장을본다()
        try {
          const 가짜 = 거절하는(error)
          const panel = await open(가짜.overrides)
          fireEvent.click(await within(panel).findByRole('button', { name: /내려받기$/ }))
          expect(await within(panel).findByRole('alert')).toHaveProperty('textContent', error.message)
          expect(가짜.받은).toEqual([{ projectId: PROJECT_ID, format: 'html' }])
          expect(저장.저장한()).toEqual([])
          // 미리보기는 그대로다 — 실패한 것은 내려받기이지 미리보기가 아니다.
          expect(within(panel).getByText('페이지 2장을 내보냅니다')).toBeTruthy()
        } finally {
          저장.되돌리기()
          cleanup()
        }
      }
    })

    it('세션이 끊겼으면 문장이 아니라 로그인이다', async () => {
      const 가짜 = 거절하는(new ApiError(401, 'unauthenticated', '로그인이 필요합니다'))
      // 하네스의 사람과 같은 값이다(`editor-harness.tsx`의 `USER`) — 첫 `me`만 살고 뒤는 401 이다.
      const panel = await open({ ...가짜.overrides, me: expiringSession({ id: 'u-1', email: 'me@example.com', name: '테스터' }) })
      fireEvent.click(await within(panel).findByRole('button', { name: /내려받기$/ }))
      await waitFor(() => expect(currentPath()).toBe('/login'))
      expect(screen.queryByText('로그인이 필요합니다')).toBeNull()
    })

    it('받는 동안 버튼을 잠근다 — 두 번 누르면 서버의 일이 둘이 된다', async () => {
      let 풀기: ((blob: Blob) => void) | undefined
      let 불린 = 0
      const downloadExport: ApiClient['downloadExport'] = () => {
        불린 += 1
        return new Promise<Blob>((resolve) => {
          풀기 = resolve
        })
      }
      const 저장 = 저장을본다()
      try {
        const panel = await open({ ...api(깨끗한), downloadExport })
        const button = await within(panel).findByRole('button', { name: /내려받기$/ })
        fireEvent.click(button)
        expect(await within(panel).findByRole('status')).toHaveProperty('textContent', '파일을 만드는 중…')
        expect(button).toHaveProperty('disabled', true)
        fireEvent.click(button)
        expect(불린).toBe(1)

        풀기?.(new Blob(['html']))
        await waitFor(() => expect(저장.저장한()).toHaveLength(1))
        expect(button).toHaveProperty('disabled', false)
        expect(within(panel).queryByRole('status')).toBeNull()
      } finally {
        저장.되돌리기()
      }
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
