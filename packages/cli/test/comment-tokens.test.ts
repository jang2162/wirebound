/**
 * `wireb page get` 의 코멘트 토큰 — 사람 출력은 풀린 글만(날 id 없음), `--json` 은 `comments[].resolved` 에 대상을 괄호로 싣는다. 남의 프로젝트 id 를
 * 든 토큰은 그 이름을 안 낸다 — 풀기는 그 프로젝트의 payload 로만 한다(Review Focus 2).
 */
import { describe, expect, it } from 'vitest'
import { EXIT } from '../src/exit'
import { run } from '../src/run'
import { createFakeIo, stub, type FakeIo } from './fake-io'
import { PAGE_DETAIL, PAGE_LIST, snapshotPayload } from './snapshot-fixture'

const SERVER = 'https://wb.example.com'
const PROJECT = 'prj_tk'
const FOREIGN = '99999999-9999-4999-8999-999999999999'

const BODY = `보세요 [옛](wb:page/${PAGE_DETAIL}) · [옛 번호](wb:comment/${PAGE_LIST}/list) · [남의 것](wb:page/${FOREIGN})\n둘째 줄`

function 준비(): FakeIo {
  const io = createFakeIo({
    cwd: '/repo',
    files: {
      '/repo/.wirebound.json': JSON.stringify({ server: SERVER, projectId: PROJECT }),
      '/home/tester/.wirebound/credentials.json': JSON.stringify({
        version: 1,
        credentials: [{ server: SERVER, projectId: PROJECT, token: 'RAW-TOKEN-tk' }],
      }),
    },
  })
  const payload = snapshotPayload()
  payload.comments = payload.comments.map((comment) => ({ ...comment, body: BODY }))
  stub(io, 'GET', `/api/projects/${PROJECT}/snapshot`, { status: 200, body: payload })
  return io
}

describe('wireb page get — 코멘트 토큰', () => {
  it('사람 출력은 풀린 글만 — 날 id · 토큰 원문이 없다', async () => {
    const io = 준비()
    expect(await run(['page', 'get', '관리자/회원/목록'], io), io.stderr.join('\n')).toBe(EXIT.ok)
    const said = io.stdout.join('\n')
    expect(said).toContain('    보세요 상세 · #2 · 남의 것 (찾을 수 없음)\n    둘째 줄')
    for (const raw of ['wb:', PAGE_DETAIL, FOREIGN]) expect(said).not.toContain(raw)
  })

  it('--json 은 원문 · 풀린 글 · 대상을 함께 싣는다', async () => {
    const io = 준비()
    expect(await run(['page', 'get', '관리자/회원/목록', '--json'], io), io.stderr.join('\n')).toBe(EXIT.ok)
    const view = JSON.parse(io.stdout.join('\n')) as { comments: { body: string; text: string; resolved: string }[] }
    expect(view.comments[0]).toMatchObject({
      body: BODY,
      text: '보세요 상세 · #2 · 남의 것 (찾을 수 없음)\n둘째 줄',
      resolved: `보세요 상세 (page:${PAGE_DETAIL}) · #2 (comment:${PAGE_LIST}/list) · 남의 것 (찾을 수 없음)\n둘째 줄`,
    })
  })
})
