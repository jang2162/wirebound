/**
 * 서버에서 프로젝트의 테마를 읽어 `ThemeSource`로 넘긴다.
 *
 * `theme-source.ts`가 *"P4a-3이 이 함수를 저장소로 바꾼다"*고 적어 둔 자리다. 다만
 * `defaultThemeSource`를 **지우지 않았다** — 아래 "폴백과의 관계" 참고.
 *
 * ---
 *
 * **안정 참조가 계약이다.**
 *
 * `useThemeCss`가 `useMemo(() => compileOnce(source), [source])`로 컴파일을 아낀다.
 * 매 렌더 새 함수를 넘기면 그 `useMemo`가 **매번 재컴파일**한다 — P4a-2가 이월에
 * 적어 둔 바로 그 자리다. 그래서 여기서 내는 함수는
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
 * 두 상태 모두 `null`을 낸다. 그때 화면은 **구조 기본 CSS만으로** 그려진다 — P4a-2의
 * D5가 시트를 둘로 나눈 이유이고, `theme-source.ts`가 `null`을 낼 수 있는 것과 같은
 * 경로다. 던지지 않는 것이 요점이다: 테마를 못 읽은 것과 화면이 사라지는 것은 다른 일이고
 * 이 프로젝트는 그 *"빈 화면"* 부류를 반복해 겪었다.
 *
 * **이슈는 콘솔에만 남긴다** — P4a-2의 재라 #12 결정 그대로다(토큰 하나가 깨지면
 * 그것을 가리키는 스타일마다 이슈가 따라 나와 근원을 나머지가 가린다).
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

export function useProjectTheme(projectId: string | undefined, reloadToken = 0): ThemeSource {
  const api = useApi()
  const [theme, setTheme] = useState<Theme | null>(null)

  useEffect(() => {
    if (projectId === undefined || projectId === '') {
      setTheme(null)
      return
    }

    // 프로젝트가 바뀌는 동안 앞 요청의 응답이 늦게 도착해 새 프로젝트의 테마를 덮는
    // 것을 막는다. `routes/editor.tsx`의 조회들이 쓰는 것과 같은 형식이다.
    let alive = true

    void (async () => {
      try {
        const result = await api.getProjectTheme(projectId)
        if (!alive) return

        if (result.issues.length > 0) {
          console.error(
            `서버가 테마를 해석하지 못했습니다 (이슈 ${result.issues.length}건)`,
            result.issues.map((issue) => `${issue.path}: ${issue.message}`),
          )
        }
        setTheme(result.theme)
      } catch (error) {
        if (!alive) return
        // 조회 실패도 `null`이다 — 화면은 구조 기본 CSS로 그려진다. 사용자에게 문안을
        // 띄우지 않는 것은 이슈와 같은 이유이고, 여기서 던지면 캔버스가 통째로 사라진다.
        console.error('테마를 읽지 못해 기본 스타일로 그립니다', error)
        setTheme(null)
      }
    })()

    return () => {
      alive = false
    }
    // **`reloadToken`이 의존성에 있는 것이 고르개가 캔버스에 닿는 경로다**(P4b-3 P2).
    // 서버의 테마를 바꾸는 것은 이 훅 밖(`theme/theme-picker.tsx`)에서 일어나므로,
    // 값이 바뀌었다는 신호가 없으면 이 이펙트는 다시 돌 이유를 모른다.
    //
    // **아래 `useMemo`의 의존성에는 넣지 않는다.** 그러면 토큰이 오를 때마다 새 참조가
    // 나가 **조회가 끝나기도 전에** 재컴파일이 일어난다 — 안정 참조 계약이 재는 것은
    // *"테마 **값**이 그대로면 같은 참조"*이고, 토큰은 값이 아니라 요청이다.
  }, [api, projectId, reloadToken])

  // **의존성이 `theme` 하나인 것이 이 훅의 계약이다**(위 "안정 참조가 계약이다").
  return useMemo<ThemeSource>(() => () => theme, [theme])
}
