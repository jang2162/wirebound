/**
 * 노드가 나르는 **임의 JSON 값**을 복사하는 자리. `props`와 상호작용 액션의 `value`가
 * 그것이다 — 둘 다 봉투가 내용을 정하지 않는다(`props`는 `z.record(z.string(), z.unknown())`,
 * `setProp.value`는 `z.unknown()`).
 *
 * **왜 한 곳인가.** 이 값을 복사해야 하는 자리가 둘이고(`tree.ts`의 `remapNodeIds`,
 * `preset/builtin.ts`의 `stripMarkers`) 둘이 각자 복사하면 **한쪽만 깊어진다** — `props`만
 * 복사하고 `value`를 참조로 두는 식으로 조용히 갈린다.
 *
 * **`structuredClone`을 쓰지 않는다.** 그것은 함수·심볼을 담은 값에서 `DOMException`을
 * 던지고(`structuredClone({ f: () => 1 })` → `() => 1 could not be cloned.`), 이 함수를 부르는 자리가
 * 전부 **저장 경계 앞**이라 거기서 던지면 사용자는 무엇이 잘못됐는지 듣지 못한다.
 * JSON 왕복은 함수를 조용히 버리고, 버려진 자리는 저장 경계의 카탈로그 검증이 말한다.
 *
 * **원시값은 그대로 돌려준다** — 공유가 뜻을 갖지 않고, `undefined`를 `JSON.stringify`에
 * 넣으면 `undefined`가 나와 `JSON.parse(undefined)`가 던지기 때문이다.
 */
export function cloneJsonValue<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value
  return JSON.parse(JSON.stringify(value)) as T
}
