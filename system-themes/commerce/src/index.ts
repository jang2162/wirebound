import { defineTheme } from '@wirebound/theme-sdk'
import { MANIFEST } from './manifest'
import css from './theme.css?raw'
import { COMMERCE_VIEWS } from './views/index'

export const COMMERCE_THEME = defineTheme({ manifest: MANIFEST, views: COMMERCE_VIEWS })
export const COMMERCE_THEME_CSS: string = css
