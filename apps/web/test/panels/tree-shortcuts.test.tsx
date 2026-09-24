/**
 * **두 트리의 단축키가 같은 방향을 뜻하는가.**
 *
 * 좌측에는 트리가 둘 있고(메뉴·페이지 트리와 구조 트리) 각자 자기 `SHORTCUTS` 표를 갖는다 —
 * 조작이 다르므로 표를 합치지 않는 것이 맞다. **다만 같은 키는 같은 방향을 뜻해야 한다.**
 *
 * 두 트리가 표를 따로 가지므로 한쪽은 `←`=들여쓰기, 다른 쪽은 `→`=들여쓰기로 갈리기 쉽다 —
 * 그러면 **한 화면에서 같은 키가 반대 일을 한다**(양쪽이 내는 요청을 보면 드러난다). 같은 키가
 * 반대 일을 하면 외우는 비용이 아니라 **틀리는 비용**이다.
 *
 * **이 결함이 나는 길은 한쪽만 고치는 것이다** — 사람의 `grep`에 맡기지 않고 이 파일이 기계로
 * 지킨다: 두 트리에 **같은 키를 보내 둘 다 깊이가 늘어나는지**를 한 자리에서 본다.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import type { PatchOp } from '@wirebound/schema'
import { ApiProvider } from '../../src/api/context'
import type { MenuNode, PageDetail, TreeMenuNode } from '../../src/api/types'
import { App } from '../../src/app'
import { fakeApi } from '../helpers'
import '../../src/catalog-setup'

function tree(): TreeMenuNode[] {
  return [
    {
      id: 'm-member',
      title: '회원관리',
      sortOrder: 0,
      pages: [{ id: 'pg-list', title: '회원 목록', sortOrder: 0 }],
      children: [
        { id: 'm-auth', title: '권한', sortOrder: 0, pages: [], children: [] },
        { id: 'm-grade', title: '등급', sortOrder: 1, pages: [], children: [] },
      ],
    },
  ]
}

/**
 * 구조 트리가 그릴 문서. `Card` 안에 `Text`가 있고 그 뒤에 `Divider`가 형제로 있다 —
 * **한 노드에서 들여쓰기와 내어쓰기가 둘 다 살아 있어야** 두 방향을 같은 자리에서 잰다.
 */
function page(): PageDetail {
  return {
    id: 'pg-list',
    menuNodeId: 'm-member',
    title: '회원 목록',
    description: null,
    sortOrder: 0,
    schemaVersion: 1,
    headSeq: 1,
    schema: {
      version: 1,
      root: {
        id: 'n_root0000001',
        type: 'Page',
        children: [
          { id: 'n_card00000001', type: 'Card', children: [{ id: 'n_text00000001', type: 'Text' }] },
          { id: 'n_div000000001', type: 'Divider' },
        ],
      },
    },
  }
}

function boot() {
  const updateMenu = vi.fn(async (): Promise<MenuNode> => ({
    id: 'm-grade',
    projectId: 'p-1',
    parentId: 'm-auth',
    title: '등급',
    sortOrder: 0,
  }))
  const patchOps = vi.fn(async () => ({
    seq: 2,
    revisionId: 'r-1',
    inverse: [] as PatchOp[],
    schemaVersion: 1,
  }))

  render(
    <ApiProvider
      client={fakeApi({
        me: async () => ({ id: 'u-1', email: 'a@b.c', name: '테스터' }),
        getProject: async () => ({
          id: 'p-1',
          name: '설계서',
          slug: 's',
          description: null,
          role: 'owner' as const,
        }),
        getTree: async () => tree(),
        getPage: async () => page(),
        listMyRevisions: async () => [],
        updateMenu,
        patchOps,
      })}
    >
      <MemoryRouter initialEntries={['/projects/p-1/pages/pg-list']}>
        <App />
      </MemoryRouter>
    </ApiProvider>,
  )
  return { updateMenu, patchOps }
}

