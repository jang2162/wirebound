/**
 * 플레인 객체를 표처럼 쓰는 자리에서 **직접 가진 값만** 읽는다.
 *
 * 이 패키지가 표처럼 색인하는 키는 사람이 쓴 테마 JSON에서 온다. 그 키로 객체를 그냥 색인하면
 * 프로토타입 사슬을 타므로, 선언되지 않은 이름이 **선언된 것처럼 보인다** —
 * `({})['toString']`은 `undefined`가 아니라 함수다. 두 가지로 나타났고 둘 다 심어서 봤다:
 *
 * - `styleDeclarations('toString', …)`이 `TypeError: targets.map is not a function`으로 **던졌다.**
 *   `ComponentsSchema.safeParse`를 통과한 입력이었다 — **규격을 통과한 값이 검증기를 죽였다.**
 * - `resolveTokens({ semantic: { a: 'semantic.toString' } })`이 **이슈 없이** 표에
 *   `semantic.a → function toString() { [native code] }`를 실었다. 던지지 않아 더 나쁘다.
 *
 * `Map`이나 `Object.create(null)`이 아니라 `Object.hasOwn` 가드를 고른 이유는 **저장소에 같은
 * 판정의 선례가 있고 그 근거가 이미 적혀 있기 때문**이다 — `packages/schema/src/patch/pointer.ts`
 * (*"프로토타입 체인은 타지 않는다"*)·`apply.ts`·`inverse.ts`가 같은 형태이고,
 * `apps/web/src/api/http-client.ts`가 *"`in`은 프로토타입까지 본다"*를 근거로 적었다.
 * 표를 `Map`으로 바꾸면 §6.8 대조 테스트(`Object.keys(STYLE_PROPERTIES)`)와 규격 선언의
 * 읽는 맛이 함께 바뀌는데, 그 비용을 낼 근거가 없다.
 */
export function own<T>(record: Readonly<Record<string, T>>, key: string): T | undefined {
  return Object.hasOwn(record, key) ? record[key] : undefined
}
