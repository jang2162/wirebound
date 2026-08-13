/**
 * `packages/schema/src/globals.d.ts`와 **같은 이유로 같은 것을 선언한다.**
 * `structuredClone`은 Node ≥17와 최신 브라우저에 모두 있는 전역이지만 TypeScript에는
 * 그것을 담은 "범용" lib이 없다 — `lib.dom.d.ts` 아니면 `@types/node`뿐이다.
 * 어느 쪽을 끌어와도 이 패키지의 tsconfig가 `"lib": ["ES2022"]`·`"types": []`로 좁혀 둔
 * 것이 풀린다.
 *
 * **schema의 선언을 물려받지 못한다.** 프로젝트 참조는 그 패키지가 **내보낸 타입**을
 * 주지 그 패키지의 전역 선언 파일을 이쪽 컴파일 범위에 넣지 않는다 — 실측: 이 파일이
 * 없으면 `pattern/expand.ts`가 `TS2304: Cannot find name 'structuredClone'`이다.
 *
 * `crypto`는 여기 선언하지 않는다 — 이 패키지가 직접 부르지 않는다(`createNodeId`가
 * schema 안에서 그것을 쓰고, 그 파일은 schema의 컴파일 범위에 있다).
 */

declare function structuredClone<T>(value: T): T
