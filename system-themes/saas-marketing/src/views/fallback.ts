import { DEFAULT_VIEWS, type View } from '@wirebound/theme-sdk'

/**
 * SDK 기본 뷰 하나. 옛 구조와 다른 variant(`List:table` · `Tree:indent` · `KeyValue:table` · `Media:image`)는 기본 뷰의 DOM 이
 * 그대로 그 모양이라 이것에 넘긴다 — 사본을 두면 SDK 의 기본 DOM 이 바뀔 때 이 테마만 옛 DOM 으로 남는다.
 */
export function defaultView(type: string): View {
  const found = DEFAULT_VIEWS[type]
  if (found === undefined) throw new Error(`SDK 기본 뷰에 ${type} 이 없습니다`)
  return found
}
