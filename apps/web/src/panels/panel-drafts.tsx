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
 * ## 3. 잠금만은 **그 페이지에 매단다** — 페이지를 떠나도 버리지 않는다 (9차, 리뷰 N-A)
 *
 * 위 1번은 칸을 **방문**마다 버린다. 그런데 `pageId`는 «가의 첫 방문»과 «가로 돌아온 방문»을
 * 가르지 못하고, 2번의 쓰기 가드도 둘을 같은 페이지로 본다. 8차 판에서 저장이 나가 있는 동안
 * **가 → 나 → 가**로 돌아오면(8차 = 리뷰 실측, Chrome · 쓰기 3초 지연 · jsdom 도 같은 값.
 * 9차 = jsdom 케이스 셋 — `test/panels/page-description-edit.test.tsx`·`comment-panel.test.tsx`):
 *
 * | 칸 | 8차 | 9차 |
 * |---|---|---|
 * | 설명 | 돌아온 상자가 **열려** 있다(잠금이 리셋에 버려졌다). 친 글이 앞 저장의 응답에 **경고 없이 지워지고** «저장했습니다»가 뜬다 | 상자·버튼이 **꺼진 채** 돌아온다. 응답이 오면 저장된 값이 서고 풀린다 |
 * | 새 코멘트 | 돌아와 쓰던 말이 앞 응답에 `""`가 된다 | 상자·단추가 꺼진 채 돌아온다 |
 * | 코멘트 수정 | 돌아와 **다른 코멘트**를 고치던 칸이 앞 응답에 닫힌다 | 수정 단추가 꺼진 채 돌아온다 |
 * | 한 번 더 저장(ABA2) | 저장이 **둘 동시에** 나가고, 첫 응답이 둘째가 나가 있는 동안 잠금을 푼다. 그 틈에 친 글은 둘째 응답에 또 지워진다 | 둘째를 보낼 수 없다 |
 *
 * **그래서 잠금 칸(`lockSlot`)은 방문이 아니라 페이지에 든다.** 리셋이 건드리지 않고, 쓰기는
 * 2번의 가드를 지나지 않고 **그 쓰기를 부른 페이지의 잠금**을 곧바로 고친다 — 나에 머무는
 * 동안 가의 응답이 오면 가의 잠금이 풀리고(나의 칸은 그대로다), 가로 돌아와 있으면 돌아온
 * 방문의 잠금이 풀린다. 잠금이 남아 있는 한 돌아온 방문은 **그 칸을 고칠 수 없으므로**, 응답의
 * 뒷일(초안 비우기·편집 칸 닫기)이 지우는 것은 언제나 **보낸 그것**이다.
 *
 * **고르지 않은 둘**(리뷰가 제시한 갈래):
 *
 * - **쓰기 표지를 «방문 세대»로** — 돌아온 방문에 앞 응답이 안 닿는다. 그러면 돌아온 가는
 *   응답이 가져온 서버 값을 못 받는데, 돌아와 건 조회는 저장이 커밋되기 **전**의 값을 읽을
 *   수 있다(리뷰의 판이 그것이다) — 재조회를 하나 더 지어야 한다. 그리고 잠금이 여전히
 *   버려져 있어 아래 «동시 저장»이 그대로 남는다.
 * - **«보낸 값 === 지금 칸 값»일 때만 비운다** — 친 글은 살지만 잠금이 버려진 채라 둘째 저장이
 *   나간다. 둘이 동시에 나가면 **응답의 순서가 서버가 쓴 순서라는 보장이 없어**(나중에 보낸
 *   것이 먼저 올 수 있다) 화면이 DB 와 다른 값을 보일 수 있다 — 서버에 기대값이 없으므로
 *   (`page-description.tsx`의 «남의 저장을 조용히 덮는다») 화면이 그 순서를 알 길이 없다.
 *   이 갈래를 잠금과 **함께** 두면 비교가 도는 길이 사라진다 — 잠긴 칸은 고칠 수 없어 «보낸
 *   값»과 «지금 값»이 늘 같다. **재는 것이 없는 가드를 두지 않았다.**
 *
 * **같은 칸에 저장이 둘 동시에 나가는 것은 막는다.** 근거는 위 둘째 갈래의 순서 문제와,
 * 이 저장소가 이미 적어 둔 규칙이다 — 코멘트의 `BUSY`: *"같은 코멘트가 두 번 나가면 번호는
 * 하나인데 행이 둘이 된다."* 8차의 탭 왕복(리뷰 N1)이 막은 것도 같은 규칙이었고, 가 → 나 → 가는
 * 그 규칙을 **페이지 왕복**으로 비켜 가는 길이었다.
 *
 * **잠금이 옆 페이지를 잠그지는 않는다** — 잠금은 가에 매였으므로 나에서는 바로 쓸 수 있다
 * (2번의 케이스가 그것도 본다).
 *
 * ## «대상» 가드는 따로 없다
 *
 * 저장이 도는 동안 대상은 입력을 꺼서 못 바꾸게 한다(설명의 `SAVING`, 코멘트의 `BUSY`) —
 * 그 잠금이 탭 왕복에도(칸이라서) 페이지 왕복에도(위 3번) 풀리지 않는다. 그래서 저장 도중
 * 대상이 바뀌는 길은 **다른 페이지로 가 있는 동안** 하나이고, 그때 응답은 위 2번이 버린다.
 * 새 코멘트의 대상(고른 노드)은 게시 도중에도 바뀔 수 있지만 그 응답이 하는 일은 «보낸 초안을
 * 비운다»뿐이라 어느 노드를 골라 두었는지와 무관하다.
 *
 * ## 이것이 막지 못하는 것
 *
 * - **남의 저장을 조용히 덮는다**(리뷰 N3) — `panels/page-description.tsx`의 머리말이 갖는다.
 * - **provider 째 내려가는 길**(프로젝트를 오가거나 로그아웃 뒤 다시 들어온다) — 잠금도
 *   초안도 함께 사라지고 응답은 **어디에도 닿지 않는다.** 돌아온 화면의 조회가 커밋 전 값을
 *   읽었으면 그 낡은 값을 고칠 길이 없다(리뷰 N-E — 그 머리말의 «재지 않은 창»).
 * - **다른 페이지에 가 있는 동안 저장이 실패하는 길** — 초안은 떠날 때 1번이 이미 버렸고
 *   실패 통지는 2번이 버린다. 돌아와도 통지가 없다. 떠난 뒤 돌아와 있는 동안 실패하면 통지는
 *   서지만 상자는 서버 값이다(보낸 글은 떠날 때 버렸다). **떠나면 버린다는 1번의 규칙**이
 *   나가 있는 저장에도 선 것이다 — 이 판이 바꾸지 않았고 보고로 올린다.
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
  /**
   * `'visit'`은 그 방문의 것이라 페이지가 바뀌면 버린다(위 머리말 1·2). `'lock'`은 그 페이지로
   * 나간 쓰기가 있다는 잠금이라 **그 페이지에 매인 채** 남는다(머리말 3).
   */
  readonly kind: 'visit' | 'lock'
}

