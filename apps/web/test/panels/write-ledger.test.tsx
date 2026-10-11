/**
 * **나가 있는 쓰기의 장부**(`src/panels/write-ledger.tsx`). 무엇을 왜 막는지와 Chrome
 * 값은 그 파일의 머리말이 갖는다. 여기는 그것을 값으로 잠근다 — 뼈대는 아래 두 축이고, 뒤의 절들은 그 위에 선다.
 *
 * - **Q — 에디터를 떠났다 와도.** `page-description-edit.test.tsx`·`comment-panel.test.tsx`의
 *   «저장이 나가 있는 동안 …»·«탭·페이지를 오가도 …»는 전부 셸 **안**의 왕복이다 — provider 가
 *   내려가는 길을 지나지 않는다. 여기는 **프로젝트 목록을 다녀온다.**
 * - **R — 시간 안에 응답이 없으면.** 가짜 타이머로 `WRITE_DEADLINE_MS`를 넘긴다. **가짜 타이머가
 *   켜진 동안은 `waitFor`·`findBy*`를 쓰지 않는다** — RTL 의 `asyncWrapper`가 `setTimeout(0)`을
 *   기다리는데 그것이 가짜라 영영 안 온다(`act` + `advanceTimersByTimeAsync`로만 나아간다).
 *   **Chrome 에서도 같은 동작이 난다** — 그 값은 `write-ledger.tsx`의 머리말이 갖는다(실제 10초).
 *
 * **각 케이스가 혼자 죽는 변조**는 아래 절마다 표로 적었다 — 변조를 하나씩 심고, 매번 백업에서
 * 바이트 비교로 복원해서 잰다.
 */
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { samePageMeta } from '@wirebound/schema'
import type { ApiClient, ReadOptions, WriteOptions } from '../../src/api/client'
import { ApiError } from '../../src/api/client'
import type { Comment, CommentCreated, PageDetail, ProjectView, ProjectRole, SessionUser } from '../../src/api/types'
import { WRITE_DEADLINE_MS } from '../../src/panels/write-ledger'
import { createConnectionIdHolder, type ConnectionIdHolder, type RealtimeSetup } from '../../src/realtime/context'
import {
  HEAD_SEQ,
  OTHER_PAGE_TITLE,
  chooseFromShellMenu,
  openPage,
  pageDetail,
  pageDoc,
  OTHER_PAGE_ID,
  PAGE_ID,
  PROJECT_ID,
  PROJECT_NAME,
  waitForNode,
} from '../editor-harness'
import { fakeRealtime } from '../fake-realtime'
import { tabHub } from '../helpers'
import '../../src/catalog-setup'

const ROOT_ID = 'n-root'
const DOC = pageDoc({ id: ROOT_ID, type: 'Page', children: [{ id: 'n-list', type: 'List', props: {} }] })
/** 하네스의 첫 페이지 제목. */
const PAGE_TITLE = '회원 목록'
/** 하네스가 세션으로 내는 사용자. */
const MY_ID = 'u-1'
/** 다시 읽기로 판정했더니 서버 값이 같을 때(`page-description.tsx`의 `MATCHED`). */
const MATCHED = '응답이 없어 서버를 다시 읽었더니 서버의 설명이 이 글과 같습니다'

const PROJECT: ProjectView = {
  id: PROJECT_ID,
  name: PROJECT_NAME,
  slug: 'admin-console',
  description: null,
  role: 'owner',
  themeRev: 0,
}

afterEach(() => {
  vi.useRealTimers()
})

// ---- 화면 ----

function box(): HTMLTextAreaElement {
  return screen.getByRole('textbox', { name: '페이지 설명' }) as HTMLTextAreaElement
}

function saveButton(): HTMLButtonElement {
  return screen.getByRole('button', { name: '설명 저장' }) as HTMLButtonElement
}

/** 꺼진 상자에는 안 친다 — 실브라우저에서 없는 길이다(`page-description-edit.test.tsx`의 `type`). */
function type(target: HTMLTextAreaElement, value: string): void {
  if (target.disabled) throw new Error('꺼진 상자에는 칠 수 없다 — 실브라우저에서 없는 길이다')
  fireEvent.change(target, { target: { value } })
}

function commentBox(): HTMLTextAreaElement {
  return screen.getByRole('textbox', { name: '새 코멘트' }) as HTMLTextAreaElement
}

function submitButton(): HTMLButtonElement {
  return screen.getByRole('button', { name: '코멘트 달기' }) as HTMLButtonElement
}

function toView(): void {
  fireEvent.click(screen.getByRole('button', { name: '뷰 모드' }))
}

async function toCommentTab(): Promise<void> {
  fireEvent.click(screen.getByRole('tab', { name: '코멘트' }))
  await screen.findByRole('textbox', { name: '새 코멘트' })
}

/**
 * **에디터를 떠났다 온다** — 사용자가 하듯: «프로젝트 목록»(로고) → 목록에서 그 프로젝트 →
 * 메뉴 트리에서 그 페이지. 셸이 통째로 내려갔다 새로 선다(provider 도, 스토어도).
 */
async function leaveEditorAndReturn(): Promise<void> {
  fireEvent.click(screen.getByRole('link', { name: '프로젝트 목록' }))
  fireEvent.click(await screen.findByRole('link', { name: PROJECT_NAME }))
  const tree = await screen.findByRole('region', { name: '메뉴·페이지 트리' })
  fireEvent.click(await within(tree).findByRole('link', { name: PAGE_TITLE }))
  await waitForNode(ROOT_ID)
}

/** 목록까지만 간다 — 에디터 **밖**에 머문다. */
async function leaveEditor(): Promise<void> {
  fireEvent.click(screen.getByRole('link', { name: '프로젝트 목록' }))
  await screen.findByRole('link', { name: PROJECT_NAME })
}

/** 목록에서 에디터로 돌아온다. */
async function returnFromList(): Promise<void> {
  fireEvent.click(screen.getByRole('link', { name: PROJECT_NAME }))
  const tree = await screen.findByRole('region', { name: '메뉴·페이지 트리' })
  fireEvent.click(await within(tree).findByRole('link', { name: PAGE_TITLE }))
  await waitForNode(ROOT_ID)
}

/**
 * 연결 id 를 **손으로** 드는 실시간 설정 — 소켓은 열리지 않는다(`holder`만 쓴다). 셸이 내려가면 실시간 훅이
 * 그 값을 비우므로 새 셸에서 다시 넣는다.
 */
function connections(): { setup: RealtimeSetup; holder: ConnectionIdHolder } {
  const holder = createConnectionIdHolder()
  const socket = () => ({ onopen: null, onmessage: null, onclose: null, onerror: null, send: () => {}, close: () => {} })
  return { holder, setup: { holder, connection: { createSocket: socket, schedule: () => 0, cancel: () => {} } } }
}

