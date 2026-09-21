/**
 * 우측의 **코멘트 탭**(설계 §9, P5-1).
 *
 * **이 파일이 지키는 중심 성질은 하나다: 번호는 문서에서 오고 본문은 표에서 온다**
 * (계획서 D1). 그래서 서버가 주는 코멘트 목록에는 `marker`가 없고, 화면이 `nodeId`로
 * 문서의 노드를 찾아 번호를 읽는다. **그 배선이 끊기면 이 파일의 여러 케이스가 죽는다.**
 *
 * 캔버스까지 함께 보는 케이스가 몇 있다 — 코멘트를 달면 서버가 준 `markerOps`가 내
 * 문서에 얹혀야 마커가 뜨기 때문이다(D2). 그 왕복은 패널만 봐서는 잴 수 없다.
 *
 * 모든 케이스가 `<App />`을 라우트째로 렌더한다(`../editor-harness`) — 이유는 그 파일
 * 머리말에 있다.
 */
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { WbNode } from '@wirebound/schema'
import type { ApiClient } from '../../src/api/client'
import type { Comment, CommentCreated } from '../../src/api/types'
import {
  deselect,
  openPage,
  OTHER_PAGE_ID,
  OTHER_PAGE_TITLE,
  PAGE_ID,
  PAGE_ROUTE,
  pageDoc,
  PROJECT_ID,
  PROJECT_NAME,
  renderEditor,
  waitForNode,
} from '../editor-harness'

/** 하네스가 세션으로 내는 사용자. 내 코멘트와 남의 코멘트를 가른다. */
const MY_ID = 'u-1'

function comment(overrides: Partial<Comment> & Pick<Comment, 'id' | 'nodeId' | 'body'>): Comment {
  return {
    authorId: MY_ID,
    authorName: '테스터',
    createdAt: '2026-08-12T09:00:00.000Z',
    updatedAt: '2026-08-12T09:00:00.000Z',
    ...overrides,
  }
}

/** 노드 셋. `marker`를 붙일 자리를 고를 수 있어야 한다. */
function three(markerOf: Partial<Record<'a' | 'b' | 'c', number>>): WbNode {
  const child = (key: 'a' | 'b' | 'c', content: string): WbNode => ({
    id: `n_${key}`,
    type: 'Text',
    props: { content },
    ...(markerOf[key] !== undefined ? { marker: markerOf[key] } : {}),
  })

  return { id: 'n_root', type: 'Page', children: [child('a', '가'), child('b', '나'), child('c', '다')] }
}

/** 코멘트 탭으로 옮긴다. 기본 탭은 속성이다. */
async function openCommentTab(): Promise<void> {
  fireEvent.click(screen.getByRole('tab', { name: '코멘트' }))
  await waitFor(() =>
    expect(screen.getByRole('tab', { name: '코멘트' }).getAttribute('aria-selected')).toBe('true'),
  )
}

/** 지금 그려진 무리의 머리글. 순서가 그대로 배열 순서다. */
function groupTitles(): string[] {
  return [...document.body.querySelectorAll('.wb-shell-comment-group-title')].map(
    (element) => element.textContent?.replace(/\s+/g, ' ').trim() ?? '',
  )
}

/**
 * 코멘트 탭의 상자. **여기 안에서만 단추를 찾는다** — 구조 트리에도 `삭제`가 있어
 * `screen`에서 이름으로 찾으면 둘이 섞인다(실제로 걸렸다).
 */
function panel(): HTMLElement {
  const element = document.body.querySelector<HTMLElement>('.wb-shell-comments')
  if (element === null) throw new Error('코멘트 탭이 열려 있지 않습니다')
  return element
}

/** 캔버스에 그려진 마커. `노드 id → 번호`다. */
function canvasMarkers(): Record<string, string> {
  const found: Record<string, string> = {}
  for (const element of document.body.querySelectorAll<HTMLElement>('[data-wb-marker-for]')) {
    found[element.getAttribute('data-wb-marker-for') ?? ''] = element.textContent ?? ''
  }
  return found
}

describe('코멘트 탭 — 자리', () => {
  it('탭을 누르면 속성 대신 코멘트가 보인다', async () => {
    await openPage(pageDoc(three({})), { apiOverrides: { listComments: async () => [] } })
    // **고른 것이 없는 상태를 손으로 만든다.** 페이지를 열면 스토어가 루트를 고른 채로
    // 시작하므로(`store/editor-store.ts`의 `#selectionFor`), 그냥 열어서는 이 케이스가 재려는
    // 상태가 아니다. 캔버스 빈 자리를 누르는 것이 사용자가 그 상태에 이르는 길이다.
    deselect()

    // 기본은 속성이다.
    expect(screen.getByRole('tab', { name: '속성' }).getAttribute('aria-selected')).toBe('true')
    // **탭을 바꾸기 전에는 안내가 있다.** 이 줄이 없으면 아래 부재 단언이 아무것도 재지
    // 않는다 — 루트가 고른 상태로 시작하니 안내는 애초에 없고, 단언은 늘 참이 된다.
    expect(screen.queryByText('노드를 고르면 속성이 보입니다')).not.toBeNull()

    await openCommentTab()

    expect(screen.getByText('아직 코멘트가 없습니다')).toBeTruthy()
    // **보이지 않는 탭은 DOM에서 뺀다** — 속성 패널의 안내가 함께 사라진다.
    expect(screen.queryByText('노드를 고르면 속성이 보입니다')).toBeNull()
  })

  /**
   * **탭이 셋이 됐다 — P5-2가 상호작용을 채웠다.** 앞 판의 이 케이스는
   * *"탭이 둘뿐이다 — 상호작용은 P5-2가 만든다"*였고, 그 문장은 이제 거짓이다.
   *
   * **여기가 재는 것은 편집 모드의 셋이다.** 뷰 모드가 첫 탭을 *페이지 설명*으로 바꾼 것은
   * P5-3이고, 그 표는 `test/routes/view-mode.test.tsx`가 두 모드를 나란히 잰다.
   */
  it('편집 모드의 탭이 셋이다', async () => {
    await openPage(pageDoc(three({})), { apiOverrides: { listComments: async () => [] } })

    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      '속성',
      '코멘트',
      '상호작용',
    ])
  })
})

