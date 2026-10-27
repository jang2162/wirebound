/**
 * 목록 컨트롤의 파일 목록 꼴(`fileList` — `FileAttach.files`). 이름 · 크기 두 칸 줄이고 배열을 통째로 `replace` 한다 — 다른 목록 꼴과 같은 저장 길이다
 * (`panels/controls/list-control.tsx` 머리말). 셋(`stringList` · `pairList` · `optionList`)의 공통 성질은 `./list-control.test.tsx` 가 잰다 — 여기는
 * 파일 꼴이 갈리는 자리(원소 모양 · 칸 이름 · 상한)만 잰다.
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { FileAttachDef, FileEntrySchema, FILES_MAX } from '@wirebound/schema'
import type { ApiClient } from '../../src/api/client'
import type { PatchResult } from '../../src/api/types'
import { openPage, pageDoc } from '../editor-harness'
import '../../src/catalog-setup'
import { structureRowName } from './tree-row'

const file = (name: string, size: string) => ({ name, size })

function docWith(files: unknown): ReturnType<typeof pageDoc> {
  return pageDoc({ id: 'n-root', type: 'Page', children: [{ id: 'n-file', type: 'FileAttach', props: { files } }] })
}

function panel(): HTMLElement {
  return screen.getByRole('complementary', { name: '우측 패널' })
}

function selectFileAttach(): void {
  fireEvent.click(within(screen.getByRole('region', { name: '구조 트리' })).getByRole('button', { name: structureRowName('FileAttach') }))
}

function list(): HTMLElement {
  return within(panel()).getByRole('group', { name: '파일' })
}

function cells(): HTMLInputElement[] {
  return [...list().querySelectorAll<HTMLInputElement>('input')]
}

function editable(): { calls: { ops: unknown }[]; api: Partial<ApiClient> } {
  const calls: { ops: unknown }[] = []
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
  return { calls, api: { patchOps } }
}

const PATH = '/root/children/0/props/files'

/**
 * 스키마의 글 한도 — zod `.max()` 를 그 정의에서 읽는다(글자로 옮겨 적으면 한도를 바꿔도 이 케이스가 산다). zod 는 UTF-16 단위(`length`)로 센다.
 */
const NAME_MAX = (FileEntrySchema.shape.name as unknown as { maxLength: number }).maxLength
const SIZE_MAX = (FileEntrySchema.shape.size as unknown as { maxLength: number }).maxLength
const MAX_SIZE_MAX = (
  (FileAttachDef.props as unknown as { shape: { maxSize: { unwrap(): { maxLength: number } } } }).shape.maxSize.unwrap() as {
    maxLength: number
  }
).maxLength

