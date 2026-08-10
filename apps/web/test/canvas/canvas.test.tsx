/**
 * 중앙 캔버스. 스토어의 문서를 렌더러로 그리고, 노드를 눌러 고르고, 선택을 아웃라인으로
 * 보여 준다.
 *
 * 모든 케이스가 `<App />`을 라우트째로 렌더한다(`../editor-harness`) — 이유는 그 파일
 * 머리말에 있다. 요지는 조회가 실패한 화면 위에서 조용히 통과하는 단언을 만들지 않는
 * 것이다.
 */
import { fireEvent, screen, waitFor } from '@testing-library/react'
import type { ReactElement } from 'react'
import { useNavigate } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { registerStructure } from '@wirebound/renderer'
import { ListDef, defineComponent, registerComponent } from '@wirebound/schema'
import type { EditorStore } from '../../src/store/editor-store'
import {
  CommitProbe,
  OTHER_PAGE_ID,
  OTHER_PAGE_ROUTE,
  OTHER_PAGE_TITLE,
  PAGE_ID,
  PROJECT_ID,
  PROJECT_NAME,
  PROJECT_ROUTE,
  canvasFrame,
  canvasRootId,
  canvasSurface,
  nodeElement,
  openPage,
  pageDoc,
  panelTitle,
  renderEditor,
  requireNode,
  selectionOutline,
  structureTypes,
  waitForNode,
  type CommitObservation,
} from '../editor-harness'

/**
 * 셸이 만든 `EditorStore`를 손에 쥐는 장치. **화면만 보는 단언으로는 "선택이 스토어에
 * 들어간다"를 지킬 수 없다** — 캔버스가 선택을 자기 `useState`로 들어도 아웃라인은
 * 똑같이 붙는다(실측은 태스크 9 보고서의 변이 표에 있다). 장치의 생김새와 이유는
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
 * **캔버스가 서버가 준 테마를 싣는가 (P4a-3 Task 10).**
 *
 * 이 절이 없으면 캔버스의 `useThemeCss(useProjectTheme(projectId))`를 `useThemeCss()`로
 * 되돌려도 **웹 테스트 858개가 전부 통과한다**(심어서 확인했다). 배선을 지키는 것이
 * 아무것도 없었다는 뜻이고, 이 두 케이스가 그 자리다.
 *
 * 서버가 준 테마에만 있는 값을 심어 `<style>`에서 찾는다 — 내장 폴백(`defaultThemeSource`,
 * 시스템 `admin`)에는 없는 값이라 배선이 끊기면 사라진다.
 */
