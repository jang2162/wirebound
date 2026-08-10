/**
 * 서버에서 테마를 읽는 `ThemeSource`.
 *
 * **컴파일 횟수를 실제로 센다.** P4a-2가 이월에 *"`ThemeSource`를 안정 참조로 유지해야
 * 한다"*고 적었는데, 참조 동일성만 단언하면 *"그래서 재컴파일이 실제로 줄었는가"*를
 * 재지 않는다. `vi.mock`으로 `compileTheme`을 감싸 **부른 횟수**를 세면 그 질문에
 * 직접 답한다 — 재는 방법을 이것으로 정했다(계획서 Task 9 Step 1).
 *
 * `importOriginal`로 나머지를 그대로 통과시키므로 해석·방출은 진짜 구현이 돈다.
 */
import { render, waitFor } from '@testing-library/react'
import { useEffect, useState, type ReactElement } from 'react'
import { compileTheme, systemTheme, type Theme } from '@wirebound/themes'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiProvider } from '../../src/api/context'
import type { ProjectTheme } from '../../src/api/types'
import { STRUCTURE_STYLE_ID, THEME_STYLE_ID, useThemeCss } from '../../src/theme/use-theme-css'
import { useProjectTheme } from '../../src/theme/use-project-theme'
import { fakeApi } from '../helpers'

vi.mock('@wirebound/themes', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@wirebound/themes')>()
  return { ...actual, compileTheme: vi.fn(actual.compileTheme) }
})

const compileCalls = (): number => vi.mocked(compileTheme).mock.calls.length

/** 시스템 `admin`을 그대로 쓴다 — 실제로 해석되는 테마여야 컴파일까지 간다. */
function serverTheme(): Theme {
  return systemTheme('admin')!
}

/** 서버가 준 것을 그대로 캔버스처럼 쓰는 최소 컴포넌트. */
function Probe(props: { projectId: string | undefined }): ReactElement {
  const source = useProjectTheme(props.projectId)
  useThemeCss(source)
  return <div data-testid="probe" />
}

/** 테마와 무관한 상태를 바꿔 리렌더만 일으키는 껍데기. */
function Rerenderer(props: { projectId: string; onReady: (bump: () => void) => void }): ReactElement {
  const [, setTick] = useState(0)
  useEffect(() => {
    props.onReady(() => setTick((value) => value + 1))
  }, [props])
  return <Probe projectId={props.projectId} />
}

function withApi(node: ReactElement, getProjectTheme: (projectId: string) => Promise<ProjectTheme>) {
  return render(<ApiProvider client={fakeApi({ getProjectTheme })}>{node}</ApiProvider>)
}

function themeStyleText(): string {
  return document.head.querySelector(`style[data-wb-style="${THEME_STYLE_ID}"]`)?.textContent ?? ''
}

