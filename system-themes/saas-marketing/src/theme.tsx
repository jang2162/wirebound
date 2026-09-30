import { defineTheme } from '@wirebound/theme-sdk'
import manifest from '../theme.config'
import './theme.css'
import { VIEWS } from './views/index'

/** `.wbtheme` 의 진입(`wb-theme build --entry src/theme.tsx`). `src/index.ts` 의 `SAAS_MARKETING_THEME` 와 같은 정의를 `.wbtheme` 로 낸다. */
export default defineTheme({ manifest, views: VIEWS })
