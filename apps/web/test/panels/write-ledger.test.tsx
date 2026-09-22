/**
 * **나가 있는 쓰기의 장부**(`src/panels/write-ledger.tsx` — 이월 Q·R). 무엇을 왜 막는지와 Chrome
 * 값은 그 파일의 머리말이 갖는다. 여기는 두 축을 값으로 잠근다.
 *
 * - **Q — 에디터를 떠났다 와도.** 8차·9차의 케이스(`page-description-edit.test.tsx`·
 *   `comment-panel.test.tsx`의 «저장이 나가 있는 동안 …»·«탭·페이지를 오가도 …»)는 전부 셸 **안**의
 *   왕복이었다 — provider 가 내려가는 길을 아무도 안 지났다. 여기는 **프로젝트 목록을 다녀온다.**
 * - **R — 시간 안에 응답이 없으면.** 가짜 타이머로 `WRITE_DEADLINE_MS`를 넘긴다. **가짜 타이머가
 *   켜진 동안은 `waitFor`·`findBy*`를 쓰지 않는다** — RTL 의 `asyncWrapper`가 `setTimeout(0)`을
 *   기다리는데 그것이 가짜라 영영 안 온다(`act` + `advanceTimersByTimeAsync`로만 나아간다).
 *   **Chrome 에서도 같은 동작이 나는지 쟀다** — 그 값은 `write-ledger.tsx`의 머리말과 이 슬라이스의
 *   보고서가 갖는다(실제 10초).
 *
 * **각 케이스가 혼자 죽는 변조**는 아래 절마다 표로 적었다 — 변조를 하나씩 심고, 매번 백업에서
 * 바이트 비교로 복원해서 쟀다.
 */
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ApiClient, ReadOptions, WriteOptions } from '../../src/api/client'
import { ApiError } from '../../src/api/client'
import type { Comment, CommentCreated, PageDetail, ProjectDetail, SessionUser } from '../../src/api/types'
import { WRITE_DEADLINE_MS } from '../../src/panels/write-ledger'
import {
  HEAD_SEQ,
  OTHER_PAGE_TITLE,
  openPage,
  pageDetail,
  pageDoc,
  OTHER_PAGE_ID,
  PAGE_ID,
  PROJECT_ID,
  PROJECT_NAME,
  waitForNode,
} from '../editor-harness'
import '../../src/catalog-setup'

const ROOT_ID = 'n-root'
const DOC = pageDoc({ id: ROOT_ID, type: 'Page', children: [{ id: 'n-list', type: 'List', props: {} }] })
/** 하네스의 첫 페이지 제목. */
const PAGE_TITLE = '회원 목록'
/** 하네스가 세션으로 내는 사용자. */
const MY_ID = 'u-1'
/** 다시 읽기로 판정했더니 서버 값이 같을 때(`page-description.tsx`의 `MATCHED`). */
const MATCHED = '응답이 없어 서버를 다시 읽었더니 서버의 설명이 이 글과 같습니다'

