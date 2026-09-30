import { defineTheme } from '@wirebound/theme-sdk'
import { MANIFEST } from './manifest'
import css from './theme.css?raw'
import { VIEWS } from './views/index'

export const PORTAL_THEME = defineTheme({ manifest: MANIFEST, views: VIEWS })
export const PORTAL_THEME_CSS: string = css
