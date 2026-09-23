/**
 * **페이지 설명의 충돌 모델 — 화면**(이월 P = AB · M · 2026-09-23). 서버는 가짜다 — 바탕(`base`)을 받아 지금 값과
 * 견주고, 다르면 409 · 이슈 코드 `page-meta-changed` · 지금 값을 낸다(진짜 서버의 계약은
 * `apps/api/test/page-meta-conflict.test.ts`가 잰다). **jsdom 값이다** — Chrome 값은 보고서가 따로 적는다.
 *
 * 갈래와 그것만 혼자 죽이는 변조는 케이스의 주석에 있다. «모름»(시간 초과 → 다시 읽기)의 셋째 갈래(«다른 사람이
 * 바꿨다»)는 `write-ledger.test.tsx`의 R 절에 있다 — 그 가짜 서버와 가짜 타이머가 거기 있다.
 */
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { samePageMeta } from '@wirebound/schema'
import { ApiError, type ApiClient } from '../../src/api/client'
import type { PageDetail, ProjectDetail } from '../../src/api/types'
import { openDraftStore } from '../../src/panels/draft-store'
import { openPage, pageDetail, pageDoc, PAGE_ID, PROJECT_ID, PROJECT_NAME, type EditorOptions } from '../editor-harness'
import '../../src/catalog-setup'

const DOC = pageDoc({ id: 'n-root', type: 'Page', children: [] })
const START = '처음 설명'
const CHANGED = '다른 사람이 이 페이지를 먼저 바꿨습니다'

type Body = { description?: string | null; base?: { description?: string | null } }

/**
 * 설명 하나를 드는 서버 — 바탕이 오면 견준다(진짜 서버처럼 빈 값은 `''`든 `null`이든 같다 — `samePageMeta`).
 * `overwrite`는 **다른 사람의 저장**이다.
 */
function metaServer(initial: string | null) {
  let stored = initial
  const bodies: Body[] = []
  const detail = (pageId: string): PageDetail => ({
    ...pageDetail(pageId, DOC),
    description: pageId === PAGE_ID ? stored : null,
  })
  const overrides: Partial<ApiClient> = {
    getPage: (async (_projectId: string, pageId: string) => detail(pageId)) as never,
    updatePage: (async (_projectId: string, pageId: string, body: Body) => {
      bodies.push(body)
      if (body.base !== undefined && 'description' in body.base && !samePageMeta(body.base.description ?? null, stored)) {
        throw new ApiError(
          409,
          'conflict',
          CHANGED,
          [{ path: 'description', code: 'page-meta-changed', message: CHANGED, current: stored }],
          true,
        )
      }
      if (body.description !== undefined) stored = body.description
      return detail(pageId)
    }) as never,
  }
  return {
    bodies,
    overrides,
    stored: () => stored,
    overwrite: (value: string | null) => {
      stored = value
    },
  }
}

function box(): HTMLTextAreaElement {
  return screen.getByRole('textbox', { name: '페이지 설명' }) as HTMLTextAreaElement
}

function saveButton(): HTMLButtonElement {
  return screen.getByRole('button', { name: '설명 저장' }) as HTMLButtonElement
}

function type(value: string): void {
  if (box().disabled) throw new Error('꺼진 상자에는 칠 수 없다 — 실브라우저에서 없는 길이다')
  fireEvent.change(box(), { target: { value } })
}

function toView(): void {
  fireEvent.click(screen.getByRole('button', { name: '뷰 모드' }))
}

/** 충돌 화면 — 그 문장이 선 `alert`. */
async function findConflict(): Promise<HTMLElement> {
  const lead = await screen.findByText('다른 사람이 이 설명을 바꿨습니다')
  const alert = lead.closest<HTMLElement>('[role="alert"]')
  if (alert === null) throw new Error('충돌 문장이 alert 안에 있지 않다')
  return alert
}

