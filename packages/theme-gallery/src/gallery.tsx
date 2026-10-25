import { CATALOG_TYPES, CURRENT_DOCUMENT_VERSION, type AnyDocument, type WbNode } from '@wirebound/schema'
import { renderDocument } from '@wirebound/renderer'
import { ThemeProvider, type ThemeDefinition } from '@wirebound/theme-sdk'
import { useRef, type CSSProperties, type ReactElement } from 'react'
import { GalleryOverlay } from './overlay'
import { galleryAssetUrl, GALLERY_SAMPLES, type GallerySample } from './samples'

export interface GalleryItem {
  type: string
  /** 그린 variant. manifest 가 그 컴포넌트에 variant 를 선언하지 않았으면 `undefined`. */
  variant: string | undefined
  sample: GallerySample
}

/** 카탈로그 차례로, 컴포넌트마다 선언된 variant × 표본. 선언이 없으면 표본마다 한 번. */
export function galleryItems(theme: ThemeDefinition): GalleryItem[] {
  const items: GalleryItem[] = []
  for (const type of CATALOG_TYPES) {
    const samples = GALLERY_SAMPLES[type] ?? []
    const variants = theme.manifest.components?.[type]?.variants.map((v) => v.id) ?? [undefined]
    for (const variant of variants) for (const sample of samples) items.push({ type, variant, sample })
  }
  return items
}

/**
 * 칸 하나의 문서 — 표본을 Page 뿌리 아래 둔다(표본이 Page 면 그대로 · 설 자리가 정해진 표본은 그 부모의 몸통에 · 몸통 밖 자리면 `place` 가 지은 부모 안에). Slot 표본은 레이아웃 꼴이 된다. 갤러리와 `wb-theme check`
 * (`@wirebound/theme-kit` 의 `checkTheme`)가 같은 문서를 그리게 이 함수 하나를 쓴다.
 */
export function galleryItemDocument(item: GalleryItem): AnyDocument {
  const own: WbNode = item.variant === undefined ? item.sample.node : { ...item.sample.node, variant: item.variant }
  const { within, place } = item.sample
  const node: WbNode = place !== undefined ? place(own) : within === undefined ? own : { ...within, children: [own] }
  return {
    version: CURRENT_DOCUMENT_VERSION,
    root: node.type === 'Page' ? node : { id: 'gallery', type: 'Page', children: [node] },
  } as AnyDocument
}

function itemTitle(theme: ThemeDefinition, item: GalleryItem): string {
  if (item.variant === undefined) return item.type
  const label = theme.manifest.components?.[item.type]?.variants.find((v) => v.id === item.variant)?.label ?? item.variant
  return `${item.type} · ${label}`
}

/**
 * 갤러리 칸의 틀. **인라인 스타일로만 칠한다** — 갤러리는 테마 CSS 와 한 문서에 산다. 클래스로 칠하면 작성자의 CSS 가
 * 같은 이름을 칠하거나 우리 규칙이 작성자의 요소를 칠한다.
 */
const ITEM_STYLE: CSSProperties = { position: 'relative', margin: '0 0 24px', padding: '12px', border: '1px dashed #cbd5e1' }
const LABEL_STYLE: CSSProperties = {
  display: 'flex',
  gap: '8px',
  margin: '0 0 8px',
  font: '12px/1.4 system-ui, sans-serif',
  color: '#475569',
}

function GalleryEntry(props: { theme: ThemeDefinition; item: GalleryItem; showOverlay: boolean }): ReactElement {
  const stage = useRef<HTMLDivElement>(null)
  const { item } = props
  return (
    <div data-wb-gallery-item={`${item.type}/${item.variant ?? ''}/${item.sample.node.id}`} style={ITEM_STYLE}>
      <div style={LABEL_STYLE}>
        <strong>{itemTitle(props.theme, item)}</strong>
        <span>{item.sample.label}</span>
      </div>
      <div ref={stage}>{renderDocument(galleryItemDocument(item), { theme: props.theme, assetUrl: galleryAssetUrl })}</div>
      {props.showOverlay && <GalleryOverlay stage={stage} nodeId={item.sample.node.id} />}
    </div>
  )
}

/**
 * 카탈로그 × variant 표본을 늘어놓은 갤러리(spec 「`wb-theme dev`」 · 「토큰 편집」). kit dev 의 프레임과 웹의 토큰 편집 옆
 * 갤러리가 이 컴포넌트를 쓴다. 뷰 하나가 던져도 그 칸만 폴백이 된다 — 렌더러가 노드마다 경계를 둔다.
 */
export function ThemeGallery(props: {
  theme: ThemeDefinition
  tokens: Readonly<Record<string, string | number>>
  window?: Window
  showOverlay?: boolean
}): ReactElement {
  return (
    <ThemeProvider value={{ tokens: props.tokens, window: props.window ?? window }}>
      <div data-wb-gallery="">
        {galleryItems(props.theme).map((item) => (
          <GalleryEntry
            key={`${item.type}/${item.variant ?? ''}/${item.sample.node.id}`}
            theme={props.theme}
            item={item}
            showOverlay={props.showOverlay === true}
          />
        ))}
      </div>
    </ThemeProvider>
  )
}
