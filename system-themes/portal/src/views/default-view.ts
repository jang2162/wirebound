import { DEFAULT_VIEWS, type View } from '@wirebound/theme-sdk'

/**
 * 곁의 variant(`admin` 의 구조)를 그릴 SDK 기본 뷰. 표의 타입이 `View | undefined` 라 여기서 한 번 확인한다 — 없으면 모듈을 싣는
 * 순간 던져 `wb-theme check` 가 칸마다 잡는다(조용히 아무것도 안 그리지 않게).
 */
export function defaultView(type: string): View {
  const found = DEFAULT_VIEWS[type]
  if (found === undefined) throw new Error(`SDK 기본 뷰에 ${type} 이 없습니다`)
  return found
}
