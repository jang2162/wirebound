import type { ReactElement } from 'react'
import type { ThemeDefinition, ThemeManifest, View, ViewProps } from './types'

/** 호스트 SDK 판. 업로드 검증(A3)이 manifest 의 `sdk` 범위와 견준다. */
export const SDK_VERSION = '1.0.0'

/** 정의를 그대로 돌려준다. 등록은 호스트가 한다 — 여기서 전역에 쓰면 테스트와 갤러리가 서로를 오염시킨다. */
export function defineTheme(def: ThemeDefinition): ThemeDefinition {
  return def
}

/**
 * 작성자 프로젝트의 `theme.config.ts` 가 manifest 를 내는 자리. 값은 그대로 돌려준다 — 타입만 준다. 검증은
 * `wb-theme build` 가 `@wirebound/themes` 의 `validateManifest` 로 한다(업로드와 같은 함수).
 */
export function defineManifest(manifest: ThemeManifest): ThemeManifest {
  return manifest
}

export function view<P extends Record<string, unknown> = Record<string, unknown>>(
  render: (props: ViewProps<P>) => ReactElement,
): View {
  const component = (props: ViewProps) => render(props as ViewProps<P>)
  return component
}
