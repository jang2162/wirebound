/**
 * 구조 트리의 키보드 단축키.
 *
 * **단축키는 툴바 버튼과 같은 함수를 부른다** — 두 경로가 갈리면 한쪽만 고쳐지는 자리가
 * 생긴다. `단축키와 버튼이 같은 op을 만든다`가 그것을 고정한다.
 *
 * **가장 무거운 케이스는 `속성 패널에서 타이핑 중에는 …`이다.** 전역 리스너의 함정이고,
 * 없으면 텍스트를 지우려고 Delete를 누른 사용자가 노드를 잃는다.
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { PatchOp } from '@wirebound/schema'
import type { ApiClient, } from '../../src/api/client'
import type { PageDetail, PatchResult } from '../../src/api/types'
import { HEAD_SEQ, openPage, pageDetail, pageDoc, structureTypes } from '../editor-harness'
import '../../src/catalog-setup'

/**
 * ```
 * n-root (Page)
 * ├ n-a   (Text)     첫 형제 — 위로가 비활성이다
 * ├ n-box (Card)     자식 하나
 * │  └ n-1 (Button)
 * └ n-c   (Divider)  막내
 * ```
 */
function doc(): ReturnType<typeof pageDoc> {
  return pageDoc({
    id: 'n-root',
    type: 'Page',
    children: [
      { id: 'n-a', type: 'Text', props: { content: '지울 글자' } },
      { id: 'n-box', type: 'Card', children: [{ id: 'n-1', type: 'Button' }] },
      { id: 'n-c', type: 'Divider' },
    ],
  })
}

const INITIAL_TYPES = ['Page', 'Text', 'Card', 'Button', 'Divider']

interface Server {
  calls: { ops: PatchOp[]; baseSeq: number }[]
  api: Partial<ApiClient>
}

/**
 * **초기 문서를 인자로 받는다.** 대역이 든 문서가 화면의 것과 다르면 `invertOps`가
 * 엉뚱한 경로를 보고, 편집이 실패해 재조회가 **대역의 문서**로 화면을 갈아 끼운다 —
 * 트리가 갑자기 다른 문서가 된다.
 */
