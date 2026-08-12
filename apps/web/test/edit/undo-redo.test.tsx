/**
 * undo / redo. **서버에 undo 개념은 없다** — 되돌리기도 새 편집으로 나가고, 보내는 ops는
 * 서버가 준 `inverse` 그대로다(설계 §7.1). 클라이언트는 `invertOps`를 부르지 않는다.
 *
 * 화면은 `<App />`을 라우트째 띄운다. 되돌리기 버튼은 셸의 `편집 이력` 묶음에 있고,
 * 편집은 속성 패널의 컨트롤로 낸다 — **사용자가 실제로 지나는 길 그대로다.**
 */
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { PatchOp } from '@wirebound/schema'
import { ApiError, type ApiClient } from '../../src/api/client'
import type { PatchResult } from '../../src/api/types'
import { openPage, pageDetail, pageDoc } from '../editor-harness'
import '../../src/catalog-setup'

const TEXT_ID = 'n-text'
const FIELD_ID = 'n-field'
const OLD_TEXT = '옛 내용'

/** `Text`(textarea·select)와 `Field`(text·switch·select)를 함께 둔다 — 컨트롤 종류별로 갈라 본다. */
const DOC = pageDoc({
  id: 'n-root',
  type: 'Page',
  children: [
    { id: TEXT_ID, type: 'Text', props: { content: OLD_TEXT, role: 'body' } },
    { id: FIELD_ID, type: 'Field', props: { label: '이름', required: true } },
    // 구조 트리 클릭으로 노드를 옮기는 케이스가 쓴다.
    { id: 'n-text2', type: 'Text', props: { content: '둘째 내용', role: 'body' } },
  ],
})

/** `props`가 **없는** 노드. 통째 `add`의 `inverse`(`remove /…/props`)로 undo가 도는지 본다. */
const BARE_DOC = pageDoc({
  id: 'n-root',
  type: 'Page',
  children: [{ id: FIELD_ID, type: 'Field' }],
})

interface Server {
  calls: { ops: PatchOp[]; baseSeq: number }[]
  api: Partial<ApiClient>
}

/**
 * **서버 대역이 진짜 `invertOps`로 `inverse`를 만든다.** 손으로 적은 `inverse`를 쓰면
 * "클라이언트가 계산하지 않는다"를 재는 케이스가 서버 것과 구별되지 않는다 — 여기서는
 * 서버만 아는 값(적용 **직전** 문서)에서 나오게 하고, 그 값이 그대로 되보내지는지 본다.
 */
