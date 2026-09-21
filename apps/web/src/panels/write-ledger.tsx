/**
 * **나가 있는 쓰기의 장부** — 에디터 라우트보다 오래 산다(이월 Q, 2026-09-21).
 *
 * `panel-drafts.tsx`의 provider 는 에디터 셸 안에 선다. 그래서 **프로젝트 목록 · 다른 프로젝트 ·
 * 테마 편집기 · 로그아웃 뒤 다시 로그인**으로 가면 통째로 내려가고, 거기 들어 있던 잠금도 함께
 * 사라졌다. 그 잠금이 막던 것이 그대로 돌아왔다 — **앞 쓰기가 나가 있는 채 둘째 쓰기가 나가고,
 * 늦게 도착한 앞 쓰기가 뒤 쓰기를 덮는다.**
 *
 * **고치기 전 실측**(Chrome · 첫 쓰기를 서버에 닿기 전에 붙잡고, 돌아와 둘째를 보낸 뒤 둘째 → 첫째
 * 순으로 서버에 보냈다):
 *
 * | 칸 | 입구 | 돌아온 화면 | 끝 |
 * |---|---|---|---|
 * | 설명 | 프로젝트 목록 · 다른 프로젝트 · 테마 편집기 · 로그아웃 → 다시 로그인 | 상자가 **열려** 있다 | 화면 `"둘째 저장 글"` · «설명을 저장했습니다» / **DB `"매달린 저장 글"`** (넷 다) |
 * | 새 코멘트 | 프로젝트 목록 | 상자가 열려 있다 | 화면 1행 / **DB 2행**, 번호 1 |
 * | 코멘트 수정 | 프로젝트 목록 | 수정 단추가 열려 있다 | 화면 `"둘째 수정"` / **DB `"첫째 수정"`** |
 * | (대조) 셋 다 | 옆 페이지 왕복 | 꺼져 있다(9차 잠금) | 둘째를 보낼 수 없다 |
 *
 * ## 그래서 잠금을 여기 든다 — `app.tsx`의 `<Routes>` 위
 *
 * 잠금의 원천은 «그 페이지의 그 칸으로 나간 쓰기가 있다»는 사실이다. 그 사실은 화면이 아니라
 * **요청**의 수명을 따른다 — 요청은 셸이 내려가도 산다. 그러니 셸보다 오래 사는 자리에 둔다.
 * **키는 (프로젝트, 페이지, 칸)**이다 — 9차의 «잠금은 페이지에 매단다»(`panel-drafts.tsx`의 머리말
 * 3)를 한 층 위로 올린 것이고, 그 잠금 칸은 이제 **여기만** 읽는다(두 벌이 아니다).
 *
 * **초안은 들지 않는다.** 여기 드는 것은 «나가 있는 쓰기»뿐이다. 초안은 에디터를 떠나면 버린다는
 * 지금 규칙 그대로다(`panel-drafts.tsx` 머리말 1).
 *
 * ## 응답은 **지금 그 페이지를 보고 있는 방문**에 닿는다 — provider 가 바뀌었어도
 *
 * 잠금만 남기면 반쪽이다. 돌아온 방문의 조회는 쓰기가 커밋되기 **전** 값을 읽었을 수 있고(리뷰
 * N-E), 앞 쓰기의 응답은 **내려간 provider** 의 칸에 쓰여 아무 데도 안 닿는다. 그래서 칸 쓰기는
 * 언제나 **지금 떠 있는 provider**(`Receiver`)로 간다 — 그 provider 가 같은 (프로젝트, 페이지)를
 * 보고 있을 때만 받는다. 9차가 «가 → 나 → 가»에서 응답을 **돌아온 방문**에 닿게 한 것과 같은
 * 규칙을 provider 째 갈린 방문까지 넓힌 것이다. 잠금이 남아 있는 한 돌아온 방문은 그 칸을 고칠 수
 * 없었으므로 응답의 뒷일(초안 비우기·편집 칸 닫기)이 지우는 것은 언제나 **보낸 그것**이다.
 *
 * 응답이 **에디터 밖에 있는 동안** 오면 받을 provider 가 없어 버려진다. 잠금은 여기서 풀리므로,
 * 돌아오면 새 방문이 조회를 걸어 **커밋된 뒤의** 값을 읽는다.
 *
 * ## 이것이 막지 못하는 것
 *
 * - **새로고침·탭 닫기.** 이 장부는 메모리라 문서와 함께 사라진다(`sessionStorage` 로 넘기지
 *   않았다 — 세션을 넘는 상태를 이 앱이 처음 드는 것이 된다).
 * - **응답이 영영 안 오는 쓰기** — 쓰기에 시간 제한이 없다. 잠금이 이제 에디터를 떠났다 와도 남으므로
 *   **새로고침 말고는 풀 길이 없다**(이월 R — 다음 커밋).
 */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react'

