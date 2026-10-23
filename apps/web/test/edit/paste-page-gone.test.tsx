/**
 * **붙이는 사이 열린 페이지가 사라졌다**(L-050) — 페이지 대상이 든 봉투는 붙이기 전에 페이지 목록을 읽는다(`shell/editor-keys.tsx` 의 `paste`). 읽는 사이
 * 판을 비우면(`clearPage`) 붙이지 않고 말한다. 복원이 그 페이지를 지워 다시 읽은 목록에 이 페이지가 없으면 «옮겼다» 가 아니라 «없어졌다» 다.
 * jsdom 값이다 — 말하는 문장만 잰다(판을 비우는 길 자체는 `build-test/editor-shortcuts-review-2.test.ts` 가 Chrome 으로 잰다).
 */
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { CURRENT_DOCUMENT_VERSION, writeNodesEnvelope, type WbNode } from '@wirebound/schema'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TreeMenuNode } from '../../src/api/types'
import { PASTE_GONE_NOTICE, PASTE_LEFT_NOTICE } from '../../src/edit/paste-ops'
import type { EditorStore } from '../../src/store/editor-store'
import { PAGE_ID, openPage, pageDoc } from '../editor-harness'
import '../../src/catalog-setup'

const { createdStores } = vi.hoisted(() => ({ createdStores: [] as unknown[] }))

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

beforeEach(() => {
  createdStores.length = 0
})
afterEach(cleanup)

const doc = () => pageDoc({ id: 'n-root', type: 'Page', children: [{ id: 'n-a', type: 'Text', props: { content: '글' } }] })

/** 페이지 대상(`navigate`)이 든 봉투 — 붙이기가 페이지 목록을 읽게 한다. */
const GO: WbNode = {
  id: 'src-go',
  type: 'Button',
  interactions: [{ on: 'click', actions: [{ type: 'navigate', target: 'page:회원관리/회원 상세' }] }],
}

function paste(text: string): void {
  const event = new Event('paste', { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'clipboardData', { value: { getData: () => text, setData: () => {} } })
  document.body.dispatchEvent(event)
}

const stillThere: TreeMenuNode[] = [
  { id: 'mn-1', title: '회원관리', sortOrder: 1, pages: [{ id: PAGE_ID, title: '회원 목록', sortOrder: 1 }], children: [] },
]
const gone: TreeMenuNode[] = [{ id: 'mn-1', title: '회원관리', sortOrder: 1, pages: [], children: [] }]

async function pasteWhileTreeIsRead(answer: TreeMenuNode[]): Promise<string[]> {
  let release: (menu: TreeMenuNode[]) => void = () => {}
  const held = new Promise<TreeMenuNode[]>((resolve) => {
    release = resolve
  })
  await openPage(doc(), { apiOverrides: { getTree: async () => await held } })
  const store = createdStores.at(-1) as EditorStore
  paste(writeNodesEnvelope([GO], CURRENT_DOCUMENT_VERSION))
  // 읽는 사이 복원이 판을 비운다(`clearPage({ restoreReread: true })`) 다음 목록이 답한다.
  act(() => {
    store.clearPage({ restoreReread: true })
  })
  await act(async () => {
    release(answer)
    await held
  })
  await waitFor(() => expect(screen.queryAllByRole('alert').length).toBeGreaterThan(0))
  return screen.queryAllByRole('alert').map((element) => element.textContent ?? '')
}

describe('붙이는 사이 판을 비웠다 — 문장이 까닭을 가른다', () => {
  it('다시 읽은 목록에 이 페이지가 없으면 «없어졌다»', async () => {
    expect(await pasteWhileTreeIsRead(gone)).toEqual([PASTE_GONE_NOTICE])
  })

  it('목록에 이 페이지가 있으면 «옮겼다»(떠났다 돌아온 판의 문장 그대로)', async () => {
    expect(await pasteWhileTreeIsRead(stillThere)).toEqual([PASTE_LEFT_NOTICE])
  })
})