export function slot<T>(name: string, initial: T): Slot<T> {
  return { name, initial, kind: 'visit' }
}

/**
 * 잠금 칸 — «이 페이지로 나간 쓰기가 있다». 처음엔 풀려 있다. **페이지를 떠났다 돌아와도
 * 그 쓰기가 끝나기 전에는 풀리지 않는다**(위 머리말 3).
 */
export function lockSlot(name: string): Slot<boolean> {
  return { name, initial: false, kind: 'lock' }
}

/** 칸에 넣을 값, 또는 앞 값으로 다음 값을 짓는 함수(`useState`의 그것과 같다). */
export type SlotUpdate<T> = T | ((prev: T) => T)

interface Held {
  /** 이 칸들이 가리키는 페이지. */
  pageId: string | undefined
  /** 이 방문의 칸. 한 번도 안 쓴 칸은 여기 없다 — 읽으면 `initial`이 나온다. */
  values: ReadonlyMap<Slot<unknown>, unknown>
  /** 잠금 칸마다 **잠긴 페이지들**. 페이지가 바뀌어도 리셋이 건드리지 않는다. */
  locks: ReadonlyMap<Slot<unknown>, ReadonlySet<string | undefined>>
}

interface Box {
  held: Held
  write: <T>(pageId: string | undefined, key: Slot<T>, update: SlotUpdate<T>) => void
}

const PanelDraftsContext = createContext<Box | null>(null)

function read<T>(held: Held, key: Slot<T>): T {
  if (key.kind === 'lock') return (held.locks.get(key)?.has(held.pageId) ?? false) as T
  return (held.values.has(key) ? held.values.get(key) : key.initial) as T
}

/** `update`를 앞 값에 적용한다(`useState`의 그것과 같다). */
function apply<T>(current: T, update: SlotUpdate<T>): T {
  return typeof update === 'function' ? (update as (prev: T) => T)(current) : update
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
  const [held, setHeld] = useState<Held>(() => ({ pageId, values: new Map(), locks: new Map() }))

  // **1. 페이지가 바뀌면 방문의 칸을 전부 버린다** — 렌더 중에(위 머리말). React가 이
  // 컴포넌트를 곧바로 다시 그리므로 자식은 앞 페이지의 칸을 한 번도 보지 않는다.
  // **잠금은 넘긴다**(머리말 3) — 페이지마다 따로 들므로 옆 페이지를 잠그지 않는다.
  if (held.pageId !== pageId) {
    setHeld((prev) => ({ pageId, values: new Map(), locks: prev.locks }))
  }

  const write = useCallback(
    <T,>(at: string | undefined, key: Slot<T>, update: SlotUpdate<T>): void => {
      setHeld((prev) => {
        // **3. 잠금은 그 쓰기를 부른 페이지의 것을 고친다 — 지금 페이지가 어디든.** 아래
        // 가드를 지나면 나에 가 있는 동안 온 가의 응답이 가의 잠금을 못 풀어, 돌아온 가가
        // 영영 잠긴다.
        if (key.kind === 'lock') {
          const pages = prev.locks.get(key) ?? new Set<string | undefined>()
          const current = pages.has(at)
          const next = apply(current as T, update) as boolean
          if (next === current) return prev
          const nextPages = new Set(pages)
          if (next) nextPages.add(at)
          else nextPages.delete(at)
          const locks = new Map(prev.locks)
          locks.set(key, nextPages)
          return { ...prev, locks }
        }
        // **2. 다른 페이지를 위해 부른 쓰기는 버린다**(리뷰 N2) — 위 1번과 같은 값을 본다.
        if (prev.pageId !== at) return prev
        const current = read(prev, key)
        const next = apply(current, update)
        if (Object.is(next, current)) return prev
        const values = new Map(prev.values)
        values.set(key as Slot<unknown>, next)
        return { ...prev, values }
      })
    },
    [],
  )

  const box = useMemo<Box>(() => ({ held, write }), [held, write])
  return <PanelDraftsContext.Provider value={box}>{props.children}</PanelDraftsContext.Provider>
}

/**
 * 칸 하나를 읽고 쓴다. 돌려주는 쓰기 함수는 **이 렌더의 페이지를 단다** — 저장을 시작한
 * 클릭이 잡아 둔 그 함수는 응답이 올 때도 그 페이지를 말한다(위 머리말의 2번·3번).
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