/** 앨리스가 `START`에서 고치기 시작한 사이 밥이 저장했고, 앨리스가 누른다 — 충돌까지. */
async function collide(server: ReturnType<typeof metaServer>, options: EditorOptions = {}): Promise<HTMLElement> {
  await openPage(DOC, { ...options, apiOverrides: { ...server.overrides, ...options.apiOverrides } })
  toView()
  await waitFor(() => expect(box().value).toBe(START))
  type('앨리스의 글')
  server.overwrite('밥의 글')
  fireEvent.click(saveButton())
  return findConflict()
}

describe('설명 — 남이 먼저 저장했으면 409 로 안다(이월 P)', () => {
  /**
   * 혼자 죽는 변조: «페이지 설명»이 충돌 화면에 그 사람의 값 대신 내 초안을 넘긴다(표시만 — 덮기는 옳은 값을 싣는다).
   * **409 의 값을 칸에 잘못 들면**(`land`가 `theirs`를 내 글로) 이 케이스와 «내 글로 덮기»가 함께 죽는다 — 덮기의
   * 바탕이 그 값이라서다. 충돌 화면이 그 사람의 값을 보이는가는 **이 케이스가 주인이다**(메뉴 트리의 제목은
   * `menu-crud.test.tsx`의 «페이지 제목의 충돌» 첫 케이스).
   */
  it('충돌 화면이 그 사람의 값을 보이고, 내 글은 상자에 남는다 — 바탕은 고치기 시작한 때의 값이다', async () => {
    const server = metaServer(START)
    const conflict = await collide(server)

    expect(within(conflict).getByText('밥의 글')).toBeTruthy()
    expect(box().value).toBe('앨리스의 글')
    expect(server.bodies).toEqual([{ description: '앨리스의 글', base: { description: START } }])
    expect(server.stored()).toBe('밥의 글')
    expect(screen.queryByText('설명을 저장했습니다')).toBeNull()
  })

  /** 혼자 죽는 변조: «내 글로 덮기»가 그 사람의 값 대신 초안의 옛 바탕으로 보낸다 — 또 409 다. */
  it('«내 글로 덮기» — 그 사람의 값을 바탕으로 다시 보내 저장된다', async () => {
    const server = metaServer(START)
    const conflict = await collide(server)

    fireEvent.click(within(conflict).getByRole('button', { name: '내 글로 덮기' }))

    expect(await screen.findByText('설명을 저장했습니다')).toBeTruthy()
    expect(server.bodies[1]).toEqual({ description: '앨리스의 글', base: { description: '밥의 글' } })
    expect(server.stored()).toBe('앨리스의 글')
    expect(screen.queryByText('다른 사람이 이 설명을 바꿨습니다')).toBeNull()
    expect(box().value).toBe('앨리스의 글')
  })

  /** 혼자 죽는 변조: «내 글 버리기»가 초안을 안 버린다 — 상자에 내 글이 남는다. */
  it('«내 글 버리기» — 그 사람의 값을 받고 아무것도 보내지 않는다', async () => {
    const server = metaServer(START)
    const conflict = await collide(server)

    fireEvent.click(within(conflict).getByRole('button', { name: '내 글 버리기' }))

    await waitFor(() => expect(box().value).toBe('밥의 글'))
    expect(saveButton().disabled).toBe(true)
    expect(screen.queryByText('다른 사람이 이 설명을 바꿨습니다')).toBeNull()
    expect(server.bodies).toHaveLength(1)
    expect(server.stored()).toBe('밥의 글')
  })

  /**
   * 혼자 죽는 변조: 상자의 `onChange`가 바탕을 **칠 때마다** 지금 서버 값으로 다시 잡는다(`prev.base`를 안 든다) —
   * 탭을 다녀와 조회가 밥의 값을 읽은 뒤 한 글자 더 치면 바탕이 밥의 값이 되어, 409 없이 **밥의 글을 덮는다.**
   */
  it('바탕은 첫 글자를 친 때의 값이다 — 탭을 다녀와 새 서버 값을 읽은 뒤 더 쳐도 옮겨 가지 않는다', async () => {
    const server = metaServer(START)
    await openPage(DOC, { apiOverrides: server.overrides })
    toView()
    await waitFor(() => expect(box().value).toBe(START))
    type('앨리스의')
    server.overwrite('밥의 글')

    // 탭을 다녀온다 — 이 탭이 다시 마운트되며 서버를 다시 읽는다(밥의 값). 상자는 초안을 보인다.
    fireEvent.click(screen.getByRole('tab', { name: '코멘트' }))
    fireEvent.click(await screen.findByRole('tab', { name: '페이지 설명' }))
    await waitFor(() => expect(box().value).toBe('앨리스의'))
    type('앨리스의 글')
    fireEvent.click(saveButton())

    await findConflict()
    expect(server.bodies).toEqual([{ description: '앨리스의 글', base: { description: START } }])
    expect(server.stored()).toBe('밥의 글')
  })

  /** 혼자 죽는 변조: `land`의 `'mine'` 갈래를 다시 읽은 값(`'verified'`)에만 준다 — 409 의 `'mine'`이 충돌로 간다. */
  it('409 의 지금 값이 내 글과 같으면 원하던 상태다 — 충돌이 아니고 초안을 비운다', async () => {
    const server = metaServer(START)
    await openPage(DOC, { apiOverrides: server.overrides })
    toView()
    await waitFor(() => expect(box().value).toBe(START))
    type('같은 글')
    server.overwrite('같은 글')
    fireEvent.click(saveButton())

    expect(await screen.findByText('서버의 설명이 이미 이 글과 같습니다')).toBeTruthy()
    expect(screen.queryByText('다른 사람이 이 설명을 바꿨습니다')).toBeNull()
    expect(saveButton().disabled).toBe(true)
    // **초안을 비웠다** — 뒤에 서버 값이 바뀌면 그것이 보인다(초안이 남았으면 가린다).
    server.overwrite('그 뒤 남이 고친 글')
    fireEvent.click(screen.getByRole('button', { name: '편집 모드' }))
    toView()
    await waitFor(() => expect(box().value).toBe('그 뒤 남이 고친 글'))
  })
})

