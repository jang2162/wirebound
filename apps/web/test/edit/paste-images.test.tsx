/**
 * **다른 프로젝트에서 꺼낸 노드의 그림**(설계 spec `2026-10-24-compose-input-design.md` «10. 그림과 다른 기능의 경계» · `edit/claim-images.ts`) — 봉투가
 * 실은 출처가 이 프로젝트가 아니고 노드가 그림을 들면, 붙이기 편집 **전에** 그 출처에서 가져오고(`claimAssets`) 못 가져온 그림은 비운 뒤 정보 통지로
 * 말한다. 같은 프로젝트 · 출처 없는 옛 봉투 · 그림 없는 노드는 가져오기를 부르지 않는다.
 *
 * 셸(`shell/editor-keys.tsx`)의 클립보드 길을 `<App />` 째 띄워 잰다 — `paste-view-states.test.tsx` 와 같은 하네스다.
 */
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import {
  CURRENT_DOCUMENT_VERSION,
  applyOps,
  invertOps,
  writeNodesEnvelope,
  type PageDocument,
  type PatchOp,
  type WbNode,
} from '@wirebound/schema'
import type { ApiClient } from '../../src/api/client'
import type { AssetClaimResult, AssetSource, PageDetail, PatchResult } from '../../src/api/types'
import { clearedImagesNotice } from '../../src/edit/claim-images'
import { HEAD_SEQ, PROJECT_ID, openPage, pageDetail, pageDoc } from '../editor-harness'
import '../../src/catalog-setup'
import { structureRowName } from '../panels/tree-row'

afterEach(cleanup)

const KEPT = 'a'.repeat(64)
const LOST = 'b'.repeat(64)

/** 그림 둘 — 하나는 몸통 안의 자식(구역 · 몸통을 다 걷는지). */
const nodes: WbNode[] = [
  {
    id: 'ph-1',
    type: 'Placeholder',
    props: { label: '배너', image: KEPT },
    children: [{ id: 'ph-2', type: 'Placeholder', props: { label: '로고', image: LOST } }],
  },
]

function target(): PageDocument {
  return pageDoc({ id: 'n-root', type: 'Page', children: [{ id: 'n-a', type: 'Text', props: { content: '글' } }] })
}

function server(initial: PageDocument, claim: (ids: readonly string[], from: AssetSource) => Promise<AssetClaimResult>) {
  const calls: PatchOp[][] = []
  const claims: { projectId: string; ids: string[]; from: AssetSource; editsBefore: number }[] = []
  let seq = HEAD_SEQ
  let held = initial
  const patchOps: ApiClient['patchOps'] = async (_projectId, _pageId, body) => {
    calls.push(body.ops)
    const inverse = invertOps(held, body.ops)
    held = applyOps(held, body.ops)
    seq += 1
    const result: PatchResult = {
      seq,
      revisionId: `rev-${seq}`,
      inverse,
      schemaVersion: 1,
      ...(body.clientOpId === undefined ? {} : { clientOpId: body.clientOpId }),
    }
    return result
  }
  const getPage: ApiClient['getPage'] = async (_projectId, pageId) => {
    const detail: PageDetail = { ...pageDetail(pageId, held), headSeq: seq }
    return detail
  }
  const claimAssets: ApiClient['claimAssets'] = async (projectId, ids, from) => {
    claims.push({ projectId, ids: [...ids], from, editsBefore: calls.length })
    return claim(ids, from)
  }
  // 붙인 노드가 골라져 그림 칸이 지금 그림의 이름을 읽는다.
  const listAssets: ApiClient['listAssets'] = async () => ({ assets: [], usedBytes: 0, limitBytes: 1, fileLimitBytes: 1 })
  return { calls, claims, api: { patchOps, getPage, claimAssets, listAssets } satisfies Partial<ApiClient> }
}

