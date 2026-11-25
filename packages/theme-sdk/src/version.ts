/**
 * 호스트 SDK 판. 업로드 · 시딩 검증이 manifest 의 `sdk` 범위와 견준다(`@wirebound/themes` 의 `satisfiesSdk`).
 *
 * **따로 떼어 `./version` 으로 내는 까닭:** 그 견줌을 하는 api(Node)는 테마 코드를 싣지 않는다 — 본 진입(`.`)을 적재하면 기본 뷰와
 * 함께 react 가 서버 프로세스에 들어온다(spec `docs/superpowers/specs/2026-09-27-code-themes-design.md` 「내보내기와 PPTX」). 이 파일은
 * 아무것도 import 하지 않는다.
 */
export const SDK_VERSION = '1.10.0'
