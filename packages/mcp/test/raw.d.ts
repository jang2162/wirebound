/**
 * `?raw`는 vite가 파일 내용을 문자열로 넣어 준다(`packages/schema/test/raw.d.ts`가 선례다).
 * §12.2의 도구 표를 **설계 문서를 읽어** 대조하는 케이스가 쓴다 — 손으로 옮긴 인용은
 * 설계가 바뀌어도 조용하다.
 */
declare module '*.md?raw' {
  const content: string
  export default content
}

/** `?raw`로 읽는 JSON. `package.json`을 케이스가 직접 본다. */
declare module '*.json?raw' {
  const content: string
  export default content
}
