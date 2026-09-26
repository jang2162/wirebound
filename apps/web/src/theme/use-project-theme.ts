/**
 * 서버에서 프로젝트의 테마를 읽어 `ThemeSource`로 넘긴다.
 *
 * `theme-source.ts`의 내장 테마 대신 저장소의 테마를 내는 자리다. 다만
 * `defaultThemeSource`는 **지우지 않는다** — 아래 "폴백과의 관계" 참고.
 *
 * ---
 *
 * **안정 참조가 계약이다.**
 *
 * `useThemeCss`가 `useMemo(() => compileOnce(source), [source])`로 컴파일을 아낀다.
 * 매 렌더 새 함수를 넘기면 그 `useMemo`가 **매번 재컴파일**한다. 그래서 여기서 내는 함수는
 *
 * - 테마 값이 그대로면 **같은 참조**여야 하고,
 * - 테마 값이 바뀌면 **반드시 새 참조**여야 한다.
 *
 * 뒤엣것이 없으면 조회가 끝나도 화면이 낡은 CSS를 그대로 쓴다(첫 렌더의 `null`이
 * 영원히 남는다). `useMemo(…, [theme])` 하나가 두 방향을 동시에 만족시킨다 —
 * `useRef`로 값을 숨기고 함수를 상수로 두면 앞엣것만 만족하고 뒤엣것이 깨진다.
 *
 * **그 두 방향을 `test/theme/use-project-theme.test.tsx`가 컴파일 횟수로 잰다.**
 *
 * ---
 *
 * **조회 중·실패에 빈 화면이 되지 않는다.**
 *
 * 두 상태 모두 `null`을 낸다. 그때 화면은 **구조 기본 CSS만으로** 그려진다 — 시트를
 * 둘로 나눈 이유이고, `theme-source.ts`가 `null`을 낼 수 있는 것과 같은
 * 경로다. 던지지 않는 것이 요점이다: 테마를 못 읽은 것과 화면이 사라지는 것은 다른 일이다.
 *
 * **이슈는 콘솔에만 남긴다** — 화면에 띄우면 토큰 하나가 깨질 때
 * 그것을 가리키는 스타일마다 이슈가 따라 나와 근원을 나머지가 가린다.
 *
 * ---
 *
 * **폴백과의 관계 — `defaultThemeSource`를 지우지 않는다.**
 *
 * 그것은 `use-theme-css.ts`의 **기본 인자**이고, 이 훅을 쓰지 않는 호출자(테스트,
 * 그리고 프로젝트 문맥이 없는 화면)가 여전히 그것을 지난다. 지금 관계는 이렇다:
 *
 * | 부르는 쪽 | 테마 | 언제 |
 * |---|---|---|
 * | `useThemeCss()` 인자 없이 | 내장 `admin`(`defaultThemeSource`) | 프로젝트가 없거나 서버를 안 보는 자리 |
 * | `useThemeCss(useProjectTheme(id))` | 서버가 준 것, 없으면 `null` | 캔버스 |
 *
 * **둘은 다른 질문에 답한다** — 폴백은 *"아무 정보도 없을 때 무엇을 그리나"*이고 이
 * 훅은 *"이 프로젝트가 고른 것이 무엇인가"*다. 서버가 `null`을 줬을 때 내장 테마로
 * 되돌리지 **않는** 것도 그 구분 때문이다: 그것은 *"테마를 고르지 않았다"*는 **답**이지
 * 정보의 부재가 아니다.
 */
import { useEffect, useMemo, useState } from 'react'
import type { Theme } from '@wirebound/themes'
import { useApi } from '../api/context'
import type { ThemeSource } from './theme-source'

