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
 * 9차 = jsdom 케이스 셋 — `test/panels/page-description-edit.test.tsx`·`comment-panel.test.tsx` —
 * 과 Chrome 재측(같은 3초 지연 · 쓰기 요청 각 1건). Chrome 에서는 잠긴 상자에 쳐도 글자가 안
 * 들어간다. 돌아온 상자는 잠긴 동안 **돌아와 건 조회의 값**(저장 전 서버 값)을 보이다가 응답이
 * 오면 저장된 값으로 바뀐다 — **돌아와 건 조회가 쓰기 응답보다 먼저 왔을 때만이다**(늦게 오면 아래
 * «이것이 막지 못하는 것»의 타이밍 창). 잠깐 옛 값이 보이는 것은 남는다):
 *
 * | 칸 | 8차 | 9차 |
 * |---|---|---|
 * | 설명 | 돌아온 상자가 **열려** 있다(잠금이 리셋에 버려졌다). 친 글이 앞 저장의 응답에 **경고 없이 지워지고** «저장했습니다»가 뜬다 | 상자·버튼이 **꺼진 채** 돌아온다. 응답이 오면 풀리고, 돌아와 건 조회가 쓰기 응답보다 먼저 왔으면 저장된 값이 선다 |
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
 * ### 잠금은 이 provider 보다 오래 산다 — 장부에 든다 (이월 Q, 2026-09-21)
 *
 * 9차 판은 잠금을 이 provider 의 상태에 들었다. 그래서 provider 째 내려가는 길(프로젝트 목록 ·
 * 다른 프로젝트 · 테마 편집기 · 로그아웃 뒤 다시 로그인)에서는 잠금이 함께 사라졌고, 앞 쓰기가
 * 나가 있는 채 둘째 쓰기가 나가 **늦게 온 앞 쓰기가 뒤 쓰기를 덮었다**(Chrome — 값은
 * `write-ledger.tsx`의 머리말). **이제 잠금 칸의 값은 `app.tsx`의 `<Routes>` 위에 선 장부
 * (`write-ledger.tsx`)에 든다** — 키는 (프로젝트, 페이지, 칸)이고, 여기는 그것을 읽기만 한다
 * (`usePanelLock`). 위 셋째 단락의 규칙(«그 쓰기를 부른 페이지의 잠금을 곧바로 고친다»)은 장부가
 * 그대로 지킨다 — 키가 페이지를 들고 있다.
 *
 * **칸 쓰기도 «지금 떠 있는 provider»로 간다**(`usePanelSlot`) — 내려간 provider 로 시작한 쓰기의
 * 응답이, 새로 선 provider 가 같은 페이지를 보고 있으면 그 방문에 닿는다. 위 셋째 단락의 «돌아온
 * 방문의 잠금이 풀린다 · 뒷일이 지우는 것은 보낸 그것이다»를 provider 째 갈린 방문까지 넓힌 것이다.
 * 이 provider 가 떠 있는 동안은 자기 자신이 «지금 떠 있는 provider»라 아무것도 달라지지 않는다.
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
 * 새 코멘트의 대상(고른 노드)은 게시 도중에도 바뀔 수 있다 — 그래서 초안을 **노드마다** 들고
 * 응답은 **보낸 노드의 초안만** 비운다(`comment-panel.tsx`의 `DRAFTS`).
 *
 * ## 이것이 막지 못하는 것
 *
 * - **남의 저장을 조용히 덮는다**(리뷰 N3) — `panels/page-description.tsx`의 머리말이 갖는다.
 * - **새로고침·탭 닫기** — provider 째 내려가는 길 가운데 **장부까지 사라지는** 둘이다(문서가
 *   새로 뜬다). 잠금이 사라지고 브라우저는 나가 있던 요청을 끊지만, **서버가 이미 받았으면 끊겨도
 *   커밋한다.** 그 값과 남는 틈은 `write-ledger.tsx`의 머리말이 갖는다. (프로젝트 목록 · 다른
 *   프로젝트 · 테마 편집기 · 로그아웃 뒤 다시 로그인은 **이제 막는다** — 위 3의 «잠금은 이 provider
 *   보다 오래 산다». 9차 판에는 그 넷도 여기 있었다.)
 * - **응답이 늦는 쓰기의 판정 뒤 늦은 커밋** — 쓰기에 시간 제한이 생겼다(`write-ledger.tsx`의
 *   `WRITE_DEADLINE_MS`). 넘으면 끊고 서버에서 다시 읽어 판정하는데, 서버가 이미 받은 요청이면 판정
 *   **뒤에** 커밋될 수 있다. 9차 판에서는 시간 제한이 없어 잠금이 페이지·탭·모드 왕복에도 남고
 *   프로젝트 목록을 다녀와야 풀렸다(그리고 그렇게 풀면 위 첫째 길로 갔다).
 * - **타이밍 창** — 돌아와 건 조회가 **커밋 전 값을 읽고 쓰기 응답보다 늦게** 오면, 응답이 세운
 *   값을 그 조회가 덮는다. 잠금은 응답에 풀리고 조회 값을 안 건드리므로 이 창을 막지도 만들지도
 *   않는다.
 *   설명·코멘트가 각자 무엇을 보이는지는 `page-description.tsx`의 «낡은 값이 보이는 길 둘»의
 *   첫째와 `comment-panel.tsx`의 «잠금이 막지 못하는 길»이 갖는다(9차 좁은 반증, Chrome).
 * - **다른 페이지에 가 있는 동안 저장이 실패하는 길** — 초안은 떠날 때 1번이 이미 버렸고
 *   실패 통지는 2번이 버린다. 돌아와도 통지가 없다(상자는 서버 값 · 열림). 돌아와 있는 동안
 *   실패하면 통지(«서버 오류»)는 서지만 상자는 서버 값이다 — 보낸 글은 떠날 때 버렸다(9차 jsdom
 *   임시 계측, 500. 9차 좁은 반증의 Chrome 도 같다 — 설명·코멘트 · 500 과 네트워크 끊김).
 *   **떠나면 버린다는 1번의 규칙**이 나가 있는 저장에도 선 것이다 — 이 판이 바꾸지 않았고
 *   보고로 올린다.
 * - **다른 페이지에 가 있는 동안 쓰기가 401을 받는 길** — 실패 통지를 2번이 버리므로 «로그인»
 *   화면(`SignedOut`)도 서지 않는다. 사용자는 세션이 끊긴 줄 모르고 옆 페이지에 머물고, 다음
 *   조회가 401을 받을 때에야 로그인 화면으로 간다(9차 좁은 반증, Chrome — 같은 세션을 다른
 *   탭에서 로그아웃한 판. 그 페이지에 머물러 있었으면 곧바로 로그인 화면으로 갔다).
 */
