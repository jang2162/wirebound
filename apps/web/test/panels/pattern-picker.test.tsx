/**
 * 패턴 고르개(P7-1 T3 — D7·D8). **`<App />`을 라우트째 렌더한다**(`../editor-harness`).
 *
 * **여기서 재는 것은 목록이지 삽입이 아니다.** 꽂는 자리와 선택 이동은 T4의
 * `../edit/pattern-insert.test.ts`·`./structure-pattern.test.tsx`가 잰다.
 */
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { systemTheme, type Theme } from '@wirebound/themes'
import type { PageDocument } from '@wirebound/schema'
import type { ApiClient } from '../../src/api/client'
import { SYSTEM_ADMIN_THEME_ID } from '../helpers'
import { deselect, openPage, pageDoc } from '../editor-harness'
import { NOTICE } from '../../src/panels/pattern-picker'

function doc(): PageDocument {
  return pageDoc({
    id: 'n-root',
    type: 'Page',
    children: [{ id: 'n-a', type: 'Text' }],
  })
}

function structureRegion(): HTMLElement {
  return screen.getByRole('region', { name: '구조 트리' })
}

function toolButton(name: string): HTMLButtonElement {
  return within(within(structureRegion()).getByRole('group', { name: '구조 편집' })).getByRole(
    'button',
    { name },
  )
}

/** 프로젝트 테마를 주는 대역. `themeId`는 값 자체에 뜻이 없다(`helpers.tsx`). */
function themeApi(themeId: string): Partial<ApiClient> {
  return {
    getProjectTheme: async () => ({
      themeId: SYSTEM_ADMIN_THEME_ID,
      theme: systemTheme(themeId) ?? null,
      issues: [],
    }),
  }
}

async function openPicker(overrides: Partial<ApiClient>): Promise<void> {
  await openPage(doc(), { apiOverrides: overrides })
  fireEvent.click(toolButton('패턴 넣기'))
}

describe('패턴 고르개 — 여는 자리 (D8)', () => {
  it('구조 툴바에 패턴 넣기 버튼이 있다', async () => {
    await openPage(doc(), { apiOverrides: themeApi('portal') })
    expect(toolButton('패턴 넣기')).toBeTruthy()
  })

  it('선택이 없어도 누를 수 있다 — 선택 없이도 root에 꽂기 때문이다(D5)', async () => {
    await openPage(doc(), { apiOverrides: themeApi('portal') })
    // **고른 것이 없는 상태를 손으로 만든다.** 페이지를 열면 스토어가 루트를 고른 채로
    // 시작하므로(`store/editor-store.ts`의 `#selectionFor`), 그냥 열어서는 이 케이스가 재려는
    // 상태가 아니다. 캔버스 빈 자리를 누르는 것이 사용자가 그 상태에 이르는 길이다.
    deselect()

    expect(toolButton('패턴 넣기').disabled).toBe(false)
  })

  it('닫혀 있을 때는 고르개가 DOM에 없다', async () => {
    await openPage(doc(), { apiOverrides: themeApi('portal') })
    expect(screen.queryByRole('group', { name: '패턴 고르기' })).toBeNull()
  })

  it('취소하면 닫힌다', async () => {
    await openPicker(themeApi('portal'))
    await screen.findByRole('group', { name: '패턴 고르기' })
    fireEvent.click(screen.getByRole('button', { name: '패턴 취소' }))
    expect(screen.queryByRole('group', { name: '패턴 고르기' })).toBeNull()
  })

  it('타입 고르개와 동시에 열리지 않는다', async () => {
    await openPage(doc(), { apiOverrides: themeApi('portal') })
    fireEvent.click(within(structureRegion()).getByRole('button', { name: 'Text' }))
    fireEvent.click(toolButton('아래 추가'))
    expect(screen.getByRole('group', { name: '타입 고르기' })).toBeTruthy()

    fireEvent.click(toolButton('패턴 넣기'))
    expect(screen.queryByRole('group', { name: '타입 고르기' })).toBeNull()
    await screen.findByRole('group', { name: '패턴 고르기' })
  })
})

