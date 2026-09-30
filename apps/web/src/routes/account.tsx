/**
 * **계정 설정** — `/account`. 셸 밖 라우트다(`routes/settings.tsx` 와 같은 자리): 프로젝트가 아니라 로그인한 사람의 것을 다룬다.
 *
 * 절은 셋이다 — **내 정보**(이름 · 이메일 — 읽기만 · 세션 문맥의 `me` 값), **비밀번호 바꾸기**(`account/password-section.tsx`),
 * **API 토큰**(`account/tokens-section.tsx`). 옛 주소 `/tokens` 는 여기로 넘어온다(`app.tsx`). 화면 루트는 설정 페이지와 같은
 * `.wb-shell-settings` 다 — 절 · 칸의 꼴을 함께 쓴다.
 */
import { useId, type ReactElement } from 'react'
import { Link } from 'react-router'
import { PasswordSection } from '../account/password-section'
import { TokensSection } from '../account/tokens-section'
import { useSessionUser } from '../session/session-context'
import { SessionMenu } from '../session/session-menu'

export function AccountRoute(): ReactElement {
  return (
    <main className="wb-shell-settings">
      <div className="wb-shell-project-head">
        <h1 className="wb-shell-project-list-title">계정 설정</h1>
        <SessionMenu />
      </div>
      <p className="wb-shell-settings-nav">
        <Link className="wb-shell-tokens-back" to="/">
          프로젝트 목록
        </Link>
      </p>
      <ProfileSection />
      <PasswordSection />
      <TokensSection />
    </main>
  )
}

/** 내 정보 — 문지기(`routes/require-auth.tsx`)를 지난 화면이라 세션 사용자가 있다. 없으면(그 사이 세션이 바뀌는 중) 칸을 비운다. */
function ProfileSection(): ReactElement {
  const user = useSessionUser()
  const heading = useId()
  return (
    <section className="wb-shell-settings-section" aria-labelledby={heading}>
      <h2 className="wb-shell-settings-section-title" id={heading}>
        내 정보
      </h2>
      <div className="wb-shell-settings-field">
        <span className="wb-shell-settings-label">이름</span>
        <span className="wb-shell-account-value">{user?.name ?? ''}</span>
      </div>
      <div className="wb-shell-settings-field">
        <span className="wb-shell-settings-label">이메일</span>
        <span className="wb-shell-account-value">{user?.email ?? ''}</span>
      </div>
    </section>
  )
}
