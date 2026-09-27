/**
 * 컴포넌트 카탈로그를 레지스트리에 싣는다. **부르는 자리는 이 모듈 하나다.**
 *
 * 함수를 내보내지 않고 **import만으로 설치되게** 둔 이유: 부르는 것을 잊을 수 있는
 * 자리를 만들지 않기 위해서다. 레지스트리가 필요한 화면(`canvas/canvas.tsx`,
 * `panels/property-panel.tsx`)이 이 모듈을 import하므로, 그 화면이 그려지는 어떤
 * 경로에서도 설치가 먼저 끝나 있다. ESM 모듈은 한 번만 평가되므로 여러 곳에서 import해도
 * 설치는 한 번이다.
 *
 * **멱등하다** — 이미 등록된 것을 건너뛴다(`packages/schema/src/component/catalog/index.ts`의 `installCatalog`). 그래도
 * 부르는 자리를 하나로 모아 두는 것은, 각자 부르면 **무엇이 설치돼 있는지가 실행 순서에 따라 달라지기** 때문이다.
 * 특히 `registerComponent` 자체는 중복 등록에 던지므로, 직접 부르는 자리가 늘어나면 순서에 따라 던지는 경로가 생긴다.
 */
import { installCatalog } from '@wirebound/schema'

installCatalog()