describe('패턴 고르개 — 목록이 보이는 것 (D8)', () => {
  /**
   * **리뷰가 지목한 사각 ㉡을 닫는다.** 앞 판의 단언은 `toContain('content')`였는데
   * 그것은 **키 전체(`content.noticeBoard`)에 포섭된다** — 범주를 자르지 않고 키를
   * 그대로 보여 줘도 통과한다. 라벨 전문을 단언해 그 축을 갈랐다.
   */
  it('패턴 이름·범주·슬롯 이름을 보인다 — 범주는 키의 앞부분이다', async () => {
    await openPicker(themeApi('portal'))
    const option = await screen.findByRole<HTMLOptionElement>('option', { name: /공지 목록/ })

    expect(option.textContent).toBe('공지 목록 — content (슬롯: title, keyword)')
    // **키를 통째로 보이지 않는다.** 위 단언이 이미 이것을 함의하지만, 무엇이 갈리는
    // 축인지를 케이스가 이름으로 말하게 둔다.
    expect(option.textContent).not.toContain('content.noticeBoard')
    // `value`는 패턴 키 그대로다 — 보이는 글자에만 꾸밈이 붙는다(`TypePicker`의 관례).
    expect(option.value).toBe('content.noticeBoard')
  })

  it('점이 없는 키는 통째로 범주 자리에 온다', async () => {
    // `checkPatterns`가 `<범주>.<변형>`을 강제하므로 저장 경계를 지난 테마에는 오지
    // 않는다(`bad-pattern-name`). **고르개는 그것을 값으로 다룬다** — 목록을 그리는
    // 자리가 이름 규칙을 두 번째로 판정하면 그 판정이 갈릴 자리가 하나 더 생긴다.
    await openPage(doc(), {
      apiOverrides: {
        getProjectTheme: async () => ({
          themeId: SYSTEM_ADMIN_THEME_ID,
          theme: {
            ...systemTheme('portal')!,
            patterns: { 점없음: { name: '점 없는 키', schema: { type: 'Section' } } },
          },
          issues: [],
        }),
      },
    })
    fireEvent.click(toolButton('패턴 넣기'))
    const option = await screen.findByRole('option', { name: /점 없는 키/ })
    expect(option.textContent).toBe('점 없는 키 — 점없음 (슬롯 없음)')
  })

  it('테마가 가진 패턴을 빠짐없이 낸다 — 수는 테마에서 계산한다', async () => {
    await openPicker(themeApi('commerce'))
    const select = await screen.findByLabelText<HTMLSelectElement>('패턴')
    const declared = Object.keys(systemTheme('commerce')!.patterns!)
    expect([...select.options].map((option) => option.value)).toEqual(declared)
  })

  it('슬롯이 없는 패턴은 슬롯 없음이라고 말한다', async () => {
    // 시스템 테마 둘 다 슬롯을 갖는다. 슬롯 없는 패턴을 실제 테마에 새로 만들지 않고
    // (D7 — 패턴 저작은 §6.10의 일이다) 대역이 준 테마로 그 갈래만 본다.
    const withoutSlots = {
      ...systemTheme('portal')!,
      patterns: { 'hero.plain': { name: '민 히어로', schema: { type: 'Section' } } },
    }
    await openPage(doc(), {
      apiOverrides: {
        getProjectTheme: async () => ({
          themeId: SYSTEM_ADMIN_THEME_ID,
          theme: withoutSlots,
          issues: [],
        }),
      },
    })
    fireEvent.click(toolButton('패턴 넣기'))
    const option = await screen.findByRole('option', { name: /민 히어로/ })
    expect(option.textContent).toContain('슬롯 없음')
  })
})

/**
 * **리뷰가 지목한 결함을 닫는 절이다.** 앞 판은 테마를 못 얻은 상태 넷을 문장 하나로
 * 덮었고, 그중 `theme: null`은 **서버가 낸 답**(*"테마를 고르지 않았다"*)이지 정보의
 * 부재가 아니었다 — D7이 세운 구분을 한 층 위에서 되살린 형태다.
 *
 * **문장이 서로를 덮지 않는 것을 케이스가 잰다.** 화면을 지나는 것은 `noticeOf`가 모으고,
 * 화면에서 만들 수 없는 상태(`no-project`)까지는 `NOTICE` 표를 직접 보는 케이스가 잰다.
 */
