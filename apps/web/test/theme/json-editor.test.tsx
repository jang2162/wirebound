/**
 * **JSON 에디터(② W2) — 케이스 자리.** ①이 미리 만들어 두었다.
 *
 * 셋이 병렬로 일하므로 **각자 자기 케이스 파일에만 쓴다.** `test/routes/theme-editor.test.tsx`는
 * 라우트·권한·저장의 케이스 파일이고 ②가 열면 셋이 같은 파일에서 부딪힌다 — ①의 P5가
 * 그 충돌을 회귀가 못 잡는다는 것을 밟아서 확인했다.
 *
 * 아래 케이스는 **계약 하나**를 잡는다: 이 컴포넌트는 초안 스토어 문맥 안에서 산다.
 * 채우고 나서도 참이어야 하므로 지우지 말고 **아래에 더해라.**
 *
 * ---
 *
 * **W2가 더한 것의 축은 하나다 — 파싱 실패와 검증 실패의 선**(D6). 그 선의 양쪽을 따로
 * 재고, **선 자체가 지켜지는지**(파싱 실패한 것이 초안에 안 들어가는지)를 따로 잰다.
 * 구분력은 보고서에 있다.
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { systemTheme, type Theme } from '@wirebound/themes'
import { JsonEditor } from '../../src/theme/json-editor'
import { resolveDraft } from '../../src/theme/draft-css'
import { ThemeDraftStore } from '../../src/store/theme-draft-store'
import { ThemeDraftProvider } from '../../src/store/use-theme-draft'

describe('JsonEditor', () => {
  it('초안 스토어 문맥 안에서 그려진다', () => {
    const store = new ThemeDraftStore()
    store.loadTheme('t1', { meta: { id: 'brand', name: '브랜드', version: '1.0.0' } })

    const view = render(
      <ThemeDraftProvider store={store}>
        <JsonEditor locked={false} />
      </ThemeDraftProvider>,
    )

    expect(view.container).toBeTruthy()
  })
})

// ────────────────────────────────────────────────────────────────────────────────
// 여기부터 ② W2.
// ────────────────────────────────────────────────────────────────────────────────

const META: Theme['meta'] = { id: 'brand', name: '브랜드', version: '1.0.0' }

/** 절 넷을 여는 화면. **한 상자에 몰지 않는 것이 D6**이므로 케이스도 절 이름으로 찾는다. */
function mount(theme: Theme, options: { locked?: boolean; base?: Theme } = {}): ThemeDraftStore {
  const store = new ThemeDraftStore()
  store.loadTheme('t1', theme, options.base === undefined ? {} : { base: options.base })
  render(
    <ThemeDraftProvider store={store}>
      <JsonEditor locked={options.locked ?? false} />
    </ThemeDraftProvider>,
  )
  return store
}

function box(section: string): HTMLTextAreaElement {
  return screen.getByRole('textbox', { name: section }) as HTMLTextAreaElement
}

/** 한 상자에 글자를 넣는다. `<textarea>`의 값 교체 하나가 이 화면의 유일한 입력이다. */
function type(section: string, text: string): void {
  fireEvent.change(box(section), { target: { value: text } })
}

describe('JsonEditor — 절마다 상자', () => {
  it('네 절이 각각 다른 상자다', () => {
    mount({ meta: META })

    // **셋이 아니라 넷이다** — `assets`가 재라 #8의 답이다(보고서 참고).
    for (const section of ['components', 'patterns', 'primitives', 'assets']) {
      expect(box(section)).toBeTruthy()
    }
    expect(screen.getAllByRole('textbox')).toHaveLength(4)
  })

  it('초안의 절을 JSON으로 그린다', () => {
    mount({ meta: META, primitives: { container: { maxWidth: '1200px' } } })

    expect(box('primitives').value).toBe(
      JSON.stringify({ container: { maxWidth: '1200px' } }, null, 2),
    )
    // 없는 절은 빈 상자다 — `{}`가 아니다(아래 `빈 상자` 케이스가 그 차이를 잰다).
    expect(box('components').value).toBe('')
  })

  it('초안이 없으면 아무것도 안 그린다', () => {
    const store = new ThemeDraftStore()
    render(
      <ThemeDraftProvider store={store}>
        <JsonEditor locked={false} />
      </ThemeDraftProvider>,
    )

    expect(screen.queryAllByRole('textbox')).toHaveLength(0)
  })
})

