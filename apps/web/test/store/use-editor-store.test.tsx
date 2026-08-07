/**
 * `EditorStore`의 React 바인딩 테스트. 스토어 자체의 계약은 `editor-store.test.ts`가
 * React 없이 검사하고, 여기서는 **React와 이어진 뒤에도 그 계약이 값을 하는지**만 본다:
 * 스토어 변경이 렌더로 이어지는가, 상관없는 변경에 헛 렌더하지 않는가, Provider를
 * 빠뜨린 트리가 조용히 지나가지 않는가.
 *
 * 이 파일은 jsdom이 필요하므로 `web` 프로젝트의 기본 환경(루트 `vitest.config.ts`)에서 돈다.
 */
import { act, render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { CURRENT_DOCUMENT_VERSION, type PageDocument } from '@wirebound/schema'
import { describe, expect, it, vi } from 'vitest'
import { EditorStore } from '../../src/store/editor-store'
import {
  EditorStoreProvider,
  useEditorStore,
  useEditorStoreInstance,
  useOpenDocument,
  useOpenPage,
  type OpenPage,
} from '../../src/store/use-editor-store'

describe('useEditorStore', () => {
  it('상태 객체 전체를 고르는 selector도 렌더를 반복하지 않는다', () => {
    // `(s) => s`는 `getState`가 돌려준 참조를 그대로 스냅샷으로 쓴다. 그래서
    // `getState`가 호출마다 새 객체를 만들면 스냅샷이 매 렌더 달라지고, React가
    // 다시 그리기를 반복하다 `Maximum update depth exceeded`로 죽는다.
    //
    // **이 selector 모양은 여기서만 쓴다. 화면 코드에서 흉내 내지 마라** — 상태
    // 객체 전체를 고르면 그 컴포넌트가 모든 상태 변경에 묶인다. 실측: 같은 프로브를
    // 두고 `setZoom`·`setMode`·`setViewportWidth`·`selectNode`·`loadPage` 다섯을
    // 차례로 부르면 다섯 번 다 다시 그렸고, selector만 `(s) => s.zoom`으로 바꾼
    // 대조군은 `setZoom` 하나에서만 그렸다. 여기서 쓰는 것은 참조 안정성을 재는
    // 것이 목적이어서지 권장하는 형태여서가 아니다 — 화면은
    // `use-editor-store.tsx` 독스트링대로 필요한 필드만 고른다.
    //
    // 변이로 확인했다: `getState`를 `() => ({ ...this.#state })`로 바꾸면 web
    // 프로젝트에서 이 테스트와 `editor-store.test.ts`의
    // `getState는 매번 같은 참조를 준다(변경 없으면)` 둘만 죽는다. 나머지 바인딩
    // 테스트는 전부 통과한다 — 넷은 selector가 원시값이라(`s.zoom`·
    // `s.selectedNodeId`) 얕은 복사를 그대로 통과하고, `Provider 밖에서 부르면
    // 던진다`는 스냅샷에 닿기 전에 던진다.
    //
    // 아래 두 단언은 마운트 렌더가 1회인 것과 기본 `zoom`이 React까지 흘러가는
    // 것도 함께 본다(실측: `initialState()`의 `zoom`을 0.75로 바꾸면 `getByText`가
    // 죽는다). 같은 것만 보던 별도 프로브가 있었으나 **태스크 6의 변이 표 20개 어디에서도**
    // 잡히지 않아 지웠다 — 바로 위의 `zoom 0.75` 변이는 표 밖의 것이고, 그 변이에서는
    // 지운 프로브도 죽었다.
    const store = new EditorStore()
    let renders = 0
    function Probe(): ReactElement {
      renders += 1
      const state = useEditorStore(store, (s) => s)
      return <span>{`zoom ${state.zoom} / 선택 ${state.selectedNodeId ?? '없음'}`}</span>
    }

    render(<Probe />)

    screen.getByText('zoom 1 / 선택 없음')
    expect(renders).toBe(1)
  })

  it('고른 값이 바뀌면 다시 그린다', () => {
    const store = new EditorStore()
    function Probe(): ReactElement {
      const nodeId = useEditorStore(store, (s) => s.selectedNodeId)
      return <span>{nodeId ?? '선택 없음'}</span>
    }

    render(<Probe />)
    screen.getByText('선택 없음')

    act(() => {
      store.selectNode('n_a')
    })

    screen.getByText('n_a')
  })

  it('다시 렌더해도 구독은 한 번만 건다', () => {
    const store = new EditorStore()
    const subscribe = vi.spyOn(store, 'subscribe')
    function Probe(): ReactElement {
      const zoom = useEditorStore(store, (s) => s.zoom)
      return <span>{`zoom ${zoom}`}</span>
    }

    const { rerender } = render(<Probe />)
    rerender(<Probe />)
    rerender(<Probe />)

    // `useSyncExternalStore`는 구독 함수의 **참조**가 바뀔 때마다 구독을 다시 건다.
    // 훅이 `(cb) => store.subscribe(cb)`처럼 감싸면 렌더마다 해제·재구독이 돈다 —
    // 동작은 같아 보이지만 헛일이고, 이 단언이 그 형태를 막는다.
    expect(subscribe).toHaveBeenCalledTimes(1)
  })

  it('고르지 않은 필드가 바뀌면 다시 그리지 않는다', () => {
    const store = new EditorStore()
    let renders = 0
    function Probe(): ReactElement {
      renders += 1
      const nodeId = useEditorStore(store, (s) => s.selectedNodeId)
      return <span>{nodeId ?? '선택 없음'}</span>
    }

    render(<Probe />)
    expect(renders).toBe(1)

    act(() => {
      store.setZoom(1.5)
    })

    // 스토어는 알렸지만 selector가 고른 값은 그대로다. React가 `Object.is`로 걸러 준다.
    expect(renders).toBe(1)
  })
})

describe('EditorStoreProvider', () => {
  function InstanceProbe(): ReactElement {
    const store = useEditorStoreInstance()
    const zoom = useEditorStore(store, (s) => s.zoom)
    return <span>{`zoom ${zoom}`}</span>
  }

  it('Provider 안에서는 넣어 준 스토어를 돌려준다', () => {
    const store = new EditorStore()
    store.setZoom(1.5)

    render(
      <EditorStoreProvider store={store}>
        <InstanceProbe />
      </EditorStoreProvider>,
    )

    // 1.5는 기본값이 아니므로, 새 스토어를 만들어 쓰는 구현과 구분된다.
    screen.getByText('zoom 1.5')
  })

  it('Provider 밖에서 부르면 던진다', () => {
    // React가 렌더 중 오류를 콘솔에도 찍는다. 테스트 출력만 조용히 하고, 오류 자체는
    // 아래에서 그대로 단언한다.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      expect(() => render(<InstanceProbe />)).toThrow(/EditorStoreProvider/)
    } finally {
      consoleError.mockRestore()
    }
  })
})

