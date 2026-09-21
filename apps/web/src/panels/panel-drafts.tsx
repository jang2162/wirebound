/**
 * 우측 패널 본문들의 **페이지에 매인 상태**를 드는 자리 — 초안과 **그 저장의 생애**.
 *
 * ## 왜 탭 목록 밖인가
 *
 * `routes/editor.tsx`의 `RightPanel`은 **안 보이는 탭을 DOM에서 뺀다**(코멘트 조회를 아끼려는
 * 판단 — 그쪽 주석). 그래서 탭 본문의 `useState`는 탭을 한 번 누르는 것만으로 죽는다.
 * 7차(`357f27c`)가 «페이지 설명»의 **초안 한 칸**을 여기로 올려 그 손실을 막았다.
 *
 * ## 초안만 올리면 안 되었다 — 저장의 생애가 마운트에 남았다 (리뷰 N1)
 *
 * 그 판에서 칸은 마운트를 넘어 살고 **저장의 수명은 마운트에 묶여 있었다.** 저장이 나가 있는
 * 동안 탭을 오가면(리뷰 실측, Chrome · PATCH 3초 지연):
 *
 * 1. 새 마운트의 저장 상태가 `idle`로 시작해 **상자와 버튼이 열린 채** 초안을 보였다 — 한 번 더
 *    보낼 수 있었다.
 * 2. 옛 마운트의 응답 처리가 부르는 셋 가운데 **초안 비우기만** 공유 칸에 닿아, 새 마운트에서
 *    **이어 친 글이 경고 없이 지워졌고**, 나머지 둘(서버 값 갈아 끼우기·통지)은 죽은 인스턴스에
 *    닿아 **화면이 낡은 서버 값을 보였다.** 7차 이전(`7053388`)에는 이어 친 글이 남았다.
 *
 * **그래서 페이지에 매인 것을 통째로 여기 든다** — 초안, 저장 진행 상태와 통지, 그리고 그
 * 응답이 갈아 끼울 **조회 값**까지. 본문이 마운트될 때 하는 일은 **조회를 거는 것**과
 * **지난 통지를 지우는 것** 둘뿐이다. 조회를 여기서 걸지 않는 것은 그 자체가 판단이다 —
 * 걸면 안 보는 탭을 위해 요청이 나가고(D6 *"한 번만 읽는다"*), 그것이 애초에 탭을 DOM에서
 * 뺀 이유다.
 *
 * ## 한 값이 두 일을 한다 — `pageId`
 *
 * **1. 페이지가 바뀌면 칸을 전부 버린다.** «페이지 설명»의 F1(*"가리키는 페이지가 곧 뜻의
 * 절반"*)과 `comment-panel.tsx`의 규칙(*"노드 id도 코멘트 id도 그 페이지 안에서만 뜻이
 * 있다"*)이 **같은 자리에서 같은 값으로** 돈다. 렌더 중에 버린다 — 이펙트로 버리면 새 페이지의
 * 첫 커밋 하나 동안 앞 페이지의 초안이 그려진다(`routes/editor.tsx`가 `openPageId`로 닫은 것과
 * 같은 부류의 창이다).
 *
 * **2. 모든 쓰기는 «그 쓰기를 부른 렌더의 페이지»를 달고 오고, 지금 페이지와 다르면 버려진다**
 * (리뷰 N2). 저장 중에 옆 페이지로 옮기면 그 응답이 **옆 페이지의 칸에 닿아** 앞 페이지의
 * 글이 옆 페이지의 서버 값처럼 보였고, 한 글자 붙여 저장하면 **옆 페이지 DB에 앞 페이지의
 * 글이 들어갔다**(리뷰 실측 — 7차 전후 같음). F1이 막으려던 *"남의 페이지에 그 글자가 저장되는
 * 것"*이 **저장 진행 중 경로**로 남아 있었던 것이다. 조회 이펙트의 `alive`와 같은 가드가
 * 저장 쪽에는 없었다.
 *
 * **둘이 같은 값을 본다는 것이 요점이다.** 버리는 판정과 막는 판정이 각자 «지금 페이지»를
 * 따로 들면 한쪽만 낡는 날이 온다.
 *
 * **«대상» 가드는 따로 없다.** 저장이 도는 동안 대상은 입력을 꺼서 못 바꾸게 한다(설명의
 * `saving`, 코멘트의 `busy`) — 그 잠금도 이 칸들이라 탭을 오가도 풀리지 않는다. 그래서
 * 저장 도중 대상이 바뀌는 길은 **페이지를 바꾸는 것 하나**이고, 그것은 위 2번이 막는다.
 * 새 코멘트의 대상(고른 노드)은 게시 도중에도 바뀔 수 있지만 그 응답이 하는 일은 «보낸 초안을
 * 비운다»뿐이라 어느 노드를 골라 두었는지와 무관하다.
 *
 * ## 이것이 막지 못하는 것
 *
 * - **남의 저장을 조용히 덮는다**(리뷰 N3) — `panels/page-description.tsx`의 머리말이 갖는다.
 * - 같은 페이지로 **되돌아오면**(가 → 나 → 가) 가에서 나간 저장의 응답은 버려지지 않는다.
 *   가의 칸에 가의 서버 값이 닿는 것이라 틀린 값이 아니다.
 */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react'

