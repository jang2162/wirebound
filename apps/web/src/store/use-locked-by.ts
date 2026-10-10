/**
 * **화면이 스토어의 잠금 목록을 손에 쥐는 한 자리**(설계서 「소프트 잠금」의 1차 방어).
 *
 * # 왜 패널이 아니라 훅인가
 *
 * 판정은 스토어의 `lockedBy`가 하고 그것은 **함수라 참조가 안 바뀐다.** 그래서 잠금이
 * 오가는 것을 화면이 알려면 목록 자체를 구독해야 하는데, 그 구독은 *"목록을 손에 쥐는
 * 자리는 하나"*라는 규칙 아래 있다(`test/lock/one-verdict.test.ts` — *"셋째 판정은 여기서
 * 먼저 보인다"*). **잠금을 봐야 하는 패널이 둘이라**(구조 트리 · 속성 패널) 그 하나를
 * 어느 패널에 둘지가 문제다 — 둘은 형제라 한쪽이 다른 쪽에 값을 내려 줄 수 없다.
 *
 * **그래서 구독을 패널 밖에 둔다.** 자리는 **하나**이고, 그 하나가
 * 「스토어의 React 바인딩」이라 새로 잠금을 봐야 하는 화면이 생겨도 늘지 않는다.
 *
 * # 판정은 여기서도 하지 않는다
 *
 * 이 파일은 `selectionConflicts`를 부르지 않는다 — `store.lockedBy`를 **그대로 돌려준다.**
 * 목록을 뒤지는 코드가 여기 생기면 그것이 곧 두 벌째 판정이고, 그때 화면이 통과시킨 편집을
 * 서버가 거절한다(`packages/schema/src/lock.ts`의 머리말).
 */
import type { NodeLock } from '@wirebound/schema'
import { useEditorStore, useEditorStoreInstance } from './use-editor-store'

/**
 * 그 노드를 막는 **남의** 잠금을 답하는 함수. 없으면 `null`이다.
 *
 * **잠금 목록이 바뀌면 부르는 컴포넌트가 다시 그려진다** — 그것이 이 훅의 절반이고,
 * 나머지 절반은 *"판정은 스토어가 한다"*이다.
 *
 * **여기 «잠금이 없으면»이라는 갈래(`locks.length === 0 ? NO_LOCK : store.lockedBy`)를 두지
 * 않는다.** 그 가드가 한다던 일 셋이 여기서 아무것도 가르지 않는다:
 *
 * | 그 가드가 한다던 일 | 잰 값 | 그래서 |
 * |---|---|---|
 * | 잠금이 없을 때 `findNodePath` 순회를 건너뛴다 | **스토어가 먼저 돌아온다** — `#lockConflictAt`의 첫 줄이 그 가드이고 `findNodePath`가 그 다음 줄이다. 두 줄을 뒤집으면 `test/panels/property-panel.test.tsx`의 *"children 배열 안에 노드가 아닌 원소가 있어도 노드를 고를 수 있다"*가 **혼자** 죽는다 | **그 축의 주인은 스토어다.** 여기 두 벌째를 두어도 건너뛸 것이 이미 없다 |
 * | 답의 참조를 고정한다 | `store.lockedBy`는 클래스 필드라 **그것도 고정이다** — 렌더 둘에서 같은 참조인 것이 가드가 있을 때와 없을 때 **양쪽 다** 참이다(`allSame=true`) | 가르지 않는다 |
 * | 행동 | 그 가드를 넣고 웹 전량(`pnpm vitest run --project web`)을 돌려도 **죽는 케이스가 없다** | 가르지 않는다 |
 *
 * **셋 다 안 가르는데 두면 그것이 두 벌째다** — 그 한 줄이 이 파일에서 잠금 «목록의 내용»(`length`)을
 * 읽는 유일한 자리가 되고, 위 머리말의 *"`store.lockedBy`를 **그대로**
 * 돌려준다"*가 글자 그대로는 거짓이 된다. 스토어가 사는 판정을 화면이 한 조각 베껴 쥐면
 * 갈릴 자리가 생긴다(「소프트 잠금」).
 */
export function useLockedBy(): (nodeId: string) => NodeLock | null {
  const store = useEditorStoreInstance()
  // **값을 안 쓴다 — 다시 그리려고 구독한다.** 판정하는 `store.lockedBy`는 함수라 참조가
  // 안 바뀌므로, 이 줄이 없으면 잠금이 오가도 부르는 화면이 그대로 서 있다.
  useEditorStore(store, (s) => s.locks)
  return store.lockedBy
}

/**
 * **잠금 목록이 바뀔 때마다 달라지는 값** — 효과의 의존으로만 쓴다(`useLayoutEffect(…, [locksVersion])`). 내용을 읽지 않는다: 읽는 판정은 `store.lockedBy` 하나다
 * (위 머리말). 목록을 구독하는 자리를 이 파일 하나로 두려는 것이라(`test/lock/one-verdict.test.ts` «화면이 잠금 목록을 손에 쥐는 자리도 하나다») 목록이 바뀐 줄
 * 알아야 하는 화면(끄는 중의 구조 트리 줄 — `panels/structure-tree.tsx`)은 이것으로 받는다.
 */
export function useLocksVersion(): unknown {
  const store = useEditorStoreInstance()
  return useEditorStore(store, (s) => s.locks)
}
