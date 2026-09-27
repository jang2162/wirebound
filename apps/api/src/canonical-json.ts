/**
 * 두 값이 **키 순서를 빼고** 같은지 비교하기 위한 정규 문자열.
 *
 * ---
 *
 * # 왜 `JSON.stringify` 비교로는 안 되는가
 *
 * 복원은 *"payload의 것과 지금 것이 같은가"*를 페이지 문서에 대해 묻는다.
 * `JSON.stringify`로 비교하면 **같은 상태를 재는데 매번 "다르다"가 나온다** — 대상이 아니라
 * 측정 장치가 틀리는 자리다. 두 쪽이 내는 모양:
 *
 * ```
 * 저장된 payload의 문서 : {"root":{…},"version":1}
 * 지금 캡처한 문서      : {"version":1,"root":{…}}
 * ```
 *
 * **경계가 둘이고 각자 다른 순서를 만든다:**
 *
 * | 어디 | 무엇이 순서를 정하나 |
 * |---|---|
 * | `snapshots.payload`(**jsonb**)에서 읽은 값 | Postgres가 정규화한다 — 키를 **길이순, 같으면 바이트순**으로 정렬한다 (`root`(4) → `version`(7)) |
 * | `captureSnapshot`이 방금 만든 값 | 마지막에 `SnapshotPayloadSchema.parse`를 지나므로 **zod 스키마의 선언 순서**다 (`version` → `root`) |
 *
 * # 그래서 무엇을 잃는가
 *
 * **페이지 문서는 잃는 것이 없다.** 문서에서 순서를 나르는 것은 `children` **배열**이고,
 * 배열 순서는 이 함수도 jsonb도 보존한다.
 */

/**
 * 객체 키를 재귀적으로 정렬한 JSON 문자열. 배열의 순서는 **그대로 둔다** — 배열은 순서
 * 자체가 값이다.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value))
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value !== null && typeof value === 'object') {
    const sorted: Record<string, unknown> = {}
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = canonicalize((value as Record<string, unknown>)[key])
    }
    return sorted
  }
  return value
}