describe('캔버스와 프로젝트 테마', () => {
  const MARKER = '#123456'

  const SERVER_THEME = {
    meta: { id: 'server', name: '서버가 준 것', version: '1.0.0' },
    components: { Card: { structure: 'plain', base: { bg: MARKER } } },
  }

  /**
   * `List`의 **둘째 구현체.** 카탈로그는 `['table','cardGrid','stackedList','mediaList']`를
   * 선언하는데 렌더러는 오늘 `table` 하나만 등록한다 — 테마가 고른 것이 실제로 쓰이는지
   * 보려면 고를 수 있는 것이 둘이어야 한다.
   */
  const ALT_STRUCTURE = 'cardGrid'

  function listPage() {
    return pageDoc({
      id: 'n_root00000001',
      type: 'Page',
      children: [{ id: 'n_list00000001', type: 'List', props: { items: 2 } }],
    })
  }

  function cardPage() {
    return pageDoc({
      id: 'n_root00000001',
      type: 'Page',
      children: [{ id: 'n_card00000001', type: 'Card', props: { title: '카드' } }],
    })
  }

  function themeCss(): string {
    return document.head.querySelector('style[data-wb-style="theme"]')?.textContent ?? ''
  }

  it('서버가 준 테마를 <style>에 싣는다', async () => {
    await openPage(cardPage(), {
      apiOverrides: { getProjectTheme: async () => ({ theme: SERVER_THEME, issues: [] }) },
    })

    await waitFor(() => expect(themeCss()).toContain(MARKER))
  })

  it('서버가 테마를 주지 않으면 테마 CSS가 비고 문서는 그대로 그려진다', async () => {
    await openPage(cardPage(), {
      apiOverrides: { getProjectTheme: async () => ({ theme: null, issues: [] }) },
    })

    await waitFor(() => expect(themeCss()).toBe(''))
    expect(requireNode('n_card00000001')).toBeTruthy()
  })

  /**
   * **셸이 조회해 온 프로젝트의 id로 요청한다** — `routes/editor.tsx`가 트리·패널에
   * 넘기는 것과 같은 값이다.
   *
   * 처음에 이 단언을 `expect.any(String)`으로 적었는데 **주석이 말하는 것을 지키지
   * 못했다** — 문자열이면 무엇이든 통과하므로 셸이 엉뚱한 id를 넘겨도 웹 861케이스가
   * 전부 통과했다(리뷰가 심어 죽은 수 **0**). 실제 id로 좁힌다.
   */
  it('셸이 조회해 온 프로젝트의 id로 테마를 요청한다', async () => {
    const getProjectTheme = vi.fn(async () => ({ theme: SERVER_THEME, issues: [] }))
    await openPage(cardPage(), { apiOverrides: { getProjectTheme } })

    await waitFor(() => expect(getProjectTheme).toHaveBeenCalled())
    expect(getProjectTheme).toHaveBeenCalledWith(PROJECT_ID)
  })

  /**
   * **W3 — 캔버스가 테마가 고른 구조를 렌더러에 넘기는가.**
   *
   * `theme-structures.test.tsx`는 **함수**(`themeStructures`)를 재고, 캔버스가 그 결과를
   * **쓴다**는 것은 아무도 재지 않고 있었다 — `structures={themeStructures(theme)}`를
   * `{}`로 바꿔도 웹 861케이스가 전부 통과했다(죽은 수 **0**). W1과 같은 파일 한 줄 아래다.
   *
   * 오늘 컴포넌트마다 구현체가 하나씩뿐이라(P4b가 채운다) 갈아 끼울 것이 없으므로,
   * **여기서 둘째 구현체를 등록해** 테마가 그것을 고르게 한다. 배선이 끊기면 렌더러가
   * 카탈로그의 첫 구조(`table`)로 떨어져 `data-wb-structure`가 갈린다.
   */
  it('테마가 고른 구조를 렌더러에 넘긴다', async () => {
    const themed = {
      meta: { id: 'structured', name: '구조를 고르는 테마', version: '1.0.0' },
      components: { List: { structure: ALT_STRUCTURE } },
    }
    await openPage(listPage(), {
      apiOverrides: { getProjectTheme: async () => ({ theme: themed, issues: [] }) },
    })

    await waitFor(() =>
      expect(requireNode('n_list00000001').getAttribute('data-wb-structure')).toBe(ALT_STRUCTURE),
    )
  })

  it('테마가 구조를 고르지 않으면 카탈로그의 기본 구조로 그린다', async () => {
    await openPage(listPage(), {
      apiOverrides: { getProjectTheme: async () => ({ theme: SERVER_THEME, issues: [] }) },
    })

    // 위 케이스와 **같은 문서**인데 결과가 갈린다 — 그것이 테마가 실제로 고른다는 증거다.
    await waitFor(() => expect(requireNode('n_list00000001').getAttribute('data-wb-structure')).toBe('table'))
  })
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

/**
 * 본문에서 던지는 구조 구현체. **렌더러가 유일하게 흡수하지 않는 실패 경로**다
 * (`packages/renderer/src/render.tsx` — 감싸면 구현체의 진짜 버그가 "폴백이 떴네"로
 * 위장되므로 일부러 남겼고, 잡는 일은 캔버스 몫이라고 그 주석이 못박고 있다).
 *
 * 카탈로그 정의는 `ListDef`를 그대로 빌려 타입 이름만 바꾼다 — props 스키마를 새로 쓰려면
 * zod가 필요한데 `apps/web`은 zod에 의존하지 않는다.
 */
const BOOM_TYPE = '터지는구조'
const BOOM_MESSAGE = '구조 구현체가 터졌습니다 [T9-BOOM]'

registerComponent(defineComponent({ ...ListDef, type: BOOM_TYPE }))
registerStructure(BOOM_TYPE, 'table', () => {
  throw new Error(BOOM_MESSAGE)
})

/**
 * `List`의 둘째 구현체. 렌더러는 오늘 컴포넌트마다 하나씩만 등록하므로
 * (`packages/renderer/src/structures/index.ts`의 `DEFAULTS`), 테마가 고른 구조가 실제로
 * 쓰이는지 보려면 여기서 하나를 더 등록해야 한다. `data-wb-structure`는 렌더러가 붙이므로
 * 본문은 최소로 둔다.
 */
registerStructure('List', 'cardGrid', ({ attrs }) => <div {...attrs} />)

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
    // 양성 대조: 열자마자 고른 것이 있으면 아래 단언이 무의미하다.
    expect(shellStore().getState().selectedNodeId).toBeNull()

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
    // 양성 대조: 고르기 전에는 아웃라인이 없다.
    expect(selectionOutline()).toBeNull()

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
    // 폭은 **상자**가 갖는다(D10). 문서가 다시 그려지거나 사라지면 안 된다.
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
    // **문서를 건드리지 않는다**(D10). 노드에 배율이 실리면 같은 문서가 줌마다 다른
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
    expect(document.body.querySelector('[data-wb-component]')).toBeNull()

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

  it('id를 잃은 폴백을 눌러도 빈 id가 선택되지 않는다', async () => {
    // id가 없는 값. 렌더러의 모양 가드가 흡수해 `data-wb-id=""`인 폴백이 된다.
    const broken = pageDoc({
      id: 'n-root',
      type: 'Page',
      children: [{ type: 'Text', props: { content: '아이디 없음' } } as never],
    })
    await openPage(broken)

    const orphan = document.body.querySelector('[data-wb-id=""]')
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
    // 노드 id는 문서 안에서만 뜻이 있다. 남으면 존재하지 않는 노드를 가리킨다.
    expect(shellStore().getState().selectedNodeId).toBeNull()
    expect(selectionOutline()).toBeNull()
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
        (commit.canvasRootId === 'n-root' ||
          commit.structureTypes.includes('Flex') ||
          commit.panelTitle === 'List'),
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
 * 브리프에는 없는 두 케이스다. 렌더러가 **캔버스에 요구하는** 것이라 넣었다 —
 * 경계가 없으면 구조 구현체 하나의 예외가 앱 트리를 통째로 흰 화면으로 만든다.
 */
describe('캔버스의 오류 경계', () => {
  const BOOM_DOC = pageDoc({
    id: 'n-root',
    type: 'Page',
    children: [{ id: 'n-boom', type: BOOM_TYPE }],
  })

  it('구조 구현체가 던져도 셸은 살아 있다', async () => {
    const logged = silenceConsoleError()
    try {
      renderEditor({ docs: { [PAGE_ID]: BOOM_DOC } })
      await screen.findByRole('heading', { name: PROJECT_NAME })

      // 던진 문장을 그대로 보여 준다. 원인을 감추면 무엇이 터졌는지 알 길이 없다.
      const alert = await screen.findByRole('alert')
      expect(alert.textContent).toContain(BOOM_MESSAGE)
      // 셸의 나머지가 살아 있다. 경계가 없으면 여기까지 함께 사라진다.
      screen.getByRole('navigation', { name: '메뉴와 구조' })
      screen.getByRole('complementary', { name: '속성 패널' })
      expect(logged.mock.calls.length).toBeGreaterThan(0)
    } finally {
      logged.mockRestore()
    }
  })

  it('다른 페이지를 열면 다시 그려 본다', async () => {
    const logged = silenceConsoleError()
    try {
      const other = pageDoc({ id: 'n-other', type: 'Page' })
      renderEditor({ docs: { [PAGE_ID]: BOOM_DOC, [OTHER_PAGE_ID]: other } })
      await screen.findByText('이 페이지를 그리지 못했습니다')

      fireEvent.click(screen.getByRole('link', { name: OTHER_PAGE_TITLE }))

      // 경계가 자기 상태를 되돌리지 않으면 멀쩡한 페이지도 오류 문장 아래 갇힌다.
      await waitForNode('n-other')
      expect(screen.queryByText('이 페이지를 그리지 못했습니다')).toBeNull()
    } finally {
      logged.mockRestore()
    }
  })
})
