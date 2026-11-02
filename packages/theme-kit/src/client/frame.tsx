import { installCatalog } from '@wirebound/schema'
import { defaultViewsCss } from '@wirebound/theme-sdk'
import { EXAMPLE_PAGES, ThemeExamples, ThemeGallery, type ExamplePageId } from '@wirebound/theme-gallery'
import { tokensCss, tokenValues } from '@wirebound/themes'
import { useEffect, useState, type ReactElement } from 'react'
import { createRoot } from 'react-dom/client'
import theme from 'virtual:wb-theme-entry'
import { LIST_LAYOUT_QUERY, type FramePage, type FrameReady, type FrameState } from './protocol'

installCatalog()

function styleTag(id: string): HTMLStyleElement {
  const found = document.getElementById(id)
  if (found instanceof HTMLStyleElement) return found
  const style = document.createElement('style')
  style.id = id
  // 작성자의 CSS(진입이 import — vite 가 뒤에 싣는다)가 이기게 head 의 앞에 둔다.
  document.head.prepend(style)
  return style
}

/** `wb-theme shots` 가 연 판 — 셸의 보기를 안 따르고 목록 판 갤러리만 그린다(`LIST_LAYOUT_QUERY`). */
const LIST_ONLY = new URLSearchParams(window.location.search).toString() === LIST_LAYOUT_QUERY

function Frame(): ReactElement {
  const [state, setState] = useState<Omit<FrameState, 'type'>>({
    tokens: {},
    overlay: false,
    view: 'components',
    page: EXAMPLE_PAGES[0]!.id,
  })

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const data = event.data as FrameState | null
      if (event.source === window.parent && data?.type === 'wb-state')
        setState({ tokens: data.tokens, overlay: data.overlay, view: data.view, page: data.page })
    }
    window.addEventListener('message', onMessage)
    window.parent.postMessage(
      { type: 'wb-frame-ready', pages: EXAMPLE_PAGES.map(({ id, title }) => ({ id, title })) } satisfies FrameReady,
      '*',
    )
    return () => window.removeEventListener('message', onMessage)
  }, [])

  useEffect(() => {
    styleTag('wb-tokens').textContent = tokensCss(theme.manifest, state.tokens).css
  }, [state.tokens])

  const tokens = tokenValues(theme.manifest, state.tokens)
  if (LIST_ONLY) return <ThemeGallery theme={theme} tokens={tokens} window={window} showOverlay={state.overlay} layout="list" />
  if (state.view === 'examples') {
    const onPageChange = (page: ExamplePageId) => {
      setState((prev) => ({ ...prev, page }))
      window.parent.postMessage({ type: 'wb-page', page } satisfies FramePage, '*')
    }
    // 프레임은 셸 안에서 제 창으로 구른다 — 팝업은 창 전체(프레임의 보이는 구간)에 선다.
    return <ThemeExamples theme={theme} tokens={tokens} window={window} page={state.page} onPageChange={onPageChange} />
  }
  return <ThemeGallery theme={theme} tokens={tokens} window={window} showOverlay={state.overlay} />
}

styleTag('wb-default-views').textContent = defaultViewsCss()
createRoot(document.getElementById('root')!).render(<Frame />)
