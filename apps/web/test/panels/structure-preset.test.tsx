/**
 * 프리셋 고르개·적용·저장·단축키의 화면 흐름(P7-2 T4 — D3·D6·D7·D9).
 * **`<App />`을 라우트째 렌더한다.**
 *
 * **판정과 op 만들기는 여기서 재지 않는다** — `../edit/preset-apply.test.ts`가 문서로
 * 직접 잰다. 여기서 재는 것은 **덮기 전에 무엇을 말하는가**(D6), 결과가 **기존 커밋
 * 경로를 그대로 타는가**(D3), 저장이 **무엇을 보내는가**(D7), 그리고 **판정 없는 조작의
 * 단축키**(D9)다.
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BUILTIN_PRESETS, applyOps, invertOps, type PageDocument, type PatchOp } from '@wirebound/schema'
import { ApiError, type ApiClient } from '../../src/api/client'
import type { Comment, PageDetail, PatchResult, Preset } from '../../src/api/types'
import { HEAD_SEQ, openPage, pageDetail, pageDoc, structureTypes } from '../editor-harness'
import '../../src/catalog-setup'

/**
 * ```
 * n-root (Page)
 * ├ n-a   (Text)
 * └ n-box (Card)
 * ```
 */
function doc(): PageDocument {
  return pageDoc({
    id: 'n-root',
    type: 'Page',
    children: [
      { id: 'n-a', type: 'Text' },
      { id: 'n-box', type: 'Card' },
    ],
  })
}

const PROJECT_PRESET: Preset = {
  id: '11111111-1111-4111-8111-111111111111',
  source: 'project',
  name: '내가 만든 것',
  description: null,
  nodes: [{ id: 'p_list', type: 'List' }],
}

/** 놓을 수 없는 프리셋. 카탈로그에 없는 타입이라 결과 문서가 `error`를 낸다. */
const BROKEN_PRESET: Preset = {
  id: '22222222-2222-4222-8222-222222222222',
  source: 'project',
  name: '깨진 것',
  description: null,
  nodes: [{ id: 'p_bad', type: '없는타입' }],
}

/** 빈 프리셋. *"치우기"*라는 정상 조작이다(D7). */
const EMPTY_PRESET: Preset = {
  id: '33333333-3333-4333-8333-333333333333',
  source: 'project',
  name: '비우기',
  description: null,
  nodes: [],
}

interface Server {
  calls: { ops: PatchOp[]; baseSeq: number }[]
  created: { name: string; schema: unknown }[]
  listCalls: number
  api: Partial<ApiClient>
}

function comment(nodeId: string, id: string): Comment {
  return {
    id,
    nodeId,
    body: '말',
    authorId: 'u-1',
    authorName: '테스터',
    createdAt: '2026-08-13T00:00:00.000Z',
    updatedAt: '2026-08-13T00:00:00.000Z',
  }
}

/**
 * 편집을 받아 문서를 진행시키는 대역. `structure-pattern.test.tsx`의 것과 같은 형태이고
 * 프리셋 셋(목록·저장·코멘트)이 더 붙는다.
 */
