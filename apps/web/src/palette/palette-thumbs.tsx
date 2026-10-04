/**
 * **축소판** — 하단 컴포넌트 판의 카드마다 그 컴포넌트를 프로젝트 테마로 그린 그림(spec `docs/superpowers/specs/2026-10-01-component-drag-design.md`
 * 「축소판」). **판 하나에 iframe 하나다** — 카드마다 iframe 을 두지 않는다.
 *
 * ## 같은 좌표 — iframe 을 카드 줄 뒤에 깔고 표본을 카드 창 자리로 옮긴다
 *
 * iframe(`canvas/canvas-iframe.tsx` — 캔버스와 같은 시트 차례 · 같은 테마 공급자 `useProjectTheme`)을 카드 판(트랙 — 카드가 여러 줄로
 * 감싼다) 뒤에 트랙과 같은 크기로 깐다. 트랙과 함께 스크롤하므로 스크롤 중에도 어긋날 것이 없다. 그 문서에 카드마다 표본 하나를 제 폭(`NATURAL_WIDTH`)으로 그린 뒤
 * 표본 노드의 그린 상자를 재서(`getBoundingClientRect`) 카드의 창(투명한 자리) 안에 들어가게 줄이고 옮긴다(`transform`) · 노드 상자 밖은
 * 자른다(`clip-path`). 카드는 iframe 위에 서고 창 자리만 투명하다.
 *
 * **고른 까닭(실브라우저로 잰 값):** `build-test/palette.test.ts` 머리말 «잘라 보이는 방법을 고른 값».
 *
 * ## 무엇을 그리나
 *
 * 표본은 갤러리 표본(`@wirebound/theme-gallery` 의 `GALLERY_SAMPLES` 첫째 · `galleryItemDocument`)이다. 표본이 없는 타입은 `createNode(type)`
 * 한 개(카탈로그 기본 props)다. variant 는 붙이지 않는다 — 렌더러가 manifest 의 기본 variant 로 그린다.
 *
 * ## 다시 잰다
 *
 * 카드 창이 옮겨 가면(판 폭이 바뀌어 줄이 다시 감싸임 · 탭 · 검색) 부르는 쪽이 새 창 좌표를 내린다. 테마 · 토큰이 바뀌면 다시 그린다. 문서 밖의 것(테마 시트가 늦게
 * 실림 · 글꼴)이 표본 상자를 바꾸면 iframe 이 다시 재라고 부른다(`onResize` · 글꼴 `loadingdone`).
 *
 * ## 그림이지 조작 대상이 아니다
 *
 * 깔개 전체가 `inert` 다 — 안의 단추 · 입력이 포커스 · 누름을 안 받는다(Tab 이 iframe 안으로 안 들어간다). 누름은 위의 카드가 받는다.
 */
import { useCallback, useLayoutEffect, useMemo, useState, type ReactElement } from 'react'
import { NO_THEME, renderDocument } from '@wirebound/renderer'
import type { AnyDocument, WbNode } from '@wirebound/schema'
import { GALLERY_SAMPLES, galleryItemDocument } from '@wirebound/theme-gallery'
import { ThemeProvider } from '@wirebound/theme-sdk'
import { tokenValues } from '@wirebound/themes'
import { canvasSheets } from '../canvas/canvas'
import { CanvasIframe, type CanvasFrame } from '../canvas/canvas-iframe'
import { createNode } from '../edit/create-node'
import { useProjectTheme } from '../theme/project-theme'
import '../catalog-setup'

/** 표본을 그리는 폭(px) — 카드 창보다 넓게 그려 줄인다. 좁게 그리면 표본이 제 모양(가로 무리 · 표)을 잃는다. */
const NATURAL_WIDTH = 360

/** 표본 노드 상자 밖으로 남기는 여유(px) — 외곽선 · 그림자가 상자 밖에 그려진다. */
const CROP_MARGIN = 4

/** 카드 창 하나 — 트랙 왼쪽 위 기준 좌표. */
export interface ThumbSlot {
  type: string
  left: number
  top: number
  width: number
  height: number
}

interface Sample {
  doc: AnyDocument
  /** 잘라 보일 노드의 id — 표본 노드(표본이 Page 면 그 Page). */
  nodeId: string
}

/** 타입의 표본 문서. 없으면 그 타입 노드 하나를 Page 아래에 둔다. 카탈로그에 없는 타입이면 `null`. */
export function thumbSample(type: string): Sample | null {
  const first = GALLERY_SAMPLES[type]?.[0]
  if (first !== undefined) {
    return { doc: galleryItemDocument({ type, variant: undefined, sample: first }), nodeId: first.node.id }
  }
  const node: WbNode | null = createNode(type, () => `thumb-${type}`)
  if (node === null) return null
  return { doc: { version: 1, root: { id: 'thumb-page', type: 'Page', children: [node] } } as AnyDocument, nodeId: node.id }
}

