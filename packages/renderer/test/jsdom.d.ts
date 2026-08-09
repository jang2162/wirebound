/**
 * `jsdom`은 저장소 루트의 devDependency다. **`renderer`의 의존이 아니고 `src/`는 쓰지
 * 않는다** — `test/css-probe.ts`가 캐스케이드를 재는 프로브로만 동적 import한다.
 * `@types/jsdom`을 들이지 않으려고 쓰는 만큼만 선언한다
 * (`packages/themes/test/raw.d.ts`가 선례다).
 *
 * `themes` 쪽과 달리 `Document`·`Element`를 다시 선언하지 않는다 — 이 패키지의 tsconfig가
 * `lib: ["ES2022", "DOM"]`이라 전역 DOM 타입이 이미 있다.
 */
/**
 * `import.meta.glob`은 vite가 넣어 주는 것이다. `apps/web`은 `types: ["vite/client"]`로
 * 이 선언을 받지만 `renderer`는 그 설정이 없으므로 — 이 패키지는 vite를 의존하지 않는다 —
 * 여기서 최소로 선언한다(`packages/themes/test/raw.d.ts`가 선례다).
 * `test/contract-attrs.test.ts`가 `src/` 원문을 훑는 데 쓴다.
 */
interface ImportMeta {
  glob(
    pattern: string,
    options: { query: '?raw'; eager: true; import: 'default' },
  ): Record<string, string>
}

declare module 'jsdom' {
  export class JSDOM {
    constructor(html: string)
    readonly window: {
      document: Document
      innerWidth: number
      getComputedStyle(element: Element): CSSStyleDeclaration
    }
  }
}
