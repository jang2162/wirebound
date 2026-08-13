/**
 * 패턴 고르개(P7-1 T3 — D7·D8). **`<App />`을 라우트째 렌더한다**(`../editor-harness`).
 *
 * **여기서 재는 것은 목록이지 삽입이 아니다.** 꽂는 자리와 선택 이동은 T4의
 * `../edit/pattern-insert.test.ts`·`./structure-pattern.test.tsx`가 잰다.
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { systemTheme } from '@wirebound/themes'
import type { PageDocument } from '@wirebound/schema'
import type { ApiClient } from '../../src/api/client'
import { SYSTEM_ADMIN_THEME_ID } from '../helpers'
import { openPage, pageDoc } from '../editor-harness'

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
  it('패턴 이름·범주·슬롯 이름을 보인다', async () => {
    await openPicker(themeApi('portal'))
    const option = await screen.findByRole<HTMLOptionElement>('option', { name: /공지 목록/ })
    // 범주는 키의 앞부분이다(`content.noticeBoard` → `content`).
    expect(option.textContent).toContain('content')
    expect(option.textContent).toContain('title')
    expect(option.textContent).toContain('keyword')
    // `value`는 패턴 키 그대로다 — 보이는 글자에만 꾸밈이 붙는다(`TypePicker`의 관례).
    expect(option.value).toBe('content.noticeBoard')
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

describe('패턴 고르개 — D7: 없는 것과 고장난 것을 가른다', () => {
  it('패턴이 0개인 테마면 없다고 말한다 — 회색 버튼이 아니다', async () => {
    // `admin`은 `patterns`가 아예 없다(전개 케이스가 그 수를 센다).
    await openPicker(themeApi('admin'))
    expect(await screen.findByText('이 테마에는 패턴이 없습니다')).toBeTruthy()
    // 고를 것이 없으므로 목록도 추가 버튼도 없다.
    expect(screen.queryByLabelText('패턴')).toBeNull()
    expect(screen.queryByRole('button', { name: '패턴 추가' })).toBeNull()
  })

  it('패턴이 0개여도 버튼은 활성이다 — 눌러야 이유를 볼 수 있다', async () => {
    await openPage(doc(), { apiOverrides: themeApi('admin') })
    expect(toolButton('패턴 넣기').disabled).toBe(false)
  })

  it('테마를 못 읽었으면 다른 문장이다 — 패턴 0개와 섞이지 않는다', async () => {
    await openPicker({
      getProjectTheme: async () => {
        throw new Error('테마를 읽지 못했습니다')
      },
    })
    await waitFor(() => {
      expect(screen.getByText('테마를 아직 읽지 못했습니다')).toBeTruthy()
    })
    expect(screen.queryByText('이 테마에는 패턴이 없습니다')).toBeNull()
  })
})
