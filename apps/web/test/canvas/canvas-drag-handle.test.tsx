/**
 * **캔버스 손잡이가 서는 조건**(`src/canvas/canvas-drag-handle.tsx`) — 편집 모드 · `canEdit` · 고른 노드가 뿌리 아님 · 남이 안 잡음. 끌어
 * 옮기기 · 표시 · 좌표는 실브라우저 판(`build-test/canvas-drop.test.ts`)이 잰다 — jsdom 에 레이아웃 · 포인터 캡처가 없다.
 *
 * **`vi.mock`은 이 파일에 있어야 한다** — 호이스팅이 그것이 적힌 파일에서만 일어난다(`editor-harness.tsx` 머리말).
 */
import { act, fireEvent, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectRole, ProjectView } from '../../src/api/types'
import { EditorStore } from '../../src/store/editor-store'
import { PAGE_ID, PROJECT_ID, PROJECT_NAME, openPage, pageDoc, requireNode } from '../editor-harness'

const createdStores: EditorStore[] = []

vi.mock('../../src/store/editor-store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/store/editor-store')>()
  return {
    ...actual,
    EditorStore: class extends actual.EditorStore {
      constructor() {
        super()
        createdStores.push(this)
      }
    },
  }
})

function shellStore(): EditorStore {
  const store = createdStores.at(-1)
  if (store === undefined) throw new Error('셸이 EditorStore를 만들지 않았습니다')
  return store as EditorStore
}

beforeEach(() => {
  createdStores.length = 0
})

const DOC = pageDoc({
  id: 'n-root',
  type: 'Page',
  children: [
    { id: 'n-text', type: 'Text', props: { content: '글' } },
    { id: 'n-box', type: 'Card', children: [] },
  ],
})

function project(role: ProjectRole): ProjectView {
  return { id: PROJECT_ID, name: PROJECT_NAME, slug: 'admin-console', description: '', role, themeRev: 0 }
}

async function open(role: ProjectRole = 'owner'): Promise<void> {
  await openPage(DOC, { apiOverrides: { getProject: async () => project(role) } })
}

const handle = (name: string) => screen.queryByRole('button', { name: `${name} 옮기기` })

describe('손잡이가 서는 조건', () => {
  it('편집 모드 · 편집할 수 있는 사람이 뿌리 아닌 노드를 고르면 선다 — 이름은 «<타입> 옮기기»', async () => {
    await open('editor')
    expect(handle('Text')).toBeNull()
    fireEvent.click(requireNode('n-text'))
    expect(handle('Text')).not.toBeNull()
    fireEvent.click(requireNode('n-box'))
    expect({ text: handle('Text'), card: handle('Card') !== null }).toEqual({ text: null, card: true })
  })

  it('뿌리를 고르면 없다', async () => {
    await open()
    fireEvent.click(requireNode('n-root'))
    expect(shellStore().getState().selectedNodeId).toBe('n-root')
    expect(handle('Page')).toBeNull()
  })

  it('뷰 모드면 없다 · 편집 모드로 돌아오면 다시 선다', async () => {
    await open()
    fireEvent.click(requireNode('n-text'))
    fireEvent.click(screen.getByRole('button', { name: '뷰 모드' }))
    expect(handle('Text')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '편집 모드' }))
    expect(handle('Text')).not.toBeNull()
  })

  it('viewer 에게는 없다 — 고를 수는 있다', async () => {
    await open('viewer')
    fireEvent.click(requireNode('n-text'))
    expect(shellStore().getState().selectedNodeId).toBe('n-text')
    expect(handle('Text')).toBeNull()
  })

  it('고른 뒤 남이 그 노드를 잡으면 걷힌다 · 놓으면 다시 선다', async () => {
    await open()
    fireEvent.click(requireNode('n-text'))
    act(() => shellStore().setLocks([{ pageId: PAGE_ID, nodeId: 'n-text', userId: 'u-bora', userName: '보라' }]))
    expect(handle('Text')).toBeNull()
    act(() => shellStore().setLocks([]))
    expect(handle('Text')).not.toBeNull()
  })

  it('손잡이를 눌러도 고른 것이 풀리지 않는다 — 캔버스 표면의 «빈 자리 누름» 으로 새지 않는다', async () => {
    await open()
    fireEvent.click(requireNode('n-text'))
    fireEvent.click(handle('Text')!)
    expect(shellStore().getState().selectedNodeId).toBe('n-text')
  })
})
