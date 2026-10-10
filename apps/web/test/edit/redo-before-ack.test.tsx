/**
 * **되돌림의 ack 가 닿기 전에 누른 «다시 실행» 키는 이유를 말한다**(장부 L-089) — 다시 실행 스택은 되돌림의 ack 가 채워서(`EditorStore.ackEdit`)
 * 그 전에는 `canRedo` 가 거짓이고, 키는 말없이 버려졌다. 머리 단추는 꺼져 있어 그것이 말이다.
 *
 * 판: 서버가 되돌림(두 번째 요청)의 답을 쥔다 — 키를 누른 때 되돌림은 큐에 있다. 답을 풀면 단추가 켜지고 같은 키가 다시 실행한다.
 * 이것은 jsdom 값이다(키 → 통지는 포커스 · 좌표를 안 쓴다) — 실브라우저 값은 `build-test/editor-undo-before-ack.test.ts` 의 «다시 실행».
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { applyOps, invertOps, type PatchOp } from '@wirebound/schema'
import type { ApiClient } from '../../src/api/client'
import type { PatchResult } from '../../src/api/types'
import { REDO_BEFORE_ACK_NOTICE } from '../../src/shell/editor-keys'
import { HEAD_SEQ, openPage, pageDetail, pageDoc } from '../editor-harness'
import '../../src/catalog-setup'
import { structureRowName } from '../panels/tree-row'

function doc(): ReturnType<typeof pageDoc> {
  return pageDoc({
    id: 'n-root',
    type: 'Page',
    children: [
      { id: 'n-a', type: 'Text', props: { content: '글' } },
      { id: 'n-box', type: 'Card' },
    ],
  })
}

/** 둘째 요청(되돌림)의 답만 쥐는 서버 — `release()` 로 푼다. */
function server() {
  const calls: PatchOp[][] = []
  let seq = HEAD_SEQ
  let held = doc()
  let release: () => void = () => undefined
  const gate = new Promise<void>((resolve) => (release = resolve))
  const patchOps: ApiClient['patchOps'] = async (_projectId, _pageId, body) => {
    calls.push(body.ops)
    if (calls.length === 2) await gate
    const inverse = invertOps(held, body.ops)
    held = applyOps(held, body.ops)
    seq += 1
    const result: PatchResult = { seq, revisionId: `rev-${seq}`, inverse, schemaVersion: 1, ...(body.clientOpId === undefined ? {} : { clientOpId: body.clientOpId }) }
    return result
  }
  const getPage: ApiClient['getPage'] = async (_projectId, pageId) => ({ ...pageDetail(pageId, held), headSeq: seq })
  return { calls, release: () => release(), api: { patchOps, getPage } satisfies Partial<ApiClient> }
}

const history = (name: '되돌리기' | '다시 실행') => within(screen.getByRole('group', { name: '편집 이력' })).getByRole<HTMLButtonElement>('button', { name })
const redoKey = (): boolean => fireEvent.keyDown(document.body, { key: 'Z', code: 'KeyZ', ctrlKey: true, shiftKey: true })

describe('다시 실행 키 — 되돌림의 ack 전', () => {
  it('되돌림이 큐에 있는 동안 누르면 이유를 말하고 아무것도 보내지 않는다 — 답이 닿으면 같은 키가 다시 실행한다', async () => {
    const srv = server()
    await openPage(doc(), { apiOverrides: srv.api })
    fireEvent.click(within(screen.getByRole('region', { name: '구조 트리' })).getByRole('button', { name: structureRowName('Card') }))
    fireEvent.keyDown(document.body, { key: 'ArrowUp', altKey: true })
    await waitFor(() => expect(history('되돌리기').disabled).toBe(false))
    fireEvent.click(history('되돌리기'))
    await waitFor(() => expect(srv.calls).toHaveLength(2))
    expect(history('다시 실행').disabled).toBe(true)

    redoKey()
    expect(screen.getByText(REDO_BEFORE_ACK_NOTICE)).toBeTruthy()
    expect(srv.calls).toHaveLength(2)

    srv.release()
    await waitFor(() => expect(history('다시 실행').disabled).toBe(false))
    redoKey()
    await waitFor(() => expect(srv.calls).toHaveLength(3))
  })

  it('되돌린 것이 없는 판의 다시 실행 키는 말없이 둔다 — 말은 «되돌림이 큐에 있다» 에만 선다', async () => {
    const srv = server()
    await openPage(doc(), { apiOverrides: srv.api })
    redoKey()
    expect(screen.queryByText(REDO_BEFORE_ACK_NOTICE)).toBeNull()
    expect(srv.calls).toHaveLength(0)
  })
})
