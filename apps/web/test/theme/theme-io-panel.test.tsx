/**
 * 가져오기·내보내기·되돌리기 화면(P4c-3 T2·T3·T5, D3·D5).
 *
 * **라우트 전체를 띄워서 잰다** — `theme-editor.test.tsx`와 같은 형식이다. 배선(라우트가
 * 내려주는 `onImportAsNew`·`canCreate`)이 이 슬라이스의 절반이라 화면만 떼어 재면 그 절반이
 * 안 잡힌다.
 *
 * ---
 *
 * # jsdom이 내려받기를 어떻게 재는가 — **절반은 대역이다. 그렇게 적는다**
 *
 * 계획서 T2가 *"`URL.createObjectURL`이 jsdom에 없을 수 있다 — 재고 판단하라"*고 했다.
 * **쟀다**(내가 이 워크트리에서 쟀다): `URL.createObjectURL`·`URL.revokeObjectURL`이
 * **둘 다 `undefined`**이고, `Blob.prototype`에 **`text()`도 `arrayBuffer()`도 없다**
 * (`constructor`·`slice`·`size`·`type` 넷뿐이다). `FileReader`와 `HTMLAnchorElement.click`은
 * 있다.
 *
 * **그래서 아래 `withDownloadCapture`가 그 둘에 대역을 심고 Blob을 붙잡아 `FileReader`로
 * 읽는다.** 실제로 재는 것은 넷이다 — ㉠ Blob에 실린 **글자** ㉡ 앵커의 `download` 이름
 * ㉢ 클릭이 한 번 일어난 것 ㉣ revoke가 그 URL로 불린 것. **재지 못하는 것은 브라우저가
 * 실제로 파일을 저장하는지**이고 그것은 실브라우저의 몫이다.
 *
 * > **측정 장치의 함정 하나를 실제로 밟았다.** Blob의 글자를 `await new Response(blob).text()`로
 * > 읽어 봤더니 **던지지 않고 `"[object Blob]"`을 냈다**(내가 쟀다) — Node의 전역 `Response`가
 * > jsdom의 `Blob`을 문자열로 바꾼 것이다. **초록인 채로 거짓을 재는 형태**라 `FileReader`로
 * > 장치를 바꿨다(P4c-2 §3.2의 교훈).
 */
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { systemTheme, type Theme } from '@wirebound/themes'
import { App } from '../../src/app'
import { ApiError, type ApiClient } from '../../src/api/client'
import type { ProjectDetail, ThemeDetail } from '../../src/api/types'
import { currentPath, fakeApi, renderWithProviders } from '../helpers'
import { exportFileName, exportText } from '../../src/theme/theme-io'

const user = { id: 'u1', email: 'a@b.c', name: '홍길동' }

function project(role: ProjectDetail['role'] = 'owner'): ProjectDetail {
  return { id: 'p1', name: '프로젝트', slug: 'proj', description: null, role }
}

/** 프로젝트 소유의 파생 테마. `base`가 함께 온다. */
function derived(overrides: Partial<ThemeDetail> = {}): ThemeDetail {
  return {
    id: 't1',
    system: false,
    updatedAt: '2026-08-11T09:00:00.000Z',
    theme: { meta: { id: 'brand', name: '브랜드', version: '1.0.0', extends: 'system:admin' } },
    base: systemTheme('admin') as Theme,
    ...overrides,
  }
}

/** 상속 없는 프로젝트 테마. **`base`가 없다.** */
function standalone(theme?: Theme): ThemeDetail {
  return {
    id: 't1',
    system: false,
    updatedAt: '2026-08-11T09:00:00.000Z',
    theme: theme ?? { meta: { id: 'solo', name: '홀로', version: '1.0.0' } },
  }
}

function open(options: {
  role?: ProjectDetail['role']
  detail?: ThemeDetail
  createTheme?: ApiClient['createTheme']
  updateTheme?: ApiClient['updateTheme']
} = {}): void {
  const detail = options.detail ?? derived()
  renderWithProviders(<App />, {
    route: '/projects/p1/themes/t1',
    client: fakeApi({
      me: async () => user,
      getProject: async () => project(options.role ?? 'owner'),
      getTheme: async () => detail,
      ...(options.createTheme === undefined ? {} : { createTheme: options.createTheme }),
      ...(options.updateTheme === undefined ? {} : { updateTheme: options.updateTheme }),
    }),
  })
}