/** 쓰기가 가리키는 자리. **키가 셋인 것이 요점이다** — 셸이 바뀌어도 같은 칸을 가리킨다. */
export interface WriteTarget {
  readonly projectId: string
  readonly pageId: string | undefined
  /** 칸의 이름(`panel-drafts.tsx`의 `lockSlot`). */
  readonly slot: string
}

/** 쓰기가 끝난 모양 — 성공 응답(`'done'`) 또는 실패(`'failed'` — 실패 응답 · 연결 실패). */
export type WriteOutcome<T> = { kind: 'done'; value: T } | { kind: 'failed'; caught: unknown }

export interface TrackedWrite<T> {
  /** 요청을 보낸다. */
  send(): Promise<T>
  /**
   * 끝난 뒤의 일(응답을 칸에 쓰기 · 목록 다시 받기 …). **잠금을 쥔 채 돈다** — 이것이 끝나야 풀린다.
   * 8차까지 코멘트의 쓰기가 다시 받기까지 잠금 안에서 했던 것과 같다.
   */
  settle(outcome: WriteOutcome<T>): void | Promise<void>
}

/** 칸 쓰기가 닿을 곳 — 지금 떠 있는 `PanelDraftsProvider`. */
export interface Receiver {
  readonly token: symbol
  /** `at`의 페이지를 보고 있으면 그 칸에 쓴다. 칸과 값의 모양은 `panel-drafts.tsx`의 몫이다. */
  readonly accept: (at: PageAt, key: object, update: unknown) => void
}

export interface PageAt {
  readonly projectId: string
  readonly pageId: string | undefined
}

interface Ledger {
  /** 쓰기가 나가 있는 칸들(`writeKey`). */
  readonly writes: ReadonlySet<string>
  /**
   * 쓰기를 올린다. **잠겨 있는지는 부르는 쪽이 먼저 본다**(`usePanelLock`의 `locked`) — 여기서
   * 한 번 더 막지 않는다. 막을 길을 찾아 봤는데 화면에서 닿는 길이 없었다: 클릭·제출은 React 가
   * 곧바로 다시 그린 뒤에 다음 이벤트를 받으므로 둘째 클릭은 이미 꺼진 버튼을 본다. 재는 것이 없는
   * 가드를 두지 않았다.
   */
  run<T>(target: WriteTarget, write: TrackedWrite<T>): Promise<void>
  /** 지금 떠 있는 provider 로 선다. 돌려주는 함수가 물러난다. */
  receive(receiver: Receiver): () => void
  /** 칸 쓰기를 보낸다 — **지금 떠 있는 provider** 로(없거나 자기면 자기에게). */
  deliver(from: Receiver, at: PageAt, key: object, update: unknown): void
}

const LedgerContext = createContext<Ledger | null>(null)

export function writeKey(target: WriteTarget): string {
  return `${target.projectId}\u0000${target.pageId ?? ''}\u0000${target.slot}`
}

export function WriteLedgerProvider(props: { children: ReactNode }): ReactElement {
  const [writes, setWrites] = useState<ReadonlySet<string>>(() => new Set())
  const receiverRef = useRef<Receiver | null>(null)

  const run = useCallback(async <T,>(target: WriteTarget, write: TrackedWrite<T>): Promise<void> => {
    const key = writeKey(target)
    setWrites((prev) => new Set(prev).add(key))
    try {
      let outcome: WriteOutcome<T>
      try {
        outcome = { kind: 'done', value: await write.send() }
      } catch (caught) {
        outcome = { kind: 'failed', caught }
      }
      await write.settle(outcome)
    } finally {
      setWrites((prev) => {
        const next = new Set(prev)
        next.delete(key)
        return next
      })
    }
  }, [])

  const receive = useCallback((receiver: Receiver) => {
    receiverRef.current = receiver
    return () => {
      if (receiverRef.current === receiver) receiverRef.current = null
    }
  }, [])

  const deliver = useCallback((from: Receiver, at: PageAt, key: object, update: unknown) => {
    const current = receiverRef.current
    ;(current === null ? from : current).accept(at, key, update)
  }, [])

  const ledger = useMemo<Ledger>(() => ({ writes, run, receive, deliver }), [writes, run, receive, deliver])
  return <LedgerContext.Provider value={ledger}>{props.children}</LedgerContext.Provider>
}

/** 장부. **provider 가 없으면 요란하게 깨진다** — 조용히 물러나면 잠금이 셸과 함께 다시 사라진다. */
export function useWriteLedger(): Ledger {
  const ledger = useContext(LedgerContext)
  if (ledger === null) throw new Error('쓰기 장부는 WriteLedgerProvider 안에서만 쓴다')
  return ledger
}