/** 페이지 문서 최소형. 이 훅은 내용을 해석하지 않으므로 루트 id만 구분되면 된다. */
function doc(rootId: string): PageDocument {
  return { version: CURRENT_DOCUMENT_VERSION, root: { id: rootId, type: 'Container' } }
}

const PAGE_ID = 'pg-1'
const HEAD_SEQ = 7

/**
 * `useOpenPage`가 렌더마다 무엇을 돌려줬는지 모아 두는 탐침.
 *
 * **관계없는 필드(`zoom`)를 함께 구독하는 것이 요점이다.** 이 훅이 고르는 셋만 구독하면
 * `setZoom`으로는 이 컴포넌트가 아예 다시 그려지지 않아(React가 `Object.is`로 거른다)
 * "참조가 유지된다"는 단언이 헛돈다 — 비교할 두 번째 렌더가 없기 때문이다. 실제 화면도
 * 페이지 상태와 보기 설정을 함께 읽으므로 이 모양이 그쪽에 더 가깝다.
 */
function OpenPageProbe(props: { pageId: string | undefined; seen: (OpenPage | null)[] }): ReactElement {
  const store = useEditorStoreInstance()
  const zoom = useEditorStore(store, (s) => s.zoom)
  const open = useOpenPage(props.pageId)
  props.seen.push(open)
  return <span>{`zoom ${zoom} / ${open === null ? '없음' : `${open.document.root.id}:${open.headSeq}`}`}</span>
}

