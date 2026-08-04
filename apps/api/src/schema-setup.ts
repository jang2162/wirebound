/**
 * 컴포넌트 카탈로그를 레지스트리에 설치한다.
 *
 * `@wirebound/schema`의 `validatePage`(`routes/pages.ts`의 `PUT .../schema` 게이트가
 * 부른다)는 컴포넌트 레지스트리가 채워져 있어야 타입·props·variant를 검사할 수
 * 있다 — 레지스트리가 비어 있으면 모든 노드가 `unknown-type`으로 걸린다.
 *
 * `buildApp`(`app.ts`)이 매 호출마다 이 함수를 부른다. 이 스위트는 한 프로세스
 * 안에서 `buildApp`을 수백 번 호출하므로(테스트마다 한 번), **`listComponents().length
 * === 0`일 때만** `installCatalog()`를 부른다 — 레지스트리가 이미 채워져 있으면
 * (정상적인 반복 호출이든, 어떤 테스트가 `resetRegistry()` 뒤 자신만의 컴포넌트를
 * 등록해 둔 경우든) 아무 것도 하지 않는다. 후자가 이 가드가 진짜로 하는 일이다 —
 * `installCatalog()` 자체도 이미 멱등하지만(이미 등록된 타입은 건너뛴다), 그것과
 * 별개로 이 함수는 "레지스트리를 이미 다른 누군가 채워 뒀다면 카탈로그를 얹지
 * 않는다"는 성질을 추가로 보장한다.
 */
import { installCatalog, listComponents } from '@wirebound/schema'

export function ensureCatalog(): void {
  if (listComponents().length === 0) {
    installCatalog()
  }
}