export function PaletteThumbs(props: {
  slots: readonly ThumbSlot[]
  /** 트랙의 크기 — iframe 의 폭 · 깔개의 크기. */
  width: number
  height: number
}): ReactElement {
  const theme = useProjectTheme()
  const tokens = useMemo(() => (theme.manifest === null ? {} : tokenValues(theme.manifest, theme.tokens)), [theme.manifest, theme.tokens])
  const sheets = useMemo(
    () => canvasSheets({ ref: theme.ref, manifest: theme.manifest, tokens: theme.tokens, bundled: theme.bundled }),
    [theme.ref, theme.manifest, theme.tokens, theme.bundled],
  )
  const definition = theme.definition ?? NO_THEME
  const [frame, setFrame] = useState<CanvasFrame | null>(null)
  const [tick, setTick] = useState(0)
  const remeasure = useCallback(() => setTick((value) => value + 1), [])

  // 글꼴이 늦게 실리면 표본 상자가 바뀐다 — iframe 의 `ResizeObserver` 는 몸 크기만 본다.
  useLayoutEffect(() => {
    const fonts = frame?.document.fonts
    if (fonts === undefined) return
    fonts.addEventListener('loadingdone', remeasure)
    return () => fonts.removeEventListener('loadingdone', remeasure)
  }, [frame, remeasure])

  // 표본마다 그린 상자를 재서 카드 창에 맞춘다 — 재기 전에 옮김을 걷어 제자리 상자를 읽는다(한 이펙트 안이라 걷은 판이 그려지지 않는다).
  useLayoutEffect(() => {
    if (frame === null) return
    const body = frame.document.body
    const placed = body.querySelectorAll<HTMLElement>('[data-wb-palette-thumb]')
    const slotOf = new Map(props.slots.map((slot) => [slot.type, slot]))
    for (const wrapper of placed) {
      wrapper.style.transform = 'none'
      wrapper.style.clipPath = 'none'
    }
    for (const wrapper of placed) {
      const slot = slotOf.get(wrapper.getAttribute('data-wb-palette-thumb') ?? '')
      const nodeId = wrapper.getAttribute('data-wb-palette-node') ?? ''
      const node = [...wrapper.querySelectorAll<HTMLElement>('[data-wb-id]')].find((el) => el.getAttribute('data-wb-id') === nodeId)
      if (slot === undefined || node === undefined) {
        wrapper.style.visibility = 'hidden'
        continue
      }
      const w = wrapper.getBoundingClientRect()
      const n = node.getBoundingClientRect()
      const box = {
        left: n.left - CROP_MARGIN,
        top: n.top - CROP_MARGIN,
        width: n.width + CROP_MARGIN * 2,
        height: n.height + CROP_MARGIN * 2,
      }
      const scale = Math.min(1, slot.width / box.width, slot.height / box.height)
      const tx = slot.left + (slot.width - box.width * scale) / 2 - w.left - scale * (box.left - w.left)
      const ty = slot.top + (slot.height - box.height * scale) / 2 - w.top - scale * (box.top - w.top)
      wrapper.style.visibility = 'visible'
      wrapper.style.clipPath = `inset(${box.top - w.top}px ${w.right - (box.left + box.width)}px ${w.bottom - (box.top + box.height)}px ${box.left - w.left}px)`
      wrapper.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`
    }
  }, [frame, props.slots, definition, tokens, sheets, tick])

  const types = useMemo(() => props.slots.map((slot) => slot.type), [props.slots])

  return (
    <div
      className="wb-shell-palette-thumbs"
      inert
      aria-hidden="true"
      style={{ width: props.width, height: props.height }}
    >
        <CanvasIframe
          styles={sheets}
          width={props.width}
          onFrame={setFrame}
          onResize={remeasure}
          className="wb-shell-palette-thumbs-iframe"
          title="컴포넌트 축소판"
        >
          {(f) => (
            <ThemeProvider value={{ tokens, window: f.window }}>
              {/* **문서가 트랙만큼은 길다** — iframe 은 문서 높이로 자라는데(`canvas/canvas-iframe.tsx`) 표본은 옮김(`transform`) 전 자리로
                  쌓여 그 높이를 정한다. 카드가 여러 줄로 감싸여 트랙이 쌓인 표본보다 길면 아래 줄 카드의 표본이 iframe 밖으로 옮겨져 잘린다. */}
              <div style={{ minHeight: props.height }}>
              {types.map((type) => {
                const sample = thumbSample(type)
                if (sample === null) return null
                return (
                  <div
                    key={type}
                    data-wb-palette-thumb={type}
                    data-wb-palette-node={sample.nodeId}
                    style={{ width: NATURAL_WIDTH, transformOrigin: '0 0', visibility: 'hidden' }}
                  >
                    {renderDocument(sample.doc, { theme: definition })}
                  </div>
                )
              })}
              </div>
            </ThemeProvider>
          )}
        </CanvasIframe>
    </div>
  )
}
