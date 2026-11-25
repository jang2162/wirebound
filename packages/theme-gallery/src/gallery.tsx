import {
  CATALOG_TYPES,
  COMPONENT_GROUP_LABELS,
  COMPONENT_GROUPS,
  CURRENT_DOCUMENT_VERSION,
  getComponent,
  isRootType,
  type AnyDocument,
  type ComponentGroup,
  type WbNode,
} from '@wirebound/schema'
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
 * 갤러리를 늘어놓는 꼴. `grid` — 카탈로그 그룹마다 머리를 두고 폭에 맞춘 격자(사람이 보는 미리보기). `list` — 한 줄에 칸 하나씩
 * `galleryItems` 차례(`wb-theme shots` · `check` 가 연다 — 칸 폭이 창 폭이어야 창 폭 넘침을 재는 관문의 뜻이 선다).
 */
export type GalleryLayout = 'list' | 'grid'

export interface GalleryGroup {
  group: ComponentGroup
  label: string
  items: GalleryItem[]
}

/** `galleryItems` 를 카탈로그 그룹(`COMPONENT_GROUPS` 차례)으로 묶는다. 그룹 안은 `galleryItems` 차례 · 빈 그룹은 뺀다. */
export function galleryGroups(theme: ThemeDefinition): GalleryGroup[] {
  const items = galleryItems(theme)
  return COMPONENT_GROUPS.map((group) => ({
    group,
    label: COMPONENT_GROUP_LABELS[group],
    items: items.filter((item) => getComponent(item.type)?.group === group),
  })).filter((one) => one.items.length > 0)
}

/**
 * 칸 하나의 문서 — 표본을 Page 뿌리 아래 둔다(표본이 뿌리 타입(Page · Popup)이면 그대로 · 설 자리가 정해진 표본은 그 부모의 몸통에 · 몸통 밖 자리면 `place` 가 지은 부모 안에). Slot 표본은 레이아웃 꼴이 된다. 갤러리와 `wb-theme check`
 * (`@wirebound/theme-kit` 의 `checkTheme`)가 같은 문서를 그리게 이 함수 하나를 쓴다.
 */
export function galleryItemDocument(item: GalleryItem): AnyDocument {
  const own: WbNode = item.variant === undefined ? item.sample.node : { ...item.sample.node, variant: item.variant }
  const { within, place } = item.sample
  const node: WbNode = place !== undefined ? place(own) : within === undefined ? own : { ...within, children: [own] }
  return {
    version: CURRENT_DOCUMENT_VERSION,
    // 뿌리 타입(`Page` · `Popup`)은 감싸지 않는다 — `Page` 안의 `Popup` 은 뿌리 판정(`nested-page`)에 걸린다. 레이아웃은 그 뿌리의 짝이다.
    layout: node.type === 'Popup' ? 'popup' : 'blank',
    root: isRootType(node.type) ? node : { id: 'gallery', type: 'Page', children: [node] },
  } as AnyDocument
}

function itemMark(item: GalleryItem): string {
  return `${item.type}/${item.variant ?? ''}/${item.sample.node.id}`
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
/** 격자 칸 — 간격은 격자의 `gap` 이 둔다. `minWidth: 0` 이 없으면 넓은 내용이 칸이 아니라 열을 민다. */
const CELL_STYLE: CSSProperties = { ...ITEM_STYLE, margin: 0, minWidth: 0 }
const WIDE_CELL_STYLE: CSSProperties = { ...CELL_STYLE, gridColumn: '1 / -1' }
/** 칸 최소 폭 — 버튼 · 입력 · 카드 표본이 두세 열로 서는 폭. 창이 그보다 좁으면 한 열(`min(…, 100%)`). */
const GRID_STYLE: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(min(320px, 100%), 1fr))',
  gap: '16px',
  alignItems: 'start',
}
const GROUP_STYLE: CSSProperties = { margin: '0 0 32px' }
const GROUP_LABEL_STYLE: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: '8px',
  margin: '0 0 12px',
  padding: '0 0 6px',
  borderBottom: '1px solid #e2e8f0',
  font: '600 14px/1.4 system-ui, sans-serif',
  color: '#0f172a',
}
const GROUP_COUNT_STYLE: CSSProperties = { font: '12px/1.4 system-ui, sans-serif', color: '#64748b' }
const LABEL_STYLE: CSSProperties = {
  display: 'flex',
  gap: '8px',
  margin: '0 0 8px',
  font: '12px/1.4 system-ui, sans-serif',
  color: '#475569',
}

function GalleryEntry(props: { theme: ThemeDefinition; item: GalleryItem; showOverlay: boolean; style: CSSProperties }): ReactElement {
  const stage = useRef<HTMLDivElement>(null)
  const { item } = props
  return (
    <div data-wb-gallery-item={itemMark(item)} style={props.style}>
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
 * 카탈로그 × variant 표본을 늘어놓은 갤러리(spec 「`wb-theme dev`」 · 「토큰 편집」). kit dev 의 프레임 · `wb-theme shots`, 웹의 테마 미리보기
 * (프로젝트 설정 › 테마 · 관리자 › 테마)가 이 컴포넌트를 쓴다. 뷰 하나가 던져도 그 칸만 폴백이 된다 — 렌더러가 노드마다 경계를 둔다.
 */
export function ThemeGallery(props: {
  theme: ThemeDefinition
  tokens: Readonly<Record<string, string | number>>
  window?: Window
  showOverlay?: boolean
  /** 없으면 `grid`. */
  layout?: GalleryLayout
}): ReactElement {
  const entry = (item: GalleryItem, style: CSSProperties) => (
    <GalleryEntry key={itemMark(item)} theme={props.theme} item={item} showOverlay={props.showOverlay === true} style={style} />
  )
  return (
    <ThemeProvider value={{ tokens: props.tokens, window: props.window ?? window }}>
      <div data-wb-gallery="">
        {props.layout === 'list'
          ? galleryItems(props.theme).map((item) => entry(item, ITEM_STYLE))
          : galleryGroups(props.theme).map((group) => (
              <section key={group.group} data-wb-gallery-group={group.group} style={GROUP_STYLE}>
                <div data-wb-gallery-group-label="" style={GROUP_LABEL_STYLE}>
                  <span>{group.label}</span>
                  <span style={GROUP_COUNT_STYLE}>{group.items.length}</span>
                </div>
                <div style={GRID_STYLE}>
                  {group.items.map((item) => entry(item, item.sample.wide === true ? WIDE_CELL_STYLE : CELL_STYLE))}
                </div>
              </section>
            ))}
      </div>
    </ThemeProvider>
  )
}