function menuRegion(): HTMLElement {
  return screen.getByRole('region', { name: '메뉴·페이지 트리' })
}
function structureRegion(): HTMLElement {
  return screen.getByRole('region', { name: '구조 트리' })
}
/** 메뉴 트리의 단축키 상자. */
function menuKeys(): HTMLElement {
  const box = menuRegion().querySelector('.wb-shell-tree-keys')
  if (box === null) throw new Error('메뉴 트리의 단축키 상자를 찾지 못했습니다')
  return box as HTMLElement
}
function structureRow(name: string): HTMLElement {
  return within(structureRegion()).getByRole('button', { name })
}

/** 마지막 `patchOps`가 실은 `move` op. 없으면 그 자리에서 던져 케이스가 요란하게 깨진다. */
function lastMove(spy: { mock: { calls: unknown[][] } }): { from: string; path: string } {
  const body = spy.mock.calls.at(-1)?.[2] as { ops?: PatchOp[] } | undefined
  const move = body?.ops?.find((op) => op.op === 'move')
  if (move === undefined || !('from' in move) || !('path' in move)) {
    throw new Error(`move op을 찾지 못했습니다: ${JSON.stringify(body)}`)
  }
  return { from: String(move.from), path: String(move.path) }
}

const INDENT_KEY = { key: 'ArrowRight', altKey: true, shiftKey: true }
const OUTDENT_KEY = { key: 'ArrowLeft', altKey: true, shiftKey: true }

describe('두 트리의 단축키 방향', () => {
  it('Alt+Shift+오른쪽이 양쪽에서 깊이를 늘린다', async () => {
    // **한 화면에서 같은 키를 둘에 보낸다.** 어느 한쪽만 고치면 여기서 죽는다.
    const api = boot()
    await screen.findByText('회원관리')

    // 메뉴 트리: `등급`(앞 형제 `권한`이 있다) → 앞 형제의 자식이 된다.
    fireEvent.click(within(menuRegion()).getByRole('button', { name: '등급' }))
    fireEvent.keyDown(menuKeys(), INDENT_KEY)
    await waitFor(() => expect(api.updateMenu).toHaveBeenCalledTimes(1))
    expect(api.updateMenu).toHaveBeenCalledWith('p-1', 'm-grade', { parentId: 'm-auth' })

    // 구조 트리: `Divider`(앞 형제 `Card`가 자식을 담는다) → `Card` 안으로 들어간다.
    const divider = structureRow('Divider')
    fireEvent.click(divider)
    fireEvent.keyDown(divider, INDENT_KEY)

    await waitFor(() => expect(api.patchOps).toHaveBeenCalledTimes(1))
    // **깊이가 늘어난 것을 경로로 본다** — 목적지가 출발지보다 한 단계 깊다.
    const moved = lastMove(api.patchOps)
    expect(moved.path.split('/').length).toBeGreaterThan(moved.from.split('/').length)
  })

  it('Alt+Shift+왼쪽이 양쪽에서 깊이를 줄인다', async () => {
    const api = boot()
    await screen.findByText('회원관리')

    // 메뉴 트리: `등급`은 `회원관리`의 자식이라 내어쓰면 루트로 나온다.
    fireEvent.click(within(menuRegion()).getByRole('button', { name: '등급' }))
    fireEvent.keyDown(menuKeys(), OUTDENT_KEY)
    await waitFor(() => expect(api.updateMenu).toHaveBeenCalledTimes(1))
    expect(api.updateMenu).toHaveBeenCalledWith('p-1', 'm-grade', { parentId: null, sortOrder: 1 })

    // 구조 트리: `Text`는 `Card` 안이라 내어쓰면 루트로 나온다.
    const text = structureRow('Text')
    fireEvent.click(text)
    fireEvent.keyDown(text, OUTDENT_KEY)

    await waitFor(() => expect(api.patchOps).toHaveBeenCalledTimes(1))
    const moved = lastMove(api.patchOps)
    expect(moved.path.split('/').length).toBeLessThan(moved.from.split('/').length)
  })
})