/** 내려받기 한 번이 남긴 것. 머리말의 넷이 여기 다 있다. */
interface Download {
  fileName: string
  href: string
  text: string
  clicks: number
  revoked: string[]
}

/**
 * `URL.createObjectURL`·`revokeObjectURL`에 **대역을 심고** 그 안에서 부른다.
 *
 * **원본 전문을 먼저 들고 `finally`에서 되쓴다** — 없던 속성이면 지운다. 확인이 실패해도
 * 복구가 도는 배치이고, 그 형식은 P4c-2 ③의 변조 하네스와 같은 근거다.
 */
async function withDownloadCapture(run: () => void): Promise<Download> {
  const url = URL as unknown as Record<string, unknown>
  const hadCreate = 'createObjectURL' in url
  const hadRevoke = 'revokeObjectURL' in url
  const originalCreate = url.createObjectURL
  const originalRevoke = url.revokeObjectURL

  const blobs = new Map<string, Blob>()
  const revoked: string[] = []
  let clicks = 0
  let fileName = ''
  let href = ''

  const onClick = (event: Event): void => {
    const target = event.target as HTMLElement
    if (target.tagName !== 'A') return
    clicks += 1
    fileName = (target as HTMLAnchorElement).getAttribute('download') ?? ''
    href = (target as HTMLAnchorElement).getAttribute('href') ?? ''
    // jsdom은 앵커 클릭을 **이동**으로 읽고 `Not implemented: navigation`을 콘솔에 쏟는다.
    // 여기서 막는 것은 그 소음이지 측정 대상이 아니다 — 위 셋은 이미 읽었다.
    event.preventDefault()
  }

  try {
    url.createObjectURL = (blob: Blob): string => {
      const made = `blob:probe/${blobs.size}`
      blobs.set(made, blob)
      return made
    }
    url.revokeObjectURL = (value: string): void => {
      revoked.push(value)
    }
    document.addEventListener('click', onClick, true)
    run()
  } finally {
    document.removeEventListener('click', onClick, true)
    if (hadCreate) url.createObjectURL = originalCreate
    else delete url.createObjectURL
    if (hadRevoke) url.revokeObjectURL = originalRevoke
    else delete url.revokeObjectURL
  }

  const blob = blobs.get(href)
  const text =
    blob === undefined
      ? ''
      : await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(String(reader.result ?? ''))
          reader.onerror = () => reject(reader.error)
          reader.readAsText(blob)
        })

  return { fileName, href, text, clicks, revoked }
}

/** 가져오기 쪽의 토글. **접힌 채로도 늘 있다.** */
function importToggle(): HTMLButtonElement {
  return screen.getByRole('button', { name: '테마 JSON 가져오기' }) as HTMLButtonElement
}

/**
 * 가져오기 쪽을 편다. **기본이 접힘이라**(화면 머리말) 파일 고르개·붙여 넣기 칸·버튼 둘에
 * 닿는 케이스는 전부 이것을 먼저 부른다 — 접힌 동안에는 그것들이 **DOM에 없다.**
 */
function openImport(): void {
  if (importToggle().getAttribute('aria-expanded') === 'false') fireEvent.click(importToggle())
}

function paste(text: string): void {
  openImport()
  fireEvent.change(screen.getByRole('textbox', { name: '테마 JSON' }), { target: { value: text } })
}

