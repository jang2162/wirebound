import { defineTheme } from '@wirebound/theme-sdk'
import { MANIFEST } from './manifest'
import css from './theme.css?raw'
import { DOCS_VIEWS } from './views/index'

export const DOCS_THEME = defineTheme({ manifest: MANIFEST, views: DOCS_VIEWS })
export const DOCS_THEME_CSS: string = css
