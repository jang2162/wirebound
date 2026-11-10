/**
 * `wireb codes …` 와 `page get` 의 공통코드 — 표 · 사용 수 출력, 만들기 · 고치기의 갈래(있으면 PATCH · 없으면 POST), 지우기, 권한 없는 토큰의
 * 거절(서버 문장 · 코드 3), `page get` 이 묶인 노드를 표의 이름으로 부르고 `nodes[].code.resolved` 를 싣는 것, 터미널로 나가는 이름이 거름
 * (`terminalSafe`)을 지나는 것.
 */
import { describe, expect, it } from 'vitest'
import type { SnapshotPayload } from '@wirebound/themes'
import { EXIT } from '../src/exit'
import { run } from '../src/run'
import { terminalSafe } from '../src/terminal-safe'
import { createFakeIo, stub, type FakeIo } from './fake-io'
import { MENU_MEMBER, PAGE_LIST, page, snapshotPayload } from './snapshot-fixture'

const SERVER = 'https://wb.example.com'
const PROJECT = 'prj_a1b2'
const TOKEN = 'RAW-TOKEN-ZZQ7-Vd9k2sLxPq'
const CODES = `/api/projects/${PROJECT}/codes`

const GROUPS = [
  {
    key: 'KIND',
    name: '구분',
    items: [
      { value: 'A', name: '새 이름', active: true },
      { value: 'B', name: '옛 것', active: false },
    ],
  },
]

function 준비(groups: unknown[] = GROUPS, payload: SnapshotPayload = snapshotPayload()): FakeIo {
  const io = createFakeIo({
    cwd: '/repo',
    files: {
      '/repo/.wirebound.json': JSON.stringify({ server: SERVER, projectId: PROJECT }),
      '/home/tester/.wirebound/credentials.json': JSON.stringify({
        version: 1,
        credentials: [{ server: SERVER, projectId: PROJECT, token: TOKEN }],
      }),
    },
  })
  stub(io, 'GET', CODES, { status: 200, body: { groups } })
  stub(io, 'GET', `${CODES}/usage-counts`, { status: 200, body: { counts: { KIND: { group: 3, items: { A: 2 } } } } })
  stub(io, 'GET', `/api/projects/${PROJECT}/snapshot`, { status: 200, body: payload })
  return io
}

/** 보낸 쓰기(GET 밖) — `METHOD 경로 본문`. */
const writes = (io: FakeIo): string[] =>
  io.requests
    .filter((request) => request.method !== 'GET')
    .map((request) => `${request.method} ${request.url.replace(SERVER, '')}${request.body === undefined ? '' : ` ${String(request.body)}`}`)

