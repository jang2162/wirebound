/**
 * 패턴 고르개. **`<App />`을 라우트째 렌더한다**(`../editor-harness`).
 *
 * **여기서 재는 것은 목록이지 삽입이 아니다.** 꽂는 자리와 선택 이동은
 * `../edit/pattern-insert.test.ts`·`./structure-pattern.test.tsx`가 잰다.
 *
 * **패턴의 출처는 셸이 쥔 바인딩의 manifest 다**(`panels/pattern-picker.tsx` 머리말). 저장소 테마 `system-admin` 첫 판에는
 * 패턴이 없으므로, 목록이 서는 판은 셸의 테마 읽기(`getProjectTheme`)가 `manifest.patterns` 를 실은 바인딩을 준다. 그 가짜가 실제로
 * 닿았는지는 불린 수로 센다(`CLAUDE.md` 「목 · 계측은 불린 수를 값으로 확인하고」).
 */
import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import type { PageDocument } from '@wirebound/schema'
import { ADMIN_FIXTURE } from '../admin-theme'
import type { ThemeManifest } from '@wirebound/theme-sdk'
import { deselect, openPage as openShell, pageDoc } from '../editor-harness'
import { BROKEN_NOTICE, EMPTY_NOTICE, themePatterns } from '../../src/panels/pattern-picker'
import { adminThemeView } from '../theme-loader'
import { isOff, treeTool, structureRowName } from './tree-row'

/**
 * 옛 시스템 테마 `portal` 이 선언하던 패턴 — 목록이 서는 판의 표본이다. 원본(`packages/themes` 의 시스템 테마)은 지워졌으므로
 * 이 파일이 값을 든다.
 */
const PORTAL_PATTERNS = {
  'content.noticeBoard': {
    name: '공지 목록',
    slots: { title: 'text', keyword: 'text' },
    schema: {
      type: 'Section',
      children: [
        { type: 'Text', props: { role: 'h2', content: '공지사항' }, slot: 'title' },
        {
          type: 'SearchForm',
          props: { collapsed: true },
          children: [{ type: 'Field', props: { label: '검색어', control: 'text' }, slot: 'keyword' }],
        },
        { type: 'List', props: { items: 10, pagination: true } },
      ],
    },
  },
}

/** 가짜 바인딩의 `manifest.patterns` 가 읽는 자리. 케이스가 바꾼다 — `undefined` 면 저장소 테마 그대로(패턴 없음)다. */
const holder = { patterns: undefined as unknown, themeReads: 0 }

beforeEach(() => {
  holder.patterns = PORTAL_PATTERNS
  holder.themeReads = 0
})

/** 셸을 연다 — 테마 읽기가 부르는 그 순간의 `holder.patterns` 를 실은 바인딩을 준다. */
function openPage(document_: PageDocument): Promise<void> {
  return openShell(document_, {
    apiOverrides: {
      getProjectTheme: async () => {
        holder.themeReads += 1
        return { ...adminThemeView(), manifest: { ...ADMIN_FIXTURE.manifest, patterns: holder.patterns } as ThemeManifest }
      },
    },
  })
}

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

function toolButton(name: string): HTMLElement {
  return treeTool(structureRegion(), name)
}

async function openPicker(): Promise<void> {
  await openPage(doc())
  fireEvent.click(toolButton('패턴 넣기'))
}

function notice(): string {
  return document.body.querySelector('.wb-shell-picker-notice')?.textContent ?? ''
}

describe('패턴 고르개 — 출처', () => {
  it('셸의 테마 읽기가 닿는다 — 한 번 불리고 그 패턴이 목록에 선다', async () => {
    await openPicker()
    expect(holder.themeReads).toBe(1)
    const select = await screen.findByLabelText<HTMLSelectElement>('패턴')
    expect([...select.options].map((option) => option.value)).toEqual(['content.noticeBoard'])
  })

  it('manifest 의 패턴을 규격으로 읽어 목록을 낸다', () => {
    const { entries, broken } = themePatterns({ ...ADMIN_FIXTURE.manifest, patterns: PORTAL_PATTERNS })
    expect(entries.map(([key]) => key)).toEqual(['content.noticeBoard'])
    expect(broken).toBeNull()
  })

  it('규격을 통과하지 못하면 목록이 비고 그렇다고 말한다', () => {
    const { entries, broken } = themePatterns({ ...ADMIN_FIXTURE.manifest, patterns: { 'hero.x': { name: '' } } })
    expect(entries).toEqual([])
    expect(broken).toBe(BROKEN_NOTICE)
  })
})

describe('패턴 고르개 — 여는 자리', () => {
  it('구조 트리의 줄 `+`에 패턴 넣기 항목이 있다', async () => {
    await openPage(doc())
    expect(toolButton('패턴 넣기')).toBeTruthy()
  })

  it('선택이 없어도 누를 수 있다 — 선택 없이도 root에 꽂기 때문이다', async () => {
    await openPage(doc())
    // **고른 것이 없는 상태를 손으로 만든다.** 페이지를 열면 스토어가 루트를 고른 채로
    // 시작하므로(`store/editor-store.ts`의 `#selectionFor`), 그냥 열어서는 이 케이스가 재려는
    // 상태가 아니다. 캔버스 빈 자리를 누르는 것이 사용자가 그 상태에 이르는 길이다.
    deselect()

    expect(isOff(toolButton('패턴 넣기'))).toBe(false)
  })

  it('닫혀 있을 때는 고르개가 DOM에 없다', async () => {
    await openPage(doc())
    expect(screen.queryByRole('group', { name: '패턴 고르기' })).toBeNull()
  })

  it('취소하면 닫힌다', async () => {
    await openPicker()
    await screen.findByRole('group', { name: '패턴 고르기' })
    fireEvent.click(screen.getByRole('button', { name: '패턴 취소' }))
    expect(screen.queryByRole('group', { name: '패턴 고르기' })).toBeNull()
  })

  it('타입 고르개와 동시에 열리지 않는다', async () => {
    await openPage(doc())
    fireEvent.click(within(structureRegion()).getByRole('button', { name: structureRowName('Text') }))
    fireEvent.click(toolButton('아래 추가'))
    expect(screen.getByRole('group', { name: '타입 고르기' })).toBeTruthy()

    fireEvent.click(toolButton('패턴 넣기'))
    expect(screen.queryByRole('group', { name: '타입 고르기' })).toBeNull()
    await screen.findByRole('group', { name: '패턴 고르기' })
  })
})

