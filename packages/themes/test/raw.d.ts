/**
 * `?raw`는 vite가 파일 내용을 문자열로 넣어 준다(`apps/web/test/shell-css.test.ts`가 선례다).
 * `apps/web`은 `types: ["vite/client"]`로 이 선언을 받지만 `themes`는 `types: []`이라
 * — DOM도 Node도 들이지 않는 것이 이 패키지의 제약이다 — 여기서 최소로 선언한다.
 */
declare module '*.md?raw' {
  const content: string
  export default content
}
