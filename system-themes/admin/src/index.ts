import { defineTheme, DEFAULT_VIEWS } from '@wirebound/theme-sdk'
import { MANIFEST } from './manifest'
import css from './theme.css?raw'

/** 첫 판은 SDK 기본 뷰에 옛 `admin` CSS 를 입힌 것이다 — 기본 뷰의 DOM 이 옛 기본 구조와 같아 외형이 그대로 선다. */
export const ADMIN_V0 = defineTheme({ manifest: MANIFEST, views: DEFAULT_VIEWS })
export const ADMIN_V0_CSS: string = css
