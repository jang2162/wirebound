/**
 * **테마를 못 실었다는 한 줄**(spec `2026-09-27-code-themes-design.md` 「실시간」 — «번들을 못 읽으면 캔버스는 SDK 기본 뷰로 그리고 셸
 * 머리에 한 줄로 알리며 다시 읽을 단추를 둔다»). 캔버스는 이미 기본 뷰로 그리고 있다 — 이 줄은 «왜 모양이 다른가» 와 다시 싣는 길이다.
 *
 * `role="status"` 다 — 사용자가 방금 누른 것의 실패가 아니다(`shell/remote-alert.tsx` 와 같은 판단).
 */
import type { ReactElement } from 'react'
import { useProjectTheme } from './project-theme'

export function ThemeAlert(): ReactElement | null {
  const theme = useProjectTheme()
  if (theme.status !== 'bundle-failed' && theme.status !== 'failed') return null
  return (
    <p className="wb-shell-theme-alert" role="status">
      테마를 불러오지 못해 기본 모양으로 그립니다 — {theme.failure}{' '}
      <button type="button" className="wb-shell-remote-reload" onClick={theme.retry}>
        다시 불러오기
      </button>
    </p>
  )
}