describe('내보내기 (T2)', () => {
  it('버튼을 누르면 봉투에 담긴 글자가 파일 이름과 함께 나간다', async () => {
    open()
    const button = await screen.findByRole('button', { name: '내보내기' })

    const download = await withDownloadCapture(() => fireEvent.click(button))

    expect(download.clicks).toBe(1)
    expect(download.fileName).toBe('brand.wirebound-theme.json')
    // **Blob의 내용을 직접 단언한다** — `FileReader`로 읽은 실제 글자다.
    expect(download.text).toBe(exportText(derived().theme))
    expect(JSON.parse(download.text).wireboundVersion).toBe('1')
  })

  it('만든 URL을 되돌려 준다 — 안 하면 문서가 사는 동안 Blob이 남는다', async () => {
    open()
    const button = await screen.findByRole('button', { name: '내보내기' })

    const download = await withDownloadCapture(() => fireEvent.click(button))

    expect(download.revoked).toEqual([download.href])
  })

  it('앵커를 화면에 안 남긴다 — 두 번 내보내면 앵커가 둘이 될 자리다', async () => {
    open()
    const button = await screen.findByRole('button', { name: '내보내기' })

    await withDownloadCapture(() => {
      fireEvent.click(button)
      fireEvent.click(button)
    })

    expect(document.querySelectorAll('a[download]').length).toBe(0)
  })

  it('읽기 전용 테마도 내보낼 수 있다 — §6.10의 재사용이 여기서 시작한다', async () => {
    open({ detail: { ...standalone(systemTheme('admin') as Theme), id: 't1', system: true } })

    const button = await screen.findByRole('button', { name: '내보내기' })

    expect((button as HTMLButtonElement).disabled).toBe(false)
  })

  it('파생이면 받는 쪽의 내장 테마가 다를 수 있다고 말한다 (재라 #2)', async () => {
    open()
    await screen.findByRole('button', { name: '내보내기' })

    expect(screen.getByText(/같은 파일이 다른 테마가 됩니다/)).toBeTruthy()
    // **봉투에는 안 적는다** — 화면이 말하는 것으로 끝낸 판정이다.
    const download = await withDownloadCapture(() =>
      fireEvent.click(screen.getByRole('button', { name: '내보내기' })),
    )
    expect(Object.keys(JSON.parse(download.text))).toEqual(['wireboundVersion', 'theme'])
  })

  it('파생이 아니면 그 문장이 없다', async () => {
    open({ detail: standalone() })
    await screen.findByRole('button', { name: '내보내기' })

    expect(screen.queryByText(/같은 파일이 다른 테마가 됩니다/)).toBeNull()
  })
})

