/**
 * **viewer 의 에디터 — 자리마다 입구가 숨었나 · 꺼졌나**(셸 `canEdit`의 표).
 *
 * 전량은 `./viewer-readonly-harness.tsx` 의 훑기(케이스는 `viewer-readonly-*.test.tsx`)가 잰다 — 닿는 컨트롤을 전부 누르고 키를 보내 **쓰기 요청 0**을 센다. 이 파일은
 * 그 자가 못 말하는 것을 잰다: **어느 자리가 어느 관례로 닫혔나**(숨김 / 꺼짐 + 이유)와, 그 자가 요청으로는 못 보는 것
 * (꺼져 있어 누를 수 없는 «되돌리기» — 요청이 안 나가므로 그 자는 안 죽는다).
 *
 * **키보드 축은 이 파일에 없다** — 두 트리의 단축키는 그 자의 키 훑기가 소유한다(단축키를 지운 변조가 거기서만 죽는다).
 * 대조(editor 에게는 입구가 있다)는 이 파일이 따로 두지 않는다 — 하네스의 기본 역할이 owner 라 기존 케이스 전부가 그쪽이다.
 *
 * **두 판으로 돈다** — viewer 로 **새로 연** 화면과, editor 로 열어 둔 화면을 **실행 중에 내린** 화면(서버의
 * `membership-changed` → 셸이 다시 읽는다). 뒤의 판은 받는 쪽이 `canEdit`을 **처음 값으로 굳히는** 부류를 잡는다 — 새로 연 판은
 * 그 부류를 못 본다(처음 값이 곧 viewer 다). 바뀌는 순간 그 자체(잠금 · 통지 · 다시 읽기의 실패)는 `role-live.test.tsx`가 잰다.
 */
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { PageDocument } from '@wirebound/schema'
import type { Comment, ProjectView } from '../../src/api/types'
import { VIEWER_NOTICE } from '../../src/panels/property-panel'
import { openDraftStore } from '../../src/panels/draft-store'
import { openPage, pageDoc, PROJECT_ID, PROJECT_NAME, type EditorOptions, canvasQuery } from '../editor-harness'
import { fakeRealtime, type FakeRealtime } from '../fake-realtime'
import '../../src/catalog-setup'
import { rowReasons, structureRowName } from '../panels/tree-row'

const VIEWER: ProjectView = { id: PROJECT_ID, name: PROJECT_NAME, slug: 'admin-console', description: null, role: 'viewer', themeRev: 0 }
const EDITOR: ProjectView = { ...VIEWER, role: 'editor' }

const DOC: PageDocument = pageDoc({
  id: 'n-root',
  type: 'Page',
  children: [
    { id: 'n-card', type: 'Card', props: { title: '회원 정보' }, marker: 1 },
    {
      id: 'n-btn',
      type: 'Button',
      props: { label: '검색' },
      marker: 2,
      interactions: [{ on: 'click', actions: [{ type: 'setVisible', target: 'n-card', value: false }] }],
    },
  ],
})

/** 하나는 **내 글**이다(하네스의 사용자 `u-1`) — 작성자에게만 서는 «수정»이 역할을 보는지 재려고. */
const COMMENTS: Comment[] = [
  {
    id: 'c-1',
    nodeId: 'n-card',
    body: '카드 문구 확인',
    authorId: 'u-1',
    authorName: '테스터',
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
  },
  {
    id: 'c-2',
    nodeId: 'n-btn',
    body: '버튼 위치',
    authorId: 'u-2',
    authorName: '밥',
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
  },
]

/** 탭 하나의 저장소 — 새로고침은 같은 저장소 위에 새 문서다(`page-meta-conflict.test.tsx`의 것과 같은 작은 판). */
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

/** viewer 가 된 두 길 — 새로 열었다 · 열어 둔 채 내려갔다(머리말). */
const HOWS = ['새로 연 viewer', '실행 중에 내린 viewer'] as const
type How = (typeof HOWS)[number]

/**
 * viewer 의 화면을 연다. `rt`를 주면 그 가짜 연결을 쓰고 열어 둔다(새로 연 판도). **실행 중에 내린 판**은 editor 로 열어
 * 입구가 선 것을 본 뒤 서버가 역할을 바꾸고 `membership-changed`를 보낸다 — 입구가 숨을 때까지 기다린다.
 */