function server(options: { failAt?: number } = {}): Server {
  const calls: { ops: PatchOp[]; baseSeq: number }[] = []
  let seq = 7
  // 서버가 든 문서. 클라이언트의 낙관적 사본과 별개다.
  let held = DOC

  const patchOps: ApiClient['patchOps'] = async (_projectId, _pageId, body) => {
    calls.push({ ops: body.ops, baseSeq: body.baseSeq })
    if (options.failAt === calls.length) {
      throw new ApiError(409, 'conflict', '충돌 [T10]')
    }
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

  return { calls, api: { patchOps } }
}

function panel(): HTMLElement {
  return screen.getByRole('complementary', { name: '우측 패널' })
}

function select(type: string): void {
  fireEvent.click(
    within(screen.getByRole('region', { name: '구조 트리' })).getAllByRole('button', {
      name: type,
    })[0]!,
  )
}

function widget(label: string): HTMLElement {
  const found = within(panel()).queryByLabelText<HTMLElement>(label)
  if (found === null) throw new Error(`위젯이 없다: ${label}`)
  return found
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

function canvasTextOf(nodeId: string): string {
  const node = document.body.querySelector(`[data-wb-id="${nodeId}"]`)
  if (node === null) throw new Error(`캔버스에 노드가 없다: ${nodeId}`)
  return node.textContent ?? ''
}

/** 텍스트 컨트롤에 값을 넣고 blur로 커밋한다(D5). */
function typeAndCommit(label: string, value: string): void {
  const input = widget(label)
  fireEvent.change(input, { target: { value } })
  fireEvent.blur(input)
}

function alertTexts(): string[] {
  return screen.queryAllByRole('alert').map((element) => element.textContent ?? '')
}

describe('undo / redo', () => {
  it('undo하면 앞 값으로 돌아간다', async () => {
    const { calls, api } = server()
    await openPage(DOC, { apiOverrides: api })

    select('Text')
    typeAndCommit('내용', '새 내용')
    await waitFor(() => expect(calls).toHaveLength(1))
    expect(canvasTextOf(TEXT_ID)).toBe('새 내용')

    fireEvent.click(undoButton())

    await waitFor(() => expect(canvasTextOf(TEXT_ID)).toBe(OLD_TEXT))
  })

  it('undo도 서버에 새 편집으로 나간다', async () => {
    // 서버에 undo 개념이 없다(README) — 같은 `PATCH .../ops`를 한 번 더 부른다.
    const { calls, api } = server()
    await openPage(DOC, { apiOverrides: api })

    select('Text')
    typeAndCommit('내용', '새 내용')
    await waitFor(() => expect(calls).toHaveLength(1))

    fireEvent.click(undoButton())

    await waitFor(() => expect(calls).toHaveLength(2))
    // 앞 요청의 `seq` 위에서 만들어진다.
    expect(calls[1]?.baseSeq).toBe(8)
  })

  it('undo가 보내는 ops는 서버가 준 inverse 그대로다', async () => {
    // **설계 §7.1의 계약이다.** 로컬에서 `invertOps`를 부르는 구현을 잡는다 — 여기서는
    // 서버 대역이 **자기가 든 문서**에서 `inverse`를 만들고, 클라이언트의 낙관적 사본과
    // 다른 값이 나오도록 첫 편집 전에 서버 쪽을 미리 바꿔 둔다.
    const { calls, api } = server()
    await openPage(DOC, { apiOverrides: api })

    select('Text')
    typeAndCommit('내용', '새 내용')
    await waitFor(() => expect(calls).toHaveLength(1))

    fireEvent.click(undoButton())
    await waitFor(() => expect(calls).toHaveLength(2))

    const { invertOps } = await import('@wirebound/schema')
    const serverInverse = invertOps(DOC, calls[0]!.ops)
    expect(calls[1]?.ops).toEqual(serverInverse)
  })

  it('props가 없던 노드도 undo로 돌아간다', async () => {
    // **계획서가 남긴 위험이다** — 통째 `add`한 편집의 `inverse`는 `[remove /…/props]`
    // 하나이고(웨이브 2 실측), 그것으로 원래 상태(= `props` 없음)에 정확히 돌아가는지는
    // 재지 않았다. 여기서 잰다.
    const calls: { ops: PatchOp[] }[] = []
    let held = BARE_DOC
    let seq = 7
    const patchOps: ApiClient['patchOps'] = async (_p, _pg, body) => {
      calls.push({ ops: body.ops })
      const { applyOps, invertOps } = await import('@wirebound/schema')
      const inverse = invertOps(held, body.ops)
      held = applyOps(held, body.ops)
      seq += 1
      return { seq, revisionId: `rev-${seq}`, inverse, schemaVersion: 1 }
    }
    await openPage(BARE_DOC, { apiOverrides: { patchOps } })

    select('Field')
    fireEvent.click(widget('필수'))
    await waitFor(() => expect(calls).toHaveLength(1))
    // 통째 `add`가 나갔다 — `props`가 없던 노드다.
    expect(calls[0]?.ops).toEqual([
      { op: 'add', path: '/root/children/0/props', value: { required: true } },
    ])

    fireEvent.click(undoButton())
    await waitFor(() => expect(calls).toHaveLength(2))

    expect(calls[1]?.ops).toEqual([{ op: 'remove', path: '/root/children/0/props' }])
    // 스위치가 다시 꺼진다 — `props`가 통째로 사라졌으므로.
    await waitFor(() => expect((widget('필수') as HTMLInputElement).checked).toBe(false))
  })

  it('redo하면 다시 적용된다', async () => {
    const { calls, api } = server()
    await openPage(DOC, { apiOverrides: api })

    select('Text')
    typeAndCommit('내용', '새 내용')
    await waitFor(() => expect(calls).toHaveLength(1))
    fireEvent.click(undoButton())
    await waitFor(() => expect(canvasTextOf(TEXT_ID)).toBe(OLD_TEXT))

    fireEvent.click(redoButton())

    await waitFor(() => expect(canvasTextOf(TEXT_ID)).toBe('새 내용'))
    await waitFor(() => expect(calls).toHaveLength(3))
  })

  it('undo 뒤 새 편집을 하면 redo가 사라진다', async () => {
    // 표준 undo 의미론 — 되돌아갈 미래가 없어진다.
    const { calls, api } = server()
    await openPage(DOC, { apiOverrides: api })

    select('Text')
    typeAndCommit('내용', '새 내용')
    await waitFor(() => expect(calls).toHaveLength(1))
    fireEvent.click(undoButton())
    await waitFor(() => expect(redoButton().disabled).toBe(false))

    typeAndCommit('내용', '또 다른 내용')

    await waitFor(() => expect(redoButton().disabled).toBe(true))
  })

  it('되돌릴 것이 없으면 undo가 비활성이다', async () => {
    const { calls, api } = server()
    await openPage(DOC, { apiOverrides: api })

    expect(undoButton().disabled).toBe(true)
    expect(redoButton().disabled).toBe(true)

    // 양성 대조: 편집하면 켜진다. 이것이 없으면 늘 비활성인 구현도 통과한다.
    select('Text')
    typeAndCommit('내용', '새 내용')
    await waitFor(() => expect(calls).toHaveLength(1))
    await waitFor(() => expect(undoButton().disabled).toBe(false))
  })

  it('적용할 수 없는 inverse는 스택에서 빼고 안내한다', async () => {
    // **설계 §7.3의 계약 — 에러가 아니라 정상 흐름이다.** 다른 사람이 그 노드를 지웠으면
    // 내 `inverse`가 적용되지 않는 것이 당연하고, 그때 멈추면 스택 맨 위에 갇힌다.
    // 서버가 없는 경로를 가리키는 `inverse`를 주도록 대역을 바꾼다.
    const calls: { ops: PatchOp[] }[] = []
    let seq = 7
    const patchOps: ApiClient['patchOps'] = async (_p, _pg, body) => {
      calls.push({ ops: body.ops })
      seq += 1
      return {
        seq,
        revisionId: `rev-${seq}`,
        // 없는 노드를 가리킨다 — `applyOps`가 던진다.
        inverse: [{ op: 'replace', path: '/root/children/9/props/content', value: 'x' }],
        schemaVersion: 1,
      }
    }
    await openPage(DOC, { apiOverrides: { patchOps } })

    select('Text')
    typeAndCommit('내용', '새 내용')
    await waitFor(() => expect(calls).toHaveLength(1))
    expect(undoButton().disabled).toBe(false)

    fireEvent.click(undoButton())
    await act(async () => {})

    // 요청은 나가지 않았고(적용조차 못 했다), 스택에서 빠져 버튼이 다시 비활성이다.
    expect(calls).toHaveLength(1)
    expect(undoButton().disabled).toBe(true)
    // 그리고 안내한다 — 조용히 아무 일도 안 일어나면 사용자는 버튼이 고장 났다고 읽는다.
    await waitFor(() => expect(alertTexts()[0]).toContain('건너뛰었습니다'))
  })

  it('페이지를 옮기면 스택이 비워진다', async () => {
    // 남의 페이지 revision을 되돌리지 않는다.
    const { calls, api } = server()
    await openPage(DOC, {
      apiOverrides: api,
      docs: { 'pg-2': pageDoc({ id: 'n-other', type: 'Page' }) },
    })

    select('Text')
    typeAndCommit('내용', '새 내용')
    await waitFor(() => expect(calls).toHaveLength(1))
    await waitFor(() => expect(undoButton().disabled).toBe(false))

    fireEvent.click(within(screen.getByRole('region', { name: '메뉴·페이지 트리' })).getByRole('link', { name: '회원 상세' }))

    await waitFor(() => expect(undoButton().disabled).toBe(true))
  })

  it('편집이 실패하면 스택이 오염되지 않는다', async () => {
    // Task 6의 재조회 뒤다. 문서가 서버 것으로 되돌아갔으므로 그 전 revision의 `inverse`를
    // 되보내면 서버 상태와 어긋난다.
    const { calls, api } = server({ failAt: 2 })
    await openPage(DOC, { apiOverrides: api })

    select('Text')
    typeAndCommit('내용', '새 내용')
    await waitFor(() => expect(calls).toHaveLength(1))
    await waitFor(() => expect(undoButton().disabled).toBe(false))

    typeAndCommit('내용', '실패할 내용')
    await waitFor(() => expect(calls).toHaveLength(2))
    await act(async () => {})

    await waitFor(() => expect(undoButton().disabled).toBe(true))
    expect(redoButton().disabled).toBe(true)
  })

  it('undo하면 속성 패널의 스위치도 되돌아간다', async () => {
    // **`applyEdit`은 `selectedNodeId`를 건드리지 않는다** — 즉 undo가 문서를 갈아 끼울 때
    // 위젯은 마운트된 채로 남는다. 캔버스만 보는 케이스로는 그 성질이 잡히지 않는다.
    // 스위치는 로컬 state를 들지 않고 문서를 그대로 비추므로 여기서 하중을 갖는다.
    const { calls, api } = server()
    await openPage(DOC, { apiOverrides: api })

    select('Field')
    expect((widget('필수') as HTMLInputElement).checked).toBe(true)
    fireEvent.click(widget('필수'))
    await waitFor(() => expect(calls).toHaveLength(1))
    expect((widget('필수') as HTMLInputElement).checked).toBe(false)

    fireEvent.click(undoButton())

    await waitFor(() => expect((widget('필수') as HTMLInputElement).checked).toBe(true))
  })

  it('undo하면 속성 패널의 select도 되돌아간다', async () => {
    const { calls, api } = server()
    await openPage(DOC, { apiOverrides: api })

    select('Text')
    fireEvent.change(widget('역할'), { target: { value: 'h2' } })
    await waitFor(() => expect(calls).toHaveLength(1))
    expect((widget('역할') as HTMLSelectElement).value).toBe('h2')

    fireEvent.click(undoButton())

    await waitFor(() => expect((widget('역할') as HTMLSelectElement).value).toBe('body'))
  })

  it('undo하면 텍스트 컨트롤의 입력칸도 되돌아간다', async () => {
    // **앞 판에서는 이것이 깨져 있었다.** `TextControl`은 로컬 초안을 드는데 undo는
    // `selectedNodeId`를 건드리지 않아 위젯이 마운트된 채 문서만 갈리고, `key`도 그대로라
    // 초안이 다시 읽히지 않았다. 실측: 캔버스는 되돌아갔는데 입력칸은 `"새 내용"`을
    // 붙들었고, 거기서 blur하면 `draft !== original`이라 **되돌린 편집이 다시 나갔다**
    // (요청이 셋이 되고 마지막 ops가 방금 취소한 값이었다).
    //
    // 이제 문서 값이 밖에서 바뀌면 초안을 버린다(`controls/text-control.tsx`에 근거가 있다).
    const { calls, api } = server()
    await openPage(DOC, { apiOverrides: api })

    select('Text')
    typeAndCommit('내용', '새 내용')
    await waitFor(() => expect(calls).toHaveLength(1))

    fireEvent.click(undoButton())
    await waitFor(() => expect(canvasTextOf(TEXT_ID)).toBe(OLD_TEXT))

    // 입력칸도 되돌아간다.
    expect((widget('내용') as HTMLTextAreaElement).value).toBe(OLD_TEXT)

    // 그리고 입력을 벗어나도 아무것도 나가지 않는다 — 사용자는 아무것도 치지 않았다.
    fireEvent.blur(widget('내용'))
    await act(async () => {})
    expect(calls).toHaveLength(2)
  })

  it('자기가 커밋해 문서가 바뀐 것은 입력칸을 흔들지 않는다', async () => {
    // **초안 버리기의 양성 대조다.** 타이핑 → blur → 낙관적 적용으로 문서 값이 바뀌는데,
    // 그때도 초안을 버리면 방금 친 값이 사라지거나 깜빡인다. 새 값과 초안이 같은 값이라
    // 보이는 변화가 없어야 한다.
    const { calls, api } = server()
    await openPage(DOC, { apiOverrides: api })

    select('Text')
    typeAndCommit('내용', '내가 친 값')
    await waitFor(() => expect(calls).toHaveLength(1))
    await act(async () => {})

    // 친 값이 그대로 있다.
    expect((widget('내용') as HTMLTextAreaElement).value).toBe('내가 친 값')
    expect(canvasTextOf(TEXT_ID)).toBe('내가 친 값')

    // 한 번 더 벗어나도 다시 나가지 않는다(값이 그대로이므로).
    fireEvent.blur(widget('내용'))
    await act(async () => {})
    expect(calls).toHaveLength(1)
  })

  it('구조 트리를 클릭해 노드를 옮기면 커밋되지 않은 타이핑이 사라진다', async () => {
    // **주석이 오래 주장하던 것의 반대다.** 앞 판은 "구조 트리로 고르면 버튼이 포커스를
    // 받아 blur가 나고 초안이 커밋된다"고 적었는데, 그것은 `focus()`로 잰 값이고 **사용자가
    // 하는 것은 클릭이다.** 실측: 트리 버튼을 클릭하면 `activeElement`가 `BODY`에 남아
    // `blur`가 나지 않고 요청이 0건이며, 입력은 새 노드의 값이 된다 — 캔버스 클릭과
    // 갈리지 않는다.
    //
    // 실브라우저는 플랫폼에 달렸고 **여기서 재지 않았다**(`controls/text-control.tsx`가
    // 아니라 `panels/property-panel.tsx`의 `PropControl` 주석에 그 사실이 있다).
    const { calls, api } = server()
    await openPage(DOC, { apiOverrides: api })

    select('Text')
    fireEvent.focus(widget('내용'))
    fireEvent.change(widget('내용'), { target: { value: '버려질 타이핑' } })

    // 두 번째 `Text` 노드를 **클릭**한다(사용자가 하는 동작).
    fireEvent.click(
      within(screen.getByRole('region', { name: '구조 트리' })).getAllByRole('button', {
        name: 'Text',
      })[1]!,
    )
    await act(async () => {})

    expect(calls).toHaveLength(0)
    expect(document.activeElement?.tagName).toBe('BODY')
    expect((widget('내용') as HTMLTextAreaElement).value).toBe('둘째 내용')
  })

  it('같은 틱에 편집과 undo가 들어와도 요청이 하나씩 나간다', async () => {
    // **D6를 지키는 것은 스토어의 펌프 가드다.** undo/redo 버튼은 속성 패널과 **다른**
    // `useEditCommit` 인스턴스를 쓰므로, 가드가 훅의 `ref`에 있으면 둘이 각자 자기 것을
    // 갖는다. 그 판에서 재면 요청이 셋이 되고 `maxInFlight`가 2이며 **같은 `clientOpId`가
    // 두 요청에 실린다** — 서버는 그 둘째를 409로 거절한다(README: 앞 요청의 `seq`를
    // 받아야 다음 `baseSeq`가 정해진다).
    //
    // 겹침을 재려면 **호출 수가 아니라 동시에 떠 있는 수**를 세야 한다 — 곧바로 resolve하는
    // 가짜로는 두 요청이 겹치는 순간이 존재하지 않아 병렬 전송 판도 통과한다.
    let inFlight = 0
    let maxInFlight = 0
    const opIds: (string | undefined)[] = []
    const calls: PatchOp[][] = []
    let seq = 7
    let held = DOC

    const patchOps: ApiClient['patchOps'] = async (_projectId, _pageId, body) => {
      inFlight += 1
      maxInFlight = Math.max(maxInFlight, inFlight)
      calls.push(body.ops)
      opIds.push(body.clientOpId)
      try {
        // 한 틱 미룬다 — 그래야 겹치는 판에서 실제로 겹친다.
        await new Promise((resolve) => setTimeout(resolve, 0))
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
      } finally {
        inFlight -= 1
      }
    }

    await openPage(DOC, { apiOverrides: { patchOps } })

    // 되돌릴 것을 하나 만든다.
    select('Text')
    typeAndCommit('내용', '편집1')
    await waitFor(() => expect(calls).toHaveLength(1))
    await waitFor(() => expect(undoButton().disabled).toBe(false))

    // **한 틱 안에서** 두 인스턴스가 각각 편집을 낸다: 패널의 blur 커밋과 버튼의 undo.
    fireEvent.change(widget('내용'), { target: { value: '편집2' } })
    await act(async () => {
      fireEvent.blur(widget('내용'))
      fireEvent.click(undoButton())
    })
    await act(async () => {})

    // 겹치지 않았다.
    expect(maxInFlight).toBe(1)
    // 같은 편집이 두 번 나가지도 않았다 — id가 전부 다르다.
    expect(new Set(opIds).size).toBe(opIds.length)
  })
})
