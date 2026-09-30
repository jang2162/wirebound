/**
 * **로고 — 프로젝트 목록으로 가는 링크**(spec `docs/superpowers/specs/2026-09-30-editor-shell-design.md` 「셸의 머리」). 에디터 머리의 왼쪽 끝이고
 * 셸 밖 화면(설정 · 계정)의 머리도 같은 것을 쓴다.
 *
 * **접근 이름은 «프로젝트 목록»이다** — 글자 «wirebound»는 갈 곳을 말하지 않는다(링크의 글자가 목적지를 말해야 한다는 계약 — 제목을 링크로
 * 만들지 않는 것과 같은 근거: `routes/editor.tsx` 머리). 그래서 `aria-label`이 이름을 덮고, 아이콘은 `aria-hidden`이다.
 *
 * **`<Link>`다** — 주소가 있는 이동이라 새 탭으로 열 수 있어야 한다. 아이콘은 이 파일 안의 SVG 하나다 — 외부 글꼴 · 아이콘 묶음을 들이지 않는다.
 */
import type { ReactElement } from 'react'
import { Link } from 'react-router'

export function BrandLink(): ReactElement {
  return (
    <Link className="wb-shell-brand" to="/" aria-label="프로젝트 목록">
      {/* 와이어프레임 한 장 — 머리 줄 · 옆 칸 · 본문 칸. 색은 글자색을 따른다(`currentColor`). */}
      <svg className="wb-shell-brand-mark" viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false">
        <rect x="1.5" y="2.5" width="17" height="15" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="M1.5 7h17M7 7v10.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="M10 10.5h5.5M10 13.5h3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      <span className="wb-shell-brand-name">wirebound</span>
    </Link>
  )
}