describe('가져오기 A — 초안으로 (T3, D3-A)', () => {
  it('왕복 — 내보낸 글자를 그대로 다시 넣으면 같은 문서다', async () => {
    open()
    const button = await screen.findByRole('button', { name: '내보내기' })
    const download = await withDownloadCapture(() => fireEvent.click(button))

    // 먼저 초안을 흐트러뜨린다 — 넣기가 실제로 갈아 끼우는지 보려면 달라야 한다.
    fireEvent.change(screen.getByRole('textbox', { name: '테마 이름' }), {
      target: { value: '엉뚱한 이름' },
    })
    expect(screen.getByRole('textbox', { name: '테마 이름' })).toHaveProperty('value', '엉뚱한 이름')

    paste(download.text)
    fireEvent.click(screen.getByRole('button', { name: '초안에 넣기' }))

    expect(screen.getByRole('textbox', { name: '테마 이름' })).toHaveProperty('value', '브랜드')
    expect(screen.getByText(/초안에 넣었습니다/)).toBeTruthy()
  })

  it('절 하나가 통째로 들어온다 — replaceDraft를 부르는 첫 자리다', async () => {
    open({ detail: standalone() })
    await screen.findByRole('button', { name: '내보내기' })

    paste(
      JSON.stringify({
        wireboundVersion: '1',
        theme: {
          meta: { id: 'solo', name: '가져온 이름', version: '2.0.0' },
          // **리터럴이다** — 이 테마에는 `tokens`가 없어 `semantic.primary`를 쓰면
          // 참조가 안 풀려 `error`가 나고, 그러면 이 케이스가 재려던 것(넣기)이 아니라
          // 거절을 재게 된다. (처음 판이 실제로 그렇게 죽었다.)
          components: { Button: { base: { bg: '#123456' } } },
        },
      }),
    )
    fireEvent.click(screen.getByRole('button', { name: '초안에 넣기' }))

    expect(screen.getByRole('textbox', { name: '테마 이름' })).toHaveProperty('value', '가져온 이름')
    // JSON 상자가 새 문서에서 텍스트를 다시 만든다(`draftEpoch`).
    expect(screen.getByRole('textbox', { name: 'components' })).toHaveProperty(
      'value',
      JSON.stringify({ Button: { base: { bg: '#123456' } } }, null, 2),
    )
  })

  it('없어진 절이 실제로 지워진다 — putSection으로는 못 하는 일이다', async () => {
    open({
      detail: standalone({
        meta: { id: 'solo', name: '홀로', version: '1.0.0' },
        components: { Button: { base: { bg: 'semantic.primary' } } },
      }),
    })
    await screen.findByRole('button', { name: '내보내기' })
    expect(screen.getByRole('textbox', { name: 'components' })).not.toHaveProperty('value', '')

    paste(
      JSON.stringify({
        wireboundVersion: '1',
        theme: { meta: { id: 'solo', name: '홀로', version: '1.0.0' } },
      }),
    )
    fireEvent.click(screen.getByRole('button', { name: '초안에 넣기' }))

    expect(screen.getByRole('textbox', { name: 'components' })).toHaveProperty('value', '')
  })

  it('읽지 못하면 초안을 안 건드리고 이유를 말한다', async () => {
    open()
    await screen.findByRole('button', { name: '내보내기' })

    paste('{"wireboundVersion":')
    fireEvent.click(screen.getByRole('button', { name: '초안에 넣기' }))

    expect(screen.getAllByRole('alert').some((n) => /JSON/.test(n.textContent ?? ''))).toBe(true)
    expect(screen.getByRole('textbox', { name: '테마 이름' })).toHaveProperty('value', '브랜드')
  })

  it('error를 내는 문서는 안 넣고 그 이슈를 path까지 보인다 (D3)', async () => {
    open({ detail: standalone() })
    await screen.findByRole('button', { name: '내보내기' })

    paste(
      JSON.stringify({
        wireboundVersion: '1',
        theme: {
          meta: { id: 'solo', name: '깨진 것', version: '1.0.0' },
          components: { Button: { base: { color: 'palette.blue.500' } } },
        },
      }),
    )
    fireEvent.click(screen.getByRole('button', { name: '초안에 넣기' }))

    // **초안이 안 바뀌었다.**
    expect(screen.getByRole('textbox', { name: '테마 이름' })).toHaveProperty('value', '홀로')
    // **거절한 이유가 자기 제목을 달고 나온다** — D7이 세운 `<h2>`가 여기서 하중이 된다.
    expect(screen.getByRole('heading', { name: '가져오기가 거절한 이유' })).toBeTruthy()
    expect(screen.getByText('components.Button.base.color')).toBeTruthy()
  })

  it('상속 대상이 다르면 거절하고 B를 가리킨다', async () => {
    open() // 지금 초안은 `system:admin` 파생이다.
    await screen.findByRole('button', { name: '내보내기' })

    paste(
      JSON.stringify({
        wireboundVersion: '1',
        theme: { meta: { id: 'brand', name: '다른 상속', version: '1.0.0', extends: 'system:portal' } },
      }),
    )
    fireEvent.click(screen.getByRole('button', { name: '초안에 넣기' }))

    const alert = screen.getAllByRole('alert').find((n) => /상속 대상이 다른 테마/.test(n.textContent ?? ''))
    expect(alert).toBeTruthy()
    expect(alert?.textContent).toContain('새 테마로 가져오기')
    expect(screen.getByRole('textbox', { name: '테마 이름' })).toHaveProperty('value', '브랜드')
  })

  it('테마 id가 바뀌면 저장에서 409가 날 수 있다고 말한다 (재라 #3)', async () => {
    open({ detail: standalone() })
    await screen.findByRole('button', { name: '내보내기' })

    paste(
      JSON.stringify({
        wireboundVersion: '1',
        theme: { meta: { id: 'other', name: '홀로', version: '1.0.0' } },
      }),
    )
    fireEvent.click(screen.getByRole('button', { name: '초안에 넣기' }))

    // **막지 않는다** — 서버가 그 규칙을 갖고 있다(`PUT`의 409).
    expect(screen.getByText(/테마 id가 solo에서 other로 바뀝니다/)).toBeTruthy()
  })

  it('폰트를 선언한 테마면 리소스가 함께 오지 않는다고 말한다 (재라 #6)', async () => {
    open({ detail: standalone() })
    await screen.findByRole('button', { name: '내보내기' })

    paste(
      JSON.stringify({
        wireboundVersion: '1',
        theme: {
          meta: { id: 'solo', name: '홀로', version: '1.0.0' },
          assets: { fonts: [{ family: 'Pretendard', src: 'url("/f.woff2") format("woff2")' }] },
        },
      }),
    )
    fireEvent.click(screen.getByRole('button', { name: '초안에 넣기' }))

    expect(screen.getByText(/폰트 파일은 함께 오지 않습니다/)).toBeTruthy()
  })

  it('읽기 전용이면 넣기가 막힌다 — 내보내기는 안 막힌다', async () => {
    open({ detail: { ...standalone(systemTheme('admin') as Theme), id: 't1', system: true } })
    await screen.findByRole('button', { name: '내보내기' })

    paste('{"wireboundVersion":"1","theme":{"meta":{"id":"x","name":"x","version":"1"}}}')

    expect((screen.getByRole('button', { name: '초안에 넣기' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: '내보내기' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('파일을 고르면 그 글자가 붙여 넣기 상자에 온다 — 읽는 자리가 하나다', async () => {
    open({ detail: standalone() })
    await screen.findByRole('button', { name: '내보내기' })

    const text = JSON.stringify({
      wireboundVersion: '1',
      theme: { meta: { id: 'solo', name: '파일에서 왔다', version: '1.0.0' } },
    })
    const file = new File([text], 'solo.wirebound-theme.json', { type: 'application/json' })
    openImport()
    fireEvent.change(screen.getByLabelText('테마 파일'), { target: { files: [file] } })

    // `FileReader`가 비동기라 기다린다.
    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: '테마 JSON' })).toHaveProperty('value', text)
    })

    fireEvent.click(screen.getByRole('button', { name: '초안에 넣기' }))
    expect(screen.getByRole('textbox', { name: '테마 이름' })).toHaveProperty('value', '파일에서 왔다')
  })
})

describe('되돌리기 (D5 · 재라 #4)', () => {
  it('저장할 것이 없으면 못 누른다', async () => {
    open()
    await screen.findByRole('button', { name: '내보내기' })

    expect(
      (screen.getByRole('button', { name: '마지막 저장으로 되돌리기' }) as HTMLButtonElement).disabled,
    ).toBe(true)
  })

  it('한 번 더 묻고 나서 되돌린다 — window.confirm이 아니다', async () => {
    open()
    await screen.findByRole('button', { name: '내보내기' })
    fireEvent.change(screen.getByRole('textbox', { name: '테마 이름' }), {
      target: { value: '고친 이름' },
    })

    fireEvent.click(screen.getByRole('button', { name: '마지막 저장으로 되돌리기' }))

    // 아직 안 되돌렸다.
    expect(screen.getByRole('textbox', { name: '테마 이름' })).toHaveProperty('value', '고친 이름')
    expect(screen.getByText('저장 안 한 변경과 읽지 못한 글자를 버립니다.')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '되돌립니다' }))
    expect(screen.getByRole('textbox', { name: '테마 이름' })).toHaveProperty('value', '브랜드')
    // 되돌렸으니 저장할 것이 없다.
    expect(screen.queryByText('저장 안 함')).toBeNull()
  })

  it('그만두면 아무 일도 안 일어난다', async () => {
    open()
    await screen.findByRole('button', { name: '내보내기' })
    fireEvent.change(screen.getByRole('textbox', { name: '테마 이름' }), {
      target: { value: '고친 이름' },
    })

    fireEvent.click(screen.getByRole('button', { name: '마지막 저장으로 되돌리기' }))
    fireEvent.click(screen.getByRole('button', { name: '그만둡니다' }))

    expect(screen.getByRole('textbox', { name: '테마 이름' })).toHaveProperty('value', '고친 이름')
    expect(screen.getByRole('button', { name: '마지막 저장으로 되돌리기' })).toBeTruthy()
  })

  it('가져오기와 같은 문을 쓴다 — 되돌린 뒤 JSON 상자도 저장본으로 돌아온다', async () => {
    open({
      detail: standalone({
        meta: { id: 'solo', name: '홀로', version: '1.0.0' },
        components: { Button: { base: { bg: 'semantic.primary' } } },
      }),
    })
    await screen.findByRole('button', { name: '내보내기' })

    fireEvent.change(screen.getByRole('textbox', { name: 'components' }), {
      target: { value: '{"Card":{}}' },
    })
    expect(screen.getByRole('textbox', { name: 'components' })).toHaveProperty('value', '{"Card":{}}')

    fireEvent.click(screen.getByRole('button', { name: '마지막 저장으로 되돌리기' }))
    fireEvent.click(screen.getByRole('button', { name: '되돌립니다' }))

    expect(screen.getByRole('textbox', { name: 'components' })).toHaveProperty(
      'value',
      JSON.stringify({ Button: { base: { bg: 'semantic.primary' } } }, null, 2),
    )
  })
})

