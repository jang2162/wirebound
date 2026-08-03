/** RFC 6902의 부분집합. wirebound는 이 네 연산만 쓴다. */
export type PatchOp =
  | { op: 'add'; path: string; value: unknown }
  | { op: 'remove'; path: string }
  | { op: 'replace'; path: string; value: unknown }
  | { op: 'move'; from: string; path: string }

export class PatchError extends Error {
  readonly path: string

  constructor(message: string, path: string) {
    super(message)
    this.name = 'PatchError'
    this.path = path
  }
}
