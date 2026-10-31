// @vitest-environment node
/**
 * **RV-AD — 관리자 칸의 소스 성질**(리뷰 보고 `docs/superpowers/plans/2026-11-01-rv-ad-report.md`). 지금 참인 성질을 잠근다 — 고치기 전에도 초록이다.
 *
 * - 기록 칸의 행동 표(`admin/audit-section.tsx` 의 `AUDIT_ACTIONS`)가 서버의 행동 목록(`apps/api/src/repos/admin-audit.ts` 의 `AUDIT_ACTIONS`)과
 *   같다 — 서버 목록은 실행 때 경로로 싣는다(정적 `import` 는 그 파일을 이 앱의 빌드에 끌어들인다 — `AGENTS.md` «한 앱의 케이스가 다른 앱의 소스를
 *   쓰려면»). 이 자가 없으면 서버에 행동이 늘 때 화면은 그 줄을 행동 이름 그대로(`auditLine` 의 «모르는 행동») 그리고 거름에서는 못 고른다.
 * - 사람이 지은 글(이름 · 이메일 · 링크 이름 · 프로젝트 이름)을 그리는 관리자 칸 · 링크 화면에 `dangerouslySetInnerHTML` 이 0 이다.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { stripComments } from '@wirebound/test-support'
import { AUDIT_ACTIONS } from '../src/admin/audit-section'

const SERVER_AUDIT = fileURLToPath(new URL('../../api/src/repos/admin-audit.ts', import.meta.url))
const ADMIN_DIR = fileURLToPath(new URL('../src/admin/', import.meta.url))
const LINK_ROUTES = ['../src/routes/invite.tsx', '../src/routes/reset.tsx'].map((path) => fileURLToPath(new URL(path, import.meta.url)))

describe('RV-AD — 소스 성질', () => {
  it('기록 칸의 행동 표가 서버의 행동 목록과 같은 집합 · 같은 차례다', async () => {
    const server = (await import(/* @vite-ignore */ SERVER_AUDIT)) as { AUDIT_ACTIONS: readonly string[] }
    // 카나리아 — 서버 목록을 실제로 읽었다.
    expect(server.AUDIT_ACTIONS.length).toBeGreaterThan(0)
    expect(Object.keys(AUDIT_ACTIONS)).toEqual([...server.AUDIT_ACTIONS])
  })

  it('관리자 칸 · 링크 화면 둘에 `dangerouslySetInnerHTML` 이 0 이다', () => {
    const files = [
      ...readdirSync(ADMIN_DIR)
        .filter((name) => name.endsWith('.tsx'))
        .map((name) => `${ADMIN_DIR}${name}`),
      ...LINK_ROUTES,
    ]
    // 카나리아 — `src/admin/*.tsx` 여섯(틀 · 링크 상자 · 칸 넷) + 링크 화면 둘을 읽었다.
    expect(files.length).toBeGreaterThanOrEqual(8)
    const hits = files.filter((file) => /dangerouslySetInnerHTML|innerHTML\s*=/.test(stripComments(readFileSync(file, 'utf8'), file)))
    expect(hits).toEqual([])
  })
})