function server(
  options: {
    presets?: Preset[]
    comments?: Comment[] | 'fail'
    failPresets?: boolean
    /**
     * 대역이 들 초기 문서. **`openPage`에 준 것과 같아야 한다** — 다르면 `invertOps`가
     * 엉뚱한 경로를 보고, 편집이 실패해 재조회가 **대역의 문서**로 화면을 갈아 끼운다
     * (`structure-keyboard.test.tsx`가 같은 함정을 겪고 적어 두었다. 여기서도 걸렸다:
     * `children` 키가 없는 문서를 `openPage`에만 줬더니 화면에는 대역이 든 기본 문서가
     * 떴고, 그래서 재려던 갈래에 닿지 못했다).
     */
    document?: PageDocument
  } = {},
): Server {
  const calls: { ops: PatchOp[]; baseSeq: number }[] = []
  const created: { name: string; schema: unknown }[] = []
  const state = {
    seq: HEAD_SEQ,
    held: options.document ?? doc(),
    listCalls: 0,
    presets: options.presets ?? [],
  }

  const patchOps: ApiClient['patchOps'] = async (_projectId, _pageId, body) => {
    calls.push({ ops: body.ops, baseSeq: body.baseSeq })
    const inverse = invertOps(state.held, body.ops)
    state.held = applyOps(state.held, body.ops)
    state.seq += 1
    const result: PatchResult = {
      seq: state.seq,
      revisionId: `rev-${state.seq}`,
      inverse,
      schemaVersion: 1,
      ...(body.clientOpId === undefined ? {} : { clientOpId: body.clientOpId }),
    }
    return result
  }

  const getPage: ApiClient['getPage'] = async (_projectId, pageId) => {
    const detail: PageDetail = { ...pageDetail(pageId, state.held), headSeq: state.seq }
    return detail
  }

  const listPresets: ApiClient['listPresets'] = async () => {
    state.listCalls += 1
    if (options.failPresets === true) {
      throw new ApiError(500, 'internal', '서버 오류')
    }
    // 서버가 내장을 먼저 낸다(D2) — 그 순서가 계약이므로 대역도 그렇게 낸다.
    return [
      ...BUILTIN_PRESETS.map((preset) => ({
        id: `builtin:${preset.key}`,
        source: 'builtin' as const,
        name: preset.name,
        description: preset.description,
        nodes: [...preset.nodes],
      })),
      ...state.presets,
    ]
  }

  const createPreset: ApiClient['createPreset'] = async (_projectId, body) => {
    created.push({ name: body.name, schema: body.schema })
    const record: Preset = {
      id: `44444444-4444-4444-8444-44444444444${created.length}`,
      source: 'project',
      name: body.name,
      description: body.description ?? null,
      // 서버가 `marker`를 버린다(D4) — 대역도 그렇게 한다.
      nodes: [],
    }
    state.presets = [...state.presets, record]
    return record
  }

  const listComments: ApiClient['listComments'] = async () => {
    if (options.comments === 'fail') throw new ApiError(500, 'internal', '서버 오류')
    return options.comments ?? []
  }

  return {
    calls,
    created,
    get listCalls() {
      return state.listCalls
    },
    api: { patchOps, getPage, listPresets, createPreset, listComments },
  }
}

function structureRegion(): HTMLElement {
  return screen.getByRole('region', { name: '구조 트리' })
}

function toolButton(name: string): HTMLButtonElement {
  return within(within(structureRegion()).getByRole('group', { name: '구조 편집' })).getByRole(
    'button',
    { name },
  )
}

function pickerButton(name: string): HTMLButtonElement {
  return within(screen.getByRole('group', { name: '프리셋 고르기' })).getByRole('button', { name })
}

/**
 * 키 핸들러가 붙은 상자 **안**의 요소. **`region` 자체에 쏘면 안 된다** — 핸들러는 그
 * 안쪽 `<div>`에 있고(`structure-tree.tsx`), 조상에서 난 이벤트는 거기로 내려가지 않는다
 * (재서 알았다: `region`에 쏜 판은 고르개가 열리지 않았다).
 */
function keyTarget(): HTMLElement {
  return within(structureRegion()).getByRole('group', { name: '구조 편집' })
}

function alertText(): string | null {
  return document.body.querySelector('[role="alert"]')?.textContent ?? null
}

function selectedType(): string | null {
  return (
    structureRegion().querySelector('.wb-shell-structure-node[aria-current="true"]')?.textContent ??
    null
  )
}

/** 고르개를 열고 목록이 뜰 때까지 기다린다. */
async function openPicker(): Promise<void> {
  fireEvent.click(toolButton('프리셋'))
  await screen.findByLabelText('프리셋')
}

/** 고르개에서 프리셋 하나를 골라 확인까지 지나 적용한다. */
async function applyPreset(id: string): Promise<void> {
  fireEvent.change(screen.getByLabelText('프리셋'), { target: { value: id } })
  fireEvent.click(pickerButton('프리셋 적용'))
  fireEvent.click(await screen.findByRole('button', { name: '덮고 적용' }))
}

