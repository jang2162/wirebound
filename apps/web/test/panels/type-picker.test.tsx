/**
 * 타입 목록과 노드 추가. **`<App />`을 라우트째 렌더한다**(`../editor-harness`).
 *
 * **`페이지에 둘 수 있는 모든 타입이 목록에 있다`가 이 파일의 하중이다** — 분모를 손으로
 * 적지 않고 `listComponents()`에서 계산하므로, 카탈로그에 컴포넌트가 늘면 여기서 죽는다.
 * 그것이 "그룹 표를 손으로 두지 않는다"는 판단을 지키는 자리다.
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  COMPONENT_GROUPS,
  COMPONENT_GROUP_LABELS,
  getComponent,
  listComponents,
  validatePage,
  type ComponentGroup,
  type PageDocument,
  type PatchOp,
} from '@wirebound/schema'
import { ApiError, type ApiClient } from '../../src/api/client'
import type { PageDetail, PatchResult } from '../../src/api/types'
import { deselect, HEAD_SEQ, openPage, pageDetail, pageDoc, structureTypes } from '../editor-harness'
import { createNode } from '../../src/edit/create-node'
import '../../src/catalog-setup'
import { isOff, treeTool, structureRowName, structureRowType } from './tree-row'

/**
 * ```
 * n-root (Page)
 * ├ n-a   (Text)     none — `안에 추가`가 비활성이어야 한다
 * ├ n-box (Card)     many · 자식 하나
 * │  └ n-1 (Button)
 * ├ n-empty (Section) many · children 키가 **없다** — 배열째 add 갈래를 탄다
 * └ n-c   (Divider)
 * ```
 */
function doc(): PageDocument {
  return pageDoc({
    id: 'n-root',
    type: 'Page',
    children: [
      { id: 'n-a', type: 'Text' },
      { id: 'n-box', type: 'Card', children: [{ id: 'n-1', type: 'Button' }] },
      { id: 'n-empty', type: 'Section' },
      { id: 'n-c', type: 'Divider' },
    ],
  })
}

const INITIAL_TYPES = ['Page', 'Text', 'Card', 'Button', 'Section', 'Divider']

interface Server {
  calls: { ops: PatchOp[]; baseSeq: number }[]
  api: Partial<ApiClient>
}