describe('코멘트 탭 — 번호는 문서에서 온다(D1)', () => {
  it('번호 순으로 묶인다 — 응답 순서가 아니다', async () => {
    // 서버는 `createdAt` 오름차순으로 준다(번호를 모른다). 화면이 문서의 `marker`로
    // 다시 늘어놓는다. **번호를 문서에서 안 읽으면 이 순서가 응답 순서 그대로 남는다.**
    await openPage(pageDoc(three({ a: 2, c: 1 })), {
      apiOverrides: {
        listComments: async () => [
          comment({ id: 'c1', nodeId: 'n_a', body: '가에 붙은 말' }),
          comment({ id: 'c2', nodeId: 'n_c', body: '다에 붙은 말' }),
        ],
      },
    })
    await openCommentTab()

    await waitFor(() => expect(groupTitles()).toHaveLength(2))
    expect(groupTitles()).toEqual(['1 n_c', '2 n_a'])
  })

  it('같은 노드의 코멘트가 한 무리로 모이고 단 순서를 지킨다(D3)', async () => {
    await openPage(pageDoc(three({ a: 1 })), {
      apiOverrides: {
        listComments: async () => [
          comment({ id: 'c1', nodeId: 'n_a', body: '첫째' }),
          comment({ id: 'c2', nodeId: 'n_a', body: '둘째' }),
        ],
      },
    })
    await openCommentTab()

    await waitFor(() => expect(groupTitles()).toEqual(['1 n_a']))
    expect([...document.body.querySelectorAll('.wb-shell-comment-body')].map((el) => el.textContent)).toEqual([
      '첫째',
      '둘째',
    ])
  })

  it('번호 없는 노드와 사라진 노드를 뒤로 보내고 갈라 말한다(재라 #6)', async () => {
    // `n_b`에는 코멘트가 있는데 번호가 없다(undo가 번호 부여를 되돌린 상태 — D2의 대가 1).
    // `n_없음`은 코멘트가 달린 뒤 노드가 지워진 것이다(`node_id`에 FK가 없다).
    await openPage(pageDoc(three({ a: 1 })), {
      apiOverrides: {
        listComments: async () => [
          comment({ id: 'c1', nodeId: 'n_없음', body: '지워진 노드의 말' }),
          comment({ id: 'c2', nodeId: 'n_b', body: '번호 없는 말' }),
          comment({ id: 'c3', nodeId: 'n_a', body: '번호 있는 말' }),
        ],
      },
    })
    await openCommentTab()

    await waitFor(() => expect(groupTitles()).toHaveLength(3))
    expect(groupTitles()).toEqual(['1 n_a', '– n_b', '– 사라진 노드 (n_없음)'])
    // **감추지 않는다** — 감추면 사용자가 남긴 말이 소리 없이 사라진다.
    expect(screen.getByText('지워진 노드의 말')).toBeTruthy()
  })

  it('고른 노드의 무리에 표시가 붙는다', async () => {
    await openPage(pageDoc(three({ a: 1, c: 2 })), {
      apiOverrides: {
        listComments: async () => [
          comment({ id: 'c1', nodeId: 'n_a', body: '가' }),
          comment({ id: 'c2', nodeId: 'n_c', body: '다' }),
        ],
      },
    })
    await openCommentTab()
    await waitFor(() => expect(groupTitles()).toHaveLength(2))

    // 캔버스에서 `n_c`를 고른다.
    fireEvent.click(document.body.querySelector('[data-wb-id="n_c"]') as HTMLElement)

    await waitFor(() => {
      const current = document.body.querySelector('.wb-shell-comment-group[aria-current="true"]')
      expect(current?.querySelector('.wb-shell-comment-group-title')?.textContent).toContain('n_c')
    })
  })
})

