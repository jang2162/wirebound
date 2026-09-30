import { defineTheme, DEFAULT_VIEWS } from '@wirebound/theme-sdk'
import { MANIFEST } from './manifest'
import css from './theme.css?raw'

export const PORTAL_THEME = defineTheme({ manifest: MANIFEST, views: DEFAULT_VIEWS })
export const PORTAL_THEME_CSS: string = css