import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react'
import {
  useWriteLedger,
  writeKey,
  type PageAt,
  type Receiver,
  type TrackedWrite,
  type WritePhase,
} from './write-ledger'

/**
 * 칸 하나의 선언. **모듈 최상위에 한 번 만든다** — 칸을 가리는 것은 이 객체의 정체성이다.
 * 이름은 사람이 읽으라고 있다(디버거에서 `Map`의 키를 볼 때).
 *
 * `initial`은 **공유되는 값**이라 고쳐 쓰지 않는다 — 쓰는 쪽은 언제나 새 값을 넣는다.
 *
 * 이 칸은 **그 방문의 것**이라 페이지가 바뀌면 버린다(위 머리말 1·2). 잠금은 칸이 아니다 —
 * `lockSlot`이고 값은 장부에 든다(머리말 3).
 */
export interface Slot<T> {
  readonly name: string
  readonly initial: T
}

export function slot<T>(name: string, initial: T): Slot<T> {
  return { name, initial }
}

/**
 * 잠금 칸 — «이 페이지의 이 칸으로 나간 쓰기가 있다». **값은 여기가 아니라 장부
 * (`write-ledger.tsx`)에 든다** — 이 provider 가 내려가도 쓰기는 살기 때문이다(머리말 3). 이름이
 * 장부의 키 셋째 자리다.
 */
export interface LockSlot {
  readonly name: string
}

export function lockSlot(name: string): LockSlot {
  return { name }
}

/** 칸에 넣을 값, 또는 앞 값으로 다음 값을 짓는 함수(`useState`의 그것과 같다). */
export type SlotUpdate<T> = T | ((prev: T) => T)

interface Held {
  /** 이 칸들이 가리키는 프로젝트와 페이지. */
  projectId: string
  pageId: string | undefined
  /** 이 방문의 칸. 한 번도 안 쓴 칸은 여기 없다 — 읽으면 `initial`이 나온다. */
  values: ReadonlyMap<Slot<unknown>, unknown>
}

interface Box {
  held: Held
  receiver: Receiver
}

const PanelDraftsContext = createContext<Box | null>(null)