describe('프리셋 고르개 — 기본 상태', () => {
  it('프로젝트 프리셋이 하나도 없어도 내장이 목록에 있다(T4)', async () => {
    const backend = server()
    await openPage(doc(), { apiOverrides: backend.api })

    await openPicker()

    const options = within(screen.getByLabelText('프리셋') as HTMLSelectElement).getAllByRole(
      'option',
    )
    // **수를 적지 않는다** — 내장 목록에서 만든다.
    expect(options).toHaveLength(BUILTIN_PRESETS.length)
    expect(options[0]!.textContent).toContain(BUILTIN_PRESETS[0]!.name)
  })

  it('내장과 프로젝트 것을 갈라 말한다 — 이름이 겹칠 수 있다(D2)', async () => {
    const backend = server({ presets: [PROJECT_PRESET] })
    await openPage(doc(), { apiOverrides: backend.api })

    await openPicker()

    const labels = within(screen.getByLabelText('프리셋') as HTMLSelectElement)
      .getAllByRole('option')
      .map((option) => option.textContent)
    expect(labels.filter((label) => label?.includes('(내장)'))).toHaveLength(BUILTIN_PRESETS.length)
    expect(labels.filter((label) => label?.includes('(프로젝트)'))).toHaveLength(1)
  })

  it('목록 조회가 실패해도 닫을 수 있다', async () => {
    const backend = server({ failPresets: true })
    await openPage(doc(), { apiOverrides: backend.api })

    fireEvent.click(toolButton('프리셋'))
    await screen.findByText('서버 오류')

    fireEvent.click(pickerButton('프리셋 취소'))
    expect(screen.queryByRole('group', { name: '프리셋 고르기' })).toBeNull()
  })
})

describe('적용 — D6: 덮는 것을 먼저 말한다', () => {
  it('바로 적용하지 않고 확인을 묻는다 — 그 사이 편집이 0건이다', async () => {
    const backend = server()
    await openPage(doc(), { apiOverrides: backend.api })

    await openPicker()
    fireEvent.click(pickerButton('프리셋 적용'))

    expect(await screen.findByRole('button', { name: '덮고 적용' })).toBeTruthy()
    expect(backend.calls).toEqual([])
    // 문서도 그대로다.
    expect(structureTypes()).toContain('Text')
  })

  it('코멘트 수를 세어 확인 문장에 싣는다', async () => {
    const backend = server({ comments: [comment('n-a', 'c1'), comment('n-box', 'c2')] })
    await openPage(doc(), { apiOverrides: backend.api })

    await openPicker()
    fireEvent.click(pickerButton('프리셋 적용'))

    await screen.findByText(/코멘트 2개는 지워지지 않지만/)
  })

  /**
   * **리뷰 (6) — 세는 단위.** D6은 *"적용 전에 그 페이지의 코멘트 수를 세어 확인 문장에
   * 싣는다"*인데, 페이지의 코멘트를 통째로 세면 **실제보다 많다.** 둘이 새어 든다:
   *
   * - **root를 가리키는 코멘트** — root는 교체 대상이 아니라 그대로 남는다(D3).
   * - **이미 고아인 코멘트** — 그 상태가 이 적용으로 변하지 않는다.
   *
   * 세는 단위는 **"이 적용이 문서에서 없애는 노드를 가리키는 코멘트"**다.
   */
  it('root를 가리키는 코멘트와 이미 고아인 코멘트를 세지 않는다', async () => {
    const backend = server({
      comments: [
        comment('n-a', 'c1'),
        comment('n-root', 'c2'),
        comment('사라진노드', 'c3'),
      ],
    })
    await openPage(doc(), { apiOverrides: backend.api })

    await openPicker()
    fireEvent.click(pickerButton('프리셋 적용'))

    await screen.findByText(/코멘트 1개는 지워지지 않지만/)
  })

  it('고아가 될 코멘트가 없으면 없다고 말한다 — "페이지에 코멘트가 없다"와 다른 말이다', async () => {
    // **root에만 코멘트가 있는 페이지.** 적용해도 그 노드는 그대로이므로 고아가 0이다 —
    // 그런데 페이지의 코멘트는 0이 아니다. 세는 단위가 갈라 말한다(리뷰 (6)).
    const backend = server({ comments: [comment('n-root', 'c1')] })
    await openPage(doc(), { apiOverrides: backend.api })

    await openPicker()
    fireEvent.click(pickerButton('프리셋 적용'))

    await screen.findByText(/가리키던 노드가 사라지는 코멘트는 없습니다/)
  })

  /**
   * **겨냥을 바꿔 다시 잰 자리다.** 처음에는 *"문서를 못 읽었는데 0이라고 말한다"* 변이가
   * 0 사망이었다 — 그 갈래(`currentNodes === null`)에 닿는 케이스가 없었다. **원인을
   * 단정하지 않고 그 상태를 실제로 만들어 왔다:** root에 `children` 키가 없는 문서다.
   * 도달 가능한 상태이고(`WbNodeSchema`가 `children`을 optional로 두고 `PUT .../schema`가
   * 그런 문서를 받는다 — 재라 #1에서 쟀다) 그때 툴바가 `currentNodes`를 `null`로 내린다.
   */
  it('문서에서 무엇이 없어지는지 모르면 0이라고 말하지 않는다', async () => {
    const childless = pageDoc({ id: 'n-root', type: 'Page' })
    const backend = server({ comments: [comment('n-a', 'c1')], document: childless })
    await openPage(childless, { apiOverrides: backend.api })

    await openPicker()
    fireEvent.click(pickerButton('프리셋 적용'))

    await screen.findByText(/코멘트 수를 읽지 못했습니다/)
  })

  it('그 문서에서는 저장 버튼이 비활성이다 — 담을 것을 모른다', async () => {
    const childless = pageDoc({ id: 'n-root', type: 'Page' })
    const backend = server({ document: childless })
    await openPage(childless, { apiOverrides: backend.api })

    await openPicker()
    fireEvent.change(screen.getByLabelText('프리셋 이름'), { target: { value: '이름' } })

    expect(pickerButton('현재 페이지를 프리셋으로 저장').disabled).toBe(true)
  })

  it('코멘트 수를 읽지 못하면 0이라고 말하지 않는다', async () => {
    const backend = server({ comments: 'fail' })
    await openPage(doc(), { apiOverrides: backend.api })

    await openPicker()
    fireEvent.click(pickerButton('프리셋 적용'))

    await screen.findByText(/코멘트 수를 읽지 못했습니다/)
    // **그래도 적용은 막지 않는다** — 코멘트 조회의 장애가 편집을 세우면 화면이 서버보다
    // 엄격해진다.
    expect(screen.getByRole('button', { name: '덮고 적용' })).toBeTruthy()
  })

  it('확인을 취소하면 편집이 0건이다', async () => {
    const backend = server()
    await openPage(doc(), { apiOverrides: backend.api })

    await openPicker()
    fireEvent.click(pickerButton('프리셋 적용'))
    fireEvent.click(await screen.findByRole('button', { name: '적용 취소' }))

    expect(backend.calls).toEqual([])
    expect(screen.getByRole('button', { name: '프리셋 적용' })).toBeTruthy()
  })

  it('고른 것을 바꾸면 확인이 무효가 된다', async () => {
    const backend = server({ presets: [PROJECT_PRESET] })
    await openPage(doc(), { apiOverrides: backend.api })

    await openPicker()
    fireEvent.click(pickerButton('프리셋 적용'))
    await screen.findByRole('button', { name: '덮고 적용' })

    fireEvent.change(screen.getByLabelText('프리셋'), { target: { value: PROJECT_PRESET.id } })

    expect(screen.queryByRole('button', { name: '덮고 적용' })).toBeNull()
  })
})