describe('wireb codes', () => {
  it('list — 그룹 · 항목 · 사용 안 함 · 쓰는 노드 수', async () => {
    const io = 준비()
    expect(await run(['codes', 'list'], io)).toBe(EXIT.ok)
    expect(io.stdout).toEqual([
      '구분 (KIND) · 항목 2개 · 쓰는 노드 3개',
      '  A  새 이름 · 쓰는 노드 2개',
      '  B  옛 것 (사용 안 함) · 쓰는 노드 0개',
    ])
  })

  it('usage — 그 항목을 쓰는 곳', async () => {
    const io = 준비()
    stub(io, 'GET', `${CODES}/usage?group=KIND&item=A`, {
      status: 200,
      body: { usage: [{ kind: 'page', id: PAGE_LIST, title: '목록', nodes: [{ nodeId: 'n1', name: '새 이름 칩' }] }] },
    })
    expect(await run(['codes', 'usage', 'KIND', 'A'], io)).toBe(EXIT.ok)
    expect(io.stdout).toEqual(['KIND › A 을(를) 쓰는 곳 1개', '  페이지 목록 · 노드 1개', '    새 이름 칩'])
  })

  it('set-group · set-item — 없으면 만들고(POST) 있으면 고친다(PATCH)', async () => {
    const io = 준비()
    stub(io, 'POST', CODES, { status: 201, body: { group: {} } })
    stub(io, 'PATCH', `${CODES}/KIND`, { status: 200, body: { group: {} } })
    stub(io, 'POST', `${CODES}/KIND/items`, { status: 201, body: { item: {} } })
    stub(io, 'PATCH', `${CODES}/KIND/items/A`, { status: 200, body: { item: {} } })
    expect(await run(['codes', 'set-group', 'NEW', '--name', '새 그룹'], io)).toBe(EXIT.ok)
    expect(await run(['codes', 'set-group', 'KIND', '--order', '0'], io)).toBe(EXIT.ok)
    expect(await run(['codes', 'set-item', 'KIND', 'C', '--name', '셋째', '--inactive'], io)).toBe(EXIT.ok)
    expect(await run(['codes', 'set-item', 'KIND', 'A', '--name', '다시'], io)).toBe(EXIT.ok)
    expect(writes(io)).toEqual([
      `POST ${CODES} {"key":"NEW","name":"새 그룹"}`,
      `PATCH ${CODES}/KIND {"sortOrder":0}`,
      `POST ${CODES}/KIND/items {"value":"C","name":"셋째","active":false}`,
      `PATCH ${CODES}/KIND/items/A {"name":"다시"}`,
    ])
  })

  it('set-item 은 없는 그룹이면 보내지 않고 쓰임 오류다 · 없는 항목을 이름 없이 만들지 않는다', async () => {
    const io = 준비()
    expect(await run(['codes', 'set-item', 'NOPE', 'A', '--name', '가'], io)).toBe(EXIT.usage)
    expect(await run(['codes', 'set-item', 'KIND', 'Z'], io)).toBe(EXIT.usage)
    expect(writes(io)).toEqual([])
  })

  it('delete — 항목 하나 · 그룹째, 끊긴 참조로 남는다고 말한다', async () => {
    const io = 준비()
    stub(io, 'DELETE', `${CODES}/KIND/items/A`, { status: 204 })
    stub(io, 'DELETE', `${CODES}/KIND`, { status: 204 })
    expect(await run(['codes', 'delete', 'KIND', 'A'], io)).toBe(EXIT.ok)
    expect(await run(['codes', 'delete', 'KIND'], io)).toBe(EXIT.ok)
    expect(writes(io)).toEqual([`DELETE ${CODES}/KIND/items/A`, `DELETE ${CODES}/KIND`])
    expect(io.stdout[0]).toBe('항목 KIND › A 을(를) 지웠습니다 — 그것을 가리키던 노드는 끊긴 참조로 남습니다')
  })

  it('권한 없는 토큰 — 서버 문장을 옮기고 코드 3', async () => {
    const io = 준비()
    stub(io, 'POST', CODES, { status: 403, body: { error: { code: 'forbidden', message: '권한이 없습니다' } } })
    expect(await run(['codes', 'set-group', 'NEW', '--name', '새 그룹'], io)).toBe(EXIT.server)
    expect(io.stderr.join('\n')).toContain('서버가 거절했습니다 (403): 권한이 없습니다')
  })

  /** 표의 이름은 누구나 넣는 글이다 — `io.out` 으로만 나가고, 진짜 io(`createNodeIo`)는 그 줄을 `terminalSafe` 로 거른다. */
  it('이름에 든 제어 글자는 io.out 으로 나가 터미널 거름을 지난다', async () => {
    const io = 준비([{ key: 'KIND', name: '구분\u001b[2J', items: [] }])
    expect(await run(['codes', 'list'], io)).toBe(EXIT.ok)
    expect(io.stdout[0]).toContain('\u001b[2J')
    expect(terminalSafe(io.stdout[0]!)).toBe('구분\\u001b[2J (KIND) · 항목 0개 · 쓰는 노드 3개')
  })
})

describe('page get 의 공통코드', () => {
  /** 묶인 칩 하나 — 표(판 4 payload 의 `codes`)에서 «새 이름». */
  function 묶인페이지(codes: SnapshotPayload['codes'] | undefined): SnapshotPayload {
    const document = {
      version: 6,
      root: {
        id: 'root',
        type: 'Page',
        children: [{ id: 'n_chip', type: 'Chip', props: { label: '옛 이름' }, code: { group: 'KIND', item: 'A' } }],
      },
    }
    return snapshotPayload({
      payloadVersion: codes === undefined ? 3 : 4,
      pages: [page(PAGE_LIST, MENU_MEMBER, '목록', 0, document, null)],
      ...(codes === undefined ? {} : { codes }),
    })
  }

  it('표가 든 payload — 이름이 표의 이름이고 nodes[].code.resolved 가 선다', async () => {
    const io = 준비(GROUPS, 묶인페이지(GROUPS))
    expect(await run(['page', 'get', '관리자/회원/목록', '--json'], io)).toBe(EXIT.ok)
    const view = JSON.parse(io.stdout.join('\n')) as { nodes: { id: string; name: string; code?: unknown }[] }
    const chip = view.nodes.find((node) => node.id === 'n_chip')!
    expect(chip.name).toContain('새 이름')
    expect(chip.code).toEqual({ group: 'KIND', item: 'A', resolved: { kind: 'label', broken: false, name: '새 이름', inactive: false } })
  })

  it('끊긴 참조 · 표 없는 옛 payload — 글은 그 갈래를 말한다', async () => {
    const broken = 준비([], 묶인페이지([]))
    expect(await run(['page', 'get', '관리자/회원/목록'], broken)).toBe(EXIT.ok)
    expect(broken.stdout.find((line) => line.includes('Chip') || line.includes('칩'))).toContain('· 끊긴 공통코드 KIND › A')

    const old = 준비(GROUPS, 묶인페이지(undefined))
    expect(await run(['page', 'get', '관리자/회원/목록', '--json'], old)).toBe(EXIT.ok)
    const chip = (JSON.parse(old.stdout.join('\n')) as { nodes: { id: string; code?: { resolved: unknown } }[] }).nodes.find(
      (node) => node.id === 'n_chip',
    )!
    expect(chip.code?.resolved).toBeNull()
  })
})