describe('패턴 고르개 — 목록이 보이는 것', () => {
  /**
   * **라벨 전문을 단언한다.** `toContain('content')`는 **키 전체(`content.noticeBoard`)에
   * 포섭된다** — 범주를 자르지 않고 키를 그대로 보여 줘도 통과한다. 전문이어야 그 축이
   * 갈린다.
   */
  it('패턴 이름·범주·슬롯 이름을 보인다 — 범주는 키의 앞부분이다', async () => {
    await openPicker()
    const option = await screen.findByRole<HTMLOptionElement>('option', { name: /공지 목록/ })

    expect(option.textContent).toBe('공지 목록 — content (슬롯: title, keyword)')
    // **키를 통째로 보이지 않는다.** 위 단언이 이미 이것을 함의하지만, 무엇이 갈리는
    // 축인지를 케이스가 이름으로 말하게 둔다.
    expect(option.textContent).not.toContain('content.noticeBoard')
    // `value`는 패턴 키 그대로다 — 보이는 글자에만 꾸밈이 붙는다(`TypePicker`의 관례).
    expect(option.value).toBe('content.noticeBoard')
  })

  it('점이 없는 키는 통째로 범주 자리에 온다', async () => {
    // 이름 규칙(`<범주>.<변형>`)은 `checkPatterns`가 판정한다. **고르개는 그것을 값으로 다룬다** — 목록을 그리는
    // 자리가 이름 규칙을 두 번째로 판정하면 그 판정이 갈릴 자리가 하나 더 생긴다.
    holder.patterns = { 점없음: { name: '점 없는 키', schema: { type: 'Section' } } }
    await openPicker()
    const option = await screen.findByRole('option', { name: /점 없는 키/ })
    expect(option.textContent).toBe('점 없는 키 — 점없음 (슬롯 없음)')
  })

  it('테마가 가진 패턴을 빠짐없이 낸다 — 수는 테마에서 계산한다', async () => {
    holder.patterns = {
      ...PORTAL_PATTERNS,
      'hero.plain': { name: '민 히어로', schema: { type: 'Section' } },
      'cta.banner': { name: '배너', schema: { type: 'Section' } },
    }
    await openPicker()
    const select = await screen.findByLabelText<HTMLSelectElement>('패턴')
    const declared = Object.keys(holder.patterns as Record<string, unknown>)
    expect([...select.options].map((option) => option.value)).toEqual(declared)
  })

  it('슬롯이 없는 패턴은 슬롯 없음이라고 말한다', async () => {
    holder.patterns = { 'hero.plain': { name: '민 히어로', schema: { type: 'Section' } } }
    await openPicker()
    const option = await screen.findByRole('option', { name: /민 히어로/ })
    expect(option.textContent).toContain('슬롯 없음')
  })
})

/**
 * **목록이 없는 두 판을 문장 하나로 덮지 않는다** — 패턴이 없는 테마(정상)와 패턴 선언을 읽지 못한 테마(고칠 것)는 사용자가
 * 할 일이 다르다.
 */
describe('패턴 고르개 — 목록이 없을 때', () => {
  it('저장소 테마 system-admin 첫 판은 패턴이 없다 — 그렇다고 말한다', async () => {
    holder.patterns = undefined
    await openPicker()
    await screen.findByRole('group', { name: '패턴 고르기' })
    expect(notice()).toBe(EMPTY_NOTICE)
    // 고를 것이 없으므로 목록도 추가 버튼도 없다.
    expect(screen.queryByLabelText('패턴')).toBeNull()
    expect(screen.queryByRole('button', { name: '패턴 추가' })).toBeNull()
  })

  it('패턴 선언을 읽지 못하면 그렇다고 말한다 — 패턴 0개와 갈린다', async () => {
    holder.patterns = { 'hero.x': { name: '', schema: { type: 'Section' } } }
    await openPicker()
    await screen.findByRole('group', { name: '패턴 고르기' })
    expect(notice()).toBe(BROKEN_NOTICE)
    expect(BROKEN_NOTICE).not.toBe(EMPTY_NOTICE)
  })

  it('목록이 없는 어느 판에서도 목록을 닫을 수 있다', async () => {
    for (const patterns of [undefined, { 'hero.x': { name: '' } }]) {
      holder.patterns = patterns
      await openPicker()
      await screen.findByRole('group', { name: '패턴 고르기' })
      fireEvent.click(screen.getByRole('button', { name: '패턴 취소' }))
      expect(screen.queryByRole('group', { name: '패턴 고르기' })).toBeNull()
      // RTL 의 자동 정리는 케이스 **사이**에만 돈다 — 한 케이스에서 거듭 열면 셸이 겹쳐 쌓인다.
      cleanup()
    }
  })

  it('패턴이 0개여도 버튼은 활성이다 — 눌러야 이유를 볼 수 있다', async () => {
    holder.patterns = undefined
    await openPage(doc())
    expect(isOff(toolButton('패턴 넣기'))).toBe(false)
  })
})
