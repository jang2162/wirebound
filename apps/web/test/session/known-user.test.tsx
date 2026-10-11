/**
 * **이 탭이 아는 사용자**(`src/api/known-user.tsx`). 웹은 요청마다 탭이 아는 사람의 id 를 싣고(REST 머리 · WS 쿼리),
 * 서버가 쿠키의 사람과 다르다고 409 `session-user-changed`로 답하면 `me`로 쿠키의 사람을 다시 알아내 그 사람이 된다.
 */
import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { App } from '../../src/app'
import { ApiError } from '../../src/api/client'
import { createHttpClient } from '../../src/api/http-client'
import { createKnownUserHolder, KNOWN_USER_HEADER, SESSION_USER_CHANGED } from '../../src/api/known-user'
import type { ProjectDetail, SessionUser } from '../../src/api/types'
import { realtimeUrl } from '../../src/realtime/protocol'
import { SWITCHED_NOTICE } from '../../src/session/session-menu'
import { currentPath, fakeApi, renderWithProviders } from '../helpers'

const ALICE: SessionUser = { id: 'u-alice', email: 'alice@example.com', name: '앨리스' }
const BOB: SessionUser = { id: 'u-bob', email: 'bob@example.com', name: '밥' }
const PROJECT: ProjectDetail = { id: 'p1', name: '프로젝트', slug: 'proj', description: null, role: 'owner' }

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function headersOf(init: RequestInit | undefined): Record<string, string> {
  return (init?.headers ?? {}) as Record<string, string>
}

describe('HTTP 클라이언트 — 이 탭이 아는 사용자를 싣고, 거절을 알아챈다', () => {
  /** 혼자 죽는 변조: 머리를 안 싣는다(`http-client.ts`의 `known`). */
  it('아는 사람이 있으면 그 id 를 머리에 싣고, 모르면 키를 만들지 않는다', async () => {
    const holder = createKnownUserHolder()
    const calls: (RequestInit | undefined)[] = []
    const fetchImpl: typeof fetch = async (_input, init) => {
      calls.push(init)
      return json(200, [PROJECT])
    }
    const client = createHttpClient(fetchImpl, () => undefined, holder)
    await client.listProjects()
    holder.set(ALICE.id)
    await client.listProjects()
    expect(KNOWN_USER_HEADER in headersOf(calls[0])).toBe(false)
    expect(headersOf(calls[1])[KNOWN_USER_HEADER]).toBe(ALICE.id)
  })

  /** 혼자 죽는 변조: 409 를 받아도 `changed()`를 안 부른다. */
  it('409 session-user-changed 면 `changed()`를 부르고 그 실패를 그대로 던진다 — 다른 409 는 아니다', async () => {
    const holder = createKnownUserHolder()
    holder.set(ALICE.id)
    const changed = vi.fn()
    holder.onChanged(changed)
    const message = '다른 사람으로 로그인됐습니다 — 이 탭이 아는 사용자와 지금 로그인한 사용자가 다릅니다'
    const responses = [
      json(409, { error: { code: 'conflict', message, issues: [{ path: 'session', code: SESSION_USER_CHANGED, message }] } }),
      json(409, { error: { code: 'conflict', message: '페이지가 이미 변경되었습니다' } }),
    ]
    const client = createHttpClient(
      async () => responses.shift() as Response,
      () => undefined,
      holder,
    )
    const first = await client.getProject('p1').catch((caught: unknown) => caught)
    expect(first).toBeInstanceOf(ApiError)
    expect((first as ApiError).message).toBe(message)
    await client.getProject('p1').catch(() => undefined)
    expect(changed).toHaveBeenCalledTimes(1)
  })

  /**
   * **내려받기도 같은 문을 지난다**(`downloadExport` — 바이트를 읽는 것만 다르고 보내기는 `send` 한 자리다). 파일을 받는 요청이
   * 머리를 안 실으면 다른 사람의 쿠키로 그 사람의 프로젝트를 받는다 — 머리가 있으면 서버가 409 로 막고 탭이 쿠키의 사람을
   * 다시 알아낸다. 혼자 죽는 변조: 이 요청에서만 머리를 떼거나 · 이 요청의 409 에서만 `changed()`를 안 부른다.
   */
  it('내보내기 파일을 받을 때도 머리를 싣고, 409 session-user-changed 면 `changed()`를 부른다', async () => {
    const holder = createKnownUserHolder()
    holder.set(ALICE.id)
    const changed = vi.fn()
    holder.onChanged(changed)
    const message = '다른 사람으로 로그인됐습니다 — 이 탭이 아는 사용자와 지금 로그인한 사용자가 다릅니다'
    const calls: (RequestInit | undefined)[] = []
    const client = createHttpClient(
      async (_input, init) => {
        calls.push(init)
        return json(409, { error: { code: 'conflict', message, issues: [{ path: 'session', code: SESSION_USER_CHANGED, message }] } })
      },
      () => undefined,
      holder,
    )

    const caught = await client.downloadExport('p1', 'html').catch((error: unknown) => error)

    expect(headersOf(calls[0])[KNOWN_USER_HEADER]).toBe(ALICE.id)
    expect(caught).toBeInstanceOf(ApiError)
    expect((caught as ApiError).message).toBe(message)
    expect(changed).toHaveBeenCalledTimes(1)
  })

  /** 혼자 죽는 변조: `realtimeUrl`이 쿼리를 안 싣는다. */
  it('WS 주소는 아는 사람을 쿼리로 싣는다 — 모르면 쿼리가 없다', () => {
    expect(realtimeUrl('http://localhost:5173', 'p1', 'u a')).toBe('ws://localhost:5173/api/projects/p1/ws?knownUser=u%20a')
    expect(realtimeUrl('http://localhost:5173', 'p1')).toBe('ws://localhost:5173/api/projects/p1/ws')
  })
})