describe('가져오기 B — 새 테마로 (T5, D3-B · D4)', () => {
  const FILE = JSON.stringify({
    wireboundVersion: '1',
    theme: { meta: { id: 'brand', name: '가져온 테마', version: '1.0.0' } },
  })

  it('사용자가 정한 id로 만들고 그 편집 화면으로 간다', async () => {
    const createTheme = vi.fn(async () => ({ ...standalone(), id: 't-new' })) as unknown as ApiClient['createTheme']
    open({ detail: standalone(), createTheme })
    await screen.findByRole('button', { name: '내보내기' })

    paste(FILE)
    fireEvent.change(screen.getByLabelText('가져올 테마의 id'), { target: { value: 'copied' } })
    fireEvent.click(screen.getByRole('button', { name: '새 테마로 가져오기' }))

    await waitFor(() => {
      expect(currentPath()).toBe('/projects/p1/themes/t-new')
    })
    const sent = (createTheme as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![1] as { theme: Theme }
    // **파일의 id가 아니라 사용자가 고른 id다**(D4 — 409를 사용자가 풀 수 있게).
    expect(sent.theme.meta.id).toBe('copied')
    expect(sent.theme.meta.name).toBe('가져온 테마')
  })

  it('id가 비어 있으면 못 누른다 — 나머지 형식은 서버가 본다', async () => {
    open({ detail: standalone() })
    await screen.findByRole('button', { name: '내보내기' })
    paste(FILE)

    expect(
      (screen.getByRole('button', { name: '새 테마로 가져오기' }) as HTMLButtonElement).disabled,
    ).toBe(true)
  })

  it('409를 그대로 보인다 — 사용자가 id를 바꿔 다시 누른다', async () => {
    const createTheme = vi.fn(async () =>
      Promise.reject(new ApiError(409, 'conflict', '이미 사용 중인 테마 id입니다')),
    ) as unknown as ApiClient['createTheme']
    open({ detail: standalone(), createTheme })
    await screen.findByRole('button', { name: '내보내기' })

    paste(FILE)
    fireEvent.change(screen.getByLabelText('가져올 테마의 id'), { target: { value: 'solo' } })
    fireEvent.click(screen.getByRole('button', { name: '새 테마로 가져오기' }))

    expect(await screen.findByText('이미 사용 중인 테마 id입니다')).toBeTruthy()
    expect(currentPath()).toBe('/projects/p1/themes/t1')
  })

  it('서버가 422로 낸 이슈를 path까지 보인다', async () => {
    const createTheme = vi.fn(async () =>
      Promise.reject(
        // 서버는 422를 `validation-failed`로 낸다(`api/client.ts`의 `ApiErrorCode`).
        new ApiError(422, 'validation-failed', '테마가 유효하지 않습니다', [
          { code: 'unknown-component', path: 'components.Nope', message: '모르는 컴포넌트' },
        ]),
      ),
    ) as unknown as ApiClient['createTheme']
    open({ detail: standalone(), createTheme })
    await screen.findByRole('button', { name: '내보내기' })

    paste(FILE)
    fireEvent.change(screen.getByLabelText('가져올 테마의 id'), { target: { value: 'copied' } })
    fireEvent.click(screen.getByRole('button', { name: '새 테마로 가져오기' }))

    expect(await screen.findByText('components.Nope')).toBeTruthy()
  })

  it('읽기 전용 테마에서도 열려 있다 — locked와 다른 축이다', async () => {
    open({ detail: { ...standalone(systemTheme('admin') as Theme), id: 't1', system: true } })
    await screen.findByRole('button', { name: '내보내기' })

    paste(FILE)
    fireEvent.change(screen.getByLabelText('가져올 테마의 id'), { target: { value: 'copied' } })

    expect(
      (screen.getByRole('button', { name: '새 테마로 가져오기' }) as HTMLButtonElement).disabled,
    ).toBe(false)
  })

  it('owner가 아니면 막힌다 — 서버가 owner 게이트다', async () => {
    open({ detail: standalone(), role: 'viewer' })
    await screen.findByRole('button', { name: '내보내기' })

    paste(FILE)
    fireEvent.change(screen.getByLabelText('가져올 테마의 id'), { target: { value: 'copied' } })

    expect(
      (screen.getByRole('button', { name: '새 테마로 가져오기' }) as HTMLButtonElement).disabled,
    ).toBe(true)
  })
})

// ────────────────────────────────────────────────────────────────────────────────
// 여기부터 리뷰가 찾은 둘(① ⑤).
// ────────────────────────────────────────────────────────────────────────────────

describe('리뷰 ① — 파일 읽기가 실패하면 대기 글자가 남지 않는다', () => {
  /**
   * **읽을 수 없는 파일.** `readAsText`는 Blob이 아닌 것에 던지고, 그것이
   * `readTextFile`의 Promise를 거절시킨다 — 실제 브라우저에서 권한·삭제로 나는 거절과
   * 같은 갈래로 들어온다.
   */
  function pickBrokenFile(): void {
    openImport()
    fireEvent.change(screen.getByLabelText('테마 파일'), {
      target: { files: [{ name: 'broken.json' } as unknown as File] },
    })
  }

  it('앞에 읽힌 글자가 남아 있으면 안 된다 — 사실 2와 같은 모양이다', async () => {
    open({ detail: standalone() })
    await screen.findByRole('button', { name: '내보내기' })

    // 1) 읽히는 글자를 먼저 넣어 둔다.
    paste(
      JSON.stringify({
        wireboundVersion: '1',
        theme: { meta: { id: 'solo', name: '앞의 것', version: '1.0.0' } },
      }),
    )
    // 2) 그 뒤에 읽을 수 없는 파일을 고른다.
    pickBrokenFile()

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: '테마 JSON' })).toHaveProperty('value', '')
    })
    // **넣을 것이 없으므로 버튼도 꺼진다** — 화면이 "못 읽었다"고 말하는데 조작이
    // 마지막으로 읽힌 값에 대해 일어나는 자리를 없앤다.
    expect((screen.getByRole('button', { name: '초안에 넣기' }) as HTMLButtonElement).disabled).toBe(true)
    // **고치기 전에는 이 셋이 87 · false · '앞의 것'이었다**(P4c-3이 프로브로 쟀다).
    expect(screen.getByRole('textbox', { name: '테마 이름' })).toHaveProperty('value', '홀로')
  })

  it('왜 못 읽었는지는 말한다', async () => {
    open({ detail: standalone() })
    await screen.findByRole('button', { name: '내보내기' })

    pickBrokenFile()

    await waitFor(() => {
      expect(screen.getAllByRole('alert').length).toBeGreaterThan(0)
    })
  })
})

