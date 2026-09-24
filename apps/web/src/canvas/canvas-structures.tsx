/**
 * **캔버스가 지금 그리는 구조 표를 셸 안의 다른 칸이 읽는 통로.**
 *
 * 속성 패널의 `visibleWhen`은 «이 노드가 지금 어떤 구조로 그려지는가»를 묻는다. 그 답을 가진 것은
 * 캔버스뿐이다 — 테마를 읽고(`useProjectTheme`) 해석해(`useThemeCss`) `themeStructures`로 표를 만든다.
 * 패널이 같은 사슬을 따로 돌면 **판정이 두 벌**이 되어 갈린다: 테마 고르개의 재조회 신호
 * (`routes/editor.tsx`의 `themeReloadToken`)는 캔버스에만 가므로 패널이 옛 테마에 머물고,
 * 조회도 해석도 두 번이 된다. 그래서 **캔버스가 자기가 넘긴 표를 그대로 싣고, 패널은 그것만 읽는다.**
 *
 * **셸이 테마를 들지 않는다** — 이 통로가 나르는 것은 테마가 아니라 캔버스가 이미 만든 표다.
 * 테마를 읽는 주체가 캔버스라는 `routes/editor.tsx`의 `themeReloadToken` 주석의 판정이 그대로 산다.
 *
 * **스토어에 두지 않는다.** `EditorState`는 페이지 편집 상태(문서·`headSeq`·undo 스택·전송 큐)이고,
 * 구조 표는 그 축이 아니다 — 얹으면 편집과 무관한 이유로 스토어 구독자가 다시 그린다.
 *
 * **캔버스가 아직 싣지 않았으면 빈 표다.** 캔버스도 테마를 받기 전에는 빈 표로 그리고, 렌더러는 표가
 * 비면 카탈로그의 첫 구조를 고르므로(`resolveStructureOf`) 패널도 같은 답을 낸다. 공급자 밖에서 패널만
 * 렌더해도 같다.
 */
import {
  createContext,
  useContext,
  useLayoutEffect,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react'

type Structures = Readonly<Record<string, string>>

const EMPTY: Structures = Object.freeze(Object.create(null) as Record<string, string>)

const StructuresContext = createContext<Structures>(EMPTY)
const PublishContext = createContext<(structures: Structures) => void>(() => {})

/**
 * 셸이 캔버스와 우측 패널을 함께 감싼다.
 *
 * **`children`을 그대로 넘기는 것이 요점이다.** 표가 바뀌어 이 공급자가 다시 그려져도 `children`은 같은
 * 원소라 React 가 셸을 다시 그리지 않고, 표를 읽는 쪽만 다시 그린다.
 */
export function CanvasStructuresProvider(props: { children: ReactNode }): ReactElement {
  const [structures, setStructures] = useState<Structures>(EMPTY)
  return (
    <PublishContext.Provider value={setStructures}>
      <StructuresContext.Provider value={structures}>{props.children}</StructuresContext.Provider>
    </PublishContext.Provider>
  )
}

/**
 * 캔버스가 자기가 `CanvasDocument`에 넘기는 **그 표**를 싣는다. 참조가 안정적이어야 한다 —
 * 매 렌더 새 객체면 싣기가 매번 돈다.
 *
 * **`useLayoutEffect`다.** `useEffect`면 테마가 닿은 커밋과 패널의 갱신 사이에 칠하기가 끼어들 수 있어,
 * 그 틈에 캔버스와 패널이 다른 구조를 보인다. 레이아웃 이펙트의 갱신은 칠하기 전에 끝난다
 * (jsdom 은 칠하지 않으므로 이 차이를 재는 케이스는 없다).
 *
 * **캔버스가 내려가도 비우지 않는다.** 캔버스가 없는 동안(`CanvasFrame`의 불러오는 중 · 실패)에는 패널도
 * 그릴 문서가 없어 표를 읽을 노드가 없고, 다시 올라온 캔버스가 먼저 제 표를 싣는다.
 */
export function usePublishCanvasStructures(structures: Structures): void {
  const publish = useContext(PublishContext)
  useLayoutEffect(() => {
    publish(structures)
  }, [publish, structures])
}

/** 캔버스가 지금 그리는 구조 표. 캔버스가 없거나 공급자 밖이면 빈 표다(머리말). */
export function useCanvasStructures(): Structures {
  return useContext(StructuresContext)
}
