/**
 * MCP 의 공통코드 도구 셋 — `list_codes` · `code_usage` · `edit_codes`(차례로 보내고 첫 거절에서 멈춤 · 원소 꼴을 보내기 전에 다 읽음 · 권한 없는
 * 토큰의 거절) · `get_page` 의 `nodes[].code.resolved`. 하네스의 가짜 서버(`harness.ts`)가 `apps/api` 의 응답 꼴을 낸다.
 */
import { page, snapshotPayload, MENU_MEMBER } from '@wirebound/cli/test-support'
import { describe, expect, it } from 'vitest'
import { callTool } from '../src/server'
import { CODE_GROUPS, PROJECT, SERVER, WRITE_PAGE, callJson, harness } from './harness'

const CODES = `/api/projects/${PROJECT}/codes`
const writes = (io: ReturnType<typeof harness>): string[] =>
  io.requests.filter((request) => request.method !== 'GET').map((request) => `${request.method} ${request.url.replace(SERVER, '')}`)

describe('공통코드 도구', () => {
  it('list_codes — 표와 사용 수', async () => {
    expect(await callJson(harness(), 'list_codes')).toEqual({
      server: SERVER,
      projectId: PROJECT,
      groups: CODE_GROUPS,
      counts: { KIND: { group: 1, items: { A: 1 } } },
    })
  })

  it('code_usage — 그 그룹을 쓰는 노드', async () => {
    expect(await callJson(harness(), 'code_usage', { group: 'KIND' })).toMatchObject({
      group: 'KIND',
      item: null,
      usage: [{ kind: 'page', id: WRITE_PAGE, title: '목록', nodes: [{ nodeId: 'list', name: '구분 칩' }] }],
    })
  })

  it('edit_codes — 첫 거절에서 멈추고 applied 가 이미 된 수다(isError)', async () => {
    const io = harness()
    const outcome = await callTool(io, 'edit_codes', {
      ops: [
        { op: 'add-group', group: 'NEW', name: '새 그룹' },
        { op: 'update-group', group: 'GONE', name: '없음' },
        { op: 'delete-group', group: 'KIND' },
      ],
    })
    expect(outcome.isError).toBe(true)
    expect(JSON.parse(outcome.text)).toMatchObject({ total: 3, applied: 1, rejected: { index: 1, status: 404 } })
    // 셋째는 보내지 않았다.
    expect(writes(io)).toEqual([`POST ${CODES}`, `PATCH ${CODES}/GONE`])
  })

  it('edit_codes — 원소 꼴이 틀리면 하나도 안 보낸다', async () => {
    const io = harness()
    const outcome = await callTool(io, 'edit_codes', {
      ops: [
        { op: 'add-group', group: 'NEW', name: '새 그룹' },
        { op: 'add-item', group: 'NEW', name: '코드값이 없다' },
      ],
    })
    expect(outcome.isError).toBe(true)
    expect(outcome.text).toContain('ops[1].item')
    expect(writes(io)).toEqual([])
  })

  it('edit_codes — 권한 없는 토큰은 서버 문장을 옮기고 아무것도 안 됐다고 말한다', async () => {
    const outcome = await callTool(harness({ codeWrite: 'forbidden' }), 'edit_codes', {
      ops: [{ op: 'add-group', group: 'NEW', name: '새 그룹' }],
    })
    expect(outcome.isError).toBe(true)
    const said = JSON.parse(outcome.text) as { applied: number; rejected: { status: number; message: string } }
    expect(said.applied).toBe(0)
    expect(said.rejected.status).toBe(403)
    expect(said.rejected.message).toContain('권한이 없습니다')
  })

  it('get_page — 묶인 노드의 code 에 풀린 이름(resolved)이 서고 이름이 표의 이름이다', async () => {
    const document = {
      version: 6,
      root: {
        id: 'root',
        type: 'Page',
        children: [{ id: 'n_chip', type: 'Chip', props: { label: '옛 이름' }, code: { group: 'KIND', item: 'A' } }],
      },
    }
    const payload = snapshotPayload({
      payloadVersion: 4,
      pages: [page(WRITE_PAGE, MENU_MEMBER, '목록', 0, document, null)],
      codes: CODE_GROUPS,
    })
    const said = (await callJson(harness({ payload }), 'get_page', { path: '관리자/회원/목록' })) as {
      page: { nodes: { id: string; name: string; code?: unknown }[] }
    }
    const chip = said.page.nodes.find((node) => node.id === 'n_chip')!
    expect(chip.name).toContain('새 이름')
    expect(chip.code).toEqual({ group: 'KIND', item: 'A', resolved: { kind: 'label', broken: false, name: '새 이름', inactive: false } })
  })
})
