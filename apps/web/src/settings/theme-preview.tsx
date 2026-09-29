/**
 * 토큰 편집기 옆의 **갤러리 미리보기**(spec `2026-09-27-code-themes-design.md` 「토큰 편집」 — «모든 컴포넌트 · variant 를 SDK 가 주는
 * 샘플 노드로 늘어놓은 화면»). 캔버스와 같은 틀이다 — same-origin iframe(`canvas/canvas-iframe.tsx`)에 시트 셋을 캔버스와 같은 차례로
 * 싣고(`canvas/canvas.tsx` 의 `canvasSheets`) 그 판의 번들 정의로 `ThemeGallery` 를 그린다.
 *
 * **초안을 고치면 토큰 시트와 `useToken` 값만 바뀐다** — 번들은 판마다 한 번 싣고(로더의 캐시), 요청이 나가지 않는다. 번들이 실패하면
 * 기본 뷰로 그리고 그렇다고 말한다(캔버스와 같은 판단).
 */
import { useEffect, useMemo, useState, type ReactElement } from 'react'
import { ThemeGallery } from '@wirebound/theme-gallery'
import type { ThemeDefinition, ThemeManifest } from '@wirebound/theme-sdk'
import { tokenValues } from '@wirebound/themes'
import type { ThemeRef } from '../api/types'
import { canvasSheets } from '../canvas/canvas'
import { CanvasIframe } from '../canvas/canvas-iframe'
import { useThemeBundleLoader } from '../theme/bundle-context'
import { refKey } from '../theme/bundle-loader'
// 갤러리는 카탈로그를 순회한다 — 레지스트리가 비면 칸이 하나도 안 선다.
import '../catalog-setup'

/** 미리보기 문서의 폭. 갤러리 칸은 세로로 쌓이므로 목록 폭 정도면 된다 — 좁은 창에서는 상자가 스크롤한다. */
const PREVIEW_WIDTH = 640

type Bundle = { key: string; definition: ThemeDefinition; bundled: boolean; failure: string | null }

export function ThemePreview(props: {
  themeRef: ThemeRef
  manifest: ThemeManifest
  /** 기본값과 다른 초안 값. 검사에 걸리는 값은 그 키만 기본값으로 선다(`tokensCss` · `tokenValues`). */
  tokens: Readonly<Record<string, string | number>>
}): ReactElement {
  const loader = useThemeBundleLoader()
  const key = refKey(props.themeRef)
  const [bundle, setBundle] = useState<Bundle | null>(null)

  useEffect(() => {
    let alive = true
    void loader.load(props.themeRef).then((result) => {
      if (!alive) return
      setBundle(
        result.status === 'ok'
          ? { key, definition: result.definition, bundled: true, failure: null }
          : { key, definition: { manifest: props.manifest, views: {} }, bundled: false, failure: result.reason },
      )
    })
    return () => {
      alive = false
    }
    // 판이 바뀔 때만 다시 싣는다 — manifest 는 판과 함께 바뀐다.
  }, [loader, key])

  const sheets = useMemo(
    () => canvasSheets({ ref: props.themeRef, manifest: props.manifest, tokens: props.tokens, bundled: bundle?.bundled === true }),
    [props.themeRef, props.manifest, props.tokens, bundle?.bundled],
  )
  const values = useMemo(() => tokenValues(props.manifest, props.tokens), [props.manifest, props.tokens])
  const ready = bundle !== null && bundle.key === key

  return (
    <div className="wb-shell-settings-preview" role="region" aria-label="미리보기">
      {!ready && (
        <p className="wb-shell-project-notice" role="status">
          미리보기를 불러오는 중…
        </p>
      )}
      {ready && bundle.failure !== null && (
        <p className="wb-shell-project-notice" role="status">
          {`테마를 불러오지 못해 기본 모양으로 보입니다 — ${bundle.failure}`}
        </p>
      )}
      {ready && (
        <CanvasIframe styles={sheets} width={PREVIEW_WIDTH}>
          {(frame) => <ThemeGallery theme={bundle.definition} tokens={values} window={frame.window} />}
        </CanvasIframe>
      )}
    </div>
  )
}