function read<T>(held: Held, key: Slot<T>): T {
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
  projectId: string
  pageId: string | undefined
  children: ReactNode
}): ReactElement {
  const { projectId, pageId } = props
  const ledger = useWriteLedger()
  const [held, setHeld] = useState<Held>(() => ({ projectId, pageId, values: new Map() }))

  // **1. 페이지가 바뀌면 방문의 칸을 전부 버린다** — 렌더 중에(위 머리말). React가 이
  // 컴포넌트를 곧바로 다시 그리므로 자식은 앞 페이지의 칸을 한 번도 보지 않는다. 잠금은
  // 여기 없으므로 건드릴 것이 없다(머리말 3 — 장부에 든다).
  if (held.projectId !== projectId || held.pageId !== pageId) {
    setHeld({ projectId, pageId, values: new Map() })
  }

  const accept = useCallback((at: PageAt, key: object, update: unknown): void => {
    setHeld((prev) => {
      // **2. 다른 페이지를 위해 부른 쓰기는 버린다**(리뷰 N2) — 위 1번과 같은 값을 본다.
      if (prev.projectId !== at.projectId || prev.pageId !== at.pageId) return prev
      const slotKey = key as Slot<unknown>
      const current = read(prev, slotKey)
      const next = apply(current, update as SlotUpdate<unknown>)
      if (Object.is(next, current)) return prev
      const values = new Map(prev.values)
      values.set(slotKey, next)
      return { ...prev, values }
    })
  }, [])

  const [token] = useState(() => Symbol('panel-drafts'))
  const receiver = useMemo<Receiver>(() => ({ token, accept }), [token, accept])
  const { receive } = ledger
  // **지금 떠 있는 provider 로 선다**(머리말 3) — 내려간 provider 로 시작한 쓰기의 응답이 여기
  // 닿는다. **레이아웃 이펙트인 것이 요점이다** — 자식의 이펙트(조회 걸기)가 먼저 돌면 그 쓰기가
  // 서기 전의 자리를 찾는다.
  useLayoutEffect(() => receive(receiver), [receive, receiver])

  const box = useMemo<Box>(() => ({ held, receiver }), [held, receiver])
  return <PanelDraftsContext.Provider value={box}>{props.children}</PanelDraftsContext.Provider>
}

function useBox(name: string): Box {
  const box = useContext(PanelDraftsContext)
  if (box === null) {
    throw new Error(`패널 칸(${name})은 PanelDraftsProvider 안에서만 쓴다`)
  }
  return box
}

/**
 * 칸 하나를 읽고 쓴다. 돌려주는 쓰기 함수는 **이 렌더의 페이지를 단다** — 저장을 시작한
 * 클릭이 잡아 둔 그 함수는 응답이 올 때도 그 페이지를 말한다(위 머리말의 2번·3번). 그리고
 * **지금 떠 있는 provider 에 쓴다** — 이 provider 가 내려갔으면 새로 선 provider 가 같은 페이지를
 * 보고 있을 때 받는다(머리말 3).
 *
 * **provider가 없으면 요란하게 깨진다** — 조용히 로컬 상태로 물러나면 탭을 누를 때 초안이
 * 다시 사라지는데 화면은 멀쩡해 보인다(고치기 전과 똑같은 결함이 소리 없이 돌아온다).
 */
export function usePanelSlot<T>(key: Slot<T>): [T, (update: SlotUpdate<T>) => void] {
  const { held, receiver } = useBox(key.name)
  const { deliver } = useWriteLedger()
  const { projectId, pageId } = held
  const set = useCallback(
    (update: SlotUpdate<T>) => deliver(receiver, { projectId, pageId }, key, update),
    [deliver, receiver, projectId, pageId, key],
  )
  return [read(held, key), set]
}

/** 잠금 칸 하나 — 장부에서 읽고, 쓰기를 장부에 올린다. */
export interface PanelLock {
  /** 이 페이지의 이 칸으로 나간 쓰기가 있다. */
  readonly locked: boolean
  /** 그 쓰기의 단계(`write-ledger.tsx`). 없으면 `null`. */
  readonly phase: WritePhase | null
  /** `'unknown'`일 때만 — 서버에서 다시 읽어 판정한다. */
  readonly recheck: (() => void) | null
  /**
   * 쓰기를 장부에 올려 보낸다. **이 렌더의 페이지를 단다.** 이미 나가 있으면 아무것도 안 한다.
   */
  run<T, V>(write: TrackedWrite<T, V>): Promise<void>
}

export function usePanelLock(key: LockSlot): PanelLock {
  const { held, receiver } = useBox(key.name)
  const ledger = useWriteLedger()
  const { projectId, pageId } = held
  const target = useMemo(() => ({ projectId, pageId, slot: key.name }), [projectId, pageId, key.name])
  const entry = ledger.writes.get(writeKey(target))
  const { run: runOnLedger } = ledger
  const run = useCallback(
    <T, V>(write: TrackedWrite<T, V>) => runOnLedger(target, receiver.token, write),
    [runOnLedger, target, receiver.token],
  )
  return { locked: entry !== undefined, phase: entry?.phase ?? null, recheck: entry?.recheck ?? null, run }
}