describe('설명 — 바탕은 조회가 준 값 그대로다(리뷰 F1)', () => {
  /**
   * **설명이 `null`인 페이지**(새 페이지의 기본값)에서 첫 저장의 바탕이 `null`인가. 앞 판의 케이스는 전부 설명이
   * **문자열**인 페이지에서 시작해, 바탕을 상자의 값(`''`)으로 드는 변조가 웹 전량에서 0 사망이었다(리뷰 M-b).
   * 그 변조는 오늘 서버에서는 거짓 충돌을 안 낸다(빈 값은 `''`든 `null`이든 같다 — 리뷰 F3) — **그래서 본문으로 잰다.**
   * 바탕은 조회가 준 값 그대로여야 한다 — 화면이 값을 접으면 그 접기가 서버의 견주기와 두 벌이 된다.
   *
   * 혼자 죽는 변조: `page-description.tsx`의 `startedFrom`을 `state.description` 대신 `server`(`description ?? ''`)로.
   */
  it('설명이 없는(null) 페이지에서 치고 저장하면 바탕이 null 이다 — 빈 문자열로 접지 않는다', async () => {
    const server = metaServer(null)
    await openPage(DOC, { apiOverrides: server.overrides })
    toView()
    await waitFor(() => expect(saveButton().disabled).toBe(true))
    expect(box().value).toBe('')
    type('첫 설명')
    fireEvent.click(saveButton())

    expect(await screen.findByText('설명을 저장했습니다')).toBeTruthy()
    expect(server.bodies).toHaveLength(1)
    expect(server.bodies[0]!.base).toStrictEqual({ description: null })
    expect(server.stored()).toBe('첫 설명')
  })
})