describe('JsonEditor — 파싱 성공', () => {
  it('그 절만 갈아 끼운다', () => {
    const store = mount({ meta: META, primitives: { grid: { columns: 12 } } })

    type('components', '{"Button":{"base":{"bg":"semantic.primary"}}}')

    const { draft } = store.getState()
    expect(draft?.components).toEqual({ Button: { base: { bg: 'semantic.primary' } } })
    // **나머지 절이 그대로다** — 쓰기 문이 `putSection` 하나라는 것의 관측 가능한 형태다.
    expect(draft?.primitives).toEqual({ grid: { columns: 12 } })
    expect(draft?.meta).toEqual(META)
  })

  it('빈 상자는 절을 지우고, `{}`는 빈 절로 남는다', () => {
    const store = mount({ meta: META, components: { Button: {} } })

    type('components', '   ')
    // **키 자체가 없다.** `putSection`의 주석이 못박은 차이이고, 저장이 통째 교체라
    // 서버까지 간다.
    expect(store.getState().draft !== null && 'components' in store.getState().draft!).toBe(false)

    type('components', '{}')
    expect(store.getState().draft?.components).toEqual({})
  })

  it('내가 친 글자를 왕복으로 다시 포맷하지 않는다', () => {
    mount({ meta: META })

    // 한 줄로 쳤다. `putSection` → 스토어 알림 → 다시 렌더까지 돈 뒤에도 그대로여야 한다 —
    // 다시 포맷하면 타자 중에 커서가 튄다.
    type('components', '{"Button":{}}')
    expect(box('components').value).toBe('{"Button":{}}')
  })
})

describe('JsonEditor — 파싱 실패 (여기서 그리는 유일한 것)', () => {
  it('초안에 넣지 않고 경보를 그린다', () => {
    const store = mount({ meta: META, components: { Button: {} } })
    const before = store.getState().draft

    type('components', '{"Button":')

    // **초안이 참조까지 그대로다** — 못 읽은 것을 초안으로 만들지 않는다(D6).
    expect(store.getState().draft).toBe(before)

    const alert = screen.getByRole('alert')
    expect(alert.textContent).toContain('JSON을 읽지 못했습니다')
    // **경보가 갤러리의 상태까지 말한다.** 초안에 안 넣는 것만으로는 *"고쳤는데 안 바뀐다"*가
    // 안 닫힌다 — 갤러리는 여전히 앞 값이고 사용자는 이유를 모른다(①의 판정).
    expect(alert.textContent).toContain('마지막으로 읽힌 값')
    // 친 글자는 상자에 남는다 — 되돌리면 사용자가 방금 적은 것을 지우는 셈이다.
    expect(box('components').value).toBe('{"Button":')

    // **상자와 경보가 이어져 있다.** 처음에는 이 두 줄이 없었고 `aria-invalid`를 `false`로
    // 변조해도 **0 사망**이었다(내가 쟀다 — ①이 이름 입력에서 겪은 §5.1과 같은 부류다).
    // 보조 기술에서는 경보가 화면 어디에 떠 있는 것과 *"지금 이 상자가 잘못됐다"*가 다르다.
    expect(box('components').getAttribute('aria-invalid')).toBe('true')
    expect(box('components').getAttribute('aria-describedby')).toContain(alert.id)
  })

  it('한 절의 문법 오류가 다른 절의 편집을 막지 않는다', () => {
    const store = mount({ meta: META })

    type('components', '{oops')
    type('primitives', '{"grid":{"columns":6}}')

    expect(store.getState().draft?.primitives).toEqual({ grid: { columns: 6 } })
    expect(screen.getAllByRole('alert')).toHaveLength(1)
  })

  it('고치면 초안에 들어가고 경보가 사라진다', () => {
    const store = mount({ meta: META })

    type('components', '{"Button":')
    expect(screen.queryAllByRole('alert')).toHaveLength(1)

    type('components', '{"Button":{}}')
    expect(store.getState().draft?.components).toEqual({ Button: {} })
    expect(screen.queryAllByRole('alert')).toHaveLength(0)
  })
})

