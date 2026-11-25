import type { LayoutView, PageLayout, View } from '@wirebound/theme-sdk'
import { SubpageLayout } from './layout-subpage'

/**
 * 테마가 낸 뷰. 비어 있다 — 관리자 화면의 모양(표 · 격자 표 · 한 줄 조회 폼)은 전부 SDK 기본 뷰의 DOM 이고, 기본 뷰가 읽는 props
 * (`DataGrid` 의 `select` · `empty` · `loading`, `KeyValue` 의 `columns`)로 선다. 같은 DOM 을 여기 베끼면 SDK 가 기본 뷰를 고칠 때 이 테마만
 * 옛 DOM 으로 남는다.
 */
export const VIEWS: Readonly<Record<string, View>> = {}

/** 레이아웃 틀의 뷰 — 서브페이지만 낸다. 빈 · 팝업 레이아웃은 SDK 기본(내용만 — 팝업 상자는 뿌리 `Popup` 이 그린다)이다. */
export const LAYOUTS: Readonly<Partial<Record<PageLayout, LayoutView>>> = { subpage: SubpageLayout }
