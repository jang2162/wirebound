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
  useMemo,
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

/** 지금 열려 있는 페이지의 문서와 그 revision. 편집은 `headSeq`를 `baseSeq`로 쓴다. */
export interface OpenPage {
  document: PageDocument
  /** 이 문서의 최신 revision seq. `PATCH .../ops`의 `baseSeq`가 이 값이다. */
  headSeq: number
}

/**
 * **지금 주소가 가리키는 페이지의 문서와 `headSeq`.** 스토어가 든 것이 다른 페이지의
 * 것이면 `null`이다.
 *
 * 페이지 상태를 스토어에서 읽는 화면들은 `s.document`·`s.headSeq`가 아니라 이것을 쓴다.
 * 이유는 `pageId`가 바뀐 뒤 **첫 커밋 하나** 때문이다 — 문서를 비우는 일이
 * `routes/editor.tsx`의 passive `useEffect`에 있어 커밋보다 뒤에 돌므로, 그 커밋에서 주소는
 * 새 페이지인데 스토어는 앞 페이지의 문서·`headSeq`·선택을 그대로 들고 있다. 곧장 읽으면
 * 그 커밋에 **앞 페이지가 새 주소 밑에 그려진다**(실측: 캔버스·구조 트리·속성 패널 셋 전부
 * 에서 그랬다 — `test/canvas/canvas.test.tsx`의
 * `주소가 바뀐 커밋에 앞 페이지가 그려지지 않는다`). `headSeq`는 그리는 값이 아니지만 같은
 * 창에서 앞 페이지의 것이고, 그것을 `baseSeq`로 보내면 서버가 409를 낸다.
 *
 * **대조를 여기 한 곳에 둔 이유.** 읽는 화면이 각자 막으면 규칙이 여러 벌이 되고, 새로 읽는
 * 자리가 늘 때 그 자리에는 규칙이 없다. 스토어가 `openPageId`를 문서·`headSeq`와 함께 싣고
 * (`editor-store.ts`) 읽는 쪽이 여기서 한 번 대조하면 규칙이 한 곳에 남는다.
 *
 * **이 파일이 `test/store-access-guard.ts`의 제외 대상인 이유가 이것이다.** 그 가드는
 * `document`·`headSeq`·`openPageId`를 selector나 `getState()` 안에서 읽는 것을 잡고,
 * 걸렸을 때의 위반 메시지가 지목하는 합법적인 자리가 **바로 여기**다("`src/store/
 * use-editor-store.tsx`에 같은 대조를 하는 관문을 더해라"). 규칙을 정의하는 자리이므로
 * 규칙을 넓히는 것도 여기서 한다.
 *
 * **반환 객체를 `useMemo`로 묶는 것이 계약이다.** 세 값을 한 객체로 모으는 자리라 그냥
 * 쓰면 렌더마다 새 객체가 나온다. `useSyncExternalStore`의 스냅샷이 아니라 훅의 반환값이므로
 * 렌더가 반복되지는 않지만, 이것을 의존 배열에 넣는 쪽(편집 전송 이펙트)이 매 렌더 다시
 * 돈다. `test/store/use-editor-store.test.tsx`의 `같은 상태에서 반환 참조가 유지된다`가
 * 그것을 잡는다.
 *
 * `pageId`는 셸이 주소에서 푼 값을 내려받는다. 여기서 `useParams()`를 다시 부르지 않는 것은
 * `panels/menu-tree.tsx`가 적은 이유와 같다 — 라우트 표가 바뀔 때 고칠 곳이 둘이 된다.
 */
export function useOpenPage(pageId: string | undefined): OpenPage | null {
  const store = useEditorStoreInstance()
  const document = useEditorStore(store, (s) => s.document)
  const headSeq = useEditorStore(store, (s) => s.headSeq)
  const openPageId = useEditorStore(store, (s) => s.openPageId)

  // 대조를 `useMemo` 밖에서 끝내 둔다. 안에서 하면 `document`가 `PageDocument | null`인 채로
  // 남아 반환 타입이 `null`을 품게 되고, 그러면 쓰는 쪽이 대조를 한 번 더 하게 된다.
  const openDocument = openPageId !== null && openPageId === pageId ? document : null

  return useMemo(
    () => (openDocument === null ? null : { document: openDocument, headSeq }),
    [openDocument, headSeq],
  )
}

/**
 * 문서만 필요할 때. `useOpenPage`의 얇은 껍질이다 — 대조는 그쪽 한 곳에 있다.
 *
 * 세 화면(캔버스·구조 트리·속성 패널)이 이것을 쓴다. 편집이 붙기 전부터 있던 이름이라
 * 남겨 두는 것이지, 새로 읽는 자리가 문서만 필요하다면 이쪽을 써도 된다.
 */
export function useOpenDocument(pageId: string | undefined): PageDocument | null {
  return useOpenPage(pageId)?.document ?? null
}
