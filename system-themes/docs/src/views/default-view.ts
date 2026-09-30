import { DEFAULT_VIEWS, type View } from '@wirebound/theme-sdk'

/**
 * SDK 기본 뷰 하나. 이 테마의 뷰는 옛 구조 선택(주의 상자 · 줄 목록 · 아코디언 · 정의 목록)만 그리고, 기본 뷰의 모양을 고른 variant 는
 * 이것에 넘긴다 — 그 DOM 을 여기 베끼면 SDK 가 기본 뷰를 고칠 때 이 테마의 `plain` · `table` · `indent` 만 옛 DOM 으로 남는다.
 */
export function defaultView(type: string): View {
  const found = DEFAULT_VIEWS[type]
  if (found === undefined) throw new Error(`SDK 기본 뷰에 ${type} 가 없습니다`)
  return found
}
