/**
 * **«페이지 정보» 탭의 이름 칸**(`src/panels/page-description.tsx`의 `PageMeta` — 설명과 같은 저장 장치 `useMetaWrite`). 이름은 메뉴 트리의 이름
 * 바꾸기와 같은 요청이다 — `PATCH …/pages/:id` 에 `title` 과 바탕(`base.title`).
 *
 * | 케이스 | 무엇이 거짓이면 죽나 |
 * |---|---|
 * | 저장 | 이름 · 바탕이 안 실린다 · 서버가 준 값을 안 쓴다 · «이름을 저장했습니다»가 아니다 · 빈 이름 · 그대로인 이름에 단추가 켜진다 |
 * | 충돌 | 409(`page-meta-changed` · `title`)가 «다른 사람이 이 제목을 바꿨습니다»로 안 선다 · 덮기가 그 사람의 값을 바탕으로 안 보낸다 |
 * | 남의 이름 | 트리 번호(`menu-changed`)가 올라도 다시 안 읽는다 · 다시 읽기가 친 초안을 덮는다 |
 *
 * 충돌 판정 자체(`judgeMeta`)는 설명과 한 함수라 그 갈래들은 `./page-meta-conflict.test.tsx` 가 잰다 — 여기는 이름 칸이 그 장치에 닿는가만 본다.
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ApiError } from '../../src/api/client'
import type { ApiClient } from '../../src/api/client'
import { fakeRealtime } from '../fake-realtime'
import { openPage, pageDetail, pageDoc, PROJECT_ID } from '../editor-harness'
import '../../src/catalog-setup'

const DOC = pageDoc({ id: 'n-root', type: 'Page', children: [] })

/** 이름을 드는 가짜 서버 — 바탕이 지금 이름과 다르면 409(서버의 `page-meta-changed`). */
function titleServer(initial: string) {
  let title = initial
  const bodies: unknown[] = []
  const overrides: Partial<ApiClient> = {
    getPage: (async (_projectId: string, pageId: string) => ({ ...pageDetail(pageId, DOC), title })) as never,
    updatePage: (async (_projectId: string, pageId: string, body: { title?: string; base?: { title?: string } }) => {
      bodies.push(body)
      if (body.base?.title !== undefined && body.base.title !== title) {
        throw new ApiError(409, 'conflict', '다른 사람이 먼저 바꿨습니다', [
          { code: 'page-meta-changed', path: 'title', message: '다른 사람이 먼저 바꿨습니다', current: title } as never,
        ])
      }
      title = body.title ?? title
      return { ...pageDetail(pageId, DOC), title: `${title}` }
    }) as never,
  }
  return {
    bodies,
    overrides,
    /** 남이 이름을 바꾼다(서버에서만). */
    rename: (next: string) => {
      title = next
    },
  }
}

function titleBox(): HTMLInputElement {
  return within(screen.getByRole('tabpanel')).getByRole('textbox', { name: '페이지 이름' }) as HTMLInputElement
}

function saveButton(): HTMLButtonElement {
  return screen.getByRole('button', { name: '이름 저장' }) as HTMLButtonElement
}

async function openInfo(server: ReturnType<typeof titleServer>, extra: Parameters<typeof openPage>[1] = {}): Promise<void> {
  await openPage(DOC, { ...extra, apiOverrides: { ...server.overrides, ...extra.apiOverrides } })
  fireEvent.click(screen.getByRole('tab', { name: '페이지 정보' }))
  await screen.findByRole('textbox', { name: '페이지 이름' })
}

describe('«페이지 이름» 칸 — 저장', () => {
  it('고쳐 저장하면 이름과 바탕이 실리고, 화면은 서버가 준 값을 쓰고 그렇다고 말한다', async () => {
    const server = titleServer('회원 목록')
    await openInfo(server)
    expect(titleBox().value).toBe('회원 목록')

    fireEvent.change(titleBox(), { target: { value: '회원 명부' } })
    fireEvent.click(saveButton())

    await waitFor(() => expect(server.bodies).toEqual([{ title: '회원 명부', base: { title: '회원 목록' } }]))
    expect(await screen.findByText('이름을 저장했습니다')).toBeTruthy()
    expect(titleBox().value).toBe('회원 명부')
    expect(screen.getByRole('heading', { name: '회원 명부' })).toBeTruthy()
  })

  it('빈 이름 · 그대로인 이름에는 단추가 꺼진다', async () => {
    await openInfo(titleServer('회원 목록'))
    expect(saveButton().disabled).toBe(true)
    fireEvent.change(titleBox(), { target: { value: '' } })
    expect(saveButton().disabled).toBe(true)
    // 양성 대조 — 한 글자만 바꿔도 켜진다.
    fireEvent.change(titleBox(), { target: { value: '회원 목록!' } })
    expect(saveButton().disabled).toBe(false)
  })
})

describe('«페이지 이름» 칸 — 충돌', () => {
  it('남이 먼저 바꿨으면 409 로 알고 그 사람의 이름을 보인다 — «내 글로 덮기»는 그 이름을 바탕으로 다시 보낸다', async () => {
    const server = titleServer('회원 목록')
    await openInfo(server)
    fireEvent.change(titleBox(), { target: { value: '내 이름' } })
    server.rename('밥의 이름')
    fireEvent.click(saveButton())

    const lead = await screen.findByText('다른 사람이 이 제목을 바꿨습니다')
    const conflict = lead.closest<HTMLElement>('[role="alert"]')!
    expect(within(conflict).getByText('밥의 이름')).toBeTruthy()
    // 친 글은 남는다.
    expect(titleBox().value).toBe('내 이름')

    fireEvent.click(within(conflict).getByRole('button', { name: '내 글로 덮기' }))
    await waitFor(() => expect(server.bodies.at(-1)).toEqual({ title: '내 이름', base: { title: '밥의 이름' } }))
    expect(await screen.findByText('이름을 저장했습니다')).toBeTruthy()
  })
})

describe('«페이지 이름» 칸 — 남이 바꾼 이름', () => {
  it('트리 번호(`menu-changed`)가 오르면 이름을 다시 읽는다 — 친 초안은 그대로 남는다', async () => {
    const server = titleServer('회원 목록')
    const live = fakeRealtime(PROJECT_ID, 'u-1')
    await openInfo(server, { realtime: live.realtime })
    live.open()

    server.rename('밥이 바꾼 이름')
    live.deliver({ type: 'menu-changed', projectId: PROJECT_ID, rev: 5 })
    await waitFor(() => expect(titleBox().value).toBe('밥이 바꾼 이름'))
    expect(screen.getByRole('heading', { name: '밥이 바꾼 이름' })).toBeTruthy()

    // 친 초안은 다시 읽기가 덮지 않는다 — 제목 줄만 서버 값을 따른다.
    fireEvent.change(titleBox(), { target: { value: '내 초안' } })
    server.rename('또 바뀐 이름')
    live.deliver({ type: 'menu-changed', projectId: PROJECT_ID, rev: 6 })
    await waitFor(() => expect(screen.getByRole('heading', { name: '또 바뀐 이름' })).toBeTruthy())
    expect(titleBox().value).toBe('내 초안')
  })
})