function clip(text: string): boolean {
  const data = new Map<string, string>([['text/plain', text]])
  const event = new Event('paste', { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'clipboardData', { value: { setData: () => {}, getData: (kind: string) => data.get(kind) ?? '' } })
  document.body.dispatchEvent(event)
  return event.defaultPrevented
}

function infoTexts(): string[] {
  return screen
    .queryAllByRole('status')
    .filter((element) => element.classList.contains('wb-shell-info-notice'))
    .map((element) => element.textContent ?? '')
}

function imagesOf(node: WbNode): (string | undefined)[] {
  const own = (node.props as { image?: string } | undefined)?.image
  return [own, ...(node.children ?? []).flatMap(imagesOf)]
}

describe('다른 프로젝트에서 꺼낸 그림', () => {
  it('붙이기 편집 전에 출처에서 가져오고 · 못 가져온 그림만 비우고 · 정보 통지로 말한다', async () => {
    const srv = server(target(), async (ids) => ({
      claimed: ids.filter((id) => id === KEPT),
      failed: ids.filter((id) => id !== KEPT).map((id) => ({ id, reason: 'not-readable' as const })),
    }))
    await openPage(target(), { apiOverrides: srv.api })
    expect(clip(writeNodesEnvelope(nodes, CURRENT_DOCUMENT_VERSION, undefined, { projectId: 'p-other' }))).toBe(true)
    await waitFor(() => expect(srv.calls).toHaveLength(1))
    expect(srv.claims).toEqual([{ projectId: PROJECT_ID, ids: [KEPT, LOST], from: { projectId: 'p-other' }, editsBefore: 0 }])
    const pasted = (srv.calls[0]![0] as { value: WbNode }).value
    expect(imagesOf(pasted)).toEqual([KEPT, undefined])
    await waitFor(() => expect(infoTexts()).toEqual([clearedImagesNotice(1, 'not-readable')]))
    expect(clearedImagesNotice(1, 'not-readable')).toBe('그림 1개를 가져오지 못해 비웠습니다 — 출처에 들어갈 수 없습니다')
  })

  it('가져오기가 실패하면(끊김) 든 그림을 다 비우고 붙인다 — 깨진 그림을 문서에 남기지 않는다', async () => {
    const srv = server(target(), async () => {
      throw new TypeError('Failed to fetch')
    })
    await openPage(target(), { apiOverrides: srv.api })
    clip(writeNodesEnvelope(nodes, CURRENT_DOCUMENT_VERSION, undefined, { projectId: 'p-other' }))
    await waitFor(() => expect(srv.calls).toHaveLength(1))
    expect(imagesOf((srv.calls[0]![0] as { value: WbNode }).value)).toEqual([undefined, undefined])
    await waitFor(() => expect(infoTexts()).toEqual([clearedImagesNotice(2, 'failed')]))
  })

  it('같은 프로젝트 · 출처 없는 봉투는 가져오기를 부르지 않고 그림을 그대로 붙인다', async () => {
    for (const source of [{ projectId: PROJECT_ID }, undefined]) {
      const srv = server(target(), async () => {
        throw new Error('부르지 않아야 한다')
      })
      await openPage(target(), { apiOverrides: srv.api })
      clip(writeNodesEnvelope(nodes, CURRENT_DOCUMENT_VERSION, undefined, source))
      await waitFor(() => expect(srv.calls).toHaveLength(1))
      expect(srv.claims).toEqual([])
      expect(imagesOf((srv.calls[0]![0] as { value: WbNode }).value)).toEqual([KEPT, LOST])
      cleanup()
    }
  })

  it('복사는 봉투에 이 프로젝트를 출처로 싣는다', async () => {
    const { inspectNodesEnvelope } = await import('@wirebound/schema')
    const doc = pageDoc({ id: 'n-root', type: 'Page', children: nodes })
    await openPage(doc, { apiOverrides: server(doc, async () => ({ claimed: [], failed: [] })).api })
    const rows = within(screen.getByRole('region', { name: '구조 트리' })).getAllByRole('button', { name: structureRowName('Placeholder') })
    fireEvent.click(rows[0]!)
    const data = new Map<string, string>()
    const event = new Event('copy', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'clipboardData', {
      value: { setData: (kind: string, value: string) => data.set(kind, value), getData: (kind: string) => data.get(kind) ?? '' },
    })
    document.body.dispatchEvent(event)
    const read = inspectNodesEnvelope(data.get('text/plain') ?? '')
    expect(read.kind === 'ok' ? read.source : read.kind).toEqual({ projectId: PROJECT_ID })
  })
})
