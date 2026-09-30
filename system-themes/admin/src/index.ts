import { defineTheme } from '@wirebound/theme-sdk'
import { MANIFEST } from './manifest'
import css from './theme.css?raw'
import { VIEWS } from './views/index'

/**
 * system-admin 의 정의 · CSS. **두 이름(`ADMIN_V0` · `ADMIN_V0_CSS`)은 판과 무관하게 이대로 둔다** — playground 가 이 이름으로 가져온다. 가리키는
 * 것은 늘 지금 판이다.
 */
export const ADMIN_V0 = defineTheme({ manifest: MANIFEST, views: VIEWS })
export const ADMIN_V0_CSS: string = css
