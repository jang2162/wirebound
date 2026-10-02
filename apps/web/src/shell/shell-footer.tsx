/**
 * **하단 바**(spec `docs/superpowers/specs/2026-09-30-editor-shell-design.md` 「하단 바」) — 캔버스 칸 아래 한 줄, 좌 · 우 사이드바 사이.
 * 왼쪽은 통지 줄, 오른쪽은 캔버스를 다루는 도구(뷰포트 · 줌)다. 칸이 좁아 통지가 읽을 폭(320)을 못 받으면 도구가 통지 아래 줄의 오른쪽 끝으로
 * 내려간다(`shell.css`의 `.wb-shell-footer`).
 *
 * **그리드의 한 칸이다**(`shell.css`의 `.wb-shell` — `grid-template-areas`의 `footer`). 캔버스와 이 바 사이에 다른 칸(아래에서 펼쳐지는 판)을
 * 끼울 수 있게 영역 이름으로 짓는다 — 칸을 하나 더하는 것은 줄 하나(`grid-template-rows` · `-areas`)를 더하는 일이다.
 *
 * **통지가 여럿이면 위로 자란다 — 잘라 숨기지 않는다.** 줄의 높이가 `auto`라 통지가 늘면 바가 높아지고 캔버스 줄(`minmax(0, 1fr)`)이 그만큼
 * 준다. 통지는 사용자가 읽어야 하는 것이라 스크롤 · 줄임표 뒤에 두지 않는다.
 *
 * **통지의 `role`과 문안은 그 부품 그대로다**(`EditAlert` · `EditWarnings` · `RemoteAlert` · `ThemeAlert` · 권한 바뀜 · 세션) — 여기는 자리만 준다.
 *
 * `<footer>`는 `<main>` · 구역 요소 안이 아니라 셸의 그리드 `div` 바로 아래라 접근성 트리에서 `contentinfo` 랜드마크다 — 이름(«하단 바»)을
 * 붙여 무엇의 바닥인지 말한다.
 */
import type { ReactElement, ReactNode, Ref } from 'react'

export function ShellFooter(props: {
  /** 통지들. 없으면 빈 줄이다 — 자리는 도구가 지킨다. */
  notices: ReactNode
  /** 캔버스 도구(뷰포트 · 줌). */
  tools: ReactNode
  /** 하단 바 상자 — 셸이 판의 최대를 셀 때 잰다(`shell/sidebar-layout.ts` 머리말 «하단 판의 높이»). */
  ref?: Ref<HTMLElement>
}): ReactElement {
  return (
    <footer className="wb-shell-footer" aria-label="하단 바" ref={props.ref}>
      <div className="wb-shell-footer-notices">{props.notices}</div>
      <div className="wb-shell-footer-tools">{props.tools}</div>
    </footer>
  )
}
