/**
 * **하단 바**(정본 `docs/superpowers/specs/2026-08-03-wirebound-design.md` 「설계서 화면 구조」의 «하단 바») — 캔버스 칸 아래 한 줄, 좌 · 우 사이드바
 * 사이. 왼쪽은 통지 줄, 오른쪽은 «컴포넌트»(하단 컴포넌트 목록의 토글)다 — 캔버스를 다루는 도구(뷰포트 · 줌)는 머리에 있다(`routes/editor.tsx`
 * 의 `CanvasTools`). 칸이 좁아 통지가 읽을 폭(320)을 못 받으면 «컴포넌트»가 통지 아래 줄의 오른쪽 끝으로 내려간다(`shell.css`의 `.wb-shell-footer`).
 *
 * **그리드의 한 칸이다**(`shell.css`의 `.wb-shell` — `grid-template-areas`의 `footer`). 캔버스와 이 바 사이에 다른 칸(아래에서 펼쳐지는 판)을
 * 끼울 수 있게 영역 이름으로 짓는다 — 칸을 하나 더하는 것은 줄 하나(`grid-template-rows` · `-areas`)를 더하는 일이다.
 *
 * **통지가 여럿이면 위로 자란다 — 잘라 숨기지 않는다.** 줄의 높이가 `auto`라 통지가 늘면 바가 높아지고 캔버스 줄(`minmax(0, 1fr)`)이 그만큼
 * 준다. 통지는 사용자가 읽어야 하는 것이라 통지 무리에는 `max-height` · 줄임표를 안 건다. **바가 창에 안 들어가는 칸**(판이 바닥까지 줄어도 바가 창보다
 * 높다)에서만 바 자체가 세로로 스크롤되고(`shell.css` 의 `.wb-shell-footer`), 새 통지가 서면 그 통지가 보이는 자리로 바가 스크롤된다 — 아래 `useRevealNewNotices`.
 *
 * **통지의 `role`과 문안은 그 부품 그대로다**(`EditAlert` · `EditWarnings` · `RemoteAlert` · `ThemeAlert` · 권한 바뀜 · 세션) — 여기는 자리만 준다.
 *
 * `<footer>`는 `<main>` · 구역 요소 안이 아니라 셸의 그리드 `div` 바로 아래라 접근성 트리에서 `contentinfo` 랜드마크다 — 이름(«하단 바»)을
 * 붙여 무엇의 바닥인지 말한다.
 */
import { useEffect, useRef, type ReactElement, type ReactNode, type Ref } from 'react'

/**
 * **새 통지는 보이는 자리로 스크롤한다.** 바가 스크롤되는 칸에서 새 통지(마지막에 붙는다)가 스크롤 밖에 서면 말없는 실패다. 통지는 제 부품이 그려 이 상자의 자식으로
 * 들어오므로 DOM 변화로 잡는다 — 들어온 요소 가운데 `role="alert"` 인 것(없으면 마지막 요소)을 `block: 'nearest'` 로 보인다(이미 보이면 아무것도 안 움직인다).
 */
function useRevealNewNotices(notices: { current: HTMLElement | null }): void {
  useEffect(() => {
    const box = notices.current
    if (box === null || typeof MutationObserver !== 'function') return
    const observer = new MutationObserver((records) => {
      const added: Element[] = []
      for (const record of records) for (const node of record.addedNodes) if (node.nodeType === 1) added.push(node as Element)
      const target =
        added.find((el) => el.matches('[role="alert"]') || el.querySelector('[role="alert"]') !== null) ?? added[added.length - 1]
      // jsdom 에는 `scrollIntoView` 가 없다.
      target?.scrollIntoView?.({ block: 'nearest' })
    })
    observer.observe(box, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [notices])
}

export function ShellFooter(props: {
  /** 통지들. 없으면 빈 줄이다 — 높이는 셸 CSS 가 지킨다(`.wb-shell-footer` 의 `min-height`). */
  notices: ReactNode
  /** 오른쪽 도구 — «컴포넌트»(편집 모드 · editor 이상일 때만 — 없으면 통지만이고 높이는 그대로다). */
  tools: ReactNode
  /** 하단 바 상자 — 셸이 판의 최대를 셀 때 잰다(`shell/sidebar-layout.ts` 머리말 «하단 판의 높이»). */
  ref?: Ref<HTMLElement>
}): ReactElement {
  const noticesRef = useRef<HTMLDivElement | null>(null)
  useRevealNewNotices(noticesRef)
  return (
    <footer className="wb-shell-footer" aria-label="하단 바" ref={props.ref}>
      <div className="wb-shell-footer-notices" ref={noticesRef}>
        {props.notices}
      </div>
      <div className="wb-shell-footer-tools">{props.tools}</div>
    </footer>
  )
}