describe('패턴 고르개 — D7: 상태마다 갈라 말한다', () => {
  /** 서버 응답 하나를 주고, 고르개가 낸 안내 문장을 돌려준다. */
  async function noticeOf(overrides: Partial<ApiClient>): Promise<string> {
    await openPicker(overrides)
    await waitFor(() => {
      expect(document.body.querySelector('.wb-shell-picker-notice')).toBeTruthy()
    })
    return document.body.querySelector('.wb-shell-picker-notice')!.textContent ?? ''
  }

  /** `themeId`와 `theme`을 따로 주는 대역. 서버가 그 둘로 상태를 가른다. */
  function themeResponse(themeId: string | null, theme: Theme | null): Partial<ApiClient> {
    return { getProjectTheme: async () => ({ themeId, theme, issues: [] }) }
  }

  it('테마는 있는데 패턴이 0개다', async () => {
    // `admin`은 `patterns`가 아예 없다(전개 케이스가 그 수를 센다).
    expect(await noticeOf(themeApi('admin'))).toBe('이 테마에는 패턴이 없습니다')
    // 고를 것이 없으므로 목록도 추가 버튼도 없다.
    expect(screen.queryByLabelText('패턴')).toBeNull()
    expect(screen.queryByRole('button', { name: '패턴 추가' })).toBeNull()
  })

  it('테마를 고르지 않았다 — 서버가 themeId도 theme도 null로 답한 경우다', async () => {
    const notice = await noticeOf(themeResponse(null, null))
    expect(notice).toContain('테마를 고르지 않았습니다')
    // **패턴 0개와도, 읽기 실패와도 섞이지 않는다.**
    expect(notice).not.toContain('패턴이 없습니다')
    expect(notice).not.toContain('읽지 못했습니다')
  })

  it('테마는 골랐는데 해석하지 못했다 — themeId가 있고 theme만 null이다', async () => {
    const notice = await noticeOf(themeResponse(SYSTEM_ADMIN_THEME_ID, null))
    expect(notice).toContain('해석하지 못했습니다')
    // 할 일이 *"고르기"*가 아니라 *"고치기"*다.
    expect(notice).toContain('고쳐야')
    expect(notice).not.toContain('고르지 않았습니다')
  })

  it('조회가 던지면 읽기 실패다', async () => {
    const notice = await noticeOf({
      getProjectTheme: async () => {
        throw new Error('서버가 답하지 않았다')
      },
    })
    expect(notice).toBe('테마를 읽지 못했습니다. 새로고침해 보세요.')
  })

  it('응답이 오기 전에는 읽는 중이다 — 실패와 갈린다', async () => {
    let release: (() => void) | undefined
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    try {
      await openPicker({
        getProjectTheme: async () => {
          await held
          return { themeId: SYSTEM_ADMIN_THEME_ID, theme: systemTheme('portal')!, issues: [] }
        },
      })
      expect(document.body.querySelector('.wb-shell-picker-notice')?.textContent).toBe(
        '테마를 읽는 중입니다',
      )
      release!()
      // 응답이 오면 목록으로 바뀐다 — `loading`이 영구 상태가 아닌 것을 함께 잰다.
      await screen.findByLabelText('패턴')
    } finally {
      release?.()
    }
  })

  it('상태마다 다른 문장이다 — 둘이 같아지면 여기서 죽는다', async () => {
    // **화면이 실제로 낸 것을 모은다** — 문장을 여기 다시 적으면 그 사본이 따로 썩는다.
    //
    // **`cleanup()`을 사이에 넣는 것이 필수다.** RTL의 자동 정리는 케이스 **사이**에만
    // 돌므로, 한 케이스에서 `openPage`를 거듭 부르면 셸이 겹쳐 쌓이고 `getByRole`이
    // *"Found multiple elements"*로 죽는다(실측 — 처음에 그렇게 짰다).
    const cases: Partial<ApiClient>[] = [
      themeApi('admin'),
      themeResponse(null, null),
      themeResponse(SYSTEM_ADMIN_THEME_ID, null),
      {
        getProjectTheme: async () => {
          throw new Error('서버가 답하지 않았다')
        },
      },
    ]

    const notices: string[] = []
    for (const overrides of cases) {
      notices.push(await noticeOf(overrides))
      cleanup()
    }
    expect(new Set(notices).size).toBe(notices.length)
  })

  /**
   * **화면에서 못 만드는 상태까지 포함해 표를 직접 잰다.** 위 케이스는 화면을 지나므로
   * `no-project`(프로젝트가 없다)를 만들 수 없다 — 셸이 조회해 온 `project.id`만 넘기고
   * 그 응답 가드가 빈 문자열을 거부한다(`isProjectDetail`). 그 상태의 문장이 실재하고
   * 남과 겹치지 않는 것은 **표에서** 재야 한다.
   *
   * **세는 단위: `NOTICE`의 키 하나** = `ready`가 아닌 상태 하나.
   */
  it('안내 문장 표에 겹치는 것이 없다 — 화면에서 못 만드는 상태까지', () => {
    const keys = Object.keys(NOTICE).sort()
    expect(keys).toEqual(['failed', 'loading', 'no-project', 'unresolved', 'unset'])

    const values = Object.values(NOTICE)
    expect(new Set(values).size).toBe(values.length)
    // 화면이 내는 여섯째 문장(패턴 0개)과도 겹치지 않는다.
    expect(values).not.toContain('이 테마에는 패턴이 없습니다')
  })

  it('프로젝트가 없을 때의 문장은 프로젝트를 가리켜 말하지 않는다', () => {
    // **델타 리뷰가 지목한 자리.** 앞 판은 이 상태가 `unset`이라
    // *"이 **프로젝트는** 테마를 고르지 않았습니다"*가 나갔다.
    expect(NOTICE['no-project']).not.toContain('이 프로젝트')
    expect(NOTICE['no-project']).not.toBe(NOTICE.unset)
  })

  it('테마가 없는 어느 상태에서도 목록을 닫을 수 있다', async () => {
    // 앞 판은 이 갈래에서 `<p>` 하나만 내서 `패턴 취소`가 사라졌다.
    await openPicker(themeResponse(null, null))
    await screen.findByText(/테마를 고르지 않았습니다/)
    fireEvent.click(screen.getByRole('button', { name: '패턴 취소' }))
    expect(screen.queryByRole('group', { name: '패턴 고르기' })).toBeNull()
  })

  it('패턴이 0개여도 버튼은 활성이다 — 눌러야 이유를 볼 수 있다', async () => {
    await openPage(doc(), { apiOverrides: themeApi('admin') })
    expect(toolButton('패턴 넣기').disabled).toBe(false)
  })
})