function renderOpenPage(
  store: EditorStore,
  pageId: string | undefined,
): { seen: (OpenPage | null)[] } {
  const seen: (OpenPage | null)[] = []
  render(
    <EditorStoreProvider store={store}>
      <OpenPageProbe pageId={pageId} seen={seen} />
    </EditorStoreProvider>,
  )
  return { seen }
}

describe('useOpenPage', () => {
  it('열린 페이지의 문서와 headSeq를 함께 낸다', () => {
    const store = new EditorStore()
    const page = doc('n_root')
    store.loadPage(PAGE_ID, page, HEAD_SEQ)

    const { seen } = renderOpenPage(store, PAGE_ID)

    // `toBe`인 것은 의도다 — 스토어가 든 문서 참조를 그대로 내준다(복사하지 않는다).
    expect(seen.at(-1)?.document).toBe(page)
    expect(seen.at(-1)?.headSeq).toBe(HEAD_SEQ)
    screen.getByText('zoom 1 / n_root:7')
  })

  it('다른 페이지의 것이면 null이다', () => {
    const store = new EditorStore()
    store.loadPage('pg-2', doc('n_other'), HEAD_SEQ)

    const { seen } = renderOpenPage(store, PAGE_ID)

    // 주소가 바뀐 뒤 문서를 비우는 이펙트가 돌기까지의 커밋 하나를 막는 대조다.
    // `headSeq`도 같은 대조를 받아야 한다 — 그것이 P2b-2의 `baseSeq`이고, 앞 페이지의
    // seq로 편집을 보내면 서버가 409를 낸다.
    expect(seen.at(-1)).toBeNull()
  })

  it('문서가 없으면 null이다', () => {
    const store = new EditorStore()
    store.loadPage(PAGE_ID, doc('n_root'), HEAD_SEQ)
    store.clearPage()

    const { seen } = renderOpenPage(store, PAGE_ID)

    expect(seen.at(-1)).toBeNull()
  })

  it('같은 상태에서 반환 참조가 유지된다', () => {
    // **이 케이스가 이 훅의 함정이다.** 세 값을 한 객체로 묶는 자리라 아무 생각 없이
    // 쓰면 렌더마다 새 객체가 나온다. 그 객체를 의존 배열에 넣는 쪽(전송 이펙트)은
    // 매 렌더 다시 돌게 된다.
    const store = new EditorStore()
    store.loadPage(PAGE_ID, doc('n_root'), HEAD_SEQ)

    const { seen } = renderOpenPage(store, PAGE_ID)
    const first = seen.at(-1)
    const rendersBefore = seen.length

    act(() => {
      store.setZoom(1.5)
    })

    // **양성 대조.** 이것이 없으면 "다시 그리지 않았다"와 "다시 그렸는데 참조가 같다"가
    // 구분되지 않고, 리렌더가 아예 안 나는 판에서도 아래 단언이 통과한다.
    expect(seen.length).toBeGreaterThan(rendersBefore)
    expect(seen.at(-1)).toBe(first)
  })

  it('문서가 바뀌면 새 객체를 낸다', () => {
    // 위 케이스의 양성 대조 — 참조를 얼려 버리는 구현(한 번 만든 것을 계속 돌려주기)을
    // 잡는다.
    const store = new EditorStore()
    store.loadPage(PAGE_ID, doc('n_root'), HEAD_SEQ)

    const { seen } = renderOpenPage(store, PAGE_ID)
    const first = seen.at(-1)

    const next = doc('n_root2')
    act(() => {
      store.loadPage(PAGE_ID, next, HEAD_SEQ)
    })

    expect(seen.at(-1)).not.toBe(first)
    expect(seen.at(-1)?.document).toBe(next)
  })

  it('headSeq만 바뀌어도 새 객체를 낸다', () => {
    // 계획서의 표에 없는 케이스다. **`headSeq`가 혼자 오르는 경로가 실제로 생긴다** —
    // 편집이 ack되면 문서는 이미 낙관적으로 바뀐 뒤라 그대로이고 `headSeq`만 오른다
    // (P2b-2 Task 4의 `ackEdit`). 의존 배열에서 `headSeq`를 빠뜨린 구현은 위 두 케이스를
    // 통과하고 여기서만 죽는다 — 그리고 그 결함은 다음 편집의 `baseSeq`가 낡는 형태로
    // 나타난다.
    const store = new EditorStore()
    const page = doc('n_root')
    store.loadPage(PAGE_ID, page, HEAD_SEQ)

    const { seen } = renderOpenPage(store, PAGE_ID)
    const first = seen.at(-1)

    act(() => {
      store.loadPage(PAGE_ID, page, HEAD_SEQ + 1)
    })

    expect(seen.at(-1)).not.toBe(first)
    expect(seen.at(-1)?.headSeq).toBe(HEAD_SEQ + 1)
    // 문서는 그대로다 — 바뀐 것이 `headSeq`뿐임을 못박는다.
    expect(seen.at(-1)?.document).toBe(page)
  })

  it('Provider 밖에서 부르면 던진다', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      expect(() => render(<OpenPageProbe pageId={PAGE_ID} seen={[]} />)).toThrow(
        /EditorStoreProvider/,
      )
    } finally {
      consoleError.mockRestore()
    }
  })
})

