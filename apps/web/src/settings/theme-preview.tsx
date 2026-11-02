/**
 * 테마의 **미리보기**(spec `2026-09-27-code-themes-design.md` 「토큰 편집」) — 프로젝트 설정 › 테마의 토큰 칸 밑 · 관리자 › 테마가 같은 부품을
 * 쓴다. 캔버스와 같은 틀이다 — same-origin iframe(`canvas/canvas-iframe.tsx`)에 시트 셋을 캔버스와 같은 차례로 싣고(`canvas/canvas.tsx` 의
 * `canvasSheets`) 그 판의 번들 정의로 그린다.
 *
 * **보기 둘** — «컴포넌트»(`ThemeGallery` — 카탈로그 그룹별 격자) · «예제 페이지»(`ThemeExamples` — 이어진 주문 관리 화면). 머리의 라디오가
 * 보기를, 예제의 장 이름 줄이 장을 고른다. 고른 보기 · 장은 이 부품의 상태다 — 토큰을 고쳐도 처음으로 안 돌아가고, 저장하지 않는다. 예제 안의
 * 이동 · 팝업은 이 상태만 바꾼다(바깥 주소 · 기록은 그대로 — `ThemeExamples` 머리말). 팝업은 상자의 보이는 구간에 선다(캔버스의
 * `usePopupArea` — iframe 이 내용 높이만큼 자라 창 전체에 세우면 보이는 곳 밖에 뜬다).
 *
 * **iframe 폭은 상자 폭을 따른다** — 상자의 안쪽 폭(`clientWidth` − 좌우 여백)을 `ResizeObserver` 로 잰다. 재지 못하는 판(jsdom)은
 * `FALLBACK_WIDTH` 다.
 *
 * **초안을 고치면 토큰 시트와 `useToken` 값만 바뀐다** — 번들은 판마다 한 번 싣고(로더의 캐시), 요청이 나가지 않는다. 번들이 실패하면
 * 기본 뷰로 그리고 그렇다고 말한다(캔버스와 같은 판단).
 */
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { EXAMPLE_PAGES, ThemeExamples, ThemeGallery, type ExamplePageId } from '@wirebound/theme-gallery'
import type { ThemeDefinition, ThemeManifest } from '@wirebound/theme-sdk'
import { tokenValues } from '@wirebound/themes'
import type { ThemeRef } from '../api/types'
import { canvasSheets } from '../canvas/canvas'
import { CanvasIframe, type CanvasFrame } from '../canvas/canvas-iframe'
import { scrollParent, usePopupArea } from '../canvas/canvas-popups'
import { useThemeBundleLoader } from '../theme/bundle-context'
import { refKey, withServerManifest } from '../theme/bundle-loader'
// 갤러리는 카탈로그를 순회한다 — 레지스트리가 비면 칸이 하나도 안 선다.
import '../catalog-setup'

/** 상자 폭을 못 잰 판의 문서 폭. */
const FALLBACK_WIDTH = 640

type PreviewView = 'components' | 'examples'

