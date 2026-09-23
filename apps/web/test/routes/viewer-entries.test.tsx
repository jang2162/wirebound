/**
 * **viewer 의 에디터 — 자리마다 입구가 숨었나 · 꺼졌나**(이월 M′ · 셸 `canEdit`의 표).
 *
 * 전량은 `./viewer-readonly.test.tsx`가 잰다 — 닿는 컨트롤을 전부 누르고 키를 보내 **쓰기 요청 0**을 센다. 이 파일은
 * 그 자가 못 말하는 것을 잰다: **어느 자리가 어느 관례로 닫혔나**(숨김 / 꺼짐 + 이유)와, 그 자가 요청으로는 못 보는 것
 * (꺼져 있어 누를 수 없는 «되돌리기» — 요청이 안 나가므로 그 자는 안 죽는다).
 *
 * **키보드 축은 이 파일에 없다** — 두 트리의 단축키는 그 자의 키 훑기가 소유한다(단축키를 지운 변조가 거기서만 죽는다).
 * 대조(editor 에게는 입구가 있다)는 이 파일이 따로 두지 않는다 — 하네스의 기본 역할이 owner 라 기존 케이스 전부가 그쪽이다.
 */
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { PageDocument } from '@wirebound/schema'
import type { Comment, ProjectDetail } from '../../src/api/types'
import type { RealtimeSocket } from '../../src/realtime/connection'
import { createConnectionIdHolder, type RealtimeSetup } from '../../src/realtime/context'
import { createEditChannel } from '../../src/realtime/edit-channel'
import { createLockChannel } from '../../src/realtime/lock-channel'
import { VIEWER_NOTICE } from '../../src/panels/property-panel'
import { openPage, pageDoc, PROJECT_ID, PROJECT_NAME, type EditorOptions } from '../editor-harness'
import '../../src/catalog-setup'