describe('useOpenDocument', () => {
  function DocumentProbe(props: { pageId: string | undefined }): ReactElement {
    const document = useOpenDocument(props.pageId)
    return <span>{document === null ? '문서 없음' : document.root.id}</span>
  }

  function renderDocument(store: EditorStore, pageId: string | undefined): void {
    render(
      <EditorStoreProvider store={store}>
        <DocumentProbe pageId={pageId} />
      </EditorStoreProvider>,
    )
  }

  it('useOpenDocument는 같은 대조를 한다', () => {
    // `useOpenPage`의 껍질이 됐어도 대조가 그대로인지 본다. 셋(캔버스·구조 트리·속성
    // 패널)이 이 훅을 쓰고 있고, 그쪽 케이스는 전부 `<App />`을 라우트째 렌더하는
    // 통합 테스트라 대조 자체를 짧게 재는 자리가 여기다.
    const store = new EditorStore()
    store.loadPage(PAGE_ID, doc('n_root'), HEAD_SEQ)

    renderDocument(store, PAGE_ID)
    screen.getByText('n_root')
  })

  it('useOpenDocument도 다른 페이지의 것이면 null이다', () => {
    const store = new EditorStore()
    store.loadPage('pg-2', doc('n_other'), HEAD_SEQ)

    renderDocument(store, PAGE_ID)
    screen.getByText('문서 없음')
  })

  it('useOpenDocument는 pageId가 없으면 null이다', () => {
    // 프로젝트만 연 주소(`/projects/:projectId`)가 이 모양이다 — 라우트 표에 `pageId`가
    // 없으므로 `useParams()`가 `undefined`를 준다. 스토어에 앞 페이지가 남아 있어도
    // 그리면 안 된다.
    const store = new EditorStore()
    store.loadPage(PAGE_ID, doc('n_root'), HEAD_SEQ)

    renderDocument(store, undefined)
    screen.getByText('문서 없음')
  })
})
