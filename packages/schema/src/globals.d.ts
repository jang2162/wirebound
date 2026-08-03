/**
 * `structuredClone`·`crypto.getRandomValues`는 Node ≥17와 최신 브라우저에 모두
 * 있는 전역이지만, TypeScript에는 이 둘을 함께 묶은 "범용" lib이 없다 —
 * `lib.dom.d.ts` 아니면 `@types/node`뿐이다. `@types/node`를 끌어오면
 * `Buffer`·`process`·`require` 같은 Node 전용 전역까지 schema의 타입 체크
 * 범위에 들어와 "schema는 브라우저·Node 양쪽에서 동작한다"는 제약이 깨진다.
 * 그래서 src가 실제로 쓰는 두 전역만 최소로 선언한다.
 */

declare function structuredClone<T>(value: T): T

declare var crypto: {
  getRandomValues<T extends ArrayBufferView>(array: T): T
}
