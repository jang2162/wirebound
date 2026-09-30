import { defineTheme, DEFAULT_VIEWS } from '@wirebound/theme-sdk'
import { MANIFEST } from './manifest'
import css from './theme.css?raw'

export const COMMERCE_THEME = defineTheme({ manifest: MANIFEST, views: DEFAULT_VIEWS })
export const COMMERCE_THEME_CSS: string = css