/**
 * 칸 하나의 선언. **모듈 최상위에 한 번 만든다** — 칸을 가리는 것은 이 객체의 정체성이다.
 * 이름은 사람이 읽으라고 있다(디버거에서 `Map`의 키를 볼 때).
 *
 * `initial`은 **공유되는 값**이라 고쳐 쓰지 않는다 — 쓰는 쪽은 언제나 새 값을 넣는다.
 */
export interface Slot<T> {
  readonly name: string
  readonly initial: T
}

export function slot<T>(name: string, initial: T): Slot<T> {
  return { name, initial }
}

/** 칸에 넣을 값, 또는 앞 값으로 다음 값을 짓는 함수(`useState`의 그것과 같다). */
export type SlotUpdate<T> = T | ((prev: T) => T)

interface Held {
  /** 이 칸들이 가리키는 페이지. */
  pageId: string | undefined
  /** 한 번도 안 쓴 칸은 여기 없다 — 읽으면 `initial`이 나온다. */
  values: ReadonlyMap<Slot<unknown>, unknown>
}

interface Box {
  held: Held
  write: <T>(pageId: string | undefined, key: Slot<T>, update: SlotUpdate<T>) => void
}

const PanelDraftsContext = createContext<Box | null>(null)

function read<T>(held: Held, key: Slot<T>): T {
  return (held.values.has(key) ? held.values.get(key) : key.initial) as T
}

/**
 * 칸들을 드는 자리. **탭 목록 밖에 세운다** — 안에 세우면 탭과 함께 언마운트되어 아무것도
 * 달라지지 않는다. 드는 자리는 `routes/editor.tsx`의 `RightPanel`이고, 그것이 **언마운트를
 * 고른 컴포넌트**다. 대가를 만든 자리가 대가를 문다.
 */
export function PanelDraftsProvider(props: {
  pageId: string | undefined
  children: ReactNode
}): ReactElement {
  const { pageId } = props
  const [held, setHeld] = useState<Held>(() => ({ pageId, values: new Map() }))

  // **1. 페이지가 바뀌면 전부 버린다** — 렌더 중에(위 머리말). React가 이 컴포넌트를 곧바로
  // 다시 그리므로 자식은 앞 페이지의 칸을 한 번도 보지 않는다.
  if (held.pageId !== pageId) {
    setHeld({ pageId, values: new Map() })
  }

  const write = useCallback(
    <T,>(at: string | undefined, key: Slot<T>, update: SlotUpdate<T>): void => {
      setHeld((prev) => {
        // **2. 다른 페이지를 위해 부른 쓰기는 버린다**(리뷰 N2) — 위 1번과 같은 값을 본다.
        if (prev.pageId !== at) return prev
        const current = read(prev, key)
        const next =
          typeof update === 'function' ? (update as (prev: T) => T)(current) : update
        if (Object.is(next, current)) return prev
        const values = new Map(prev.values)
        values.set(key as Slot<unknown>, next)
        return { pageId: prev.pageId, values }
      })
    },
    [],
  )

  const box = useMemo<Box>(() => ({ held, write }), [held, write])
  return <PanelDraftsContext.Provider value={box}>{props.children}</PanelDraftsContext.Provider>
}

/**
 * 칸 하나를 읽고 쓴다. 돌려주는 쓰기 함수는 **이 렌더의 페이지를 단다** — 저장을 시작한
 * 클릭이 잡아 둔 그 함수는 응답이 올 때도 그 페이지를 말한다(위 머리말의 2번).
 *
 * **provider가 없으면 요란하게 깨진다** — 조용히 로컬 상태로 물러나면 탭을 누를 때 초안이
 * 다시 사라지는데 화면은 멀쩡해 보인다(고치기 전과 똑같은 결함이 소리 없이 돌아온다).
 */
export function usePanelSlot<T>(key: Slot<T>): [T, (update: SlotUpdate<T>) => void] {
  const box = useContext(PanelDraftsContext)
  if (box === null) {
    throw new Error(`패널 칸(${key.name})은 PanelDraftsProvider 안에서만 쓴다`)
  }
  const { held, write } = box
  const pageId = held.pageId
  const set = useCallback((update: SlotUpdate<T>) => write(pageId, key, update), [write, pageId, key])
  return [read(held, key), set]
}