const PROJECT: ProjectDetail = {
  id: PROJECT_ID,
  name: PROJECT_NAME,
  slug: 'admin-console',
  description: null,
  role: 'owner',
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
 * **에디터를 떠났다 온다** — 사용자가 하듯: «프로젝트 목록으로 돌아가기» → 목록에서 그 프로젝트 →
 * 메뉴 트리에서 그 페이지. 셸이 통째로 내려갔다 새로 선다(provider 도, 스토어도).
 */
async function leaveEditorAndReturn(): Promise<void> {
  fireEvent.click(screen.getByRole('link', { name: '프로젝트 목록으로 돌아가기' }))
  fireEvent.click(await screen.findByRole('link', { name: PROJECT_NAME }))
  const tree = await screen.findByRole('region', { name: '메뉴·페이지 트리' })
  fireEvent.click(await within(tree).findByRole('link', { name: PAGE_TITLE }))
  await waitForNode(ROOT_ID)
}

/** 목록까지만 간다 — 에디터 **밖**에 머문다. */
async function leaveEditor(): Promise<void> {
  fireEvent.click(screen.getByRole('link', { name: '프로젝트 목록으로 돌아가기' }))
  await screen.findByRole('link', { name: PROJECT_NAME })
}

/** 목록에서 에디터로 돌아온다. */
async function returnFromList(): Promise<void> {
  fireEvent.click(screen.getByRole('link', { name: PROJECT_NAME }))
  const tree = await screen.findByRole('region', { name: '메뉴·페이지 트리' })
  fireEvent.click(await within(tree).findByRole('link', { name: PAGE_TITLE }))
  await waitForNode(ROOT_ID)
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
 */
function descriptionServer(
  initial: string | null,
  behavior: { ignoreAbort?: boolean } = {},
): {
  overrides: Partial<ApiClient>
  stored: () => string | null
  sent: (string | null | undefined)[]
  signals: (AbortSignal | undefined)[]
  /** 붙잡힌 쓰기 하나를 서버에 쓴다(응답은 아직). */
  commit: (index?: number) => void
  /** 붙잡힌 쓰기 하나의 응답을 준다 — 먼저 서버에 쓴다. */
  respond: (index?: number) => Promise<void>
  /** 붙잡힌 쓰기 하나를 그 실패로 끝낸다(서버에 안 쓴다). */
  fail: (index: number, error: ApiError) => Promise<void>
  /** 다시 읽기를 실패시킨다. */
  failReads: (on: boolean) => void
  /** 켜 있는 동안의 읽기를 붙잡는다 — 끈 뒤의 읽기는 곧바로 답한다. 붙잡힌 것은 `releaseReads`가 놓는다. */
  holdReads: (on: boolean) => void
  /** 붙잡힌 읽기를 **그때의** 서버 값으로 놓는다. */
  releaseReads: () => Promise<void>
  /** 읽기가 받은 신호 — 부른 순서대로(판정용 다시 읽기만 싣는다). */
  readSignals: (AbortSignal | undefined)[]
  /** 남이 서버의 설명을 바꾼다. */
  overwrite: (value: string | null) => void
} {
  let stored = initial
  let readsFail = false
  let readsHeld = false
  const heldReads: (() => void)[] = []
  const readSignals: (AbortSignal | undefined)[] = []
  const sent: (string | null | undefined)[] = []
  const signals: (AbortSignal | undefined)[] = []
  const waiting: { commit: () => void; resolve: () => void; reject: (caught: unknown) => void }[] = []
  const read = (pageId: string): PageDetail => ({
    ...pageDetail(pageId, DOC),
    description: pageId === PAGE_ID ? stored : null,
  })
  return {
    sent,
    signals,
    readSignals,
    stored: () => stored,
    failReads: (on) => {
      readsFail = on
    },
    holdReads: (on) => {
      readsHeld = on
    },
    releaseReads: async () => {
      await act(async () => {
        for (const release of heldReads.splice(0)) release()
      })
    },
    overwrite: (value) => {
      stored = value
    },
    overrides: {
      getPage: (async (_projectId: string, pageId: string, options?: ReadOptions) => {
        if (pageId === PAGE_ID) readSignals.push(options?.signal)
        if (readsFail && pageId === PAGE_ID) throw new ApiError(0, 'internal', '서버에 연결하지 못했습니다')
        if (readsHeld && pageId === PAGE_ID) {
          // 붙잡힌 읽기도 **끊기면 실제 `fetch`처럼 거절한다**.
          return new Promise<PageDetail>((resolve, reject) => {
            options?.signal?.addEventListener('abort', () => reject(new DOMException('요청을 끊었다', 'AbortError')))
            heldReads.push(() => resolve(read(pageId)))
          })
        }
        return read(pageId)
      }) as never,
      updatePage: ((_projectId: string, pageId: string, body: { description?: string | null }, options?: WriteOptions) => {
        sent.push(body.description)
        signals.push(options?.signal)
        const value = body.description ?? null
        return new Promise<PageDetail>((resolve, reject) => {
          if (options?.signal !== undefined && !(behavior.ignoreAbort ?? false)) {
            options.signal.addEventListener('abort', () =>
              reject(new DOMException('요청을 끊었다', 'AbortError')),
            )
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
   * (모델링: 그 요청은 로그아웃보다 먼저 나갔고, 서버에는 늦게 닿았다).
   */
  failHeldLists: (error?: ApiError) => Promise<void>
  /** 붙잡힌 목록 읽기를 **그것을 낸 순간의** 표로 놓는다 — 서버는 그때 읽었고 답만 늦게 왔다. */
  releaseHeldLists: () => Promise<void>
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
  const waiting: { commit: () => void; resolve: () => void }[] = []
  return {
    rows: () => rows,
    keys,
    // 기본은 **api 가 낸 500**(오류 봉투가 있다) — 확정 실패다(`comment-panel.tsx`의 `knownRejection`).
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
    failHeldLists: async (error = new ApiError(401, 'unauthenticated', '로그인이 필요합니다')) => {
      await act(async () => {
        for (const held of heldLists.splice(0)) held.reject(error)
      })
    },
    releaseHeldLists: async () => {
      await act(async () => {
        for (const held of heldLists.splice(0)) held.resolve()
      })
    },
    overrides: {
      listComments: async () => {
        if (listsHeld) {
          const snapshot = [...rows]
          return new Promise<Comment[]>((resolve, reject) =>
            heldLists.push({ resolve: () => resolve(snapshot), reject }),
          )
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

/** 셸 머리의 «로그아웃» → 로그인 화면. */
async function logout(): Promise<void> {
  fireEvent.click(screen.getByRole('button', { name: '로그아웃' }))
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
 * | 장부를 셸 안(`RightPanel`의 `PanelDraftsProvider` 바로 위)으로 내린다 — 앞 판의 자리 | 넷(설명·코멘트 × 잠금·전달) |
 * | 잠금 키에 **provider 인스턴스**를 넣는다(`usePanelLock`의 `slot` — 잠금이 provider 교체를 못 넘는다) | 잠금 둘 — 웹 전량 가운데 이 둘뿐이다 |
 * | 같은 것을 **설명 칸에만** | *"설명 — 에디터를 떠났다 와도 잠금이 남는다 …"* **혼자** |
 * | 같은 것을 **코멘트 칸에만** | *"코멘트 — 에디터를 떠났다 와도 잠금이 남는다 …"* **혼자** |
 *
 * **잠금 둘은 «잠금이 provider 교체를 넘는다» 축의 주인이다** — 위 끝의 세 줄이 그것이다(리뷰 6번이 찾은
 * 변조를 칸마다 좁혀 쟀다). 앞 판의 머리말은 «혼자 죽는 변조가 없다 — 늘 남과 함께 죽는다»였는데, 그것은
 * 그때 심은 변조(장부의 자리를 셸 안으로 · 잠금을 본문의 `useState`로 · 방문 칸으로)로는 참이었고 —
 * 그 변조들은 셸 **안**의 왕복을 재는 8차·9차 케이스(`page-description-edit.test.tsx`·`comment-panel.test.tsx`의
 * «저장이 나가 있는 동안 …»·«… 가 → 나 → 가 …»)도 함께 죽인다 — 이월 Q 의 결함을 잠금 한 자리에서 되살리는
 * 가장 자연스러운 퇴행(provider 에 매인 잠금)으로는 틀렸다. 이 둘이 따로 재는 것은 **provider 째 내려가는
 * 길**이다 — 8차·9차 케이스 가운데 그 길을 지나는 것은 없다.
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

    // **앞 판은 여기서 상자와 버튼이 열려 있었다**(Chrome — 잠금이 셸과 함께 사라졌다). 그러면 둘째
    // 저장이 나가고, 늦게 온 첫째가 둘째를 덮어 화면은 «저장했습니다»와 함께 DB 에 없는 값을 보였다.
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
    // 돌아와 건 조회는 쓰기가 커밋되기 **전**에 읽었다 — 옛 값이다(리뷰 N-E 의 판).
    await waitFor(() => expect(box().value).toBe('서버 값'))

    await server.respond()

    // **앞 판은 응답이 내려간 provider 의 칸에 쓰여 아무 데도 안 닿았다** — 상자는 옛 값에 머물고
    // 통지도 없었다(그리고 잠금도 없어 둘째가 나갈 수 있었다 — 위 케이스).
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

    // **앞 판은 여기서 상자가 열려 있었다**(Chrome) — 다시 달면 같은 번호에 두 행이 섰다.
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
 * | 판정에 시간 제한이 없다(앞 판) · 설명의 판정용 읽기가 신호를 안 싣는다 | *"판정용 다시 읽기에도 시간 제한이 있다 …"* **혼자**(둘 다) |
 * | 설명: 다시 읽어 같으면 «저장했습니다»라고 한다(앞 판 — 리뷰 2-1) | *"서버 값이 보낸 값과 같으면 …"* · *"다시 읽기도 실패하면 …"* · *"판정용 다시 읽기에도 …"*(뒤의 둘은 끝이 «같습니다»다) — 축의 주인은 앞의 것 |
 * | 코멘트: 다시 보낼 때 **목록을 먼저 보고** 같은 노드·같은 글이 있으면 안 보낸다 | *"코멘트 — 목록을 읽은 뒤 다른 곳에서 달린 …"* **혼자** |
 * | 코멘트: 판정을 앞 판처럼 목록으로 한다(다시 보내지 않는다) | 코멘트 넷 + 멱등 키 절의 둘 — 축의 주인은 *"… 다른 곳에서 달린 …"*(리뷰 2-2) |
 * | 코멘트: 연결 실패·5xx 도 거절(확정)로 친다 | *"코멘트 — 다시 보낸 것도 연결이 실패하면 모른다 …"* **혼자** |
 * | 코멘트: 4xx 도 모름으로 친다 · 거절에 키를 버린다 | *"코멘트 — 다시 보낸 것을 서버가 거절하면 …"* **혼자**(둘 다) |
 * | 코멘트: 달렸다는 판정인데 뒷일(초안 비우기·번호)을 안 한다 | *"코멘트 — 서버가 첫 게시를 안 받았으면 …"* 와 넷 — 축의 주인은 그것 |
 * | 코멘트 수정: 판정으로 «저장됨»인데 편집 칸을 안 닫는다 | *"코멘트 수정 — …"* **혼자** |
 * | 코멘트 삭제: 실패해도 목록을 안 다시 받는다(앞 판 — 리뷰 4번) | *"코멘트 삭제 — 다시 누른 삭제가 409 면 …"* **혼자** |
 * | 설명의 판정이 늘 «안 됨»이다 | *"서버 값이 보낸 값과 같으면 …"* · *"다시 읽기도 실패하면 …"* · *"판정용 다시 읽기에도 …"*(셋 다 «같습니다»로 끝난다) |
 * | 시간 제한이 사실상 없다 — **타이머 자리에서** 1000 배 | 이 절의 열하나 · 멱등 키 절의 둘 · 세션 절의 «모름»(14 — 삭제 케이스는 시간 제한을 안 지난다). 상수(`WRITE_DEADLINE_MS`)를 바꾸면 **0** 이다 — 케이스가 같은 상수로 시간을 민다 |
 *
 * **코멘트 게시의 판정은 다시 읽기가 아니라 같은 키로 다시 보내기다**(`comment-panel.tsx`의 `submit`). 앞
 * 판의 *"목록에 그 글이 있으면 달린 것이다"*는 뜻이 사라져 지웠다 — 그 자리의 «서버가 이미 달았으면
 * 재생»은 멱등 키 절의 *"다시 보낸 게시는 같은 키를 싣는다 …"*와 클라이언트 경로가 같아(가짜 서버의 재생
 * 시점만 다르다) 늘 함께 죽었다. *"목록에 그 글이 없으면 …"*은 *"서버가 첫 게시를 안 받았으면 …"*이 됐다.
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

    // **누가 썼는지는 모른다** — 남이 같은 값을 먼저 저장한 판도 같은 값이다(리뷰 2-1).
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
      expect(screen.getByRole('alert').textContent).toBe(
        '응답이 없어 서버를 다시 읽었더니 이 설명은 저장되지 않았습니다',
      ),
    )
    expect(box().disabled).toBe(false)
    expect(box().value).toBe('시간 넘긴 글')
    expect(saveButton().disabled).toBe(false)
    expect(screen.queryByText('설명을 저장했습니다')).toBeNull()
  })

  it('다시 읽기도 실패하면 모른다 — 잠금을 쥔 채 «다시 확인»을 주고, 누르면 판정한다', async () => {
    const server = descriptionServer('서버 값')
    await saveWithFakeTimers(server, '시간 넘긴 글')
    server.failReads(true)

    await advance(WRITE_DEADLINE_MS)
    vi.useRealTimers()

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe('응답이 없고, 저장됐는지 확인하지도 못했습니다'),
    )
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

  it('판정용 다시 읽기에도 시간 제한이 있다 — 매달리면 끊고 모른다: «다시 확인»이 선다', async () => {
    // **앞 판은 다시 읽기가 응답하지 않으면 «확인 중»에 머물렀고 «다시 확인»도 없었다**(리뷰 2-4 (a),
    // Chrome — F5 말고 탈출구가 없었고 초안을 잃었다).
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
    // **리뷰 2-2**(Chrome) — 앞 판은 «보내기 전 목록에 없던 · 같은 노드 · 같은 글 · 내가 쓴 행»을 찾아
    // 판정했다. 목록을 읽은 **뒤에** 다른 탭에서 같은 글을 달면 그 행이 이 게시로 읽혀, 서버에 안 닿은
    // 게시가 «달림»이 되고 초안이 지워졌다(DB 1행).
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

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe('페이지가 이미 변경되었습니다 (요청 baseSeq 7, 현재 8)'),
    )
    expect(commentBox().value).toBe('시간 넘긴 코멘트')
    expect(commentBox().disabled).toBe(false)
    expect(server.rows()).toHaveLength(0)

    // **다시 달면 같은 키다** — 같은 초안이다.
    fireEvent.click(submitButton())
    await waitFor(() => expect(server.keys).toHaveLength(3))
    expect(server.keys[2]).toBe(server.keys[0])
  })

  it('코멘트 — 다시 보낸 것을 api 가 500 으로 거절하면(봉투) 확정이다 — 첫 보내기와 같은 가름', async () => {
    const server = commentServer()
    await postWithFakeTimers(server, '시간 넘긴 코멘트')
    server.failNext(new ApiError(500, 'internal', '서버 오류가 발생했습니다', [], true))

    await advance(WRITE_DEADLINE_MS)
    vi.useRealTimers()

    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('서버 오류가 발생했습니다'))
    expect(screen.queryByRole('button', { name: '다시 확인' })).toBeNull()
    expect(commentBox().value).toBe('시간 넘긴 코멘트')
    expect(commentBox().disabled).toBe(false)
  })

  it('코멘트 — 다시 보낸 것도 연결이 실패하면 모른다: 잠금을 쥔 채 «다시 확인»이 같은 키로 또 보낸다', async () => {
    const server = commentServer()
    await postWithFakeTimers(server, '시간 넘긴 코멘트')
    server.failNext(new ApiError(0, 'internal', '서버에 연결하지 못했습니다'))

    await advance(WRITE_DEADLINE_MS)
    vi.useRealTimers()

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe('응답이 없고, 반영됐는지 확인하지도 못했습니다'),
    )
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
    // **리뷰 4번**(Chrome) — «지워지지 않았습니다» 판정 뒤 서버가 앞 삭제를 늦게 커밋하면, 다시 누른 삭제는
    // 409 를 받고 목록에는 이미 지워진 코멘트가 남았다. 여기서는 그 둘째 삭제만 흉내 낸다 — 서버에서 행은
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

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe('페이지가 이미 변경되었습니다 (요청 baseSeq 7, 현재 8)'),
    )
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
 * ## 시간 안의 모르는 실패 — 같은 키로 다시 보내 판정한다 (2026-09-22)
 *
 * 앞 판은 첫 게시가 서버에 닿았는데 브라우저가 502·연결 끊김을 받으면 `'failed'`라 초안이 열렸고, 고쳐
 * 달면 새 키라 **두 행**이었다(Chrome route — 리뷰 6번의 마지막 길). 이제 **모르는 실패**는 판정(같은 키로
 * 다시 보내기)으로 간다. 무엇이 모르는 실패인지는 `src/panels/comment-panel.tsx`의 `knownRejection`이
 * 갖는다 — 4xx 와 **api 가 낸 500**(봉투)만 확정이다.
 *
 * | 변조 | 죽는 것 |
 * |---|---|
 * | 모르는 실패도 판정으로 안 보낸다(앞 판) | *"502 — …"* · *"연결 끊김 — …"* · *"봉투 없는 500 …"* · *"«모름»으로 떠났다 와도 …"* — 축의 주인은 *"502 — …"* |
 * | 502 를 확정으로 | *"502 — …"* **혼자** |
 * | 503 을 확정으로 | *"«모름»으로 떠났다 와도 …"* **혼자** |
 * | 봉투 없는 500 을 확정으로(숫자만 본다) | *"봉투 없는 500 …"* **혼자** |
 * | 연결 끊김(`status` 0)을 확정으로 | *"연결 끊김 — …"* 와 R 절의 *"… 다시 보낸 것도 연결이 실패하면 모른다 …"* — 첫 보내기와 다시 보낸 것이 **같은 가름**을 쓰는 것이 요점이라 함께 죽는다 |
 * | 봉투 있는 500 을 모름으로 | *"api 가 낸 500(봉투) 은 확정이다 …"* · R 절의 *"… api 가 500 으로 거절하면 …"* · 멱등 키 절의 *"글을 고쳐 …"*·*"페이지를 떠나면 …"*(둘 다 api 의 500 으로 실패시킨다) — 축의 주인은 앞의 것 |
 * | 세션이 끝나 끊긴 실패도 판정으로 보낸다 | *"세션이 끝나 끊긴 게시는 …"* **혼자** |
 * | 다시 보낸 것은 제 가름(4xx 만 확정)을 쓴다 | R 절의 *"… api 가 500 으로 거절하면 …"* **혼자** |
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
    // 초안은 떠날 때 버렸다(F1) — 잠금과 «다시 확인»은 남는다.
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
   * 그 뒤에 줄을 서서 재생을 받는다(Chrome: 서버 안 지연 16초 — 이 절 머리말).
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
 * 장부는 라우트 표 바깥이라 **로그아웃 뒤에도 산다.** 그래서 앞 판은 앞 사람의 쓰기가 다음 사람에게
 * 넘어갔다(리뷰 1-1, Chrome — 잠금 · 통지 · 401 의 `SignedOut`). 무엇을 왜 막는지는
 * `src/panels/write-ledger.tsx`의 «세션을 넘지 않는다»와 `src/session/session-context.tsx`의 «세션 세대»가
 * 갖는다. **하네스는 한 사람으로 돌았다** — 여기는 로그인 화면을 지나 **다른 사람**(`BOB`)으로, 또는
 * 세션이 끊긴 **같은 사람**(`ALICE`)으로 다시 들어온다.
 *
 * **401 판은 모델링이다** — 앞 세션의 요청이 **로그아웃보다 먼저 나갔고 서버에는 늦게 닿아** 401 을
 * 받는다(느린 망 · 앞단 큐에서 작은 로그아웃 요청이 앞지르는 판 — 리뷰 1-1 과 같은 모델). 가짜 서버가
 * 붙잡은 읽기를 로그인한 뒤에 401 로 끝낸다. **쓰기 자체의 401** 은 실브라우저에서는 안 닿는다 — 세션이
 * 끝나면 그 쓰기를 끊고(첫 케이스) 끊긴 요청의 응답은 브라우저가 버린다. 그래서 그 판은 **끊겨도 응답을
 * 내는 클라이언트**(`ignoreAbort`)로 잰다.
 *
 * 각각이 혼자 죽는 변조(웹 전량에서 쟀다 — 3번(목록 다시 받기를 잠금 밖으로) 뒤의 값이다):
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
 * ***"401 이 늦게 닿는 판 — 앞 사람의 다시 받기가 …"*는 한 변조로는 안 죽는다** — 가드 넷이 겹쳐 덮는다:
 * `deliver`의 세대 · 목록 칸의 «늦게 낸 조회만»(`answered` — 밥의 방문은 앨리스의 다시 받기보다 늦게 낸
 * 조회를 들고 있다) · `REFRESH`의 번호 대조 · 그리는 자리의 견줌. 앞의 셋을 함께 빼면
 * *"… «다시 불러오는 중»도 내린다 …"*와 함께 죽는다. **남긴다** — 리뷰 1-1 의 Chrome 판 그대로이고, 1번
 * 커밋 때는 `deliver` 혼자가 막았다(3번이 뒤 둘을 더했다). 겹침을 걷어 내는 사람이 마지막에 만나는 자리다.
 *
 * `eb7a155`(고치기 전)에서는 앞의 다섯이 죽었다. *"신호를 안 보는 클라이언트여도 …"*는 3번 뒤에 더했고 그
 * 판에서는 재지 않았다.
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

    // **앞 판은 여기서 밥의 상자가 꺼져 있었다**(Chrome — 앨리스의 쓰기가 잠갔다).
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

    // **앞 판은 밥이 앨리스의 «모름»을 봤다**(리뷰 1-2 · 이월 9번) — 꺼진 상자와 «다시 확인».
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

    // **앞 판은 여기서 밥이 로그인 화면으로 튕겼다**(Chrome — 밥의 `/me`는 200 이었다).
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
    fireEvent.click(screen.getByRole('link', { name: '프로젝트 목록으로 돌아가기' }))
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
 * ## 쓰기가 끝나면 잠금이 풀린다 — 목록 다시 받기는 잠금 밖이다
 *
 * **앞 판은 게시가 커밋됐는데 뒤의 목록 다시 받기가 매달리면 상자가 통지 없이 꺼진 채였다**(리뷰 2-4 (b),
 * Chrome — F5 말고는 안 풀렸다). 다시 받기를 쓰기의 뒷일 **안에서** 기다렸기 때문이다. 이제 쓰기가 끝나면
 * 잠금이 풀리고, 다시 받기는 따로 돈다(`src/panels/comment-panel.tsx`의 `refresh`). 둘이 갈리자 **조회끼리
 * 도착 순서가 뒤집힐 수 있어**, 목록 칸은 늦게 **낸** 조회의 답만 받는다(`answered`).
 *
 * | 변조 | 죽는 것 |
 * |---|---|
 * | 다시 받기를 쓰기의 뒷일 안에서 기다린다(앞 판) | *"… 매달려도 잠금은 풀린다 …"* 와 *"앞 게시의 다시 받기가 …"*(둘째 게시를 못 보낸다) — **축의 주인은 앞의 것** |
 * | «다시 불러오는 중»을 안 그린다 | *"… 매달려도 잠금은 풀린다 …"* 와 *"… «다시 불러오는 중»도 내린다 …"*(그 문장이 서는 것부터 기다린다) |
 * | 그 문장을 보이는 목록과 견주지 않는다(매달린 다시 받기가 있으면 늘 말한다) | *"… «다시 불러오는 중»도 내린다 …"* **혼자** |
 * | 다시 받기가 실패하면 목록 자리를 실패로 바꾼다(앞 판) | *"목록 다시 받기가 실패하면 …"* **혼자** |
 * | 다시 받기의 답을 낸 순서와 무관하게 쓴다 | *"앞 게시의 다시 받기가 늦게 와도 …"* **혼자** |
 * | 조회 이펙트의 답을 낸 순서와 무관하게 쓴다(앞 판) | *"돌아와 건 목록 조회가 늦게 와도 …"* **혼자** |
 *
 * 고치기 전(`b136610`)에는 이 절의 넷과 R 절의 *"판정용 다시 읽기에도 …"*가 죽는다(다섯 — «내린다»는
 * 그 뒤에 더했다). 두 읽기가 신호를 싣는지는 `test/api/http-client.test.ts`의 *"판정용 읽기 둘은 …"*가
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

    // Chrome 은 여기서 그 문장이 남았다(고치기 전) — 매달린 다시 받기가 아직 안 끝났다.
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

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe('목록을 다시 불러오지 못했습니다 — 서버에 연결하지 못했습니다'),
    )
    // 앞 판(8차)은 다시 받기의 실패가 목록 자리를 통째로 «코멘트를 불러오지 못했습니다»로 바꿨다.
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

  it('돌아와 건 목록 조회가 늦게 와도 게시 뒤의 다시 받기가 세운 목록을 덮지 않는다', async () => {
    // **앞 판의 «타이밍 창»**(`comment-panel.tsx` 머리말 «잠금이 막지 못하는 길»의 2) — 가 → 나 → 가로 돌아와
    // 건 조회가 게시가 커밋되기 **전에** 읽고 다시 받기보다 **늦게** 오면 방금 단 말이 목록에서 사라졌다.
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
})