async function openAsViewer(how: How = '새로 연 viewer', options: EditorOptions = {}, rt?: FakeRealtime): Promise<void> {
  if (how === '새로 연 viewer') {
    await openPage(DOC, {
      ...options,
      ...(rt === undefined ? {} : { realtime: rt.realtime }),
      apiOverrides: { getProject: async () => VIEWER, listComments: async () => COMMENTS, ...options.apiOverrides },
    })
    rt?.open()
    return
  }
  const link = rt ?? fakeRealtime(PROJECT_ID, 'u-1')
  let current = EDITOR
  await openPage(DOC, {
    ...options,
    realtime: link.realtime,
    apiOverrides: { getProject: async () => current, listComments: async () => COMMENTS, ...options.apiOverrides },
  })
  link.open()
  await screen.findByRole('button', { name: '회원관리 더 보기' })
  current = VIEWER
  link.deliver({ type: 'membership-changed', projectId: PROJECT_ID })
  // **«내려갔다»의 표지는 셸의 통지다 — 자리가 아니다.** 한 자리(메뉴 트리의 줄 행동)를 표지로 삼으면 그 자리의 변조가 이 판 전부를 죽여
  // 어느 케이스가 무엇을 소유하는지가 흐려진다(줄 행동을 표지로 삼으면 «메뉴 트리가 처음 값» 변조가 이 판의 케이스를 다 죽인다).
  await waitFor(() =>
    expect(screen.queryAllByRole('status').some((el) => (el.textContent ?? '').startsWith('편집 권한이 없어져'))).toBe(true),
  )
}

function pick(nodeId: string): void {
  const el = canvasQuery(`[data-wb-id="${nodeId}"]`)
  if (el === null) throw new Error(`캔버스에 ${nodeId} 가 없다`)
  fireEvent.click(el)
}

function tab(name: string): void {
  fireEvent.click(screen.getByRole('tab', { name }))
}

