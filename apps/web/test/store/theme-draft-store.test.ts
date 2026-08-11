// @vitest-environment node
/**
 * `ThemeDraftStore`의 계약 테스트. **React를 import하지 않고 DOM 없는 환경에서 돈다.**
 *
 * D3이 요구한 것이 그것이다 — *"화면 없이 단위 테스트할 수 있어야 한다"*. 맨 윗줄의 환경
 * 지정이 그 전제를 실제로 강제한다: 이 저장소의 `web` 프로젝트는 기본이 jsdom이라
 * (루트 `vitest.config.ts`) 그 줄이 없으면 스토어가 `document`를 만져도 초록으로 남는다.
 *
 * **그 지시자를 이 산문에 그대로 옮겨 적지 마라** — vitest는 파일 어디에 있든 그 토큰을
 * 찾으므로, 두 번 적으면 맨 윗줄을 지워도 환경이 그대로다(`editor-store.test.ts`가 같은
 * 함정을 적어 두었다).
 */
import { describe, expect, it } from 'vitest'
import { themeIssue, type Theme } from '@wirebound/themes'
import { ThemeDraftStore, isDirty } from '../../src/store/theme-draft-store'

/** 테마 최소형. 스토어는 내용을 해석하지 않으므로 이름만 구분되면 된다. */
function theme(id: string): Theme {
  return { meta: { id, name: id, version: '1.0.0' } }
}

