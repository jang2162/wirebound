/**
 * 그림 컨트롤(`image` — `panels/controls/image-control.tsx`). 자리표시자의 그림 칸.
 *
 * 올리기와 편집은 따로다 — 올리는 동안 «올리는 중 …%» 와 «취소», 끝나면 그 순간의 판으로 `image` 하나를 바꾸는 편집을 낸다. 편집 자리는 누른 때의
 * 노드다. 실패는 칸 밑 한 줄(서버 문장 · 끊김은 «다시 시도»). 칸에 붙여 넣은 파일은 노드 붙이기가 아니라 올리기다. 칸 밖(패널)에 놓인 파일은 버린다.
 *
 * **jsdom 값이다** — OS 파일 놓기 · 붙여넣기는 이벤트 흉내(`dataTransfer` · `clipboardData`)로 세운다. 실브라우저 판은
 * `build-test/image-control.test.ts`.
 */
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ApiError, type ApiClient } from '../../src/api/client'
import type { AssetInfo, PatchResult } from '../../src/api/types'
import { IMAGE_MESSAGES } from '../../src/panels/controls/image-control'
import { openPage, pageDoc } from '../editor-harness'
import '../../src/catalog-setup'
import { structureRowName } from './tree-row'

const OLD = '1'.repeat(64)
const NEW = '2'.repeat(64)

const DOC = pageDoc({
  id: 'n-root',
  type: 'Page',
  children: [
    { id: 'n-empty', type: 'Placeholder', props: { label: '빈 칸' } },
    { id: 'n-set', type: 'Placeholder', props: { label: '배너', image: OLD } },
  ],
})

const info = (id: string, name: string): AssetInfo => ({
  id,
  name,
  mime: 'image/png',
  size: 2048,
  width: 120,
  height: 80,
  createdAt: '2026-10-24T00:00:00.000Z',
})

function panel(): HTMLElement {
  return screen.getByRole('complementary', { name: '우측 패널' })
}

function selectAt(index: number): void {
  const buttons = within(screen.getByRole('region', { name: '구조 트리' })).getAllByRole('button', {
    name: structureRowName('Placeholder'),
  })
  fireEvent.click(buttons[index]!)
}

function field(): HTMLElement {
  return within(panel()).getByRole('group', { name: '그림' })
}

function button(name: string): HTMLButtonElement {
  return within(field()).getByRole('button', { name }) as HTMLButtonElement
}

interface Upload {
  file: Blob
  name: string
  progress: (loaded: number, total: number) => void
  signal: AbortSignal | undefined
  resolve: (asset: AssetInfo) => void
  reject: (error: unknown) => void
}

function editable() {
  const calls: { ops: unknown }[] = []
  const uploads: Upload[] = []
  let seq = 7
  const patchOps: ApiClient['patchOps'] = async (_projectId, _pageId, body) => {
    calls.push({ ops: body.ops })
    seq += 1
    const result: PatchResult = {
      seq,
      revisionId: `rev-${seq}`,
      inverse: [],
      schemaVersion: 1,
      ...(body.clientOpId === undefined ? {} : { clientOpId: body.clientOpId }),
    }
    return result
  }
  const uploadAsset: ApiClient['uploadAsset'] = (_projectId, file, name, options) =>
    new Promise((resolve, reject) => {
      uploads.push({ file, name, progress: options?.onProgress ?? (() => {}), signal: options?.signal, resolve, reject })
      options?.signal?.addEventListener('abort', () => reject(new ApiError(0, 'internal', '취소했습니다')))
    })
  const listAssets: ApiClient['listAssets'] = async () => ({
    assets: [info(OLD, 'old.png'), info(NEW, 'new.png')],
    usedBytes: 4096,
    limitBytes: 200 * 1024 * 1024,
    fileLimitBytes: 5 * 1024 * 1024,
  })
  return { calls, uploads, api: { patchOps, uploadAsset, listAssets } satisfies Partial<ApiClient> }
}

const png = (name = 'shot.png') => new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], name, { type: 'image/png' })

function pick(file: File): void {
  const input = within(field()).getByLabelText('그림 파일') as HTMLInputElement
  Object.defineProperty(input, 'files', { value: [file], configurable: true })
  fireEvent.change(input)
}

