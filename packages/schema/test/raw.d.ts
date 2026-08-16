/**
 * `?raw`는 vite가 파일 내용을 문자열로 넣어 준다(`packages/themes/test/raw.d.ts`가 선례다).
 * 카탈로그가 설계 문서의 예시와 어긋나는 자리를 **문서를 읽어** 대조하는 케이스가 쓴다 —
 * 손으로 옮긴 인용은 설계가 바뀌어도 조용하다.
 */
declare module '*.md?raw' {
  const content: string
  export default content
}

/** `?raw`로 읽는 JSON. `package.json`을 테스트가 직접 본다(`test/boundary.test.ts`). */
declare module '*.json?raw' {
  const content: string
  export default content
}

/**
 * `import.meta.glob`은 vite가 넣어 주는 것이다. `apps/web`은 `types: ["vite/client"]`로
 * 이 선언을 받지만 `schema`의 테스트는 `types: ["node"]`뿐이라 여기서 최소로 선언한다
 * (`packages/themes/test/raw.d.ts`가 선례다).
 */
interface ImportMeta {
  glob(
    pattern: string,
    options: { query: '?raw'; eager: true; import: 'default' },
  ): Record<string, string>
}
