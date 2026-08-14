/**
 * `?raw`와 `import.meta.glob`은 vite가 넣어 주는 것이다. `apps/web`은
 * `types: ["vite/client"]`로 그 선언을 받지만 이 패키지는 그 타입을 들이지 않으므로
 * 여기서 최소로 선언한다 — `packages/themes/test/raw.d.ts`가 선례다.
 *
 * `test/public-api.test.ts`가 `tsconfig`·`package.json`을 문자열로 읽어 경계를 지킨다.
 */
declare module '*.json?raw' {
  const content: string
  export default content
}

interface ImportMeta {
  glob(
    pattern: string,
    options: { query: '?raw'; eager: true; import: 'default' },
  ): Record<string, string>
}
