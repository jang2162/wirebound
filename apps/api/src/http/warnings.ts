/**
 * 저장을 막지 않은 이슈를 응답에 얹는 **하나뿐인 자리**.
 *
 * **한 자리에 두는 이유는 응답이 여럿이기 때문이다** — `routes/pages.ts`의 세 응답이 같은 규칙을 따라야
 * 한다. 각자 짜면 *"비어 있으면 키 자체를 만들지 않는다"*가 한쪽에서만 지켜지는 순간 갈린다.
 * `partitionIssues`가 severity의 선을 한 곳에서 긋는 것과 같은 이유다.
 *
 * **비어 있으면 키 자체를 만들지 않는다.** 이유는 `clientOpId`를 조건부로 싣는 것과 같다 —
 * 없던 키가 늘 붙으면 응답 형태가 통째로 바뀐 것이 되고, README가 못박은
 * *"페이지 여덟 키"*(세 응답이 같은 키 집합)가 경고 없는 평범한 저장에서도 깨진다.
 * 경고가 실제로 있을 때만 키가 하나 붙는다.
 *
 * **삼키지 않는다.** 경고를 응답에 안 실으면 severity를 만든 이유가 사라진다 —
 * 저장은 됐는데 *"적은 값이 버려졌다"*를 아무도 모른다.
 *
 * **이슈 타입을 고정하지 않는다.** 봉투의 모양(`{ path, message, code, severity }`)만 보므로 여기서 좁힐 이유가 없다.
 */
export function withWarnings<T extends object, I>(body: T, warnings: readonly I[]): T | (T & { warnings: I[] }) {
  if (warnings.length === 0) return body
  return { ...body, warnings: [...warnings] }
}