/**
 * 서버가 **갈라서 주는** 테마 상태. `ThemeSource`는 이것을 `Theme | null`로 좁혀 내므로
 * 그리는 쪽에는 충분하지만 **말하는 쪽에는 모자란다.**
 *
 * 말하는 쪽(패턴 고르개)이 `null` 하나를 *"테마를 아직 읽지 못했습니다"*로 옮기면, 그 문장이
 * **서버가 답으로 낸 `theme: null`**(=테마를 고르지 않았다)까지 덮는다 — *"없다는 것과
 * 고장난 것을 사용자가 가른다"*를 한 층 위에서 깨는 형태이고, 이 파일의 머리말(*"그것은
 * 「테마를 고르지 않았다」는 **답**이지 정보의 부재가 아니다"*)과도 어긋난다.
 *
 * **넷은 서버가 구분해 주는 것이고 하나는 요청을 보내기 전이다** — 지어낸 갈래가 아니다.
 * 서버 쪽 넷은 `apps/api/src/routes/themes.ts`의 `currentTheme`이 내는 값으로 갈린다:
 *
 * | 상태 | 언제 | 사용자가 할 일 |
 * |---|---|---|
 * | `no-project` | **부를 프로젝트가 없다**(`projectId`가 없거나 빈 문자열) | 주소를 확인한다 |
 * | `loading` | 요청을 보냈고 아직 안 왔다 | 기다린다 |
 * | `failed` | 요청이 던졌다 | 새로고침한다 |
 * | `unset` | `themeId: null` · `theme: null` | 테마를 고른다 |
 * | `unresolved` | `themeId` 있음 · `theme: null` · `issues` 있음 | **테마를 고친다** |
 * | `ready` | `theme` 있음 | — |
 *
 * `unresolved`는 *"상속 대상 시스템 테마가 코드에서 사라졌다"*가 만든다.
 * `unset`의 세 원인(기본 레이아웃 없음·테마 안 고름·테마 행 사라짐)을 서버가 이미 하나로
 * 묶어 주므로 **여기서 다시 가르지 않는다.**
 *
 * **`no-project`는 `unset`과 갈린다.** `projectId`가 없을 때 `unset`을 내면
 * 화면이 *"이 **프로젝트는** 테마를 고르지 않았습니다"*로 **없는 프로젝트를 가리켜 말한다.** 이것은 요청을 **보내지도 않은** 상태이므로 서버가
 * 가르는 넷 중 어디에도 속하지 않는다.
 *
 * **지금은 도달하지 않는다 — 두 겹이 막는다.** ① 이 값을 쓰는 화면이 받는 `projectId`는
 * 전부 조회해 온 `ProjectDetail.id`이고(`routes/editor.tsx`가 `status === 'ready'`일 때만
 * 셸을 그린다), ② 그 응답 가드 `isProjectDetail`이 **`value['id'] !== ''`를 명시적으로
 * 검사한다**(`api/http-client.ts`). **그래도 가르는 것은 여기가 케이스를 쓸 수 있는
 * 자리이기 때문이다** — 훅은 화면 없이 부를 수 있고(`test/theme/use-project-theme.test.tsx`의
 * `Probe`가 이미 그렇게 한다), 케이스를 쓸 수 있으면 도달 불가라도 고정할 수 있다.
 * (도달 불가인데 **케이스도 못 쓰는** 갈래에는 이 이유가 서지 않는다.)
 */
export type ProjectThemeState =
  | { status: 'no-project' }
  | { status: 'loading' }
  | { status: 'failed' }
  | { status: 'unset' }
  | { status: 'unresolved' }
  | { status: 'ready'; theme: Theme }

/**
 * 조회 하나가 내는 **상태**. `useProjectTheme`이 이것을 좁혀 `ThemeSource`로 만든다 —
 * 조회 로직이 두 벌이 되지 않도록 여기 한 곳에 둔다.
 */