describe('적용 — D3: 기존 커밋 경로를 탄다', () => {
  it('편집 하나이고 op은 root의 children 하나다', async () => {
    const backend = server({ presets: [PROJECT_PRESET] })
    await openPage(doc(), { apiOverrides: backend.api })

    await openPicker()
    await applyPreset(PROJECT_PRESET.id)

    await waitFor(() => {
      expect(backend.calls.length).toBe(1)
    })
    expect(backend.calls[0]!.ops).toHaveLength(1)
    expect(backend.calls[0]!.ops[0]!.op).toBe('replace')
    expect(backend.calls[0]!.ops[0]!.path).toBe('/root/children')
    expect(backend.calls[0]!.baseSeq).toBe(HEAD_SEQ)
  })

  it('기존 내용이 통째로 사라지고 프리셋이 들어온다', async () => {
    const backend = server({ presets: [PROJECT_PRESET] })
    await openPage(doc(), { apiOverrides: backend.api })

    await openPicker()
    await applyPreset(PROJECT_PRESET.id)

    await waitFor(() => {
      expect(structureTypes()).toContain('List')
    })
    expect(structureTypes()).not.toContain('Text')
    expect(structureTypes()).not.toContain('Card')
  })

  it('undo 하나가 페이지 전체를 되돌린다(D3)', async () => {
    const backend = server({ presets: [PROJECT_PRESET] })
    await openPage(doc(), { apiOverrides: backend.api })

    await openPicker()
    await applyPreset(PROJECT_PRESET.id)
    await waitFor(() => {
      expect(structureTypes()).toContain('List')
    })

    fireEvent.click(
      within(screen.getByRole('group', { name: '편집 이력' })).getByRole('button', {
        name: '되돌리기',
      }),
    )

    await waitFor(() => {
      expect(structureTypes()).toContain('Text')
    })
    expect(structureTypes()).toContain('Card')
    expect(structureTypes()).not.toContain('List')
  })

  it('놓은 뒤 첫 노드가 선택된다', async () => {
    const backend = server({ presets: [PROJECT_PRESET] })
    await openPage(doc(), { apiOverrides: backend.api })

    await openPicker()
    await applyPreset(PROJECT_PRESET.id)

    await waitFor(() => {
      expect(selectedType()).toBe('List')
    })
  })

  /**
   * **D8 — P7-1 이월 §3의 예측을 재는 자리다.** 그 이월은 *"P7-2가 `'empty'` 갈래를
   * 도달시킨다"*고 봤다(빈 프리셋이 정상 입력이므로). **재 보니 빗나갔다:** 빈 프리셋은
   * 실패가 아니라 **성공하는 조작**이고(치우기 — D7), 프리셋은 `patternInsert`를 아예
   * 지나지 않는다(D3의 별도 경로). 그래서 알림이 뜨지 않는다.
   */
  it('빈 프리셋은 실패 문장을 내지 않는다 — 이월 §3의 갈래에 닿지 않는다(D8)', async () => {
    const backend = server({ presets: [EMPTY_PRESET] })
    await openPage(doc(), { apiOverrides: backend.api })

    await openPicker()
    await applyPreset(EMPTY_PRESET.id)

    await waitFor(() => {
      expect(backend.calls.length).toBe(1)
    })
    expect(alertText()).toBeNull()
  })

  it('빈 프리셋은 페이지를 비우고 선택도 비운다(D7)', async () => {
    const backend = server({ presets: [EMPTY_PRESET] })
    await openPage(doc(), { apiOverrides: backend.api })

    fireEvent.click(within(structureRegion()).getByRole('button', { name: 'Card' }))
    await openPicker()
    await applyPreset(EMPTY_PRESET.id)

    await waitFor(() => {
      expect(structureTypes()).toEqual(['Page'])
    })
    expect(selectedType()).toBeNull()
  })

  it('놓은 뒤 목록이 닫힌다', async () => {
    const backend = server({ presets: [PROJECT_PRESET] })
    await openPage(doc(), { apiOverrides: backend.api })

    await openPicker()
    await applyPreset(PROJECT_PRESET.id)

    expect(screen.queryByRole('group', { name: '프리셋 고르기' })).toBeNull()
  })

  it('놓을 수 없는 프리셋은 알림만 남기고 편집이 0건이다', async () => {
    const backend = server({ presets: [BROKEN_PRESET] })
    await openPage(doc(), { apiOverrides: backend.api })

    await openPicker()
    await applyPreset(BROKEN_PRESET.id)

    await waitFor(() => {
      expect(alertText()).toContain('프리셋을 놓지 못했습니다')
    })
    // **문장이 이유로 끝난다 — 콜론 뒤가 비지 않는다**(P7-1 이월 §3이 지목한 모양).
    expect(alertText()).toContain('알 수 없는 컴포넌트 타입')
    expect(backend.calls).toEqual([])
    // 문서는 손대지 않은 그대로다 — 되돌릴 것이 없다.
    expect(structureTypes()).toContain('Text')
  })
})

