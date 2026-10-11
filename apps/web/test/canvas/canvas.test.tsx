/**
 * 중앙 캔버스. 스토어의 문서를 렌더러로 그리고, 노드를 눌러 고르고, 선택을 아웃라인으로
 * 보여 준다.
 *
 * 모든 케이스가 `<App />`을 라우트째로 렌더한다(`../editor-harness`) — 이유는 그 파일
 * 머리말에 있다. 요지는 조회가 실패한 화면 위에서 조용히 통과하는 단언을 만들지 않는
 * 것이다.
 */
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import type { ReactElement } from 'react'
import { useNavigate } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Focus, Root, view } from '@wirebound/theme-sdk'
import type { EditorStore } from '../../src/store/editor-store'
import {
  CommitProbe,
  OTHER_PAGE_ID,
  OTHER_PAGE_ROUTE,
  OTHER_PAGE_TITLE,
  PAGE_ID,
  PROJECT_NAME,
  PROJECT_ROUTE,
  canvasDocument,
  canvasFrame,
  canvasRootId,
  canvasSurface,
  deselect,
  docWithText,
  HEAD_SEQ,
  nodeElement,
  openPage,
  pageDoc,
  panelTitle,
  renderEditor,
  requireNode,
  selectionOutline,
  stackLayout,
  structureTypes,
  waitForNode,
  type CommitObservation,
  canvasQuery,
} from '../editor-harness'
import { treeTool } from '../panels/tree-row'

/**
 * 셸이 만든 `EditorStore`를 손에 쥐는 장치. **화면만 보는 단언으로는 "선택이 스토어에
 * 들어간다"를 지킬 수 없다** — 캔버스가 선택을 자기 `useState`로 들어도 아웃라인은
 * 똑같이 붙는다. 장치의 생김새와 이유는
 * `../routes/editor-shell.test.tsx` 머리말에 길게 적혀 있다.
 *
 * `vi.mock`은 **적힌 파일에서만** 호이스팅되므로 공용 harness로 옮길 수 없다(실측:
 * harness에 두면 import 순서에 따라 mock이 늦게 걸려 셸이 진짜 스토어를 만든다).
 */
const { createdStores } = vi.hoisted(() => ({ createdStores: [] as unknown[] }))

vi.mock('../../src/store/editor-store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/store/editor-store')>()
  return {
    ...actual,
    EditorStore: class extends actual.EditorStore {
      constructor() {
        super()
        createdStores.push(this)
      }
    },
  }
})

beforeEach(() => {
  createdStores.length = 0
})

/**
 * **테마 뷰를 갈아 끼운 판.** 캔버스가 그리는 테마(기본 하네스의 시험용 로더가 `system-admin@0.1.0` 에 주는 `ADMIN_FIXTURE` —
 * `test/theme-loader.ts`)의 `List` 를 노드 id 로 가른다 —
 * `n-boom` 은 던지고, `n-focus` 는 `Focus` · `marker` 를 쓰는 뷰로 그린다. 나머지 `List` 는 기본 뷰 그대로라 이 파일의
 * 다른 케이스는 영향이 없다.
 *
 * `apps/web` 테스트는 `setupFiles` 가 앱 모듈을 먼저 싣지 않으므로 이 파일 머리의 `vi.mock` 이 닿는다. 닿았는지는
 * `boom.calls` 로 본다(0 이면 모의가 안 닿은 것이다).
 */
const { boom } = vi.hoisted(() => ({ boom: { calls: 0, message: '테마 뷰가 터졌습니다 [A1A-BOOM]' } }))

vi.mock('../admin-theme', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../admin-theme')>()
  const List = actual.ADMIN_FIXTURE.views.List
  if (List === undefined) throw new Error('캔버스 테마에 List 뷰가 없다')
  const BoomList = view((props) => {
    if (props.nodeId === 'n-boom') {
      boom.calls += 1
      throw new Error(boom.message)
    }
    if (props.nodeId === 'n-focus') {
      return (
        <Root marker={{ placement: 'bottom-end', offset: [2, -3] }}>
          <span>머리</span>
          <Focus>
            <div>몸</div>
          </Focus>
        </Root>
      )
    }
    return <List {...props} />
  })
  return { ...actual, ADMIN_FIXTURE: { ...actual.ADMIN_FIXTURE, views: { ...actual.ADMIN_FIXTURE.views, List: BoomList } } }
})