describe('코멘트 달기 — 문서가 함께 움직인다(D2)', () => {
  it('서버가 준 markerOps가 캔버스의 마커가 된다', async () => {
    // **이 케이스가 D2의 웹 쪽 전부다.** 서버가 문서에 낸 변화를 스토어에 얹지 않으면
    // 코멘트는 달렸는데 캔버스에 번호가 안 뜬다.
    const created = vi.fn(async () => ({
      comment: comment({ id: 'c1', nodeId: 'n_a', body: '새 말' }),
      marker: 1,
      seq: 8,
      markerOps: [{ op: 'add' as const, path: '/root/children/0/marker', value: 1 }],
    }))
    let listed: Comment[] = []

    await openPage(pageDoc(three({})), {
      apiOverrides: {
        listComments: async () => listed,
        createComment: async () => {
          const result = await created()
          listed = [result.comment]
          return result
        },
      },
    })
    await openCommentTab()
    expect(canvasMarkers()).toEqual({})

    fireEvent.click(document.body.querySelector('[data-wb-id="n_a"]') as HTMLElement)
    fireEvent.change(screen.getByLabelText('새 코멘트'), { target: { value: '새 말' } })
    fireEvent.click(screen.getByRole('button', { name: '코멘트 달기' }))

    await waitFor(() => expect(canvasMarkers()).toEqual({ n_a: '1' }))
    expect(created).toHaveBeenCalledTimes(1)
    // 목록도 다시 받아 새 코멘트가 보인다.
    await waitFor(() => expect(screen.getByText('새 말')).toBeTruthy())
  })

  it('노드를 고르지 않으면 쓸 수 없다', async () => {
    await openPage(pageDoc(three({})), { apiOverrides: { listComments: async () => [] } })
    // **고른 것이 없는 상태를 손으로 만든다.** 페이지를 열면 스토어가 루트를 고른 채로
    // 시작하므로(`store/editor-store.ts`의 `#selectionFor`), 그냥 열어서는 이 케이스가 재려는
    // 상태가 아니다. 캔버스 빈 자리를 누르는 것이 사용자가 그 상태에 이르는 길이다.
    deselect()
    await openCommentTab()

    expect((screen.getByLabelText('새 코멘트') as HTMLTextAreaElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: '코멘트 달기' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('코멘트를 달 노드를 캔버스나 구조 트리에서 고르세요')).toBeTruthy()
  })

  it('저장에 실패하면 쓴 말이 남는다', async () => {
    // **P4c-3 이월의 둘째 줄이 말하는 부류의 반대편이다.** 실패했는데 초안을 비우면
    // 사용자가 친 말이 사라진다 — 새 입력 경로를 만들 때마다 던지는 물음이다.
    await openPage(pageDoc(three({})), {
      apiOverrides: {
        listComments: async () => [],
        createComment: async () => {
          throw new Error('서버가 끊겼다')
        },
      },
    })
    await openCommentTab()

    fireEvent.click(document.body.querySelector('[data-wb-id="n_a"]') as HTMLElement)
    fireEvent.change(screen.getByLabelText('새 코멘트'), { target: { value: '잃으면 안 되는 말' } })
    fireEvent.click(screen.getByRole('button', { name: '코멘트 달기' }))

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    expect((screen.getByLabelText('새 코멘트') as HTMLTextAreaElement).value).toBe('잃으면 안 되는 말')
    // 문서도 안 바뀐다 — 실패한 요청이 마커를 남기면 안 된다.
    expect(canvasMarkers()).toEqual({})
  })
})

describe('지우기와 재번호', () => {
  it('마지막 코멘트를 지우면 마커도 사라진다(D3)', async () => {
    let listed: Comment[] = [comment({ id: 'c1', nodeId: 'n_a', body: '지울 말' })]

    await openPage(pageDoc(three({ a: 1 })), {
      apiOverrides: {
        listComments: async () => listed,
        deleteComment: async () => {
          listed = []
          return { seq: 9, markerOps: [{ op: 'remove' as const, path: '/root/children/0/marker' }] }
        },
      },
    })
    await openCommentTab()
    await waitFor(() => expect(canvasMarkers()).toEqual({ n_a: '1' }))

    fireEvent.click(within(panel()).getByRole('button', { name: '삭제' }))

    await waitFor(() => expect(canvasMarkers()).toEqual({}))
    expect(screen.getByText('아직 코멘트가 없습니다')).toBeTruthy()
  })

  it('재번호는 문서만 바꾸고 목록을 다시 받지 않는다(D4)', async () => {
    // **표는 안 건드린다** — 코멘트 행은 번호를 모른다(D1). 목록을 다시 받으면 헛일이다.
    const listComments = vi.fn(async () => [comment({ id: 'c1', nodeId: 'n_c', body: '다' })])

    await openPage(pageDoc(three({ c: 5 })), {
      apiOverrides: {
        listComments,
        renumberComments: async () => ({
          seq: 9,
          markerOps: [{ op: 'replace' as const, path: '/root/children/2/marker', value: 1 }],
        }),
      },
    })
    await openCommentTab()
    await waitFor(() => expect(canvasMarkers()).toEqual({ n_c: '5' }))
    const before = listComments.mock.calls.length

    fireEvent.click(screen.getByRole('button', { name: '문서 순서대로 재번호' }))

    await waitFor(() => expect(canvasMarkers()).toEqual({ n_c: '1' }))
    expect(listComments.mock.calls.length).toBe(before)
    // 목록의 번호도 문서에서 읽으므로 함께 바뀐다.
    await waitFor(() => expect(groupTitles()).toEqual(['1 n_c']))
  })
})

describe('수정 — 작성자만(재라 #2)', () => {
  it('내 코멘트에는 수정 단추가 있고 남의 것에는 없다', async () => {
    await openPage(pageDoc(three({ a: 1, c: 2 })), {
      apiOverrides: {
        listComments: async () => [
          comment({ id: 'c1', nodeId: 'n_a', body: '내 말' }),
          comment({ id: 'c2', nodeId: 'n_c', body: '남의 말', authorId: 'u-2', authorName: '동료' }),
        ],
      },
    })
    await openCommentTab()
    await waitFor(() => expect(groupTitles()).toHaveLength(2))

    // 수정은 하나뿐이고 삭제는 둘이다 — **삭제는 editor면 누구나 한다.**
    expect(within(panel()).getAllByRole('button', { name: '수정' })).toHaveLength(1)
    expect(within(panel()).getAllByRole('button', { name: '삭제' })).toHaveLength(2)
  })

  it('고친 본문이 저장되고 목록이 다시 온다', async () => {
    let listed: Comment[] = [comment({ id: 'c1', nodeId: 'n_a', body: '옛 말' })]

    await openPage(pageDoc(three({ a: 1 })), {
      apiOverrides: {
        listComments: async () => listed,
        updateComment: async (_projectId, _pageId, _commentId, body) => {
          const next = comment({ id: 'c1', nodeId: 'n_a', body: body.body })
          listed = [next]
          return next
        },
      },
    })
    await openCommentTab()
    await waitFor(() => expect(screen.getByText('옛 말')).toBeTruthy())

    fireEvent.click(within(panel()).getByRole('button', { name: '수정' }))
    fireEvent.change(screen.getByLabelText('코멘트 수정'), { target: { value: '새 말' } })
    fireEvent.click(within(panel()).getByRole('button', { name: '저장' }))

    await waitFor(() => expect(screen.getByText('새 말')).toBeTruthy())
    expect(screen.queryByText('옛 말')).toBeNull()
  })
})

describe('문서를 못 읽었을 때 — "모른다"를 "없다"로 접지 않는다 (리뷰 F)', () => {
  /**
   * 문서 조회는 실패하고 코멘트 조회는 성공하는 화면을 만든다. `renderEditor`에 `docs`를
   * 주지 않으면 가짜가 `getPage`에 404를 던지므로 스토어의 문서가 `null`로 남는다.
   */
  async function openWithoutDocument(comments: Comment[]): Promise<void> {
    renderEditor({ apiOverrides: { listComments: async () => comments }, route: PAGE_ROUTE })
    await screen.findByRole('heading', { name: PROJECT_NAME })
    await openCommentTab()
  }

  it('"사라진 노드"라고 단언하지 않는다', async () => {
    // **앞 판은 여기서 모든 코멘트를 "사라진 노드"라고 적었다** — `markersOf(null)`이 빈
    // 표를 내고 `has()`가 전부 `false`가 됐기 때문이다. 사용자가 실제로 보는 거짓말이다.
    await openWithoutDocument([
      comment({ id: 'c1', nodeId: 'n_a', body: '가에 붙은 말' }),
      comment({ id: 'c2', nodeId: 'n_b', body: '나에 붙은 말' }),
    ])

    await waitFor(() => expect(groupTitles()).toHaveLength(2))
    expect(groupTitles()).toEqual(['– n_a', '– n_b'])
    expect(screen.queryByText(/사라진 노드/)).toBeNull()
  })

  it('번호를 못 보이는 이유를 화면이 말한다', async () => {
    await openWithoutDocument([comment({ id: 'c1', nodeId: 'n_a', body: '말' })])

    await waitFor(() =>
      expect(screen.getByText('문서를 읽지 못해 번호를 보일 수 없습니다')).toBeTruthy(),
    )
    // 코멘트 자체는 그대로 보인다 — 번호만 못 붙일 뿐이다.
    expect(screen.getByText('말')).toBeTruthy()
  })

  it('코멘트가 없으면 그 안내를 내지 않는다', async () => {
    // 붙일 번호가 없는 것이 아니라 붙일 코멘트가 없는 것이다. 두 안내가 겹치면
    // 사용자가 무엇이 문제인지 알 수 없다.
    await openWithoutDocument([])

    await waitFor(() => expect(screen.getByText('아직 코멘트가 없습니다')).toBeTruthy())
    expect(screen.queryByText('문서를 읽지 못해 번호를 보일 수 없습니다')).toBeNull()
  })
})

describe('문서에 얹지 못했을 때 — 버리지 않고 말한다 (리뷰 ④)', () => {
  it('서버가 바꾼 번호를 내 문서에 못 얹으면 그렇다고 말한다', async () => {
    // 서버가 낸 `markerOps`의 경로가 내 문서에 없다(보내지 않은 구조 편집이 그 노드를
    // 이미 지운 상태와 같다). **조용히 넘기면 코멘트는 달렸는데 캔버스에 번호가 없고
    // 아무도 그것을 말하지 않는다** — 이 저장소가 네 번 만난 부류의 형태다.
    await openPage(pageDoc(three({})), {
      apiOverrides: {
        listComments: async () => [],
        createComment: async () => ({
          comment: comment({ id: 'c1', nodeId: 'n_a', body: '새 말' }),
          marker: 1,
          seq: 8,
          markerOps: [{ op: 'replace' as const, path: '/root/children/9/marker', value: 1 }],
        }),
      },
    })
    await openCommentTab()

    fireEvent.click(document.body.querySelector('[data-wb-id="n_a"]') as HTMLElement)
    fireEvent.change(screen.getByLabelText('새 코멘트'), { target: { value: '새 말' } })
    fireEvent.click(screen.getByRole('button', { name: '코멘트 달기' }))

    await waitFor(() =>
      expect(
        screen.getByText('번호를 화면에 반영하지 못했습니다 — 새로고침하면 맞춰집니다'),
      ).toBeTruthy(),
    )
    // **실패가 아니다** — 코멘트는 저장됐다. 그래서 `alert`가 아니라 `status`다.
    expect(screen.queryByRole('alert')).toBeNull()
    expect(canvasMarkers()).toEqual({})
  })

  it('정상 경로에서는 그 말을 하지 않는다 — 음성 대조', async () => {
    await openPage(pageDoc(three({})), {
      apiOverrides: {
        listComments: async () => [],
        createComment: async () => ({
          comment: comment({ id: 'c1', nodeId: 'n_a', body: '새 말' }),
          marker: 1,
          seq: 8,
          markerOps: [{ op: 'add' as const, path: '/root/children/0/marker', value: 1 }],
        }),
      },
    })
    await openCommentTab()

    fireEvent.click(document.body.querySelector('[data-wb-id="n_a"]') as HTMLElement)
    fireEvent.change(screen.getByLabelText('새 코멘트'), { target: { value: '새 말' } })
    fireEvent.click(screen.getByRole('button', { name: '코멘트 달기' }))

    await waitFor(() => expect(canvasMarkers()).toEqual({ n_a: '1' }))
    expect(screen.queryByText(/번호를 화면에 반영하지 못했습니다/)).toBeNull()
  })
})

describe('페이지 경계', () => {
  it('열려 있는 페이지의 코멘트만 받는다', async () => {
    // 경로에 실리는 것이 **지금 열린 페이지**여야 한다 — 앞 페이지의 id로 부르면
    // 남의 페이지의 말이 이 화면에 그려진다.
    const listComments = vi.fn(async () => [])

    await openPage(pageDoc(three({})), { apiOverrides: { listComments } })
    await waitForNode('n_a')
    await openCommentTab()

    await waitFor(() => expect(listComments).toHaveBeenCalledWith(PROJECT_ID, PAGE_ID))
  })

  it('탭을 열기 전에는 조회하지 않는다', async () => {
    // 보이지 않는 탭을 DOM에서 빼는 이유다(`routes/editor.tsx`) — 감춰 둔 채 살려 두면
    // 보지도 않는 목록을 위해 페이지를 열 때마다 요청이 나간다.
    const listComments = vi.fn(async () => [])

    await openPage(pageDoc(three({})), { apiOverrides: { listComments } })
    await waitForNode('n_a')

    expect(listComments).not.toHaveBeenCalled()
  })
})

/** 목록에 그려진 코멘트 본문들. **상자 안의 초안 글자는 안 센다** — `getByText`는 그것도 잡는다. */
function listedBodies(): string[] {
  return [...panel().querySelectorAll('.wb-shell-comment-body')].map((element) => element.textContent ?? '')
}

/** 새 코멘트 상자. */
function newBox(): HTMLTextAreaElement {
  return screen.getByLabelText('새 코멘트') as HTMLTextAreaElement
}

/** 코멘트 탭의 폼이 다시 설 때까지 — 탭을 다시 열면 목록 조회가 끝나야 폼이 선다. */
async function findNewBox(): Promise<HTMLTextAreaElement> {
  return (await screen.findByLabelText('새 코멘트')) as HTMLTextAreaElement
}

function toPropsTab(): void {
  fireEvent.click(screen.getByRole('tab', { name: '속성' }))
}

/** 메뉴 트리에서 페이지를 **누른다** — 사용자가 하듯. */
function toPage(title: string): void {
  fireEvent.click(
    within(screen.getByRole('region', { name: '메뉴·페이지 트리' })).getByRole('link', { name: title }),
  )
}

/**
 * `createComment`·`updateComment`를 **붙잡아 두는** 가짜 — «쓰기가 나가 있는 동안»을 만든다.
 * 응답이 오면 `listed`가 그만큼 바뀐다(서버가 행을 쓴 것처럼). 목록은 페이지마다 따로 들고,
 * `seed`가 첫 페이지의 목록이다.
 */
function heldComments(seed: Comment[] = []): {
  overrides: Partial<ApiClient>
  listed: Record<string, Comment[]>
  created: { pageId: string; nodeId: string; body: string }[]
  updated: { pageId: string; commentId: string; body: string }[]
  release: () => Promise<void>
} {
  const listed: Record<string, Comment[]> = { [PAGE_ID]: [...seed], [OTHER_PAGE_ID]: [] }
  const created: { pageId: string; nodeId: string; body: string }[] = []
  const updated: { pageId: string; commentId: string; body: string }[] = []
  const gates: (() => void)[] = []
  const replies: Promise<unknown>[] = []
  return {
    listed,
    created,
    updated,
    overrides: {
      listComments: async (_projectId, pageId) => [...(listed[pageId] ?? [])],
      createComment: (_projectId, pageId, body) => {
        created.push({ pageId, ...body })
        const reply = new Promise<CommentCreated>((resolve) => {
          gates.push(() => {
            const row = comment({ id: `c-${created.length}`, nodeId: body.nodeId, body: body.body })
            listed[pageId] = [...(listed[pageId] ?? []), row]
            resolve({ comment: row, marker: 1, seq: 8, markerOps: [] })
          })
        })
        replies.push(reply)
        return reply
      },
      updateComment: (_projectId, pageId, commentId, body) => {
        updated.push({ pageId, commentId, body: body.body })
        const reply = new Promise<Comment>((resolve, reject) => {
          gates.push(() => {
            const rows = listed[pageId] ?? []
            const row = rows.find((item) => item.id === commentId)
            if (row === undefined) {
              reject(new Error(`고칠 코멘트가 없다: ${commentId}`))
              return
            }
            const next = { ...row, body: body.body }
            listed[pageId] = rows.map((item) => (item.id === commentId ? next : item))
            resolve(next)
          })
        })
        replies.push(reply)
        return reply
      },
    },
    release: async () => {
      const gate = gates.shift()
      const reply = replies.shift()
      if (gate === undefined || reply === undefined) throw new Error('붙잡힌 게시가 없다')
      await act(async () => {
        gate()
        await reply
      })
      // 게시 뒤의 목록 다시 받기까지 끝나게 한다.
      await act(async () => {})
    },
  }
}

/**
 * **탭·페이지를 오가는 축**(8차). 이 파일의 다른 케이스는 전부 코멘트 탭에 머문 채 한
 * 페이지 안에서 돌아, 탭을 한 번 눌렀다 오는 것만으로 쓰던 말이 사라지는 결함이 아무에게도
 * 안 잡혔다(`routes/editor.tsx`가 안 보이는 탭을 DOM에서 빼고, 이 패널은 초안을 자기
 * `useState`로 들었다). 무엇을 어디에 드는지는 `panels/panel-drafts.tsx`의 머리말이 갖는다.
 *
 * **여섯이 각각 혼자 죽는다** — 변조를 하나씩 심고 매번 복구해서 `--project web` 전체로 쟀다.
 * 앞의 넷은 «마운트에 묶는다»의 꼴이다 — 앞 판의 결함이 정확히 그것이었다(조회 이펙트가
 * 마운트마다 초안을 비웠다):
 *
 * | 변조 | 혼자 죽는 것 |
 * |---|---|
 * | 마운트 이펙트가 새 코멘트 초안까지 지운다 | *"새 코멘트 초안이 탭을 오가도 …"* |
 * | 그것이 고치던 것까지 지운다 | *"고치던 코멘트가 탭을 오가도 …"* |
 * | 그것이 쓰기 잠금까지 푼다 | *"게시가 나가 있는 동안 … 잠금이 남는다 …"* |
 * | 다시 받은 목록을 마운트에 묶는다(언마운트 뒤면 안 쓴다) | *"… 그 뒤 목록이 떠 있는 본문에 닿는다"* |
 * | 칸의 쓰기 가드가 코멘트 칸에만 안 걸린다 | *"게시 중에 옆 페이지로 …"* |
 * | provider 의 리셋이 코멘트 초안·고치던 것을 넘긴다 | *"페이지가 바뀌면 …"* |
 *
 * **쓰기 가드를 통째로 빼면** 이 절의 *"게시 중에 옆 페이지로 …"*와 «페이지 설명»의 N2 케이스가
 * 함께 죽는다 — 가드가 한 벌이기 때문이다. 칸별로 가르면(위 표 다섯째 줄과 그 거울판) 각자
 * 혼자 죽는다. provider 에 `key={chosen}`을 걸면 이 절의 탭 왕복 넷과 «페이지 설명»의 탭 왕복
 * 셋이 함께 죽는다 — «탭을 오가도 칸이 산다» 축은 한 provider 의 것이다.
 *
 * **앞 판 `comment-panel.tsx`로 되돌리면 여섯 중 다섯이 죽는다.** *"페이지가 바뀌면 …"*은 산다 —
 * 앞 판도 지키던 규칙이고, 이 케이스는 그 규칙이 **자리를 옮긴 뒤에도** 지켜지는지를 잠근다.
 *
 * **가 → 나 → 가 의 둘**(9차, 리뷰 N-A) — 쓰기 잠금이 페이지 리셋에 버려져, 돌아와 쓰던 말·고치던
 * 칸이 앞 쓰기의 응답에 지워졌다. 무엇을 막는지는 `panels/panel-drafts.tsx`의 머리말 3이 갖는다.
 *
 * | 변조 | 죽는 것 |
 * |---|---|
 * | 수정 단추가 쓰기 잠금을 안 본다 | *"수정 중에 옆 페이지를 다녀와도 …"* **혼자** |
 * | 쓰기 잠금(`BUSY`)을 방문 칸(`slot`)으로 든다 | *"게시 중에 옆 페이지를 …"* **와** *"수정 중에 …"* |
 * | 새 코멘트 상자가 쓰기 잠금을 안 본다 | *"게시 중에 옆 페이지를 …"* **와** 위 *"게시가 나가 있는 동안 탭을 오가도 …"* |
 *
 * **«게시 중에 …»는 혼자 죽지 않는다** — 잠금이 한 칸이라 수정 케이스와, 상자가 한 개라 탭 왕복
 * 케이스와 함께 죽는다. **«코멘트의 쓰기 잠금이 페이지 왕복에도 남는다» 축의 주인은 이 케이스다**
 * — 수정 케이스는 그 위에서 «수정 단추까지 꺼진다»를 재고 혼자 죽는 변조가 있다. 8차 판(이 커밋
 * 전의 세 파일)으로 되돌리면 둘 다 죽는다.
 */
describe('탭·페이지를 오가도 쓰던 말이 제자리에 있다 (8차)', () => {
  it('새 코멘트 초안이 탭을 오가도 남는다', async () => {
    await openPage(pageDoc(three({})), { apiOverrides: { listComments: async () => [] } })
    await openCommentTab()
    fireEvent.click(document.body.querySelector('[data-wb-id="n_a"]') as HTMLElement)
    fireEvent.change(await findNewBox(), { target: { value: '쓰던 코멘트' } })

    toPropsTab()
    // **상자가 정말 사라지는 것을 먼저 잠근다** — 없으면 «탭을 눌러도 언마운트되지 않는»
    // 판에서도 통과해 재는 것이 없어진다.
    expect(screen.queryByLabelText('새 코멘트')).toBeNull()
    await openCommentTab()

    // **앞 판은 `""`였다**(jsdom · Chrome 둘 다).
    expect((await findNewBox()).value).toBe('쓰던 코멘트')
    expect((screen.getByRole('button', { name: '코멘트 달기' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('고치던 코멘트가 탭을 오가도 남는다 — 편집 칸도 글도', async () => {
    await openPage(pageDoc(three({ a: 1 })), {
      apiOverrides: { listComments: async () => [comment({ id: 'c1', nodeId: 'n_a', body: '옛 말' })] },
    })
    await openCommentTab()
    await waitFor(() => expect(screen.getByText('옛 말')).toBeTruthy())
    fireEvent.click(within(panel()).getByRole('button', { name: '수정' }))
    fireEvent.change(screen.getByLabelText('코멘트 수정'), { target: { value: '고치던 말' } })

    toPropsTab()
    expect(screen.queryByLabelText('코멘트 수정')).toBeNull()
    await openCommentTab()

    // **앞 판은 편집 칸째 닫혀 `"옛 말"`만 보였다**(Chrome 실측도 같다).
    const edit = (await screen.findByLabelText('코멘트 수정')) as HTMLTextAreaElement
    expect(edit.value).toBe('고치던 말')
  })

  it('게시가 나가 있는 동안 탭을 오가도 잠금이 남는다 — 같은 코멘트를 두 번 달 수 없다', async () => {
    const api = heldComments()
    await openPage(pageDoc(three({})), { apiOverrides: api.overrides })
    await openCommentTab()
    fireEvent.click(document.body.querySelector('[data-wb-id="n_a"]') as HTMLElement)
    fireEvent.change(await findNewBox(), { target: { value: '한 번만 달 말' } })
    fireEvent.click(screen.getByRole('button', { name: '코멘트 달기' }))
    await waitFor(() => expect(api.created).toHaveLength(1))

    toPropsTab()
    await openCommentTab()
    await findNewBox()

    // **잠금이 마운트에 묶여 있으면 여기서 풀린다** — 새 마운트가 `busy`를 `false`로 시작해
    // 같은 초안으로 한 번 더 달 수 있다(«페이지 설명»의 리뷰 N1 과 같은 부류).
    expect(newBox().disabled).toBe(true)
    expect((screen.getByRole('button', { name: '코멘트 달기' }) as HTMLButtonElement).disabled).toBe(true)

    await api.release()

    // 양성 대조 — 응답이 오면 풀린다.
    expect(newBox().disabled).toBe(false)
    expect(api.created).toHaveLength(1)
  })

  it('게시가 나가 있는 동안 탭을 오가면 그 뒤 목록이 떠 있는 본문에 닿는다', async () => {
    const api = heldComments()
    await openPage(pageDoc(three({})), { apiOverrides: api.overrides })
    await openCommentTab()
    fireEvent.click(document.body.querySelector('[data-wb-id="n_a"]') as HTMLElement)
    fireEvent.change(await findNewBox(), { target: { value: '방금 단 말' } })
    fireEvent.click(screen.getByRole('button', { name: '코멘트 달기' }))
    await waitFor(() => expect(api.created).toHaveLength(1))

    toPropsTab()
    await openCommentTab()
    await findNewBox()
    // 새 마운트의 조회는 게시가 끝나기 전의 목록이다.
    expect(listedBodies()).toEqual([])

    await api.release()

    // **다시 받은 목록이 죽은 옛 마운트에 닿으면** 새 마운트는 낡은 목록을 그대로 보인다.
    await waitFor(() => expect(listedBodies()).toEqual(['방금 단 말']))
    expect(newBox().value).toBe('')
  })

  it('게시 중에 옆 페이지로 옮기면 그 응답이 옆 페이지에 닿지 않는다 — 옆 페이지에서 쓰던 말이 남는다', async () => {
    const api = heldComments()
    await openPage(pageDoc(three({})), {
      docs: { [OTHER_PAGE_ID]: pageDoc(three({})) },
      apiOverrides: api.overrides,
    })
    await openCommentTab()
    fireEvent.click(document.body.querySelector('[data-wb-id="n_a"]') as HTMLElement)
    fireEvent.change(await findNewBox(), { target: { value: '앞 페이지에 단 말' } })
    fireEvent.click(screen.getByRole('button', { name: '코멘트 달기' }))
    await waitFor(() => expect(api.created).toHaveLength(1))

    toPage(OTHER_PAGE_TITLE)
    // **상자의 값은 기다리지 않는다** — 그것은 아래 *"페이지가 바뀌면 …"*의 축이다.
    await waitFor(() => expect(screen.getByText('아직 코멘트가 없습니다')).toBeTruthy())
    fireEvent.change(await findNewBox(), { target: { value: '옆 페이지에서 쓰던 말' } })

    await api.release()

    // **앞 판에서는 앞 페이지의 응답이 이 상자를 비우고, 앞 페이지의 목록을 다시 받아 이
    // 페이지에 그렸다** — 옆 페이지의 코멘트 탭에 남의 페이지의 말이 섰다.
    expect(newBox().value).toBe('옆 페이지에서 쓰던 말')
    expect(listedBodies()).toEqual([])
    expect(screen.getByText('아직 코멘트가 없습니다')).toBeTruthy()
    expect(api.created).toEqual([{ pageId: PAGE_ID, nodeId: 'n_a', body: '앞 페이지에 단 말' }])
  })

  it('게시 중에 옆 페이지를 다녀와도(가 → 나 → 가) 잠금이 남는다 — 돌아와 쓰는 말이 앞 응답에 비워질 수 없다', async () => {
    const api = heldComments()
    await openPage(pageDoc(three({})), {
      docs: { [OTHER_PAGE_ID]: pageDoc(three({})) },
      apiOverrides: api.overrides,
    })
    await openCommentTab()
    fireEvent.click(document.body.querySelector('[data-wb-id="n_a"]') as HTMLElement)
    fireEvent.change(await findNewBox(), { target: { value: '앞에 단 말' } })
    fireEvent.click(screen.getByRole('button', { name: '코멘트 달기' }))
    await waitFor(() => expect(api.created).toHaveLength(1))

    toPage(OTHER_PAGE_TITLE)
    await waitFor(() => expect(screen.getByText('아직 코멘트가 없습니다')).toBeTruthy())
    toPage('회원 목록')
    await waitFor(() => expect(screen.getByText('아직 코멘트가 없습니다')).toBeTruthy())

    // **8차 판은 여기서 상자와 단추가 열려 있었다**(리뷰 N-A — 쓰기 잠금이 페이지 리셋에 함께
    // 버려졌다). 돌아와 쓰던 말은 앞 게시의 응답(«보낸 초안을 비운다»)에 `""`가 됐고, 한 번 더
    // 달면 게시가 둘 동시에 나갔다.
    expect(newBox().disabled).toBe(true)
    expect((screen.getByRole('button', { name: '코멘트 달기' }) as HTMLButtonElement).disabled).toBe(true)

    await api.release()

    // **양성 대조** — 응답이 돌아온 방문에 닿는다: 목록에 그 말이 서고 풀린다.
    await waitFor(() => expect(listedBodies()).toEqual(['앞에 단 말']))
    expect(newBox().disabled).toBe(false)
    expect(api.created).toEqual([{ pageId: PAGE_ID, nodeId: 'n_a', body: '앞에 단 말' }])
  })

  it('수정 중에 옆 페이지를 다녀와도(가 → 나 → 가) 잠금이 남는다 — 돌아와 다른 코멘트를 고치던 칸이 앞 응답에 닫힐 수 없다', async () => {
    const api = heldComments([
      comment({ id: 'c1', nodeId: 'n_a', body: '기존 말 1' }),
      comment({ id: 'c2', nodeId: 'n_a', body: '기존 말 2' }),
    ])
    await openPage(pageDoc(three({ a: 1 })), {
      docs: { [OTHER_PAGE_ID]: pageDoc(three({})) },
      apiOverrides: api.overrides,
    })
    await openCommentTab()
    await waitFor(() => expect(listedBodies()).toEqual(['기존 말 1', '기존 말 2']))
    fireEvent.click(within(panel()).getAllByRole('button', { name: '수정' })[0]!)
    fireEvent.change(screen.getByLabelText('코멘트 수정'), { target: { value: '기존 말 1 고침' } })
    fireEvent.click(within(panel()).getByRole('button', { name: '저장' }))
    await waitFor(() => expect(api.updated).toHaveLength(1))

    toPage(OTHER_PAGE_TITLE)
    await waitFor(() => expect(screen.getByText('아직 코멘트가 없습니다')).toBeTruthy())
    toPage('회원 목록')
    await waitFor(() => expect(listedBodies()).toEqual(['기존 말 1', '기존 말 2']))

    // **8차 판은 여기서 수정 단추가 열려 있었다**(리뷰 N-A). 둘째 코멘트를 고치기 시작하면
    // 첫째의 응답(«고치던 칸을 닫는다»)이 **둘째의** 칸을 닫아 그 글이 사라졌다.
    const edits = (): HTMLButtonElement[] => within(panel()).getAllByRole<HTMLButtonElement>('button', { name: '수정' })
    expect(edits().map((button) => button.disabled)).toEqual([true, true])

    await api.release()

    // **양성 대조** — 응답이 돌아온 방문에 닿는다: 고친 말이 서고 풀린다.
    await waitFor(() => expect(listedBodies()).toEqual(['기존 말 1 고침', '기존 말 2']))
    expect(edits().map((button) => button.disabled)).toEqual([false, false])
    expect(api.updated).toEqual([{ pageId: PAGE_ID, commentId: 'c1', body: '기존 말 1 고침' }])
  })

  it('페이지가 바뀌면 쓰던 초안과 고치던 것을 버린다 — 노드 id도 코멘트 id도 그 페이지의 것이다', async () => {
    await openPage(pageDoc(three({ a: 1 })), {
      docs: { [OTHER_PAGE_ID]: pageDoc(three({})) },
      apiOverrides: {
        listComments: async (_projectId, pageId) =>
          pageId === PAGE_ID ? [comment({ id: 'c1', nodeId: 'n_a', body: '옛 말' })] : [],
      },
    })
    await openCommentTab()
    await waitFor(() => expect(screen.getByText('옛 말')).toBeTruthy())
    fireEvent.change(newBox(), { target: { value: '쓰던 새 코멘트' } })
    fireEvent.click(within(panel()).getByRole('button', { name: '수정' }))
    fireEvent.change(screen.getByLabelText('코멘트 수정'), { target: { value: '고치던 말' } })

    toPage(OTHER_PAGE_TITLE)
    await waitFor(() => expect(screen.getByText('아직 코멘트가 없습니다')).toBeTruthy())
    expect(newBox().value).toBe('')

    // **돌아와도 되살아나지 않는다** — 고치던 것은 앞 페이지의 코멘트 id를 들고 있어, 넘겨
    // 받으면 돌아온 순간 편집 칸이 다시 선다.
    toPage('회원 목록')
    await waitFor(() => expect(screen.getByText('옛 말')).toBeTruthy())
    expect(screen.queryByLabelText('코멘트 수정')).toBeNull()
    expect(newBox().value).toBe('')
  })
})