/** 가짜 타이머를 그만큼 민다 — 그 사이 약속과 React 갱신을 함께 흘린다. */
async function advance(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

// ---- 서버 흉내 ----

/**
 * 설명 하나를 드는 서버. `updatePage`는 **붙잡힌다** — `commit()`이 서버에 쓰고 `respond()`가 그
 * 응답을 브라우저에 준다. 둘을 가른 것이 요점이다: «서버는 썼는데 응답이 안 온다»가 R 의 한 갈래다.
 *
 * `getPage`는 **지금 서버에 있는 값**을 낸다 — 돌아와 건 조회와 다시 읽기가 그것을 본다.
 *
 * **끊기면 실제 `fetch`처럼 거절한다**(`AbortError`) — 신호를 무시하는 가짜로는 «끊긴 요청의 거절이
 * 실패로 읽히는가»를 아무도 안 지난다. `ignoreAbort`는 **늦게 온 원래 응답**을 만들 때만 쓴다(실
 * 브라우저에서는 끊겨서 안 오지만, 신호를 안 보는 클라이언트가 늦게 풀려도 판정이 서야 한다).
 *
 * `compareBase`면 **바탕을 받는 순간 견준다** — 지금 값과 다르면 붙잡지 않고 곧바로 409 · `page-meta-changed`
 * · 지금 값이다(진짜 서버는 행 잠금 안에서 견준다. 이 가짜는 붙잡힌 쓰기와 잠금을 다투지 않는다).
 */
function descriptionServer(
  initial: string | null,
  behavior: { ignoreAbort?: boolean; compareBase?: boolean } = {},
): {
  overrides: Partial<ApiClient>
  stored: () => string | null
  sent: (string | null | undefined)[]
  /**
   * 쓰기가 실은 바탕 — 부른 순서대로. **견주는 것은 `compareBase`를 켰을 때뿐이다**(받는 순간 견줘 409 — 위 머리말).
   * 끈 판(기본)은 바탕을 적기만 한다. 행 잠금 안에서 견주는 가짜는 `page-meta-conflict.test.tsx`에 있다.
   */
  bases: unknown[]
  signals: (AbortSignal | undefined)[]
  /** 붙잡힌 쓰기 하나를 서버에 쓴다(응답은 아직). */
  commit: (index?: number) => void
  /** 붙잡힌 쓰기 하나의 응답을 준다 — 먼저 서버에 쓴다. */
  respond: (index?: number) => Promise<void>
  /** 붙잡힌 쓰기 하나를 그 실패로 끝낸다(서버에 안 쓴다). */
  fail: (index: number, error: ApiError) => Promise<void>
  /** 다시 읽기를 실패시킨다 — `error`를 주면 그것으로(기본은 연결 실패). */
  failReads: (on: boolean, error?: ApiError) => void
  /** 켜 있는 동안의 읽기를 붙잡는다 — 끈 뒤의 읽기는 곧바로 답한다. 붙잡힌 것은 `releaseReads`가 놓는다. */
  holdReads: (on: boolean) => void
  /**
   * 붙잡힌 읽기를 **그때의** 서버 값으로 놓는다. `asIssued`면 **읽기를 낸 순간의** 값으로 놓는다 — 서버는 그때 읽었고
   * 답만 늦게 왔다(아래 *"돌아와 건 설명 조회가 늦게 와도 …"*의 판).
   */
  releaseReads: (asIssued?: boolean) => Promise<void>
  /** 붙잡힌 읽기의 수. */
  heldReads: () => number
  /** 읽기가 받은 신호 — 부른 순서대로(판정용 다시 읽기만 싣는다). */
  readSignals: (AbortSignal | undefined)[]
  /** 읽기가 받은 **떠날 때 끊는** 신호(`ReadOptions.cancel`) — 부른 순서대로(조회 이펙트가 싣는다). */
  readCancels: (AbortSignal | undefined)[]
  /** 남이 서버의 설명을 바꾼다. */
  overwrite: (value: string | null) => void
} {
  let stored = initial
  let readsFail = false
  let readError = new ApiError(0, 'internal', '서버에 연결하지 못했습니다')
  let readsHeld = false
  const heldReads: ((asIssued: boolean) => void)[] = []
  const readSignals: (AbortSignal | undefined)[] = []
  const readCancels: (AbortSignal | undefined)[] = []
  const sent: (string | null | undefined)[] = []
  const bases: unknown[] = []
  const signals: (AbortSignal | undefined)[] = []
  const waiting: { commit: () => void; resolve: () => void; reject: (caught: unknown) => void }[] = []
  const read = (pageId: string): PageDetail => ({
    ...pageDetail(pageId, DOC),
    description: pageId === PAGE_ID ? stored : null,
  })
  return {
    sent,
    bases,
    signals,
    readSignals,
    readCancels,
    stored: () => stored,
    failReads: (on, error) => {
      readsFail = on
      if (error !== undefined) readError = error
    },
    holdReads: (on) => {
      readsHeld = on
    },
    releaseReads: async (asIssued = false) => {
      await act(async () => {
        for (const release of heldReads.splice(0)) release(asIssued)
      })
    },
    heldReads: () => heldReads.length,
    overwrite: (value) => {
      stored = value
    },
    overrides: {
      getPage: (async (_projectId: string, pageId: string, options?: ReadOptions) => {
        if (pageId === PAGE_ID) readSignals.push(options?.signal)
        if (pageId === PAGE_ID) readCancels.push(options?.cancel)
        if (readsFail && pageId === PAGE_ID) throw readError
        if (readsHeld && pageId === PAGE_ID) {
          // 붙잡힌 읽기도 **끊기면 실제 `fetch`처럼 거절한다**.
          return new Promise<PageDetail>((resolve, reject) => {
            options?.signal?.addEventListener('abort', () => reject(new DOMException('요청을 끊었다', 'AbortError')))
            const issued = read(pageId)
            heldReads.push((asIssued) => resolve(asIssued ? issued : read(pageId)))
          })
        }
        return read(pageId)
      }) as never,
      updatePage: ((_projectId: string, pageId: string, body: { description?: string | null; base?: unknown }, options?: WriteOptions) => {
        sent.push(body.description)
        bases.push(body.base)
        signals.push(options?.signal)
        const value = body.description ?? null
        const base = body.base as { description?: string | null } | undefined
        if ((behavior.compareBase ?? false) && base !== undefined && !samePageMeta(base.description ?? null, stored)) {
          const message = '다른 사람이 이 페이지를 먼저 바꿨습니다'
          return Promise.reject(
            new ApiError(409, 'conflict', message, [{ path: 'description', code: 'page-meta-changed', message, current: stored }], true),
          )
        }
        return new Promise<PageDetail>((resolve, reject) => {
          if (options?.signal !== undefined && !(behavior.ignoreAbort ?? false)) {
            options.signal.addEventListener('abort', () => reject(new DOMException('요청을 끊었다', 'AbortError')))
          }
          let committed = false
          const commit = (): void => {
            if (committed) return
            committed = true
            stored = value
          }
          waiting.push({ commit, resolve: () => resolve({ ...pageDetail(pageId, DOC), description: value }), reject })
        })
      }) as never,
    },
    commit: (index = 0) => {
      const entry = waiting[index]
      if (entry === undefined) throw new Error('붙잡힌 쓰기가 없다')
      entry.commit()
    },
    respond: async (index = 0) => {
      const entry = waiting[index]
      if (entry === undefined) throw new Error('붙잡힌 쓰기가 없다')
      await act(async () => {
        entry.commit()
        entry.resolve()
      })
    },
    fail: async (index, error) => {
      const entry = waiting[index]
      if (entry === undefined) throw new Error('붙잡힌 쓰기가 없다')
      await act(async () => {
        entry.reject(error)
      })
    },
  }
}

/** 409 `page-meta-changed` — 서버가 견준 지금 값(`current`)을 싣는다(`api/page-meta.ts`의 `metaConflict`). */
function metaChanged(current: string | null): ApiError {
  const message = '다른 사람이 이 페이지를 먼저 바꿨습니다'
  return new ApiError(409, 'conflict', message, [{ path: 'description', code: 'page-meta-changed', message, current }], true)
}

function comment(id: string, body: string): Comment {
  return {
    id,
    nodeId: ROOT_ID,
    body,
    authorId: MY_ID,
    authorName: '테스터',
    createdAt: '2026-09-21T09:00:00.000Z',
    updatedAt: '2026-09-21T09:00:00.000Z',
  }
}

/**
 * 코멘트 표를 드는 서버. 쓰기는 `descriptionServer`처럼 붙잡힌다.
 *
 * **서버처럼 번호를 붙인다** — 노드의 첫 게시는 `markerOps`(번호 추가)와 오른 `seq`를 내고 그 뒤로는
 * 빈 `markerOps`다(`apps/api`의 `POST .../comments`). **멱등 키도 서버처럼 받는다** — 같은 키로 이미
 * 커밋됐으면 붙잡지 않고 앞 행을 곧바로 돌려주고(빈 `markerOps` · 지금의 번호), **붙잡힌 게시가 커밋될
 * 때 한 번 더 본다** — 같은 키가 그 사이 먼저 커밋됐으면 새 행 대신 재생이다(서버의 «잠금 안에서 한 번
 * 더 본다»: 같은 페이지 행 잠금 뒤에 줄을 선 둘째가 앞의 것을 돌려받는다). `failNext`는 다음 게시를 그
 * 실패로 끝낸다(기본 500).
 */
function commentServer(initial: Comment[] = []): {
  overrides: Partial<ApiClient>
  rows: () => Comment[]
  /** 게시가 실어 온 멱등 키 — 부른 순서대로. */
  keys: (string | undefined)[]
  /** 게시가 실어 온 연결 id(`WriteOptions.connectionId`) — 부른 순서대로. 안 실었으면 `undefined`다. */
  origins: (string | undefined)[]
  failNext: (error?: ApiError) => void
  /** 다음 게시를 **서버는 커밋하고** 브라우저에는 그 실패를 준다(앞단이 502 를 냈다 · 연결이 끊겼다). */
  commitThenFail: (error: ApiError) => void
  /** 켜 있는 동안의 목록 읽기를 붙잡는다 — 끈 뒤의 읽기는 곧바로 답한다. */
  holdLists: (on: boolean) => void
  /** 붙잡힌 목록 읽기의 수. */
  heldLists: () => number
  /** **다른 곳에서**(다른 탭·기기) 같은 사람이 루트에 그 글을 단다 — 이 화면은 모른다. */
  addElsewhere: (body: string) => void
  /**
   * 붙잡힌 목록 읽기를 그 실패로 끝낸다 — 기본은 **401**: 로그아웃 **뒤에** 서버에 닿은 앞 세션의 요청이다
   * (모델링: 그 요청은 로그아웃보다 먼저 나갔고, 서버에는 늦게 닿았다). `index`를 주면 붙잡힌 순서로 그것
   * 하나만 끝낸다 — 없으면 전부다.
   */
  failHeldLists: (error?: ApiError, index?: number) => Promise<void>
  /** 붙잡힌 목록 읽기를 **그것을 낸 순간의** 표로 놓는다 — 서버는 그때 읽었고 답만 늦게 왔다. `index`는 위와 같다. */
  releaseHeldLists: (index?: number) => Promise<void>
  commit: (index?: number) => void
  respond: (index?: number) => Promise<void>
} {
  let rows = [...initial]
  let next = 100
  let seq = HEAD_SEQ
  const failing: ApiError[] = []
  const committedFailing: ApiError[] = []
  let listsHeld = false
  const heldLists: { resolve: () => void; reject: (caught: unknown) => void }[] = []
  const markers = new Map<string, number>()
  const byKey = new Map<string, Comment>()
  const keys: (string | undefined)[] = []
  const origins: (string | undefined)[] = []
  const waiting: { commit: () => void; resolve: () => void }[] = []
  return {
    rows: () => rows,
    keys,
    origins,
    // 기본은 **api 가 낸 500**(오류 봉투가 있다) — 첫 보내기에서는 확정 실패, 같은 키로 다시 보낸 것에서는
    // 모름이다(`comment-panel.tsx`의 `knownRejection` 표).
    failNext: (error = new ApiError(500, 'internal', '서버 오류가 발생했습니다', [], true)) => {
      failing.push(error)
    },
    commitThenFail: (error) => {
      committedFailing.push(error)
    },
    holdLists: (on) => {
      listsHeld = on
    },
    heldLists: () => heldLists.length,
    addElsewhere: (body) => {
      rows = [...rows, comment(`c-${next++}`, body)]
    },
    failHeldLists: async (error = new ApiError(401, 'unauthenticated', '로그인이 필요합니다'), index) => {
      await act(async () => {
        for (const held of index === undefined ? heldLists.splice(0) : heldLists.splice(index, 1)) held.reject(error)
      })
    },
    releaseHeldLists: async (index) => {
      await act(async () => {
        for (const held of index === undefined ? heldLists.splice(0) : heldLists.splice(index, 1)) held.resolve()
      })
    },
    overrides: {
      listComments: async () => {
        if (listsHeld) {
          const snapshot = [...rows]
          return new Promise<Comment[]>((resolve, reject) => heldLists.push({ resolve: () => resolve(snapshot), reject }))
        }
        return [...rows]
      },
      createComment: ((
        _projectId: string,
        _pageId: string,
        body: { nodeId: string; body: string; idempotencyKey?: string },
        options?: WriteOptions,
      ) => {
        keys.push(body.idempotencyKey)
        origins.push(options?.connectionId)
        const failure = failing.shift()
        if (failure !== undefined) return Promise.reject(failure)
        const replay = (row: Comment): CommentCreated => ({
          comment: row,
          marker: markers.get(row.nodeId) ?? null,
          seq,
          markerOps: [],
        })
        const replayed = body.idempotencyKey === undefined ? undefined : byKey.get(body.idempotencyKey)
        if (replayed !== undefined) return Promise.resolve(replay(replayed))
        return new Promise<CommentCreated>((resolve, reject) => {
          // **끊기면 실제 클라이언트처럼 거절한다** — `http-client`는 끊긴 `fetch`를 연결 실패로 옮긴다.
          options?.signal?.addEventListener('abort', () => reject(new ApiError(0, 'internal', '서버에 연결하지 못했습니다')))
          let result: CommentCreated | undefined
          const commit = (): void => {
            if (result !== undefined) return
            // 잠금 안에서 한 번 더 본다 — 같은 키가 먼저 커밋됐으면 재생이다.
            const first = body.idempotencyKey === undefined ? undefined : byKey.get(body.idempotencyKey)
            if (first !== undefined) {
              result = replay(first)
              return
            }
            const created = { ...comment(`c-${next++}`, body.body), nodeId: body.nodeId }
            rows = [...rows, created]
            if (body.idempotencyKey !== undefined) byKey.set(body.idempotencyKey, created)
            let markerOps: CommentCreated['markerOps'] = []
            if (!markers.has(body.nodeId)) {
              if (body.nodeId !== ROOT_ID) throw new Error('이 가짜는 루트에만 번호를 붙인다')
              markers.set(body.nodeId, markers.size + 1)
              seq += 1
              markerOps = [{ op: 'add', path: '/root/marker', value: markers.get(body.nodeId) as number }]
            }
            result = { comment: created, seq, marker: markers.get(body.nodeId) ?? null, markerOps }
          }
          const lost = committedFailing.shift()
          if (lost !== undefined) {
            // 서버는 커밋했다 — 응답만 브라우저에 안 닿았다.
            commit()
            reject(lost)
            return
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
      updateComment: ((_projectId: string, _pageId: string, commentId: string, body: { body: string }) =>
        new Promise<Comment>((resolve) => {
          const commit = (): void => {
            rows = rows.map((row) => (row.id === commentId ? { ...row, body: body.body } : row))
          }
          waiting.push({
            commit,
            resolve: () => {
              commit()
              resolve(rows.find((row) => row.id === commentId) as Comment)
            },
          })
        })) as never,
    },
    commit: (index = 0) => {
      const entry = waiting[index]
      if (entry === undefined) throw new Error('붙잡힌 쓰기가 없다')
      entry.commit()
    },
    respond: async (index = 0) => {
      const entry = waiting[index]
      if (entry === undefined) throw new Error('붙잡힌 쓰기가 없다')
      await act(async () => {
        entry.resolve()
      })
    },
  }
}

const listProjects: Partial<ApiClient> = { listProjects: async () => [PROJECT] }

// ---- 계정 ----

/** 하네스가 처음 세션으로 내는 사람(`editor-harness.tsx`의 `USER`) — 여기서는 앞 사람이다. */
const ALICE: SessionUser = { id: MY_ID, email: 'me@example.com', name: '테스터' }
/** 같은 프로젝트의 다른 사람. */
const BOB: SessionUser = { id: 'u-2', email: 'bob@example.com', name: '밥' }

/** 로그인은 친 이메일의 사람으로, 로그아웃은 성공으로 답한다. */
const accounts: Partial<ApiClient> = {
  login: (async (email: string) => (email === BOB.email ? BOB : ALICE)) as never,
  logout: async () => undefined,
}

/** 셸 머리 `…` 의 «로그아웃» → 로그인 화면. */
async function logout(): Promise<void> {
  chooseFromShellMenu('로그아웃')
  await screen.findByLabelText('이메일')
}

/** 로그인 화면에서 그 사람으로 들어간다 → 프로젝트 목록. */
async function login(user: SessionUser): Promise<void> {
  fireEvent.change(screen.getByLabelText('이메일'), { target: { value: user.email } })
  fireEvent.change(screen.getByLabelText('비밀번호'), { target: { value: '아무 비밀번호' } })
  fireEvent.click(screen.getByRole('button', { name: '로그인' }))
  await screen.findByRole('link', { name: PROJECT_NAME })
}

/**
 * ## Q — 에디터를 떠났다 와도
 *
 * | 변조 | 죽는 것 |
 * |---|---|
 * | 설명의 `settle`이 쓰기의 주인(provider)이 내려갔으면 아무것도 안 한다 | *"설명 — 떠났다 온 방문에 응답이 닿는다 …"* **혼자** |
 * | 코멘트의 `perform`이 같은 일을 한다 | *"코멘트 — 떠났다 온 방문에 응답이 닿는다 …"* **혼자** |
 * | 장부가 **받을 provider 가 있을 때만** 잠금을 푼다 | *"설명 — 에디터 밖에 있는 동안 끝난 쓰기 …"* **혼자** |
 * | 칸 쓰기를 늘 **자기 provider** 로 보낸다(`deliver`가 지금 떠 있는 provider 를 안 본다) | 전달 둘(설명·코멘트) — 축의 주인은 `write-ledger.tsx`의 `deliver`다 |
 * | 장부를 셸 안(`RightPanel`의 `PanelDraftsProvider` 바로 위)으로 내린다 | 넷(설명·코멘트 × 잠금·전달) |
 * | 잠금 키에 **provider 인스턴스**를 넣는다(`usePanelLock`의 `slot` — 잠금이 provider 교체를 못 넘는다) | 잠금 둘 — 웹 전량 가운데 이 둘뿐이다 |
 * | 같은 것을 **설명 칸에만** | *"설명 — 에디터를 떠났다 와도 잠금이 남는다 …"* **혼자** |
 * | 같은 것을 **코멘트 칸에만** | *"코멘트 — 에디터를 떠났다 와도 잠금이 남는다 …"* **혼자** |
 *
 * **잠금 둘은 «잠금이 provider 교체를 넘는다» 축의 주인이다** — 위 끝의 세 줄이 그것이다(잠금을 provider 에
 * 매는 변조를 칸마다 좁혀 잰다). 장부의 자리를 셸 안으로 · 잠금을 본문의 `useState`로 · 방문 칸으로
 * 옮기는 변조에서는 이 둘이 혼자 죽지 않는다 — 셸 **안**의 왕복을 재는 케이스(`page-description-edit.test.tsx`·
 * `comment-panel.test.tsx`의 «저장이 나가 있는 동안 …»·«… 가 → 나 → 가 …»)도 함께 죽는다. 그러나 에디터를
 * 떠났다 오면 잠금이 사라지는 결함을 잠금 한 자리에서 되살리는 가장 자연스러운 퇴행(provider 에 매인 잠금)에서는
 * 이 둘만 죽는다. 이 둘이 따로 재는 것은 **provider 째 내려가는 길**이다 — 셸 안 케이스 가운데 그 길을 지나는
 * 것은 없다.
 */
describe('Q — 에디터를 떠났다 와도 나가 있는 쓰기가 제자리에 있다', () => {
  it('설명 — 에디터를 떠났다 와도 잠금이 남는다: 둘째 저장이 나갈 수 없다', async () => {
    const server = descriptionServer('서버 값')
    await openPage(DOC, { apiOverrides: { ...server.overrides, ...listProjects } })
    toView()
    await waitFor(() => expect(box().value).toBe('서버 값'))

    type(box(), '매달린 저장 글')
    fireEvent.click(saveButton())
    await waitFor(() => expect(server.sent).toHaveLength(1))

    await leaveEditorAndReturn()
    toView()
    await waitFor(() => expect(box().value).toBe('서버 값'))

    // **잠금이 셸과 함께 사라지면 여기서 상자와 버튼이 열린다**(Chrome 에서 잰 고장 방식). 그러면 둘째
    // 저장이 나가고, 늦게 온 첫째가 둘째를 덮어 화면은 «저장했습니다»와 함께 DB 에 없는 값을 보인다.
    expect(box().disabled).toBe(true)
    expect(saveButton().disabled).toBe(true)

    await server.respond()

    // **양성 대조** — 응답이 오면 풀린다. 없으면 «한 번 잠기면 안 풀린다»도 통과한다.
    await waitFor(() => expect(box().disabled).toBe(false))
    expect(server.sent).toEqual(['매달린 저장 글'])
  })

  it('설명 — 떠났다 온 방문에 응답이 닿는다: 돌아와 읽은 옛 값이 아니라 저장된 값과 «저장했습니다»가 선다', async () => {
    const server = descriptionServer('서버 값')
    await openPage(DOC, { apiOverrides: { ...server.overrides, ...listProjects } })
    toView()
    await waitFor(() => expect(box().value).toBe('서버 값'))

    type(box(), '매달린 저장 글')
    fireEvent.click(saveButton())
    await waitFor(() => expect(server.sent).toHaveLength(1))

    await leaveEditorAndReturn()
    toView()
    // 돌아와 건 조회는 쓰기가 커밋되기 **전**에 읽었다 — 옛 값이다.
    await waitFor(() => expect(box().value).toBe('서버 값'))

    await server.respond()

    // **응답이 내려간 provider 의 칸에 쓰이면 아무 데도 안 닿는다** — 상자는 옛 값에 머물고 통지도
    // 없다(칸 쓰기는 지금 떠 있는 provider 로 가야 한다 — `write-ledger.tsx`의 `deliver`).
    await waitFor(() => expect(screen.queryByText('설명을 저장했습니다')).not.toBeNull())
    expect(box().value).toBe('매달린 저장 글')
    expect(saveButton().disabled).toBe(true)
  })

  it('설명 — 에디터 밖에 있는 동안 끝난 쓰기: 돌아오면 풀려 있고 서버에서 다시 읽은 저장된 값이 선다', async () => {
    const server = descriptionServer('서버 값')
    await openPage(DOC, { apiOverrides: { ...server.overrides, ...listProjects } })
    toView()
    await waitFor(() => expect(box().value).toBe('서버 값'))

    type(box(), '밖에서 끝난 저장 글')
    fireEvent.click(saveButton())
    await waitFor(() => expect(server.sent).toHaveLength(1))

    await leaveEditor()
    // 받을 방문이 없다 — 응답은 버려지고 잠금만 장부에서 풀린다.
    await server.respond()
    await returnFromList()
    toView()

    await waitFor(() => expect(box().value).toBe('밖에서 끝난 저장 글'))
    expect(box().disabled).toBe(false)
    type(box(), '돌아와 친 글')
    expect(saveButton().disabled).toBe(false)
  })

  it('코멘트 — 에디터를 떠났다 와도 잠금이 남는다: 같은 말을 다시 달 수 없다', async () => {
    const server = commentServer()
    await openPage(DOC, { apiOverrides: { ...server.overrides, ...listProjects } })
    await toCommentTab()

    type(commentBox(), '매달린 코멘트')
    fireEvent.click(submitButton())
    await waitFor(() => expect(commentBox().disabled).toBe(true))

    await leaveEditorAndReturn()
    await toCommentTab()

    // **잠금이 셸과 함께 사라지면 여기서 상자가 열린다**(Chrome 에서 잰 고장 방식) — 다시 달면 같은 번호에 두 행이 선다.
    expect(commentBox().disabled).toBe(true)
    expect(submitButton().disabled).toBe(true)

    await server.respond()

    // **양성 대조** — 응답이 오면 풀린다.
    await waitFor(() => expect(commentBox().disabled).toBe(false))
    expect(server.rows()).toHaveLength(1)
  })

  it('코멘트 — 떠났다 온 방문에 응답이 닿는다: 돌아와 읽은 빈 목록이 아니라 단 말이 선다', async () => {
    const server = commentServer()
    await openPage(DOC, { apiOverrides: { ...server.overrides, ...listProjects } })
    await toCommentTab()

    type(commentBox(), '매달린 코멘트')
    fireEvent.click(submitButton())
    await waitFor(() => expect(commentBox().disabled).toBe(true))

    await leaveEditorAndReturn()
    await toCommentTab()
    // 돌아와 건 목록 조회는 게시가 커밋되기 **전**에 읽었다 — 비어 있다.
    expect(screen.queryByText('매달린 코멘트')).toBeNull()

    await server.respond()

    // 게시 뒤의 다시 받기가 **새로 선 방문**에 닿는다.
    await waitFor(() => expect(screen.queryByText('매달린 코멘트')).not.toBeNull())
  })
})

/**
 * ## R — 시간 안에 응답이 없으면 «모름»이고, 서버에서 다시 읽어 판정한다
 *
 * | 변조 | 죽는 것 |
 * |---|---|
 * | 시간이 돼도 요청을 끊지 않는다 | *"시간이 되기 전에는 …"* 와 *"판정용 다시 읽기에도 시간 제한이 있다 …"*(판정도 같은 `race`다) — 축의 주인은 앞의 것 |
 * | 판정으로 «저장됨»인데 초안을 안 비운다 | *"서버 값이 보낸 값과 같으면 …"* **혼자** |
 * | 판정으로 «안 됨»인데 초안을 비운다 | *"서버 값이 다르면 …"* **혼자** |
 * | 다시 읽기가 실패하면 «실패»로 풀어 버린다 | *"다시 읽기도 실패하면 모른다 …"* · *"판정용 다시 읽기에도 시간 제한이 있다 …"* · 코멘트의 *"… 연결이 실패하면 모른다 …"* · 세션 절의 *"… «확인하지도 못했습니다»로 남은 …"* — 축의 주인은 앞의 것 |
 * | 판정 뒤에 늦게 온 원래 응답으로 다시 고친다 | *"늦게 온 원래 응답은 …"* **혼자** |
 * | 판정에 시간 제한이 없다 · 설명의 판정용 읽기가 신호를 안 싣는다 | *"판정용 다시 읽기에도 시간 제한이 있다 …"* **혼자**(둘 다) |
 * | 설명: 다시 읽어 같으면 «저장했습니다»라고 한다 | *"서버 값이 보낸 값과 같으면 …"* · *"다시 읽기도 실패하면 …"* · *"판정용 다시 읽기에도 …"*(뒤의 둘은 끝이 «같습니다»다) — 축의 주인은 앞의 것 |
 * | 코멘트: 다시 보낼 때 **목록을 먼저 보고** 같은 노드·같은 글이 있으면 안 보낸다 | *"코멘트 — 목록을 읽은 뒤 다른 곳에서 달린 …"* **혼자** |
 * | 코멘트: 판정을 목록으로 한다(다시 보내지 않는다) | 코멘트 넷 + 멱등 키 절의 둘 — 축의 주인은 *"… 다른 곳에서 달린 …"* |
 * | 코멘트: 다시 보낸 것의 연결 실패·5xx 도 거절(확정)로 친다 | *"코멘트 — 다시 보낸 것도 연결이 실패하면 모른다 …"* · *"… api 가 500 으로 거절해도(봉투) 모른다 …"* · 멱등 키 절의 *"… 연결 id 를 …"* · 모르는 실패 절의 *"«모름»으로 떠났다 와도 …"*(뒤의 둘은 503 으로 «다시 확인»에 선다) — 축의 주인은 앞의 것 |
 * | 코멘트: 4xx 도 모름으로 친다 · 거절에 키를 버린다 | *"코멘트 — 다시 보낸 것을 서버가 거절하면 …"* **혼자**(둘 다) |
 * | 코멘트: 달렸다는 판정인데 뒷일(초안 비우기·번호)을 안 한다 | *"코멘트 — 서버가 첫 게시를 안 받았으면 …"* 와 넷 — 축의 주인은 그것 |
 * | 코멘트 수정: 판정으로 «저장됨»인데 편집 칸을 안 닫는다 | *"코멘트 수정 — …"* **혼자** |
 * | 코멘트 삭제: 실패해도 목록을 안 다시 받는다 | *"코멘트 삭제 — 다시 누른 삭제가 409 면 …"* **혼자** |
 * | 설명의 판정이 늘 «안 됨»이다 | *"서버 값이 보낸 값과 같으면 …"* · *"다시 읽기도 실패하면 …"* · *"판정용 다시 읽기에도 …"*(셋 다 «같습니다»로 끝난다) |
 * | 시간 제한이 사실상 없다 — **타이머 자리에서** 1000 배 | 이 절의 열하나 · 멱등 키 절의 둘 · 세션 절의 «모름»(14 — 삭제 케이스는 시간 제한을 안 지난다). 상수(`WRITE_DEADLINE_MS`)를 바꾸면 **0** 이다 — 케이스가 같은 상수로 시간을 민다 |
 *
 * **코멘트 게시의 판정은 다시 읽기가 아니라 같은 키로 다시 보내기다**(`comment-panel.tsx`의 `submit`). 그래서
 * 이 절에 «서버가 이미 달았으면 재생» 케이스를 따로 두지 않는다 — 멱등 키 절의 *"다시 보낸 게시는 같은 키를
 * 싣는다 …"*와 클라이언트 경로가 같아(가짜 서버의 재생 시점만 다르다) 늘 함께 죽는다.
 *
 * **`signal`이 요청에 실리는가**는 `test/api/http-client.test.ts`의 *"쓰기 다섯은 받은 `signal`을 …"*가
 * 갖는다(그 줄을 지우면 그것 **혼자** 죽는다). 여기의 가짜 클라이언트는 `http-client`를 안 지난다.
 */
describe('R — 시간 안에 응답이 없으면 결과를 모르는 것이다 — 다시 읽어(게시는 다시 보내) 판정한다', () => {
  /** 설명을 치고 저장을 누른다 — **가짜 타이머를 켠 뒤에** 누른다(시간 제한의 타이머가 가짜여야 한다). */
  async function saveWithFakeTimers(server: ReturnType<typeof descriptionServer>, text: string): Promise<void> {
    await openPage(DOC, { apiOverrides: server.overrides })
    toView()
    await waitFor(() => expect(box().value).toBe('서버 값'))
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    type(box(), text)
    fireEvent.click(saveButton())
    expect(server.sent).toEqual([text])
  }

  it('시간이 되기 전에는 아무 말도 없고 잠겨 있다 — 시간이 되면 요청을 끊는다', async () => {
    const server = descriptionServer('서버 값')
    await saveWithFakeTimers(server, '시간 넘긴 글')

    await advance(WRITE_DEADLINE_MS - 1)
    expect(box().disabled).toBe(true)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(server.signals[0]?.aborted).toBe(false)

    await advance(1)
    // **시간이 되면 끊는다** — 서버에 아직 안 닿은 요청은 그걸로 영영 안 간다(Chrome: `ERR_ABORTED`,
    // 서버 로그에 그 요청이 없다).
    expect(server.signals[0]?.aborted).toBe(true)
  })

  it('서버 값이 보낸 값과 같으면 원하던 상태다 — «같습니다»(«저장했습니다»가 아니다)·풀림·초안 비움', async () => {
    const server = descriptionServer('서버 값')
    await saveWithFakeTimers(server, '시간 넘긴 글')
    // 서버는 썼는데 응답만 안 온다.
    server.commit()

    await advance(WRITE_DEADLINE_MS)
    vi.useRealTimers()

    // **누가 썼는지는 모른다** — 남이 같은 값을 먼저 저장한 판도 같은 값이다.
    await waitFor(() => expect(screen.queryByText(MATCHED)).not.toBeNull())
    expect(screen.queryByText('설명을 저장했습니다')).toBeNull()
    expect(box().disabled).toBe(false)
    expect(box().value).toBe('시간 넘긴 글')
    expect(saveButton().disabled).toBe(true)

    // **초안을 비웠다** — 판정 직후에는 초안과 서버 값이 같아 화면으로 안 갈린다. 갈리는 것은 그 뒤에
    // 서버 값이 바뀔 때다: 초안이 남아 있으면 `draft ?? server`에서 초안이 이겨 남이 고친 값을 가린다.
    server.overwrite('남이 고친 글')
    fireEvent.click(screen.getByRole('button', { name: '편집 모드' }))
    toView()
    await waitFor(() => expect(box().value).toBe('남이 고친 글'))
  })

  it('서버 값이 다르면 저장되지 않았다고 말하고 초안을 남긴다 — 다시 저장할 수 있다', async () => {
    const server = descriptionServer('서버 값')
    await saveWithFakeTimers(server, '시간 넘긴 글')

    await advance(WRITE_DEADLINE_MS)
    vi.useRealTimers()

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe('응답이 없어 서버를 다시 읽었더니 이 설명은 저장되지 않았습니다'),
    )
    expect(box().disabled).toBe(false)
    expect(box().value).toBe('시간 넘긴 글')
    expect(saveButton().disabled).toBe(false)
    expect(screen.queryByText('설명을 저장했습니다')).toBeNull()
  })

  /**
   * **셋째 갈래 — 서버 값이 내 글도 바탕도 아니다**(`api/page-meta.ts`의 `judgeMeta`). 이 갈래를 위
   * «저장되지 않았다»로 읽으면 다시 누를 때 **남의 값을 조용히 덮는다.** 혼자 죽는 변조: `page-description.tsx`의
   * `land`에서 «안 저장됨» 조건을 `verdict !== 'mine'`으로 넓힌다(셋째를 둘째로 접는다) · 다시 읽은 갈래에서 충돌의
   * 값을 다시 읽은 값 대신 내 글로 든다.
   *
   * **그 값을 화면의 글로 재지 않는다** — 충돌 화면이 그 사람의 값을 보이는가는 `page-meta-conflict.test.tsx`의 첫
   * 케이스가 주인이다(여기서도 보면 그 축의 변조에 둘이 함께 죽는다). 여기서는 «내 글로 덮기»가 **다시 읽은 값을
   * 바탕으로** 싣는가로 잰다.
   */
  it('서버 값이 내 글도 바탕도 아니면 다른 사람이 바꾼 것이다 — 충돌 화면이 서고, 덮기는 다시 읽은 값을 바탕으로 싣는다', async () => {
    const server = descriptionServer('서버 값')
    await saveWithFakeTimers(server, '시간 넘긴 글')
    // 내 쓰기는 서버에 안 닿았고, 그 사이 남이 저장했다.
    server.overwrite('남이 저장한 글')

    await advance(WRITE_DEADLINE_MS)
    vi.useRealTimers()

    const lead = await screen.findByText('다른 사람이 이 설명을 바꿨습니다')
    const conflict = lead.closest<HTMLElement>('[role="alert"]')
    expect(conflict).not.toBeNull()
    expect(screen.queryByText('응답이 없어 서버를 다시 읽었더니 이 설명은 저장되지 않았습니다')).toBeNull()
    expect(box().disabled).toBe(false)
    expect(box().value).toBe('시간 넘긴 글')

    fireEvent.click(within(conflict!).getByRole('button', { name: '내 글로 덮기' }))
    await waitFor(() => expect(server.bases).toHaveLength(2))
    expect(server.bases).toEqual([{ description: '서버 값' }, { description: '남이 저장한 글' }])
    await server.respond(1)
  })

  /**
   * **«저장되지 않았습니다» 뒤 끊긴 쓰기가 늦게 커밋한 판**(Chrome 에서 잰 판). 판정이 `'base'`였어도 서버가 이미 받은
   * 요청은 끊긴 뒤 커밋할 수 있다. 그 뒤 **더 쳐서** 저장하면 409 의 지금 값이 내 앞 글이다 — 그것을 «다른 사람이 이
   * 설명을 바꿨습니다 / 앞 글»로 보이면 거짓이다. 그래서 그 판정이 보낸 글을 초안 칸에 매달린 값으로 들고, 409 의 값이
   * 그것이면 «지금 저장된 설명이 앞서 보낸 글과 같습니다»로 서고 덮기를 권한다(누가 썼는지는 말하지 않는다). 덮기는
   * 보인 그 값(앞 글)을 바탕으로 싣는다.
   *
   * 혼자 죽는 변조(각각): `land`의 «안 저장됨» 갈래가 매달린 값을 안 든다 · 상자의 `onChange`가 초안을 `{ text, base }`로
   * 새로 지어 매달린 값을 떨군다. (`judgeMeta`의 `'late'` 갈래를 지우면 `test/api/page-meta.test.ts`의 «매달린 내 값과
   * 같으면 late …»와 함께 죽는다 — 판정 표의 주인은 그쪽, 화면의 주인은 이것.)
   */
  it('«저장되지 않았습니다» 뒤 끊긴 쓰기가 늦게 커밋되면, 더 쳐서 저장한 409 는 다른 사람이 아니라 앞서 보낸 내 글이다 — 덮기로 더 친 글이 선다', async () => {
    const server = descriptionServer('서버 값', { compareBase: true })
    await saveWithFakeTimers(server, '앞 글')

    await advance(WRITE_DEADLINE_MS)
    vi.useRealTimers()
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe('응답이 없어 서버를 다시 읽었더니 이 설명은 저장되지 않았습니다'),
    )

    // 끊긴 쓰기가 서버에서 늦게 커밋한다(Chrome: 행 잠금이 풀린 뒤).
    server.commit(0)
    type(box(), '앞 글에 더 친 글')
    fireEvent.click(saveButton())

    const lead = await screen.findByText('지금 저장된 설명이 앞서 보낸 글과 같습니다')
    const conflict = lead.closest<HTMLElement>('[role="alert"]')
    expect(conflict).not.toBeNull()
    expect(screen.queryByText('다른 사람이 이 설명을 바꿨습니다')).toBeNull()
    expect(within(conflict!).getByText('앞 글')).toBeTruthy()
    expect(box().value).toBe('앞 글에 더 친 글')

    fireEvent.click(within(conflict!).getByRole('button', { name: '지금 글로 덮기' }))
    await waitFor(() => expect(server.bases).toHaveLength(3))
    expect(server.bases).toEqual([{ description: '서버 값' }, { description: '서버 값' }, { description: '앞 글' }])
    await server.respond(1)

    expect(await screen.findByText('설명을 저장했습니다')).toBeTruthy()
    expect(server.stored()).toBe('앞 글에 더 친 글')
    expect(screen.queryByText('지금 저장된 설명이 앞서 보낸 글과 같습니다')).toBeNull()
  })

  it('다시 읽기도 실패하면 모른다 — 잠금을 쥔 채 «다시 확인»을 주고, 누르면 판정한다', async () => {
    const server = descriptionServer('서버 값')
    await saveWithFakeTimers(server, '시간 넘긴 글')
    server.failReads(true)

    await advance(WRITE_DEADLINE_MS)
    vi.useRealTimers()

    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('응답이 없고, 저장됐는지 확인하지도 못했습니다'))
    // **풀지 않는다** — 모르는 채 풀면 둘째 저장이 나가 늦게 커밋될 수 있는 첫째와 겹친다(Q).
    expect(box().disabled).toBe(true)
    expect(saveButton().disabled).toBe(true)

    server.failReads(false)
    server.commit()
    fireEvent.click(screen.getByRole('button', { name: '다시 확인' }))

    await waitFor(() => expect(screen.queryByText(MATCHED)).not.toBeNull())
    expect(box().disabled).toBe(false)
    expect(screen.queryByRole('button', { name: '다시 확인' })).toBeNull()
  })

  /**
   * «모름» 동안 세션이 끝났다(다른 탭의 로그아웃). «다시 확인»의 다시 읽기가 401 이면 «확인하지도 못했습니다»가 아니라
   * 로그인 화면이다(장부 공통 — 트리도 같다: `menu-crud.test.tsx`의 ««모름» 동안 세션이 끝났으면 …»). 401 을 «모름»으로
   * 두면 잠긴 상자 앞에 머문다.
   *
   * 혼자 죽는 변조: `attempt`가 다시 읽기의 401 을 «모름»으로 둔다. 트리 케이스도 **함께** 죽는다 — 이 축의 주인은 이것이다.
   */
  it('«모름» 동안 세션이 끝났으면 «다시 확인»의 401 이 로그인 화면으로 간다 — «확인하지도 못했습니다»에 머물지 않는다', async () => {
    const server = descriptionServer('서버 값')
    await saveWithFakeTimers(server, '시간 넘긴 글')
    server.failReads(true)

    await advance(WRITE_DEADLINE_MS)
    vi.useRealTimers()
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('응답이 없고, 저장됐는지 확인하지도 못했습니다'))

    server.failReads(true, new ApiError(401, 'unauthenticated', '로그인이 필요합니다'))
    fireEvent.click(screen.getByRole('button', { name: '다시 확인' }))

    await waitFor(() => expect(screen.queryByLabelText('이메일')).not.toBeNull())
  })

  it('판정용 다시 읽기에도 시간 제한이 있다 — 매달리면 끊고 모른다: «다시 확인»이 선다', async () => {
    // **판정용 다시 읽기에 시간 제한이 없으면, 다시 읽기가 응답하지 않을 때 «확인 중»에 머물고 «다시 확인»도
    // 없다**(Chrome 에서 잰 고장 방식 — F5 말고 탈출구가 없고 초안을 잃는다).
    const server = descriptionServer('서버 값')
    await saveWithFakeTimers(server, '시간 넘긴 글')
    server.holdReads(true)

    await advance(WRITE_DEADLINE_MS)
    expect(screen.getByText('응답이 없어 저장됐는지 서버에서 확인하는 중입니다')).toBeTruthy()
    expect(server.readSignals.at(-1)?.aborted).toBe(false)

    await advance(WRITE_DEADLINE_MS)
    vi.useRealTimers()

    await waitFor(() => expect(screen.getByRole('button', { name: '다시 확인' })).toBeTruthy())
    // **판정용 읽기를 끊었다** — 매달린 읽기가 남지 않는다.
    expect(server.readSignals.at(-1)?.aborted).toBe(true)
    expect(box().disabled).toBe(true)

    // **양성 대조** — 누르면 다시 판정한다.
    server.holdReads(false)
    server.commit()
    fireEvent.click(screen.getByRole('button', { name: '다시 확인' }))
    await waitFor(() => expect(screen.queryByText(MATCHED)).not.toBeNull())
    expect(box().disabled).toBe(false)
  })

  it('늦게 온 원래 응답은 판정을 뒤집지 않는다', async () => {
    const server = descriptionServer('서버 값', { ignoreAbort: true })
    await saveWithFakeTimers(server, '시간 넘긴 글')

    await advance(WRITE_DEADLINE_MS)
    vi.useRealTimers()
    await waitFor(() => expect(box().disabled).toBe(false))

    /** 판정이 세운 화면. **값을 적지 않고 앞뒤를 견준다** — 판정의 문장·초안은 위 케이스들의 축이다. */
    const seen = (): unknown => ({
      value: box().value,
      boxDisabled: box().disabled,
      saveDisabled: saveButton().disabled,
      alerts: screen.queryAllByRole('alert').map((element) => element.textContent),
      statuses: screen.queryAllByRole('status').map((element) => element.textContent),
    })
    const judged = seen()

    // 판정 뒤에 원래 요청의 성공 응답이 온다 — 신호를 안 보는 가짜라 온다.
    await server.respond()

    expect(seen()).toEqual(judged)
  })

  /** 코멘트를 치고 단다 — **가짜 타이머를 켠 뒤에** 누른다. */
  async function postWithFakeTimers(server: ReturnType<typeof commentServer>, text: string): Promise<void> {
    await openPage(DOC, { apiOverrides: server.overrides })
    await toCommentTab()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    type(commentBox(), text)
    fireEvent.click(submitButton())
  }

  it('코멘트 — 서버가 첫 게시를 안 받았으면 다시 보낸 것이 달린다: 한 행', async () => {
    const server = commentServer()
    await postWithFakeTimers(server, '시간 넘긴 코멘트')

    await advance(WRITE_DEADLINE_MS)
    vi.useRealTimers()
    // 다시 보낸 것도 붙잡힌다 — 그동안은 «확인 중»이고 잠겨 있다.
    await waitFor(() => expect(server.keys).toHaveLength(2))
    expect(commentBox().disabled).toBe(true)
    expect(screen.getByText('응답이 없어 반영됐는지 서버에서 확인하는 중입니다')).toBeTruthy()

    await server.respond(1)

    await waitFor(() => expect(screen.queryByText('시간 넘긴 코멘트')).not.toBeNull())
    expect(commentBox().value).toBe('')
    expect(commentBox().disabled).toBe(false)
    expect(server.rows()).toHaveLength(1)
  })

  it('코멘트 — 목록을 읽은 뒤 다른 곳에서 달린 같은 글을 이 게시로 치지 않는다', async () => {
    // 판정을 «보내기 전 목록에 없던 · 같은 노드 · 같은 글 · 내가 쓴 행»을 찾아서 하면, 목록을 읽은 **뒤에**
    // 다른 탭에서 같은 글을 달 때 그 행이 이 게시로 읽혀 서버에 안 닿은 게시가 «달림»이 되고 초안이
    // 지워진다(Chrome 에서 잰 고장 방식 — DB 1행).
    const server = commentServer()
    await postWithFakeTimers(server, '확인')
    server.addElsewhere('확인')

    await advance(WRITE_DEADLINE_MS)
    vi.useRealTimers()
    await waitFor(() => expect(server.keys).toHaveLength(2))
    await server.respond(1)

    await waitFor(() => expect(commentBox().value).toBe(''))
    // **이 게시가 달렸다** — 다른 곳의 것과 이것, 두 행이다.
    expect(server.rows().map((row) => row.body)).toEqual(['확인', '확인'])
  })

  it('코멘트 — 다시 보낸 것을 서버가 거절하면(4xx) 달리지 않은 것이 확정이다: 그 문장을 말하고 초안을 남긴다', async () => {
    const server = commentServer()
    await postWithFakeTimers(server, '시간 넘긴 코멘트')
    server.failNext(new ApiError(409, 'conflict', '페이지가 이미 변경되었습니다 (요청 baseSeq 7, 현재 8)'))

    await advance(WRITE_DEADLINE_MS)
    vi.useRealTimers()

    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('페이지가 이미 변경되었습니다 (요청 baseSeq 7, 현재 8)'))
    expect(commentBox().value).toBe('시간 넘긴 코멘트')
    expect(commentBox().disabled).toBe(false)
    expect(server.rows()).toHaveLength(0)

    // **다시 달면 같은 키다** — 같은 초안이다.
    fireEvent.click(submitButton())
    await waitFor(() => expect(server.keys).toHaveLength(3))
    expect(server.keys[2]).toBe(server.keys[0])
  })

  it('코멘트 — 다시 보낸 것을 api 가 500 으로 거절해도(봉투) 모른다 — 앞 게시는 아직 서버에 있다: «다시 확인»이 달아 준다', async () => {
    // 이 500 을 첫 보내기처럼 «안 달림»으로 확정하면 초안이 열리고, 첫 게시가 커밋돼 있으면 고쳐 달 때 두 행이다
    // (Chrome route + DB 오류 모델로 잰 고장 방식). 그 500 은 **다시 보낸 요청이** 커밋 전이라는 것이지 앞 게시에
    // 대해서는 아무것도 말하지 않는다(`comment-panel.tsx`의 `knownRejection` 표).
    const server = commentServer()
    await postWithFakeTimers(server, '시간 넘긴 코멘트')
    server.failNext(new ApiError(500, 'internal', '서버 오류가 발생했습니다', [], true))

    await advance(WRITE_DEADLINE_MS)
    vi.useRealTimers()

    // 첫 게시는 가짜 서버에 아직 붙잡혀 있다 — «안 달림»이라고 말하면 거짓이다.
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('응답이 없고, 반영됐는지 확인하지도 못했습니다'))
    expect(commentBox().disabled).toBe(true)
    expect(server.rows()).toHaveLength(0)

    // DB 가 돌아와 앞 게시가 커밋됐다 → «다시 확인»이 같은 키로 보내 재생을 받는다.
    server.commit(0)
    fireEvent.click(screen.getByRole('button', { name: '다시 확인' }))
    await waitFor(() => expect(server.keys).toHaveLength(3))
    expect(server.keys[2]).toBe(server.keys[0])

    await waitFor(() => expect(screen.queryByText('시간 넘긴 코멘트')).not.toBeNull())
    expect(commentBox().value).toBe('')
    expect(commentBox().disabled).toBe(false)
    expect(server.rows()).toHaveLength(1)
  })

  it('코멘트 — 다시 보낸 것도 연결이 실패하면 모른다: 잠금을 쥔 채 «다시 확인»이 같은 키로 또 보낸다', async () => {
    const server = commentServer()
    await postWithFakeTimers(server, '시간 넘긴 코멘트')
    server.failNext(new ApiError(0, 'internal', '서버에 연결하지 못했습니다'))

    await advance(WRITE_DEADLINE_MS)
    vi.useRealTimers()

    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('응답이 없고, 반영됐는지 확인하지도 못했습니다'))
    expect(commentBox().disabled).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: '다시 확인' }))
    await waitFor(() => expect(server.keys).toHaveLength(3))
    expect(server.keys[2]).toBe(server.keys[0])
    await server.respond(1)

    await waitFor(() => expect(screen.queryByText('시간 넘긴 코멘트')).not.toBeNull())
    expect(commentBox().value).toBe('')
    expect(server.rows()).toHaveLength(1)
  })

  it('코멘트 삭제 — 다시 누른 삭제가 409 면 목록을 다시 받는다: 이미 지워진 코멘트가 남지 않는다', async () => {
    // «지워지지 않았습니다» 판정 뒤 서버가 앞 삭제를 늦게 커밋하면, 다시 누른 삭제는 409 를 받는다 — 그때 목록을
    // 다시 받지 않으면 이미 지워진 코멘트가 남는다(Chrome 에서 잰 고장 방식). 여기서는 그 둘째 삭제만 흉내 낸다 — 서버에서 행은
    // 이미 사라졌고 요청은 `stale`로 409 다.
    let rows = [comment('c-1', '지울 말'), comment('c-2', '남을 말')]
    await openPage(DOC, {
      apiOverrides: {
        listComments: async () => [...rows],
        deleteComment: (async () => {
          rows = rows.filter((row) => row.id !== 'c-1')
          throw new ApiError(409, 'conflict', '페이지가 이미 변경되었습니다 (요청 baseSeq 7, 현재 8)')
        }) as never,
      },
    })
    await toCommentTab()
    await screen.findByText('지울 말')

    const row = screen.getByText('지울 말').closest('li') as HTMLElement
    fireEvent.click(within(row).getByRole('button', { name: '삭제' }))

    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('페이지가 이미 변경되었습니다 (요청 baseSeq 7, 현재 8)'))
    await waitFor(() => expect(screen.queryByText('지울 말')).toBeNull())
    expect(screen.getByText('남을 말')).toBeTruthy()
  })

  it('코멘트 수정 — 목록의 본문이 고친 글이면 저장된 것이다: 편집 칸을 닫는다', async () => {
    const server = commentServer([comment('c-1', '원래 코멘트')])
    await openPage(DOC, { apiOverrides: server.overrides })
    await toCommentTab()
    fireEvent.click(await screen.findByRole('button', { name: '수정' }))
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    type(screen.getByRole('textbox', { name: '코멘트 수정' }) as HTMLTextAreaElement, '시간 넘긴 수정')
    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    server.commit()

    await advance(WRITE_DEADLINE_MS)
    vi.useRealTimers()

    await waitFor(() => expect(screen.queryByRole('textbox', { name: '코멘트 수정' })).toBeNull())
    expect(screen.getByText('시간 넘긴 수정')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

/**
 * ## 시간 안의 모르는 실패 — 같은 키로 다시 보내 판정한다
 *
 * 첫 게시가 서버에 닿았는데 브라우저가 502·연결 끊김을 받을 때 그것을 `'failed'`로 읽으면 초안이 열리고, 고쳐
 * 달면 새 키라 **두 행**이다(Chrome route 로 잰 고장 방식). 그래서 **모르는 실패**는 판정(같은 키로
 * 다시 보내기)으로 간다. 무엇이 모르는 실패인지는 `src/panels/comment-panel.tsx`의 `knownRejection` 표가
 * 갖는다 — 첫 보내기(`'sent'`)와 다시 보낸 것(`'resent'`)이 **봉투 500 에서 갈린다**.
 *
 * | 변조 | 죽는 것 |
 * |---|---|
 * | 모르는 실패도 판정으로 안 보낸다 | *"502 — …"* · *"연결 끊김 — …"* · *"봉투 없는 500 …"* · *"«모름»으로 떠났다 와도 …"* — 축의 주인은 *"502 — …"* |
 * | 502 를 확정으로 | *"502 — …"* **혼자** |
 * | 503 을 확정으로 | *"«모름»으로 떠났다 와도 …"* · 멱등 키 절의 *"다시 보낸 게시는 첫 보내기의 연결 id 를 …"*(503 둘로 «다시 확인»에 선다) — 축의 주인은 앞의 것 |
 * | 봉투 없는 500 을 확정으로(숫자만 본다 — `'sent'` 칸) | *"봉투 없는 500 …"* **혼자** |
 * | 봉투 있는 5xx 를 첫 보내기에서 확정으로(숫자를 안 본다 — `status === 500` 을 뗀다) | *"api 가 낸 503(봉투) 은 모른다 …"* **혼자** |
 * | 연결 끊김(`status` 0)을 확정으로 | *"연결 끊김 — …"* 와 R 절의 *"… 다시 보낸 것도 연결이 실패하면 모른다 …"* — 연결 끊김은 **두 칸 다** «모름»이라 함께 죽는다 |
 * | 연결 끊김을 **첫 보내기에서만** 확정으로(`'sent'` 칸만) | *"연결 끊김 — …"* **혼자** |
 * | 봉투 있는 500 을 첫 보내기에서도 모름으로 | *"api 가 낸 500(봉투) 은 확정이다 …"* · 멱등 키 절의 *"글을 고쳐 …"*·*"페이지를 떠나면 …"*(둘 다 api 의 500 으로 실패시킨다) — 축의 주인은 앞의 것 |
 * | 세션이 끝나 끊긴 실패도 판정으로 보낸다 | *"세션이 끝나 끊긴 게시는 …"* **혼자** |
 * | 다시 보낸 것도 봉투 500 을 확정으로(두 자리가 한 칸을 쓴다) | R 절의 *"… api 가 500 으로 거절해도(봉투) 모른다 …"* **혼자** |
 * | 다시 보낸 것이 `post`를 안 지난다(`keyVerdict`를 안 본다 — 판정 길) | *"다시 보낸 것이 «같은 키 · 다른 글» 409 면 …"* **혼자** |
 * | `keyVerdict`가 늘 `null`(두 길 다) | 그것 · `draft-store.test.tsx`의 *"되살린 글을 달기 전에 다른 탭이 …"* · *"… 그 코멘트가 지워졌다 …"* — 첫 보내기 길의 주인은 뒤의 둘(고침 · 지움 갈래)
 *
 * `http-client`가 봉투를 실은 실패에 `enveloped`를 세우는지는 `test/api/http-client.test.ts`의 *"api 의 오류
 * 봉투를 실은 실패만 …"*가 갖는다(세우지 않으면 그것 **혼자** 죽는다).
 */
describe('시간 안의 모르는 실패 — 같은 키로 다시 보내 판정한다', () => {
  /** 서버는 커밋했는데 브라우저가 그 실패를 받는 판 — 곧바로 같은 키로 다시 보내 재생을 받아야 한다. */
  async function lostAfterCommit(error: ApiError): Promise<ReturnType<typeof commentServer>> {
    const server = commentServer()
    await openPage(DOC, { apiOverrides: server.overrides })
    await toCommentTab()
    server.commitThenFail(error)
    type(commentBox(), '닿았던 말')
    fireEvent.click(submitButton())
    await waitFor(() => expect(commentBox().value).toBe(''))
    return server
  }

  it('다시 보낸 것이 «같은 키 · 다른 글» 409 면 이미 달렸고 그 뒤 고쳐진 것이다 — 초안과 키를 버리고 그렇다고 말한다', async () => {
    // **«같은 키 · 다른 글» 409 의 고침 갈래 — 판정 길.** 첫 게시는 서버에 달렸는데 브라우저는 502 를 받았고, 같은 키로 다시 보내기
    // 전에 같은 사람이 다른 탭에서 그 코멘트를 고쳤다(Chrome route: 재전송을 붙잡은 사이 다른 탭에서 고침 → 409 ·
    // «이미 달렸고 …» · 상자 비움 · 저장소 `{}` · DB 고친 글 1행). 새로고침 뒤의 첫 보내기 길은 `draft-store.test.tsx`가
    // 잠근다 — 여기는 **다시 보낸 것**이 같은 받는 자리(`submit`의 `post`)를 지나는지를 잠근다.
    const sent: (string | undefined)[] = []
    const reused = new ApiError(409, 'conflict', '같은 멱등 키로 다른 코멘트가 이미 달렸습니다', [
      { path: 'idempotencyKey', message: '같은 멱등 키로 다른 코멘트가 이미 달렸습니다', code: 'idempotency-key-reused' },
    ])
    let listed: Comment[] = []
    await openPage(DOC, {
      apiOverrides: {
        listComments: async () => listed,
        createComment: async (_projectId, _pageId, body) => {
          sent.push(body.idempotencyKey)
          if (sent.length === 1) {
            listed = [comment('c-1', '다른 탭에서 고친 글')]
            throw new ApiError(502, 'internal', '서버 응답을 이해할 수 없습니다')
          }
          throw reused
        },
      },
    })
    await toCommentTab()
    type(commentBox(), '원문')
    fireEvent.click(submitButton())

    await screen.findByText('이 글은 이미 달렸고, 그 뒤 다른 곳에서 고쳐졌습니다 — 목록의 글이 지금 글입니다')
    expect(sent).toHaveLength(2)
    expect(sent[1]).toBe(sent[0])
    expect(commentBox().value).toBe('')
    expect(commentBox().disabled).toBe(false)
    await screen.findByText('다른 탭에서 고친 글')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('502 — 서버가 이미 달았으면 같은 키로 다시 보내 그 행을 받는다: 한 행이고 고쳐 달 틈이 없다', async () => {
    const server = await lostAfterCommit(new ApiError(502, 'internal', '서버 응답을 이해할 수 없습니다'))

    expect(server.keys).toHaveLength(2)
    expect(server.keys[1]).toBe(server.keys[0])
    expect(server.rows()).toHaveLength(1)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('연결 끊김 — 같은 판: 한 행', async () => {
    const server = await lostAfterCommit(new ApiError(0, 'internal', '서버에 연결하지 못했습니다'))

    expect(server.keys[1]).toBe(server.keys[0])
    expect(server.rows()).toHaveLength(1)
  })

  it('봉투 없는 500 은 앞단이 낸 것이다 — 모른다: 같은 판으로 한 행', async () => {
    // Vite 개발 프록시는 api 가 요청을 쥔 채 죽으면 `500 text/plain` 빈 본문을 준다(잰 값 — `knownRejection`).
    const server = await lostAfterCommit(new ApiError(500, 'internal', '서버 응답을 이해할 수 없습니다'))

    expect(server.keys[1]).toBe(server.keys[0])
    expect(server.rows()).toHaveLength(1)
  })

  it('api 가 낸 503(봉투) 은 모른다 — DB 연결을 잃어 COMMIT 의 답을 못 받은 판: 같은 판으로 한 행', async () => {
    // api 는 DB 가 답하지 않은 실패를 **봉투를 실은 503** 으로 낸다(`apps/api/src/db/connection-loss.ts`).
    // 봉투가 있다고 «api 가 냈다 = 커밋 전»으로 읽으면 두 행이다.
    const server = await lostAfterCommit(
      new ApiError(503, 'internal', '데이터베이스와의 연결이 끊겨 요청이 반영됐는지 알 수 없습니다', [], true),
    )

    expect(server.keys[1]).toBe(server.keys[0])
    expect(server.rows()).toHaveLength(1)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  /**
   * 다시 보낸 것이 409 `session-user-changed`(쿠키의 사람이 다르다)면 **앞 게시에 대해 아무것도 모른다** — 서버는 키를 보기
   * 전(인증 훅)에 거절했다. 다른 4xx 처럼 «안 달림»으로 확정하면 앞 게시가 커밋됐어도 초안이 열려 고쳐 달면 두 행이다.
   *
   * 혼자 죽는 변조: `knownRejection`의 `session-user-changed` 줄을 뗀다.
   */
  it('다시 보낸 것이 «쿠키의 사람이 다르다» 409 면 모른다 — 확정하지 않고 «다시 확인»을 준다', async () => {
    const server = commentServer()
    await openPage(DOC, { apiOverrides: server.overrides })
    await toCommentTab()
    const message = '다른 사람으로 로그인됐습니다 — 이 탭이 아는 사용자와 지금 로그인한 사용자가 다릅니다'
    server.failNext(new ApiError(0, 'internal', '서버에 연결하지 못했습니다'))
    server.failNext(new ApiError(409, 'conflict', message, [{ path: 'session', code: 'session-user-changed', message }], true))
    type(commentBox(), '모르는 말')
    fireEvent.click(submitButton())

    await waitFor(() => expect(server.keys).toHaveLength(2))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('응답이 없고, 반영됐는지 확인하지도 못했습니다'))
    expect(screen.getByRole('button', { name: '다시 확인' })).toBeTruthy()
    expect(commentBox().disabled).toBe(true)
  })

  it('api 가 낸 500(봉투) 은 확정이다 — 다시 보내지 않고 그 문장과 초안을 남긴다', async () => {
    const server = commentServer()
    await openPage(DOC, { apiOverrides: server.overrides })
    await toCommentTab()
    server.failNext(new ApiError(500, 'internal', '서버 오류가 발생했습니다', [], true))
    type(commentBox(), '안 달린 말')
    fireEvent.click(submitButton())

    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('서버 오류가 발생했습니다'))
    expect(server.keys).toHaveLength(1)
    expect(commentBox().value).toBe('안 달린 말')
    expect(commentBox().disabled).toBe(false)
  })

  it('세션이 끝나 끊긴 게시는 다시 보내지 않는다 — 끊긴 거절도 «연결 실패»로 읽힌다', async () => {
    const server = commentServer()
    await openPage(DOC, { apiOverrides: { ...server.overrides, ...listProjects, ...accounts } })
    await toCommentTab()
    type(commentBox(), '앨리스의 말')
    fireEvent.click(submitButton())
    await waitFor(() => expect(server.keys).toHaveLength(1))

    await logout()
    await login(BOB)

    // 끊긴 요청이 «연결 실패»로 거절됐다. 판정으로 보냈으면 여기서 둘째 게시가 나갔다.
    expect(server.keys).toHaveLength(1)
  })

  it('«모름»으로 떠났다 와도 상자가 영영 잠기지 않는다 — «다시 확인»으로 판정이 끝나면 풀린다', async () => {
    const server = commentServer()
    await openPage(DOC, { docs: { [OTHER_PAGE_ID]: DOC }, apiOverrides: server.overrides })
    await toCommentTab()
    // 첫 게시도, 같은 키로 다시 보낸 것도 503 이다(서버가 잠깐 못 받는다) — 모른다.
    server.failNext(new ApiError(503, 'internal', '서버 응답을 이해할 수 없습니다'))
    server.failNext(new ApiError(503, 'internal', '서버 응답을 이해할 수 없습니다'))
    type(commentBox(), '매달린 말')
    fireEvent.click(submitButton())
    await waitFor(() => expect(screen.getByRole('button', { name: '다시 확인' })).toBeTruthy())

    const tree = screen.getByRole('region', { name: '메뉴·페이지 트리' })
    fireEvent.click(within(tree).getByRole('link', { name: OTHER_PAGE_TITLE }))
    await waitFor(() => expect(commentBox().disabled).toBe(false))
    fireEvent.click(within(tree).getByRole('link', { name: PAGE_TITLE }))
    await waitFor(() => expect(screen.getByRole('button', { name: '다시 확인' })).toBeTruthy())
    // 초안은 떠날 때 버려진다(«페이지가 바뀌면 버린다») — 잠금과 «다시 확인»은 남는다.
    expect(commentBox().disabled).toBe(true)
    expect(commentBox().value).toBe('')

    fireEvent.click(screen.getByRole('button', { name: '다시 확인' }))
    await waitFor(() => expect(server.keys).toHaveLength(3))
    expect(server.keys[2]).toBe(server.keys[0])
    await server.respond(0)

    await waitFor(() => expect(commentBox().disabled).toBe(false))
    expect(screen.getByText('매달린 말')).toBeTruthy()
    expect(server.rows()).toHaveLength(1)
  })
})

/**
 * ## 멱등 키 — 같은 초안은 같은 키를 싣는다
 *
 * 무엇을 왜 하는지는 `src/panels/comment-panel.tsx`의 `POST_KEYS`, 서버가 무엇을 해 주는지는
 * `apps/api/README.md`의 «멱등 키»가 갖는다. 서버 쪽 케이스는 `apps/api/test/comments.test.ts`·
 * `comments-concurrency.test.ts`의 «멱등 키» 절이다. 여기는 **화면이 무엇을 싣는가**를 잰다.
 *
 * | 변조 | 죽는 것 |
 * |---|---|
 * | 재생 뒤에 번호 어긋남을 안 본다(`missed`) | *"재생은 앞 게시의 번호 변화를 못 받았다 …"* **혼자** |
 * | 키가 글에 안 매인다(고쳐도 같은 키) | *"글을 고쳐 다시 달면 새 키다 …"* **혼자** |
 * | 달려도 키를 안 버린다 | *"달리면 키를 버린다 …"* **혼자** |
 * | 키를 페이지를 넘어 든다(모듈 전역 — 장부에 드는 꼴) | *"페이지를 떠나면 키도 …"* **혼자** |
 * | 다시 보낼 때 새 키를 짓는다 | *"다시 보낸 게시는 같은 키를 싣는다 …"* · *"재생은 …"* · R 절의 *"… 연결이 실패하면 모른다 …"* |
 * | 셸이 바뀌었어도 재생의 번호 어긋남을 말한다(`ownerLive`) | **0** — jsdom 에는 실시간 방송이 없다. Chrome 으로 잰다(`comment-panel.tsx`의 `landed`: 이 조건을 빼면 번호 `1`이 보이는데 «반영하지 못했습니다»가 선다) |
 * | 다시 보낸 게시가 첫 보내기의 연결 id 를 안 싣는다(지금 연결이 나간다) | *"다시 보낸 게시는 첫 보내기의 연결 id 를 …"* **혼자**. 그 뜻은 Chrome 이 쟀다(`comment-panel.tsx`의 `submit`: 새 셸의 번호 칸 `–` · 통지 없음) |
 * | 연결 id 를 다시 보낼 때 읽는다(보낼 때 잡지 않는다) | 같은 케이스 **혼자** |
 *
 * **«같은 키로 다시 보낸다»는 혼자 죽지 않는다** — 그것이 깨지면 재생이 안 일어나 *"재생은 …"*이 설
 * 자리가 없어진다. **그 축의 주인은 *"다시 보낸 게시는 같은 키를 싣는다 …"*다** — *"재생은 …"*은 그 위에서
 * «번호 어긋남을 말한다»를 재고 혼자 죽는 변조가 있다(첫 줄). 본문에 키가 실리는지는
 * `test/api/http-client.test.ts`의 *"createComment 는 멱등 키를 …"*가 갖는다(그 줄을 떨구면 혼자 죽는다).
 */
describe('멱등 키 — 같은 초안은 같은 키를 싣고, 성공·고침·떠남에 버린다', () => {
  function toPage(title: string): void {
    fireEvent.click(within(screen.getByRole('region', { name: '메뉴·페이지 트리' })).getByRole('link', { name: title }))
  }

  /**
   * 응답 없는 게시 → 10초 → 같은 키로 다시 보낸다(붙잡힘) → 서버가 첫 게시를 **늦게** 커밋 → 다시 보낸 것이
   * 그 뒤에 줄을 서서 재생을 받는다(Chrome 에서는 서버 안에 16초 지연을 넣어 잰 판이다).
   */
  async function lateCommitWhileResending(server: ReturnType<typeof commentServer>): Promise<void> {
    await openPage(DOC, { apiOverrides: server.overrides })
    await toCommentTab()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    type(commentBox(), '늦게 달린 말')
    fireEvent.click(submitButton())
    await advance(WRITE_DEADLINE_MS)
    vi.useRealTimers()
    await waitFor(() => expect(server.keys).toHaveLength(2))

    // 판정(다시 보내기) **도중에** 서버가 첫 게시를 커밋한다.
    server.commit(0)
    await server.respond(1)
    await waitFor(() => expect(screen.queryByText('늦게 달린 말')).not.toBeNull())
  }

  it('다시 보낸 게시는 같은 키를 싣는다 — 서버가 첫 게시를 늦게 커밋했어도 한 행이다', async () => {
    const server = commentServer()
    await lateCommitWhileResending(server)

    expect(server.keys).toHaveLength(2)
    expect(server.keys[0]).toBeTypeOf('string')
    expect(server.keys[1]).toBe(server.keys[0])
    expect(server.rows()).toHaveLength(1)
    expect(commentBox().value).toBe('')
  })

  it('재생은 앞 게시의 번호 변화를 못 받았다 — 그렇다고 말한다', async () => {
    // 재생 응답은 `markerOps: []`인데 서버는 번호 1 을 말한다. 보낼 때 내 문서의 루트에 번호가
    // 없었으니 앞 게시의 변화를 못 받은 것이다(시간 초과로 끊겼다). 말하지 않으면 «코멘트는
    // 달렸는데 캔버스에 번호가 없고 아무도 말하지 않는» 상태다(`comment-panel.tsx`의 `MARKERS_DIVERGED`).
    const server = commentServer()
    await lateCommitWhileResending(server)

    expect(screen.getByText('번호를 화면에 반영하지 못했습니다 — 새로고침하면 맞춰집니다')).toBeTruthy()
  })

  it('다시 보낸 게시는 첫 보내기의 연결 id 를 싣는다 — 그 사이 셸째 떠났다 왔어도', async () => {
    // 서버는 게시를 낸 연결을 방송에서 뺀다. 다시 보낸 것이 **지금** 연결을 실으면 셸째 떠났다 온 판에서
    // 그것은 새 셸의 연결이라 새 셸이 번호를 못 받는다(Chrome — `comment-panel.tsx`의 `submit`). **jsdom 에는
    // 방송이 없어 여기서는 싣는 값만 잰다** — 헤더로 나가는지는 `test/api/http-client.test.ts`가 갖는다.
    const server = commentServer()
    const live = connections()
    await openPage(DOC, { apiOverrides: { ...server.overrides, ...listProjects }, realtime: live.setup })
    await toCommentTab()
    live.holder.set('wsc_old')
    // 첫 보내기도 다시 보낸 것도 모른다 — «다시 확인»에 선다.
    server.failNext(new ApiError(503, 'internal', '서버 응답을 이해할 수 없습니다'))
    server.failNext(new ApiError(503, 'internal', '서버 응답을 이해할 수 없습니다'))
    type(commentBox(), '셸을 넘는 말')
    fireEvent.click(submitButton())
    await waitFor(() => expect(screen.getByRole('button', { name: '다시 확인' })).toBeTruthy())

    await leaveEditorAndReturn()
    await toCommentTab()
    // 새 셸은 새 연결이다.
    live.holder.set('wsc_new')
    fireEvent.click(await screen.findByRole('button', { name: '다시 확인' }))
    await waitFor(() => expect(server.keys).toHaveLength(3))

    expect(server.origins).toEqual(['wsc_old', 'wsc_old', 'wsc_old'])
    expect(server.keys[2]).toBe(server.keys[0])
  })

  it('글을 고쳐 다시 달면 새 키다 — 고친 글은 다른 게시다', async () => {
    const server = commentServer()
    await openPage(DOC, { apiOverrides: server.overrides })
    await toCommentTab()
    server.failNext()
    type(commentBox(), '처음 쓴 말')
    fireEvent.click(submitButton())
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('서버 오류가 발생했습니다'))

    type(commentBox(), '고쳐 쓴 말')
    fireEvent.click(submitButton())
    await waitFor(() => expect(server.keys).toHaveLength(2))

    expect(server.keys[1]).not.toBe(server.keys[0])
  })

  it('달리면 키를 버린다 — 같은 말을 또 달면 새 키다(새 게시다)', async () => {
    const server = commentServer()
    await openPage(DOC, { apiOverrides: server.overrides })
    await toCommentTab()
    type(commentBox(), '확인')
    fireEvent.click(submitButton())
    await server.respond()
    await waitFor(() => expect(commentBox().disabled).toBe(false))

    type(commentBox(), '확인')
    fireEvent.click(submitButton())
    await waitFor(() => expect(server.keys).toHaveLength(2))

    // 같은 키였으면 서버가 앞 행을 돌려줘 **둘째 «확인»이 사라진다.**
    expect(server.keys[1]).not.toBe(server.keys[0])
  })

  it('페이지를 떠나면 키도 초안과 함께 버린다 — 돌아와 같은 말을 치면 새 키다', async () => {
    const server = commentServer()
    await openPage(DOC, { docs: { [OTHER_PAGE_ID]: DOC }, apiOverrides: server.overrides })
    await toCommentTab()
    server.failNext()
    type(commentBox(), '떠나기 전의 말')
    fireEvent.click(submitButton())
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())

    toPage(OTHER_PAGE_TITLE)
    await waitFor(() => expect(commentBox().value).toBe(''))
    toPage(PAGE_TITLE)
    await waitFor(() => expect(commentBox().value).toBe(''))
    type(commentBox(), '떠나기 전의 말')
    fireEvent.click(submitButton())
    await waitFor(() => expect(server.keys).toHaveLength(2))

    expect(server.keys[1]).not.toBe(server.keys[0])
  })
})

/**
 * ## 세션을 넘지 않는다 — 세션이 끝나면 장부를 끊는다
 *
 * 장부는 라우트 표 바깥이라 **로그아웃 뒤에도 산다.** 세션을 가르지 않으면 앞 사람의 쓰기가 다음 사람에게
 * 넘어간다(Chrome 에서 잰 고장 방식 — 잠금 · 통지 · 401 의 `SignedOut`). 무엇을 왜 막는지는
 * `src/panels/write-ledger.tsx`의 «세션을 넘지 않는다»와 `src/session/session-context.tsx`의 «세션 세대»가
 * 갖는다. **하네스는 한 사람으로 돈다** — 여기는 로그인 화면을 지나 **다른 사람**(`BOB`)으로, 또는
 * 세션이 끊긴 **같은 사람**(`ALICE`)으로 다시 들어온다.
 *
 * **401 판은 모델링이다** — 앞 세션의 요청이 **로그아웃보다 먼저 나갔고 서버에는 늦게 닿아** 401 을
 * 받는다(느린 망 · 앞단 큐에서 작은 로그아웃 요청이 앞지르는 판). 가짜 서버가
 * 붙잡은 읽기를 로그인한 뒤에 401 로 끝낸다. **쓰기 자체의 401** 은 실브라우저에서는 안 닿는다 — 세션이
 * 끝나면 그 쓰기를 끊고(첫 케이스) 끊긴 요청의 응답은 브라우저가 버린다. 그래서 그 판은 **끊겨도 응답을
 * 내는 클라이언트**(`ignoreAbort`)로 잰다.
 *
 * 각각이 혼자 죽는 변조(웹 전량에서 잰다):
 *
 * | 변조 | 죽는 것 |
 * |---|---|
 * | 무효화가 세대를 안 올린다 | 이 절의 다섯(*"401 이 늦게 닿는 판 — … 다시 받기 …"* 빼고 전부) |
 * | 세대를 로그아웃 단추에서만 올린다(401 의 `SignedOut`이 부르는 무효화는 안 올린다) | *"같은 사람 — …"* **혼자** |
 * | 세대가 바뀌어도 나가 있는 쓰기를 안 끊는다 | *"다른 사람 — … 로그아웃에 끊기고 …"* **혼자** |
 * | 지난 세대의 쓰기가 새 장부의 항목을 고친다(`put`) | *"앞 세션의 판정이 늦게 끝나도 …"* **혼자** |
 * | 지난 세대의 칸 쓰기를 안 버린다(`deliver`) | *"신호를 안 보는 클라이언트여도 …"* **혼자** |
 * | 세대가 바뀌어도 항목을 안 비운다 | *"… «확인하지도 못했습니다»로 남은 …"* 와 *"앞 세션의 판정이 …"* — **축의 주인은 «확인하지도 못했습니다» 케이스** |
 *
 * ***"401 이 늦게 닿는 판 — 앞 사람의 다시 받기가 …"*는 가드 셋을 다 빼야 죽는다** — 셋이 **저마다 혼자**
 * 이 길을 막는다(이 파일로 잰다: 둘씩 뺀 세 판은 이 케이스가 살고, 셋을 다 뺀 판에서 죽는다):
 *
 * | 가드 | 이 길에서 막는 까닭 | 그것 **하나만** 빼면 혼자 죽는 것 |
 * |---|---|---|
 * | `deliver`의 세대(`write-ledger.tsx`) | 앨리스의 다시 받기는 앨리스의 세대를 단 칸 쓰기다 | *"신호를 안 보는 클라이언트여도 …"* |
 * | `REFRESH`의 번호 대조(`comment-panel.tsx`의 `refresh`) | 밥의 `REFRESH` 칸은 비어 있다 — 앨리스의 번호와 안 맞는다 | 아래 «잠금 밖» 절의 *"다시 받기가 둘 겹쳐 앞 것이 실패해도 …"* |
 * | 그리는 자리의 견줌(`refreshNotice`) | 밥의 방문이 앨리스의 다시 받기보다 **늦게 낸** 조회로 목록을 세웠다 | 아래 절의 *"… «다시 불러오는 중»도 내린다 …"* |
 *
 * 목록 칸의 «늦게 낸 조회만»(`answered`)은 이 길의 가드가 **아니다** — 앨리스의 것은 실패라 목록 칸을 안
 * 쓴다(셋을 뺀 판이 `answered`를 둔 채로 죽는다). **이 케이스는 남긴다** — Chrome 에서 잰 고장(앞 사람의 늦은
 * 401 이 다음 사람을 로그인 화면으로 보낸다) 그대로의 길이고, 가드 셋의 겹침을 걷어 내는 사람이 마지막에 만나는
 * 자리다.
 */
describe('세션을 넘지 않는다 — 세션이 끝나면 앞 세션의 쓰기는 다음 세션에 닿지 않는다', () => {
  it('다른 사람 — 앞 사람의 나가 있는 저장은 로그아웃에 끊기고, 다음 사람의 상자를 잠그지 않는다', async () => {
    const server = descriptionServer('서버 값')
    await openPage(DOC, { apiOverrides: { ...server.overrides, ...listProjects, ...accounts } })
    toView()
    await waitFor(() => expect(box().value).toBe('서버 값'))

    type(box(), '앨리스의 글')
    fireEvent.click(saveButton())
    await waitFor(() => expect(server.sent).toHaveLength(1))

    await logout()
    // **세션이 끝나면 그 세션의 요청을 끊는다** — 서버에 아직 안 닿았으면 영영 안 간다.
    expect(server.signals[0]?.aborted).toBe(true)

    await login(BOB)
    await returnFromList()
    toView()
    await waitFor(() => expect(box().value).toBe('서버 값'))

    // **세션이 장부를 끊지 않으면 여기서 밥의 상자가 꺼진다**(Chrome 에서 잰 고장 방식 — 앨리스의 쓰기가 잠근다).
    expect(box().disabled).toBe(false)
    expect(screen.queryByRole('alert')).toBeNull()
    type(box(), '밥의 글')
    expect(saveButton().disabled).toBe(false)
  })

  it('다른 사람 — «확인하지도 못했습니다»로 남은 앞 사람의 쓰기가 다음 사람에게 넘어가지 않는다', async () => {
    const server = descriptionServer('서버 값')
    await openPage(DOC, { apiOverrides: { ...server.overrides, ...listProjects, ...accounts } })
    toView()
    await waitFor(() => expect(box().value).toBe('서버 값'))
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    type(box(), '앨리스의 글')
    fireEvent.click(saveButton())
    server.failReads(true)
    await advance(WRITE_DEADLINE_MS)
    vi.useRealTimers()
    await waitFor(() => expect(screen.getByRole('button', { name: '다시 확인' })).toBeTruthy())
    server.failReads(false)

    await logout()
    await login(BOB)
    await returnFromList()
    toView()
    await waitFor(() => expect(box().value).toBe('서버 값'))

    // **세대가 바뀌어도 항목을 안 비우면 밥이 앨리스의 «모름»을 본다** — 꺼진 상자와 «다시 확인».
    expect(box().disabled).toBe(false)
    expect(screen.queryByRole('button', { name: '다시 확인' })).toBeNull()
    expect(screen.queryByText('응답이 없고, 저장됐는지 확인하지도 못했습니다')).toBeNull()
  })

  it('401 이 늦게 닿는 판 — 앞 사람의 다시 받기가 받은 401 은 다음 사람을 로그인 화면으로 보내지 않는다', async () => {
    const server = commentServer()
    await openPage(DOC, { apiOverrides: { ...server.overrides, ...listProjects, ...accounts } })
    await toCommentTab()

    type(commentBox(), '앨리스의 말')
    fireEvent.click(submitButton())
    // 게시는 커밋되고 응답도 온다 — **그 뒤의 목록 다시 받기**가 붙잡힌다.
    server.holdLists(true)
    await server.respond()
    await waitFor(() => expect(server.heldLists()).toBe(1))
    server.holdLists(false)

    await logout()
    await login(BOB)
    await returnFromList()
    await toCommentTab()
    // 밥이 건 목록 조회는 커밋된 행을 읽는다 — 앨리스의 게시는 서버에서 정상 처리됐다.
    await screen.findByText('앨리스의 말')

    // 앨리스의 다시 받기가 로그아웃 **뒤에** 서버에 닿아 401 을 받는다(모델링 — 위 머리말).
    await server.failHeldLists()

    // **가드가 없으면 여기서 밥이 로그인 화면으로 튕긴다**(Chrome 에서 잰 고장 방식 — 밥의 `/me`는 200 이다).
    expect(screen.queryByLabelText('이메일')).toBeNull()
    expect(commentBox().disabled).toBe(false)
    expect(screen.getByText('앨리스의 말')).toBeTruthy()
  })

  it('신호를 안 보는 클라이언트여도 — 앞 세션 쓰기의 늦은 401 은 다음 사람을 로그인 화면으로 보내지 않는다', async () => {
    // 실브라우저는 로그아웃에 끊긴 쓰기의 응답을 버린다(첫 케이스). **끊겨도 응답을 내는 클라이언트**(장부가
    // 견딘다고 적은 부류 — R 절의 *"늦게 온 원래 응답은 …"*과 같은 가짜)면 그 401 이 밥의 방문이 선 뒤에
    // 뒷일로 닿는다. 그때 막는 것이 **칸 쓰기의 세대**다(`deliver`).
    const server = descriptionServer('서버 값', { ignoreAbort: true })
    await openPage(DOC, { apiOverrides: { ...server.overrides, ...listProjects, ...accounts } })
    toView()
    await waitFor(() => expect(box().value).toBe('서버 값'))
    type(box(), '앨리스의 글')
    fireEvent.click(saveButton())
    await waitFor(() => expect(server.sent).toHaveLength(1))

    await logout()
    await login(BOB)
    await returnFromList()
    toView()
    await waitFor(() => expect(box().value).toBe('서버 값'))

    await server.fail(0, new ApiError(401, 'unauthenticated', '로그인이 필요합니다'))

    expect(screen.queryByLabelText('이메일')).toBeNull()
    expect(box().disabled).toBe(false)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('같은 사람 — 세션이 끊겨 다시 로그인한 새 세션은 앞 세션의 저장에 잠기지 않는다', async () => {
    const server = descriptionServer('서버 값')
    let expired = false
    await openPage(DOC, {
      apiOverrides: {
        ...server.overrides,
        ...accounts,
        // 서버가 세션을 지웠다 — 다음 조회가 401 을 받고 `SignedOut`이 로그인 화면으로 보낸다.
        listProjects: async () => {
          if (expired) throw new ApiError(401, 'unauthenticated', '로그인이 필요합니다')
          return [PROJECT]
        },
        login: (async () => {
          expired = false
          return ALICE
        }) as never,
      },
    })
    toView()
    await waitFor(() => expect(box().value).toBe('서버 값'))

    type(box(), '만료 전의 글')
    fireEvent.click(saveButton())
    await waitFor(() => expect(server.sent).toHaveLength(1))

    expired = true
    fireEvent.click(screen.getByRole('link', { name: '프로젝트 목록' }))
    await screen.findByLabelText('이메일')

    await login(ALICE)
    await returnFromList()
    toView()
    await waitFor(() => expect(box().value).toBe('서버 값'))

    // **사람은 같아도 세션이 다르다** — 로그아웃 단추가 아니라 401 이 세션을 끝낸 판이다.
    expect(box().disabled).toBe(false)
    type(box(), '다시 들어와 친 글')
    expect(saveButton().disabled).toBe(false)
  })

  it('앞 세션의 판정이 늦게 끝나도 다음 세션의 잠금을 풀지 않는다', async () => {
    const server = descriptionServer('서버 값')
    await openPage(DOC, { apiOverrides: { ...server.overrides, ...listProjects, ...accounts } })
    toView()
    await waitFor(() => expect(box().value).toBe('서버 값'))
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    type(box(), '앨리스의 글')
    fireEvent.click(saveButton())
    // 시간이 넘어 다시 읽는다 — 그 읽기가 붙잡힌다(«확인 중»).
    server.holdReads(true)
    await advance(WRITE_DEADLINE_MS)
    vi.useRealTimers()
    server.holdReads(false)

    await logout()
    await login(BOB)
    await returnFromList()
    toView()
    await waitFor(() => expect(box().value).toBe('서버 값'))
    expect(box().disabled).toBe(false)

    type(box(), '밥의 글')
    fireEvent.click(saveButton())
    await waitFor(() => expect(server.sent).toHaveLength(2))
    expect(box().disabled).toBe(true)

    // 앨리스의 판정이 이제야 끝난다. **밥의 저장은 아직 나가 있다** — 잠금이 남아야 한다.
    await server.releaseReads()
    expect(box().disabled).toBe(true)
    expect(saveButton().disabled).toBe(true)
    expect(screen.queryByRole('alert')).toBeNull()

    // **양성 대조** — 밥의 응답이 오면 풀린다.
    await server.respond(1)
    await waitFor(() => expect(screen.queryByText('설명을 저장했습니다')).not.toBeNull())
    expect(box().disabled).toBe(false)
  })
})

/**
 * ## 탭 사이 — 다른 탭이 들어오면
 *
 * 쿠키는 탭끼리 하나라 다른 탭의 로그인이 이 탭의 쿠키도 바꾼다. 이 탭의 세대가 안 오르면 **나가 있던 앨리스의
 * 게시가 판정(같은 키 재전송)을 밥의 쿠키로 낸다** — DB 에 같은 글 alice · bob 두 행(Chrome 에서 잰 고장 방식). 받은
 * 탭이 무엇을 하는지는 `src/session/session-context.tsx`의 «탭 사이»가 갖는다. 여기는 **쓰기**만 본다 — 화면이 어디로
 * 가는지는 `test/session/tab-session.test.tsx`, WS 는 `test/edit/reconnect-resync.test.tsx`가 잰다.
 *
 * | 변조 | 죽는 것 |
 * |---|---|
 * | 다른 사람이 들어와도 세대를 안 올린다(`heard`) | *"다른 사람 — … 밥의 쿠키로 다시 보내지 않는다"* **혼자** |
 * | 같은 사람이 다시 들어와도 세대를 올린다 | *"같은 사람 — … 끊지 않는다"* **혼자** |
 */
describe('탭 사이 — 다른 탭이 들어오면 나가 있던 쓰기는', () => {
  it('다른 사람 — 다른 탭이 밥으로 들어오면 나가 있던 앨리스의 게시를 끊는다: 판정을 밥의 쿠키로 다시 보내지 않는다', async () => {
    const hub = tabHub()
    const server = commentServer()
    await openPage(DOC, { apiOverrides: { ...server.overrides, ...listProjects }, tabChannel: hub.channel })
    await toCommentTab()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    type(commentBox(), '앨리스의 말')
    fireEvent.click(submitButton())
    expect(server.keys).toHaveLength(1)

    await hub.fromOtherTab({ kind: 'signed-in', user: BOB })
    // 시간 제한을 넘긴다 — 세대가 안 오르면 여기서 같은 키로 다시 보낸다(밥의 쿠키로).
    await advance(WRITE_DEADLINE_MS * 2)
    vi.useRealTimers()

    expect(server.keys).toHaveLength(1)
    expect(server.rows()).toEqual([])
  })

  it('같은 사람 — 다른 탭이 같은 사람으로 다시 들어와도 나가 있던 저장은 끊지 않는다: 응답이 오면 저장했다고 말한다', async () => {
    const hub = tabHub()
    const server = descriptionServer('서버 값')
    await openPage(DOC, { apiOverrides: server.overrides, tabChannel: hub.channel })
    toView()
    await waitFor(() => expect(box().value).toBe('서버 값'))
    type(box(), '앨리스의 글')
    fireEvent.click(saveButton())
    await waitFor(() => expect(server.sent).toHaveLength(1))

    await hub.fromOtherTab({ kind: 'signed-in', user: ALICE })

    // **같은 사람이다** — 쿠키의 세션만 새것이고, 이 쓰기를 낸 사람과 쿠키의 사람이 같다.
    expect(server.signals[0]?.aborted).toBe(false)
    expect(box().disabled).toBe(true)
    await server.respond()
    await waitFor(() => expect(screen.queryByText('설명을 저장했습니다')).not.toBeNull())
    expect(box().disabled).toBe(false)
  })
})

/**
 * ## 쓰기가 끝나면 잠금이 풀린다 — 목록 다시 받기는 잠금 밖이다
 *
 * **다시 받기를 쓰기의 뒷일 안에서 기다리면, 게시가 커밋됐는데 뒤의 목록 다시 받기가 매달릴 때 상자가 통지 없이
 * 꺼진 채다**(Chrome 에서 잰 고장 방식 — F5 말고는 안 풀린다). 그래서 쓰기가 끝나면 잠금이 풀리고, 다시 받기는
 * 따로 돈다(`src/panels/comment-panel.tsx`의 `refresh`). 둘이 갈리면 **조회끼리 도착 순서가 뒤집힐 수 있어**,
 * 목록 칸은 늦게 **낸** 조회의 답만 받는다(`answered`).
 *
 * | 변조 | 죽는 것 |
 * |---|---|
 * | 다시 받기를 쓰기의 뒷일 안에서 기다린다 | *"… 매달려도 잠금은 풀린다 …"* 와 *"앞 게시의 다시 받기가 …"* · *"다시 받기가 둘 겹쳐 …"* 둘(셋 다 둘째 게시를 못 보낸다) — **축의 주인은 앞의 것** |
 * | «다시 불러오는 중»을 안 그린다 | *"… 매달려도 잠금은 풀린다 …"* 와 *"… «다시 불러오는 중»도 내린다 …"*(그 문장이 서는 것부터 기다린다) · *"다시 받기가 둘 겹쳐 …"* 둘 — **축의 주인은 앞의 것** |
 * | 그 문장을 보이는 목록과 견주지 않는다(매달린 다시 받기가 있으면 늘 말한다) | *"… «다시 불러오는 중»도 내린다 …"* **혼자** |
 * | 다시 받기가 실패하면 목록 자리를 실패로 바꾼다 | *"목록 다시 받기가 실패하면 …"* 와 *"다시 받기가 둘 겹쳐 앞 것이 실패해도 …"* — **축의 주인은 앞의 것** |
 * | 다시 받기의 답을 낸 순서와 무관하게 쓴다 | *"앞 게시의 다시 받기가 늦게 와도 …"* **혼자** |
 * | 다시 받기가 오면 번호를 안 보고 «도는 중»을 지운다(`REFRESH`의 번호 대조 — 성공 쪽) | *"다시 받기가 둘 겹쳐 앞 것이 먼저 오면 …"* **혼자** |
 * | 다시 받기가 실패하면 번호를 안 보고 그 실패를 세운다(같은 대조 — 실패 쪽) | *"다시 받기가 둘 겹쳐 앞 것이 실패해도 …"* **혼자** |
 * | 조회 이펙트의 답을 낸 순서와 무관하게 쓴다 | *"돌아와 건 목록 조회가 늦게 와도 …"* **혼자** |
 *
 * 두 읽기가 신호를 싣는지는 `test/api/http-client.test.ts`의 *"판정용 읽기 둘은 …"*가
 * 갖는다(`getPage`의 신호를 떨구면 그것 **혼자** 죽는다).
 */
describe('쓰기가 끝나면 잠금이 풀린다 — 목록 다시 받기는 잠금 밖이다', () => {
  async function post(text: string): Promise<void> {
    type(commentBox(), text)
    fireEvent.click(submitButton())
  }

  it('게시는 달렸는데 목록 다시 받기가 매달려도 잠금은 풀린다 — «다시 불러오는 중»이라고 말한다', async () => {
    const server = commentServer()
    await openPage(DOC, { apiOverrides: server.overrides })
    await toCommentTab()
    await post('달린 말')
    server.holdLists(true)
    await server.respond()

    await waitFor(() => expect(commentBox().disabled).toBe(false))
    expect(commentBox().value).toBe('')
    expect(screen.getByText('목록을 다시 불러오는 중…')).toBeTruthy()

    // **양성 대조** — 다시 받기가 오면 목록에 서고 말이 사라진다.
    await server.releaseHeldLists()
    await waitFor(() => expect(screen.queryByText('달린 말')).not.toBeNull())
    expect(screen.queryByText('목록을 다시 불러오는 중…')).toBeNull()
  })

  it('다시 받기가 매달린 채 새 조회가 목록을 세우면 «다시 불러오는 중»도 내린다 — 매달린 것은 낡았다', async () => {
    const server = commentServer()
    await openPage(DOC, { apiOverrides: server.overrides })
    await toCommentTab()
    await post('달린 말')
    server.holdLists(true)
    await server.respond()
    await waitFor(() => expect(screen.queryByText('목록을 다시 불러오는 중…')).not.toBeNull())
    server.holdLists(false)

    // 탭을 오가면 새 조회가 나간다 — 게시가 커밋된 **뒤에** 낸 것이다.
    fireEvent.click(screen.getByRole('tab', { name: '속성' }))
    await toCommentTab()
    await waitFor(() => expect(screen.queryByText('달린 말')).not.toBeNull())

    // 그 문장을 보이는 목록과 견주지 않으면 여기서 남는다(Chrome 에서 잰 고장 방식) — 매달린 다시 받기가 아직 안 끝났다.
    expect(screen.queryByText('목록을 다시 불러오는 중…')).toBeNull()
  })

  it('목록 다시 받기가 실패하면 목록은 그대로 두고 그렇다고 말한다 — 쓰기는 끝났다', async () => {
    const server = commentServer([comment('c-1', '먼저 단 말')])
    await openPage(DOC, { apiOverrides: server.overrides })
    await toCommentTab()
    await screen.findByText('먼저 단 말')
    await post('달린 말')
    server.holdLists(true)
    await server.respond()
    await server.failHeldLists(new ApiError(0, 'internal', '서버에 연결하지 못했습니다'))

    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('목록을 다시 불러오지 못했습니다 — 서버에 연결하지 못했습니다'))
    // 다시 받기의 실패로 목록 자리를 통째로 «코멘트를 불러오지 못했습니다»로 바꾸면 이미 받은 목록이 사라진다.
    expect(screen.getByText('먼저 단 말')).toBeTruthy()
    expect(commentBox().disabled).toBe(false)
  })

  it('앞 게시의 다시 받기가 늦게 와도 뒤 게시의 다시 받기가 세운 목록을 덮지 않는다', async () => {
    const server = commentServer()
    await openPage(DOC, { apiOverrides: server.overrides })
    await toCommentTab()
    await post('첫째')
    server.holdLists(true)
    await server.respond(0)
    await waitFor(() => expect(commentBox().disabled).toBe(false))
    server.holdLists(false)

    await post('둘째')
    await server.respond(1)
    await waitFor(() => expect(screen.queryByText('둘째')).not.toBeNull())

    // 첫째의 다시 받기가 이제 온다 — **그것을 낸 순간의 표**(둘째가 없다)다.
    await server.releaseHeldLists()

    expect(screen.getByText('둘째')).toBeTruthy()
    expect(screen.getByText('첫째')).toBeTruthy()
  })

  /** 게시 둘을 잇달아 달고, 둘의 다시 받기를 **다 붙잡은** 채 돌아온다 — 붙잡힌 순서는 첫째 · 둘째다. */
  async function twoHeldRefreshes(server: ReturnType<typeof commentServer>): Promise<void> {
    await post('첫째')
    server.holdLists(true)
    await server.respond(0)
    await waitFor(() => expect(commentBox().disabled).toBe(false))
    await post('둘째')
    await server.respond(1)
    await waitFor(() => expect(server.heldLists()).toBe(2))
    server.holdLists(false)
  }

  it('다시 받기가 둘 겹쳐 앞 것이 먼저 오면 «다시 불러오는 중»이 남는다 — 뒤 것이 아직 돈다', async () => {
    const server = commentServer()
    await openPage(DOC, { apiOverrides: server.overrides })
    await toCommentTab()
    await twoHeldRefreshes(server)

    // 첫째의 다시 받기만 온다 — 그것을 낸 순간의 표(둘째가 없다)다.
    await server.releaseHeldLists(0)
    await waitFor(() => expect(screen.queryByText('첫째')).not.toBeNull())

    // **둘째는 달렸는데 목록에 없다 — 그래서 말이 남아야 한다.** 앞 것의 답이 뒤 것의 «도는 중»을 지우면
    // 방금 단 말이 통지 없이 빠진 목록이 선다(`REFRESH`의 번호 대조).
    expect(screen.queryByText('둘째')).toBeNull()
    expect(screen.getByText('목록을 다시 불러오는 중…')).toBeTruthy()

    // **양성 대조** — 뒤 것이 오면 둘째가 서고 말이 사라진다.
    await server.releaseHeldLists()
    await waitFor(() => expect(screen.queryByText('둘째')).not.toBeNull())
    expect(screen.queryByText('목록을 다시 불러오는 중…')).toBeNull()
  })

  it('다시 받기가 둘 겹쳐 앞 것이 실패해도 그 실패는 말하지 않는다 — 뒤 것이 아직 돈다', async () => {
    const server = commentServer()
    await openPage(DOC, { apiOverrides: server.overrides })
    await toCommentTab()
    await twoHeldRefreshes(server)

    await server.failHeldLists(new ApiError(0, 'internal', '서버에 연결하지 못했습니다'), 0)

    // 번호를 안 보면 여기서 «목록을 다시 불러오지 못했습니다»가 선다 — 뒤 것이 도는 중인데.
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByText('목록을 다시 불러오는 중…')).toBeTruthy()

    await server.releaseHeldLists()
    await waitFor(() => expect(screen.queryByText('둘째')).not.toBeNull())
    expect(screen.getByText('첫째')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('돌아와 건 목록 조회가 늦게 와도 게시 뒤의 다시 받기가 세운 목록을 덮지 않는다', async () => {
    // **«타이밍 창»** — 가 → 나 → 가로 돌아와 건 조회가 게시가 커밋되기 **전에** 읽고 다시 받기보다 **늦게** 오면,
    // 목록 칸이 낸 순서를 안 볼 때(`comment-panel.tsx`의 `answered`) 방금 단 말이 목록에서 사라진다.
    const server = commentServer()
    await openPage(DOC, { docs: { [OTHER_PAGE_ID]: DOC }, apiOverrides: server.overrides })
    await toCommentTab()
    await post('매달린 말')
    await waitFor(() => expect(commentBox().disabled).toBe(true))

    const tree = screen.getByRole('region', { name: '메뉴·페이지 트리' })
    fireEvent.click(within(tree).getByRole('link', { name: OTHER_PAGE_TITLE }))
    await waitFor(() => expect(commentBox().disabled).toBe(false))
    server.holdLists(true)
    fireEvent.click(within(tree).getByRole('link', { name: PAGE_TITLE }))
    await waitFor(() => expect(server.heldLists()).toBe(1))
    server.holdLists(false)

    // 게시가 커밋되고 응답이 온다 → 다시 받기가 곧바로 선다.
    await server.respond()
    await waitFor(() => expect(screen.queryByText('매달린 말')).not.toBeNull())

    // 돌아와 건 조회가 이제 온다 — 커밋 **전**의 빈 표다.
    await server.releaseHeldLists()

    expect(screen.getByText('매달린 말')).toBeTruthy()
  })

  it('돌아와 건 설명 조회가 늦게 와도 저장 응답이 세운 값을 덮지 않는다 — 저장 전 값이 «저장했습니다» 옆에 서지 않는다', async () => {
    // 가 → 나 → 가로 돌아와 건 조회가 저장이 커밋되기 **전**에 읽고 저장의 응답보다 **늦게** 오면, 응답이 왔을 때 칸이
    // `loading`이라 응답이 설 자리가 없고 뒤이어 선 조회가 저장 전 값을 «설명을 저장했습니다»와 함께 보인다 — 번호(저장의
    // 응답은 받을 때 · 조회는 보낼 때)가 그것을 막는다(Chrome route 로 잰 고장 방식 — 이어 고쳐 저장하면 내 앞 저장을
    // «다른 사람이 바꿨습니다»로 보인다).
    const server = descriptionServer('서버 값')
    await openPage(DOC, { docs: { [OTHER_PAGE_ID]: DOC }, apiOverrides: server.overrides })
    toView()
    await waitFor(() => expect(box().value).toBe('서버 값'))
    type(box(), '매달린 저장 글')
    fireEvent.click(saveButton())
    await waitFor(() => expect(server.sent).toHaveLength(1))

    const tree = screen.getByRole('region', { name: '메뉴·페이지 트리' })
    fireEvent.click(within(tree).getByRole('link', { name: OTHER_PAGE_TITLE }))
    await waitFor(() => expect(box().value).toBe(''))
    server.holdReads(true)
    fireEvent.click(within(tree).getByRole('link', { name: PAGE_TITLE }))
    await waitFor(() => expect(server.heldReads()).toBeGreaterThan(0))
    server.holdReads(false)

    // 저장이 커밋되고 응답이 온다 — 돌아와 건 조회는 아직 안 왔다.
    await server.respond()
    await waitFor(() => expect(screen.queryByText('설명을 저장했습니다')).not.toBeNull())
    expect(box().value).toBe('매달린 저장 글')

    // 돌아와 건 조회가 이제 온다 — 커밋 **전**에 읽은 값이다.
    await server.releaseReads(true)

    expect(box().value).toBe('매달린 저장 글')
    expect(screen.getByText('설명을 저장했습니다')).toBeTruthy()
    expect(server.stored()).toBe('매달린 저장 글')
  })
})

/**
 * **설명 칸의 순서 — 409 · 판정용 다시 읽기.** 설명 칸은 «저장의 응답은 받을 때 · 조회는 보낼 때» 번호를 받는다. 그 규칙이
 * 닿아야 하는 자리가 둘 더 있다: 409 의 지금 값은 조회가 `loading`이어도 서야 하고(409 는 제목을 안 싣는다 — 제목은
 * 조회의 것이다), 판정용 다시 읽기도 «보낼 때 번호»를 받아야 한다. 그리고 돌아온 방문에 선 충돌 화면은 덮을 초안이
 * 없으면 «내 글로 덮기»를 보이지 않는다.
 *
 * 혼자 죽는 변조(백업 → 한 곳 → 겨누는 파일만 → 바이트 비교 복원):
 *
 * | 변조 | 죽는 것 |
 * |---|---|
 * | `replace`가 `loading`이면 아무것도 안 한다 | *"409 가 돌아와 건 조회가 도는 중에 오면 …"* **혼자** |
 * | `answered`가 `known`을 안 본다(들고 있던 409 값을 조회의 답이 덮는다) | *"409 가 돌아와 건 조회가 도는 중에 오면 …"* **혼자** |
 * | 판정용 다시 읽기의 번호를 받을 때로(`settleWith(issue(), …)`) | *"판정용 다시 읽기의 답이 …"* **혼자** |
 * | 덮을 초안이 없어도 «내 글로 덮기»를 준다 | *"돌아온 방문에 선 충돌에 덮을 초안이 없으면 …"* **혼자** |
 * | 설명 조회 이펙트의 정리가 요청을 안 끊는다(`leave.abort()`를 뺀다) | *"페이지를 옮기면 설명 조회를 …"* **혼자** |
 * | `late` 화면의 머리를 누가 썼는지 단정하는 문장(«앞서 보낸 설명이 늦게 저장됐습니다 — 다른 사람이 바꾼 것이 아닙니다»)으로 | R 절 *"«저장되지 않았습니다» 뒤 끊긴 쓰기가 늦게 커밋되면 …"* **혼자** |
 * | `late` 문장(떠나 있는 동안)을 같은 단정 문장으로 | S 절 *"설명 — «저장되지 않았습니다» 뒤 늦게 커밋된 내 앞 글을 …"* **혼자** |
 */
describe('설명 칸의 순서 — 409 · 판정용 다시 읽기', () => {
  function toPage(title: string): void {
    fireEvent.click(within(screen.getByRole('region', { name: '메뉴·페이지 트리' })).getByRole('link', { name: title }))
  }

  it('409 가 돌아와 건 조회가 도는 중에 오면, 늦게 온 조회(409 전에 읽은 값)가 409 의 값을 덮지 않는다 — «이미 같습니다» 옆에 낡은 글이 서지 않는다', async () => {
    // 409 가 조회 `loading` 중에 올 때 `replace`가 아무것도 안 하면, 뒤이어 선 조회가 커밋 전 값을 «서버의 설명이 이미
    // 이 글과 같습니다» 옆에 세운다(Chrome route 로 잰 고장 방식).
    const server = descriptionServer('서버 값')
    await openPage(DOC, { docs: { [OTHER_PAGE_ID]: DOC }, apiOverrides: server.overrides })
    toView()
    await waitFor(() => expect(box().value).toBe('서버 값'))
    type(box(), '같은 글')
    fireEvent.click(saveButton())
    await waitFor(() => expect(server.sent).toHaveLength(1))

    toPage(OTHER_PAGE_TITLE)
    await waitFor(() => expect(box().value).toBe(''))
    server.holdReads(true)
    toPage(PAGE_TITLE)
    await waitFor(() => expect(server.heldReads()).toBeGreaterThan(0))
    server.holdReads(false)

    // 그 사이 남이 같은 글을 저장했고, 내 저장은 409 로 그 값을 실어 온다 — 돌아와 건 조회는 아직이다.
    server.overwrite('같은 글')
    await server.fail(0, metaChanged('같은 글'))
    // 조회가 이제 온다 — 409 **전에** 읽은 값이다.
    await server.releaseReads(true)

    await waitFor(() => expect(screen.queryByText('서버의 설명이 이미 이 글과 같습니다')).not.toBeNull())
    expect(box().value).toBe('같은 글')
    // 제목은 조회의 것이다 — 409 는 제목을 안 싣는다.
    expect(screen.getByRole('heading', { name: PAGE_TITLE })).toBeTruthy()
  })

  it('판정용 다시 읽기의 답이 그 뒤에 낸 조회보다 늦게 와도 조회가 세운 값을 덮지 않는다 — 번호는 보낼 때다', async () => {
    // 판정용 다시 읽기는 **보낼 때** 번호를 받는다(`verify`의 `issue()`). 그 뒤에 떠났다 돌아와 건 조회가 더 늦게
    // 읽었으므로 더 새것이다. 받을 때 번호를 주면 먼저 읽은 판정 값이 그것을 덮는다.
    const server = descriptionServer('서버 값')
    await openPage(DOC, { docs: { [OTHER_PAGE_ID]: DOC }, apiOverrides: server.overrides })
    toView()
    await waitFor(() => expect(box().value).toBe('서버 값'))
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    type(box(), '내 글')
    fireEvent.click(saveButton())
    // 서버는 썼는데 응답이 안 온다 — 시간이 되면 끊고 다시 읽는다. 그 다시 읽기(지금 값 `내 글`)를 붙잡는다.
    server.commit()
    server.holdReads(true)
    await advance(WRITE_DEADLINE_MS)
    vi.useRealTimers()
    expect(server.heldReads()).toBe(1)
    server.holdReads(false)

    // 그 뒤 남이 바꾸고, 사용자는 떠났다 돌아온다 — 돌아와 건 조회가 먼저 온다(`남의 글`).
    server.overwrite('남의 글')
    toPage(OTHER_PAGE_TITLE)
    await waitFor(() => expect(box().value).toBe(''))
    toPage(PAGE_TITLE)
    await waitFor(() => expect(box().value).toBe('남의 글'))

    // 판정용 다시 읽기의 답이 이제 온다 — 보낸 순간의 값(`내 글`)이다.
    await server.releaseReads(true)
    await waitFor(() => expect(screen.queryByText(MATCHED)).not.toBeNull())
    expect(box().value).toBe('남의 글')
  })

  it('페이지를 옮기면 설명 조회를 요청째 끊는다 — 떠난 방문의 본문이 브라우저 연결을 쥐지 않는다', async () => {
    // 설명 패널의 조회도 `getPage`라 페이지 문서(Chrome 에서 잰 판은 1MB)를 통째로 받는다 — 캔버스의 조회와 같은 무게다.
    // 끊는 일 자체는 `api/http-client.ts`가 한다(`test/api/http-client.test.ts`의 «떠나면 …»). 여기는 패널이 싣고 끊는가.
    const server = descriptionServer('서버 값')
    await openPage(DOC, { docs: { [OTHER_PAGE_ID]: DOC }, apiOverrides: server.overrides })
    toView()
    await waitFor(() => expect(box().value).toBe('서버 값'))
    server.holdReads(true)
    fireEvent.click(screen.getByRole('button', { name: '편집 모드' }))
    toView()
    await waitFor(() => expect(server.heldReads()).toBe(1))
    const lookup = server.readCancels.at(-1)
    expect(lookup?.aborted).toBe(false)

    toPage(OTHER_PAGE_TITLE)
    await waitFor(() => expect(lookup?.aborted).toBe(true))
    server.holdReads(false)
  })

  it('돌아온 방문에 선 충돌에 덮을 초안이 없으면 «내 글로 덮기»를 안 보인다 — «확인» 하나다', async () => {
    // 저장을 내 둔 채 옆 페이지를 다녀오면 보낸 글은 떠날 때 버려진다(«페이지가 바뀌면 버린다»). 결말이 돌아온 **뒤에** 오면 충돌 화면이
    // 서는데, 거기 «내 글로 덮기»를 두면 눌러도 요청 0 · 통지 변화 0 이다(Chrome 에서 잰 고장 방식). 떠나 있는 **동안** 온
    // 판(아래 S 절)은 «확인»뿐이다 — 두 판의 말을 맞춘다.
    const server = descriptionServer('서버 값')
    await openPage(DOC, { docs: { [OTHER_PAGE_ID]: DOC }, apiOverrides: server.overrides })
    toView()
    await waitFor(() => expect(box().value).toBe('서버 값'))
    type(box(), '내 글')
    fireEvent.click(saveButton())
    await waitFor(() => expect(server.sent).toHaveLength(1))
    toPage(OTHER_PAGE_TITLE)
    await waitFor(() => expect(box().value).toBe(''))
    toPage(PAGE_TITLE)
    await waitFor(() => expect(box().value).toBe('서버 값'))

    server.overwrite('남의 글')
    await server.fail(0, metaChanged('남의 글'))

    const conflict = (await screen.findByText('다른 사람이 이 설명을 바꿨습니다')).closest<HTMLElement>('[role="alert"]')
    expect(conflict).not.toBeNull()
    expect(within(conflict!).queryByRole('button', { name: '내 글로 덮기' })).toBeNull()
    expect(within(conflict!).queryByRole('button', { name: '내 글 버리기' })).toBeNull()
    fireEvent.click(within(conflict!).getByRole('button', { name: '확인' }))
    expect(screen.queryByRole('alert')).toBeNull()
    expect(server.sent).toHaveLength(1)
  })
})

/**
 * **S — 떠나 있는 동안 끝난 실패**(`write-ledger.tsx`의 «떠나 있는 동안 끝난 실패»). 쓰기가 끝난 순간 그 페이지를 보는
 * 방문이 없으면 칸의 통지는 버려진다(`panel-drafts.tsx`의 머리말 «한 값이 두 일을 한다»의 2) — 장부가 남기지 않으면
 * **조용하다**(Chrome 에서 잰 고장 방식: 설명·코멘트를 저장해 둔 채 옆 페이지로 가서 500 을 받으면 나에도 · 돌아온 가에도
 * 통지 0, 401 이면 나에 그대로 머물다 다음 읽기에서야 로그인 화면).
 *
 * 혼자 죽는 변조(백업 → 한 줄 → web 전량 → 바이트 비교 복원):
 *
 * | 변조 | 죽는 것 |
 * |---|---|
 * | 장부가 남기지 않는다(`note(live.epoch, key, failure)` 를 뺀다) | 설명 · 코멘트 둘 — **함께 죽는다**. 그 축의 주인은 *"설명 — 옆 페이지에 가 있는 동안 …"* 이다(코멘트 케이스는 아래 줄의 축을 소유한다) |
 * | 코멘트의 `settle`이 실패를 칸에만 그리고 결말로는 `null`을 돌려준다 | *"코멘트 — …"* **혼자** |
 * | 설명의 `land`가 `'mine'`에도 실패를 돌려준다 | *"설명 — 옆 페이지에 가 있는 동안 409 가 내 글을 실어 오면 …"* **혼자** |
 * | `'other'`의 문장을 `meta-conflict.tsx`의 `metaConflictSentence` 대신 서버 문장으로 | *"설명 — 옆 페이지에 가 있는 동안 409 가 다른 사람의 글을 실어 오면 …"* **혼자** |
 * | 설명의 `land`가 결말에서 `late`를 떨군다(«다른 사람»으로 말함) | *"설명 — «저장되지 않았습니다» 뒤 늦게 커밋된 내 앞 글을 …"* **혼자** |
 * | 설명의 `land`가 결말에서 그 값을 뺀다 | 위 둘(`'other'` · `'late'`) — 값의 자리가 하나라 함께 |
 * | 설명의 409 를 `toFailure`로 돌려준다(판정을 안 지남) | 떠나 있는 동안 409 셋 — 함께(이 결함 자체다) |
 * | 401 을 남기기만 하고 세션을 안 끝낸다 | *"401 이면 …"* **혼자** |
 * | 새 쓰기가 남긴 실패를 안 지운다(`run` 머리의 `note(…, null)`) | *"그 칸의 다음 쓰기가 …"* **혼자** |
 * | «확인»이 안 지운다(`dismiss`를 비운다) | *"설명 — 옆 페이지에 가 있는 동안 …"* **혼자** |
 * | `Receiver.sees`가 늘 거짓(보는 방문도 못 본 것으로 — 실패가 칸과 장부에 **두 번** 선다) | 이 절은 안 죽는다 — 앞 절들의 실패 케이스 일곱(`page-description-edit` 둘 · `draft-store` 하나 · 이 파일 넷)이 `alert` 둘로 죽는다 |
 */
describe('S — 페이지를 떠나 있는 동안 끝난 실패는 돌아오면 말한다 · 401 은 곧바로 로그인 화면이다', () => {
  const MISSED = '이 페이지를 떠나 있는 동안 저장하지 못했습니다'

  function toPage(title: string): void {
    fireEvent.click(within(screen.getByRole('region', { name: '메뉴·페이지 트리' })).getByRole('link', { name: title }))
  }

  /** 설명을 저장해 둔 채(붙잡힘) 옆 페이지로 간다. */
  async function saveAndLeave(server: ReturnType<typeof descriptionServer>, text: string): Promise<void> {
    await openPage(DOC, { docs: { [OTHER_PAGE_ID]: DOC }, apiOverrides: server.overrides })
    toView()
    await waitFor(() => expect(box().value).toBe('서버 값'))
    type(box(), text)
    fireEvent.click(saveButton())
    await waitFor(() => expect(server.sent).toHaveLength(1))
    toPage(OTHER_PAGE_TITLE)
    await waitFor(() => expect(box().value).toBe(''))
  }

  it('설명 — 옆 페이지에 가 있는 동안 저장이 실패하면, 돌아온 가가 그렇다고 말한다 · «확인»이 닫는다', async () => {
    const server = descriptionServer('서버 값')
    await saveAndLeave(server, '실패할 글')
    await server.fail(0, new ApiError(500, 'internal', '서버 오류가 발생했습니다'))
    // 나는 가의 일을 말하지 않는다 — 나의 칸은 나의 것이다.
    expect(screen.queryByRole('alert')).toBeNull()

    toPage(PAGE_TITLE)
    await waitFor(() => expect(box().value).toBe('서버 값'))
    // **장부가 남기지 않으면 여기서 통지가 없다** — 상자는 서버 값이고 «실패할 글»은 떠날 때 버려진다(«페이지가 바뀌면 버린다»).
    expect(screen.getByRole('alert').textContent).toBe(`${MISSED} — 서버 오류가 발생했습니다`)
    expect(box().disabled).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: '확인' }))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  /**
   * **떠나 있는 동안 온 409 도 판정을 지난다.** 장부가 409 를 `toFailure`로 곧바로 읽으면 «… 저장하지 못했습니다 —
   * 다른 사람이 이 페이지를 먼저 바꿨습니다»를 남긴다 — 서버에 내 글이 있는데도(Chrome 에서 잰 고장 방식). 보고
   * 있었으면 «서버의 설명이 이미 이 글과 같습니다»(`'mine'`)다. 그래서 결말은 칸의 판정이 돌려준 것이다.
   */
  it('설명 — 옆 페이지에 가 있는 동안 409 가 내 글을 실어 오면(누가 같은 글을 먼저 썼다) 돌아와도 실패라 말하지 않는다', async () => {
    const server = descriptionServer('서버 값')
    await saveAndLeave(server, '같은 글')
    server.overwrite('같은 글')
    await server.fail(0, metaChanged('같은 글'))

    toPage(PAGE_TITLE)
    await waitFor(() => expect(box().value).toBe('같은 글'))
    // 잠금이 풀렸다 = 장부의 `run`이 결말을 다 읽었다(`finally`) — 남길 것이 있었으면 이미 남겼다.
    expect(box().disabled).toBe(false)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  /**
   * `'other'`면 돌아온 방문이 **다른 사람이 바꿨다는 것과 그 값**을 말한다 — 충돌 화면과 같은 뜻(`metaConflictSentence`).
   * 보낸 글은 페이지를 옮길 때 이미 버려졌다(«페이지가 바뀌면 버린다») — 문장은 덮기를 권하지 않고 단추도 «확인»뿐이다.
   */
  it('설명 — 옆 페이지에 가 있는 동안 409 가 다른 사람의 글을 실어 오면, 돌아온 가가 다른 사람이 바꿨다고 그 값과 함께 말한다', async () => {
    const server = descriptionServer('서버 값')
    await saveAndLeave(server, '내 글')
    server.overwrite('남의 글')
    await server.fail(0, metaChanged('남의 글'))

    toPage(PAGE_TITLE)
    await waitFor(() => expect(box().value).toBe('남의 글'))
    expect(screen.getByRole('alert').textContent).toBe(`${MISSED} — 다른 사람이 이 설명을 바꿨습니다 · 지금 저장된 설명: 남의 글`)
    expect(screen.queryByRole('button', { name: '내 글로 덮기' })).toBeNull()
  })

  /**
   * `'late'`면 «다른 사람이 바꿨다»고 말하지 않는다 — 앞서 보낸 글과 같다고만 말한다(R 절 *"«저장되지 않았습니다» 뒤 끊긴
   * 쓰기가 늦게 커밋되면 …"*의 판을 떠나 있는 동안으로 · 누가 썼는지는 단정하지 않는다). 매달린 값은 보낸
   * 순간의 초안에서 들고 간다 — 떠날 때 초안은 버려져도(«페이지가 바뀌면 버린다») 그 쓰기의 판정은 그것을 안다.
   */
  it('설명 — «저장되지 않았습니다» 뒤 늦게 커밋된 내 앞 글을 떠나 있는 동안 409 가 실어 오면, 돌아온 가가 «다른 사람이 바꿨다» 대신 앞서 보낸 글과 같다고 말한다', async () => {
    const server = descriptionServer('서버 값')
    await openPage(DOC, { docs: { [OTHER_PAGE_ID]: DOC }, apiOverrides: server.overrides })
    toView()
    await waitFor(() => expect(box().value).toBe('서버 값'))
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    type(box(), '앞 글')
    fireEvent.click(saveButton())
    await advance(WRITE_DEADLINE_MS)
    vi.useRealTimers()
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe('응답이 없어 서버를 다시 읽었더니 이 설명은 저장되지 않았습니다'),
    )

    // 끊긴 쓰기가 서버에서 늦게 커밋한다. 더 쳐서 저장하고(붙잡힘) 옆 페이지로 간다.
    server.commit(0)
    type(box(), '앞 글에 더 친 글')
    fireEvent.click(saveButton())
    await waitFor(() => expect(server.sent).toHaveLength(2))
    toPage(OTHER_PAGE_TITLE)
    await waitFor(() => expect(box().value).toBe(''))
    await server.fail(1, metaChanged('앞 글'))

    toPage(PAGE_TITLE)
    await waitFor(() => expect(box().value).toBe('앞 글'))
    expect(screen.getByRole('alert').textContent).toBe(`${MISSED} — 지금 저장된 설명이 앞서 보낸 글과 같습니다 · 지금 저장된 설명: 앞 글`)
  })

  it('코멘트 — 옆 페이지에 가 있는 동안 삭제가 이유 없이 실패하면, 돌아온 가가 코멘트의 문장으로 말한다', async () => {
    const server = commentServer([comment('c-1', '지울 말')])
    let reject: (caught: unknown) => void = () => {}
    await openPage(DOC, {
      docs: { [OTHER_PAGE_ID]: DOC },
      apiOverrides: { ...server.overrides, deleteComment: (() => new Promise((_resolve, fail) => (reject = fail))) as never },
    })
    await toCommentTab()
    await screen.findByText('지울 말')
    fireEvent.click(document.querySelector<HTMLButtonElement>('.wb-shell-comment-delete') as HTMLButtonElement)
    await waitFor(() => expect(commentBox().disabled).toBe(true))
    toPage(OTHER_PAGE_TITLE)
    await waitFor(() => expect(commentBox().disabled).toBe(false))

    // `ApiError`가 아닌 실패 — 문장은 쓰기가 칸에 그린 것이다(`settle`의 결말 · `toFailure`의 둘째 인자).
    await act(async () => reject(new Error('알 수 없는 실패')))
    toPage(PAGE_TITLE)
    await screen.findByText('지울 말')

    expect(screen.getByRole('alert').textContent).toBe(`${MISSED} — 코멘트를 저장하지 못했습니다`)
  })

  it('401 이면 옆 페이지에 머문 채 곧바로 로그인 화면이다 — 다음 읽기를 기다리지 않는다', async () => {
    const server = descriptionServer('서버 값')
    await saveAndLeave(server, '세션이 끝난 글')

    await server.fail(0, new ApiError(401, 'unauthenticated', '로그인이 필요합니다'))

    // **401 을 남기기만 하면 나에 그대로 머문다**(Chrome 에서 잰 고장 방식 — 가로 돌아가 조회가 401 을 받고서야 로그인 화면).
    await waitFor(() => expect(screen.queryByLabelText('이메일')).not.toBeNull())
  })

  it('그 칸의 다음 쓰기가 나가면 남긴 실패는 지워진다 — 성공한 뒤 다시 서지 않는다', async () => {
    const server = descriptionServer('서버 값')
    await saveAndLeave(server, '실패할 글')
    await server.fail(0, new ApiError(500, 'internal', '서버 오류가 발생했습니다'))
    toPage(PAGE_TITLE)
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain(MISSED))

    type(box(), '다시 쓴 글')
    fireEvent.click(saveButton())
    await server.respond(1)

    await waitFor(() => expect(screen.queryByText('설명을 저장했습니다')).not.toBeNull())
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

/**
 * **판정으로 끝난 쓰기도 전한다**(`write-ledger.tsx`의 «판정으로 끝난 쓰기도 전한다»). 받는 자리가 없을 때 `'failed'`만 남기면,
 * 시간 제한 → 다시 읽기로 **판정된** 결말(«저장되지 않았습니다» · «다른 사람이 바꿨습니다»)과 코멘트의 «이미 달렸고 그 뒤
 * 지워졌다 · 고쳐졌다»(409 — `done` · `verified`로 온다)가 버려진다. 특히 «지워졌다»는 목록 · 상자 · 통지가 다 비어 **말 없는
 * 사라짐**이다(Chrome 에서 잰 고장 방식). 그리고 같은 페이지의 **다른 탭 · 모드**에 가 있는 동안 끝난 결말은 provider 에는
 * 닿지만, 돌아온 본문이 마운트에서 지우면 통지 0 이다(Chrome 에서 설명 · 코멘트 둘 다 잰 고장 방식).
 */
describe('판정으로 끝난 쓰기도 전한다 — 받는 자리가 그 결말을 그릴 수 없을 때', () => {
  const MISSED = '이 페이지를 떠나 있는 동안 저장하지 못했습니다'
  const STAYED = '이 탭을 떠나 있는 동안 저장하지 못했습니다'
  const DELETED_KEY = 'idempotency-key-deleted'

  afterEach(() => {
    vi.useRealTimers()
  })

  function toPage(title: string): void {
    fireEvent.click(within(screen.getByRole('region', { name: '메뉴·페이지 트리' })).getByRole('link', { name: title }))
  }

  function keyDeleted(): ApiError {
    const message = '같은 멱등 키로 달린 코멘트가 그 뒤 지워졌습니다'
    return new ApiError(409, 'conflict', message, [{ path: 'idempotencyKey', code: DELETED_KEY, message }], true)
  }

  /**
   * 설명 — 옆 페이지에 가 있는 동안 시간 제한 → 다시 읽기가 `'base'`(서버 값이 바탕 그대로) → 돌아온 가가 «저장되지 않았습니다»를 말한다.
   * 결말을 안 전하면 통지 0 이다(Chrome 에서도 같다).
   *
   * 혼자 죽는 변조: 설명 `land`의 `'base'` 갈래가 결말로 `null`을 돌려준다(칸에는 그대로 그린다).
   */
  it('설명 — 옆 페이지에 가 있는 동안 판정이 «저장되지 않았습니다»로 끝나면 돌아온 가가 그렇다고 말한다', async () => {
    const server = descriptionServer('서버 값')
    await openPage(DOC, { docs: { [OTHER_PAGE_ID]: DOC }, apiOverrides: server.overrides })
    toView()
    await waitFor(() => expect(box().value).toBe('서버 값'))
    type(box(), '안 닿을 글')
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    fireEvent.click(saveButton())
    toPage(OTHER_PAGE_TITLE)
    await advance(0)
    await advance(WRITE_DEADLINE_MS)
    vi.useRealTimers()
    // 판정은 끝났다(잠금이 풀렸다) — 나는 가의 일을 말하지 않는다.
    await waitFor(() => expect(box().value).toBe(''))
    expect(screen.queryByRole('alert')).toBeNull()

    toPage(PAGE_TITLE)
    await waitFor(() => expect(box().value).toBe('서버 값'))
    expect(screen.getByRole('alert').textContent).toBe(`${MISSED} — 응답이 없어 서버를 다시 읽었더니 이 설명은 저장되지 않았습니다`)
  })

  /**
   * 코멘트 — 옆 페이지에 가 있는 동안 게시가 409 `idempotency-key-deleted`(`done` 길 — 되살린 글의 첫 보내기가 그 판이다)로 끝나면
   * 돌아온 가가 «이 글은 이미 달렸고, 그 뒤 지워졌습니다»를 말한다 — **실패가 아니라서 머리 없이 `status`**. 결말을 안 전하면
   * 목록 · 상자 · 통지가 다 빈다.
   *
   * 혼자 죽는 변조: 코멘트 `landed`가 `deleted-since`에 결말을 안 돌려준다.
   */
  it('코멘트 — 옆 페이지에 가 있는 동안 게시가 «이미 달렸고 그 뒤 지워졌다»로 끝나면 돌아온 가가 그렇다고 말한다', async () => {
    const server = commentServer()
    let reject: (caught: unknown) => void = () => {}
    await openPage(DOC, {
      docs: { [OTHER_PAGE_ID]: DOC },
      apiOverrides: { ...server.overrides, createComment: (() => new Promise((_resolve, fail) => (reject = fail))) as never },
    })
    await toCommentTab()
    type(commentBox(), '지워질 말')
    fireEvent.click(submitButton())
    await waitFor(() => expect(commentBox().disabled).toBe(true))
    toPage(OTHER_PAGE_TITLE)
    await waitFor(() => expect(commentBox().disabled).toBe(false))

    await act(async () => reject(keyDeleted()))
    expect(screen.queryByRole('status')).toBeNull()
    toPage(PAGE_TITLE)
    await waitFor(() => expect(commentBox().value).toBe(''))

    expect(screen.getByRole('status').textContent).toBe('이 글은 이미 달렸고, 그 뒤 지워졌습니다')
    expect(screen.queryByRole('alert')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '확인' }))
    expect(screen.queryByText('이 글은 이미 달렸고, 그 뒤 지워졌습니다')).toBeNull()
  })

  /**
   * 같은 판을 **판정 길**(`verified`)로 — 첫 게시가 모르는 실패(연결 끊김)라 같은 키로 다시 보낸 것이 409 deleted.
   *
   * 혼자 죽는 변조: 코멘트 게시의 `verified`가 `landed`의 결말을 버리고 `null`을 돌려준다.
   */
  it('코멘트 — 같은 키로 다시 보낸 것(판정)이 떠나 있는 동안 «지워졌다»로 끝나도 돌아온 가가 말한다', async () => {
    const server = commentServer()
    const pending: ((caught: unknown) => void)[] = []
    await openPage(DOC, {
      docs: { [OTHER_PAGE_ID]: DOC },
      apiOverrides: { ...server.overrides, createComment: (() => new Promise((_resolve, fail) => pending.push(fail))) as never },
    })
    await toCommentTab()
    type(commentBox(), '지워질 말')
    fireEvent.click(submitButton())
    await waitFor(() => expect(pending).toHaveLength(1))
    toPage(OTHER_PAGE_TITLE)
    await waitFor(() => expect(commentBox().disabled).toBe(false))

    await act(async () => pending[0]!(new ApiError(0, 'internal', '서버에 연결하지 못했습니다')))
    await waitFor(() => expect(pending).toHaveLength(2))
    await act(async () => pending[1]!(keyDeleted()))
    toPage(PAGE_TITLE)
    await waitFor(() => expect(screen.queryByRole('status')?.textContent).toBe('이 글은 이미 달렸고, 그 뒤 지워졌습니다'))
  })

  /**
   * 같은 페이지의 **다른 탭**에 가 있는 동안 설명 저장이 실패하면 — provider 는 그 페이지를 보고 있지만 설명 본문은 내려가 있다. 돌아온
   * 본문은 마운트에서 지난 통지를 지우므로, 장부가 남기지 않으면 통지 0 이다. 머리는 «이 탭을 떠나 있는 동안»이다.
   *
   * 혼자 죽는 변조: `MissedNotice`가 `'tab'`을 안 가르고 «이 페이지를 떠나 있는 동안»을 쓴다. (`panel-drafts.tsx`의 `draws`를 늘 참으로
   * 하면 이것과 아래 충돌 케이스가 **함께** 죽는다 — 그 축의 주인은 이것이다.)
   */
  it('설명 — 같은 페이지의 다른 탭에 가 있는 동안 저장이 실패하면 돌아온 설명 탭이 «이 탭을 떠나 있는 동안 …»으로 말한다', async () => {
    const server = descriptionServer('서버 값')
    await openPage(DOC, { apiOverrides: { ...server.overrides, ...commentServer().overrides } })
    toView()
    await waitFor(() => expect(box().value).toBe('서버 값'))
    type(box(), '실패할 글')
    fireEvent.click(saveButton())
    await waitFor(() => expect(server.sent).toHaveLength(1))
    await toCommentTab()
    await server.fail(0, new ApiError(500, 'internal', '서버 오류가 발생했습니다'))
    expect(screen.queryByRole('alert')).toBeNull()

    fireEvent.click(screen.getByRole('tab', { name: '페이지 설명' }))
    await waitFor(() => expect(box().disabled).toBe(false))
    expect(screen.getByRole('alert').textContent).toBe(`${STAYED} — 서버 오류가 발생했습니다`)
  })

  /**
   * 같은 판에서 결말이 충돌(409 · 다른 사람의 글)이면 돌아온 탭은 **말만** 한다 — 충돌 화면을 다시 세우지 않는다(같은 말이
   * 두 번 서지 않게). 초안은 그대로다(같은 페이지라 버려지지 않았다) — 다시 저장하면 409 가 충돌 화면을 세운다.
   *
   * 혼자 죽는 변조: 남긴 결말이 서면 칸을 `IDLE` 대신 `keepConflict`로 둔다(충돌 화면이 남는다 — 그 자리는 마운트
   * 이펙트가 아니라 «남긴 결말이 설 때마다»의 이펙트다). 그 이펙트째 떼면 아래 «제자리에서 … 한 번만 말한다»와 **함께** 죽는다.
   */
  it('설명 — 다른 탭에 가 있는 동안 저장이 충돌로 끝나면 돌아온 탭은 말만 하고 충돌 화면은 세우지 않는다 · 초안은 그대로다', async () => {
    const server = descriptionServer('서버 값')
    await openPage(DOC, { apiOverrides: { ...server.overrides, ...commentServer().overrides } })
    toView()
    await waitFor(() => expect(box().value).toBe('서버 값'))
    type(box(), '내 글')
    fireEvent.click(saveButton())
    await waitFor(() => expect(server.sent).toHaveLength(1))
    await toCommentTab()
    server.overwrite('남의 글')
    await server.fail(0, metaChanged('남의 글'))

    fireEvent.click(screen.getByRole('tab', { name: '페이지 설명' }))
    await waitFor(() => expect(box().disabled).toBe(false))
    expect(screen.getByRole('alert').textContent).toContain('다른 사람이 이 설명을 바꿨습니다 · 지금 저장된 설명: 남의 글')
    expect(screen.queryByRole('button', { name: '내 글로 덮기' })).toBeNull()
    expect(box().value).toBe('내 글')
  })
})

/**
 * **그리는 갈래가 없는 동안 끝난 결말** — 본문은 떠 있는데 그 칸의 통지를 그리는 갈래(`PendingNotice`)가 없는 판: 저장이
 * 나가 있는 동안 역할 실시간으로 강등돼 viewer 갈래가 됐다. `usePanelLock`을 부른 본문을 «그린다»로 치면 장부가 안 남기고,
 * 결말은 칸에만 쓰였다가 **탭을 한 번 오가면** 마운트가 지워 말없이 사라진다(Chrome 에서 잰 고장 방식: 설명 · 코멘트 둘 다
 * 승격 뒤 통지 0). 장부가 남기므로, 제자리에서 승격되면 **칸의 같은 통지를 지워야** 한 번 말한다.
 *
 * 값은 [jsdom]이다 — 실브라우저에서 잰 값이 아니다.
 */
describe('그리는 갈래가 없는 동안 끝난 결말 — 강등된 viewer 갈래', () => {
  const HERE = '저장하지 못했습니다'
  const SERVER_ERROR = '서버 오류가 발생했습니다'
  const MEMBERSHIP = { type: 'membership-changed', projectId: PROJECT_ID }

  /** 역할을 바꿀 수 있는 셸 — `getProject`가 그때의 역할을 낸다. 역할 신호는 가짜 실시간이 나른다(`role-live.test.tsx`와 같은 장치). */
  async function openAs(overrides: Partial<ApiClient>): Promise<(role: ProjectRole) => void> {
    let role: ProjectRole = 'editor'
    const rt = fakeRealtime(PROJECT_ID, MY_ID)
    await openPage(DOC, {
      realtime: rt.realtime,
      apiOverrides: { ...overrides, getProject: async () => ({ ...PROJECT, role }) },
    })
    rt.open()
    return (next) => {
      role = next
      rt.deliver(MEMBERSHIP)
    }
  }

  /** 설명 저장을 붙잡아 둔 채 viewer 가 된다 — 상자가 사라질 때까지. */
  async function descriptionDemoted(): Promise<{ server: ReturnType<typeof descriptionServer>; setRole: (role: ProjectRole) => void }> {
    const server = descriptionServer('서버 값')
    const setRole = await openAs({ ...server.overrides, ...commentServer().overrides })
    toView()
    await waitFor(() => expect(box().value).toBe('서버 값'))
    type(box(), '강등될 글')
    fireEvent.click(saveButton())
    await waitFor(() => expect(server.sent).toHaveLength(1))
    setRole('viewer')
    await waitFor(() => expect(screen.queryByRole('textbox', { name: '페이지 설명' })).toBeNull())
    return { server, setRole }
  }

  /** 코멘트 게시를 붙잡아 둔 채 viewer 가 된다 — 폼이 사라질 때까지. 돌려주는 함수가 그 게시를 실패로 끝낸다. */
  async function commentDemoted(): Promise<{ fail: () => Promise<void>; setRole: (role: ProjectRole) => void }> {
    const server = commentServer()
    let reject: (caught: unknown) => void = () => {}
    const setRole = await openAs({
      ...descriptionServer('서버 값').overrides,
      ...server.overrides,
      createComment: (() => new Promise((_resolve, fail) => (reject = fail))) as never,
    })
    await toCommentTab()
    type(commentBox(), '강등될 말')
    fireEvent.click(submitButton())
    await waitFor(() => expect(commentBox().disabled).toBe(true))
    setRole('viewer')
    await waitFor(() => expect(screen.queryByRole('textbox', { name: '새 코멘트' })).toBeNull())
    // api 가 낸 500(봉투)은 확정이다 — 다시 보내지 않는다(위 «api 가 낸 500(봉투) 은 확정이다»).
    return { fail: () => act(async () => reject(new ApiError(500, 'internal', SERVER_ERROR, [], true))), setRole }
  }

  /**
   * 설명 — **제자리에서** viewer 로 강등된 동안 저장이 실패한다. 떠난 적이 없으니 머리는 «떠나 있는 동안»이 아니고, viewer 인 채로도 그
   * 자리에서 말한다(승격을 기다리면 끝내 아무도 못 본다). 혼자 죽는 변조 둘: 설명의 viewer 갈래가 `MissedNotice`를 안 둔다 · 장부가
   * `hosts`를 안 보고 «본문째 내려갔다»(`'tab'`)로 남긴다.
   */
  it('설명 — 제자리에서 viewer 로 강등된 동안 끝난 저장 실패는 viewer 갈래가 곧바로 말한다 — «떠나 있는 동안»이 아니다', async () => {
    const { server } = await descriptionDemoted()
    await server.fail(0, new ApiError(500, 'internal', SERVER_ERROR))
    await waitFor(() => expect(screen.getAllByRole('alert').map((el) => el.textContent)).toEqual([`${HERE} — ${SERVER_ERROR}`]))
  })

  /** 코멘트 — 같은 판. 혼자 죽는 변조: 코멘트의 폼 밖(`!canEdit`)이 `MissedNotice`를 안 둔다(`hosts` 변조는 위 설명 케이스와 함께 죽는다). */
  it('코멘트 — 제자리에서 viewer 로 강등된 동안 끝난 게시 실패는 폼 없는 갈래가 곧바로 말한다 — «떠나 있는 동안»이 아니다', async () => {
    const { fail } = await commentDemoted()
    await fail()
    await waitFor(() => expect(screen.getAllByRole('alert').map((el) => el.textContent)).toEqual([`${HERE} — ${SERVER_ERROR}`]))
  })

  /**
   * 설명 — viewer 동안 저장이 실패하고, viewer 인 채 탭을 한 번 오간 뒤 승격 → 돌아온 폼이 말한다. 장부가 안 남기면 통지 0 이다(Chrome 에서도 같다).
   * 머리는 위 «제자리에서» 케이스가 소유한다(끝난 순간 제자리였다 — 그 뒤 탭을 오갔어도 같다).
   *
   * **혼자 죽는 변조는 없다** — 이 판은 두 축이 겹친 자리다. viewer 갈래의 `MissedNotice`가 내려가며 남긴 결말을 지우면(«보였으니 다
   * 말했다») 아래 «제자리에서 다시 editor 가 되면 한 번만 말한다»와 함께 죽고(승격도 그 갈래를 내린다), 설명의 viewer 갈래도
   * `PendingNotice`를 그리면(= 그 갈래를 «그린다»로 세면) 위 «제자리에서» 케이스와 함께 죽는다.
   */
  it('설명 — viewer 로 강등된 동안 끝난 저장 실패는 탭을 오가도 남아, 다시 editor 가 되면 말한다', async () => {
    const { server, setRole } = await descriptionDemoted()
    await server.fail(0, new ApiError(500, 'internal', SERVER_ERROR))
    // viewer 인 채 탭을 한 번 오간다 — 돌아온 본문의 마운트가 칸의 지난 통지를 지운다.
    fireEvent.click(screen.getByRole('tab', { name: '코멘트' }))
    fireEvent.click(screen.getByRole('tab', { name: '페이지 설명' }))

    setRole('editor')
    await waitFor(() => expect(box().disabled).toBe(false))
    expect(screen.getAllByRole('alert').map((el) => el.textContent)).toEqual([`${HERE} — ${SERVER_ERROR}`])
  })

  /**
   * 코멘트 — 같은 판(장부가 안 남기면 통지 0 — Chrome 에서도 같다). 혼자 죽는 변조는 없다 — 위 설명 케이스와 같은 두 축이 겹친다(폼
   * 밖의 `MissedNotice`가 내려가며 지우면 코멘트의 «한 번만 말한다»와, 폼이 없는 갈래도 `PendingNotice`를 그리면 «제자리에서» 코멘트
   * 케이스와 함께 죽는다).
   */
  it('코멘트 — viewer 로 강등된 동안 끝난 게시 실패는 탭을 오가도 남아, 다시 editor 가 되면 말한다', async () => {
    const { fail, setRole } = await commentDemoted()
    await fail()
    // viewer 인 채 탭을 한 번 오간다(편집 모드 — 옆 탭은 «상호작용»).
    fireEvent.click(screen.getByRole('tab', { name: '상호작용' }))
    fireEvent.click(screen.getByRole('tab', { name: '코멘트' }))

    setRole('editor')
    await waitFor(() => expect(commentBox().disabled).toBe(false))
    expect(screen.getAllByRole('alert').map((el) => el.textContent)).toEqual([`${HERE} — ${SERVER_ERROR}`])
  })

  /**
   * 설명 — 탭을 안 오가고 제자리에서 승격되면 **한 번만** 말한다. 장부가 남긴 결말과 칸(`SAVE`)에 쓰인 같은 결말이 함께 설 자리다.
   * 머리는 보지 않는다 — 칸의 통지는 머리 없이 서므로 어느 쪽이 남아도 맞다(이 케이스는 «두 번»만 잰다).
   *
   * 혼자 죽는 변조: 설명 본문이 남긴 결말이 설 때 칸의 통지를 지우지 않는다(마운트에서만 지운다).
   */
  it('설명 — 제자리에서 다시 editor 가 되면 한 번만 말한다 — 칸의 통지와 남긴 결말이 겹쳐 서지 않는다', async () => {
    const { server, setRole } = await descriptionDemoted()
    await server.fail(0, new ApiError(500, 'internal', SERVER_ERROR))

    setRole('editor')
    await waitFor(() => expect(box().disabled).toBe(false))
    const alerts = screen.getAllByRole('alert').map((el) => el.textContent)
    expect(alerts).toHaveLength(1)
    expect(alerts[0]).toContain(SERVER_ERROR)
  })

  /** 코멘트 — 같은 판. 혼자 죽는 변조: 코멘트 본문이 남긴 결말이 설 때 칸(`WRITE_ERROR`)을 지우지 않는다. */
  it('코멘트 — 제자리에서 다시 editor 가 되면 한 번만 말한다 — 칸의 통지와 남긴 결말이 겹쳐 서지 않는다', async () => {
    const { fail, setRole } = await commentDemoted()
    await fail()

    setRole('editor')
    await waitFor(() => expect(commentBox().disabled).toBe(false))
    const alerts = screen.getAllByRole('alert').map((el) => el.textContent)
    expect(alerts).toHaveLength(1)
    expect(alerts[0]).toContain(SERVER_ERROR)
  })
})
