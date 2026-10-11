/**
 * 프리셋 고르개·적용·저장·단축키의 화면 흐름.
 * **`<App />`을 라우트째 렌더한다.**
 *
 * **판정과 op 만들기는 여기서 재지 않는다** — `../edit/preset-apply.test.ts`가 문서로
 * 직접 잰다. 여기서 재는 것은 **덮기 전에 무엇을 말하는가**, 결과가 **기존 커밋
 * 경로를 그대로 타는가**, 저장이 **무엇을 보내는가**, 그리고 **판정 없는 조작의
 * 단축키**다.
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BUILTIN_PRESETS, applyOps, invertOps, partitionIssues, validatePage, type PageDocument, type PatchOp } from '@wirebound/schema'
import { ApiError, type ApiClient } from '../../src/api/client'
import type { Comment, PageDetail, PatchResult, Preset } from '../../src/api/types'
import { droppedCasesNotice } from '../../src/edit/paste-ops'
import { deselect, HEAD_SEQ, openPage, pageDetail, pageDoc, structureTypes } from '../editor-harness'
import '../../src/catalog-setup'
import { treeTool, structureRowName, structureRowType } from './tree-row'

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

/** 빈 프리셋. *"치우기"*라는 정상 조작이다. */
const EMPTY_PRESET: Preset = {
  id: '33333333-3333-4333-8333-333333333333',
  source: 'project',
  name: '비우기',
  description: null,
  nodes: [],
}