describe('세션 — 쿠키의 사람이 다르다는 답을 받으면 다시 알아낸다', () => {
  function mount(meAnswers: SessionUser[]) {
    const holder = createKnownUserHolder()
    const me = vi.fn(async () => meAnswers.shift() ?? ALICE)
    renderWithProviders(<App />, {
      client: fakeApi({ me, listProjects: async () => [PROJECT] }),
      knownUser: holder,
    })
    return { holder, me }
  }

  /** 목록 머리가 보이는 사람 — 이름은 `…` 의 머리에 선다(`shell/action-menu.tsx`). 열어 읽고 닫는다. */
  async function shownUser(): Promise<string> {
    await screen.findByRole('link', { name: PROJECT.name })
    fireEvent.click(screen.getByRole('button', { name: '더 보기' }))
    const name = document.querySelector('.wb-shell-action-menu-heading')?.textContent ?? ''
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
    return name
  }

  /** 혼자 죽는 변조: 세션이 holder 에 적지 않는다(`session-context.tsx`의 레이아웃 이펙트). */
  it('세션이 알게 된 사람을 싣는 자리에 적는다', async () => {
    const { holder } = mount([ALICE])
    expect(await shownUser()).toBe('앨리스')
    expect(holder.get()).toBe(ALICE.id)
  })

  /**
   * 이 길이 없으면 탭은 알림을 못 받았을 때 영영 앞 사람의 화면이다(Chrome 에서 잰 고장 방식: 알림 없는 로그인 뒤 앨리스로 믿는
   * 탭의 코멘트가 작성자 밥으로 커밋된다).
   *
   * 혼자 죽는 변조: `learned`가 늘 지금 세션 그대로다(다시 알아낸 사람으로 옮기지 않는다).
   */
  it('다른 사람이면 그 사람이 되고 목록에서 그렇다고 말한다 — 묻는 것은 한 번이다', async () => {
    const { holder, me } = mount([ALICE, BOB])
    expect(await shownUser()).toBe('앨리스')
    await act(async () => {
      holder.changed()
      holder.changed()
    })
    await waitFor(() => expect(screen.queryByRole('status')?.textContent).toBe(SWITCHED_NOTICE))
    expect(await shownUser()).toBe('밥')
    expect(screen.getByRole('status').textContent).toBe(SWITCHED_NOTICE)
    expect(holder.get()).toBe(BOB.id)
    expect(currentPath()).toBe('/')
    expect(me).toHaveBeenCalledTimes(2)
  })
})
