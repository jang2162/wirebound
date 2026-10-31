/**
 * **사람 글에 숨는 글자**(`src/auth/hidden-chars.ts`) — 이름을 받는 입구마다 400 · 표 하나를 두 자리(이름 검사 · 잠금 풀기 출력)가 함께 쓴다.
 * 리뷰 `docs/superpowers/plans/2026-11-01-rv-ad-report.md` M1 · 대응 `2026-11-01-fx-ad-report.md`.
 *
 * 입구(`DisplayName` · 링크 이름을 지나는 자리 — `git grep -n "DisplayName\|admin-invites" apps/api/src`): 초대 링크 가입 · 초대 링크 만들기 ·
 * 시딩의 `SEED_USER_NAME` · 시딩 함수(픽스처). 계정 이름을 바꾸는 입구는 없다(계정 화면은 이름을 보이기만 한다).
 *
 * 숨는 글자는 `String.fromCharCode` 로 짓는다 — 파일에 날 글자가 안 들게(`AGENTS.md` «숨은 글자를 이스케이프로 쓴 파일은 …»).
 */
import { describe, expect, it } from 'vitest'
import { DisplayName } from '../src/auth/credentials'
import { HIDDEN_CHAR_IN_NAME, hasHiddenChar } from '../src/auth/hidden-chars'
import { printable } from '../src/auth/unlock-login'
import { readSeedUserEnv, SeedUserError, seedUser } from '../src/db/seed-user'
import { admin, adminOf, makeInvite } from './accounts-fixtures'
import { withApi } from './helpers'

const TEST_SCRYPT_N = 1024
const ch = (code: number): string => String.fromCharCode(code)

/** 갈래마다 하나 이상 — 제어 · 방향 제어 · 폭 없는 글자 · 줄 구분자. */
const HIDDEN: readonly [string, number][] = [
  ['C0 BEL', 0x07],
  ['DEL', 0x7f],
  ['C1 NEL', 0x85],
  ['ALM', 0x061c],
  ['ZWSP', 0x200b],
  ['ZWNJ', 0x200c],
  ['ZWJ', 0x200d],
  ['LRM', 0x200e],
  ['RLM', 0x200f],
  ['LS', 0x2028],
  ['PS', 0x2029],
  ['LRE', 0x202a],
  ['RLO', 0x202e],
  ['WJ', 0x2060],
  ['LRI', 0x2066],
  ['PDI', 0x2069],
  ['BOM', 0xfeff],
]

/** 받아야 하는 이름 — 오른쪽에서 쓰는 글자 자체 · 이모지 · 가운뎃점은 숨는 글자가 아니다. */
const VISIBLE = ['박퇴사', 'Bob Kim', '山田 太郎', 'محمد', '팀 👍', '가 · 나', 'a-b_c.d']

describe('표', () => {
  it('갈래마다 숨는 글자로 본다 · 보이는 이름은 아니다', () => {
    expect(HIDDEN.filter(([, code]) => !hasHiddenChar(`가${ch(code)}나`)).map(([label]) => label)).toEqual([])
    expect(VISIBLE.filter((name) => hasHiddenChar(name))).toEqual([])
  })

  it('이름 검사와 잠금 풀기 출력이 BMP 의 모든 글자에서 같은 글자를 본다(표 하나)', () => {
    const differ: string[] = []
    let hidden = 0
    for (let code = 0; code <= 0xffff; code += 1) {
      if (code >= 0xd800 && code <= 0xdfff) continue
      const c = ch(code)
      const escaped = printable(c) !== c
      const refused = !DisplayName.safeParse(`가${c}`).success
      if (escaped) hidden += 1
      if (escaped !== refused) differ.push(code.toString(16))
    }
    // 카나리아 — 표가 비지 않았다(C0 32 · DEL 1 · C1 32 · ALM 1 · 200B–200F 5 · 2028–202E 7 · 2060–2064 5 · 2066–2069 4 · BOM 1).
    expect({ differ, hidden }).toEqual({ differ: [], hidden: 88 })
  })
})

describe('입구마다 400', () => {
  it('초대 링크 가입 — 이름에 숨는 글자가 들면 400 · 계정이 안 생긴다 · 보이는 이름은 201', async () => {
    await withApi(async (ctx) => {
      const me = await adminOf(ctx)
      const { token } = await makeInvite(ctx, me.cookie, { kind: 'multi' })
      const join = (email: string, name: string) =>
        ctx.app.inject({ method: 'POST', url: `/api/auth/invites/${token}/signup`, payload: { email, name, password: 'password1234' } })
      const refused: Record<string, unknown> = {}
      for (const [label, code] of HIDDEN) {
        const res = await join(`hidden-${code}@example.com`, `밥${ch(code)}`)
        refused[label] = res.statusCode === 400 && res.body.includes(HIDDEN_CHAR_IN_NAME) ? 400 : `${res.statusCode} ${res.body}`
      }
      expect(Object.values(refused).filter((value) => value !== 400)).toEqual([])
      const rows = await ctx.db.selectFrom('users').select('email').where('email', 'like', 'hidden-%').execute()
      expect(rows).toEqual([])
      // 판 카나리아 — 같은 링크 · 같은 꼴의 보이는 이름은 가입된다.
      expect((await join('visible@example.com', 'محمد 박')).statusCode).toBe(201)
    })
  })

  it('초대 링크 만들기 — 링크 이름에 숨는 글자가 들면 400(가운데 — 앞뒤 공백 걷기와 무관) · 보이는 이름은 201', async () => {
    await withApi(async (ctx) => {
      const me = await adminOf(ctx)
      const refused: Record<string, unknown> = {}
      for (const [label, code] of HIDDEN) {
        const res = await admin(ctx, me.cookie, 'POST', '/invites', { name: `팀${ch(code)}원`, kind: 'single' })
        refused[label] = res.statusCode === 400 && res.body.includes(HIDDEN_CHAR_IN_NAME) ? 400 : `${res.statusCode} ${res.body}`
      }
      expect(Object.values(refused).filter((value) => value !== 400)).toEqual([])
      expect((await ctx.db.selectFrom('invites').select('id').execute()).length).toBe(0)
      expect((await admin(ctx, me.cookie, 'POST', '/invites', { name: '팀 👍 원', kind: 'single' })).statusCode).toBe(201)
    })
  })

  it('시딩 — `SEED_USER_NAME` 에 숨는 글자가 들면 죽는다 · 보이는 이름은 받는다', () => {
    const env = (name: string) => ({ SEED_USER_EMAIL: 'a@example.com', SEED_USER_NAME: name, SEED_USER_PASSWORD: 'password1234' })
    const survived = HIDDEN.filter(([, code]) => {
      try {
        readSeedUserEnv(env(`관리${ch(code)}자`))
        return true
      } catch (error) {
        return !(error instanceof SeedUserError)
      }
    }).map(([label]) => label)
    expect(survived).toEqual([])
    expect(readSeedUserEnv(env('관리자'))?.name).toBe('관리자')
  })

  it('시딩 함수(환경변수를 안 지나는 호출자) — 숨는 글자가 든 이름은 던지고 행을 안 남긴다', async () => {
    await withApi(async ({ db }) => {
      await expect(
        seedUser(db, { email: 'a@example.com', name: `박${ch(0x202e)}퇴사`, password: 'password1234' }, TEST_SCRYPT_N),
      ).rejects.toBeInstanceOf(SeedUserError)
      expect(await db.selectFrom('users').selectAll().execute()).toHaveLength(0)
    })
  })
})
