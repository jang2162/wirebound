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
import { describe, expect, it, vi } from 'vitest'
import { EditorStore } from '../../src/store/editor-store'
import {
  EditorStoreProvider,
  useEditorStore,
  useEditorStoreInstance,
} from '../../src/store/use-editor-store'

describe('useEditorStore', () => {
  it('처음 렌더는 한 번으로 끝난다', () => {
    // 이 프로브의 selector는 원시값을 고른다. 그래서 `getState`가 호출마다 새 객체를
    // 주더라도 여기서는 죽지 않는다 — 스냅샷이 매번 `1`이라 React가 `Object.is`로
    // 바일아웃한다(변이로 확인했다). `getState`의 참조 안정성은 아래
    // `상태 객체 전체를 고르는 selector도 렌더를 반복하지 않는다`가 지킨다.
    const store = new EditorStore()
    let renders = 0
    function Probe(): ReactElement {
      renders += 1
      const zoom = useEditorStore(store, (s) => s.zoom)
      return <span>{`zoom ${zoom}`}</span>
    }

    render(<Probe />)

    screen.getByText('zoom 1')
    expect(renders).toBe(1)
  })

  it('상태 객체 전체를 고르는 selector도 렌더를 반복하지 않는다', () => {
    // `(s) => s`는 `getState`가 돌려준 참조를 그대로 스냅샷으로 쓴다. 그래서
    // `getState`가 호출마다 새 객체를 만들면 스냅샷이 매 렌더 달라지고, React가
    // 다시 그리기를 반복하다 `Maximum update depth exceeded`로 죽는다.
    //
    // 변이로 확인했다: `getState`를 `() => ({ ...this.#state })`로 바꾸면 web
    // 프로젝트에서 이 테스트와 `editor-store.test.ts`의
    // `getState는 매번 같은 참조를 준다(변경 없으면)` 둘만 죽는다. 나머지 바인딩
    // 테스트는 전부 통과한다 — selector가 원시값이거나 중첩 필드를 고르면
    // 얕은 복사를 그대로 통과하기 때문이다.
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