function server(): Server {
  const calls: { ops: PatchOp[]; baseSeq: number }[] = []
  let seq = HEAD_SEQ
  let held = doc()

  const patchOps: ApiClient['patchOps'] = async (_projectId, _pageId, body) => {
    calls.push({ ops: body.ops, baseSeq: body.baseSeq })
    const { applyOps, invertOps } = await import('@wirebound/schema')
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

  return { calls, api: { patchOps, getPage } }
}

function structureRegion(): HTMLElement {
  return screen.getByRole('region', { name: '구조 트리' })
}

function toolButton(name: string): HTMLElement {
  return treeTool(structureRegion(), name)
}

function select(type: string): void {
  fireEvent.click(within(structureRegion()).getByRole('button', { name: structureRowName(type) }))
}

function selectedType(): string | null {
  return structureRowType(structureRegion().querySelector('.wb-shell-structure-node[aria-current="true"]'))
}

/** 타입 목록. 열려 있지 않으면 던진다. */
function picker(): HTMLElement {
  return within(structureRegion()).getByRole('group', { name: '타입 고르기' })
}

function typeSelect(): HTMLSelectElement {
  return within(picker()).getByRole<HTMLSelectElement>('combobox', { name: '타입' })
}

/** 목록에 실린 타입 이름들. `value`를 보는 것은 보이는 글자에 표시가 붙기 때문이다. */
function optionValues(): string[] {
  return [...typeSelect().options].map((option) => option.value)
}

/** 설명 줄의 글자. 서 있지 않으면 던진다 — 없는 것과 빈 것을 갈라야 한다. */
function description(): string {
  const node = picker().querySelector('.wb-shell-picker-desc')
  if (node === null) throw new Error('설명 줄이 없습니다')
  return node.textContent ?? ''
}

/** 그 타입의 갈래. 카탈로그에서 읽는다 — 여기 표를 두면 재려는 것을 스스로 적는 셈이다. */
function groupOf(type: string): ComponentGroup {
  return getComponent(type)!.group
}

function pick(type: string): void {
  fireEvent.change(typeSelect(), { target: { value: type } })
  fireEvent.click(within(picker()).getByRole('button', { name: '추가' }))
}

function undoButton(): HTMLButtonElement {
  return within(screen.getByRole('group', { name: '편집 이력' })).getByRole<HTMLButtonElement>(
    'button',
    { name: '되돌리기' },
  )
}

/**
 * 페이지 문서에 둘 수 있는 타입. **손으로 적지 않는다** — 카탈로그를 훑어 실제로
 * `validatePage`를 통과하는 것만 남긴다(`../edit/create-node.test.ts`의 `페이지에 둘 수 없는
 * 타입은 Slot뿐이다`와 같은 계산이다). **뿌리가 될 수 있는 타입(`Page`)은 뺀다** — 안에 두면 한 장이 뿌리를 둘 갖는다(`panels/type-picker.tsx` 의 `placeableGroups`).
 */
function placeableTypes(): string[] {
  return listComponents()
    .filter((def) => {
      const node = createNode(def.type, () => 'n-probe')
      if (node === null) return false
      if (!validatePage({ version: 1, root: node }).some((issue) => issue.code === 'bad-root')) return false
      return (
        validatePage({ version: 1, root: { id: 'r', type: 'Page', children: [node] } }).length === 0
      )
    })
    .map((def) => def.type)
}

describe('타입 목록과 노드 추가', () => {
  it('페이지에 둘 수 있는 모든 타입이 목록에 있다', async () => {
    // **이 파일의 하중이다.** 분모가 `listComponents()`에서 계산되므로 카탈로그에 컴포넌트가
    // 늘면 여기서 죽는다 — 그것이 "그룹 표를 손으로 두지 않는다"는 판단을 지킨다.
    await openPage(doc(), { apiOverrides: server().api })
    select('Card')
    fireEvent.click(toolButton('안에 추가'))

    expect(optionValues().slice().sort()).toEqual(placeableTypes().slice().sort())
    expect(optionValues().length).toBeGreaterThan(0)
  })

  it('페이지에 둘 수 없는 타입은 목록에 없다', async () => {
    // `Slot`은 어디에 넣어도 `slot-count`가 난다(설계서 「레이아웃」 — `Slot`은 레이아웃
    // 전용이다). 목록에 두면 고르는 순간 서버가 422를 내므로 **보내 봐야 실패할 편집을
    // 만들지 않는다**.
    await openPage(doc(), { apiOverrides: server().api })
    select('Card')
    fireEvent.click(toolButton('안에 추가'))

    const blocked = listComponents()
      .map((def) => def.type)
      .filter((type) => !placeableTypes().includes(type))

    // 상태 영역 둘(`THEMELESS_TYPES`)은 홀로 설 수 없어 같은 거름에 빠진다 — 팔레트에도 카드가 없다. 나누기는 명령으로만 한다.
    // `Page` 는 뿌리 타입이라 안에 못 둔다(`bad-root` 가 안 나는 타입).
    expect(blocked).toEqual(['Page', 'Slot', 'StateSwitch', 'StateCase'])
    for (const type of blocked) {
      expect(optionValues(), type).not.toContain(type)
    }
  })

  it('옵션 글자가 영문 타입명이 아니라 카탈로그의 한국어 이름이다', async () => {
    // **한국어 UI가 `EntryForm`·`KeyValue`를 그대로 내면** *"그것이 무엇인가"*를 화면이
    // 답하지 않는다. 분모를 손으로 적지 않는다 —
    // 카탈로그의 `def.label`과 대조하므로 이름을 고치면 여기가 따라간다.
    await openPage(doc(), { apiOverrides: server().api })
    select('Card')
    fireEvent.click(toolButton('안에 추가'))

    const labels = new Map(listComponents().map((def) => [def.type, def.label]))
    for (const option of typeSelect().options) {
      const label = labels.get(option.value)!
      expect(option.textContent?.startsWith(label), option.value).toBe(true)
      // 영문 타입명이 옵션에 남아 있으면 안 된다. `Text`처럼 이름이 짧은 것도
      // 있으므로 **정확히 그 타입명이 낱말로** 들어 있는지 본다.
      expect(option.textContent, option.value).not.toContain(option.value)
    }
  })

  it('갈래별로 optgroup이 서고 라벨이 한국어다', async () => {
    // **손으로 둔 표가 없다는 것을 여기서 잰다.** 그룹도 그룹 이름도 카탈로그가 준다
    // (`def.group` · `COMPONENT_GROUP_LABELS`) — 그 분류가 런타임에 있으므로 화면은 그룹
    // 표를 손으로 두지 않고 카탈로그에서 optgroup을 세운다.
    await openPage(doc(), { apiOverrides: server().api })
    select('Card')
    fireEvent.click(toolButton('안에 추가'))

    const groups = [...typeSelect().querySelectorAll('optgroup')]
    const expected = COMPONENT_GROUPS.filter((group) =>
      placeableTypes().some((type) => group === groupOf(type)),
    )
    expect(groups.map((group) => group.getAttribute('label'))).toEqual(
      expected.map((group) => COMPONENT_GROUP_LABELS[group]),
    )

    // **어느 옵션도 그룹 밖에 있지 않다.** 하나라도 새면 그 타입은 목록에서 눈에 안 띈다.
    expect(groups.flatMap((group) => [...group.querySelectorAll('option')]).length).toBe(
      typeSelect().options.length,
    )
  })

  it('그룹 안은 한국어 이름순이다', async () => {
    // **영문 타입명순이 아니다.** 보이는 글자와 순서가 갈리면 목록을 훑는 사람이 어디를
    // 봐야 할지 모른다 — 보이는 이름이 한국어이므로 정렬 기준도 한국어 이름이다.
    await openPage(doc(), { apiOverrides: server().api })
    select('Card')
    fireEvent.click(toolButton('안에 추가'))

    const labels = new Map(listComponents().map((def) => [def.type, def.label]))
    const groups = [...typeSelect().querySelectorAll('optgroup')]
    // **분모가 0이면 이 케이스는 아무것도 재지 않는다** — `<optgroup>`을 없앤 판에서는
    // 루프가 0번 돌아 조용히 통과한다. 여기서 막는다.
    expect(groups.length).toBeGreaterThan(0)

    let differsFromTypeOrder = 0
    for (const group of groups) {
      const types = [...group.querySelectorAll('option')].map((option) => option.value)
      const names = types.map((type) => labels.get(type)!)
      expect(names, group.getAttribute('label') ?? '').toEqual(
        names.slice().sort((a, b) => a.localeCompare(b, 'ko')),
      )
      // **양성 대조.** 두 순서가 어디서도 갈리지 않으면 위 단언은 영문 타입명순 구현도
      // 통과시킨다 — 그러면 «한국어 이름순»이라는 제목이 거짓이 된다.
      if (types.join() !== types.slice().sort().join()) differsFromTypeOrder += 1
    }
    expect(differsFromTypeOrder).toBeGreaterThan(0)
  })

  it('옵션 글자에 설명을 붙이지 않는다', async () => {
    // **긴 옵션이 좌측 패널을 터뜨리는 고장을 막는 자리다** — 옵션 글자가 길면 `<select>`가
    // 240px 좌측 패널을 넘친다(`<select>` 2px, `shell.css`의 표). `<option>`은 잘려도 아무 신호가
    // 없으므로 설명은 아래 자기 줄로 간다.
    await openPage(doc(), { apiOverrides: server().api })
    select('Card')
    fireEvent.click(toolButton('안에 추가'))

    const descriptions = listComponents().map((def) => def.description)
    for (const option of typeSelect().options) {
      for (const description of descriptions) {
        expect(option.textContent, `${option.value} / ${description}`).not.toContain(description)
      }
      // 표시(`담을 수 있음`)까지 해서 이름 + 11자가 상한이다. 넘으면 설명이 샌 것이다.
      expect([...(option.textContent ?? '')].length, option.value).toBeLessThanOrEqual(23)
    }
  })

  it('고른 타입의 설명이 자기 줄에 서고 select에 묶인다', async () => {
    await openPage(doc(), { apiOverrides: server().api })
    select('Card')
    fireEvent.click(toolButton('안에 추가'))

    fireEvent.change(typeSelect(), { target: { value: 'EntryForm' } })
    const id = typeSelect().getAttribute('aria-describedby')
    expect(id).toBeTruthy()
    const desc = picker().querySelector(`#${id}`)
    // **영문 타입명이 여기 있다.** 목록이 한국어가 되면서 내보낸 JSON·설계 문서가 부르는
    // 이름과 잇는 자리가 화면에 이것 하나뿐이다.
    expect(desc?.textContent).toContain('EntryForm')
    expect(desc?.textContent).toContain(getComponent('EntryForm')!.description)
    expect(desc?.classList.contains('wb-shell-picker-desc')).toBe(true)
  })

  it('고르개를 바꾸면 설명도 바뀐다', async () => {
    // **양성 대조다.** 없으면 첫 타입의 설명을 박아 두는 구현이 통과한다.
    await openPage(doc(), { apiOverrides: server().api })
    select('Card')
    fireEvent.click(toolButton('안에 추가'))

    fireEvent.change(typeSelect(), { target: { value: 'KeyValue' } })
    expect(description()).toContain(getComponent('KeyValue')!.description)
    fireEvent.change(typeSelect(), { target: { value: 'Divider' } })
    expect(description()).toContain(getComponent('Divider')!.description)
    expect(description()).not.toContain(getComponent('KeyValue')!.description)
  })

  it('자식을 담을 수 있는 타입이 표시된다', async () => {
    // **런타임 정보로 가른다** — `def.children === 'many'`.
    // 이름과 표시를 갈라 두어야(`value`는 타입 이름, 보이는 글자에만 표시) 위 대조가
    // 표시 문구에 흔들리지 않는다.
    await openPage(doc(), { apiOverrides: server().api })
    select('Card')
    fireEvent.click(toolButton('안에 추가'))

    const many = new Set(
      listComponents().filter((def) => def.children === 'many').map((def) => def.type),
    )
    for (const option of typeSelect().options) {
      expect(option.textContent?.includes('담을 수 있음'), option.value).toBe(many.has(option.value))
    }
  })

  it('안에 추가로 고르면 선택 노드의 마지막 자식이 된다', async () => {
    await openPage(doc(), { apiOverrides: server().api })
    select('Card')
    fireEvent.click(toolButton('안에 추가'))
    pick('Text')

    // `n-box`의 자식이 둘이 되고 새 노드가 뒤다.
    await waitFor(() =>
      expect(structureTypes()).toEqual([
        'Page', 'Text', 'Card', 'Button', 'Text', 'Section', 'Divider',
      ]),
    )
  })

  it('아래 추가로 고르면 선택 노드의 다음 형제가 된다', async () => {
    await openPage(doc(), { apiOverrides: server().api })
    select('Card')
    fireEvent.click(toolButton('아래 추가'))
    pick('Link')

    // `n-box` **뒤**여야 한다 — 그 자식 뒤가 아니고 루트 끝도 아니다.
    await waitFor(() =>
      expect(structureTypes()).toEqual([
        'Page', 'Text', 'Card', 'Button', 'Link', 'Section', 'Divider',
      ]),
    )
  })

  it('추가하면 add op이 나간다', async () => {
    const srv = server()
    await openPage(doc(), { apiOverrides: srv.api })
    select('Card')
    fireEvent.click(toolButton('안에 추가'))
    pick('Text')

    await waitFor(() => expect(srv.calls).toHaveLength(1))
    const ops = srv.calls[0]?.ops
    expect(ops).toHaveLength(1)
    expect(ops?.[0]?.op).toBe('add')
    expect(ops?.[0]?.path).toBe('/root/children/1/children/1')
  })

  it('children 키가 없는 컨테이너에는 배열째 add한다', async () => {
    // **`children` 키가 없으면 배열째 add하는 갈래다.** `createNode`가 `children`을 만들지
    // 않으므로 새로 만든 컨테이너는 전부 이 경로를 지난다.
    const srv = server()
    await openPage(doc(), { apiOverrides: srv.api })
    select('Section')
    fireEvent.click(toolButton('안에 추가'))
    pick('Text')

    await waitFor(() => expect(srv.calls).toHaveLength(1))
    expect(srv.calls[0]?.ops).toEqual([
      { op: 'add', path: '/root/children/2/children', value: expect.objectContaining({}) },
    ])
    // 값이 배열이어야 한다 — 노드 하나를 그대로 놓으면 `children`이 노드가 된다.
    expect(Array.isArray((srv.calls[0]?.ops[0] as { value: unknown }).value)).toBe(true)
  })

  it('추가한 노드가 선택된다', async () => {
    // 사용자가 방금 만든 것을 바로 편집할 수 있어야 한다.
    await openPage(doc(), { apiOverrides: server().api })
    select('Card')
    fireEvent.click(toolButton('안에 추가'))
    pick('Link')

    await waitFor(() => expect(selectedType()).toBe('Link'))
  })

  it('추가한 노드에 속성 패널이 그 타입의 필드를 보인다', async () => {
    // **속성 편집과 이어진다는 증거다** — 새로 만든 노드가 카탈로그의 `editor` 명세를 지나
    // 위젯으로 그려진다.
    await openPage(doc(), { apiOverrides: server().api })
    select('Card')
    fireEvent.click(toolButton('안에 추가'))
    pick('Link')

    const panel = screen.getByRole('complementary', { name: '우측 패널' })
    await waitFor(() => expect(within(panel).getByRole('heading').textContent).toBe('Link'))
    expect(within(panel).getByLabelText('라벨')).toBeTruthy()
  })

  it('취소하면 아무것도 나가지 않는다', async () => {
    // **양성 대조다.** 없으면 늘 보내는 구현이 통과한다.
    const srv = server()
    await openPage(doc(), { apiOverrides: srv.api })
    select('Card')
    fireEvent.click(toolButton('안에 추가'))
    fireEvent.change(typeSelect(), { target: { value: 'Text' } })

    fireEvent.click(within(picker()).getByRole('button', { name: '취소' }))

    expect(srv.calls).toHaveLength(0)
    expect(structureTypes()).toEqual(INITIAL_TYPES)
    // 목록이 닫힌다 — 열린 채 남으면 취소가 아무 일도 안 한 것으로 보인다.
    expect(within(structureRegion()).queryByRole('group', { name: '타입 고르기' })).toBeNull()
  })

  /**
   * **목록을 연 «뒤에» 선택이 움직일 수 있다** — 목록은 툴바 안에 있지만 트리 줄은 그
   * 옆에 그대로 있으므로, 열어 둔 채 다른 노드를 누르는 것이 흔한 경로다.
   *
   * **목록이 남으면 그때 고른 것이 «옮긴 뒤의 선택»에 꽂힌다** — `addNode`가 클릭
   * 시점의 `selectedNodeId`를 보기 때문이다. **잰 값:**
   * `Card`에서 목록을 열고 `Text`(카탈로그가 `children: 'none'`)로 옮긴 뒤 고르면
   *
   * ```
   * add /root/children/0/children  value: [Divider]
   * ```
   *
   * 이 나간다 — **`Text`에 `children` 배열을 만드는 편집**이고, 그 결과 문서에
   * `validatePage`가 `children-not-allowed`(**error**)를 낸다. 즉 서버의 편집 파이프라인
   * 6단계가 `invalid`로 거절하는 편집이다(`apps/api/src/services/edit-pipeline.ts` —
   * 소스로 확인했고 DB가 없어 실행으로는 재지 않았다). *"보내 봐야 거절될 편집은 만들지
   * 않는다"*(`edit/structure-actions.ts` 머리말)가 막으려던 부류 그대로다.
   *
   * **그래서 목록이 닫힌다.** 그것을 정하는 것이 `panels/structure-toolbar.tsx`의
   * `visiblePicker`이고, 거기 조건이 `abilities.addInside`라 **잠금만이 아니라 이 전이도
   * 함께 답한다.** 잠금 쪽 케이스는 `../lock/toolbar-abilities.test.tsx`가 갖고, 잠금이
   * 아닌 이 축을 재는 것이 여기 하나다.
   *
   * **`adding`은 비우지 않는다** — 다시 담을 수 있는 노드로 옮기면 목록이 그대로 돌아온다.
   * 그것도 함께 잰다(비우는 구현과 여기서 갈린다).
   */
  it('목록을 연 뒤 자식을 못 담는 노드로 옮기면 닫히고, 돌아오면 다시 열린다', async () => {
    const srv = server()
    await openPage(doc(), { apiOverrides: srv.api })
    select('Card')
    fireEvent.click(toolButton('안에 추가'))
    expect(within(structureRegion()).getByRole('group', { name: '타입 고르기' })).toBeTruthy()

    select('Text')

    expect(within(structureRegion()).queryByRole('group', { name: '타입 고르기' })).toBeNull()
    expect(isOff(toolButton('안에 추가'))).toBe(true)
    // 목록이 없으니 나갈 편집도 없다 — 위 머리말의 `add …/children`이 여기서 사라진다.
    expect(srv.calls).toHaveLength(0)

    select('Card')

    expect(within(structureRegion()).getByRole('group', { name: '타입 고르기' })).toBeTruthy()
  })

  it('children이 none인 노드에는 안에 추가가 비활성이다', async () => {
    await openPage(doc(), { apiOverrides: server().api })
    select('Text')

    expect(isOff(toolButton('안에 추가'))).toBe(true)
    expect(toolButton('안에 추가').title).toBe(
      '자식을 담을 수 있는 타입이어야 하고, children이 배열이어야 합니다',
    )
  })

  it('루트는 아래 추가가 비활성이다', async () => {
    // 루트에는 형제가 없다. 안에 추가는 되어야 한다(`Page`는 `many`다).
    await openPage(doc(), { apiOverrides: server().api })
    select('Page')

    expect(isOff(toolButton('아래 추가'))).toBe(true)
    expect(isOff(toolButton('안에 추가'))).toBe(false)
  })

  it('undo하면 추가한 노드가 사라진다', async () => {
    const srv = server()
    await openPage(doc(), { apiOverrides: srv.api })
    select('Card')
    fireEvent.click(toolButton('안에 추가'))
    pick('Text')

    await waitFor(() => expect(structureTypes()).toHaveLength(INITIAL_TYPES.length + 1))
    await waitFor(() => expect(undoButton().disabled).toBe(false))
    fireEvent.click(undoButton())

    await waitFor(() => expect(structureTypes()).toEqual(INITIAL_TYPES))
    // 서버가 만든 `inverse`가 되보내진다 — 배열 자리의 `add`이므로 `remove` 하나다.
    await waitFor(() => expect(srv.calls).toHaveLength(2))
    expect(srv.calls[1]?.ops).toEqual([{ op: 'remove', path: '/root/children/1/children/1' }])
  })

  it('고른 것이 없으면 추가 항목에 닿는 줄이 없다 — 뿌리 `+`의 «페이지에 추가»만 선다', async () => {
    await openPage(doc(), { apiOverrides: server().api })
    // **고른 것이 없는 상태를 손으로 만든다.** 페이지를 열면 스토어가 루트를 고른 채로
    // 시작하므로(`store/editor-store.ts`의 `#selectionFor`), 그냥 열어서는 이 케이스가 재려는
    // 상태가 아니다. 캔버스 빈 자리를 누르는 것이 사용자가 그 상태에 이르는 길이다.
    deselect()

    // 판정(`structureAbilities`)이 선택 없음에 `NOTHING`을 내는 것은 그대로다 — 줄 행동은 고른 줄의 것이라 그 상태에서는 없고,
    // 페이지에 더하는 길은 뿌리 `+`가 뿌리를 골라 연다(`panels/structure-tree.tsx`).
    expect(structureRegion().querySelectorAll('.wb-shell-tree-row-picked')).toHaveLength(0)
    expect(isOff(toolButton('페이지에 추가'))).toBe(false)
  })
})
