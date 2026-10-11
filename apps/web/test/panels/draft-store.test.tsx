/**
 * **초안의 사본**(`src/panels/draft-store.tsx`). 무엇에 왜 드는지와 입구마다의 처리는 그 파일과
 * `src/panels/panel-drafts.tsx`의 머리말 «저장소에 비춘다»가 갖는다. Chrome 값은 `src/panels/write-ledger.tsx`의
 * «이것이 막지 못하는 것»이 갖는다 — **여기 값은 전부 jsdom 이다.**
 *
 * **새로고침은 이렇게 흉내 낸다** — 트리를 통째로 내리고(`cleanup`) 같은 저장소 위에 **새 사본 객체**로 다시
 * 세운다(`openDraftStore`를 다시 부른다 — 새 문서의 모듈 상태는 새것이다). 메모리의 provider · 장부 · 스토어는
 * 전부 죽고 `sessionStorage`·`localStorage`만 남는다. 서버 흉내는 그대로 산다(서버는 새로고침을 모른다).
 *
 * 저장소는 `MemoryStorage`다 — jsdom 의 `sessionStorage`는 파일 안 케이스끼리 이어지고, **읽은 키를 세야** «다른
 * 사람의 칸을 읽지 않는다»를 잴 수 있다.
 *
 * **변조 표는 절마다 있다** — 한 곳씩 심고 web 전량을 돌린 뒤 백업에서 바이트 비교로 복원해 잰다. 죽는 것은 이
 * 파일의 케이스뿐이다(다른 파일의 케이스는 사본을 세우지 않으므로 이 축을 안 지난다 — `helpers.tsx`의 `draftStore`).
 * 혼자 안 죽는 케이스는 **그 축의 주인**을 적었다.
 */
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ApiClient, WriteOptions } from '../../src/api/client'
import { ApiError } from '../../src/api/client'
import type { Comment, CommentCreated, PageDetail, ProjectDetail, SessionUser } from '../../src/api/types'
import { DRAFT_KEY_PREFIX, FORGOTTEN_KEY, openDraftStore, type DraftStore } from '../../src/panels/draft-store'
import {
  HEAD_SEQ,
  OTHER_PAGE_ID,
  OTHER_PAGE_TITLE,
  PAGE_ID,
  PROJECT_NAME,
  chooseFromShellMenu,
  openPage,
  pageDetail,
  pageDoc,
  waitForNode,
  type EditorOptions,
} from '../editor-harness'
import { tabHub } from '../helpers'
import '../../src/catalog-setup'

const ROOT_ID = 'n-root'
const DOC = pageDoc({ id: ROOT_ID, type: 'Page', children: [{ id: 'n-list', type: 'List', props: {} }] })
const OTHER_DOC = pageDoc({ id: 'n-other', type: 'Page', children: [] })
const PAGE_TITLE = '회원 목록'

/** 하네스가 처음 세션으로 내는 사람(`editor-harness.tsx`의 `USER`). */
const ALICE: SessionUser = { id: 'u-1', email: 'me@example.com', name: '테스터' }
const BOB: SessionUser = { id: 'u-2', email: 'bob@example.com', name: '밥' }

const PROJECT: ProjectDetail = {
  id: 'p-1',
  name: PROJECT_NAME,
  slug: 'admin-console',
  description: null,
  role: 'owner',
}

// ---- 저장소 ----

/** 읽은 키를 세고, 켜면 쓰기가 던지는 `Storage`. */
class MemoryStorage implements Storage {
  readonly #items = new Map<string, string>()
  readonly reads: string[] = []
  failWrites = false

  get length(): number {
    return this.#items.size
  }

  clear(): void {
    this.#items.clear()
  }

  getItem(key: string): string | null {
    this.reads.push(key)
    return this.#items.get(key) ?? null
  }

