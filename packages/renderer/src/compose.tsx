import type { LayoutDocument, PageDocument } from '@wirebound/schema'
import type { ReactElement } from 'react'
import { renderDocument, type RenderOptions } from './render'

/**
 * 레이아웃 껍데기에 페이지를 주입해 완성된 목업을 그린다.
 * 페이지는 레이아웃의 Slot 자리에 들어간다.
 */
export function renderComposed(layout: LayoutDocument, page: PageDocument, options: RenderOptions = {}): ReactElement {
  const slot = renderDocument(page, options)
  return renderDocument(layout, { ...options, slot })
}
