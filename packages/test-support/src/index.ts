/**
 * **여러 패키지의 케이스가 함께 쓰는 도구.** 제품 표면이 아니고 `dist` 도 없다 — 워크스페이스의 테스트만
 * `devDependencies` 로 가져온다. 제품 패키지는 이것에 기대지 않으므로 의존 방향(`schema` ← `renderer` ← 나머지)에
 * 들지 않는다.
 *
 * **왜 패키지인가.** 패키지마다 `rootDir` 가 자기 디렉터리라 저장소 루트의 파일을 상대 경로로 가져오면
 * `pnpm typecheck` 가 막는다. 패키지 이름으로 해석되는 파일은 그 제약을 받지 않는다 — `@wirebound/exporter/test-support`
 * 와 같은 길이다.
 */
export { stripComments } from './strip-comments'
