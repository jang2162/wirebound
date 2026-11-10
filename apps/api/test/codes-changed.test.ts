/**
 * **공통코드 표가 바뀌면 룸에 `codes-changed` 가 간다**(`routes/codes.ts` 의 `notifyCodesChanged`) — 남의 연결은 받고 낸 연결은 안 받는다,
 * 프레임은 프로젝트만 싣는다, 아무것도 안 바꾼 거절(404 · 409)은 신호를 안 낸다.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ServerFrame } from '../src/ws/protocol'
import { addMember, createProject, resetRealData, signup, withRealApi } from './helpers'
import { joinRoom } from './ws-client'

beforeEach(resetRealData)
afterEach(resetRealData)

type CodesChanged = Extract<ServerFrame, { type: 'codes-changed' }>
const codesChanged = (frames: ServerFrame[]): CodesChanged[] =>
  frames.filter((frame): frame is CodesChanged => frame.type === 'codes-changed')

describe('codes-changed', () => {
  it('쓰기마다 남의 연결이 신호 하나를 받고 낸 연결은 안 받는다 · 거절은 신호가 없다', async () => {
    await withRealApi(async (ctx) => {
      const owner = await signup(ctx)
      const peer = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      await addMember(ctx, project.id, peer.user.id, 'viewer')
      const author = await joinRoom(ctx.port, project.id, owner.cookie.wb_session)
      const watcher = await joinRoom(ctx.port, project.id, peer.cookie.wb_session)
      const { connectionId } = await author.waitFor('joined')
      await watcher.waitFor('joined')
      const base = `/api/projects/${project.id}/codes`
      const send = (method: 'POST' | 'PATCH' | 'DELETE', url: string, payload?: Record<string, unknown>) =>
        ctx.app.inject({
          method,
          url: `${base}${url}`,
          cookies: owner.cookie,
          headers: { 'x-wb-connection-id': connectionId },
          ...(payload === undefined ? {} : { payload }),
        })
      const one = { type: 'codes-changed', projectId: project.id }
      // 걸음 앞에 받은 수를 적는다 — 방송은 답을 기다리지 않아 답보다 먼저 닿을 수 있다.
      const step = async (label: string, run: () => Promise<{ statusCode: number }>, status: number, signalled: boolean) => {
        const at = { author: author.received.length, watcher: watcher.received.length }
        const res = await run()
        expect(res.statusCode, label).toBe(status)
        await Promise.all([author.quiet(), watcher.quiet()])
        expect({
          label,
          author: codesChanged(author.received.slice(at.author)),
          watcher: codesChanged(watcher.received.slice(at.watcher)),
        }).toEqual({ label, author: [], watcher: signalled ? [one] : [] })
      }
      await step('그룹 만들기', () => send('POST', '', { key: 'S', name: '상태' }), 201, true)
      await step('겹친 그룹', () => send('POST', '', { key: 'S', name: '또' }), 409, false)
      await step('항목 만들기', () => send('POST', '/S/items', { value: 'A', name: '가' }), 201, true)
      await step('항목 고치기', () => send('PATCH', '/S/items/A', { name: '나' }), 200, true)
      await step('없는 항목 지우기', () => send('DELETE', '/S/items/NOPE'), 404, false)
      await step('항목 지우기', () => send('DELETE', '/S/items/A'), 204, true)
      await step('그룹 고치기', () => send('PATCH', '/S', { name: '바꿈' }), 200, true)
      await step('그룹 지우기', () => send('DELETE', '/S'), 204, true)
      author.close()
      watcher.close()
    })
  })
})
