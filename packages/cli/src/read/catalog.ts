/**
 * **카탈로그를 설치하는 자리 하나.**
 *
 * `installCatalog()`는 프로세스 전역을 만지므로 순수 변환 함수(`pageView`·`snapshotToLintInput`)가
 * 스스로 부르지 않는다 — **부르는 것은 소비자다**(P9-3 이월 §1의 넷 중 첫째). 그 소비자가
 * 명령마다 흩어지면 **하나를 빠뜨린 명령이 조용히 거짓을 낸다.**
 *
 * ---
 *
 * # 안 부르면 무엇이 되는가 — **쟀다**
 *
 * 같은 스냅샷 픽스처로 설치 전후를 재서 얻은 값이다.
 *
 * | 어디 | 설치 전 | 설치 후 |
 * |---|---|---|
 * | `lintProject` | **`document-invalid:error` 5건** (*"알 수 없는 컴포넌트 타입: Page·Button·List"*) | **0건** |
 * | `pageView().interactions[].text` | *"② 목록이 **loading**로 바뀝니다"* | *"② 목록이 **로딩 상태**로 바뀝니다"* |
 * | `pageView().nodes[].name` · `comments[].nodeName` | 같다 | 같다 |
 *
 * **lint 쪽은 종료 코드까지 뒤집는다**(전부 `error`다). **`pageView` 쪽은 던지지도 않고
 * 개수도 그대로라 조용히 나빠진다** — 그래서 이 자리를 눈에 보이게 둔다.
 */
import { installCatalog } from '@wirebound/schema'

/**
 * 읽기 조립이 시작되기 전에 부른다. **여러 번 불러도 된다** — `installCatalog`가
 * *"이미 있으면 안 덮는다"*로 구현돼 있다.
 */
export function prepareCatalog(): void {
  installCatalog()
}
