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
 * **`(s) => s`는 화면 코드에서 쓰지 마라.** 상태 객체 전체는 이 조건("안정된 참조")을
 * 문자 그대로 만족하지만 — 스토어가 바뀐 필드가 있을 때만 객체를 교체하므로 —
 * 그렇게 고른 컴포넌트는 **어느 필드가 바뀌든 다시 그린다**(실측: `setZoom`·`setMode`·
 * `setViewportWidth`·`selectNode`·`loadPage` 다섯 전부에서 리렌더). 그 형태는 참조
 * 안정성 자체를 재는 테스트(`test/store/use-editor-store.test.tsx`)에만 있다.
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
import type { PageDocument } from '@wirebound/schema'
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

/**
 * **지금 주소가 가리키는 페이지의 문서.** 스토어가 든 것이 다른 페이지의 문서면 `null`이다.
 *
 * 문서를 스토어에서 읽는 화면 셋(캔버스·구조 트리·속성 패널)은 `s.document`가 아니라 이것을
 * 쓴다. 이유는 `pageId`가 바뀐 뒤 **첫 커밋 하나** 때문이다 — 문서를 비우는 일이
 * `routes/editor.tsx`의 passive `useEffect`에 있어 커밋보다 뒤에 돌므로, 그 커밋에서 주소는
 * 새 페이지인데 스토어는 앞 페이지의 문서·`headSeq`·선택을 그대로 들고 있다. 셋이 `s.document`를
 * 곧장 읽으면 그 커밋에 **앞 페이지가 새 주소 밑에 그려진다**(실측: 세 화면 전부에서 그랬다 —
 * `test/canvas/canvas.test.tsx`의 `주소가 바뀐 커밋에 앞 페이지가 그려지지 않는다`).
 *
 * **대조를 여기 한 곳에 둔 이유.** 셋이 각자 막으면 규칙이 세 벌이 되고, P2b-2가 `baseSeq`를
 * 읽는 자리가 늘 때 그 자리에는 규칙이 없다. 스토어가 `openPageId`를 문서와 함께 싣고
 * (`editor-store.ts`) 읽는 쪽이 여기서 한 번 대조하면 규칙이 한 곳에 남는다.
 *
 * `pageId`는 셸이 주소에서 푼 값을 내려받는다. 여기서 `useParams()`를 다시 부르지 않는 것은
 * `panels/menu-tree.tsx`가 적은 이유와 같다 — 라우트 표가 바뀔 때 고칠 곳이 둘이 된다.
 */
export function useOpenDocument(pageId: string | undefined): PageDocument | null {
  const store = useEditorStoreInstance()
  const document = useEditorStore(store, (s) => s.document)
  const openPageId = useEditorStore(store, (s) => s.openPageId)

  return openPageId !== null && openPageId === pageId ? document : null
}