function server(initial: ReturnType<typeof pageDoc> = doc()): Server {
  const calls: { ops: PatchOp[]; baseSeq: number }[] = []
  let seq = HEAD_SEQ
  let held = initial

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

/** 트리의 노드 줄. 키 이벤트를 여기서 일으킨다 — 사용자가 고른 줄이 포커스를 갖는다. */
function row(type: string): HTMLElement {
  return within(structureRegion()).getByRole('button', { name: type })
}

function select(type: string): void {
  fireEvent.click(row(type))
}

function toolButton(name: string): HTMLButtonElement {
  return within(within(structureRegion()).getByRole('group', { name: '구조 편집' })).getByRole(
    'button',
    { name },
  )
}

/** 속성 패널의 컨트롤. Delete가 여기서는 노드를 지우면 안 된다. */
function panelInput(label: string): HTMLElement {
  return within(screen.getByRole('complementary', { name: '우측 패널' })).getByLabelText(label)
}

describe('구조 트리의 키보드 단축키', () => {
  it('구조 트리에 포커스가 있을 때 Delete가 노드를 지운다', async () => {
    await openPage(doc(), { apiOverrides: server().api })
    select('Card')

    fireEvent.keyDown(row('Card'), { key: 'Delete' })

    await waitFor(() => expect(structureTypes()).toEqual(['Page', 'Text', 'Divider']))
  })

  it('Backspace도 지운다', async () => {
    // **macOS 노트북 키보드에는 `Delete`(forward delete) 키가 없다** — 그 자리의 키가
    // 내는 것이 `Backspace`다. 둘 다 받지 않으면 그 기기에서 삭제 단축키가 없는 셈이다.
    // (Backspace가 브라우저 "뒤로 가기"였던 것은 Chrome 52에서 제거됐다 — 그 값은
    // 릴리스 노트를 읽은 것이지 **내가 잰 것이 아니다.**)
    await openPage(doc(), { apiOverrides: server().api })
    select('Card')

    fireEvent.keyDown(row('Card'), { key: 'Backspace' })

    await waitFor(() => expect(structureTypes()).toEqual(['Page', 'Text', 'Divider']))
  })

  it('속성 패널에서 타이핑 중에는 Delete가 노드를 지우지 않는다', async () => {
    // **단축키를 트리 상자에만 붙이는 이유다.** 전역 리스너로 만들면 여기서 노드가 사라진다 — 사용자는 글자를
    // 지우려 했을 뿐이다.
    const srv = server()
    await openPage(doc(), { apiOverrides: srv.api })
    select('Text')

    fireEvent.keyDown(panelInput('내용'), { key: 'Delete' })
    fireEvent.keyDown(panelInput('내용'), { key: 'Backspace' })

    expect(structureTypes()).toEqual(INITIAL_TYPES)
    expect(srv.calls).toHaveLength(0)
  })

  /**
   * **속성 패널 케이스만으로는 부족하다.** 그쪽은 **다른 서브트리**라 키가 여기로
   * 버블되지 않아 저절로 안전하고, *"이 상자 안에서 타이핑하면 어떻게 되는가"*는 재지
   * 않는다. 고르개는 **이 상자 안**에 그려지므로 거기서
   * 난 키는 그대로 핸들러에 온다.
   *
   * **`<select>`가 그 부류의 첫 자리다.** `Alt`+`↑`는 브라우저에서 목록을 여는 조합이라
   * 사용자는 **고르려고** 누르는데, 문서에서는 노드가 움직인다.
   */
  it('고르개에서 친 키가 구조 조작으로 새지 않는다', async () => {
    const srv = server()
    await openPage(doc(), { apiOverrides: srv.api })
    select('Card')
    fireEvent.click(toolButton('안에 추가'))
    const picker = await screen.findByLabelText('타입')

    fireEvent.keyDown(picker, { key: 'ArrowUp', altKey: true })
    fireEvent.keyDown(picker, { key: 'Delete' })

    expect(structureTypes()).toEqual(INITIAL_TYPES)
    expect(srv.calls).toHaveLength(0)
  })

  /**
   * **표면을 태그 이름으로 가르면 구멍이 남는다.** 아래 둘(shadow root · `role="textbox"`)은
   * `apps/web`이 아직 그리지 않지만, 상자 안에 들어오면 태그로 가르는 판정은 그 키로
   * 노드를 지운다 — 재현되는 고장이므로 케이스로 둔다.
   *
   * **상자 안에 진짜 DOM 노드를 넣어 잰다.** 이 화면이 그런 표면을 아직 그리지 않으므로
   * 그리는 척하는 대신 **핸들러가 붙은 상자에 직접 붙이고 네이티브 이벤트를 올린다** —
   * React는 루트에서 위임받으므로 자기가 그리지 않은 노드에서 난 이벤트도 그대로 지난다.
   */
  function handlerBox(): HTMLElement {
    const list = document.body.querySelector('.wb-shell-structure')
    const box = list?.parentElement
    if (!box) throw new Error('키 핸들러가 붙은 상자를 찾지 못했습니다')
    return box
  }

  /** 상자 안에 붙인 요소에서 키를 올린다. 붙인 것은 케이스가 끝나면 함께 사라진다. */
  function keyFrom(element: HTMLElement, init: KeyboardEventInit): void {
    handlerBox().appendChild(element)
    element.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ...init }))
  }

  it('shadow root를 든 요소에서 난 키는 구조 조작이 아니다', async () => {
    const srv = server()
    await openPage(doc(), { apiOverrides: srv.api })
    select('Card')

    // **이벤트가 호스트로 리타게팅된다** — 안에서 무엇이 났는지(입력 칸인지 버튼인지)
    // 밖에서는 볼 수 없다. 그래서 호스트를 열어 보지 않고 통째로 물러선다.
    const host = document.createElement('div')
    host.attachShadow({ mode: 'open' })
    keyFrom(host, { key: 'Delete' })

    expect(structureTypes()).toEqual(INITIAL_TYPES)
    expect(srv.calls).toHaveLength(0)
  })

  it('role이 편집 표면이라고 말하는 요소도 마찬가지다', async () => {
    const srv = server()
    await openPage(doc(), { apiOverrides: srv.api })
    select('Card')

    const textbox = document.createElement('div')
    textbox.setAttribute('role', 'textbox')
    keyFrom(textbox, { key: 'Backspace' })

    expect(structureTypes()).toEqual(INITIAL_TYPES)
    expect(srv.calls).toHaveLength(0)
  })

  it('평범한 상자에서 난 키는 그대로 단축키다 — 반대편', async () => {
    const srv = server()
    await openPage(doc(), { apiOverrides: srv.api })
    select('Card')

    keyFrom(document.createElement('div'), { key: 'Delete' })

    await waitFor(() => expect(srv.calls).toHaveLength(1))
  })

  it('Alt+위/아래가 순서를 바꾼다', async () => {
    await openPage(doc(), { apiOverrides: server().api })
    select('Card')

    fireEvent.keyDown(row('Card'), { key: 'ArrowUp', altKey: true })

    await waitFor(() =>
      expect(structureTypes()).toEqual(['Page', 'Card', 'Button', 'Text', 'Divider']),
    )
  })

  it('Alt 없는 화살표는 순서를 바꾸지 않는다', async () => {
    // 화살표만으로 옮기면 트리를 **읽으려고** 누른 키가 문서를 바꾼다.
    const srv = server()
    await openPage(doc(), { apiOverrides: srv.api })
    select('Card')

    fireEvent.keyDown(row('Card'), { key: 'ArrowUp' })
    fireEvent.keyDown(row('Card'), { key: 'ArrowDown' })

    expect(structureTypes()).toEqual(INITIAL_TYPES)
    expect(srv.calls).toHaveLength(0)
  })

  it('Tab이 트리 안에서 들여쓰기를 하지 않는다', async () => {
    // **Tab은 포커스 이동이다 — 빼앗으면 키보드 사용자가 트리를 빠져나갈 수 없다.**
    // 들여쓰기 단축키로 쓰고 싶어지는 자리라 케이스로 못박는다.
    const srv = server()
    await openPage(doc(), { apiOverrides: srv.api })
    select('Divider')

    // `fireEvent`는 기본 동작이 막히지 않았을 때 `true`를 낸다.
    expect(fireEvent.keyDown(row('Divider'), { key: 'Tab' })).toBe(true)
    expect(fireEvent.keyDown(row('Divider'), { key: 'Tab', shiftKey: true })).toBe(true)
    expect(structureTypes()).toEqual(INITIAL_TYPES)
    expect(srv.calls).toHaveLength(0)
  })

  it('단축키가 비활성 조작을 실행하지 않는다', async () => {
    // **버튼과 같은 판정을 지난다.** 키 이벤트는 `disabled`를 지나지 않으므로
    // 여기가 그 판정이 실제로 걸리는 유일한 자리다.
    const srv = server()
    await openPage(doc(), { apiOverrides: srv.api })
    select('Text')
    expect(toolButton('위로').disabled).toBe(true)

    fireEvent.keyDown(row('Text'), { key: 'ArrowUp', altKey: true })

    expect(structureTypes()).toEqual(INITIAL_TYPES)
    expect(srv.calls).toHaveLength(0)
  })

  it('앞 형제가 none이면 들여쓰기 단축키가 아무것도 하지 않는다', async () => {
    // **이 케이스가 판정 검사의 하중이다 — 위 케이스만으로는 판정 검사를 지워도 0 사망이다.**
    //
    // 순서 이동·삭제는 판정을 지우고 실행해도 뒤에서 막힌다: `moveNodeOps`가 범위 밖
    // 인덱스에 `null`을 내고, `removeNodeOps`는 루트에 `null`을 낸다. **들여쓰기만 다르다** —
    // `moveNodeOps`는 **설계상 타입을 읽지 않으므로**(카탈로그에 없는 타입도 옮길 수
    // 있어야 한다) 앞 형제가 자식을 담을 수 없어도 ops를 만든다.
    //
    // 실측: `Text` 안으로 `Text`를 넣는 문서가 만들어지고 `validatePage`가
    // `children-not-allowed`를 낸다 — 그대로 나가면 서버가 422다. 그것을 막는 것이
    // `structureAbilities.indent` 하나뿐이고, 단축키는 그것을 **직접** 지나야 한다.
    const srv = server()
    await openPage(doc(), { apiOverrides: srv.api })
    select('Divider')
    // 앞 형제가 `Card`가 아니라… 확인: `n-c`의 앞은 `n-box`(Card)이므로 가능하다.
    // 앞 형제가 `none`인 자리는 `n-box`다(앞이 `n-a`, Text).
    select('Card')
    expect(toolButton('들여쓰기').disabled).toBe(true)

    fireEvent.keyDown(row('Card'), { key: 'ArrowRight', altKey: true, shiftKey: true })

    expect(structureTypes()).toEqual(INITIAL_TYPES)
    expect(srv.calls).toHaveLength(0)
  })

  it('들여쓰기·내어쓰기 단축키가 실제로 옮긴다', async () => {
    // 위 케이스의 양성 대조. `n-c`(Divider)의 앞 형제는 `n-box`(Card)라 들여쓸 수 있다.
    //
    // **`→`가 들여쓰기다** — 깊이를 늘리는 방향이고, 메뉴 트리도 같다
    // (`test/panels/tree-shortcuts.test.tsx`가 둘을 대조한다).
    await openPage(doc(), { apiOverrides: server().api })
    select('Divider')

    fireEvent.keyDown(row('Divider'), { key: 'ArrowRight', altKey: true, shiftKey: true })

    await waitFor(() =>
      expect(
        within(structureRegion())
          .getByRole('button', { name: 'Card' })
          .closest('li')
          ?.contains(within(structureRegion()).getByRole('button', { name: 'Divider' })),
      ).toBe(true),
    )

    fireEvent.keyDown(row('Divider'), { key: 'ArrowLeft', altKey: true, shiftKey: true })

    await waitFor(() =>
      expect(
        within(structureRegion())
          .getByRole('button', { name: 'Card' })
          .closest('li')
          ?.contains(within(structureRegion()).getByRole('button', { name: 'Divider' })),
      ).toBe(false),
    )
  })

  it('Shift 없는 Alt+좌우는 아무것도 하지 않는다', async () => {
    // **`Alt`+`←`·`→`는 Windows·Linux 브라우저의 뒤로/앞으로다.** 그 조합을 쓰지 않기로
    // 했다는 것을 케이스로 못박는다 — 나중에 "화살표만으로 충분하다"고 줄이면 여기서 죽는다.
    const srv = server()
    await openPage(doc(), { apiOverrides: srv.api })
    select('Divider')

    expect(fireEvent.keyDown(row('Divider'), { key: 'ArrowLeft', altKey: true })).toBe(true)
    expect(fireEvent.keyDown(row('Divider'), { key: 'ArrowRight', altKey: true })).toBe(true)
    expect(structureTypes()).toEqual(INITIAL_TYPES)
    expect(srv.calls).toHaveLength(0)
  })

  it('내어쓴 뒤 들여쓰면 제자리가 아니다', async () => {
    // **결함이 아니라 «들여쓰기는 앞 형제의 마지막 자식으로 간다»의 귀결이다 — 그 성질을
    // 여기 고정한다.** 첫 자식이 아니었던 노드는 돌아올 때 뒤로 밀린다. 제자리로 돌아오는
    // 왕복은 **들여쓴 뒤 내어쓰기**이고 그쪽은 `structure-toolbar.test.tsx`가 잰다.
    //
    // **단축키는 연달아 누르는 자리라 이 성질이 눈에 띈다.** 적어 두지 않으면 다음
    // 사람이 이것을 결함으로 읽고 "돌아온 자리를 기억하는" 상태를 만들려 한다 — 그것은
    // 조작마다 이력을 드는 일이고 순수 판정(`structureAbilities`) 밖이다.
    const nested = pageDoc({
      id: 'n-root',
      type: 'Page',
      children: [
        {
          id: 'n-p',
          type: 'Card',
          children: [
            { id: 'n-x', type: 'Text' },
            { id: 'n-y', type: 'Link' },
          ],
        },
        { id: 'n-q', type: 'Divider' },
      ],
    })
    await openPage(nested, { apiOverrides: server(nested).api })
    select('Text')

    const inCard = (): boolean => {
      const card = within(structureRegion()).getByRole('button', { name: 'Card' }).closest('li')
      const text = within(structureRegion()).getByRole('button', { name: 'Text' })
      return card?.contains(text) ?? false
    }
    expect(inCard()).toBe(true)

    // 내어쓰기(`←`) → `Card` 밖으로 나온다.
    fireEvent.keyDown(row('Text'), { key: 'ArrowLeft', altKey: true, shiftKey: true })
    await waitFor(() => expect(inCard()).toBe(false))
    expect(structureTypes()).toEqual(['Page', 'Card', 'Link', 'Text', 'Divider'])

    // 다시 들여쓰기(`→`) → `Card` 안으로 돌아온다.
    fireEvent.keyDown(row('Text'), { key: 'ArrowRight', altKey: true, shiftKey: true })
    await waitFor(() => expect(inCard()).toBe(true))

    // **하지만 제자리가 아니다.** 원래는 `Link` **앞**이었는데 이제 뒤다 — 전위 순회로는
    // 세 상태가 전부 같아 보이므로(`Page, Card, Link, Text, Divider`) 형제 순서를 직접 본다.
    const cardRow = within(structureRegion()).getByRole('button', { name: 'Card' }).closest('li')
    const siblings = [...(cardRow?.querySelectorAll('.wb-shell-structure-node') ?? [])].map(
      (row) => row.textContent,
    )
    expect(siblings).toEqual(['Card', 'Link', 'Text'])
  })

  it('루트에서 Delete는 아무것도 하지 않는다', async () => {
    // 삭제도 같은 판정을 지난다.
    const srv = server()
    await openPage(doc(), { apiOverrides: srv.api })
    select('Page')

    fireEvent.keyDown(row('Page'), { key: 'Delete' })

    expect(structureTypes()).toEqual(INITIAL_TYPES)
    expect(srv.calls).toHaveLength(0)
  })

  it('고른 노드가 없으면 단축키가 아무것도 하지 않는다', async () => {
    const srv = server()
    await openPage(doc(), { apiOverrides: srv.api })

    fireEvent.keyDown(row('Card'), { key: 'Delete' })

    expect(structureTypes()).toEqual(INITIAL_TYPES)
    expect(srv.calls).toHaveLength(0)
  })

  it('단축키와 버튼이 같은 op을 만든다', async () => {
    // **두 경로가 갈리지 않는다.** 같은 문서·같은 선택에서 각각 내고 나가는 ops를
    // 맞대 본다.
    const viaKey = server()
    await openPage(doc(), { apiOverrides: viaKey.api })
    select('Card')
    fireEvent.keyDown(row('Card'), { key: 'ArrowDown', altKey: true })
    await waitFor(() => expect(viaKey.calls).toHaveLength(1))

    screen.getByRole('region', { name: '구조 트리' }) // 앞 렌더가 살아 있는지 확인
    const keyOps = viaKey.calls[0]?.ops

    // 화면을 새로 띄워 같은 조작을 버튼으로 낸다.
    const { cleanup } = await import('@testing-library/react')
    cleanup()
    const viaButton = server()
    await openPage(doc(), { apiOverrides: viaButton.api })
    select('Card')
    fireEvent.click(toolButton('아래로'))
    await waitFor(() => expect(viaButton.calls).toHaveLength(1))

    expect(keyOps).toEqual(viaButton.calls[0]?.ops)
  })

  it('삭제 단축키도 선택을 부모로 옮긴다', async () => {
    // 버튼과 같은 함수를 부른다는 것의 다른 면 — «지우면 선택이 부모로 간다»가 단축키 경로에도 그대로 온다.
    await openPage(doc(), { apiOverrides: server().api })
    select('Button')

    fireEvent.keyDown(row('Button'), { key: 'Delete' })

    await waitFor(() =>
      expect(
        structureRegion().querySelector('.wb-shell-structure-node[aria-current="true"]')
          ?.textContent,
      ).toBe('Card'),
    )
  })
})