describe('리뷰 ⑤ — 파싱 실패에서도 되돌릴 수 있다', () => {
  /** 파싱 실패는 초안을 안 바꾸므로 `dirty`가 아니다. 그런데 저장은 막혀 있다(D6). */
  function breakBox(): void {
    fireEvent.change(screen.getByRole('textbox', { name: 'components' }), {
      target: { value: '{"Button":' },
    })
  }

  it('dirty가 아니어도 되돌리기가 눌린다 — 안 그러면 빠져나올 길이 없다', async () => {
    open({
      detail: standalone({
        meta: { id: 'solo', name: '홀로', version: '1.0.0' },
        components: { Button: { base: { bg: '#123456' } } },
      }),
    })
    await screen.findByRole('button', { name: '내보내기' })

    breakBox()

    // 초안은 안 바뀌었다 — "저장 안 함"이 안 뜬다.
    expect(screen.queryByText('저장 안 함')).toBeNull()
    // 저장은 막혀 있다.
    expect(screen.getByRole('button', { name: '저장' })).toHaveProperty('disabled', true)
    // **그래도 되돌릴 수 있어야 한다.**
    expect(
      (screen.getByRole('button', { name: '마지막 저장으로 되돌리기' }) as HTMLButtonElement).disabled,
    ).toBe(false)
  })

  it('되돌리면 글자가 저장본으로 돌아오고 저장이 다시 열린다', async () => {
    open({
      detail: standalone({
        meta: { id: 'solo', name: '홀로', version: '1.0.0' },
        components: { Button: { base: { bg: '#123456' } } },
      }),
    })
    await screen.findByRole('button', { name: '내보내기' })

    breakBox()
    fireEvent.click(screen.getByRole('button', { name: '마지막 저장으로 되돌리기' }))
    fireEvent.click(screen.getByRole('button', { name: '되돌립니다' }))

    // **문서는 안 갈렸는데 상자가 다시 만들어져야 한다** — 스토어가 그 경우에도
    // `draftEpoch`를 올리는 이유다.
    expect(screen.getByRole('textbox', { name: 'components' })).toHaveProperty(
      'value',
      JSON.stringify({ Button: { base: { bg: '#123456' } } }, null, 2),
    )
    expect(screen.queryByText(/읽지 못한 JSON이 있어/)).toBeNull()
  })

  it('읽기 전용이면 그래도 못 누른다 — 초안을 바꾸는 조작이다', async () => {
    open({ detail: { ...standalone(systemTheme('admin') as Theme), id: 't1', system: true } })
    await screen.findByRole('button', { name: '내보내기' })

    expect(
      (screen.getByRole('button', { name: '마지막 저장으로 되돌리기' }) as HTMLButtonElement).disabled,
    ).toBe(true)
  })
})

