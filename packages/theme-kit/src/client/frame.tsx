import { installCatalog } from '@wirebound/schema'
import { defaultViewsCss } from '@wirebound/theme-sdk'
import { ThemeGallery } from '@wirebound/theme-gallery'
import { tokensCss, tokenValues } from '@wirebound/themes'
import { useEffect, useState, type ReactElement } from 'react'
import { createRoot } from 'react-dom/client'
import theme from 'virtual:wb-theme-entry'
import type { FrameReady, FrameState } from './protocol'

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

function Frame(): ReactElement {
  const [state, setState] = useState<Omit<FrameState, 'type'>>({ tokens: {}, overlay: false })

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const data = event.data as FrameState | null
      if (event.source === window.parent && data?.type === 'wb-state') setState({ tokens: data.tokens, overlay: data.overlay })
    }
    window.addEventListener('message', onMessage)
    window.parent.postMessage({ type: 'wb-frame-ready' } satisfies FrameReady, '*')
    return () => window.removeEventListener('message', onMessage)
  }, [])

  useEffect(() => {
    styleTag('wb-tokens').textContent = tokensCss(theme.manifest, state.tokens).css
  }, [state.tokens])

  return <ThemeGallery theme={theme} tokens={tokenValues(theme.manifest, state.tokens)} window={window} showOverlay={state.overlay} />
}

styleTag('wb-default-views').textContent = defaultViewsCss()
createRoot(document.getElementById('root')!).render(<Frame />)