function shellStore(): EditorStore {
  const store = createdStores.at(-1)
  if (store === undefined) throw new Error('셸이 EditorStore를 만들지 않았습니다')
  return store as EditorStore
}

/**
 * 케이스 대부분이 쓰는 문서. 세 겹이다 — `자식을 누르면 자식이 선택된다`가 중첩을
 * 필요로 하고, `Flex`는 구조 구현체가 style을 다는 노드라 줌 케이스의 대조군이 된다.
 */
const DOC = pageDoc({
  id: 'n-root',
  type: 'Page',
  children: [
    {
      id: 'n-flex',
      type: 'Flex',
      props: { direction: 'column' },
      children: [
        {
          id: 'n-search',
          type: 'SearchForm',
          children: [{ id: 'n-field', type: 'Field', props: { label: '가입일' } }],
        },
        { id: 'n-list', type: 'List', props: { items: 2, columns: ['이름', '이메일'] } },
      ],
    },
  ],
})

/** 오류 경계가 도는 동안의 콘솔 출력을 막는다. React와 경계가 각각 한 번씩 찍는다. */
function silenceConsoleError(): ReturnType<typeof vi.spyOn> {
  return vi.spyOn(console, 'error').mockImplementation(() => {})
}

/** 주소를 바꾸는 버튼. 캔버스에는 페이지를 떠나는 길이 없어 테스트가 직접 놓는다. */
function GoTo(props: { to: string }): ReactElement {
  const navigate = useNavigate()
  return (
    <button type="button" onClick={() => navigate(props.to)}>
      이동
    </button>
  )
}