describe.each(HOWS)('viewer 의 에디터 — 입구가 자리마다 닫힌다 · %s', (how) => {
  /**
   * 혼자 죽는 변조: 셸이 메뉴 트리에 `editable={mode === 'edit'}`를 넘긴다(역할을 안 얹는다). 마지막 줄(메뉴를 눌러 고른다 —
   * 읽기다)도 혼자 죽는 변조가 있다: 메뉴 트리가 `editable`이 아니면 `select`를 무동작으로 둔다(viewer 에게만 고르기가 꺼진다).
   */
  it('메뉴 트리 — 편집 모드에서도 줄 행동(`+` · `…` · 뿌리 `+` — 페이지 JSON 의 가져오기 · 내보내기가 그 안이다)이 없다(숨김). 트리 · 페이지 링크 · 메뉴 고르기는 그대로다', async () => {
    await openAsViewer(how)
    const tree = screen.getByRole('region', { name: '메뉴·페이지 트리' })

    expect(screen.getByRole('button', { name: '편집 모드' }).getAttribute('aria-pressed')).toBe('true')
    expect(tree.querySelectorAll('.wb-shell-tree-row-actions')).toHaveLength(0)
    expect(within(tree).queryByRole('button', { name: '메뉴 트리에 추가' })).toBeNull()
    // 읽기는 남는다 — 메뉴를 가리키고 페이지로 옮겨 간다.
    expect(within(tree).getByRole('button', { name: '회원관리' })).toBeTruthy()
    expect(within(tree).getByRole('link', { name: '회원 목록' })).toBeTruthy()
    // 메뉴를 **눌러 고를 수 있다** — 고르기는 읽기다(선택 표시).
    fireEvent.click(within(tree).getByRole('button', { name: '회원관리' }))
    expect(within(tree).getByRole('button', { name: '회원관리' }).getAttribute('aria-pressed')).toBe('true')
  })

  /**
   * 혼자 죽는 변조: 구조 트리가 줄 행동을 `editable`과 무관하게 그린다. **«모듈로 저장…» 한 항목만 선다** — 내 개인 모듈로 남기는 쓰기라
   * 문서를 안 바꾼다(설계 spec `2026-10-20-personal-modules-design.md` «편집할 수 없는 판의 입구»). 뿌리 줄에는 그것도 없다.
   */
  it('구조 트리 — 노드는 고를 수 있고 줄 행동은 «모듈로 저장…» 하나뿐이다(`+` · 뿌리 `+` 없음 · 뿌리 줄에는 아무것도 없다)', async () => {
    await openAsViewer(how)
    const structure = screen.getByRole('region', { name: '구조 트리' })

    const card = within(structure).getByRole('button', { name: structureRowName('Card') })
    expect((card as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(card)
    expect(card.getAttribute('aria-current')).toBe('true')
    const cardRow = card.closest<HTMLElement>('[data-tree-row]')!
    const rootRow = within(structure)
      .getByRole('button', { name: structureRowName('Page') })
      .closest<HTMLElement>('[data-tree-row]')!
    expect({
      card: rowReasons(structure, cardRow),
      root: rootRow.querySelectorAll('.wb-shell-tree-row-actions').length,
      add: within(structure).queryAllByRole('button', { name: / 추가$/ }).length,
    }).toEqual({ card: { '모듈로 저장…': null }, root: 0, add: 0 })
    expect(within(structure).queryByRole('button', { name: '구조 트리에 추가' })).toBeNull()
  })

  /** 혼자 죽는 변조: 속성 패널의 `blocked`가 역할을 안 본다(잠금만 본다). */
  it('속성 — 값은 보이고 위젯이 꺼지며 이유 한 줄이 선다(꺼짐)', async () => {
    await openAsViewer(how)
    pick('n-card')

    const panel = screen.getByRole('tabpanel')
    const title = within(panel).getByRole('textbox', { name: '제목' }) as HTMLInputElement
    expect(title.value).toBe('회원 정보')
    expect(title.disabled).toBe(true)
    expect(within(panel).getByText(VIEWER_NOTICE)).toBeTruthy()
  })

  /** 혼자 죽는 변조: 상호작용 패널의 `blocked`가 역할을 안 본다. */
  it('상호작용 — 규칙은 보이고 위젯 · 추가 · 삭제가 꺼지며 이유 한 줄이 선다(꺼짐)', async () => {
    await openAsViewer(how)
    pick('n-btn')
    tab('상호작용')

    const panel = screen.getByRole('tabpanel')
    expect((within(panel).getByRole('combobox', { name: '트리거' }) as HTMLSelectElement).disabled).toBe(true)
    expect((within(panel).getByRole('button', { name: '상호작용 추가' }) as HTMLButtonElement).disabled).toBe(true)
    expect((within(panel).getByRole('button', { name: '규칙 1 삭제' }) as HTMLButtonElement).disabled).toBe(true)
    expect(within(panel).getByText(VIEWER_NOTICE)).toBeTruthy()
  })

  /**
   * 혼자 죽는 변조 셋 — 폼의 `canEdit` 가드 · «수정»의 가드 · «삭제»의 가드를 하나씩 지운다(셋 다 이 케이스만 죽는다).
   * 두 모드 다 같다(뷰 모드에서도 코멘트 탭이 있다 — 설계서 「설계서 화면 구조」).
   */
  it('코멘트 — 목록은 읽히고 폼 · 재번호 · 줄마다의 «수정» · «삭제»가 없다(숨김) — 내 글이어도', async () => {
    await openAsViewer(how)
    pick('n-card')

    for (const mode of ['편집 모드', '뷰 모드'] as const) {
      fireEvent.click(screen.getByRole('button', { name: mode }))
      tab('코멘트')
      const panel = screen.getByRole('tabpanel')
      expect(await within(panel).findByText('카드 문구 확인')).toBeTruthy()
      expect(within(panel).getByText('버튼 위치')).toBeTruthy()
      expect(within(panel).queryByRole('textbox', { name: '새 코멘트' }), mode).toBeNull()
      expect(within(panel).queryByRole('button', { name: '코멘트 달기' }), mode).toBeNull()
      expect(within(panel).queryByRole('button', { name: '문서 순서대로 재번호' }), mode).toBeNull()
      expect(within(panel).queryByRole('button', { name: '수정' }), mode).toBeNull()
      expect(within(panel).queryByRole('button', { name: '삭제' }), mode).toBeNull()
    }
  })

  /**
   * 혼자 죽는 변조: 셸이 되돌리기를 `mode === 'edit'`만 보고 그린다. **이 자리는 요청 자가 못 본다** — viewer 에게는
   * 되돌릴 이력이 없어 두 단추가 늘 꺼져 있고, 꺼진 단추는 요청을 안 낸다.
   */
  it('되돌리기 — 편집 모드에서도 «편집 이력» 묶음이 없다(숨김)', async () => {
    await openAsViewer(how)
    expect(screen.getByRole('button', { name: '편집 모드' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.queryByRole('group', { name: '편집 이력' })).toBeNull()
    expect(screen.queryByRole('button', { name: '되돌리기' })).toBeNull()
  })

  /** 혼자 죽는 변조: `useNodeLock`이 `canHold`를 안 본다. */
  it('잠금 — 노드를 골라도 `lock` 프레임을 안 보낸다', async () => {
    const rt = fakeRealtime(PROJECT_ID, 'u-1')
    await openAsViewer(how, {}, rt)

    pick('n-card')
    pick('n-btn')
    await waitFor(() => expect(screen.getByRole('tabpanel').textContent).toContain('Button'))

    // 고르기는 된다(읽기) — 그 사이에 나간 프레임은 하트비트뿐이다(내린 판도 editor 때 잡은 자리가 없다 — 루트는 잡지 않는다).
    expect(rt.frames()).toEqual([])
  })
})

describe('viewer 의 에디터 — 새로고침에 되살아나는 칸', () => {
  /**
   * **강등 → 새로고침 — 되살린 수정 상자.** editor 때 제 글의 «수정»을 눌러 고치던 글이 저장소에 남은 채(`comments/editing-id`
   * · `comments/edit-draft`) viewer 로 다시 연다. viewer 에게는 **서버의 원문**이 보이고 상자가 없다. 그리고 **칸은 안 지운다** —
   * 다시 editor 로 열면 고치던 글이 돌아온다.
   *
   * 혼자 죽는 변조: 목록 줄의 갈래가 역할을 안 본다(`editing === comment.id` → `editingId === comment.id`, `saveEdit`의 가드는
   * 남김 — 상자는 서되 요청은 안 나가 `viewer-readonly-restored.test.tsx`의 «저장소에 editor 때의 초안 칸 다섯을 둔 채 …»는 산다). 셋째
   * 단언(돌아온다)은 viewer 가 칸을 비우는 변조에서 이 케이스만 죽는다. 둘을 함께 되돌리면(`editing = editingId`) 그
   * 케이스와 함께 죽는다 —
   * **요청** 축은 그쪽이 소유한다.
   */
  it('코멘트 — 강등 뒤 새로고침에 되살린 수정 상자가 viewer 에게 안 서고 본문이 보인다. 다시 editor 면 고치던 글이 돌아온다', async () => {
    const session = new MemoryStorage()
    const shared = new MemoryStorage()
    const withStore = {
      draftStore: openDraftStore(
        () => session,
        () => shared,
      ),
    }
    const editing = (): HTMLTextAreaElement | null =>
      within(screen.getByRole('tabpanel')).queryByRole('textbox', { name: '코멘트 수정' }) as HTMLTextAreaElement | null

    // editor 때 — 제 글을 고치기 시작한다.
    await openPage(DOC, { ...withStore, apiOverrides: { getProject: async () => EDITOR, listComments: async () => COMMENTS } })
    pick('n-card')
    tab('코멘트')
    fireEvent.click(await within(screen.getByRole('tabpanel')).findByRole('button', { name: '수정' }))
    fireEvent.change(editing()!, { target: { value: '강등 전에 고치던 글' } })
    cleanup()

    // 강등 뒤 새로고침 — 같은 저장소 위에 새 문서.
    await openAsViewer('새로 연 viewer', {
      draftStore: openDraftStore(
        () => session,
        () => shared,
      ),
    })
    pick('n-card')
    tab('코멘트')
    const panel = screen.getByRole('tabpanel')
    expect(await within(panel).findByText('카드 문구 확인')).toBeTruthy()
    expect(editing()).toBeNull()
    expect(within(panel).queryByRole('button', { name: '저장' })).toBeNull()
    expect(within(panel).queryByRole('button', { name: '취소' })).toBeNull()
    cleanup()

    // 다시 editor — 고치던 글이 돌아온다.
    await openPage(DOC, {
      draftStore: openDraftStore(
        () => session,
        () => shared,
      ),
      apiOverrides: { getProject: async () => EDITOR, listComments: async () => COMMENTS },
    })
    pick('n-card')
    tab('코멘트')
    await waitFor(() => expect(editing()?.value).toBe('강등 전에 고치던 글'))
  })
})
