/**
 * `?raw`는 vite가 파일 내용을 문자열로 넣어 준다(`packages/themes/test/raw.d.ts`가 선례다).
 * 카탈로그가 설계 문서의 예시와 어긋나는 자리를 **문서를 읽어** 대조하는 케이스가 쓴다 —
 * 손으로 옮긴 인용은 설계가 바뀌어도 조용하다.
 */
declare module '*.md?raw' {
  const content: string
  export default content
}
