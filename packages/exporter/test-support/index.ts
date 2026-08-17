/**
 * **케이스가 쓰는 도구.** 패키지의 `exports`에 `./test-support`로 나가고, `dist`에는 들어가지
 * 않는다(`files`가 `dist`뿐이다).
 *
 * **`src`가 아니라 여기 있는 이유**는 이것이 제품 표면이 아니기 때문이고, `test/`가 아닌
 * 이유는 **`apps/web`이 import해야** 하기 때문이다 — 캔버스↔번들 견주기가 거기 산다
 * (`apps/web`만 `renderer`·`themes`·`exporter`와 캔버스를 동시에 볼 수 있다. `themes`의
 * 어휘를 `renderer`와 대조하는 케이스가 이미 같은 이유로 `apps/web`에 있다).
 */
export { describeTree, normalizeStyle } from './dom-compare'
// P10-1 — `unit` 프로젝트에 DOM이 없어서 케이스가 XML을 읽을 자가 없었다. 근거는 그 파일의 머리말이다.
export { findAll, parseXml, textOf, type XmlElement } from './xml'
export type { CoverageThemeDocument } from './fixtures'
export {
  brokenFixture,
  broadFixture,
  coverageThemes,
  declaredStructures,
  declaredVariants,
  renderedPairs,
  slotFixture,
  typesIn,
  variantFixture,
} from './fixtures'
