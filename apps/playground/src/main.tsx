import { installCatalog, validateLayout, validatePage } from '@wirebound/schema'
import { installStructures, renderComposed } from '@wirebound/renderer'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './debug.css'
import { sampleLayout, samplePage } from './sample'

installCatalog()
installStructures()

const issues = [...validateLayout(sampleLayout), ...validatePage(samplePage)]
if (issues.length > 0) {
  console.error('샘플 문서 검증 실패', issues)
}

const container = document.getElementById('root')
if (!container) throw new Error('#root를 찾을 수 없습니다')

createRoot(container).render(
  <StrictMode>{renderComposed(sampleLayout, samplePage)}</StrictMode>,
)
