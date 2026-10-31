/**
 * **관리자 › 기록**(`src/admin/audit-section.tsx`) — jsdom · 가짜 서버(`./admin-server.ts`). 받은 차례 그대로(최신이 위) · 행동 · 사람 거름이
 * 질의로 · «더 보기» 가 `next` 로 · 서버 명령 행위자 · 행동마다 한 줄(13 종 표)을 잰다.
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { App } from '../../src/app'
import { auditLine, AUDIT_ACTIONS, CLI_ACTOR, NO_ENTRIES } from '../../src/admin/audit-section'
import type { AuditAction, AuditEntry } from '../../src/api/types'
import { renderWithProviders } from '../helpers'
import { adminServer, adminUser, ME, type AdminServer } from './admin-server'

const KIM = { id: 'u-kim', name: '김', email: 'kim@example.com' }

function entry(id: string, action: AuditAction, extra: Partial<AuditEntry> = {}): AuditEntry {
  return {
    id,
    at: '2026-11-01T03:04:00.000Z',
    action,
    actor: { kind: 'user', id: ME.id, name: ME.name },
    targetUser: null,
    project: null,
    invite: null,
    detail: {},
    ...extra,
  }
}

async function open(at: AdminServer): Promise<void> {
  renderWithProviders(<App />, { client: at.client, route: '/admin/audit' })
  await screen.findByRole('heading', { name: '기록' })
}

function lines(): string[][] {
  return within(screen.getByRole('table', { name: '기록' }))
    .getAllByRole('row')
    .slice(1)
    .map((tr) =>
      within(tr)
        .getAllByRole('cell')
        .slice(1)
        .map((td) => td.textContent ?? ''),
    )
}

/** 행동 13 종의 한 줄 — 서버가 행동 때 적는 `detail` 의 키(`apps/api/src/routes/admin-*.ts` · `repos/users.ts`)로 짓는다. */
const LINES: [AuditEntry, string][] = [
  [
    entry('1', 'invite.create', { invite: { id: 'i', name: '디자인팀' }, detail: { kind: 'multi', expiresInDays: 7 } }),
    '초대 링크 만듦 — «디자인팀» · 여러 명 · 7일',
  ],
  [entry('2', 'invite.revoke', { invite: { id: 'i', name: '디자인팀' } }), '초대 링크 거둠 — «디자인팀»'],
  [
    entry('3', 'invite.signup', { invite: { id: 'i', name: '디자인팀' }, targetUser: KIM }),
    '초대 링크로 가입 — «디자인팀» · 김(kim@example.com)',
  ],
  [entry('4', 'reset.create', { targetUser: KIM }), '재설정 링크 만듦 — 김(kim@example.com)'],
  [entry('5', 'reset.use', { targetUser: KIM }), '재설정 링크로 비밀번호 바꿈 — 김(kim@example.com)'],
  [
    entry('6', 'user.deactivate', { targetUser: KIM, detail: { revokedLinks: 2, wasAdmin: true } }),
    '비활성화 — 김(kim@example.com) · 거둔 링크 2개 · 관리자였음',
  ],
  [entry('7', 'user.activate', { targetUser: KIM }), '다시 활성화 — 김(kim@example.com)'],
  [entry('8', 'admin.grant', { targetUser: KIM }), '관리자로 지정 — 김(kim@example.com)'],
  [entry('9', 'admin.revoke', { targetUser: KIM, detail: { revokedLinks: 0 } }), '관리자 해제 — 김(kim@example.com) · 거둔 링크 0개'],
  [entry('10', 'project.owner', { targetUser: KIM, project: { id: 'p', name: '콘솔' } }), 'owner 넘김 — «콘솔» → 김(kim@example.com)'],
  [entry('11', 'theme.upload', { detail: { themeId: 'acme', version: '1.0.0', name: 'Acme' } }), '테마 올림 — acme@1.0.0'],
  [entry('12', 'theme.hide', { detail: { themeId: 'acme', version: '1.0.0' } }), '테마 판 숨김 — acme@1.0.0'],
  [entry('13', 'theme.unhide', { detail: { themeId: 'acme', version: '1.0.0' } }), '테마 판 되살림 — acme@1.0.0'],
]

describe('관리자 › 기록 — 행동마다 한 줄', () => {
  it('13 종 전부 표에 있다(분모는 화면의 행동 목록)', () => {
    expect(LINES.map(([e]) => e.action).sort()).toEqual(Object.keys(AUDIT_ACTIONS).sort())
    expect(Object.keys(AUDIT_ACTIONS)).toHaveLength(13)
  })

  it.each(LINES.map(([e, line]) => [e.action, e, line] as const))('%s', (_, e, line) => {
    expect(auditLine(e)).toBe(line)
  })
})

describe('관리자 › 기록 — 화면', () => {
  it('받은 차례 그대로(최신이 위) · 서버 명령 행위자는 «서버 명령»', async () => {
    const at = adminServer()
    at.audit.pages = [
      {
        entries: [
          entry('b', 'admin.grant', { at: '2026-11-01T05:00:00.000Z', targetUser: KIM }),
          entry('a', 'admin.revoke', { at: '2026-11-01T04:00:00.000Z', targetUser: KIM, actor: { kind: 'cli' } }),
        ],
        next: null,
      },
    ]
    await open(at)
    await screen.findByRole('table', { name: '기록' })
    expect(lines()).toEqual([
      [ME.name, '관리자로 지정 — 김(kim@example.com)'],
      [CLI_ACTOR, '관리자 해제 — 김(kim@example.com) · 거둔 링크 0개'],
    ])
    expect(screen.queryByRole('button', { name: '더 보기' })).toBeNull()
  })

  it('«더 보기» 는 앞 쪽의 `next` 를 `before` 로 싣고 줄을 뒤에 잇는다', async () => {
    const at = adminServer()
    at.audit.pages = [
      { entries: [entry('c', 'theme.upload', { detail: { themeId: 'x', version: '2' } })], next: '2026-11-01T03:04:00.123456Z' },
      { entries: [entry('b', 'theme.hide', { detail: { themeId: 'x', version: '1' } })], next: null },
    ]
    await open(at)
    await screen.findByRole('table', { name: '기록' })
    fireEvent.click(screen.getByRole('button', { name: '더 보기' }))
    await waitFor(() => expect(lines().map((l) => l[1])).toEqual(['테마 올림 — x@2', '테마 판 숨김 — x@1']))
    expect(at.calls.listAudit).toEqual([[{}], [{ before: '2026-11-01T03:04:00.123456Z' }]])
    expect(screen.queryByRole('button', { name: '더 보기' })).toBeNull()
  })

  it('행동 · 사람 거름이 질의로 가고 첫 쪽부터 다시 받는다', async () => {
    const at = adminServer({ users: [adminUser(ME.id, ME.name, { isInstanceAdmin: true }), adminUser('u-kim', '김')] })
    await open(at)
    await screen.findByText(NO_ENTRIES)
    fireEvent.change(screen.getByLabelText('행동'), { target: { value: 'user.deactivate' } })
    await waitFor(() => expect(at.calls.listAudit.at(-1)).toEqual([{ action: 'user.deactivate' }]))
    const actor = screen.getByLabelText('사람') as HTMLSelectElement
    await waitFor(() => expect(actor.options).toHaveLength(3))
    fireEvent.change(actor, { target: { value: 'u-kim' } })
    await waitFor(() => expect(at.calls.listAudit.at(-1)).toEqual([{ action: 'user.deactivate', actorId: 'u-kim' }]))
  })
})