describe('속성 패널 — 파일 목록', () => {
  it('한 줄이 이름 · 크기 두 칸이고 칸 이름이 그 낱말이다', async () => {
    await openPage(docWith([file('통장사본.pdf', '2.1 MB'), file('사업자등록증.png', '480 KB')]))
    selectFileAttach()
    expect(cells().map((input) => [input.getAttribute('aria-label'), input.value])).toEqual([
      ['파일 1번째 이름', '통장사본.pdf'],
      ['파일 1번째 크기', '2.1 MB'],
      ['파일 2번째 이름', '사업자등록증.png'],
      ['파일 2번째 크기', '480 KB'],
    ])
  })

  it('칸을 고치면 { name, size } 배열을 통째로 낸다', async () => {
    const { calls, api } = editable()
    await openPage(docWith([file('통장사본.pdf', '2.1 MB'), file('사업자등록증.png', '480 KB')]), { apiOverrides: api })
    selectFileAttach()
    const size = within(list()).getByRole('textbox', { name: '파일 2번째 크기' })
    fireEvent.change(size, { target: { value: '1.2 MB' } })
    fireEvent.blur(size)
    await waitFor(() => expect(calls).toHaveLength(1))
    expect(calls[0]!.ops).toEqual([
      { op: 'replace', path: PATH, value: [file('통장사본.pdf', '2.1 MB'), file('사업자등록증.png', '1.2 MB')] },
    ])
  })

  it('«항목 추가» 는 빈 이름 · 빈 크기 줄을 끝에 붙인다 · 옮기기는 두 칸을 함께 옮긴다', async () => {
    const { calls, api } = editable()
    await openPage(docWith([file('a.pdf', '1 MB'), file('b.pdf', '2 MB')]), { apiOverrides: api })
    selectFileAttach()
    fireEvent.click(within(list()).getByRole('button', { name: '항목 추가' }))
    await waitFor(() => expect(calls).toHaveLength(1))
    expect(calls[0]!.ops).toEqual([{ op: 'replace', path: PATH, value: [file('a.pdf', '1 MB'), file('b.pdf', '2 MB'), file('', '')] }])
    fireEvent.click(within(list()).getByRole('button', { name: '1번째 아래로' }))
    await waitFor(() => expect(calls).toHaveLength(2))
    // 앞 추가가 화면 문서에 얹힌 판이다 — 셋째 줄(빈 줄)이 그대로 따라간다.
    expect(calls[1]!.ops).toEqual([{ op: 'replace', path: PATH, value: [file('b.pdf', '2 MB'), file('a.pdf', '1 MB'), file('', '')] }])
  })

  it('상한(FILES_MAX)에서는 «항목 추가» 가 꺼지고 마지막 줄도 지울 수 있다', async () => {
    const full = Array.from({ length: FILES_MAX }, (_, index) => file(`${index}.pdf`, '1 MB'))
    await openPage(docWith(full))
    selectFileAttach()
    expect(within(list()).getByRole<HTMLButtonElement>('button', { name: '항목 추가' }).disabled).toBe(true)
    expect(within(list()).getByRole<HTMLButtonElement>('button', { name: `${FILES_MAX}번째 지우기` }).disabled).toBe(false)
  })

  it('한 줄이면 지우기가 켜져 있다 — 빈 목록도 받는다(선택지와 다르다)', async () => {
    const { calls, api } = editable()
    await openPage(docWith([file('a.pdf', '1 MB')]), { apiOverrides: api })
    selectFileAttach()
    fireEvent.click(within(list()).getByRole('button', { name: '1번째 지우기' }))
    await waitFor(() => expect(calls).toHaveLength(1))
    expect(calls[0]!.ops).toEqual([{ op: 'replace', path: PATH, value: [] }])
  })

  /**
   * 글 한도(L1) — 칸이 스키마 한도에서 막는다. 안 막으면 넘는 글이 서버 422 → 다시 불러오기로 사라진다. 붙여 넣기(한 번에 넘는 글)도 한도까지만 낸다.
   * 한도는 UTF-16 단위다(서버 zod 와 같은 단위) — 한도 한 칸 앞에서 친 이모지(두 단위)는 안 들어간다.
   */
  it('이름 · 크기 칸은 스키마의 글 한도에서 막는다 — 넘는 글을 붙여 넣어도 한도까지만 낸다 · UTF-16 단위', async () => {
    expect([NAME_MAX, SIZE_MAX].every((max) => Number.isInteger(max) && max > 0)).toBe(true)
    const { calls, api } = editable()
    await openPage(docWith([file('가.pdf', '1 MB')]), { apiOverrides: api })
    selectFileAttach()
    const name = within(list()).getByRole('textbox', { name: '파일 1번째 이름' }) as HTMLInputElement
    const size = within(list()).getByRole('textbox', { name: '파일 1번째 크기' }) as HTMLInputElement
    expect([name.maxLength, size.maxLength]).toEqual([NAME_MAX, SIZE_MAX])
    fireEvent.change(name, { target: { value: 'n'.repeat(NAME_MAX + 5) } })
    expect(name.value).toHaveLength(NAME_MAX)
    fireEvent.blur(name)
    await waitFor(() => expect(calls).toHaveLength(1))
    fireEvent.change(size, { target: { value: 's'.repeat(SIZE_MAX + 3) } })
    fireEvent.blur(size)
    await waitFor(() => expect(calls).toHaveLength(2))
    expect(calls.map((call) => call.ops)).toEqual([
      [{ op: 'replace', path: PATH, value: [file('n'.repeat(NAME_MAX), '1 MB')] }],
      [{ op: 'replace', path: PATH, value: [file('n'.repeat(NAME_MAX), 's'.repeat(SIZE_MAX))] }],
    ])
    fireEvent.change(name, { target: { value: '가'.repeat(NAME_MAX - 1) + '😀' } })
    expect(name.value).toBe('가'.repeat(NAME_MAX - 1))
  })

  it('«최대 크기» 칸도 스키마의 글 한도에서 막는다', async () => {
    expect(Number.isInteger(MAX_SIZE_MAX) && MAX_SIZE_MAX > 0).toBe(true)
    const { calls, api } = editable()
    await openPage(docWith([]), { apiOverrides: api })
    selectFileAttach()
    const field = within(panel()).getByRole('textbox', { name: '최대 크기' }) as HTMLInputElement
    expect(field.maxLength).toBe(MAX_SIZE_MAX)
    fireEvent.change(field, { target: { value: 'm'.repeat(MAX_SIZE_MAX + 1) } })
    fireEvent.blur(field)
    await waitFor(() => expect(calls).toHaveLength(1))
    expect(calls[0]!.ops).toEqual([{ op: 'add', path: '/root/children/0/props/maxSize', value: 'm'.repeat(MAX_SIZE_MAX) }])
  })

  it('원소 모양이 깨진 목록 · 배열이 아닌 값도 셸을 죽이지 않는다 — 깨진 줄은 빈 두 칸이다', async () => {
    await openPage(docWith(['그냥 글', null, { name: 3, size: '1 MB' }]))
    selectFileAttach()
    expect(cells().map((input) => input.value)).toEqual(['', '', '', '', '', '1 MB'])
    expect(document.body.querySelector('.wb-shell')).not.toBeNull()
  })
})