interface Server {
  calls: { ops: PatchOp[]; baseSeq: number }[]
  created: { name: string; schema: unknown; viewStates?: unknown }[]
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
     * (`structure-keyboard.test.tsx`의 `server`와 같은 함정이다 — `children` 키가 없는
     * 문서를 `openPage`에만 주면 화면에는 대역이 든 기본 문서가 떠 재려던 갈래에 닿지
     * 못한다).
     */
    document?: PageDocument
  } = {},
): Server {
  const calls: { ops: PatchOp[]; baseSeq: number }[] = []
  const created: { name: string; schema: unknown; viewStates?: unknown }[] = []
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
    // 서버가 내장을 먼저 낸다 — 그 순서가 계약이므로 대역도 그렇게 낸다.
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
    created.push({ name: body.name, schema: body.schema, ...(body.viewStates === undefined ? {} : { viewStates: body.viewStates }) })
    const record: Preset = {
      id: `44444444-4444-4444-8444-44444444444${created.length}`,
      source: 'project',
      name: body.name,
      description: body.description ?? null,
      // 서버가 `marker`를 버린다 — 대역도 그렇게 한다.
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

function toolButton(name: string): HTMLElement {
  return treeTool(structureRegion(), name)
}

function pickerButton(name: string): HTMLButtonElement {
  return within(screen.getByRole('group', { name: '프리셋 고르기' })).getByRole('button', { name })
}

/**
 * 키 핸들러가 붙은 상자 **안**의 요소. **`region` 자체에 쏘면 안 된다** — 핸들러는 그
 * 안쪽 `<div>`에 있고(`structure-tree.tsx`), 조상에서 난 이벤트는 거기로 내려가지 않는다
 * (`region`에 쏘면 고르개가 열리지 않는다).
 */
function keyTarget(): HTMLElement {
  // 단축키 상자(`panels/structure-tree.tsx`의 `onKeyDown` 상자) 안의 요소 — 옛 툴바 자리에는 이제 트리 줄 목록이 선다.
  const list = structureRegion().querySelector<HTMLElement>('.wb-shell-structure')
  if (list === null) throw new Error('구조 트리 목록이 없다')
  return list
}

function alertText(): string | null {
  return document.body.querySelector('[role="alert"]')?.textContent ?? null
}

function selectedType(): string | null {
  return structureRowType(structureRegion().querySelector('.wb-shell-structure-node[aria-current="true"]'))
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
  it('프로젝트 프리셋이 하나도 없어도 내장이 목록에 있다', async () => {
    const backend = server()
    await openPage(doc(), { apiOverrides: backend.api })

    await openPicker()

    const options = within(screen.getByLabelText('프리셋') as HTMLSelectElement).getAllByRole('option')
    // **수를 적지 않는다** — 내장 목록에서 만든다.
    expect(options).toHaveLength(BUILTIN_PRESETS.length)
    expect(options[0]!.textContent).toContain(BUILTIN_PRESETS[0]!.name)
  })

  it('내장과 프로젝트 것을 갈라 말한다 — 이름이 겹칠 수 있다', async () => {
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

/**
 * **줄을 마크업이 가른다**(`shell.css`의 `.wb-shell-picker-row`). CSS 만으로 감싸면 확인 단계의 단추 둘과 `프리셋 이름`
 * 이름표 · 입력이 한 줄에 섞였다(Chrome · 264px 사이드바: 입력 46.9px). 줄이 갈리는지는 좌표가 아니라 **어느 줄 상자에
 * 담겼나**로 잰다 — jsdom 에는 레이아웃이 없다. 폭의 값은 실브라우저의 것이다(`<select>` 204.9 · 입력 180.7px).
 */
describe('프리셋 고르개 — 줄', () => {
  function rowOf(element: Element): Element {
    const row = element.closest('.wb-shell-picker-row')
    if (row === null) throw new Error('줄 상자 안이 아니다')
    return row
  }

  it('확인 단계의 단추 둘은 자기 줄이다 — 이름 칸과 섞이지 않는다', async () => {
    const backend = server()
    await openPage(doc(), { apiOverrides: backend.api })
    await openPicker()
    fireEvent.click(pickerButton('프리셋 적용'))

    const confirm = rowOf(await screen.findByRole('button', { name: '덮고 적용' }))

    expect(confirm).toBe(rowOf(screen.getByRole('button', { name: '적용 취소' })))
    expect(confirm.querySelector('input, select, label')).toBeNull()
  })

  it('이름표는 제 칸과 한 줄이고, 칸은 단추와 섞이지 않는다', async () => {
    const backend = server()
    await openPage(doc(), { apiOverrides: backend.api })
    await openPicker()

    for (const name of ['프리셋', '프리셋 이름']) {
      const field = screen.getByLabelText(name)
      const row = rowOf(field)
      expect(row.querySelector('label')?.textContent).toBe(name)
      expect(row.querySelector('button')).toBeNull()
    }
  })
})

describe('적용 — 덮는 것을 먼저 말한다', () => {
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
   * **세는 단위.** 규칙은 *"적용 전에 그 페이지의 코멘트 수를 세어 확인 문장에
   * 싣는다"*인데, 페이지의 코멘트를 통째로 세면 **실제보다 많다.** 둘이 새어 든다:
   *
   * - **root를 가리키는 코멘트** — root는 교체 대상이 아니라 그대로 남는다.
   * - **이미 고아인 코멘트** — 그 상태가 이 적용으로 변하지 않는다.
   *
   * 세는 단위는 **"이 적용이 문서에서 없애는 노드를 가리키는 코멘트"**다.
   */
  it('root를 가리키는 코멘트와 이미 고아인 코멘트를 세지 않는다', async () => {
    const backend = server({
      comments: [comment('n-a', 'c1'), comment('n-root', 'c2'), comment('사라진노드', 'c3')],
    })
    await openPage(doc(), { apiOverrides: backend.api })

    await openPicker()
    fireEvent.click(pickerButton('프리셋 적용'))

    await screen.findByText(/코멘트 1개는 지워지지 않지만/)
  })

  it('고아가 될 코멘트가 없으면 없다고 말한다 — "페이지에 코멘트가 없다"와 다른 말이다', async () => {
    // **root에만 코멘트가 있는 페이지.** 적용해도 그 노드는 그대로이므로 고아가 0이다 —
    // 그런데 페이지의 코멘트는 0이 아니다. 세는 단위가 갈라 말한다.
    const backend = server({ comments: [comment('n-root', 'c1')] })
    await openPage(doc(), { apiOverrides: backend.api })

    await openPicker()
    fireEvent.click(pickerButton('프리셋 적용'))

    await screen.findByText(/가리키던 노드가 사라지는 코멘트는 없습니다/)
  })

  /**
   * **`currentNodes === null` 갈래에 닿는 케이스다** — 이것이 없으면 *"문서를 못 읽었는데
   * 0이라고 말한다"* 변이가 0 사망이다. **그 상태를 실제로 만든다:** root에 `children` 키가
   * 없는 문서다. 도달 가능한 상태이고(`WbNodeSchema`가 `children`을 optional로 두고
   * `PUT .../schema`가 그런 문서를 받는다) 그때 툴바가 `currentNodes`를 `null`로 내린다.
   */
  /**
   * **모르는 것이 둘이고 둘은 다른 말이다.** 문서를 못 읽은 것을 *"코멘트 수를 읽지
   * 못했습니다"*로 말하면 **코멘트를 실제로 읽었는데도** 못 읽었다고 말하게 된다 — 화면이
   * 사실과 다른 것을 말하는 부류다(`comment-panel.tsx`의 `present`가 `'unknown'`을 가진
   * 이유와 같다).
   */
  it('문서에서 무엇이 없어지는지 모를 때 코멘트를 못 읽었다고 말하지 않는다', async () => {
    const childless = pageDoc({ id: 'n-root', type: 'Page' })
    const backend = server({ comments: [comment('n-a', 'c1')], document: childless })
    await openPage(childless, { apiOverrides: backend.api })

    await openPicker()
    fireEvent.click(pickerButton('프리셋 적용'))

    await screen.findByText(/이 페이지의 구조를 읽지 못해/)
    // **코멘트는 읽었다** — 그 조회는 성공했고, 못 읽은 것은 문서 쪽이다.
    expect(screen.queryByText(/코멘트 수를 읽지 못했습니다/)).toBeNull()
    // 0이라고도 말하지 않는다.
    expect(screen.queryByText(/코멘트는 없습니다/)).toBeNull()
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

describe('적용 — 기존 커밋 경로를 탄다', () => {
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

  it('undo 하나가 페이지 전체를 되돌린다', async () => {
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
   * **빈 프리셋은 패턴 삽입의 `'empty'` 실패 갈래(`edit/pattern-insert.ts`)에 닿지 않는다.**
   * 빈 프리셋은 실패가 아니라 **성공하는 조작**이고(치우기), 프리셋은 `patternInsert`를 아예
   * 지나지 않는다(별도 경로). 그래서 알림이 뜨지 않는다.
   */
  it('빈 프리셋은 실패 문장을 내지 않는다 — 패턴 삽입의 empty 갈래에 닿지 않는다', async () => {
    const backend = server({ presets: [EMPTY_PRESET] })
    await openPage(doc(), { apiOverrides: backend.api })

    await openPicker()
    await applyPreset(EMPTY_PRESET.id)

    await waitFor(() => {
      expect(backend.calls.length).toBe(1)
    })
    expect(alertText()).toBeNull()
  })

  it('빈 프리셋은 페이지를 비우고 선택도 비운다', async () => {
    const backend = server({ presets: [EMPTY_PRESET] })
    await openPage(doc(), { apiOverrides: backend.api })

    fireEvent.click(within(structureRegion()).getByRole('button', { name: structureRowName('Card') }))
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
    // **문장이 이유로 끝난다 — 콜론 뒤가 비지 않는다.**
    expect(alertText()).toContain('알 수 없는 컴포넌트 타입')
    expect(backend.calls).toEqual([])
    // 문서는 손대지 않은 그대로다 — 되돌릴 것이 없다.
    expect(structureTypes()).toContain('Text')
  })
})

/**
 * ***"고아 코멘트가 화면에서 무해하다"*를 실제로 잰다** — 적용 전 확인 문장(«코멘트 N개는
 * 지워지지 않지만 …»)이 그것에 걸려 있다.
 *
 * 여기서 재는 것은 **적용 뒤의 화면**이다. 코멘트 탭 자체가 사라진 노드를 갈라 보이는
 * 것은 `comment-panel.test.tsx`가 재고, 여기서는 **프리셋 적용이 그 상태를 만든다는 것**을
 * 잰다.
 */
describe('적용 — 코멘트는 남는다', () => {
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
    await waitFor(() => expect(screen.getByRole('tab', { name: '코멘트' }).getAttribute('aria-selected')).toBe('true'))

    // **본문이 그대로 있다** — 행은 서버에 남고 문서에서만 사라진다.
    const titles = [...document.body.querySelectorAll('.wb-shell-comment-group-title')].map(
      (element) => element.textContent?.replace(/\s+/g, ' ').trim() ?? '',
    )
    expect(titles).toEqual(['– 사라진 노드 (n-a)', '– 사라진 노드 (n-box)'])
    // **던지지 않는다** — 셸이 그대로 서 있다(이 패널은 오류 경계 밖이다).
    expect(screen.getByRole('region', { name: '구조 트리' })).toBeTruthy()
  })
})

describe('저장', () => {
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
 * 키 핸들러는 트리와 툴바를 **함께** 감싸는 상자에 붙어 있고(`structure-tree.tsx`), 프리셋
 * 고르개가 그 상자 안에 **타이핑하는 칸**(프리셋 이름)을 넣는다. 첫 단축키가 수식 키 없는 `Delete`·`Backspace`를 삭제로 받으므로,
 * 이름을 고치다 오타를 지우면 **고른 노드가 지워지고 그 편집이 서버로 나간다.**
 *
 * **이름 칸 하나를 예외로 두지 않는다.** 같은 상자에 앞으로 들어올 입력 칸이 전부
 * 지켜져야 하므로, 규칙은 *"타이핑하는 표면에서 난 키는 구조 조작이 아니다"*다 —
 * `structure-keyboard.test.tsx`가 그 규칙을 고르개의 `<select>`로도 잰다.
 */
describe('입력 칸에서 친 키는 구조 조작으로 새지 않는다', () => {
  it('프리셋 이름 칸의 Backspace가 노드를 지우지 않는다', async () => {
    const backend = server()
    await openPage(doc(), { apiOverrides: backend.api })

    fireEvent.click(within(structureRegion()).getByRole('button', { name: structureRowName('Text') }))
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

describe('단축키 — 판정 없는 조작', () => {
  it('Alt+Shift+P가 프리셋 고르개를 연다', async () => {
    const backend = server()
    await openPage(doc(), { apiOverrides: backend.api })

    fireEvent.keyDown(within(structureRegion()).getByRole('button', { name: structureRowName('Card') }), {
      code: 'KeyP',
      altKey: true,
      shiftKey: true,
    })

    await screen.findByRole('group', { name: '프리셋 고르기' })
  })

  /**
   * **이것이 `StructureAbilities`에 자리를 두지 않는 이유다.** 선택이 없으면
   * `structureAbilities`가 전부 `false`인 `NOTHING`을 내므로, 그 표에 키를 더하면
   * **정확히 이 상태에서만** 단축키가 죽는다.
   */
  it('선택이 없어도 열린다 — 자리를 고르는 조작이 아니다', async () => {
    const backend = server()
    await openPage(doc(), { apiOverrides: backend.api })
    // **고른 것이 없는 상태를 손으로 만든다.** 페이지를 열면 스토어가 루트를 고른 채로
    // 시작하므로(`store/editor-store.ts`의 `#selectionFor`), 그냥 열어서는 이 케이스가 재려는
    // 상태가 아니다. 캔버스 빈 자리를 누르는 것이 사용자가 그 상태에 이르는 길이다.
    deselect()

    fireEvent.keyDown(keyTarget(), { code: 'KeyP', altKey: true, shiftKey: true })

    await screen.findByRole('group', { name: '프리셋 고르기' })
  })

  it('Alt+Shift+I가 패턴 고르개를 연다 — 패턴만 단축키가 없는 상태를 끝낸다', async () => {
    const backend = server()
    await openPage(doc(), { apiOverrides: backend.api })
    // **고른 것이 없는 상태를 손으로 만든다.** 페이지를 열면 스토어가 루트를 고른 채로
    // 시작하므로(`store/editor-store.ts`의 `#selectionFor`), 그냥 열어서는 이 케이스가 재려는
    // 상태가 아니다. 캔버스 빈 자리를 누르는 것이 사용자가 그 상태에 이르는 길이다.
    deselect()

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

/**
 * **화면 상태**(설계 spec 「페이지 JSON · 프리셋 · 붙여넣기」) — 저장이 페이지의 상태 목록을 함께 보내고, 적용이 프리셋의 목록을 페이지
 * 목록에 잇는다. 잇는 규칙의 칸마다는 `test/edit/preset-apply-view-states.test.ts` 가 잰다 — 여기는 셸이 그 둘을 잇는지와 통지다.
 */
describe('화면 상태', () => {
  const ADMIN = { id: 's_admin', name: '관리자' }
  const stateArea = (states: string[]) => ({
    id: 'p_sw',
    type: 'StateSwitch',
    children: [
      { id: 'p_cd', type: 'StateCase', props: { state: 'default' }, children: [] },
      ...states.map((state, index) => ({ id: `p_c${index}`, type: 'StateCase', props: { state }, children: [] })),
    ],
  })

  it('저장이 페이지의 상태 목록을 함께 보낸다', async () => {
    const withStates: PageDocument = { ...doc(), viewStates: [ADMIN] }
    const backend = server({ document: withStates })
    await openPage(withStates, { apiOverrides: backend.api })
    await openPicker()
    fireEvent.change(screen.getByLabelText('프리셋 이름'), { target: { value: '상태 화면' } })
    fireEvent.click(pickerButton('현재 페이지를 프리셋으로 저장'))
    await waitFor(() => expect(backend.created).toHaveLength(1))
    expect(backend.created[0]!.viewStates).toEqual([ADMIN])
  })

  it('카나리아 — 상태가 없는 페이지의 저장은 목록 키를 안 싣는다', async () => {
    const backend = server()
    await openPage(doc(), { apiOverrides: backend.api })
    await openPicker()
    fireEvent.change(screen.getByLabelText('프리셋 이름'), { target: { value: '상태 없음' } })
    fireEvent.click(pickerButton('현재 페이지를 프리셋으로 저장'))
    await waitFor(() => expect(backend.created).toHaveLength(1))
    expect('viewStates' in backend.created[0]!).toBe(false)
  })

  it('적용이 프리셋의 상태 목록을 페이지에 싣는다 — 편집 하나 · 검증 오류 0', async () => {
    const preset: Preset = { ...PROJECT_PRESET, nodes: [stateArea(['s_admin'])], viewStates: [ADMIN] }
    const backend = server({ presets: [preset] })
    await openPage(doc(), { apiOverrides: backend.api })
    await openPicker()
    await applyPreset(preset.id)
    await waitFor(() => expect(backend.calls).toHaveLength(1))
    const after = applyOps(doc(), backend.calls[0]!.ops)
    expect(after.viewStates).toEqual([ADMIN])
    expect(after.root.children![0]!.children!.map((child) => child.props?.state)).toEqual(['default', 's_admin'])
    expect(partitionIssues(validatePage(after)).errors).toEqual([])
  })

  it('목록 없이 저장된 프리셋의 가지 가운데 페이지에 없는 상태의 것을 빼고 말한다', async () => {
    const preset: Preset = { ...PROJECT_PRESET, nodes: [stateArea(['s_gone'])] }
    const backend = server({ presets: [preset] })
    await openPage(doc(), { apiOverrides: backend.api })
    await openPicker()
    await applyPreset(preset.id)
    await waitFor(() => expect(backend.calls).toHaveLength(1))
    await waitFor(() => expect(alertText()).toBe(droppedCasesNotice([{ state: 's_gone', count: 1 }], [])))
    expect(alertText()).toBe('상태 "s_gone" 가지 1개를 뺐습니다.')
  })
})
