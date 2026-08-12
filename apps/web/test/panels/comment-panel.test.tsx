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
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { WbNode } from '@wirebound/schema'
import type { Comment } from '../../src/api/types'
import {
  PAGE_ID,
  PAGE_ROUTE,
  PROJECT_ID,
  PROJECT_NAME,
  openPage,
  pageDoc,
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

    // 기본은 속성이다.
    expect(screen.getByRole('tab', { name: '속성' }).getAttribute('aria-selected')).toBe('true')

    await openCommentTab()

    expect(screen.getByText('아직 코멘트가 없습니다')).toBeTruthy()
    // **보이지 않는 탭은 DOM에서 뺀다** — 속성 패널의 안내가 함께 사라진다.
    expect(screen.queryByText('노드를 고르면 속성이 보입니다')).toBeNull()
  })

  it('탭이 둘뿐이다 — 상호작용은 P5-2가 만든다', async () => {
    await openPage(pageDoc(three({})), { apiOverrides: { listComments: async () => [] } })

    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['속성', '코멘트'])
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
