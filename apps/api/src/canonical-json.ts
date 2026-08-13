/**
 * 두 값이 **키 순서를 빼고** 같은지 비교하기 위한 정규 문자열(P6-2가 만들었다).
 *
 * ---
 *
 * # 왜 `JSON.stringify` 비교로는 안 되는가 — 재서 알았다
 *
 * 복원은 *"payload의 것과 지금 것이 같은가"*를 두 자리에서 묻는다(페이지 문서 D4, 테마 D6).
 * 처음엔 둘 다 `JSON.stringify` 비교로 짰고 **같은 상태를 재는데 매번 "다르다"가 나왔다.**
 * 대상이 아니라 측정 장치가 틀린 자리였다. 실측:
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
 * 테마는 한 겹 더 갈린다: `themes`의 절은 **`json`** 컬럼이라(0006 — 키 순서 계약 때문)
 * 원문 순서를 그대로 들고 있는데, 그 값이 payload로 들어가 `jsonb`에 저장되는 순간 정렬된다.
 * 실측: 같은 테마의 `meta`가 저장된 쪽에서 `{id,name,version,description}`, 지금 쪽에서
 * `{id,name,description,version}`이었다.
 *
 * # 그래서 무엇을 잃는가 — 정직하게
 *
 * **테마의 키 순서 변경을 복원이 보지 못한다.** §6.11의 `compileTheme`은 절의 **문서 키
 * 순서**를 우선순위로 쓰므로, 값이 같고 순서만 바뀐 테마는 실제로 **다르게 그려질 수 있다.**
 * 이 비교는 그것을 *"같다"*고 말한다.
 *
 * 그래도 이렇게 하는 이유: **payload는 그 순서를 애초에 담지 못한다.** `snapshots.payload`가
 * `jsonb`이므로(0009) 캡처가 무엇을 담든 저장되는 순간 정렬된다. 순서를 보는 비교는
 * *"항상 다르다"*만 내놓고, 늘 켜져 있는 신호는 정보가 아니다. 순서까지 되찾으려면 캡처가
 * 순서를 **값으로** 실어야 하고 그것은 규격 변경(= `payloadVersion` 2)이다.
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
