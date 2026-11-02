import { pageTargetKey } from '@wirebound/schema'
import {
  EMPTY_OVERLAY,
  NO_OPEN_POPUP,
  POPUP_DEPTH_NOTICE,
  PopupLayer,
  popupOpener,
  renderComposed,
  usePopupStack,
  type InteractionEvent,
  type InteractionOverlay,
  type InteractionRequest,
  type PopupArea,
} from '@wirebound/renderer'
import { ThemeProvider, type ThemeDefinition } from '@wirebound/theme-sdk'
import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactElement, type SyntheticEvent } from 'react'
import { galleryAssetUrl } from '../samples'
import { EXAMPLE_LAYOUT, EXAMPLE_PAGES, EXAMPLE_POPUPS, type ExamplePageId } from './documents'

/** 이 예제에 없는 페이지를 가리킨 이음 — 문서가 검증을 지나면 안 생긴다(케이스가 죽은 이음 0 을 잰다). */
export function missingExample(target: string): string {
  return `예제에 없는 페이지입니다: ${target}`
}

const NOTICE_STYLE: CSSProperties = {
  margin: '0 0 8px',
  padding: '6px 10px',
  border: '1px solid #fcd34d',
  background: '#fffbeb',
  color: '#78350f',
  font: '12px/1.5 system-ui, sans-serif',
}

/** 그 장의 겹layer(눌러 만든 화면 상태)와 이번 누름이 남긴 말. 장이 바뀌면 처음 판으로 선다. */
interface PageRuntime {
  page: ExamplePageId
  overlay: InteractionOverlay
  notices: readonly string[]
}

const NO_NOTICES: readonly string[] = []

/**
 * 예제 페이지 하나를 레이아웃과 합쳐 그리고(`renderComposed`) 이음을 받아 장을 바꾼다. 장 이름 줄 · 보기 전환은 호스트가 그린다(웹 미리보기 머리 ·
 * kit 셸) — `page` 는 호스트가 든다.
 *
 * **미리보기 안의 누름은 바깥 화면을 안 움직인다.** 이동은 `onPageChange` 로만 알리고, `Link` 기본 뷰의 `<a href="#…">` 와 폼 제출의 기본 동작은
 * 뿌리에서 막는다 — 렌더러는 submit 규칙이 걸린 노드만 막아(`packages/renderer/src/render.tsx` 의 `handlersFor`), 그대로 두면 iframe 해시가 바뀌어
 * 브라우저 기록이 쌓이고 «뒤로» 가 미리보기 안을 돈다. 가운데 단추 누름(`auxclick`)도 막는다 — 안 막으면 그 이음을 새 탭으로 연다.
 */
export function ThemeExamples(props: {
  theme: ThemeDefinition
  tokens: Readonly<Record<string, string | number>>
  window?: Window
  page: ExamplePageId
  onPageChange: (page: ExamplePageId) => void
  /** 팝업을 세울 구간 — 없으면 창 전체(`PopupLayer` 의 `area`). */
  popupArea?: PopupArea
}): ReactElement {
  const shown = EXAMPLE_PAGES.find((one) => one.id === props.page) ?? EXAMPLE_PAGES[0]!
  const stack = usePopupStack()
  const rootRef = useRef<HTMLDivElement>(null)
  const [runtime, setRuntime] = useState<PageRuntime>({ page: shown.id, overlay: EMPTY_OVERLAY, notices: NO_NOTICES })
  const current: PageRuntime = runtime.page === shown.id ? runtime : { page: shown.id, overlay: EMPTY_OVERLAY, notices: NO_NOTICES }

  // 장이 바뀌면(이음 · 호스트의 장 이름 줄) 열린 팝업을 걷는다 — 팝업은 연 장의 것이다.
  const { clear } = stack
  useLayoutEffect(() => clear(), [shown.id, clear])

  const handle = (requests: readonly InteractionRequest[]): string[] => {
    const said: string[] = []
    for (const request of requests) {
      if (request.type === 'closeModal') {
        if (!stack.pop()) said.push(NO_OPEN_POPUP)
        continue
      }
      const key = pageTargetKey(request.target)
      if (request.type === 'navigate') {
        const next = EXAMPLE_PAGES.find((one) => pageTargetKey(one.target) === key)
        if (next === undefined) {
          said.push(missingExample(request.target))
          continue
        }
        if (next.id !== shown.id) props.onPageChange(next.id)
        continue
      }
      const popup = EXAMPLE_POPUPS.find((one) => pageTargetKey(one.target) === key)
      if (popup === undefined) {
        said.push(missingExample(request.target))
        continue
      }
      const doc = rootRef.current?.ownerDocument
      const opened = stack.push({
        document: popup.document,
        opener: doc === undefined ? null : popupOpener(doc, request.sourceNodeId),
        assetUrl: galleryAssetUrl,
      })
      if (!opened) said.push(POPUP_DEPTH_NOTICE)
    }
    return said
  }

  const onEvent = (event: InteractionEvent): void => {
    const notices = [...event.issues.map((issue) => issue.message), ...handle(event.requests)]
    setRuntime({ page: shown.id, overlay: event.overlay, notices: notices.length === 0 ? NO_NOTICES : notices })
  }
  const onPopupEvent = (event: InteractionEvent): void => {
    const notices = [...event.issues.map((issue) => issue.message), ...handle(event.requests)]
    if (notices.length > 0) setRuntime((prev) => ({ ...prev, notices }))
  }

  const keepInside = (event: SyntheticEvent): void => {
    const target = event.target as Element | null
    if (event.type === 'submit' || target?.closest?.('a[href]') != null) event.preventDefault()
  }

  return (
    <ThemeProvider value={{ tokens: props.tokens, window: props.window ?? window }}>
      <div ref={rootRef} data-wb-examples={shown.id} onClick={keepInside} onAuxClick={keepInside} onSubmit={keepInside}>
        {current.notices.length > 0 && (
          <div role="status" data-wb-examples-notice="" style={NOTICE_STYLE}>
            {current.notices.join(' · ')}
          </div>
        )}
        {renderComposed(EXAMPLE_LAYOUT, shown.document, {
          theme: props.theme,
          assetUrl: galleryAssetUrl,
          interaction: { overlay: current.overlay, onEvent },
        })}
        <PopupLayer
          stack={stack}
          theme={props.theme}
          onEvent={onPopupEvent}
          {...(props.popupArea === undefined ? {} : { area: props.popupArea })}
        />
      </div>
    </ThemeProvider>
  )
}
