import { DEFAULT_VIEWS, defineTheme } from '@wirebound/theme-sdk'
import manifest from '../theme.config'
import './theme.css'

/**
 * `.wbtheme` 의 진입(`wb-theme build --entry src/theme.tsx`). 뷰는 SDK 기본 뷰다 — `theme.js` 에서 `DEFAULT_VIEWS` 는 호스트의
 * SDK 한 벌을 가리킨다(공유 런타임). `src/index.ts` 의 `ADMIN_V0` 와 같은 정의를 `.wbtheme` 로 낸다.
 */
export default defineTheme({ manifest, views: DEFAULT_VIEWS })