describe('속성 패널 — 그림 컨트롤', () => {
  it('고르면 올리는 동안 진행을 말하고, 끝나면 image 하나를 바꾸는 편집 하나', async () => {
    const { calls, uploads, api } = editable()
    await openPage(DOC, { apiOverrides: api })
    selectAt(0)
    pick(png())
    await waitFor(() => expect(uploads).toHaveLength(1))
    expect(uploads[0]!.name).toBe('shot.png')
    act(() => uploads[0]!.progress(50, 100))
    expect(within(field()).getByRole('status').textContent).toContain('올리는 중 50%')
    expect(calls).toHaveLength(0)
    await act(async () => uploads[0]!.resolve(info(NEW, 'shot.png')))
    await waitFor(() => expect(calls).toHaveLength(1))
    expect(calls[0]!.ops).toEqual([{ op: 'add', path: '/root/children/0/props/image', value: NEW }])
  })

  it('올리는 사이 다른 노드를 골라도 처음 노드에 낸다', async () => {
    const { calls, uploads, api } = editable()
    await openPage(DOC, { apiOverrides: api })
    selectAt(0)
    pick(png())
    await waitFor(() => expect(uploads).toHaveLength(1))
    selectAt(1)
    await act(async () => uploads[0]!.resolve(info(NEW, 'shot.png')))
    await waitFor(() => expect(calls).toHaveLength(1))
    expect(calls[0]!.ops).toEqual([{ op: 'add', path: '/root/children/0/props/image', value: NEW }])
  })

  it('«취소» 는 올리기를 끊고 아무것도 말하지 않는다 · 편집 0', async () => {
    const { calls, uploads, api } = editable()
    await openPage(DOC, { apiOverrides: api })
    selectAt(0)
    pick(png())
    await waitFor(() => expect(uploads).toHaveLength(1))
    fireEvent.click(within(within(field()).getByRole('status')).getByRole('button', { name: '취소' }))
    await act(async () => {})
    expect(uploads[0]!.signal?.aborted).toBe(true)
    expect(within(field()).queryByRole('alert')).toBeNull()
    expect(calls).toHaveLength(0)
  })

  it('서버의 거절은 그 문장을 칸 밑에 · 끊김은 «다시 시도» 가 같은 파일을 다시 올린다', async () => {
    const { calls, uploads, api } = editable()
    await openPage(DOC, { apiOverrides: api })
    selectAt(0)
    pick(png())
    await waitFor(() => expect(uploads).toHaveLength(1))
    await act(async () => uploads[0]!.reject(new ApiError(413, 'too-large', '그림은 5 MB 까지 올릴 수 있습니다(이 파일 7.2 MB)')))
    expect(within(field()).getByRole('alert').textContent).toBe('그림은 5 MB 까지 올릴 수 있습니다(이 파일 7.2 MB)')
    pick(png('again.png'))
    await waitFor(() => expect(uploads).toHaveLength(2))
    await act(async () => uploads[1]!.reject(new ApiError(0, 'internal', 'Failed to fetch')))
    expect(within(field()).getByRole('alert').textContent).toContain(IMAGE_MESSAGES.unreachable)
    fireEvent.click(button('다시 시도'))
    await waitFor(() => expect(uploads).toHaveLength(3))
    expect((uploads[2]!.file as File).name).toBe('again.png')
    expect(calls).toHaveLength(0)
  })

  it('그림이 아닌 파일은 올리지 않고 꼴을 말한다', async () => {
    const { uploads, api } = editable()
    await openPage(DOC, { apiOverrides: api })
    selectAt(0)
    pick(new File(['글'], 'note.txt', { type: 'text/plain' }))
    expect(within(field()).getByRole('alert').textContent).toBe(IMAGE_MESSAGES.notImage)
    expect(uploads).toHaveLength(0)
  })

  it('칸에 붙여 넣은 그림 파일은 올리기다 — 노드 붙이기가 아니다(편집은 image 하나)', async () => {
    const { calls, uploads, api } = editable()
    await openPage(DOC, { apiOverrides: api })
    selectAt(0)
    const event = new Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'clipboardData', { value: { files: [png('clip.png')], getData: () => '', setData: () => {} } })
    button('그림 고르기…').dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    await waitFor(() => expect(uploads).toHaveLength(1))
    await act(async () => uploads[0]!.resolve(info(NEW, 'clip.png')))
    await waitFor(() => expect(calls).toHaveLength(1))
    expect(calls[0]!.ops).toEqual([{ op: 'add', path: '/root/children/0/props/image', value: NEW }])
  })

  it('칸에 놓은 파일은 올리고, 패널의 다른 자리에 놓은 파일은 버린다(브라우저가 열지 않게)', async () => {
    const { uploads, api } = editable()
    await openPage(DOC, { apiOverrides: api })
    selectAt(0)
    const drop = (target: Element, type: 'dragover' | 'drop') => {
      const event = new Event(type, { bubbles: true, cancelable: true })
      Object.defineProperty(event, 'dataTransfer', { value: { types: ['Files'], files: [png('drop.png')], dropEffect: 'none' } })
      target.dispatchEvent(event)
      return event.defaultPrevented
    }
    const elsewhere = within(panel()).getByRole('textbox', { name: /라벨/ })
    expect([drop(elsewhere, 'dragover'), drop(elsewhere, 'drop')]).toEqual([true, true])
    expect(uploads).toHaveLength(0)
    expect(drop(field(), 'drop')).toBe(true)
    await waitFor(() => expect(uploads).toHaveLength(1))
    expect((uploads[0]!.file as File).name).toBe('drop.png')
  })

  it('«올린 그림에서» 고르면 곧바로 그 id 로 · «지우기» 는 prop 을 지운다', async () => {
    const { calls, api } = editable()
    await openPage(DOC, { apiOverrides: api })
    selectAt(1)
    await waitFor(() => expect(within(field()).getByText(/old\.png/)).not.toBeNull())
    fireEvent.click(button('올린 그림에서'))
    const option = await within(field()).findByRole('option', { name: 'new.png' })
    fireEvent.click(option)
    await waitFor(() => expect(calls).toHaveLength(1))
    expect(calls[0]!.ops).toEqual([{ op: 'replace', path: '/root/children/1/props/image', value: NEW }])
    fireEvent.click(button('지우기'))
    await waitFor(() => expect(calls).toHaveLength(2))
    expect(calls[1]!.ops).toEqual([{ op: 'remove', path: '/root/children/1/props/image' }])
  })
})