/**
 * **재라 #2 — *"고아 코멘트가 오늘 화면에서 무해하다"*를 실제로 잰다.** 계획서가
 * *"아무도 안 쟀다"*고 적은 자리이고, D6이 그것에 걸려 있다.
 *
 * 여기서 재는 것은 **적용 뒤의 화면**이다. 코멘트 탭 자체가 사라진 노드를 갈라 보이는
 * 것은 `comment-panel.test.tsx`가 이미 재고 있지만(P5-1의 무리 셋), **프리셋 적용이
 * 그 상태를 만든다는 것**은 이 슬라이스가 처음 만드는 사실이다.
 */
describe('적용 — D6: 코멘트는 남는다', () => {
  it('적용 뒤 코멘트가 "사라진 노드" 무리로 남는다 — 지워지지 않는다', async () => {
    const backend = server({
      presets: [PROJECT_PRESET],
      comments: [comment('n-a', 'c1'), comment('n-box', 'c2')],
    })
    await openPage(doc(), { apiOverrides: backend.api })

    await openPicker()
    await applyPreset(PROJECT_PRESET.id)
    await waitFor(() => {
      expect(structureTypes()).toContain('List')
    })

    fireEvent.click(screen.getByRole('tab', { name: '코멘트' }))
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: '코멘트' }).getAttribute('aria-selected')).toBe('true'),
    )

    // **본문이 그대로 있다** — 행은 서버에 남고 문서에서만 사라진다.
    const titles = [...document.body.querySelectorAll('.wb-shell-comment-group-title')].map(
      (element) => element.textContent?.replace(/\s+/g, ' ').trim() ?? '',
    )
    expect(titles).toEqual(['– 사라진 노드 (n-a)', '– 사라진 노드 (n-box)'])
    // **던지지 않는다** — 셸이 그대로 서 있다(이 패널은 오류 경계 밖이다).
    expect(screen.getByRole('region', { name: '구조 트리' })).toBeTruthy()
  })
})

