import { installCatalog, validateLayout, validatePage } from '@wirebound/schema'
import { renderComposed } from '@wirebound/renderer'
import { ADMIN_V0, ADMIN_V0_CSS } from '@wirebound/system-theme-admin'
import { defaultViewsCss } from '@wirebound/theme-sdk'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './debug.css'
import { sampleLayout, samplePage } from './sample'

installCatalog()

// **기본 뷰 CSS 가 먼저, 테마 CSS 가 나중** — 같은 특이도에서 테마가 이긴다(캔버스 iframe 과 같은 차례 —
// `apps/web/src/canvas/canvas-theme.ts` 의 `CANVAS_STYLES`). playground 는 셸이 없어 iframe 없이 문서 head 에 싣는다.
for (const css of [defaultViewsCss(), ADMIN_V0_CSS]) {
  const style = document.createElement('style')
  style.textContent = css
  document.head.append(style)
}

const issues = [...validateLayout(sampleLayout), ...validatePage(samplePage)]
if (issues.length > 0) {
  console.error('샘플 문서 검증 실패', issues)
}

const container = document.getElementById('root')
if (!container) throw new Error('#root를 찾을 수 없습니다')

createRoot(container).render(<StrictMode>{renderComposed(sampleLayout, samplePage, { theme: ADMIN_V0 })}</StrictMode>)
