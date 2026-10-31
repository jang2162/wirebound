/**
 * **새 링크 한 번 보이기** — 초대 링크 만들기 · 재설정 링크 만들기의 응답에만 실린 원문으로 지은 주소를 보이고 «복사» 를 준다
 * (설계 `docs/superpowers/specs/2026-10-31-workspace-admin-design.md` «링크 원문»).
 *
 * **원문은 이 부품의 props 에만 산다** — 서버는 해시만 두므로 이 화면을 떠나면 다시 볼 수 없다(문장이 그렇게 말한다). 그래서 원문을
 * `localStorage` · 주소 · 콘솔 어디에도 남기지 않는다 — 남기면 화면을 떠난 뒤에도 그 기계에 원문이 산다. 닫으면 사라진다.
 *
 * **복사는 클립보드 API 가 먼저다.** 안전하지 않은 출처(`http://` 사내 주소 — 로컬 호스트 밖)에서는 `navigator.clipboard` 가 없어, 칸을 골라
 * `execCommand('copy')` 로 한 번 더 해 본다. 둘 다 안 되면 칸이 골라진 채 «직접 복사하세요» 라고 말한다.
 */
import { useId, useRef, useState, type ReactElement } from 'react'
import { shellIcon } from '../shell/icons'
import { When } from './admin-screen'

export const LINK_ONCE = '이 링크는 지금만 보입니다 — 이 화면을 떠나면 다시 볼 수 없습니다. 잃었으면 새로 만드세요.'
export const COPIED = '복사했습니다'
export const COPY_FAILED = '복사하지 못했습니다 — 칸의 주소를 직접 복사하세요'

export function LinkReveal(props: { url: string; expiresAt: string; onClose: () => void; title?: string }): ReactElement {
  const field = useRef<HTMLInputElement>(null)
  const [copied, setCopied] = useState<'done' | 'failed' | null>(null)
  const heading = useId()
  const fieldId = useId()

  async function copy(): Promise<void> {
    try {
      if (navigator.clipboard === undefined) throw new Error('no clipboard')
      await navigator.clipboard.writeText(props.url)
      setCopied('done')
    } catch {
      field.current?.select()
      setCopied(document.execCommand?.('copy') === true ? 'done' : 'failed')
    }
  }

  return (
    <section className="wb-shell-admin-reveal" aria-labelledby={heading}>
      <h2 className="wb-shell-admin-reveal-title" id={heading}>
        {props.title ?? '새 링크'}
      </h2>
      <p className="wb-shell-admin-reveal-once">{LINK_ONCE}</p>
      <div className="wb-shell-admin-reveal-row">
        <label className="wb-shell-settings-label" htmlFor={fieldId}>
          링크
        </label>
        <input
          ref={field}
          id={fieldId}
          className="wb-shell-settings-input wb-shell-admin-reveal-url"
          type="text"
          readOnly
          value={props.url}
          onFocus={(event) => event.currentTarget.select()}
        />
        <button className="wb-shell-project-submit" type="button" onClick={() => void copy()}>
          {shellIcon('copyLink', 14, 'wb-shell-icon-lead')}
          복사
        </button>
        <button className="wb-shell-project-action" type="button" onClick={props.onClose}>
          닫기
        </button>
      </div>
      <p className="wb-shell-admin-reveal-meta">
        {'만료 '}
        <When iso={props.expiresAt} />
      </p>
      {copied === 'done' && (
        <p className="wb-shell-project-notice" role="status">
          {COPIED}
        </p>
      )}
      {copied === 'failed' && (
        <p className="wb-shell-project-alert" role="alert">
          {COPY_FAILED}
        </p>
      )}
    </section>
  )
}

/** 링크 주소 — 화면이 짓는다(계획 «API 계약»). 원문은 주소 조각이라 인코딩한다(지금 원문은 base64url 이라 그대로다). */
export function linkUrl(kind: 'invite' | 'reset', token: string): string {
  return `${window.location.origin}/${kind}/${encodeURIComponent(token)}`
}