describe('캔버스', () => {
  it('문서를 렌더러로 그린다', async () => {
    await openPage(DOC)

    const list = requireNode('n-list')
    expect(list.getAttribute('data-wb-component')).toBe('List')
    // 구조 이름까지 본다. 자리표시자를 그리는 구현은 이 속성을 만들지 못한다.
    expect(list.getAttribute('data-wb-structure')).toBe('table')
    // props가 실제로 그려졌다는 증거. 렌더러를 거치지 않고 상자만 그리는 구현이라면
    // 컬럼 이름이 나올 수 없다.
    expect(list.textContent).toContain('이메일')
    // 음성 대조: 멀쩡한 문서에는 오류 배너가 없다. `렌더 실패 노드가…`의 짝이다.
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('노드를 누르면 그 노드가 선택된다', async () => {
    await openPage(DOC)
    // 양성 대조: 열자마자 이미 `n-list`가 고른 것이면 아래 단언이 무의미하다. **`null`이
    // 아니라 루트다** — 페이지를 열면 스토어가 루트를 고른 채로 시작한다.
    expect(shellStore().getState().selectedNodeId).toBe('n-root')

    fireEvent.click(requireNode('n-list'))

    // **스토어를 직접 본다.** 아웃라인만 보면 선택을 캔버스의 로컬 state에 든 구현도
    // 통과한다 — 구조 트리·속성 패널은 스토어를 보므로 거기서 배선이 끊긴다.
    expect(shellStore().getState().selectedNodeId).toBe('n-list')
  })

  it('자식을 누르면 자식이 선택된다(부모가 아니라)', async () => {
    await openPage(DOC)

    // 노드 안쪽의 part 엘리먼트를 누른다. 실제 사용자가 누르는 것도 노드의 겉이 아니라
    // 그 안의 글자다.
    const label = requireNode('n-field').querySelector('[data-wb-part="label"]')
    if (label === null) throw new Error('Field의 label part를 찾지 못했습니다')
    fireEvent.click(label)

    // 누른 자리에서 가장 가까운 노드가 선택된다. 조상 셋(`n-search`·`n-flex`·`n-root`)
    // 중 하나가 잡히면 클릭이 위로 새는 구현이다.
    expect(shellStore().getState().selectedNodeId).toBe('n-field')
  })

  it('편집 모드에서 선택 노드에 아웃라인이 붙는다', async () => {
    await openPage(DOC)
    // 양성 대조: 고르기 전 아웃라인은 **루트**에 붙어 있다(페이지를 열면 그것이 고른
    // 자리다). `n-list`가 아니라는 것이 아래 단언을 뜻있게 만드는 값이다.
    expect(selectionOutline()?.getAttribute('data-wb-selected-id')).toBe('n-root')

    fireEvent.click(requireNode('n-list'))

    expect(selectionOutline()?.getAttribute('data-wb-selected-id')).toBe('n-list')

    // 다른 노드를 고르면 아웃라인이 따라간다. 한 번 붙고 마는 구현을 가른다.
    fireEvent.click(requireNode('n-search'))

    expect(selectionOutline()?.getAttribute('data-wb-selected-id')).toBe('n-search')
  })

  it('뷰 모드에서는 아웃라인이 없다', async () => {
    await openPage(DOC)
    fireEvent.click(requireNode('n-list'))
    // 양성 대조: 편집 모드에서는 실제로 보인다. 이것이 없으면 아웃라인을 아예 그리지
    // 않는 구현도 아래를 통과한다.
    expect(selectionOutline()).not.toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '뷰 모드' }))

    expect(selectionOutline()).toBeNull()
    // 사라진 이유가 **모드**여야 한다. 뷰 모드에서 선택을 지워 버리는 구현도 위 단언을
    // 통과하므로, 선택이 그대로 남아 있는지 스토어에서 확인한다.
    expect(shellStore().getState().selectedNodeId).toBe('n-list')

    fireEvent.click(screen.getByRole('button', { name: '편집 모드' }))

    // 돌아오면 다시 보인다. 한 방향만 보면 "뷰 모드를 지나면 영영 안 그린다"도 통과한다.
    expect(selectionOutline()?.getAttribute('data-wb-selected-id')).toBe('n-list')
  })

  it('뷰포트 폭이 캔버스에 적용된다', async () => {
    await openPage(DOC)
    // 양성 대조 겸 초기값. 처음부터 375였다면 아래가 무의미하다.
    expect(canvasFrame().style.width).toBe('1280px')

    fireEvent.change(screen.getByRole('combobox', { name: '뷰포트 폭' }), {
      target: { value: '375' },
    })

    expect(canvasFrame().style.width).toBe('375px')
    expect(shellStore().getState().viewportWidth).toBe(375)
    // 폭은 **상자**가 갖는다. 문서가 다시 그려지거나 사라지면 안 된다.
    expect(nodeElement('n-list')).not.toBeNull()
  })

  it('줌이 transform으로 적용된다', async () => {
    await openPage(DOC)
    // 구조 구현체가 style을 다는 노드를 대조군으로 쓴다. 줌이 문서로 새면 이 값이 바뀐다.
    const before = requireNode('n-flex').getAttribute('style')
    expect(before).toContain('flex')

    fireEvent.click(screen.getByRole('button', { name: '확대' }))

    expect(canvasFrame().style.transform).toBe('scale(1.25)')
    expect(shellStore().getState().zoom).toBe(1.25)
    // **문서를 건드리지 않는다.** 노드에 배율이 실리면 같은 문서가 줌마다 다른
    // 스키마가 된다.
    expect(requireNode('n-flex').getAttribute('style')).toBe(before)
    expect(requireNode('n-flex').getAttribute('style')).not.toContain('scale')
  })

  it('렌더 실패 노드가 있으면 배너로 알린다', async () => {
    const broken = pageDoc({
      id: 'n-root',
      type: 'Page',
      children: [{ id: 'n-ghost', type: '없는타입' }],
    })
    await openPage(broken)

    // 배너는 **캔버스가 만든 것**이어야 한다. 폴백 자신도 같은 메시지를 그리므로
    // (`FallbackNode`), 메시지만 찾으면 배너 없는 구현도 통과한다. 그래서 배너에만
    // 있는 요약을 함께 본다.
    const banner = screen.getByRole('alert')
    expect(banner.textContent).toContain('1개')
    expect(banner.textContent).toContain('알 수 없는 컴포넌트 타입: 없는타입')
    // 폴백은 폴백대로 그려진다. 배너가 문서를 대신 지워 버리면 안 된다.
    expect(requireNode('n-ghost').getAttribute('data-wb-error')).toContain('없는타입')
  })

  it('문서가 없으면 안내를 보여준다', async () => {
    renderEditor({ route: PROJECT_ROUTE, docs: { [PAGE_ID]: DOC } })
    await screen.findByRole('heading', { name: PROJECT_NAME })

    screen.getByText('왼쪽 트리에서 페이지를 고르세요')
    expect(canvasQuery('[data-wb-component]')).toBeNull()

    // 양성 대조: 페이지를 열면 같은 자리에 문서가 그려진다. 이것이 없으면 캔버스가
    // 아무것도 그리지 못하는 구현도 위 단언을 통과한다.
    fireEvent.click(screen.getByRole('link', { name: '회원 목록' }))

    await waitForNode('n-list')
    expect(screen.queryByText('왼쪽 트리에서 페이지를 고르세요')).toBeNull()
  })

  it('빈 자리를 누르면 선택이 풀린다', async () => {
    await openPage(DOC)
    fireEvent.click(requireNode('n-list'))
    expect(shellStore().getState().selectedNodeId).toBe('n-list')

    fireEvent.click(canvasSurface())

    expect(shellStore().getState().selectedNodeId).toBeNull()
    expect(selectionOutline()).toBeNull()
  })

  it('문서는 iframe 안에, 외곽선은 호스트에 그린다', async () => {
    await openPage(docWithText('t1', '안'))
    fireEvent.click(requireNode('t1'))
    expect(canvasDocument().querySelector('[data-wb-id="t1"]')).not.toBeNull()
    expect(document.querySelector('[data-wb-id="t1"]')).toBeNull()
    await waitFor(() => expect(selectionOutline()?.getAttribute('data-wb-selected-id')).toBe('t1'))
    expect(canvasDocument().querySelector('[data-wb-selected-id]')).toBeNull()
  })

  it('iframe 의 head 에 base · theme · tokens 시트가 차례로 있다 — 호스트 head 에는 테마가 없다', async () => {
    await openPage(docWithText('t1', '안'))
    const sheets = [...canvasDocument().head.querySelectorAll('[data-wb-style]')]
    expect(sheets.map((sheet) => sheet.getAttribute('data-wb-style'))).toEqual(['base', 'theme', 'tokens'])
    // 테마 시트는 고정한 판의 파일이다(`<link>`) — 토큰 시트는 manifest 의 기본값을 싣는다.
    expect(sheets[1]?.getAttribute('href')).toBe('/api/theme-packages/system-admin/0.1.0/files/theme.css')
    expect(sheets[2]?.textContent).toContain('--wb-semantic-primary')
    expect(document.head.querySelector('[data-wb-style]')).toBeNull()
  })

  it('iframe 의 빈 자리 클릭은 선택을 푼다', async () => {
    await openPage(docWithText('t1', '안'))
    fireEvent.click(requireNode('t1'))
    await waitFor(() => expect(selectionOutline()).not.toBeNull())

    deselect()

    await waitFor(() => expect(selectionOutline()).toBeNull())
    expect(shellStore().getState().selectedNodeId).toBeNull()
  })

  it('따옴표 · 공백이 든 id 도 고른다', async () => {
    await openPage(docWithText('t"1 x', '안'))
    fireEvent.click(requireNode('t"1 x'))
    await waitFor(() => expect(selectionOutline()?.getAttribute('data-wb-selected-id')).toBe('t"1 x'))
  })

  it('편집 뒤 외곽선이 새 자리에 선다 — 선택은 그대로다', async () => {
    const doc = pageDoc({
      id: 'root',
      type: 'Page',
      children: [
        { id: 't0', type: 'Text', props: { content: '앞' } },
        { id: 't1', type: 'Text', props: { content: '뒤' } },
      ],
    })
    let seq = HEAD_SEQ
    await openPage(doc, {
      apiOverrides: {
        patchOps: async (_projectId, _pageId, body) => {
          seq += 1
          return {
            seq,
            revisionId: `rev-${seq}`,
            inverse: [],
            schemaVersion: 1,
            ...(body.clientOpId === undefined ? {} : { clientOpId: body.clientOpId }),
          }
        },
      },
    })
    const restore = stackLayout(canvasDocument())
    try {
      fireEvent.click(requireNode('t1'))
      // 문서 순서: root 0 · t0 1 · t1 2 — 한 칸이 20px 이다.
      await waitFor(() => expect(selectionOutline()?.style.top).toBe('40px'))

      fireEvent.click(treeTool(screen.getByRole('region', { name: '구조 트리' }), '위로'))

      await waitFor(() => expect(selectionOutline()?.style.top).toBe('20px'))
      expect(selectionOutline()?.getAttribute('data-wb-selected-id')).toBe('t1')
    } finally {
      restore()
    }
  })

  it('외곽선은 뷰의 Focus 를 감싸고, 마커는 뷰가 정한 자리에 선다', async () => {
    const doc = pageDoc({
      id: 'root',
      type: 'Page',
      children: [{ id: 'n-focus', type: 'List', props: {}, marker: 1 }],
    })
    await openPage(doc)
    const restore = stackLayout(canvasDocument())
    try {
      // 레이아웃이 바뀐 것을 iframe 이 다시 재게 한다 — 실브라우저에서는 `ResizeObserver` 가 부르는 자리다. 마커 이펙트는
      // 선택을 안 보므로 이 신호(`measureTick`)가 없으면 옛 자리에 남는다.
      await act(async () => {
        canvasDocument().defaultView!.dispatchEvent(new Event('wb-canvas-measure'))
      })
      fireEvent.click(requireNode('n-focus'))
      // n-focus 는 문서 순서 1 번(상자 top 20). Focus 상자는 `stackLayout` 이 left 10 · top +5 · 50 × 10 으로 준다.
      await waitFor(() => expect(selectionOutline()?.style.top).toBe('25px'))
      const outline = selectionOutline()!
      expect([outline.style.left, outline.style.width, outline.style.height]).toEqual(['10px', '50px', '10px'])
      // bottom-end + [2, -3]: x = 10 + 50 + 2, y = 25 + 10 - 3.
      const marker = document.querySelector<HTMLElement>('.wb-shell-marker[data-wb-marker-for="n-focus"]')
      expect([marker?.style.left, marker?.style.top]).toEqual(['62px', '32px'])
    } finally {
      restore()
    }
  })

  it('id를 잃은 폴백을 눌러도 빈 id가 선택되지 않는다', async () => {
    // id가 없는 값. 렌더러의 모양 가드가 흡수해 `data-wb-id=""`인 폴백이 된다.
    const broken = pageDoc({
      id: 'n-root',
      type: 'Page',
      children: [{ type: 'Text', props: { content: '아이디 없음' } } as never],
    })
    await openPage(broken)

    const orphan = canvasQuery('[data-wb-id=""]')
    if (orphan === null) throw new Error('id 없는 폴백을 찾지 못했습니다')
    fireEvent.click(orphan)

    // 빈 문자열이 스토어에 들어가면 "선택은 있는데 가리키는 노드는 없다"가 된다.
    // 가장 가까운 **id 있는** 조상이 대신 선택된다.
    expect(shellStore().getState().selectedNodeId).toBe('n-root')
  })

  it('다른 페이지를 열면 선택이 남지 않는다', async () => {
    const other = pageDoc({ id: 'n-other', type: 'Page' })
    await openPage(DOC, { docs: { [OTHER_PAGE_ID]: other } })
    fireEvent.click(requireNode('n-list'))
    expect(shellStore().getState().selectedNodeId).toBe('n-list')

    fireEvent.click(screen.getByRole('link', { name: OTHER_PAGE_TITLE }))

    await waitForNode('n-other')
    // 노드 id는 문서 안에서만 뜻이 있다. 남으면 존재하지 않는 노드를 가리킨다 — 그것을
    // 막는 것과 **새 문서의 루트**로 옮기는 것이 한 판정이다(`#selectionFor`).
    expect(shellStore().getState().selectedNodeId).toBe('n-other')
    expect(selectionOutline()?.getAttribute('data-wb-selected-id')).toBe('n-other')
  })

  it('주소가 바뀐 커밋에 앞 페이지가 그려지지 않는다', async () => {
    // **이 케이스는 커밋 하나짜리 창을 본다.** 나머지 케이스가 쓰는 `expect`로는 이 창을
    // 볼 수 없다 — `findBy*`·`waitFor`가 이펙트를 다 흘리고 돌아오기 때문이다
    // (`../test/setup.ts`). 장치의 생김새와 한계는 `../editor-harness`의 `CommitProbe`에 있다.
    const other = pageDoc({ id: 'n-other', type: 'Page' })
    const commits: CommitObservation[] = []
    await openPage(DOC, {
      docs: { [OTHER_PAGE_ID]: other },
      children: <CommitProbe sink={commits} />,
    })
    // 앞 페이지에서 노드를 하나 골라 둔다. 그래야 속성 패널도 앞 페이지의 것을 그리고
    // 있어, 세 화면 전부에서 "앞 페이지가 남았는지"를 볼 수 있다.
    fireEvent.click(requireNode('n-list'))

    // 양성 대조: 읽는 함수 셋이 실제로 지금 화면을 읽는다. 셋 다 빈 값만 돌려주면
    // 아래 필터는 무엇이 그려져 있든 통과한다.
    expect(canvasRootId()).toBe('n-root')
    expect(structureTypes()).toContain('Flex')
    expect(panelTitle()).toBe('List')

    commits.length = 0
    fireEvent.click(screen.getByRole('link', { name: OTHER_PAGE_TITLE }))
    await waitForNode('n-other')

    // 양성 대조: 장치가 **새 주소의 커밋을 실제로 봤다.** 비어 있으면 아래가 공허하다.
    expect(commits.map((commit) => commit.path)).toContain(OTHER_PAGE_ROUTE)

    // 셋 다 pg-1에만 있는 것이다(pg-2의 문서는 루트 하나뿐이고 선택도 없다). 새 주소
    // 아래 커밋에서 하나라도 보이면 그 커밋이 **앞 페이지를 새 주소 밑에 그린 것**이다.
    const stale = commits.filter(
      (commit) =>
        commit.path === OTHER_PAGE_ROUTE &&
        (commit.canvasRootId === 'n-root' || commit.structureTypes.includes('Flex') || commit.panelTitle === 'List'),
    )
    expect(stale).toEqual([])
  })

  it('페이지를 떠나면 선택이 남지 않는다', async () => {
    // 이 케이스만 `clearPage()`의 선택 비우기에 매여 있다. 위 케이스는 `loadPage()`가
    // 대신 지워도 통과하지만, 여기는 새 문서가 오지 않는다.
    await openPage(DOC, { children: <GoTo to={PROJECT_ROUTE} /> })
    fireEvent.click(requireNode('n-list'))
    expect(shellStore().getState().selectedNodeId).toBe('n-list')

    fireEvent.click(screen.getByRole('button', { name: '이동' }))

    await waitFor(() => {
      expect(shellStore().getState().selectedNodeId).toBeNull()
    })
    screen.getByText('왼쪽 트리에서 페이지를 고르세요')
  })
})