const VIEWER: ProjectDetail = { id: PROJECT_ID, name: PROJECT_NAME, slug: 'admin-console', description: null, role: 'viewer' }

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
  { id: 'c-1', nodeId: 'n-card', body: '카드 문구 확인', authorId: 'u-1', authorName: '테스터', createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z' },
  { id: 'c-2', nodeId: 'n-btn', body: '버튼 위치', authorId: 'u-2', authorName: '밥', createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z' },
]

async function openAsViewer(options: EditorOptions = {}): Promise<void> {
  await openPage(DOC, {
    ...options,
    apiOverrides: { getProject: async () => VIEWER, listComments: async () => COMMENTS, ...options.apiOverrides },
  })
}

function pick(nodeId: string): void {
  const el = document.body.querySelector(`.wb-shell-canvas [data-wb-id="${nodeId}"]`)
  if (el === null) throw new Error(`캔버스에 ${nodeId} 가 없다`)
  fireEvent.click(el)
}

function tab(name: string): void {
  fireEvent.click(screen.getByRole('tab', { name }))
}

describe('viewer 의 에디터 — 입구가 자리마다 닫힌다(이월 M′)', () => {
  /** 혼자 죽는 변조: 셸이 메뉴 트리에 `editable={mode === 'edit'}`를 넘긴다(역할을 안 얹는다). */
  it('메뉴 트리 — 편집 모드에서도 «메뉴 편집» 툴바 · «페이지 JSON»이 없다(숨김). 트리와 페이지 링크는 그대로다', async () => {
    await openAsViewer()
    const tree = screen.getByRole('region', { name: '메뉴·페이지 트리' })

    expect(screen.getByRole('button', { name: '편집 모드' }).getAttribute('aria-pressed')).toBe('true')
    expect(within(tree).queryByRole('group', { name: '메뉴 편집' })).toBeNull()
    expect(within(tree).queryByRole('button', { name: /페이지 JSON/ })).toBeNull()
    // 읽기는 남는다 — 메뉴를 가리키고 페이지로 옮겨 간다.
    expect(within(tree).getByRole('button', { name: '회원관리' })).toBeTruthy()
    expect(within(tree).getByRole('link', { name: '회원 목록' })).toBeTruthy()
  })

  /** 혼자 죽는 변조: 구조 트리가 툴바를 `editable`과 무관하게 그린다. */
  it('구조 트리 — 노드는 고를 수 있고 «구조 편집» 툴바가 없다(숨김)', async () => {
    await openAsViewer()
    const structure = screen.getByRole('region', { name: '구조 트리' })

    const card = within(structure).getByRole('button', { name: 'Card' })
    expect((card as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(card)
    expect(card.getAttribute('aria-current')).toBe('true')
    expect(within(structure).queryByRole('group', { name: '구조 편집' })).toBeNull()
    expect(within(structure).queryByRole('button', { name: '프리셋' })).toBeNull()
  })

  /** 혼자 죽는 변조: 속성 패널의 `blocked`가 역할을 안 본다(잠금만 본다). */
  it('속성 — 값은 보이고 위젯이 꺼지며 이유 한 줄이 선다(꺼짐)', async () => {
    await openAsViewer()
    pick('n-card')

    const panel = screen.getByRole('tabpanel')
    const title = within(panel).getByRole('textbox', { name: '제목' }) as HTMLInputElement
    expect(title.value).toBe('회원 정보')
    expect(title.disabled).toBe(true)
    expect(within(panel).getByText(VIEWER_NOTICE)).toBeTruthy()
  })

  /** 혼자 죽는 변조: 상호작용 패널의 `blocked`가 역할을 안 본다. */
  it('상호작용 — 규칙은 보이고 위젯 · 추가 · 삭제가 꺼지며 이유 한 줄이 선다(꺼짐)', async () => {
    await openAsViewer()
    pick('n-btn')
    tab('상호작용')

    const panel = screen.getByRole('tabpanel')
    expect((within(panel).getByRole('combobox', { name: '트리거' }) as HTMLSelectElement).disabled).toBe(true)
    expect((within(panel).getByRole('button', { name: '상호작용 추가' }) as HTMLButtonElement).disabled).toBe(true)
    expect((within(panel).getByRole('button', { name: '규칙 1 삭제' }) as HTMLButtonElement).disabled).toBe(true)
    expect(within(panel).getByText(VIEWER_NOTICE)).toBeTruthy()
  })

  /**
   * 혼자 죽는 변조 셋 — 폼의 `canEdit` 가드 · «수정»의 가드 · «삭제»의 가드를 하나씩 지운다(셋 다 이 케이스만 죽는다 —
   * 보고서 (f)). 두 모드 다 같다(뷰 모드에서도 코멘트 탭이 있다 — §9).
   */
  it('코멘트 — 목록은 읽히고 폼 · 재번호 · 줄마다의 «수정» · «삭제»가 없다(숨김) — 내 글이어도', async () => {
    await openAsViewer()
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
    await openAsViewer()
    expect(screen.getByRole('button', { name: '편집 모드' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.queryByRole('group', { name: '편집 이력' })).toBeNull()
    expect(screen.queryByRole('button', { name: '되돌리기' })).toBeNull()
  })

  /** 혼자 죽는 변조: `useNodeLock`이 `canHold`를 안 본다. */
  it('잠금 — 노드를 골라도 `lock` 프레임을 안 보낸다', async () => {
    const sent: string[] = []
    const sockets: RealtimeSocket[] = []
    const realtime: RealtimeSetup = {
      holder: createConnectionIdHolder(),
      channel: createEditChannel(),
      lockChannel: createLockChannel(),
      origin: 'http://localhost:5173',
      connection: {
        createSocket: () => {
          const socket: RealtimeSocket = {
            onopen: null,
            onmessage: null,
            onclose: null,
            onerror: null,
            send: (data: string) => {
              sent.push(data)
            },
            close: () => {},
          }
          sockets.push(socket)
          return socket
        },
        schedule: () => 0,
        cancel: () => {},
      },
    }
    await openAsViewer({ realtime })
    act(() => {
      sockets.at(-1)?.onopen?.()
    })

    pick('n-card')
    pick('n-btn')
    await waitFor(() => expect(screen.getByRole('tabpanel').textContent).toContain('Button'))

    // 고르기는 된다(읽기) — 그 사이에 나간 프레임은 하트비트뿐이다.
    expect(sent.map((raw) => (JSON.parse(raw) as { type: string }).type).filter((type) => type !== 'ping')).toEqual([])
  })
})