/**
 * **접힘**(2026-09-02). 이 화면의 머리를 큰 상자로 점유하던 가져오기 쪽을 접었다.
 * 형태와 근거는 `panels/page-json-panel.tsx`와 같고(그쪽 머리말이 근거를 갖는다), 여기서
 * 재는 것은 **이 화면에서만 다른 것** — 접힘 밖에 남아야 하는 것 셋이다.
 */
describe('가져오기 쪽은 기본이 접혀 있다', () => {
  it('파일 고르개·붙여 넣기 칸·버튼 둘이 DOM에 아예 없다', async () => {
    open()
    await screen.findByRole('button', { name: '내보내기' })

    expect(importToggle().getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByLabelText('테마 파일')).toBeNull()
    expect(screen.queryByRole('textbox', { name: '테마 JSON' })).toBeNull()
    expect(screen.queryByRole('button', { name: '초안에 넣기' })).toBeNull()
    expect(screen.queryByRole('button', { name: '새 테마로 가져오기' })).toBeNull()
    expect(screen.queryByLabelText('가져올 테마의 id')).toBeNull()
  })

  it('접힘 밖에 셋이 남는다 — 내보내기·파일 이름·되돌리기', async () => {
    // **되돌리기가 특히 밖이어야 한다**(화면 머리말): 읽지 못한 글자에서 빠져나오는
    // 유일한 문이라 한 번 더 눌러야 닿는 자리에 두면 안 된다.
    open()
    await screen.findByRole('button', { name: '내보내기' })

    expect(screen.getByRole('button', { name: '내보내기' })).toBeDefined()
    expect(screen.getByText(exportFileName(derived().theme))).toBeDefined()
    expect(screen.getByRole('button', { name: '마지막 저장으로 되돌리기' })).toBeDefined()
  })

  it('토글이 펴고 다시 접는다', async () => {
    open()
    await screen.findByRole('button', { name: '내보내기' })

    fireEvent.click(importToggle())
    expect(importToggle().getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('button', { name: '초안에 넣기' })).toBeDefined()

    fireEvent.click(importToggle())
    expect(screen.queryByRole('button', { name: '초안에 넣기' })).toBeNull()
  })

  it('접었다 펴도 대기 글자가 남는다', async () => {
    open()
    await screen.findByRole('button', { name: '내보내기' })
    paste('{"wireboundVersion":"1"}')

    fireEvent.click(importToggle())
    openImport()

    expect(screen.getByRole('textbox', { name: '테마 JSON' })).toHaveProperty(
      'value',
      '{"wireboundVersion":"1"}',
    )
  })

  it('결과는 접힘 밖에 남는다 — 접어도 방금 한 일이 화면에 있다', async () => {
    // 결과를 폼 안에 두면 접는 순간 *"초안에 넣었습니다"*가 사라진다. 넣고 나서 폼을
    // 접는 것이 자연스러운 순서이므로, 그때 사라지면 무엇이 일어났는지 화면이 잃는다.
    open()
    await screen.findByRole('button', { name: '내보내기' })
    paste(exportText({ meta: { id: 'brand', name: '넣은 것', version: '1.0.0', extends: 'system:admin' } } as Theme))
    fireEvent.click(screen.getByRole('button', { name: '초안에 넣기' }))
    await screen.findByText('초안에 넣었습니다 — 갤러리로 확인한 뒤 저장하세요.')

    fireEvent.click(importToggle())

    expect(screen.queryByRole('button', { name: '초안에 넣기' })).toBeNull()
    expect(screen.getByText('초안에 넣었습니다 — 갤러리로 확인한 뒤 저장하세요.')).toBeDefined()
  })
})
