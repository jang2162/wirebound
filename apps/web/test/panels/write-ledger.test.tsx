/**
 * **나가 있는 쓰기의 장부**(`src/panels/write-ledger.tsx` — 이월 Q). 무엇을 왜 막는지와 Chrome
 * 값은 그 파일의 머리말이 갖는다. 여기는 그 축을 값으로 잠근다.
 *
 * - **Q — 에디터를 떠났다 와도.** 8차·9차의 케이스(`page-description-edit.test.tsx`·
 *   `comment-panel.test.tsx`의 «저장이 나가 있는 동안 …»·«탭·페이지를 오가도 …»)는 전부 셸 **안**의
 *   왕복이었다 — provider 가 내려가는 길을 아무도 안 지났다. 여기는 **프로젝트 목록을 다녀온다.**
 *
 * **각 케이스가 혼자 죽는 변조**는 아래 절마다 표로 적었다 — 변조를 하나씩 심고, 매번 백업에서
 * 바이트 비교로 복원해서 쟀다.
 */
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { ApiClient } from '../../src/api/client'
import type { Comment, CommentCreated, PageDetail, ProjectDetail } from '../../src/api/types'
import { openPage, pageDetail, pageDoc, PAGE_ID, PROJECT_ID, PROJECT_NAME, waitForNode } from '../editor-harness'
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

// ---- 서버 흉내 ----

/**
 * 설명 하나를 드는 서버. `updatePage`는 **붙잡힌다** — `respond()`가 서버에 쓰고 그 응답을
 * 브라우저에 준다. `getPage`는 **지금 서버에 있는 값**을 낸다 — 돌아와 건 조회가 그것을 본다.
 */
function descriptionServer(initial: string | null): {
  overrides: Partial<ApiClient>
  stored: () => string | null
  sent: (string | null | undefined)[]
  /** 붙잡힌 쓰기 하나의 응답을 준다 — 먼저 서버에 쓴다. */
  respond: (index?: number) => Promise<void>
} {
  let stored = initial
  const sent: (string | null | undefined)[] = []
  const waiting: { commit: () => void; resolve: () => void }[] = []
  return {
    sent,
    stored: () => stored,
    overrides: {
      getPage: (async (_projectId: string, pageId: string) => ({
        ...pageDetail(pageId, DOC),
        description: pageId === PAGE_ID ? stored : null,
      })) as never,
      updatePage: ((_projectId: string, pageId: string, body: { description?: string | null }) => {
        sent.push(body.description)
        const value = body.description ?? null
        return new Promise<PageDetail>((resolve) => {
          waiting.push({
            commit: () => {
              stored = value
            },
            resolve: () => resolve({ ...pageDetail(pageId, DOC), description: value }),
          })
        })
      }) as never,
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

/** 코멘트 표를 드는 서버. 쓰기는 `descriptionServer`처럼 붙잡힌다. */
function commentServer(initial: Comment[] = []): {
  overrides: Partial<ApiClient>
  rows: () => Comment[]
  commit: (index?: number) => void
  respond: (index?: number) => Promise<void>
} {
  let rows = [...initial]
  let next = 100
  const waiting: { commit: () => void; resolve: () => void }[] = []
  return {
    rows: () => rows,
    overrides: {
      listComments: async () => [...rows],
      createComment: ((_projectId: string, _pageId: string, body: { nodeId: string; body: string }) =>
        new Promise<CommentCreated>((resolve) => {
          let created: Comment | undefined
          const commit = (): void => {
            if (created !== undefined) return
            created = { ...comment(`c-${next++}`, body.body), nodeId: body.nodeId }
            rows = [...rows, created]
          }
          waiting.push({
            commit,
            resolve: () => {
              commit()
              resolve({ comment: created as Comment, seq: 7, marker: 1, markerOps: [] } as unknown as CommentCreated)
            },
          })
        })) as never,
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
