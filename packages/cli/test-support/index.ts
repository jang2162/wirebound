/**
 * **케이스가 쓰는 도구.** 패키지의 `exports`에 `./test-support`로 나가고, `dist`에는 들어가지
 * 않는다(`files`가 `dist`뿐이다). 선례와 근거는 `packages/exporter/test-support/index.ts`다.
 *
 * **`src`가 아니라 여기 있는 이유**는 이것이 제품 표면이 아니기 때문이고, `test/`에 두고
 * 끝내지 않는 이유는 **`packages/mcp`가 import해야** 하기 때문이다.
 *
 * **가짜 `io`와 스냅샷 픽스처를 두 벌로 만들지 않는다.** 명령마다·패키지마다 지역 가짜를
 * 두면 *"어느 하네스에서 잰 값인가"*가 매번 물음이 되고(`apps/api`가 하네스 다섯 벌로 겪은
 * 일이다), 무엇보다 가짜가 계약을 안 흉내 내면 자가 눈을 감는다 — `fake-io.ts`가 그 사고
 * 둘(셋째 인자를 버린 것 · 본문을 여러 번 내준 것)을 머리말에 적어 두었다.
 */
export { createFakeIo, stub, type FakeIo, type FakeIoOptions, type RecordedRequest, type Route, type StubResponse } from '../test/fake-io'
export {
  page,
  snapshotPayload,
  LAYOUT,
  MENU_ADMIN,
  MENU_MARKETING,
  MENU_MEMBER,
  PAGE_DETAIL,
  PAGE_LANDING,
  PAGE_LIST,
  경고가_있는_프로젝트,
  오류가_있는_프로젝트,
} from '../test/snapshot-fixture'
