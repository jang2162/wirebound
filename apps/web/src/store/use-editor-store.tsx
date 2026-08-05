/**
 * `EditorStore`의 React 바인딩. 스토어 자체는 React를 모르므로(`editor-store.ts`)
 * 화면과 이어 주는 곳이 여기 하나다.
 *
 * **selector의 반환값은 원시값이거나 안정된 참조여야 한다.** `useSyncExternalStore`는
 * 렌더할 때마다 스냅샷을 다시 읽어 직전 값과 `Object.is`로 비교하는데, selector가
 * `s => ({ id: s.selectedNodeId })`나 `s => s.document?.root.children ?? []`처럼 매번
 * 새 객체를 만들면 두 값이 영원히 달라 React가 렌더를 반복한다. 스토어가 들고 있는
 * 값을 그대로 고르는 형태로 써라:
 *
 * ```ts
 * const nodeId = useEditorStore(store, (s) => s.selectedNodeId)   // 원시값
 * const document = useEditorStore(store, (s) => s.document)       // 스토어의 참조 그대로
 * ```
 *
 * 여러 필드가 필요하면 selector를 여러 번 부른다. 스토어는 변경이 있을 때만 알리므로
 * (`editor-store.ts`) 구독이 늘어나는 비용은 거의 없다.
 *
 * `useEditorStore`가 스토어를 인자로 받는 것은 의도다 — 컨텍스트에서 꺼내는 형태만
 * 있으면 Provider 없이 스토어를 직접 쥐고 하는 테스트가 불가능해진다. 화면이 컨텍스트의
 * 스토어를 원하면 `useEditorStoreInstance()`로 꺼내 넘긴다.
 */
import {
  createContext,
  useContext,
  useSyncExternalStore,
  type ReactElement,
  type ReactNode,
} from 'react'
import type { EditorState, EditorStore } from './editor-store'

/**
 * 구독 함수는 `store.subscribe` 그대로라 렌더가 바뀌어도 같은 참조다 —
 * `useSyncExternalStore`는 이 인자가 바뀔 때 구독을 다시 건다. 스냅샷 함수는 매
 * 렌더 새로 만들어져도 되며, React는 그것을 구독 재설정 없이 다시 읽는다.
 */
export function useEditorStore<T>(store: EditorStore, selector: (s: EditorState) => T): T {
  return useSyncExternalStore(store.subscribe, () => selector(store.getState()))
}

/**
 * 기본값이 `null`인 것은 의도다. 빈 스토어를 기본값으로 두면 Provider를 빠뜨린
 * 트리가 조용히 빈 화면을 그리고, 원인이 어디였는지 남지 않는다.
 */
const EditorStoreContext = createContext<EditorStore | null>(null)

export function EditorStoreProvider(props: { store: EditorStore; children: ReactNode }): ReactElement {
  return <EditorStoreContext.Provider value={props.store}>{props.children}</EditorStoreContext.Provider>
}

/** 컨텍스트의 `EditorStore`. **Provider 밖에서 부르면 던진다.** */
export function useEditorStoreInstance(): EditorStore {
  const store = useContext(EditorStoreContext)
  if (store === null) throw new Error('useEditorStoreInstance는 EditorStoreProvider 안에서만 부를 수 있습니다')
  return store
}
