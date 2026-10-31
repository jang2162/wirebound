/**
 * **계정 설정** — `/account`. 셸 밖 라우트다(`routes/settings.tsx` 와 같은 자리): 프로젝트가 아니라 로그인한 사람의 것을 다룬다.
 *
 * 절은 셋이다 — **내 정보**(이름 · 이메일 — 읽기만 · 세션 문맥의 `me` 값), **비밀번호 바꾸기**(`account/password-section.tsx`),
 * **API 토큰**(`account/tokens-section.tsx`). 옛 주소 `/tokens` 는 여기로 넘어온다(`app.tsx`). 뼈대(`shell/workspace-layout.tsx`) 안에 서고, 몸은
 * 설정 페이지와 같은 `.wb-shell-settings` 다 — 절(카드) · 칸의 꼴을 함께 쓴다.
 */
import { useId, type ReactElement } from 'react'
import { PasswordSection } from '../account/password-section'
import { TokensSection } from '../account/tokens-section'
import { useSessionUser } from '../session/session-context'
import { WorkspaceLayout } from '../shell/workspace-layout'

export function AccountRoute(): ReactElement {
  return (
    <WorkspaceLayout title="계정 설정">
      <div className="wb-shell-settings">
        <ProfileSection />
        <PasswordSection />
        <TokensSection />
      </div>
    </WorkspaceLayout>
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
      {/* 라벨 | 값 두 칸 줄. 줄 사이는 목록의 `gap`(16px)이 연다 — 칸을 그냥 쌓으면 «이름» 의 값 바로 밑에 «이메일» 라벨이 붙는다. */}
      <dl className="wb-shell-account-profile">
        <div className="wb-shell-account-row">
          <dt className="wb-shell-account-label">이름</dt>
          <dd className="wb-shell-account-value">{user?.name ?? ''}</dd>
        </div>
        <div className="wb-shell-account-row">
          <dt className="wb-shell-account-label">이메일</dt>
          <dd className="wb-shell-account-value">{user?.email ?? ''}</dd>
        </div>
      </dl>
    </section>
  )
}