/** 탭 하나의 저장소(`draft-store.test.tsx`의 `MemoryStorage`의 작은 판 — 읽은 키를 셀 일이 없다). */
class MemoryStorage implements Storage {
  readonly #items = new Map<string, string>()
  get length(): number {
    return this.#items.size
  }
  clear(): void {
    this.#items.clear()
  }
  getItem(key: string): string | null {
    return this.#items.get(key) ?? null
  }
  key(index: number): string | null {
    return [...this.#items.keys()][index] ?? null
  }
  removeItem(key: string): void {
    this.#items.delete(key)
  }
  setItem(key: string, value: string): void {
    this.#items.set(key, String(value))
  }
}

describe('설명 — 되살린 초안은 제 바탕을 든다(이월 X 의 (f))', () => {
  /**
   * 혼자 죽는 변조: 초안 칸의 `keeper.load`가 되살린 바탕을 버린다(`base: null`). 바탕을 아예 안 비추면(`keeper.save`가
   * `{ text }`만) 되살릴 때 모양이 틀려 초안째 버려져 `draft-store.test.tsx`의 «새로고침 · 세션 만료» 케이스 다섯과
   * 함께 죽는다 — 그 축(초안이 셸을 넘는다)의 주인은 그쪽이다.
   */
  it('새로고침 사이 남이 저장했으면, 되살린 초안을 저장할 때 409 로 안다 — 조용히 덮지 않는다', async () => {
    const session = new MemoryStorage()
    const shared = new MemoryStorage()
    const server = metaServer(START)

    await openPage(DOC, { apiOverrides: server.overrides, draftStore: openDraftStore(() => session, () => shared) })
    toView()
    await waitFor(() => expect(box().value).toBe(START))
    type('앨리스의 초안')

    // 밥이 저장하고, 앨리스가 새로고침한다 — 같은 탭의 저장소 위에 새 문서.
    server.overwrite('밥의 글')
    cleanup()
    await openPage(DOC, { apiOverrides: server.overrides, draftStore: openDraftStore(() => session, () => shared) })
    toView()
    await waitFor(() => expect(box().value).toBe('앨리스의 초안'))

    fireEvent.click(saveButton())
    await findConflict()

    // **그 사람의 값을 보이는가는 여기서 안 본다** — 첫 케이스(«충돌 화면이 그 사람의 값을 보이고 …»)가 그 축의
    // 주인이다. 여기서도 보면 그 축의 변조에 둘이 함께 죽는다.
    expect(server.bodies).toEqual([{ description: '앨리스의 초안', base: { description: START } }])
    expect(server.stored()).toBe('밥의 글')
  })
})

describe('viewer 는 읽기 전용이다(이월 M)', () => {
  const VIEWER_PROJECT: ProjectDetail = {
    id: PROJECT_ID,
    name: PROJECT_NAME,
    slug: 'admin-console',
    description: null,
    role: 'viewer',
  }

  /** 혼자 죽는 변조: 셸이 «페이지 설명»에 `canEdit`을 `true`로 내린다(역할 판정을 안 지난다). */
  it('«페이지 설명» 탭 — 설명의 글이 보이고 상자 · 저장 단추가 없다', async () => {
    const server = metaServer(START)
    await openPage(DOC, { apiOverrides: { ...server.overrides, getProject: async () => VIEWER_PROJECT } })
    toView()

    expect(await screen.findByText(START)).toBeTruthy()
    expect(screen.queryByRole('textbox', { name: '페이지 설명' })).toBeNull()
    expect(screen.queryByRole('button', { name: '설명 저장' })).toBeNull()
  })

  // **메뉴 트리의 케이스는 여기 없다**(이월 M′). 앞 판은 *"페이지의 «이름 변경»만 닫히고 메뉴의 것은 열려 있다"*를
  // 쟀는데 M′ 이 그 뒷절을 거짓으로 만들었다 — viewer 에게는 메뉴 편집 툴바 자체가 없다. 그 자리는
  // `test/routes/viewer-entries.test.tsx`의 «메뉴 트리» 케이스가 갖는다.
})
