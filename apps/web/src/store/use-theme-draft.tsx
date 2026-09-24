/**
 * `ThemeDraftStore`의 React 바인딩. 스토어 자체는 React를 모르므로
 * (`theme-draft-store.ts`) 화면과 이어 주는 곳이 여기 하나다.
 *
 * **`use-editor-store.tsx`와 같은 형식이고 규칙도 같다** — selector의 반환값은 원시값이거나
 * 스토어가 든 참조 그대로여야 한다. 매 렌더 새 객체를 만드는 selector는
 * `useSyncExternalStore`의 `Object.is` 비교에서 영원히 달라 렌더가 멈추지 않는다.
 * 여러 필드가 필요하면 selector를 여러 번 부른다.
 *
 * **`(s) => s`를 화면 코드에서 쓰지 마라** — 그렇게 고른 컴포넌트는 어느 필드가 바뀌든 다시
 * 그린다. 초안은 입력마다 바뀌므로 그 손해가 페이지 편집보다 크다.
 *
 * **두 스토어를 한 컨텍스트에 합치지 않는다.** 라우트가 다르고 생애가 다르다 —
 * `theme-draft-store.ts` 머리말의 셋이 그 근거다.
 */
import {
  createContext,
  useContext,
  useSyncExternalStore,
  type ReactElement,
  type ReactNode,
} from 'react'
import type { ThemeDraftState, ThemeDraftStore } from './theme-draft-store'

export function useThemeDraft<T>(store: ThemeDraftStore, selector: (s: ThemeDraftState) => T): T {
  return useSyncExternalStore(store.subscribe, () => selector(store.getState()))
}

/**
 * 기본값이 `null`인 것은 의도다 — 빈 스토어를 기본값으로 두면 Provider를 빠뜨린 트리가
 * 조용히 빈 화면을 그리고 원인이 남지 않는다(`EditorStoreContext`와 같은 판단).
 */
const ThemeDraftContext = createContext<ThemeDraftStore | null>(null)

export function ThemeDraftProvider(props: {
  store: ThemeDraftStore
  children: ReactNode
}): ReactElement {
  return <ThemeDraftContext.Provider value={props.store}>{props.children}</ThemeDraftContext.Provider>
}

/** 컨텍스트의 `ThemeDraftStore`. **Provider 밖에서 부르면 던진다.** */
export function useThemeDraftStore(): ThemeDraftStore {
  const store = useContext(ThemeDraftContext)
  if (store === null) {
    throw new Error('useThemeDraftStore는 ThemeDraftProvider 안에서만 부를 수 있습니다')
  }
  return store
}

/**
 * **지금 주소의 테마 초안.** 스토어가 든 것이 다른 테마의 것이면 `null`이다.
 *
 * `useOpenDocument(pageId)`와 같은 자리이고 근거도 같다 — 주소가 바뀌고 초안을 비우는
 * 이펙트가 돌기까지의 **커밋 하나** 동안 스토어는 앞 테마의 것을 들고 있다. 그 대조를
 * 화면마다 하지 않고 여기 한 곳에 둔다.
 */
export function useOpenDraft(themeId: string | undefined): ThemeDraftState['draft'] {
  const store = useThemeDraftStore()
  const openThemeId = useThemeDraft(store, (s) => s.openThemeId)
  const draft = useThemeDraft(store, (s) => s.draft)
  if (themeId === undefined || openThemeId !== themeId) return null
  return draft
}
