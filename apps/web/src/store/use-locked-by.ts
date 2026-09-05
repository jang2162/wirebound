/**
 * **화면이 스토어의 잠금 목록을 손에 쥐는 한 자리**(설계 §7.2의 1차 방어).
 *
 * # 왜 훅이 하나 더 생겼나
 *
 * 판정은 스토어의 `lockedBy`가 하고 그것은 **함수라 참조가 안 바뀐다.** 그래서 잠금이
 * 오가는 것을 화면이 알려면 목록 자체를 구독해야 하는데, 그 구독은 *"목록을 손에 쥐는
 * 자리는 하나"*라는 규칙 아래 있다(`test/lock/one-verdict.test.ts` — *"셋째 판정은 여기서
 * 먼저 보인다"*). **잠금을 봐야 하는 패널이 둘이 되면서**(구조 트리 · 속성 패널) 그 하나를
 * 어느 패널에 둘지가 문제가 됐다 — 둘은 형제라 한쪽이 다른 쪽에 값을 내려 줄 수 없다.
 *
 * **그래서 구독을 패널 밖으로 옮겼다.** 자리는 여전히 **하나**이고, 이제 그 하나가
 * 「스토어의 React 바인딩」이라 새로 잠금을 봐야 하는 화면이 생겨도 늘지 않는다.
 *
 * # 판정은 여기서도 하지 않는다
 *
 * 이 파일은 `findLockConflict`를 부르지 않는다 — `store.lockedBy`를 **그대로 돌려준다.**
 * 목록을 뒤지는 코드가 여기 생기면 그것이 곧 두 벌째 판정이고, 그때 화면이 통과시킨 편집을
 * 서버가 거절한다(`packages/schema/src/lock.ts`의 머리말).
 */
import type { NodeLock } from '@wirebound/schema'
import { useEditorStore, useEditorStoreInstance } from './use-editor-store'

/**
 * 잠금이 하나도 없을 때의 답. **참조를 고정한다** — 렌더마다 새 함수를 만들면 이 값을
 * 의존 배열에 넣는 쪽이 생겼을 때 매 렌더 다시 돈다.
 *
 * 잠금이 없으면 아예 묻지 않는 것이기도 하다. `lockedBy`는 문서를 뒤지므로(`findNodePath`)
 * 흔한 판에서 그 순회를 건너뛴다 — 스토어도 같은 이유로 같은 가드를 갖는다.
 */
const NO_LOCK = (): null => null

/**
 * 그 노드를 막는 **남의** 잠금을 답하는 함수. 없으면 `null`이다.
 *
 * **잠금 목록이 바뀌면 부르는 컴포넌트가 다시 그려진다** — 그것이 이 훅의 절반이고,
 * 나머지 절반은 *"판정은 스토어가 한다"*이다.
 */
export function useLockedBy(): (nodeId: string) => NodeLock | null {
  const store = useEditorStoreInstance()
  const locks = useEditorStore(store, (s) => s.locks)
  return locks.length === 0 ? NO_LOCK : store.lockedBy
}