export function useProjectThemeState(
  projectId: string | undefined,
  reloadToken = 0,
): ProjectThemeState {
  const api = useApi()
  const [state, setState] = useState<ProjectThemeState>({ status: 'loading' })

  useEffect(() => {
    if (projectId === undefined || projectId === '') {
      // **`loading`도 `unset`도 아니다.** 기다려도 오지 않으므로 `loading`이 아니고,
      // 요청을 보내지도 않았으므로 *"테마를 고르지 않았다"*는 서버의 답이 아니다.
      setState({ status: 'no-project' })
      return
    }

    // 프로젝트가 바뀌는 동안 앞 요청의 응답이 늦게 도착해 새 프로젝트의 테마를 덮는
    // 것을 막는다. `routes/editor.tsx`의 조회들이 쓰는 것과 같은 형식이다.
    let alive = true
    // 떠나면 요청째 끊는다(`ReadOptions.cancel`). 페이지를 옮길 때마다 다시 돈다(방문마다 `theme` GET).
    const leave = new AbortController()

    void (async () => {
      try {
        const result = await api.getProjectTheme(projectId, { cancel: leave.signal })
        if (!alive) return

        if (result.issues.length > 0) {
          console.error(
            `서버가 테마를 해석하지 못했습니다 (이슈 ${result.issues.length}건)`,
            result.issues.map((issue) => `${issue.path}: ${issue.message}`),
          )
        }
        if (result.theme !== null) {
          setState({ status: 'ready', theme: result.theme })
          return
        }
        // **`themeId`가 갈림길이다.** 서버가 테마를 고르지 않은 프로젝트에는 둘 다
        // `null`을 주고, 고른 테마를 해석하지 못했을 때만 `themeId`를 남긴다.
        setState({ status: result.themeId === null ? 'unset' : 'unresolved' })
      } catch (error) {
        if (!alive) return
        // 조회 실패에서도 **그리기는 계속된다** — 화면은 구조 기본 CSS로 그려진다.
        // 여기서 던지면 캔버스가 통째로 사라진다. 이 상태를 문장으로 옮길지는 읽는
        // 쪽이 정한다(캔버스는 셸 머리에 한 줄을 싣고 — `canvas/canvas-theme-notice.tsx` —, 패턴 고르개는 제 자리에 말한다).
        console.error('테마를 읽지 못해 기본 스타일로 그립니다', error)
        setState({ status: 'failed' })
      }
    })()

    return () => {
      alive = false
      leave.abort()
    }
    // **`reloadToken`이 의존성에 있는 것이 고르개가 캔버스에 닿는 경로다.**
    // 서버의 테마를 바꾸는 것은 이 훅 밖(`theme/theme-picker.tsx`)에서 일어나므로,
    // 값이 바뀌었다는 신호가 없으면 이 이펙트는 다시 돌 이유를 모른다.
    //
    // **아래 `useMemo`의 의존성에는 넣지 않는다.** 그러면 토큰이 오를 때마다 새 참조가
    // 나가 **조회가 끝나기도 전에** 재컴파일이 일어난다 — 안정 참조 계약이 재는 것은
    // *"테마 **값**이 그대로면 같은 참조"*이고, 토큰은 값이 아니라 요청이다.
  }, [api, projectId, reloadToken])

  return state
}

export function useProjectTheme(projectId: string | undefined, reloadToken = 0): ThemeSource {
  return useThemeSourceOf(useProjectThemeState(projectId, reloadToken))
}

/**
 * 상태를 `ThemeSource`로 좁힌다 — 상태도 함께 읽는 쪽(캔버스: 실패를 셸에 싣는다)이 조회를 두 번 돌리지 않게 따로 둔다. 안정 참조 계약은
 * 아래 `useMemo` 하나가 진다.
 */
export function useThemeSourceOf(state: ProjectThemeState): ThemeSource {
  // **넷을 `null` 하나로 좁힌다.** 그리는 쪽은 *"무엇을 그리나"*만 물으므로 이유가
  // 필요 없다 — 이유가 필요한 쪽(패턴 고르개)이 위 훅을 직접 쓴다.
  const theme = state.status === 'ready' ? state.theme : null

  // **의존성이 `theme` 하나인 것이 이 훅의 계약이다**(위 "안정 참조가 계약이다").
  // `state`는 매 조회마다 새 객체지만 그 안의 `theme`은 서버가 준 그 객체이므로,
  // 값이 그대로면 같은 참조이고 값이 바뀌면 반드시 새 참조다 — 두 방향이 그대로 산다.
  return useMemo<ThemeSource>(() => () => theme, [theme])
}
