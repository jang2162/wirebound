/**
 * RFC 6902의 부분집합. wirebound는 이 다섯 연산만 쓴다.
 *
 * **`test`는 문서를 바꾸지 않고 전제만 잰다** — 그 자리의 값이 `value`와 같지 않으면(없으면) 묶음째 적용이 실패한다. 상태 목록처럼 번호로만
 * 가리킬 수 있는 자리를 고치는 묶음이 «그 번호에 아직 그 항목이 있다»를 싣는 데 쓴다(`view-state-guard.ts`).
 */
export type PatchOp =
  | { op: 'add'; path: string; value: unknown }
  | { op: 'remove'; path: string }
  | { op: 'replace'; path: string; value: unknown }
  | { op: 'move'; from: string; path: string }
  | { op: 'test'; path: string; value: unknown }

export class PatchError extends Error {
  readonly path: string

  constructor(message: string, path: string) {
    super(message)
    this.name = 'PatchError'
    this.path = path
  }
}
