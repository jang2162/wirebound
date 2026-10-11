/**
 * **사람이 읽는 출력이 터미널을 제어하지 못한다** — `wireb page get` 은 라벨 · 제목 · 설명 · 코멘트 본문을 그대로 찍는데, 그 글은 설계서를 고치는
 * 누구나 넣을 수 있다. ESC(`\u001b[2J` 같은 열 · 화면 제어) · C1(`\u009b` 는 CSI) · DEL · 방향 제어 글자가 터미널에서 일을 한다.
 *
 * 재는 곳은 **진짜 `process.stdout.write` 로 나가는 바이트**다 — 가짜 `Io` 의 `out` 은 이 거름 앞이라 늘 날 글자를 본다.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createNodeIo } from '../src/node-io'
import { run } from '../src/run'
import { createFakeIo, stub } from './fake-io'
import { MENU_MEMBER, page, snapshotPayload } from './snapshot-fixture'

const SERVER = 'https://wb.example.com'
const PROJECT = 'prj_a1b2'

const ESC = '\u001b'
const CSI_C1 = '\u009b'
const RLO = '\u202e'
/** `\n` · `\t` 만 빼고 터미널이 일을 시킬 수 있는 글자 — C0 · DEL · C1 · 줄 · 문단 구분 · 방향 제어. */
// eslint-disable-next-line no-control-regex
const DANGEROUS = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u2028\u2029\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u

afterEach(() => {
  vi.restoreAllMocks()
})

/** 진짜 `createNodeIo` 의 `out` · `err` 로 나가는 것 — 그 밖(파일 · 네트워크)은 가짜 `Io` 의 것이다. */
async function pageGet(args: string[], payload = hostilePayload()): Promise<{ stdout: string; stderr: string; code: number }> {
  const fake = createFakeIo({
    cwd: '/repo',
    files: {
      '/repo/.wirebound.json': JSON.stringify({ server: SERVER, projectId: PROJECT }),
      '/home/tester/.wirebound/credentials.json': JSON.stringify({
        version: 1,
        credentials: [{ server: SERVER, projectId: PROJECT, token: 'RAW-TOKEN' }],
      }),
    },
  })
  stub(fake, 'GET', `/api/projects/${PROJECT}/snapshot`, { status: 200, body: payload })
  const real = createNodeIo()
  const out: string[] = []
  const err: string[] = []
  vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: string | Uint8Array) => (out.push(String(chunk)), true)) as never)
  vi.spyOn(process.stderr, 'write').mockImplementation(((chunk: string | Uint8Array) => (err.push(String(chunk)), true)) as never)
  const code = await run(args, { ...fake, out: real.out, err: real.err })
  return { stdout: out.join(''), stderr: err.join(''), code }
}

/** 라벨 · 제목 · 설명 · 코멘트 본문마다 제어 글자를 하나씩 심은 설계서. */
function hostilePayload() {
  const payload = snapshotPayload()
  const hostile = page(
    '20000000-0000-4000-8000-0000000000aa',
    MENU_MEMBER,
    `제목${ESC}[2J`,
    5,
    {
      version: 1,
      root: {
        id: 'root',
        type: 'Page',
        children: [
          { id: 'btn', type: 'Button', props: { label: `저장${CSI_C1}31m` } },
          { id: 'card', type: 'Card', props: { title: `카드${RLO}반전` } },
        ],
      },
    },
    `설명${ESC}]0;창제목\u0007`,
  )
  payload.pages.push(hostile)
  payload.comments.push({
    id: '50000000-0000-4000-8000-0000000000aa',
    pageId: hostile.id,
    nodeId: 'btn',
    body: `본문${CSI_C1}2J\r덮어쓰기`,
    authorId: '60000000-0000-4000-8000-000000000001',
    authorName: '장병현',
    createdAt: '2026-08-16T01:00:00.000Z',
    updatedAt: '2026-08-16T01:00:00.000Z',
  })
  return payload
}

const PATH = `관리자/회원/제목${ESC}[2J`

describe('wireb page get — 터미널로 나가는 바이트', () => {
  it('사람이 읽는 판에 터미널 제어 글자가 없다 — 보이는 이스케이프로 바뀐다', async () => {
    const { stdout, stderr, code } = await pageGet(['page', 'get', PATH])
    expect({ code, stderr }).toEqual({ code: 0, stderr: '' })
    // 판 카나리아 — 심은 글이 출력까지 왔다(거름이 글을 통째로 지운 판은 아래 단언이 늘 참이다).
    expect(stdout).toContain('저장')
    expect(stdout).toContain('본문')
    expect(stdout).toContain('설명')
    expect(DANGEROUS.test(stdout.replace(/\n/g, '')), JSON.stringify(stdout)).toBe(false)
    expect(stdout).toContain(`저장\\u009b31m`)
    expect(stdout).toContain('제목\\u001b[2J')
  })

  it('오류 · 안내(stderr)도 같다 — 못 찾은 경로는 사람이 친 글을 되비춘다', async () => {
    const { stdout, stderr, code } = await pageGet(['page', 'get', `없는\u001b[2J\u009b31m경로`])
    expect(code).toBe(1)
    expect(stdout).toBe('')
    expect(stderr).toContain('그 경로의 페이지가 없습니다: 없는\\u001b[2J\\u009b31m경로')
    expect(DANGEROUS.test(stderr.replace(/\n/g, '')), JSON.stringify(stderr)).toBe(false)
  })

  it('--json 은 같은 값이다 — 터미널 제어 글자가 이스케이프로 나가고 읽으면 원래 값이다', async () => {
    const { stdout, code } = await pageGet(['page', 'get', PATH, '--json'])
    expect(code).toBe(0)
    expect(DANGEROUS.test(stdout.replace(/\n/g, '')), JSON.stringify(stdout)).toBe(false)
    const view = JSON.parse(stdout)
    expect(view.title).toBe(`제목${ESC}[2J`)
    expect(JSON.stringify(view)).toContain(CSI_C1)
  })

  it('보통 글은 바이트가 그대로다 — 줄바꿈 · 탭 · 한글 · 이모지', async () => {
    const real = createNodeIo()
    const out: string[] = []
    vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: string | Uint8Array) => (out.push(String(chunk)), true)) as never)
    real.out('가나다\t👍🏽 abc')
    real.out('둘째 줄')
    expect(out.join('')).toBe('가나다\t👍🏽 abc\n둘째 줄\n')
  })
})
