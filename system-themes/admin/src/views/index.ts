import type { View } from '@wirebound/theme-sdk'
import { KeyValueView } from './KeyValue'
import { ListView } from './List'

/** 테마가 낸 뷰. 여기 없는 컴포넌트는 렌더러가 SDK 기본 뷰로 그린다 — 까닭은 뷰마다 머리말. */
export const VIEWS: Readonly<Record<string, View>> = { List: ListView, KeyValue: KeyValueView }