describe('ThemeDraftStore', () => {
  it('DOM 없는 환경에서 돈다', () => {
    // 맨 윗줄의 환경 지정이 지워지면 여기서 잡힌다. 그 줄이 없으면 스토어가 DOM 전역에
    // 기대도 나머지 케이스가 전부 통과한다.
    expect(typeof globalThis.document).toBe('undefined')
    expect(typeof globalThis.window).toBe('undefined')
  })

  it('초기 상태는 초안 없음이고 저장할 것도 없다', () => {
    const state = new ThemeDraftStore().getState()
    expect(state.openThemeId).toBeNull()
    expect(state.draft).toBeNull()
    expect(state.saved).toBeNull()
    expect(state.base).toBeNull()
    expect(state.readOnly).toBe(false)
    expect(state.saveStatus).toBe('idle')
    expect(state.serverWarnings).toEqual([])
    expect(isDirty(state)).toBe(false)
  })

  it('loadTheme은 초안과 저장본에 같은 참조를 싣는다 — 막 받은 것은 저장할 것이 없다', () => {
    const store = new ThemeDraftStore()
    const brand = theme('brand')
    store.loadTheme('t1', brand)

    const state = store.getState()
    expect(state.openThemeId).toBe('t1')
    expect(state.draft).toBe(brand)
    expect(state.saved).toBe(brand)
    expect(isDirty(state)).toBe(false)
  })

  it('putSection은 새 참조를 만들고 그때부터 저장할 것이 생긴다', () => {
    const store = new ThemeDraftStore()
    const brand = theme('brand')
    store.loadTheme('t1', brand)

    store.putSection('tokens', { semantic: { primary: '#f00' } })

    const state = store.getState()
    expect(state.draft).not.toBe(brand)
    expect(state.saved).toBe(brand)
    expect(state.draft?.tokens).toEqual({ semantic: { primary: '#f00' } })
    // **원본을 안 건드린다** — 스토어는 그 객체를 다음 비교의 기준으로 들고 있다.
    expect(brand.tokens).toBeUndefined()
    expect(isDirty(state)).toBe(true)
  })

  it('putSection에 undefined를 주면 그 절이 지워진다 — 비우는 것과 다르다', () => {
    const store = new ThemeDraftStore()
    store.loadTheme('t1', { ...theme('brand'), components: {} })

    store.putSection('components', undefined)

    // **저장이 통째 교체라 이 차이가 서버까지 간다.** `{}`는 "스타일을 하나도 안 준다"이고
    // 키가 없는 것은 "이 절을 안 쓴다"이다.
    expect('components' in (store.getState().draft ?? {})).toBe(false)
  })

  it('초안이 없으면 putSection이 아무것도 안 한다 — 던지지 않는다', () => {
    const store = new ThemeDraftStore()
    let notified = 0
    store.subscribe(() => {
      notified += 1
    })

    expect(() => store.putSection('tokens', {})).not.toThrow()
    expect(store.getState().draft).toBeNull()
    expect(notified).toBe(0)
  })

  it('replaceDraft는 없어진 절까지 반영한다 — putSection으로는 못 하는 일이다', () => {
    const store = new ThemeDraftStore()
    store.loadTheme('t1', { ...theme('brand'), components: {}, primitives: {} })

    store.replaceDraft(theme('brand'))

    const draft = store.getState().draft
    expect('components' in (draft ?? {})).toBe(false)
    expect('primitives' in (draft ?? {})).toBe(false)
  })

  it('beginSave는 저장할 것이 없으면 false다', () => {
    const store = new ThemeDraftStore()
    store.loadTheme('t1', theme('brand'))
    expect(store.beginSave()).toBe(false)
    expect(store.getState().saveStatus).toBe('idle')
  })

  it('beginSave는 읽기 전용이면 false다 — 시스템 테마는 서버가 403이다', () => {
    const store = new ThemeDraftStore()
    store.loadTheme('t1', theme('admin'), { readOnly: true })
    store.putSection('tokens', { semantic: { primary: '#f00' } })

    expect(store.beginSave()).toBe(false)
    expect(store.getState().saveStatus).toBe('idle')
  })

  it('beginSave는 이미 떠 있으면 false다 — 통째 교체 둘이 겹치면 나중 응답이 이긴다', () => {
    const store = new ThemeDraftStore()
    store.loadTheme('t1', theme('brand'))
    store.putSection('tokens', {})

    expect(store.beginSave()).toBe(true)
    expect(store.beginSave()).toBe(false)
  })

  it('ackSave는 서버가 준 문서를 초안과 저장본 둘 다에 싣는다', () => {
    const store = new ThemeDraftStore()
    store.loadTheme('t1', theme('brand'))
    store.putSection('tokens', {})
    store.beginSave()

    const fromServer = theme('brand')
    store.ackSave(fromServer)

    const state = store.getState()
    // **`saved`만 갈면 값은 같은데 참조가 달라 저장 버튼이 켜진 채로 남는다.**
    expect(state.draft).toBe(fromServer)
    expect(state.saved).toBe(fromServer)
    expect(isDirty(state)).toBe(false)
    expect(state.saveStatus).toBe('idle')
  })

  it('warnings 키가 없으면 빈 배열로 정규화한다 — 서버가 그렇게 낸다', () => {
    const store = new ThemeDraftStore()
    store.loadTheme('t1', theme('brand'))
    store.putSection('tokens', {})
    store.beginSave()

    // **인자를 아예 안 준다.** P4c-1이 *"경고가 없으면 키 자체가 없다"*로 만들었으므로
    // 화면이 받는 값이 `undefined`다 — 그 구분을 화면마다 하지 않게 여기서 닫는다.
    store.ackSave(theme('brand'))

    expect(store.getState().serverWarnings).toEqual([])
  })

  it('경고가 있으면 그대로 싣고, 다음 저장이 갈아 끼운다', () => {
    const store = new ThemeDraftStore()
    const warning = themeIssue('suspicious-literal', 'primitives.container.maxWidth', '수상한 값')
    store.loadTheme('t1', theme('brand'))
    store.putSection('tokens', {})
    store.beginSave()
    store.ackSave(theme('brand'), [warning])

    expect(store.getState().serverWarnings).toEqual([warning])

    store.putSection('tokens', { semantic: {} })
    store.beginSave()
    store.ackSave(theme('brand'))

    expect(store.getState().serverWarnings).toEqual([])
  })

  it('경고 없는 저장이 이어지면 같은 빈 배열 참조를 유지한다', () => {
    const store = new ThemeDraftStore()
    store.loadTheme('t1', theme('brand'))
    const first = store.getState().serverWarnings

    store.putSection('tokens', {})
    store.beginSave()
    store.ackSave(theme('brand'))

    // 참조가 그대로여야 구독자가 헛일을 하지 않는다(`EditorStore`의 빈 큐와 같은 규칙).
    expect(store.getState().serverWarnings).toBe(first)
  })

  it('failSave는 초안을 되돌리지 않고 422 이슈를 싣는다', () => {
    const store = new ThemeDraftStore()
    store.loadTheme('t1', theme('brand'))
    store.putSection('tokens', { semantic: { primary: 'palette.없음' } })
    const dirtyDraft = store.getState().draft
    store.beginSave()

    const error = themeIssue('unresolved-token', 'tokens.semantic.primary', '못 푼다')
    store.failSave({ kind: 'message', message: '테마 검증에 실패했습니다', issues: [error] })

    const state = store.getState()
    // **사용자가 방금 적은 것을 지우지 않는다.** 되돌릴 서버 상태도 없다(통째 교체다).
    expect(state.draft).toBe(dirtyDraft)
    expect(state.saveStatus).toBe('idle')
    expect(state.saveFailure?.issues).toEqual([error])
  })

  it('실패한 뒤 초안을 고치면 실패 통지가 지워진다', () => {
    const store = new ThemeDraftStore()
    store.loadTheme('t1', theme('brand'))
    store.putSection('tokens', {})
    store.beginSave()
    store.failSave({ kind: 'message', message: '실패', issues: [] })

    store.putSection('tokens', { semantic: {} })

    // 남겨 두면 방금 고친 값도 실패한 것으로 읽힌다.
    expect(store.getState().saveFailure).toBeNull()
  })

  it('실패해도 마지막 저장의 serverWarnings는 남는다 — 다른 문서에 대한 판정이다', () => {
    const store = new ThemeDraftStore()
    const warning = themeIssue('node-handle-overwrite', 'components.Flex.base.display', '덮는다')
    store.loadTheme('t1', theme('brand'))
    store.putSection('tokens', {})
    store.beginSave()
    store.ackSave(theme('brand'), [warning])

    store.putSection('tokens', { semantic: {} })
    store.beginSave()
    store.failSave({ kind: 'message', message: '실패', issues: [] })

    expect(store.getState().serverWarnings).toEqual([warning])
  })

  it('clearTheme은 열린 테마·초안·base·저장 상태를 함께 비운다', () => {
    const store = new ThemeDraftStore()
    store.loadTheme('t1', theme('brand'), { base: theme('admin'), readOnly: true })
    store.clearTheme()

    const state = store.getState()
    expect(state.openThemeId).toBeNull()
    expect(state.draft).toBeNull()
    expect(state.saved).toBeNull()
    expect(state.base).toBeNull()
    expect(state.readOnly).toBe(false)
  })

  it('앞 테마의 실패 통지가 새 테마로 넘어오지 않는다', () => {
    const store = new ThemeDraftStore()
    store.loadTheme('t1', theme('brand'))
    store.putSection('tokens', {})
    store.beginSave()
    store.failSave({ kind: 'message', message: '실패', issues: [] })

    store.loadTheme('t2', theme('other'))

    expect(store.getState().saveFailure).toBeNull()
  })

  it('바뀐 것이 없으면 알리지 않는다', () => {
    const store = new ThemeDraftStore()
    const brand = theme('brand')
    store.loadTheme('t1', brand)

    let notified = 0
    store.subscribe(() => {
      notified += 1
    })

    // 같은 값으로 다시 부른다 — `#apply`가 참조 비교로 걸러야 한다.
    store.loadTheme('t1', brand)
    store.clearSaveFailure()

    expect(notified).toBe(0)
  })

  it('구독을 해제하면 더 안 부른다', () => {
    const store = new ThemeDraftStore()
    let notified = 0
    const off = store.subscribe(() => {
      notified += 1
    })
    store.loadTheme('t1', theme('brand'))
    expect(notified).toBe(1)

    off()
    store.putSection('tokens', {})
    expect(notified).toBe(1)
  })

  it('알림 중에 구독을 해제해도 순회가 깨지지 않는다', () => {
    const store = new ThemeDraftStore()
    const seen: string[] = []
    const off = store.subscribe(() => {
      seen.push('a')
      off()
    })
    store.subscribe(() => {
      seen.push('b')
    })

    store.loadTheme('t1', theme('brand'))

    // 사본을 순회하지 않으면 `b`가 빠진다.
    expect(seen).toEqual(['a', 'b'])
  })
})