describe('JsonEditor — 검증 실패는 다른 부류다 (D6의 선)', () => {
  it('스키마를 어겨도 초안에 들어가고 여기서는 경보가 안 뜬다', () => {
    const store = mount({ meta: META })

    // 파싱은 된다. 모양이 어긋날 뿐이다(`base`가 객체가 아니다).
    type('components', '{"Button":{"base":42}}')

    expect(store.getState().draft?.components).toEqual({ Button: { base: 42 } })
    // **여기서 그릴 것이 아니다** — 이슈 패널이 `path`까지 갖춰 그린다(D4).
    expect(screen.queryAllByRole('alert')).toHaveLength(0)
  })

  it('모양이 어긋난 값을 초안에 넣어도 해석이 던지지 않고 이슈를 낸다', () => {
    const store = mount({ meta: META })

    // 절 자체가 객체가 아니다 — 조각 검증기들이 zod를 통과한 값을 받는다고 계약한 자리다.
    type('components', '42')
    type('patterns', 'null')

    const draft = store.getState().draft
    expect(draft?.components).toBe(42)

    // **`resolveTheme`이 경계라 던지지 않는다**(그쪽 머리말이 그렇게 적었다).
    // 이것이 참이라서 *"모양을 여기서 보지 않는다"*가 성립한다.
    const resolved = resolveDraft(draft, null)
    expect(resolved.resolved).toBeNull()
    expect(resolved.issues.map((entry) => entry.code)).toContain('bad-spec')
    expect(resolved.issues.some((entry) => entry.path.startsWith('components'))).toBe(true)
  })
})

describe('JsonEditor — 밖에서 초안이 갈릴 때', () => {
  it('저장 응답이 문서를 갈아 끼우면 상자가 다시 씨앗을 받는다', () => {
    const store = mount({ meta: META, components: { Button: {} } })
    type('components', '{"Button":{"base":{"bg":"semantic.primary"}}}')

    // 서버가 돌려준 문서를 싣는다(`ackSave`가 `draft`까지 갈아 끼운다).
    // **`act`가 필요하다** — 이벤트 밖에서 스토어를 바꾸면 리렌더가 흐르지 않은 채로
    // 단언이 돈다(이 저장소의 `use-project-commands.test.tsx`가 쓰는 형식 그대로다.
    // 처음에 안 감쌌더니 상자가 앞 텍스트를 든 채였다 — **측정 장치 쪽이었다**).
    act(() => store.ackSave({ meta: META, components: { Card: {} } }))

    expect(box('components').value).toBe(JSON.stringify({ Card: {} }, null, 2))
  })

  it('파싱 실패 중이어도 갈아 끼운 값이 이긴다 — 경보가 함께 사라진다', () => {
    const store = mount({ meta: META, components: { Button: {} } })
    type('components', '{"Button":')
    expect(screen.queryAllByRole('alert')).toHaveLength(1)

    act(() => store.ackSave({ meta: META, components: { Card: {} } }))

    expect(box('components').value).toBe(JSON.stringify({ Card: {} }, null, 2))
    expect(screen.queryAllByRole('alert')).toHaveLength(0)
  })
})

describe('JsonEditor — 읽기 전용', () => {
  it('상자가 잠기고 값은 그대로 그린다', () => {
    mount({ meta: META, primitives: { container: { gutter: 'space.6' } } }, { locked: true })

    const input = box('primitives')
    expect(input.disabled).toBe(true)
    // **값까지 단언한다.** ①이 이름 입력에서 `disabled`만 보는 케이스가 **0 사망**인 것을
    // 쟀다(그쪽 보고서 §5.1) — 잠겼을 때 빈 값을 그려도 초록이었다.
    expect(input.value).toBe(JSON.stringify({ container: { gutter: 'space.6' } }, null, 2))
  })
})