describe('저장 — D7', () => {
  it('지금 페이지의 children을 보낸다 — 문서 봉투가 아니다', async () => {
    const backend = server()
    await openPage(doc(), { apiOverrides: backend.api })

    await openPicker()
    fireEvent.change(screen.getByLabelText('프리셋 이름'), { target: { value: '내 화면' } })
    fireEvent.click(pickerButton('현재 페이지를 프리셋으로 저장'))

    await waitFor(() => {
      expect(backend.created).toHaveLength(1)
    })
    expect(backend.created[0]!.name).toBe('내 화면')
    expect(backend.created[0]!.schema).toEqual([
      { id: 'n-a', type: 'Text' },
      { id: 'n-box', type: 'Card' },
    ])
  })

  it('저장하면 목록을 다시 읽는다 — 방금 만든 것을 바로 놓을 수 있어야 한다', async () => {
    const backend = server()
    await openPage(doc(), { apiOverrides: backend.api })

    await openPicker()
    const before = backend.listCalls
    fireEvent.change(screen.getByLabelText('프리셋 이름'), { target: { value: '내 화면' } })
    fireEvent.click(pickerButton('현재 페이지를 프리셋으로 저장'))

    await waitFor(() => {
      expect(backend.listCalls).toBeGreaterThan(before)
    })
    await waitFor(() => {
      expect(
        within(screen.getByLabelText('프리셋') as HTMLSelectElement)
          .getAllByRole('option')
          .map((option) => option.textContent),
      ).toContainEqual(expect.stringContaining('내 화면'))
    })
  })

  it('이름이 비어 있으면 저장 버튼이 비활성이다 — 보내 봐야 400이다', async () => {
    const backend = server()
    await openPage(doc(), { apiOverrides: backend.api })

    await openPicker()

    expect(pickerButton('현재 페이지를 프리셋으로 저장').disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('프리셋 이름'), { target: { value: '  ' } })
    expect(pickerButton('현재 페이지를 프리셋으로 저장').disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('프리셋 이름'), { target: { value: '이름' } })
    expect(pickerButton('현재 페이지를 프리셋으로 저장').disabled).toBe(false)
  })

  it('저장이 실패하면 그 문장을 그대로 보인다', async () => {
    const backend = server()
    const failing: Partial<ApiClient> = {
      ...backend.api,
      createPreset: async () => {
        throw new ApiError(400, 'bad-request', '이름은 60자 이하여야 합니다')
      },
    }
    await openPage(doc(), { apiOverrides: failing })

    await openPicker()
    fireEvent.change(screen.getByLabelText('프리셋 이름'), { target: { value: '긴 이름' } })
    fireEvent.click(pickerButton('현재 페이지를 프리셋으로 저장'))

    await screen.findByText('이름은 60자 이하여야 합니다')
  })
})

