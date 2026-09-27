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
