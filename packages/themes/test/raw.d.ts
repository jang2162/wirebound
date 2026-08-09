/**
 * `?raw`는 vite가 파일 내용을 문자열로 넣어 준다(`apps/web/test/shell-css.test.ts`가 선례다).
 * `apps/web`은 `types: ["vite/client"]`로 이 선언을 받지만 `themes`는 `types: []`이라
 * — DOM도 Node도 들이지 않는 것이 이 패키지의 제약이다 — 여기서 최소로 선언한다.
 */
declare module '*.md?raw' {
  const content: string
  export default content
}

/** `?raw`로 읽는 JSON. `tsconfig`·`package.json`을 테스트가 직접 본다. */
declare module '*.json?raw' {
  const content: string
  export default content
}

/**
 * `import.meta.glob`은 vite가 넣어 주는 것이다. `apps/web`은 `types: ["vite/client"]`로
 * 이 선언을 받지만 `themes`는 `types: []`이라 — DOM도 Node도 들이지 않는 것이 이 패키지의
 * 제약이다 — 여기서 최소로 선언한다.
 */
interface ImportMeta {
  glob(
    pattern: string,
    options: { query: '?raw'; eager: true; import: 'default' },
  ): Record<string, string>
}

/**
 * `jsdom`은 저장소 루트의 devDependency다. **`themes`의 의존이 아니고 `src/`는 쓰지 않는다** —
 * `test/emit-parse.test.ts`가 방출된 CSS를 실제로 파싱해 보는 프로브로만 동적 import한다.
 * `@types/jsdom`을 들이지 않으려고 쓰는 만큼만 선언한다.
 */
declare module 'jsdom' {
  export class JSDOM {
    constructor(html: string)
    readonly window: { document: Document }
  }
  interface Document {
    querySelector(selectors: string): Element | null
  }
  interface Element {
    readonly textContent: string | null
  }
}