beforeEach(() => {
  vi.mocked(compileTheme).mockClear()
  // `<style>`은 `document.head`의 전역 공유 자원이고 훅이 정리에서 지우지 않는다
  // (`use-theme-css.ts`의 근거). 파일 안에서 케이스끼리 새지 않도록 여기서 치운다.
  for (const id of [STRUCTURE_STYLE_ID, THEME_STYLE_ID]) {
    document.head.querySelector(`style[data-wb-style="${id}"]`)?.remove()
  }
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useProjectTheme', () => {
  it('프로젝트의 테마를 한 번 읽어 화면에 싣는다', async () => {
    const getProjectTheme = vi.fn(async () => ({ themeId: null, theme: serverTheme(), issues: [] }))
    withApi(<Probe projectId="p1" />, getProjectTheme)

    await waitFor(() => expect(themeStyleText()).toContain('--wb-'))
    expect(getProjectTheme).toHaveBeenCalledTimes(1)
    expect(getProjectTheme).toHaveBeenCalledWith('p1')
  })

  /**
   * **이 파일의 핵심.** 테마와 무관한 리렌더가 재컴파일을 일으키면 안 된다.
   * `useMemo(…, [theme])`의 의존성이 그것을 지킨다.
   */
  it('테마와 무관한 리렌더는 재컴파일하지 않는다', async () => {
    let bump = (): void => {}
    withApi(
      <Rerenderer
        projectId="p1"
        onReady={(fn) => {
          bump = fn
        }}
      />,
      async () => ({ themeId: null, theme: serverTheme(), issues: [] }),
    )

    await waitFor(() => expect(compileCalls()).toBeGreaterThan(0))
    const afterLoad = compileCalls()

    bump()
    bump()
    bump()
    await waitFor(() => expect(themeStyleText()).toContain('--wb-'))
    expect(compileCalls()).toBe(afterLoad)
  })

  /**
   * 반대 방향. 참조를 **상수로** 두면(`useRef`로 값을 숨기면) 위 케이스는 통과하지만
   * 조회가 끝나도 화면이 첫 렌더의 `null`을 영원히 쓴다.
   */
  it('테마가 도착하면 반드시 다시 컴파일한다', async () => {
    withApi(<Probe projectId="p1" />, async () => ({ themeId: null, theme: serverTheme(), issues: [] }))

    // 첫 렌더는 `null`이라 테마 CSS가 비어 있다.
    await waitFor(() => expect(themeStyleText()).not.toBe(''))
    expect(compileCalls()).toBeGreaterThanOrEqual(1)
    expect(themeStyleText()).toContain('--wb-')
  })

  describe('빈 화면이 되지 않는다', () => {
    it('조회 중에는 구조 기본 CSS만으로 그린다', () => {
      // 절대 resolve하지 않는 약속 — "조회 중"을 그대로 붙잡아 둔다.
      withApi(<Probe projectId="p1" />, () => new Promise<ProjectTheme>(() => {}))

      const structure = document.head.querySelector(`style[data-wb-style="${STRUCTURE_STYLE_ID}"]`)
      expect(structure?.textContent).not.toBe('')
      expect(themeStyleText()).toBe('')
    })

    it('조회가 실패해도 던지지 않고 구조 기본 CSS만 남는다', async () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const { getByTestId } = withApi(<Probe projectId="p1" />, async () => {
        throw new Error('서버가 죽었다')
      })

      await waitFor(() => expect(spy).toHaveBeenCalled())
      expect(getByTestId('probe')).toBeTruthy()
      expect(themeStyleText()).toBe('')
    })

    it('서버가 theme: null을 주면 그대로 테마 없이 그린다', async () => {
      withApi(<Probe projectId="p1" />, async () => ({ themeId: null, theme: null, issues: [] }))

      await waitFor(() => expect(document.head.querySelector(`style[data-wb-style="${THEME_STYLE_ID}"]`)).toBeTruthy())
      expect(themeStyleText()).toBe('')
    })

    it('projectId가 없으면 서버를 부르지 않는다', () => {
      const getProjectTheme = vi.fn(async () => ({ themeId: null, theme: serverTheme(), issues: [] }))
      withApi(<Probe projectId={undefined} />, getProjectTheme)
      expect(getProjectTheme).not.toHaveBeenCalled()
    })
  })

  /**
   * **이슈는 콘솔에만 남긴다** — P4a-2의 재라 #12 결정 그대로다. 화면에 뿌리면
   * 근원 하나를 나머지가 가린다(토큰 하나를 어긋내면 이슈 6건이 나는 것을 그때 쟀다).
   */
  it('서버가 이슈를 내면 콘솔에만 남긴다', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { container } = withApi(<Probe projectId="p1" />, async () => ({ themeId: null, theme: null,
      issues: [{ path: 'tokens.semantic.primary', message: '없는 토큰입니다' }],
    }))

    await waitFor(() => expect(spy).toHaveBeenCalled())
    expect(spy.mock.calls[0]![0]).toContain('이슈 1건')
    // 화면에는 그 문장이 없다.
    expect(container.textContent).not.toContain('없는 토큰')
  })
})