  key(index: number): string | null {
    return [...this.#items.keys()][index] ?? null
  }

  removeItem(key: string): void {
    this.#items.delete(key)
  }

  setItem(key: string, value: string): void {
    if (this.failWrites) throw new DOMException('저장소가 찼다', 'QuotaExceededError')
    this.#items.set(key, String(value))
  }

  /** 초안 칸의 키들(사람마다). */
  draftKeys(): string[] {
    return [...this.#items.keys()].filter((key) => key.startsWith(DRAFT_KEY_PREFIX))
  }

  /** 저장소에 든 글 전부 — «그 사람의 글이 남았나»를 셀 때. */
  dump(): string {
    return [...this.#items.values()].join('\n')
  }
}

/** 한 탭 — 그 탭의 `sessionStorage`와, 탭끼리 나누는 `localStorage`. */
interface Tab {
  session: MemoryStorage
  shared: MemoryStorage
  /** 이 문서의 사본 객체. **새로고침하면 새것이다**(`reload`). */
  store: DraftStore
}

function tab(shared = new MemoryStorage()): Tab {
  const session = new MemoryStorage()
  return {
    session,
    shared,
    store: openDraftStore(
      () => session,
      () => shared,
    ),
  }
}

/** 새 문서 — 같은 저장소 위의 새 사본 객체. */
function renewed(current: Tab): Tab {
  return {
    ...current,
    store: openDraftStore(
      () => current.session,
      () => current.shared,
    ),
  }
}

// ---- 화면 ----

function box(): HTMLTextAreaElement {
  return screen.getByRole('textbox', { name: '페이지 설명' }) as HTMLTextAreaElement
}

function commentBox(): HTMLTextAreaElement {
  return screen.getByRole('textbox', { name: '새 코멘트' }) as HTMLTextAreaElement
}

function type(target: HTMLTextAreaElement, value: string): void {
  if (target.disabled) throw new Error('꺼진 상자에는 칠 수 없다 — 실브라우저에서 없는 길이다')
  fireEvent.change(target, { target: { value } })
}

function toView(): void {
  fireEvent.click(screen.getByRole('button', { name: '뷰 모드' }))
}

async function toCommentTab(): Promise<void> {
  fireEvent.click(screen.getByRole('tab', { name: '코멘트' }))
  await screen.findByRole('textbox', { name: '새 코멘트' })
}

function tree(): HTMLElement {
  return screen.getByRole('region', { name: '메뉴·페이지 트리' })
}

/** 앱 안에서 다른 페이지로 — 메뉴 트리의 링크. */
async function toPage(title: string, rootId: string): Promise<void> {
  fireEvent.click(within(tree()).getByRole('link', { name: title }))
  await waitForNode(rootId)
}

/** 프로젝트 목록으로 나간다. */
async function toList(): Promise<void> {
  fireEvent.click(screen.getByRole('link', { name: '프로젝트 목록' }))
  await screen.findByRole('link', { name: PROJECT_NAME })
}

/** 목록에서 그 프로젝트(페이지 없는 에디터) → 그 페이지. 사용자가 하는 길이다. */
async function fromList(title: string = PAGE_TITLE, rootId: string = ROOT_ID): Promise<void> {
  fireEvent.click(screen.getByRole('link', { name: PROJECT_NAME }))
  const region = await screen.findByRole('region', { name: '메뉴·페이지 트리' })
  fireEvent.click(await within(region).findByRole('link', { name: title }))
  await waitForNode(rootId)
}

async function logout(): Promise<void> {
  chooseFromShellMenu('로그아웃')
  await screen.findByLabelText('이메일')
}

async function login(user: SessionUser): Promise<void> {
  fireEvent.change(screen.getByLabelText('이메일'), { target: { value: user.email } })
  fireEvent.change(screen.getByLabelText('비밀번호'), { target: { value: '아무 비밀번호' } })
  fireEvent.click(screen.getByRole('button', { name: '로그인' }))
  await screen.findByRole('link', { name: PROJECT_NAME })
}

/** 서버가 세션을 지운다 → 목록으로 가려던 조회가 401 → 로그인 화면(`SignedOut`). 로그아웃 단추가 아니다. */
async function expireToLogin(backend: { expire: () => void }): Promise<void> {
  backend.expire()
  fireEvent.click(screen.getByRole('link', { name: '프로젝트 목록' }))
  await screen.findByLabelText('이메일')
}

/** 새로고침 — 트리를 내리고 같은 저장소 위에 다시 세운다(머리말). 돌려준 탭을 이어 쓴다. */
async function reload(current: Tab, options: EditorOptions): Promise<Tab> {
  cleanup()
  const next = renewed(current)
  await openPage(DOC, { ...options, draftStore: next.store })
  return next
}

// ---- 서버 흉내 ----

/**
 * 서버. 설명은 곧바로 쓰고, **코멘트 게시는 붙잡는다** — `commit()`이 서버에 쓴다(응답은 안 준다: 브라우저가
 * 끊었다). **멱등 키를 서버처럼 받는다** — 같은 키로 이미 커밋됐으면 앞 행을 돌려주고(재생), 붙잡힌 게시가
 * 커밋될 때도 한 번 더 본다. `expire()`는 서버가 세션을 지운 것이다 — 다음 조회가 401 이고, 같은 사람이
 * 로그인하면 풀린다.
 */
function server(): {
  overrides: Partial<ApiClient>
  rows: () => Comment[]
  keys: (string | undefined)[]
  description: () => string | null
  commit: (index?: number) => void
  respond: (index?: number) => Promise<void>
  expire: () => void
  edit: (id: string, body: string) => void
  remove: (id: string) => void
  staleNext: () => void
} {
  let description: string | null = '서버 값'
  let rows: Comment[] = []
  let next = 100
  let expired = false
  let stale = false
  const byKey = new Map<string, Comment>()
  const keys: (string | undefined)[] = []
  const waiting: { commit: () => void; resolve: () => void }[] = []
  const read = (pageId: string): PageDetail => ({
    ...pageDetail(pageId, pageId === PAGE_ID ? DOC : OTHER_DOC),
    description: pageId === PAGE_ID ? description : null,
  })
  const row = (nodeId: string, body: string): Comment => ({
    id: `c-${next++}`,
    nodeId,
    body,
    authorId: ALICE.id,
    authorName: ALICE.name,
    createdAt: '2026-09-23T09:00:00.000Z',
    updatedAt: '2026-09-23T09:00:00.000Z',
  })
  const replay = (found: Comment): CommentCreated => ({ comment: found, marker: null, seq: HEAD_SEQ, markerOps: [] })
  /**
   * 같은 키에 다른 글이면 409 + 이슈 코드다(`apps/api`의 `replayOf`). **행은 지금 값으로 견준다** — 그 사이
   * 고쳐졌으면 처음 글을 다시 보내도 409 다.
   */
  const reused = (): ApiError =>
    new ApiError(409, 'conflict', '같은 멱등 키로 다른 코멘트가 이미 달렸습니다', [
      { path: 'idempotencyKey', message: '같은 멱등 키로 다른 코멘트가 이미 달렸습니다', code: 'idempotency-key-reused' },
    ])
  /**
   * 그 키의 행이 달렸다가 지워졌으면 409 + 이슈 코드다(`apps/api`의 묘비). **키만 기억한다** — 서버의
   * 묘비도 본문을 들지 않는다.
   */
  const deleted = (): ApiError =>
    new ApiError(409, 'conflict', '같은 멱등 키로 달린 코멘트가 그 뒤 지워졌습니다', [
      { path: 'idempotencyKey', message: '같은 멱등 키로 달린 코멘트가 그 뒤 지워졌습니다', code: 'idempotency-key-deleted' },
    ])
  const current = (key: string): Comment | undefined => {
    const found = byKey.get(key)
    return found === undefined ? undefined : rows.find((one) => one.id === found.id)
  }
  return {
    rows: () => rows,
    keys,
    description: () => description,
    expire: () => {
      expired = true
    },
    /** 같은 사람이 **다른 탭에서** 그 코멘트를 고친다(`PATCH` — 서버만 바뀐다). */
    edit: (id, body) => {
      rows = rows.map((one) => (one.id === id ? { ...one, body } : one))
    },
    /** 누군가 그 코멘트를 지운다(`DELETE` — 서버만 바뀐다). 키를 든 행이면 서버가 그 키를 기억한다. */
    remove: (id) => {
      rows = rows.filter((one) => one.id !== id)
    },
    /** 다음 게시가 낡음 409 를 받는다 — **이슈 코드가 없다**(`apps/api`의 `stale`). */
    staleNext: () => {
      stale = true
    },
    commit: (index = 0) => {
      const entry = waiting[index]
      if (entry === undefined) throw new Error('붙잡힌 게시가 없다')
      entry.commit()
    },
    respond: async (index = 0) => {
      const entry = waiting[index]
      if (entry === undefined) throw new Error('붙잡힌 게시가 없다')
      await act(async () => {
        entry.resolve()
      })
    },
    overrides: {
      me: async () => ALICE,
      login: (async (email: string) => {
        expired = false
        return email === BOB.email ? BOB : ALICE
      }) as never,
      logout: async () => undefined,
      listProjects: async () => {
        if (expired) throw new ApiError(401, 'unauthenticated', '로그인이 필요합니다')
        return [PROJECT]
      },
      getPage: (async (_projectId: string, pageId: string) => {
        if (pageId !== PAGE_ID && pageId !== OTHER_PAGE_ID) throw new ApiError(404, 'not-found', '없는 페이지')
        return read(pageId)
      }) as never,
      updatePage: (async (_projectId: string, pageId: string, body: { description?: string | null }) => {
        if (pageId === PAGE_ID) description = body.description ?? null
        return read(pageId)
      }) as never,
      listComments: async () => [...rows],
      createComment: ((
        _projectId: string,
        _pageId: string,
        body: { nodeId: string; body: string; idempotencyKey?: string },
        options?: WriteOptions,
      ) => {
        keys.push(body.idempotencyKey)
        if (stale) {
          stale = false
          return Promise.reject(new ApiError(409, 'conflict', '페이지가 이미 변경되었습니다 (요청 baseSeq 1, 현재 2)'))
        }
        const found = body.idempotencyKey === undefined ? undefined : current(body.idempotencyKey)
        if (found !== undefined) {
          return found.body === body.body && found.nodeId === body.nodeId ? Promise.resolve(replay(found)) : Promise.reject(reused())
        }
        if (body.idempotencyKey !== undefined && byKey.has(body.idempotencyKey)) return Promise.reject(deleted())
        return new Promise<CommentCreated>((resolve, reject) => {
          options?.signal?.addEventListener('abort', () => reject(new ApiError(0, 'internal', '서버에 연결하지 못했습니다')))
          let result: CommentCreated | undefined
          const commit = (): void => {
            if (result !== undefined) return
            const first = body.idempotencyKey === undefined ? undefined : current(body.idempotencyKey)
            if (first !== undefined) {
              result = replay(first)
              return
            }
            const created = row(body.nodeId, body.body)
            rows = [...rows, created]
            if (body.idempotencyKey !== undefined) byKey.set(body.idempotencyKey, created)
            result = { comment: created, marker: null, seq: HEAD_SEQ, markerOps: [] }
          }
          waiting.push({
            commit,
            resolve: () => {
              commit()
              resolve(result as CommentCreated)
            },
          })
        })
      }) as never,
    },
  }
}

/** 서버와 탭으로 에디터를 연다. */
async function open(backend: ReturnType<typeof server>, current: Tab, extra: EditorOptions = {}): Promise<EditorOptions> {
  const options: EditorOptions = {
    apiOverrides: backend.overrides,
    docs: { [OTHER_PAGE_ID]: OTHER_DOC },
    ...extra,
  }
  await openPage(DOC, { ...options, draftStore: current.store })
  return options
}

/**
 * ## 새로고침 — 살린다
 *
 * | 변조 | 죽는 것 |
 * |---|---|
 * | 설명 초안 칸이 되읽지 않는다(`DRAFT`의 `load`가 늘 `undefined`) | 셋 — 이 절 첫 케이스 · *"설명 — 401 로 …"* · *"프로젝트 목록을 다녀와 같은 페이지 …"*. **축의 주인은 이 절 첫 케이스** |
 * | 설명 초안 칸이 비추지 않는다(`save`가 늘 `undefined`) | 여섯 — 위 셋과, 설명을 «칸이 섰다»의 탐침으로 쓰는 로그아웃·다른 사람 케이스 셋 |
 * | 새 코멘트 초안 칸이 비추지 않는다(`DRAFTS`) | 둘 — 이 절 둘째 케이스와 *"코멘트 — 게시가 서버에 쥐인 채 401 …"*. **축의 주인은 이 절 둘째 케이스** |
 * | 키 칸이 비추지 않는다(`POST_KEYS`) — 글은 살고 키는 새것 | 같은 둘(DB 두 행) — 주인도 같다 |
 * | 달린 뒤의 빈 초안도 칸에 적는다(`DRAFTS`의 `save`가 빈 표를 낸다) | *"달린 뒤에는 …"* **혼자** |
 * | 고치던 코멘트 칸이 비추지 않는다(`EDITING_ID`) | *"고치던 코멘트 — …"* **혼자** |
 * | provider 가 저장소를 안 읽는다(`fresh`가 빈 방문) | 여섯 — 이어 받는 케이스 전부 |
 */
describe('새로고침 — 초안과 키를 살린다', () => {
  it('설명 — 친 글이 새로고침을 넘는다: 상자에 그 글 · 저장 단추가 열려 있다', async () => {
    const backend = server()
    let current = tab()
    const options = await open(backend, current)
    toView()
    await waitFor(() => expect(box().value).toBe('서버 값'))
    type(box(), '저장 안 한 설명')

    current = await reload(current, options)
    toView()

    await waitFor(() => expect(box().value).toBe('저장 안 한 설명'))
    expect((screen.getByRole('button', { name: '설명 저장' }) as HTMLButtonElement).disabled).toBe(false)
    expect(backend.description()).toBe('서버 값')
  })

  it('코멘트 — 게시가 «모름»인 채 새로고침: 글과 키가 되살아나 다시 달면 재생 · 한 행', async () => {
    const backend = server()
    let current = tab()
    const options = await open(backend, current)
    await toCommentTab()
    type(commentBox(), '매달린 말')
    fireEvent.click(screen.getByRole('button', { name: '코멘트 달기' }))
    await waitFor(() => expect(backend.keys).toHaveLength(1))

    current = await reload(current, options)
    // 서버는 끊긴 게시를 **새로고침 뒤에** 커밋한다(Chrome 에서 잰 판 — 요청이 이미 서버에 있었다).
    backend.commit(0)
    expect(backend.rows().map((row) => row.body)).toEqual(['매달린 말'])

    await toCommentTab()
    expect(commentBox().value).toBe('매달린 말')
    fireEvent.click(screen.getByRole('button', { name: '코멘트 달기' }))
    await waitFor(() => expect(commentBox().value).toBe(''))

    expect(backend.keys).toHaveLength(2)
    expect(backend.keys[1]).toBe(backend.keys[0])
    expect(backend.rows().map((row) => row.body)).toEqual(['매달린 말'])
  })

  it('달린 뒤에는 초안도 키도 저장소에 없다 — 새로고침해도 빈 상자', async () => {
    const backend = server()
    let current = tab()
    const options = await open(backend, current)
    await toCommentTab()
    type(commentBox(), '곧 달릴 말')
    fireEvent.click(screen.getByRole('button', { name: '코멘트 달기' }))
    await waitFor(() => expect(backend.keys).toHaveLength(1))
    await backend.respond(0)
    await waitFor(() => expect(commentBox().value).toBe(''))

    expect(current.session.draftKeys()).toEqual([])
    current = await reload(current, options)
    await toCommentTab()
    expect(commentBox().value).toBe('')
  })

  it('고치던 코멘트 — 편집 칸과 글이 새로고침을 넘는다', async () => {
    const backend = server()
    let current = tab()
    const options = await open(backend, current)
    await toCommentTab()
    type(commentBox(), '고칠 말')
    fireEvent.click(screen.getByRole('button', { name: '코멘트 달기' }))
    await waitFor(() => expect(backend.keys).toHaveLength(1))
    await backend.respond(0)
    fireEvent.click(await screen.findByRole('button', { name: '수정' }))
    type(screen.getByRole('textbox', { name: '코멘트 수정' }) as HTMLTextAreaElement, '고치던 중')

    current = await reload(current, options)
    await toCommentTab()

    const editing = (await screen.findByRole('textbox', { name: '코멘트 수정' })) as HTMLTextAreaElement
    expect(editing.value).toBe('고치던 중')
  })
})

/**
 * ## 되살린 키 — 그 사이 그 코멘트가 고쳐졌거나 지워졌으면 «달림»이다
 *
 * | 변조 | 죽는 것 |
 * |---|---|
 * | 웹이 이슈 코드를 안 본다(`keyVerdict`가 늘 `null` — 409 를 «안 달림»으로) | *"되살린 글을 달기 전에 다른 탭이 …"* · *"되살린 글을 달기 전에 그 코멘트가 지워졌다 …"* |
 * | 웹이 이슈 코드 없이 409 면 «달림»(`keyVerdict`가 `code === 'conflict'`만 본다) | *"이슈 코드가 없는 409(낡음)는 …"* |
 * | 웹이 `idempotency-key-deleted`를 모른다(`KEY_VERDICTS`에서 뺀다) | *"되살린 글을 달기 전에 그 코멘트가 지워졌다 …"* |
 * | 지워졌는데 «고쳐졌다»고 말한다(통지가 판정을 안 가른다) | *"되살린 글을 달기 전에 그 코멘트가 지워졌다 …"* |
 *
 * 혼자 죽는지는 적지 않는다 — 다시 재려면 한 줄씩 심고 이 파일을 돌린다.
 */
describe('되살린 키 — 그 사이 고쳐졌으면 달림으로 끝낸다', () => {
  it('되살린 글을 달기 전에 다른 탭이 그 코멘트를 고쳤다 — 409 를 «달림»으로: 상자 비움 · 알림 · 저장소에 없음 · 새로고침해도 안 돌아옴', async () => {
    const backend = server()
    let current = tab()
    const options = await open(backend, current)
    await toCommentTab()
    type(commentBox(), '되살릴 말')
    fireEvent.click(screen.getByRole('button', { name: '코멘트 달기' }))
    await waitFor(() => expect(backend.keys).toHaveLength(1))

    current = await reload(current, options)
    backend.commit(0)
    // 같은 사람이 다른 탭에서 그 코멘트를 고친다(서버만 바뀐다).
    backend.edit(backend.rows()[0]!.id, '다른 탭에서 고친 말')
    await toCommentTab()
    expect(commentBox().value).toBe('되살릴 말')
    fireEvent.click(screen.getByRole('button', { name: '코멘트 달기' }))

    await screen.findByText('이 글은 이미 달렸고, 그 뒤 다른 곳에서 고쳐졌습니다 — 목록의 글이 지금 글입니다')
    expect(commentBox().value).toBe('')
    expect(screen.queryByRole('alert')).toBeNull()
    await screen.findByText('다른 탭에서 고친 말')
    expect(current.session.draftKeys()).toEqual([])
    expect(backend.keys[1]).toBe(backend.keys[0])
    expect(backend.rows().map((row) => row.body)).toEqual(['다른 탭에서 고친 말'])

    current = await reload(current, options)
    await toCommentTab()
    expect(commentBox().value).toBe('')
  })

  it('되살린 글을 달기 전에 그 코멘트가 지워졌다 — 묘비 409 를 «달림»으로: 상자 비움 · 누가 지웠는지 말하지 않는 문장 · 저장소에 없음 · 새로고침해도 안 돌아옴 · 행 0', async () => {
    // 서버가 그 키를 기억해 `idempotency-key-deleted`를 싣고, 웹은 그 코드 하나로 끝낸다. 서버가 키를 잊으면 여기서
    // 새 행을 세운다(지운 말이 통지 없이 되살아난다 — Chrome 에서 잰 고장 방식). 웹이 코드를 안 보면 4xx 라 «안 달림» —
    // 초안과 키가 남아 누를 때마다 같은 409 다.
    const backend = server()
    let current = tab()
    const options = await open(backend, current)
    await toCommentTab()
    type(commentBox(), '지워질 말')
    fireEvent.click(screen.getByRole('button', { name: '코멘트 달기' }))
    await waitFor(() => expect(backend.keys).toHaveLength(1))

    current = await reload(current, options)
    backend.commit(0)
    // 그 사이 누군가(제 손의 다른 탭이든 남이든) 그 코멘트를 지운다.
    backend.remove(backend.rows()[0]!.id)
    await toCommentTab()
    expect(commentBox().value).toBe('지워질 말')
    fireEvent.click(screen.getByRole('button', { name: '코멘트 달기' }))

    await screen.findByText('이 글은 이미 달렸고, 그 뒤 지워졌습니다')
    expect(commentBox().value).toBe('')
    expect(screen.queryByRole('alert')).toBeNull()
    expect(current.session.draftKeys()).toEqual([])
    expect(backend.keys[1]).toBe(backend.keys[0])
    expect(backend.rows()).toEqual([])

    current = await reload(current, options)
    await toCommentTab()
    expect(commentBox().value).toBe('')
  })

  it('이슈 코드가 없는 409(낡음)는 «달림»이 아니다 — 초안과 키가 남고 실패를 말한다', async () => {
    const backend = server()
    const current = tab()
    await open(backend, current)
    await toCommentTab()
    type(commentBox(), '낡음에 막힐 말')
    backend.staleNext()
    fireEvent.click(screen.getByRole('button', { name: '코멘트 달기' }))

    expect((await screen.findByRole('alert')).textContent).toContain('페이지가 이미 변경되었습니다')
    expect(commentBox().value).toBe('낡음에 막힐 말')
    expect(current.session.dump()).toContain('낡음에 막힐 말')
    expect(backend.rows()).toEqual([])
  })
})

/**
 * ## 세션 만료(401) — 같은 사람이 다시 들어오면 살린다
 *
 * | 변조 | 죽는 것 |
 * |---|---|
 * | 401(`invalidate`)도 사본을 지운다 | 넷 — 이 절 둘과, 만료로 앞 사람의 칸을 세우는 *"로그아웃은 이 탭의 모든 …"* · *"같은 탭 — 앨리스가 …"*. **축의 주인은 이 절 첫 케이스** |
 * | 페이지 없는 에디터(`/projects/:id`)가 저장소를 쓴다(비운다) | 이 절 둘과 *"프로젝트 목록을 다녀와 같은 페이지 …"* — **축의 주인은 그 케이스**(«다른 페이지로 가면 버린다» 절) |
 *
 * **둘째 케이스(코멘트)는 혼자 죽지 않는다** — 코멘트 칸(위 절 둘째 케이스)과 401(이 절 첫 케이스)의 축이 겹친 자리다.
 * 남기는 까닭은 이 입구의 결함 값(«같은 키 → 한 행»)을 잰 유일한 케이스라서다.
 */
describe('세션 만료 — 같은 사람이 다시 들어오면 이어 쓴다', () => {
  it('설명 — 401 로 로그인 화면에 갔다가 같은 사람으로 들어와 그 페이지로 가면 친 글이 있다', async () => {
    const backend = server()
    const current = tab()
    await open(backend, current)
    toView()
    await waitFor(() => expect(box().value).toBe('서버 값'))
    type(box(), '만료 전에 친 설명')

    await expireToLogin(backend)
    await login(ALICE)
    await fromList()
    toView()

    await waitFor(() => expect(box().value).toBe('만료 전에 친 설명'))
  })

  it('코멘트 — 게시가 서버에 쥐인 채 401 → 같은 사람 → 같은 글 · 같은 키 → 재생 · 한 행', async () => {
    const backend = server()
    const current = tab()
    await open(backend, current)
    await toCommentTab()
    type(commentBox(), '만료 전의 말')
    fireEvent.click(screen.getByRole('button', { name: '코멘트 달기' }))
    await waitFor(() => expect(backend.keys).toHaveLength(1))

    await expireToLogin(backend)
    // 끊긴 게시는 서버에서 커밋된다(Chrome — 서버가 이미 받았다).
    backend.commit(0)
    await login(ALICE)
    await fromList()
    await toCommentTab()

    expect(commentBox().value).toBe('만료 전의 말')
    fireEvent.click(screen.getByRole('button', { name: '코멘트 달기' }))
    await waitFor(() => expect(commentBox().value).toBe(''))
    expect(backend.keys[1]).toBe(backend.keys[0])
    expect(backend.rows().map((row) => row.body)).toEqual(['만료 전의 말'])
  })
})

/**
 * ## 명시적 로그아웃 — 지운다
 *
 * | 변조 | 죽는 것 |
 * |---|---|
 * | 로그아웃 단추(`signOut`)가 지우지 않는다(세대도 안 올린다) | 셋 — 첫 케이스와 «로그아웃 표지» 절의 *"로그아웃 소식은 올린 세대를 …"* · *"늦게 들은 탭이 …"*. **축의 주인은 첫 케이스** |
 * | 다른 탭의 로그아웃 소식이 지우지 않는다 | *"다른 탭의 로그아웃 — …"* **혼자** |
 * | 지우는 것이 **마지막 칸 하나**다(앞 사람 칸이 남는다) | *"로그아웃은 이 탭의 모든 사람 칸을 지운다 …"* **혼자** |
 * | 문서가 설 때 표지보다 앞선 사본을 안 쓸어 낸다(`sweep`을 뗀다) | 둘 — *"닫아 둔 탭 — …"* · *"소식을 못 들은 탭이 …"*. **축의 주인은 *"닫아 둔 탭 — …"*** |
 * | 사본에 이 탭의 세대 대신 **쓸 때 읽은 표지**를 싣는다(`keep`) | *"소식을 못 들은 탭이 …"* **혼자** |
 * | 읽을 때 표지를 안 본다(`recall`) | *"연 뒤에 다른 탭이 로그아웃해도 …"* **혼자** |
 * | 로그아웃 뒤에도 그 전에 선 provider 가 쓴다(`keep`이 `since`를 안 본다) | *"로그아웃 뒤에 커밋된 앞 화면은 …"* **혼자** |
 *
 * 셋째 케이스는 화면 흐름(만료 → 밥 로그인 → 로그아웃)이 아니라 사본 단위로 잰다 — 밥이 들어오는 순간 앨리스의
 * 칸이 지워지므로(아래 «다른 사람» 절) 화면 흐름으로는 두 사람의 칸을 세울 수 없다.
 */
describe('명시적 로그아웃 — 이 브라우저에 그 사람의 초안·키를 남기지 않는다', () => {
  it('로그아웃 단추 — 저장소에 초안 칸이 0 이고, 같은 사람이 다시 들어와도 빈 상자다', async () => {
    const backend = server()
    const current = tab()
    await open(backend, current)
    await toCommentTab()
    type(commentBox(), '공용 기기에 남으면 안 되는 말')
    fireEvent.click(screen.getByRole('button', { name: '코멘트 달기' }))
    await waitFor(() => expect(backend.keys).toHaveLength(1))
    expect(current.session.draftKeys()).toEqual([`${DRAFT_KEY_PREFIX}${ALICE.id}`])

    await logout()

    expect(current.session.draftKeys()).toEqual([])
    expect(current.session.dump()).not.toContain('공용 기기')
    expect(current.shared.dump()).not.toContain('공용 기기')
    await login(ALICE)
    await fromList()
    await toCommentTab()
    expect(commentBox().value).toBe('')
  })

  it('다른 탭의 로그아웃 — 이 탭의 저장소도 비운다', async () => {
    const backend = server()
    const hub = tabHub()
    const current = tab()
    await open(backend, current, { tabChannel: hub.channel })
    toView()
    await waitFor(() => expect(box().value).toBe('서버 값'))
    type(box(), '다른 탭이 로그아웃할 설명')
    expect(current.session.draftKeys()).toHaveLength(1)

    await hub.fromOtherTab({ kind: 'signed-out' })
    await screen.findByLabelText('이메일')

    expect(current.session.draftKeys()).toEqual([])
  })

  it('로그아웃은 이 탭의 모든 사람 칸을 지운다 — 사람을 알기 전에 남아 있던 앞 사람의 것도', () => {
    // 다른 사람이 들어오면 앞 사람의 칸은 그때 지워지므로(아래 «다른 사람» 절) 두 사람의 칸이 함께 있는 것은
    // **이 탭의 사람을 알기 전**(`admit` 전 — 문서가 선 뒤 `me()`의 답 전)이거나 그 지우기가 던진 판이다.
    const session = new MemoryStorage()
    const store = openDraftStore(
      () => session,
      () => new MemoryStorage(),
    )
    const visit = { projectId: 'p-1', pageId: PAGE_ID, slots: { 'page-description/draft': '설명' } }
    store.keep(ALICE.id, visit, store.generation)
    store.keep(BOB.id, visit, store.generation)
    expect(session.draftKeys().sort()).toEqual([`${DRAFT_KEY_PREFIX}${ALICE.id}`, `${DRAFT_KEY_PREFIX}${BOB.id}`])

    store.forget()

    expect(session.draftKeys()).toEqual([])
  })

  it('닫아 둔 탭 — 로그아웃 뒤에 다시 열면 그 탭의 사본을 열자마자 지운다', () => {
    // 탭 B 에 앨리스의 초안이 있고 B 를 닫았다 → 탭 A 에서 로그아웃 → B 를 다시 연다(Chrome 은 B 의
    // `sessionStorage`를 되살린다 — Chromium 151 의 값은 `write-ledger.tsx`의 입구 표). B 는 로그아웃 소식을 못 받았다.
    const shared = new MemoryStorage()
    const bSession = new MemoryStorage()
    const b = openDraftStore(
      () => bSession,
      () => shared,
    )
    b.keep(ALICE.id, { projectId: 'p-1', pageId: PAGE_ID, slots: { 'page-description/draft': 'B 의 설명' } }, b.generation)
    const a = openDraftStore(
      () => new MemoryStorage(),
      () => shared,
    )
    expect(a.forget()).toBe(1)

    // **다시 열리는 것만으로 지운다** — 읽기를 기다리면 되살린 탭에 다른 사람이 들어온 판에서 아무도 안 읽는다.
    openDraftStore(
      () => bSession,
      () => shared,
    )
    expect(bSession.draftKeys()).toEqual([])
    expect(shared.getItem(FORGOTTEN_KEY)).toBe('1')
  })

  it('연 뒤에 다른 탭이 로그아웃해도(소식이 안 닿은 판) — 읽기 전에 표지를 본다', () => {
    const shared = new MemoryStorage()
    const bSession = new MemoryStorage()
    const b = openDraftStore(
      () => bSession,
      () => shared,
    )
    b.keep(ALICE.id, { projectId: 'p-1', pageId: PAGE_ID, slots: { 'page-description/draft': 'B 의 설명' } }, b.generation)
    openDraftStore(
      () => new MemoryStorage(),
      () => shared,
    ).forget()

    expect(b.recall(ALICE.id, 'p-1', PAGE_ID)).toEqual({})
    expect(bSession.draftKeys()).toEqual([])
  })

  it('소식을 못 들은 탭이 로그아웃 **뒤에** 쓴 사본도 — 그 탭의 옛 세대를 실어 지워진다', () => {
    // 사본은 **쓴 탭이 아는 세대**를 싣는다 — 쓸 때 표지를 다시 읽지 않는다(`draft-store.tsx`의 «표지는 세대 번호다»).
    // 표지와 사본을 시각으로 견주면 이 사본(얼린 탭이 표지보다 늦은 시각에 쓴 것)이 남는다.
    const shared = new MemoryStorage()
    const bSession = new MemoryStorage()
    const b = openDraftStore(
      () => bSession,
      () => shared,
    )
    openDraftStore(
      () => new MemoryStorage(),
      () => shared,
    ).forget()
    b.keep(ALICE.id, { projectId: 'p-1', pageId: PAGE_ID, slots: { 'page-description/draft': '못 듣고 친 설명' } }, b.generation)

    openDraftStore(
      () => bSession,
      () => shared,
    )
    expect(bSession.draftKeys()).toEqual([])
  })

  it('로그아웃 뒤에 커밋된 앞 화면은 저장소에 쓰지 못한다 — 로그아웃 소식과 화면이 내려가는 렌더 사이', () => {
    const session = new MemoryStorage()
    const store = openDraftStore(
      () => session,
      () => new MemoryStorage(),
    )
    const since = store.generation
    store.forget()
    store.keep(ALICE.id, { projectId: 'p-1', pageId: PAGE_ID, slots: { 'page-description/draft': '늦은 글자' } }, since)
    expect(session.draftKeys()).toEqual([])
    // 로그아웃 **뒤에** 선 provider 는 쓴다.
    store.keep(ALICE.id, { projectId: 'p-1', pageId: PAGE_ID, slots: { 'page-description/draft': '새 글' } }, store.generation)
    expect(session.draftKeys()).toEqual([`${DRAFT_KEY_PREFIX}${ALICE.id}`])
  })
})

/**
 * ## 로그아웃 표지는 세대 번호다 — 친 초안이 늦은 소식 · 시계에 사라지지 않는다
 *
 * | 변조 | 죽는 것 |
 * |---|---|
 * | 듣는 탭이 소식의 번호를 안 쓰고 스스로 올린다(`forgetHeard`가 `max(표지, 이 탭의 세대) + 1`) | *"늦게 들은 탭이 표지를 덮지 않는다 …"* |
 * | 로그아웃 소식에 번호를 안 싣는다(`signOut`의 `announce`) | *"로그아웃 소식은 올린 세대를 싣는다"* |
 * | 번호 없는 소식(옛 판 앱을 띄운 탭의 것)에 표지를 읽어 +1 한다 | *"옛 판 탭의 소식 …"* |
 * | 표지 · 사본을 벽시계로 되돌린다(`forget`이 `Date.now()`를 적고 `keep`이 `Date.now()`를 싣는다) | *"로그아웃 뒤 시계가 뒤로 가도 …"* |
 *
 * 혼자 죽는지는 적지 않는다 — 이 머리말은 변조와 그것을 재는 케이스만 적는다.
 */
describe('로그아웃 표지 — 세대 번호', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('로그아웃 소식은 올린 세대를 싣는다 — 표지와 같은 번호', async () => {
    const backend = server()
    const hub = tabHub()
    const current = tab()
    await open(backend, current, { tabChannel: hub.channel })

    await logout()

    expect(hub.posted).toEqual([{ kind: 'signed-out', era: 1 }])
    expect(current.shared.getItem(FORGOTTEN_KEY)).toBe('1')
  })

  it('늦게 들은 탭이 표지를 덮지 않는다 — 로그아웃 뒤 다시 들어와 친 초안이 새로고침을 넘는다', async () => {
    // 듣는 탭이 표지를 **들은 시각**으로 적으면, 그 사이 같은 사람이 다시 들어와 친 사본이 «로그아웃보다 앞선 것»이
    // 되어 새로고침에 `""`이다(Chrome 에서 소식 수신을 4000ms 늦춰 잰 고장 방식).
    const backend = server()
    let current = tab()
    // 다른 탭 B — 로그아웃 **전에** 떴고 소식을 늦게 듣는다.
    const other = openDraftStore(
      () => new MemoryStorage(),
      () => current.shared,
    )
    const options = await open(backend, current)
    await logout()
    await login(ALICE)
    await fromList()
    toView()
    await waitFor(() => expect(box().value).toBe('서버 값'))
    type(box(), '다시 들어와 친 설명')

    // B 가 이제야 로그아웃 소식(번호 1)을 듣는다.
    other.forgetHeard(1)
    current = await reload(current, options)
    toView()

    await waitFor(() => expect(box().value).toBe('다시 들어와 친 설명'))
  })

  it('옛 판 탭의 소식(번호 없음) — 들은 탭 둘이 같은 번호에 닿는다', () => {
    const shared = new MemoryStorage()
    const b = openDraftStore(
      () => new MemoryStorage(),
      () => shared,
    )
    const c = openDraftStore(
      () => new MemoryStorage(),
      () => shared,
    )

    b.forgetHeard(undefined)
    c.forgetHeard(undefined)

    // 각자 표지를 읽어 +1 하면 2 — 먼저 들은 B 가 다시 들어와 친 사본(세대 1)이 위 *"늦게 들은 탭이 …"*의 고장처럼 지워진다.
    expect(shared.getItem(FORGOTTEN_KEY)).toBe('1')
  })

  it('로그아웃 뒤 시계가 뒤로 가도(NTP 보정 · 수동 변경) — 다시 들어와 친 초안이 새로고침을 넘는다', async () => {
    // 표지와 사본을 벽시계로 견주면 새로고침 뒤 `""`이다(Chrome 에서 표지를 10분 앞당겨 흉내 낸 고장 방식).
    const backend = server()
    let current = tab()
    const options = await open(backend, current)
    await logout()
    const real = Date.now.bind(Date)
    vi.spyOn(Date, 'now').mockImplementation(() => real() - 600_000)
    await login(ALICE)
    await fromList()
    toView()
    await waitFor(() => expect(box().value).toBe('서버 값'))
    type(box(), '시계가 뒤로 간 뒤 친 설명')

    current = await reload(current, options)
    toView()

    await waitFor(() => expect(box().value).toBe('시계가 뒤로 간 뒤 친 설명'))
  })
})

/**
 * ## 다른 사람 — 절대 안 보이고, 들어오는 순간 앞 사람의 칸을 지운다
 *
 * | 변조 | 죽는 것 |
 * |---|---|
 * | 이 탭의 로그인(`confirm`)이 `admit`을 안 부른다 | *"같은 탭 — …"* |
 * | 다른 탭의 로그인 소식이 `admit`을 안 부른다 | *"다른 탭이 밥으로 들어온다 …"* |
 * | 마운트의 `me()`가 `admit`을 안 부른다 | *"새로 선 문서의 `me()`가 다른 사람 …"* |
 * | `admit` 뒤에도 앞 사람의 칸에 쓴다(`keep`이 사람을 안 본다) | *"사람이 바뀐 뒤 앞 사람의 화면은 …"* |
 * | `admit`이 아무것도 안 지운다 | 넷 — 이 절 전부. `admit`이 **자기 칸까지** 지우면 새로고침 · 세션 만료 · 로그아웃 표지 절의 여덟이 죽는다 |
 *
 * **«앨리스의 칸은 그대로 남는다»는 결함이다** — 다른 사람이 쓰는 탭의 저장소에 앞 사람의 글이 남는다. 혼자 죽는지는 적지 않는다.
 */
describe('다른 사람 — 앞 사람의 초안을 읽지 않고, 들어오는 순간 지운다', () => {
  it('같은 탭 — 앨리스가 만료로 나간 뒤 밥이 들어와 같은 페이지: 빈 상자 · 앨리스의 칸을 안 읽는다', async () => {
    const backend = server()
    const current = tab()
    await open(backend, current)
    toView()
    await waitFor(() => expect(box().value).toBe('서버 값'))
    type(box(), '앨리스의 설명')
    await expireToLogin(backend)
    current.session.reads.length = 0

    await login(BOB)
    // **들어오는 순간 지운다** — 페이지를 열기 전이다.
    expect(current.session.draftKeys()).toEqual([])
    expect(current.session.dump()).not.toContain('앨리스의 설명')
    await fromList()
    toView()

    await waitFor(() => expect(box().value).toBe('서버 값'))
    expect(current.session.reads).not.toContain(`${DRAFT_KEY_PREFIX}${ALICE.id}`)
    type(box(), '밥의 설명')
    expect(current.session.draftKeys()).toEqual([`${DRAFT_KEY_PREFIX}${BOB.id}`])
  })

  it('다른 탭이 밥으로 들어온다 — 목록으로 가고, 밥이 그 페이지를 열어도 앨리스의 글이 없다', async () => {
    const backend = server()
    const hub = tabHub()
    const current = tab()
    await open(backend, current, { tabChannel: hub.channel })
    toView()
    await waitFor(() => expect(box().value).toBe('서버 값'))
    type(box(), '앨리스의 설명')
    current.session.reads.length = 0

    await hub.fromOtherTab({ kind: 'signed-in', user: BOB })
    await screen.findByRole('link', { name: PROJECT_NAME })
    // 소식을 들은 순간 앨리스의 칸이 없다 — 앨리스의 화면이 내려가며 한 번 더 커밋돼도 다시 서지 않는다.
    expect(current.session.draftKeys()).toEqual([])
    await fromList()
    toView()

    await waitFor(() => expect(box().value).toBe('서버 값'))
    expect(current.session.reads).not.toContain(`${DRAFT_KEY_PREFIX}${ALICE.id}`)
  })

  it('새로 선 문서의 `me()`가 다른 사람 — 앞 사람의 칸을 지운다(닫아 둔 탭을 다시 열었더니 쿠키가 밥)', async () => {
    const backend = server()
    const current = tab()
    current.store.keep(
      ALICE.id,
      { projectId: 'p-1', pageId: PAGE_ID, slots: { 'page-description/draft': '앨리스의 설명' } },
      current.store.generation,
    )
    expect(current.session.draftKeys()).toEqual([`${DRAFT_KEY_PREFIX}${ALICE.id}`])

    await open(backend, current, { apiOverrides: { ...backend.overrides, me: async () => BOB } })
    toView()

    await waitFor(() => expect(box().value).toBe('서버 값'))
    expect(current.session.draftKeys()).toEqual([])
  })

  it('사람이 바뀐 뒤 앞 사람의 화면은 앞 사람의 칸에 못 쓴다 — 소식과 화면이 내려가는 렌더 사이', () => {
    const session = new MemoryStorage()
    const store = openDraftStore(
      () => session,
      () => new MemoryStorage(),
    )
    const visit = { projectId: 'p-1', pageId: PAGE_ID, slots: { 'page-description/draft': '앨리스의 늦은 글자' } }
    store.admit(ALICE.id)
    store.keep(ALICE.id, visit, store.generation)
    expect(session.draftKeys()).toEqual([`${DRAFT_KEY_PREFIX}${ALICE.id}`])

    store.admit(BOB.id)
    expect(session.draftKeys()).toEqual([])
    store.keep(ALICE.id, visit, store.generation)

    expect(session.draftKeys()).toEqual([])
  })
})

/**
 * ## 다른 페이지로 가면 버린다 — 저장소가 그것을 뒤집지 않는다
 *
 * | 변조 | 죽는 것 |
 * |---|---|
 * | 빈 방문이 저장소를 안 비운다(`keep`이 빈 칸이면 아무것도 안 한다) | 넷 — 버리는 케이스 셋과 *"달린 뒤에는 …"* |
 * | 사본이 페이지를 안 가린다(`recall`이 다른 페이지의 칸도 낸다) | 버리는 케이스 셋 |
 * | 페이지 없는 에디터가 저장소를 비운다 | *"프로젝트 목록을 다녀와 같은 페이지 …"* 와 «세션 만료» 둘 — **축의 주인은 이 케이스** |
 *
 * **버리는 케이스 셋(가 → 나 → 가 · 나에서 새로고침 · 목록을 지나 다른 페이지)은 늘 함께 죽는다** — 한 축(«저장소는
 * 마지막으로 연 페이지 하나만 든다»)을 세 입구로 지난다. **축의 주인은 첫 케이스**이고, 나머지 둘은 그 규칙이 새로고침과
 * 프로젝트 목록 왕복에서도 서는지를 잰다(저장소가 그 버림을 뒤집을 수 있는 두 입구다).
 */
describe('다른 페이지로 가면 버린다: 저장소는 이 탭이 마지막으로 연 페이지만 든다', () => {
  it('가 → 나 → 가(앱 안) — 돌아와도 빈 상자다', async () => {
    const backend = server()
    const current = tab()
    await open(backend, current)
    await toCommentTab()
    type(commentBox(), '가 페이지의 말')

    await toPage(OTHER_PAGE_TITLE, 'n-other')
    await toPage(PAGE_TITLE, ROOT_ID)
    await toCommentTab()

    expect(commentBox().value).toBe('')
  })

  it('가 → 나 → 나에서 새로고침 → 가 — 가의 초안이 돌아오지 않는다', async () => {
    const backend = server()
    let current = tab()
    const options = await open(backend, current)
    await toCommentTab()
    type(commentBox(), '가 페이지의 말')
    await toPage(OTHER_PAGE_TITLE, 'n-other')

    cleanup()
    current = renewed(current)
    await openPage(OTHER_DOC, {
      ...options,
      docs: { [PAGE_ID]: DOC },
      route: `/projects/p-1/pages/${OTHER_PAGE_ID}`,
      draftStore: current.store,
    })
    await toPage(PAGE_TITLE, ROOT_ID)
    await toCommentTab()

    expect(commentBox().value).toBe('')
  })

  it('프로젝트 목록을 다녀와 같은 페이지 — 이어 받는다(사이에 연 페이지가 없다)', async () => {
    const backend = server()
    const current = tab()
    await open(backend, current)
    toView()
    await waitFor(() => expect(box().value).toBe('서버 값'))
    type(box(), '목록을 다녀올 설명')

    await toList()
    await fromList()
    toView()

    await waitFor(() => expect(box().value).toBe('목록을 다녀올 설명'))
  })

  it('프로젝트 목록을 다녀와 다른 페이지로 → 가 — 버린다', async () => {
    const backend = server()
    const current = tab()
    await open(backend, current)
    toView()
    await waitFor(() => expect(box().value).toBe('서버 값'))
    type(box(), '버려질 설명')

    await toList()
    await fromList(OTHER_PAGE_TITLE, 'n-other')
    await toPage(PAGE_TITLE, ROOT_ID)
    toView()

    await waitFor(() => expect(box().value).toBe('서버 값'))
  })
})

/**
 * ## 저장소를 못 쓴다 — 사본 없이 돈다
 *
 * | 변조 | 죽는 것 |
 * |---|---|
 * | 저장소를 꺼내는 것을 `try`로 감싸지 않는다 | *"꺼내는 것부터 던진다 …"* **혼자** |
 * | 쓰기가 실패해도 앞 방문을 남긴다(`keep`의 `catch`가 안 지운다) | *"쓰기가 던진다 …"* **혼자** |
 * | 읽은 사본의 판(`v`)을 안 본다 | *"모양이 틀린 사본 …"* **혼자** |
 * | 읽은 사본의 JSON 해석을 `try`로 감싸지 않는다 | *"모양이 틀린 사본 …"* **혼자** |
 */
describe('저장소를 못 쓴다 — 앱은 이 파일 앞처럼 돈다', () => {
  it('꺼내는 것부터 던진다(비공개 창 · 사이트 데이터 차단) — 쳐지고, 저장되고, 새로고침하면 사라진다', async () => {
    const backend = server()
    const blocked = (): Storage => {
      throw new DOMException('접근이 막혔다', 'SecurityError')
    }
    const store = openDraftStore(blocked, blocked)
    const options: EditorOptions = { apiOverrides: backend.overrides, docs: { [OTHER_PAGE_ID]: OTHER_DOC } }
    await openPage(DOC, { ...options, draftStore: store })
    toView()
    await waitFor(() => expect(box().value).toBe('서버 값'))
    type(box(), '못 비추는 설명')
    fireEvent.click(screen.getByRole('button', { name: '설명 저장' }))
    await screen.findByText('설명을 저장했습니다')
    expect(backend.description()).toBe('못 비추는 설명')
    type(box(), '저장 안 한 둘째')
    await expireToLogin(backend)
    await login(ALICE)
    await fromList()
    toView()

    // 저장소를 쓸 수 있으면 «저장 안 한 둘째»가 돌아온다(위 «세션 만료» 절) — 못 쓰면 사본 없이 서버 값이다.
    await waitFor(() => expect(box().value).toBe('못 비추는 설명'))
  })

  it('모양이 틀린 사본(깨진 JSON · 모르는 판) — 읽지 않고, 앱이 죽지 않는다', async () => {
    const backend = server()
    const current = tab()
    // 옛 판 앱을 띄운 탭이 남긴 것 · 손으로 고친 것이다. 사람마다 칸이 하나라 둘을 두 사람의 칸에 둔다.
    current.session.setItem(`${DRAFT_KEY_PREFIX}${ALICE.id}`, '{깨진')
    await open(backend, current)
    toView()
    await waitFor(() => expect(box().value).toBe('서버 값'))

    cleanup()
    const future = JSON.stringify({
      v: 999,
      era: 0,
      projectId: 'p-1',
      pageId: PAGE_ID,
      slots: { 'page-description/draft': '모르는 판의 글' },
    })
    current.session.setItem(`${DRAFT_KEY_PREFIX}${ALICE.id}`, future)
    await openPage(DOC, { apiOverrides: backend.overrides, draftStore: renewed(current).store })
    toView()

    await waitFor(() => expect(box().value).toBe('서버 값'))
  })

  it('쓰기가 던진다(용량 초과) — 앞에 비춘 낡은 글을 되살리지 않는다', async () => {
    const backend = server()
    let current = tab()
    const options = await open(backend, current)
    toView()
    await waitFor(() => expect(box().value).toBe('서버 값'))
    type(box(), '비춰 둔 첫 글')
    current.session.failWrites = true
    type(box(), '못 비춘 둘째 글')

    current = await reload(current, options)
    toView()

    // 첫 글이 돌아오면 사용자가 지운 글이 되살아난 것이다 — 서버 값이 맞다.
    await waitFor(() => expect(box().value).toBe('서버 값'))
  })
})
