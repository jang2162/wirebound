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
import type { ApiClient, WriteOptions } from '../../src/api/client'
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
  /** 다시 읽기를 실패시킨다. */
  failReads: (on: boolean) => void
  /** 켜 있는 동안의 읽기를 붙잡는다 — 끈 뒤의 읽기는 곧바로 답한다. 붙잡힌 것은 `releaseReads`가 놓는다. */
  holdReads: (on: boolean) => void
  /** 붙잡힌 읽기를 **그때의** 서버 값으로 놓는다. */
  releaseReads: () => Promise<void>
  /** 남이 서버의 설명을 바꾼다. */
  overwrite: (value: string | null) => void
} {
  let stored = initial
  let readsFail = false
  let readsHeld = false
  const heldReads: (() => void)[] = []
  const sent: (string | null | undefined)[] = []
  const signals: (AbortSignal | undefined)[] = []
  const waiting: { commit: () => void; resolve: () => void }[] = []
  const read = (pageId: string): PageDetail => ({
    ...pageDetail(pageId, DOC),
    description: pageId === PAGE_ID ? stored : null,
  })
  return {
    sent,
    signals,
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
      getPage: (async (_projectId: string, pageId: string) => {
        if (readsFail && pageId === PAGE_ID) throw new ApiError(0, 'internal', '서버에 연결하지 못했습니다')
        if (readsHeld && pageId === PAGE_ID) {
          return new Promise<PageDetail>((resolve) => heldReads.push(() => resolve(read(pageId))))
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
          waiting.push({ commit, resolve: () => resolve({ ...pageDetail(pageId, DOC), description: value }) })
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
 * 빈 `markerOps`다(`apps/api`의 `POST .../comments`). **멱등 키도 서버처럼 받는다** — 같은 키면 붙잡지
 * 않고 앞 행을 곧바로 돌려준다(빈 `markerOps` · 지금의 번호). `failNext`는 다음 게시를 500 으로 끝낸다.
 */
function commentServer(initial: Comment[] = []): {
  overrides: Partial<ApiClient>
  rows: () => Comment[]
  /** 게시가 실어 온 멱등 키 — 부른 순서대로. */
  keys: (string | undefined)[]
  failNext: () => void
  /** 켜 있는 동안의 목록 읽기를 붙잡는다 — 끈 뒤의 읽기는 곧바로 답한다. */
  holdLists: (on: boolean) => void
  /** 붙잡힌 목록 읽기의 수. */
  heldLists: () => number
  /**
   * 붙잡힌 목록 읽기를 **401** 로 끝낸다 — 로그아웃 **뒤에** 서버에 닿은 앞 세션의 요청이다(모델링: 그
   * 요청은 로그아웃보다 먼저 나갔고, 서버에는 늦게 닿았다).
   */
  failHeldLists: () => Promise<void>
  commit: (index?: number) => void
  respond: (index?: number) => Promise<void>
} {
  let rows = [...initial]
  let next = 100
  let seq = HEAD_SEQ
  let failing = 0
  let listsHeld = false
  const heldLists: ((caught: unknown) => void)[] = []
  const markers = new Map<string, number>()
  const byKey = new Map<string, Comment>()
  const keys: (string | undefined)[] = []
  const waiting: { commit: () => void; resolve: () => void }[] = []
  return {
    rows: () => rows,
    keys,
    failNext: () => {
      failing += 1
    },
    holdLists: (on) => {
      listsHeld = on
    },
    heldLists: () => heldLists.length,
    failHeldLists: async () => {
      await act(async () => {
        for (const fail of heldLists.splice(0)) fail(new ApiError(401, 'unauthenticated', '로그인이 필요합니다'))
      })
    },
    overrides: {
      listComments: async () => {
        if (listsHeld) return new Promise<Comment[]>((_resolve, reject) => heldLists.push(reject))
        return [...rows]
      },
      createComment: ((
        _projectId: string,
        _pageId: string,
        body: { nodeId: string; body: string; idempotencyKey?: string },
      ) => {
        keys.push(body.idempotencyKey)
        if (failing > 0) {
          failing -= 1
          return Promise.reject(new ApiError(500, 'internal', '서버 오류가 발생했습니다'))
        }
        const replayed = body.idempotencyKey === undefined ? undefined : byKey.get(body.idempotencyKey)
        if (replayed !== undefined) {
          return Promise.resolve({
            comment: replayed,
            marker: markers.get(replayed.nodeId) ?? null,
            seq,
            markerOps: [],
          } satisfies CommentCreated)
        }
        return new Promise<CommentCreated>((resolve) => {
          let created: Comment | undefined
          let markerOps: CommentCreated['markerOps'] = []
          const commit = (): void => {
            if (created !== undefined) return
            created = { ...comment(`c-${next++}`, body.body), nodeId: body.nodeId }
            rows = [...rows, created]
            if (body.idempotencyKey !== undefined) byKey.set(body.idempotencyKey, created)
            if (!markers.has(body.nodeId)) {
              if (body.nodeId !== ROOT_ID) throw new Error('이 가짜는 루트에만 번호를 붙인다')
              markers.set(body.nodeId, markers.size + 1)
              seq += 1
              markerOps = [{ op: 'add', path: '/root/marker', value: markers.get(body.nodeId) as number }]
            }
          }
          waiting.push({
            commit,
            resolve: () => {
              commit()
              resolve({ comment: created as Comment, seq, marker: markers.get(body.nodeId) ?? null, markerOps })
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
 *
 * **잠금 둘(*"설명 — 에디터를 떠났다 와도 잠금이 남는다 …"*·*"코멘트 — …"*)은 혼자 죽는 변조가 없다.**
 * 늘 남과 함께 죽는다 — 축의 주인은 **«잠금이 장부에 든다»**이고, 그 축을 깨는 변조(장부의 자리를
 * 셸 안으로 · 잠금을 본문의 `useState`로 · 방문 칸으로)가 셸 **안**의 왕복을 재는 8차·9차 케이스
 * (`page-description-edit.test.tsx`·`comment-panel.test.tsx`의 «저장이 나가 있는 동안 …»·«… 가 → 나 →
 * 가 …»)를 함께 죽인다. 잠금이 한 자리로 모였으니 그 자리를 깨면 전부 함께 죽는 것이 맞다. 이 둘이
 * 따로 재는 것은 **provider 째 내려가는 길**이다 — 8차·9차 케이스 가운데 그 길을 지나는 것은 없다.
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
 * | 시간이 돼도 요청을 끊지 않는다 | *"시간이 되기 전에는 …"* **혼자** |
 * | 판정으로 «저장됨»인데 초안을 안 비운다 | *"서버 값이 보낸 값과 같으면 …"* **혼자** |
 * | 판정으로 «안 됨»인데 초안을 비운다 | *"서버 값이 다르면 …"* **혼자** |
 * | 다시 읽기가 실패하면 «실패»로 풀어 버린다 | *"다시 읽기도 실패하면 모른다 …"* **혼자** |
 * | 판정 뒤에 늦게 온 원래 응답으로 다시 고친다 | *"늦게 온 원래 응답은 …"* **혼자** |
 * | 코멘트: 판정으로 «달림»인데 초안을 안 비운다 | *"코멘트 — 목록에 그 글이 있으면 …"* **혼자** |
 * | 코멘트: 보내기 전 목록에 있던 행을 판정에서 안 뺀다 | *"코멘트 — 목록에 그 글이 없으면 …"* **혼자** |
 * | 코멘트 수정: 판정으로 «저장됨»인데 편집 칸을 안 닫는다 | *"코멘트 수정 — …"* **혼자** |
 * | 설명의 판정이 늘 «안 됨»이다 | *"서버 값이 보낸 값과 같으면 …"* · *"다시 읽기도 실패하면 …"*(둘 다 «저장됨»으로 끝난다) |
 * | 시간 제한이 사실상 없다(1000 배) | 이 절의 여덟 전부 |
 *
 * **`signal`이 요청에 실리는가**는 `test/api/http-client.test.ts`의 *"쓰기 다섯은 받은 `signal`을 …"*가
 * 갖는다(그 줄을 지우면 그것 **혼자** 죽는다). 여기의 가짜 클라이언트는 `http-client`를 안 지난다.
 */
describe('R — 시간 안에 응답이 없으면 결과를 모르는 것이다 — 다시 읽어 판정한다', () => {
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

  it('서버 값이 보낸 값과 같으면 저장된 것이다 — «저장했습니다»·풀림·초안 비움', async () => {
    const server = descriptionServer('서버 값')
    await saveWithFakeTimers(server, '시간 넘긴 글')
    // 서버는 썼는데 응답만 안 온다.
    server.commit()

    await advance(WRITE_DEADLINE_MS)
    vi.useRealTimers()

    await waitFor(() => expect(screen.queryByText('설명을 저장했습니다')).not.toBeNull())
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

    await waitFor(() => expect(screen.queryByText('설명을 저장했습니다')).not.toBeNull())
    expect(box().disabled).toBe(false)
    expect(screen.queryByRole('button', { name: '다시 확인' })).toBeNull()
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

  it('코멘트 — 목록에 그 글이 있으면 달린 것이다: 초안을 비우고 목록에 선다', async () => {
    const server = commentServer()
    await openPage(DOC, { apiOverrides: server.overrides })
    await toCommentTab()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    type(commentBox(), '시간 넘긴 코멘트')
    fireEvent.click(submitButton())
    server.commit()

    await advance(WRITE_DEADLINE_MS)
    vi.useRealTimers()

    await waitFor(() => expect(screen.queryByText('시간 넘긴 코멘트')).not.toBeNull())
    expect(commentBox().value).toBe('')
    expect(commentBox().disabled).toBe(false)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(server.rows()).toHaveLength(1)
  })

  it('코멘트 — 목록에 그 글이 없으면 달리지 않았다고 말하고 초안을 남긴다 — 다시 달 수 있다', async () => {
    // **같은 말이 앞서 달려 있어도** 그것은 이 글이 아니다 — 보내기 전 목록에 있던 행은 판정에서 뺀다.
    const server = commentServer([comment('c-old', '시간 넘긴 코멘트')])
    await openPage(DOC, { apiOverrides: server.overrides })
    await toCommentTab()
    await screen.findByText('시간 넘긴 코멘트')
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    type(commentBox(), '시간 넘긴 코멘트')
    fireEvent.click(submitButton())

    await advance(WRITE_DEADLINE_MS)
    vi.useRealTimers()

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe(
        '응답이 없어 목록을 다시 읽었더니 이 코멘트는 달리지 않았습니다',
      ),
    )
    expect(commentBox().value).toBe('시간 넘긴 코멘트')
    expect(commentBox().disabled).toBe(false)
    expect(submitButton().disabled).toBe(false)
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
 * | 보낼 때마다 새 키를 짓는다 · «안 달림» 판정에 키를 버린다 | *"«안 달림» 판정 뒤 다시 달면 같은 키를 싣는다 …"* **와** *"재생은 …"* |
 *
 * **«같은 키를 싣는다»는 혼자 죽지 않는다** — 그것이 깨지면 재생이 안 일어나 *"재생은 …"*이 설
 * 자리가 없어진다. **«같은 초안은 같은 키» 축의 주인은 이 케이스다** — *"재생은 …"*은 그 위에서
 * «번호 어긋남을 말한다»를 재고 혼자 죽는 변조가 있다(첫 줄). 본문에 키가 실리는지는
 * `test/api/http-client.test.ts`의 *"createComment 는 멱등 키를 …"*가 갖는다(그 줄을 떨구면 혼자 죽는다).
 */
describe('멱등 키 — 같은 초안은 같은 키를 싣고, 성공·고침·떠남에 버린다', () => {
  function toPage(title: string): void {
    fireEvent.click(within(screen.getByRole('region', { name: '메뉴·페이지 트리' })).getByRole('link', { name: title }))
  }

  /** 응답 없는 게시 → 10초 → «안 달림» 판정 → 서버가 **늦게** 커밋 → 같은 초안을 다시 단다. */
  async function lateCommitThenRepost(server: ReturnType<typeof commentServer>): Promise<void> {
    await openPage(DOC, { apiOverrides: server.overrides })
    await toCommentTab()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    type(commentBox(), '늦게 달린 말')
    fireEvent.click(submitButton())
    await advance(WRITE_DEADLINE_MS)
    vi.useRealTimers()
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe(
        '응답이 없어 목록을 다시 읽었더니 이 코멘트는 달리지 않았습니다',
      ),
    )

    // 판정 **뒤에** 서버가 첫 게시를 커밋한다(Chrome: 10초 판정 · 13.4초 커밋).
    server.commit()
    expect(commentBox().value).toBe('늦게 달린 말')
    fireEvent.click(submitButton())
    await waitFor(() => expect(screen.queryByText('늦게 달린 말')).not.toBeNull())
  }

  it('«안 달림» 판정 뒤 다시 달면 같은 키를 싣는다 — 서버가 늦게 커밋했어도 한 행이다', async () => {
    const server = commentServer()
    await lateCommitThenRepost(server)

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
    await lateCommitThenRepost(server)

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
 * 붙잡은 읽기를 로그인한 뒤에 401 로 끝낸다. **쓰기 자체의 401 은 여기서 모델링하지 않았다** — 세션이
 * 끝나면 그 쓰기를 끊으므로(첫 케이스) 실브라우저는 그 응답을 버린다. 끊기지 않는 것이 목록 다시 받기다.
 *
 * 고치기 전(`eb7a155`)에는 다섯 다 죽는다. 각각이 혼자 죽는 변조(웹 전량에서 쟀다):
 *
 * | 변조 | 죽는 것 |
 * |---|---|
 * | 무효화가 세대를 안 올린다 | 이 절의 다섯 전부 |
 * | 세대를 로그아웃 단추에서만 올린다(401 의 `SignedOut`이 부르는 무효화는 안 올린다) | *"같은 사람 — …"* **혼자** |
 * | 세대가 바뀌어도 나가 있는 쓰기를 안 끊는다 | *"다른 사람 — … 로그아웃에 끊기고 …"* **혼자** |
 * | 지난 세대의 쓰기가 새 장부의 항목을 고친다(`put`) | *"앞 세션의 판정이 늦게 끝나도 …"* **혼자** |
 * | 세대가 바뀌어도 항목을 안 비운다 | *"… «확인하지도 못했습니다»로 남은 …"* 와 *"앞 세션의 판정이 …"* — **축의 주인은 «확인하지도 못했습니다» 케이스** |
 * | 지난 세대의 칸 쓰기를 안 버린다(`deliver`) | *"401 이 늦게 닿는 판 …"* 와 *"앞 세션의 판정이 …"*(앨리스의 판정 통지가 밥의 화면에 선다) — **축의 주인은 «401» 케이스** |
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