const VIEWS: readonly { id: PreviewView; label: string }[] = [
  { id: 'components', label: '컴포넌트' },
  { id: 'examples', label: '예제 페이지' },
]

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
    void loader.load(props.themeRef).then((loaded) => {
      if (!alive) return
      const result = withServerManifest(loaded, props.manifest)
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

  const [view, setView] = useState<PreviewView>('components')
  const [page, setPage] = useState<ExamplePageId>(EXAMPLE_PAGES[0]!.id)
  const [frame, setFrame] = useState<CanvasFrame | null>(null)
  const popupArea = usePopupArea(frame, 1, view === 'examples')
  const box = useRef<HTMLDivElement>(null)
  const width = useBoxWidth(box)
  const viewsName = useId()
  const frameBox = useRef<HTMLDivElement>(null)
  useTopOnPageChange(page, box, frameBox)

  return (
    // 틀이 높이를 창에 묶고 안쪽 상자가 스크롤한다(`shell.css` 의 `.wb-shell-settings-preview-frame`).
    <div ref={frameBox} className="wb-shell-settings-preview-frame">
      <div className="wb-shell-settings-preview-head">
        <div className="wb-shell-settings-preview-views" role="radiogroup" aria-label="미리보기 보기">
          {VIEWS.map((one) => (
            <label
              key={one.id}
              className={
                view === one.id ? 'wb-shell-settings-preview-view wb-shell-settings-preview-view-on' : 'wb-shell-settings-preview-view'
              }
            >
              <input
                className="wb-shell-settings-preview-radio"
                type="radio"
                name={viewsName}
                value={one.id}
                checked={view === one.id}
                onChange={() => setView(one.id)}
              />
              {one.label}
            </label>
          ))}
        </div>
        {view === 'examples' && (
          <nav className="wb-shell-settings-preview-pages" aria-label="예제 페이지">
            {EXAMPLE_PAGES.map((one) => (
              <button
                key={one.id}
                className="wb-shell-settings-preview-page"
                type="button"
                aria-current={one.id === page ? 'page' : undefined}
                onClick={() => setPage(one.id)}
              >
                {one.title}
              </button>
            ))}
          </nav>
        )}
      </div>
      <div ref={box} className="wb-shell-settings-preview" role="region" aria-label="미리보기">
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
          <CanvasIframe styles={sheets} width={width} onFrame={setFrame}>
            {(inner) =>
              view === 'components' ? (
                <ThemeGallery theme={bundle.definition} tokens={values} window={inner.window} />
              ) : (
                <ThemeExamples
                  theme={bundle.definition}
                  tokens={values}
                  window={inner.window}
                  page={page}
                  onPageChange={setPage}
                  {...(popupArea === undefined ? {} : { popupArea })}
                />
              )
            }
          </CanvasIframe>
        )}
      </div>
    </div>
  )
}

/**
 * **장이 바뀌면 새 장의 맨 위부터 보인다** — 같은 상자에 다른 장을 실으므로 굴린 자리(`scrollTop`)가 남아, 긴 장을 굴린 채 옮기면 새 장이 중간 ·
 * 끝부터 보였다. 상자를 맨 위로 굴리고, 틀의 위 끝이 그 바깥 스크롤 칸(없으면 창) 위로 나가 있으면 틀을 그 칸 안으로 내린다 — 장 이름 줄과 새
 * 장의 머리가 함께 보이게. 장 이름 줄 · 예제 안 이음이 같은 상태(`page`)를 바꾸므로 그 상태를 본다. `scrollIntoView` 를 쓰지 않는 까닭: 틀이
 * `overflow: hidden` 이라 그것도 굴려 머리를 밀어낸다.
 */
function useTopOnPageChange(page: ExamplePageId, box: { current: HTMLElement | null }, frame: { current: HTMLElement | null }): void {
  const last = useRef(page)
  useLayoutEffect(() => {
    if (last.current === page) return
    last.current = page
    const element = box.current
    if (element !== null) element.scrollTop = 0
    const outer = frame.current
    if (outer === null) return
    const scroller = scrollParent(outer)
    const floor = Math.max(scroller?.getBoundingClientRect().top ?? 0, 0)
    const above = outer.getBoundingClientRect().top - floor
    if (above >= 0) return
    if (scroller !== null) scroller.scrollTop += above
    else outer.ownerDocument.defaultView?.scrollBy(0, above)
  }, [page, box, frame])
}

/** 상자의 안쪽 폭(`clientWidth` − 좌우 여백 — 세로 스크롤 막대를 뺀 폭). 못 재면(0 — jsdom) `FALLBACK_WIDTH`. */
function useBoxWidth(box: { current: HTMLElement | null }): number {
  const [width, setWidth] = useState(FALLBACK_WIDTH)
  useLayoutEffect(() => {
    const element = box.current
    if (element === null) return
    const view = element.ownerDocument.defaultView
    const measure = (): void => {
      const style = view?.getComputedStyle(element)
      const padding = (Number.parseFloat(style?.paddingLeft ?? '') || 0) + (Number.parseFloat(style?.paddingRight ?? '') || 0)
      const inner = Math.floor(element.clientWidth - padding)
      if (inner > 0) setWidth(inner)
    }
    measure()
    const Observer = (view as (Window & typeof globalThis) | null)?.ResizeObserver
    if (Observer === undefined) return
    const observer = new Observer(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [box])
  return width
}