/**
 * **리뷰가 막는 결함으로 잡은 자리다.** 키 핸들러는 트리와 툴바를 **함께** 감싸는 상자에
 * 붙어 있는데(`structure-tree.tsx`), 이 슬라이스가 그 상자 안에 **처음으로 타이핑하는
 * 칸**을 넣었다. 첫 단축키가 수식 키 없는 `Delete`·`Backspace`를 삭제로 받으므로,
 * 이름을 고치다 오타를 지우면 **고른 노드가 지워지고 그 편집이 서버로 나간다.**
 *
 * **이름 칸 하나를 예외로 두지 않는다.** 같은 상자에 앞으로 들어올 입력 칸이 전부
 * 지켜져야 하므로, 규칙은 *"타이핑하는 표면에서 난 키는 구조 조작이 아니다"*다 —
 * 아래 `structure-keyboard.test.tsx`가 그 규칙을 고르개의 `<select>`로도 잰다.
 */
describe('입력 칸에서 친 키는 구조 조작으로 새지 않는다', () => {
  it('프리셋 이름 칸의 Backspace가 노드를 지우지 않는다', async () => {
    const backend = server()
    await openPage(doc(), { apiOverrides: backend.api })

    fireEvent.click(within(structureRegion()).getByRole('button', { name: 'Text' }))
    await openPicker()
    const input = screen.getByLabelText('프리셋 이름')
    fireEvent.change(input, { target: { value: '이름' } })

    fireEvent.keyDown(input, { key: 'Backspace' })
    fireEvent.keyDown(input, { key: 'Delete' })

    expect(structureTypes()).toEqual(['Page', 'Text', 'Card'])
    expect(backend.calls).toEqual([])
  })

  it('프리셋 이름 칸의 기본 동작을 막지 않는다 — 글자가 지워져야 한다', async () => {
    const backend = server()
    await openPage(doc(), { apiOverrides: backend.api })

    await openPicker()
    const input = screen.getByLabelText('프리셋 이름')

    // `fireEvent`는 기본 동작이 막히지 않았을 때 `true`를 낸다(`Tab` 케이스와 같은 방식).
    expect(fireEvent.keyDown(input, { key: 'Backspace' })).toBe(true)
  })

  it('이름 칸에서는 고르개 단축키도 돌지 않는다 — 타이핑이 우선이다', async () => {
    const backend = server()
    await openPage(doc(), { apiOverrides: backend.api })

    await openPicker()
    fireEvent.keyDown(screen.getByLabelText('프리셋 이름'), {
      code: 'KeyI',
      altKey: true,
      shiftKey: true,
    })

    expect(screen.queryByRole('group', { name: '패턴 고르기' })).toBeNull()
  })
})

describe('단축키 — D9: 판정 없는 조작', () => {
  it('Alt+Shift+P가 프리셋 고르개를 연다', async () => {
    const backend = server()
    await openPage(doc(), { apiOverrides: backend.api })

    fireEvent.keyDown(within(structureRegion()).getByRole('button', { name: 'Card' }), {
      code: 'KeyP',
      altKey: true,
      shiftKey: true,
    })

    await screen.findByRole('group', { name: '프리셋 고르기' })
  })

  /**
   * **이것이 `StructureAbilities`에 자리를 만들 수 없었던 이유다**(재라 #6). 선택이 없으면
   * `structureAbilities`가 전부 `false`인 `NOTHING`을 내므로, 그 표에 키를 더했다면
   * **정확히 이 상태에서만** 단축키가 죽는다.
   */
  it('선택이 없어도 열린다 — 자리를 고르는 조작이 아니다', async () => {
    const backend = server()
    await openPage(doc(), { apiOverrides: backend.api })

    fireEvent.keyDown(keyTarget(), { code: 'KeyP', altKey: true, shiftKey: true })

    await screen.findByRole('group', { name: '프리셋 고르기' })
  })

  it('Alt+Shift+I가 패턴 고르개를 연다 — 패턴만 단축키가 없는 상태를 끝낸다', async () => {
    const backend = server()
    await openPage(doc(), { apiOverrides: backend.api })

    fireEvent.keyDown(keyTarget(), { code: 'KeyI', altKey: true, shiftKey: true })

    await screen.findByRole('group', { name: '패턴 고르기' })
  })

  it('Shift 없이 누르면 아무것도 열리지 않는다', async () => {
    const backend = server()
    await openPage(doc(), { apiOverrides: backend.api })

    fireEvent.keyDown(keyTarget(), { code: 'KeyP', altKey: true })

    expect(screen.queryByRole('group', { name: '프리셋 고르기' })).toBeNull()
  })
})
