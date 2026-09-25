/**
 * **캔버스가 테마를 못 읽었다는 것을 셸 머리가 말하는 통로.**
 *
 * 테마 조회가 던지면 캔버스는 구조 기본 CSS 로 그린다(`theme/use-project-theme.ts` — 테마를 못 읽은 것과 화면이 사라지는 것은 다른 일이다).
 * 그런데 말하지 않으면 사람은 기본 스타일을 **설계서의 모습**으로 읽는다 — 테마를 고른 설계서가 말없이 다른 옷을 입는다. 복원 뒤 다시 읽기의
 * 테마 조회가 실패하면 그때까지 입던 테마까지 벗는다. 그래서 한 줄로 말하고 다시 읽을 단추를 준다(셸의 `themeReloadToken`을 올린다 — 테마
 * 고르개가 캔버스에 닿는 길과 같다).
 *
 * **자리가 캔버스 밖인 것이 요점이다.** 캔버스 프레임 안은 테마 CSS 가 전담하고 셸 클래스는 셋만 산다(`routes/editor.tsx`의 `CanvasFrame`
 * 머리말) — 그 안에 문장을 두면 줌에 따라 커지고 줄어든다. 머리의 남의 일 통지(`shell/remote-alert.tsx`)와 같은 꼴 · 같은 `status`로 둔다 —
 * 사람이 방금 누른 것의 실패가 아니다.
 *
 * **캔버스가 내려가면 거둔다** — 캔버스가 없는 동안(페이지 없음 · 불러오는 중 · 실패)에는 테마로 그리는 것이 없고, 다시 올라온 캔버스는 테마를
 * 새로 읽는다. **`unresolved`(서버가 고른 테마를 해석하지 못했다)는 여기서 말하지 않는다** — 다시 읽어도 같고, 그 이슈는 콘솔이 갖는다(그
 * 파일의 머리말 «이슈는 콘솔에만»).
 */
import { createContext, useContext, useLayoutEffect, useState, type ReactElement, type ReactNode } from 'react'

const FailedContext = createContext(false)
const PublishContext = createContext<(failed: boolean) => void>(() => {})

/** 셸이 캔버스와 머리를 함께 감싼다. `children`을 그대로 넘긴다 — 값이 바뀌어도 셸을 다시 그리지 않는다(`canvas-structures.tsx`와 같다). */
export function CanvasThemeNoticeProvider(props: { children: ReactNode }): ReactElement {
  const [failed, setFailed] = useState(false)
  return (
    <PublishContext.Provider value={setFailed}>
      <FailedContext.Provider value={failed}>{props.children}</FailedContext.Provider>
    </PublishContext.Provider>
  )
}

/** 캔버스가 테마 조회가 실패했는지 싣는다. 내려가면 거둔다(머리말). */
export function usePublishThemeFailed(failed: boolean): void {
  const publish = useContext(PublishContext)
  useLayoutEffect(() => {
    publish(failed)
  }, [publish, failed])
  useLayoutEffect(() => () => publish(false), [publish])
}

/** 테마를 못 읽어 기본 스타일로 그린다는 한 줄. `onReload`가 테마를 다시 읽는다(셸의 `themeReloadToken`). */
export function ThemeAlert(props: { onReload: () => void }): ReactElement | null {
  const failed = useContext(FailedContext)
  if (!failed) return null
  return (
    <p className="wb-shell-remote-alert" role="status">
      {THEME_FAILED_NOTICE}{' '}
      <button type="button" className="wb-shell-remote-reload" onClick={props.onReload}>
        테마 다시 불러오기
      </button>
    </p>
  )
}

export const THEME_FAILED_NOTICE = '테마를 불러오지 못해 캔버스를 기본 스타일로 그리고 있습니다.'