/**
 * **테마 뷰 하나가 던져도 캔버스가 산다.** 뷰 본문의 예외는 렌더러가 노드마다 둔 경계가 그 자리에 가둔다
 * (`packages/renderer/src/view-host.tsx`) — 그 노드만 폴백이고 형제 · 선택 · 셸은 산다.
 */
describe('캔버스의 오류 경계', () => {
  const BOOM_DOC = pageDoc({
    id: 'n-root',
    type: 'Page',
    children: [
      { id: 'n-boom', type: 'List', props: { items: 1 } },
      { id: 'n-alive', type: 'Text', props: { content: '산다' } },
    ],
  })

  it('테마 뷰가 던져도 캔버스가 산다 — 그 노드만 폴백이다', async () => {
    const logged = silenceConsoleError()
    try {
      boom.calls = 0
      await openPage(BOOM_DOC)
      await waitForNode('n-alive')

      expect(boom.calls).toBeGreaterThan(0)
      // 던진 문장을 그 노드 자리에 보여 준다. 원인을 감추면 무엇이 터졌는지 알 길이 없다.
      expect(requireNode('n-boom').getAttribute('data-wb-error')).toContain(boom.message)
      expect(requireNode('n-alive').textContent).toBe('산다')
      // 폴백도 `data-wb-id` 를 달아 고를 수 있다.
      fireEvent.click(requireNode('n-boom'))
      expect(shellStore().getState().selectedNodeId).toBe('n-boom')
      // 셸의 나머지가 살아 있다.
      screen.getByRole('navigation', { name: '메뉴와 구조' })
      screen.getByRole('complementary', { name: '우측 패널' })
    } finally {
      logged.mockRestore()
    }
  })
})