describe('JsonEditor — 화면이 말하는 사실', () => {
  it('patterns 상자가 갤러리에 안 나온다고 말한다', () => {
    mount({ meta: META })

    const section = screen.getByRole('region', { name: 'patterns' })
    expect(within(section).getByText(/갤러리에 그려지지 않습니다/)).toBeTruthy()
  })

  it('assets 상자가 placeholder.style이 아무 일도 안 한다고 말한다', () => {
    mount({ meta: META })

    const section = screen.getByRole('region', { name: 'assets' })
    expect(within(section).getByText(/placeholder\.style/)).toBeTruthy()
  })

  it('파생일 때만 `null`이 삭제라고 말하고, 그 문장이 참이다', () => {
    const base = systemTheme('admin') as Theme
    const derived: Theme = { meta: { ...META, extends: 'system:admin' } }

    const store = mount(derived, { base })
    expect(screen.getByText(/지우려면/)).toBeTruthy()

    // **문장이 참인지를 화면이 아니라 병합으로 잰다.** 안 적으면 상속값이 그대로 오고,
    // `null`을 적으면 사라진다(§6.9).
    const inherited = resolveDraft(store.getState().draft, base)
    expect(inherited.resolved?.components.size).toBeGreaterThan(0)

    type('components', 'null')
    const deleted = resolveDraft(store.getState().draft, base)
    expect(deleted.resolved?.components.size).toBe(0)
  })

  it('파생이 아니면 그 안내를 안 그린다', () => {
    mount({ meta: META })
    expect(screen.queryByText(/지우려면/)).toBeNull()
  })
})

// ────────────────────────────────────────────────────────────────────────────────
// 여기부터 P4c-3 (D6) — **파싱 실패를 스토어에 알린다.**
//
// W2가 여기까지 왔다: 경보를 그리고 초안을 안 건드리는 것. **그런데 저장은 안 막혔다** —
// 계약이 스토어에 없었기 때문이다(W2 §7-3: *"오늘 이 화면이 할 수 있는 것은 그렇게 말하는
// 것뿐이다"*). 그 계약이 생겼으므로 이제 이 화면이 그것을 채운다.
// ────────────────────────────────────────────────────────────────────────────────

describe('JsonEditor — 읽지 못한 절을 스토어에 알린다 (P4c-3 D6)', () => {
  it('파싱이 실패하면 그 절의 이름이 스토어에 실린다', () => {
    const store = mount({ meta: META, components: { Button: {} } })

    type('components', '{"Button":')

    expect(store.getState().unreadable).toEqual(['components'])
    // **초안은 그대로다** — W2의 선은 그대로 지켜진다.
    expect(store.getState().draft?.components).toEqual({ Button: {} })
  })

  it('다시 읽히면 내려간다 — 한 번 실패한 절이 영원히 저장을 막지 않는다', () => {
    const store = mount({ meta: META, components: { Button: {} } })

    type('components', '{"Button":')
    type('components', '{"Card":{}}')

    expect(store.getState().unreadable).toEqual([])
  })

  it('상자를 비우는 것은 읽은 것이다 — 절이 없는 문서가 정상이다', () => {
    const store = mount({ meta: META, components: { Button: {} } })

    type('components', '{"Button":')
    type('components', '   ')

    expect(store.getState().unreadable).toEqual([])
  })

  it('절마다 따로 센다 — 한 상자가 실패해도 다른 상자는 계속 쓴다', () => {
    const store = mount({ meta: META })

    type('components', '{"Button":')
    type('patterns', '{"nav.primary":')

    expect(store.getState().unreadable).toEqual(['components', 'patterns'])

    type('components', '{}')
    expect(store.getState().unreadable).toEqual(['patterns'])
  })

  it('초안이 통째로 갈리면 상자가 다시 마운트된다 — 없는 절도 그렇다', () => {
    // **이 케이스가 잡는 구석이 정확히 `draftEpoch`가 있는 이유다.** `patterns`는 앞뒤로
    // 둘 다 `undefined`라 상자의 교정(`source !== value`)이 안 걸린다 — 다시 마운트하지
    // 않으면 읽지 못한 글자가 새 문서 위에 그대로 남고, 스토어의 `unreadable`은 비워져
    // **둘이 갈린다.**
    const store = mount({ meta: META })
    type('patterns', '{"nav.primary":')
    expect(box('patterns').value).toBe('{"nav.primary":')

    act(() => store.replaceDraft({ meta: META, components: { Card: {} } }))

    expect(box('patterns').value).toBe('')
    expect(box('patterns').getAttribute('aria-invalid')).toBe('false')
    expect(store.getState().unreadable).toEqual([])
  })
})
