/**
 * **빈 구역 칸이 걷힐 때 놓인 노드의 화면 자리를 지킨다**(리뷰 RV-ZE L1). 칸은 끄는 동안만 서서 문서를 키운다(`./empty-zones.tsx`). 놓으면 칸이 걷혀
 * 그 위의 칸 높이만큼 놓인 노드가 화면에서 위로 뛰고, 문서 바닥 근처에서는 줄어든 높이에 스크롤이 잘린다. 칸이 걷힌 커밋 뒤(그리기 전) 놓인 노드를
 * 놓기 직전 미리보기가 섰던 화면 자리에 맞춰 캔버스 칸(iframe 의 스크롤 조상 `.wb-shell-canvas`)을 스크롤한다.
 *
 * **놓기 직전의 자리는 `pointerup` 캡처에서 잰다** — 놓기의 편집 · 미리보기 걷기 · 칸 걷기는 몇 커밋에 걸쳐 그리기 전에 끝난다(놓기의 편집이 먼저
 * 그려지고, 끄는 쪽의 레이아웃 이펙트가 미리보기 · 끄는 것을 걷는 알림을 낸다 — `drag/use-placement.ts` 의 `usePublishDragging`). 어느 커밋의 직전도
 * 사람이 본 화면이 아니라, 아무것도 안 바뀐 손 뗀 순간을 잰다. 놓인 노드는 그때 없던 노드(넣기 · 모듈)거나 미리보기가 베낀 노드(옮기기 —
 * `wb:preview:<id>` · `./canvas-preview.ts`)다.
 *
 * **놓지 않고 끝난 끌기**(Escape · 못 놓는 자리 · 놓은 노드를 못 찾음)는 칸이 걷히는 커밋의 직전 · 직후로 화면 위 끝에 걸친 노드를 붙잡는다 —
 * 같은 커밋 안의 직전은 `getSnapshotBeforeUpdate` 만 잴 수 있어 클래스 컴포넌트다(캔버스 문서는 portal 이라 iframe 안의 DOM 도 호스트와 한 커밋이다).
 *
 * 남는 것: 문서 바닥에 붙은 판에서 놓인 노드 **아래** 칸이 걷힌 만큼은 스크롤이 잘려 못 지킨다(문서가 그만큼 짧아졌다).
 */
import { Component, type ReactNode } from 'react'
import { scrollParent } from '../drag/use-pointer-drag'
import type { CanvasFrame } from './canvas-iframe'
import { isPreviewId, PREVIEW_ID_PREFIX } from './canvas-preview'

interface Props {
  /** 빈 구역 칸이 서 있는가(끄는 동안). */
  slots: boolean
  frame: CanvasFrame
  children: ReactNode
}

/** 손 뗀 순간 — 미리보기 위 끝(iframe 문서 좌표) · 미리보기 id · 그때 있던 노드 id. */
interface Release {
  top: number
  preview: string
  ids: ReadonlySet<string>
}

/** 칸이 걷히기 직전 — 놓지 않고 끝난 끌기의 붙잡을 노드와 그 위 끝. */
type Snapshot = { id: string; top: number } | 'none' | null

export class KeepDropPlace extends Component<Props> {
  private release: Release | null = null
  private listening: Window[] = []

  private readonly onPointerUp = (): void => {
    const doc = this.props.frame.document
    const preview = previewRoot(doc)
    this.release =
      preview === null
        ? null
        : { top: preview.getBoundingClientRect().top, preview: preview.getAttribute('data-wb-id') ?? '', ids: nodeIds(doc) }
  }

  override componentDidMount(): void {
    this.listen()
  }

  override getSnapshotBeforeUpdate(previous: Props): Snapshot {
    if (!previous.slots || this.props.slots) return null
    const id = topmostVisible(this.props.frame)
    const element = id === null ? null : elementOf(this.props.frame.document, id)
    return id === null || element === null ? 'none' : { id, top: element.getBoundingClientRect().top }
  }

  override componentDidUpdate(previous: Props, _state: unknown, snapshot: Snapshot): void {
    if (!previous.slots && this.props.slots) this.release = null
    this.listen()
    if (snapshot === null) return
    const release = this.release
    this.release = null
    const doc = this.props.frame.document
    const landed = release === null ? null : landedOf(doc, release)
    const element = landed !== null ? elementOf(doc, landed) : snapshot === 'none' ? null : elementOf(doc, snapshot.id)
    if (element === null) return
    const before = landed !== null ? release!.top : (snapshot as { top: number }).top
    this.scrollBy(element.getBoundingClientRect().top - before)
  }

  override componentWillUnmount(): void {
    this.listen(true)
  }

  override render(): ReactNode {
    return this.props.children
  }

  /** 칸이 서 있는 동안만 손 떼기를 듣는다 — 호스트 창(끄는 것은 호스트 요소가 포인터를 붙잡는다)과 캔버스 창 둘 다. */
  private listen(off = false): void {
    const want = !off && this.props.slots ? [window, this.props.frame.window] : []
    if (want.length === this.listening.length && want.every((target, at) => target === this.listening[at])) return
    for (const target of this.listening) target.removeEventListener('pointerup', this.onPointerUp, true)
    for (const target of want) target.addEventListener('pointerup', this.onPointerUp, true)
    this.listening = want
  }

  private scrollBy(shift: number): void {
    const iframe = this.props.frame.window.frameElement as HTMLElement | null
    const scroller = scrollParent(iframe)
    if (shift === 0 || iframe === null || scroller === null) return
    scroller.scrollTop += shift * scaleOf(iframe)
  }
}

/** 놓인 노드 — 손 뗀 뒤 새로 선 노드(넣기 · 모듈), 아니면 미리보기가 베낀 노드(옮기기). 못 찾으면 `null`. */
function landedOf(doc: Document, release: Release): string | null {
  const fresh = [...nodeIds(doc)].find((id) => !release.ids.has(id))
  if (fresh !== undefined) return fresh
  const moved = release.preview.slice(PREVIEW_ID_PREFIX.length)
  return release.ids.has(moved) ? moved : null
}

/** 끼운 미리보기의 맨 위 요소(미리보기 안의 미리보기가 아닌 것). 없으면 `null`. */
function previewRoot(doc: Document): Element | null {
  const isPreview = (element: Element | null): boolean => isPreviewId(element?.getAttribute('data-wb-id') ?? '')
  return (
    Array.from(doc.querySelectorAll('[data-wb-id]')).find(
      (element) => isPreview(element) && !isPreview(element.parentElement?.closest('[data-wb-id]') ?? null),
    ) ?? null
  )
}

/** 문서 노드 요소의 id(미리보기 빼고). */
function nodeIds(doc: Document): Set<string> {
  const ids = new Set<string>()
  for (const element of Array.from(doc.querySelectorAll('[data-wb-id]'))) {
    const id = element.getAttribute('data-wb-id') ?? ''
    if (id !== '' && !isPreviewId(id)) ids.add(id)
  }
  return ids
}

/** `data-wb-id` 가 그 값인 첫 요소 — 문서 id 는 임의의 글자라 셀렉터에 넣지 않는다(`./canvas-preview.ts` 의 `elementOf` 와 같다). */
function elementOf(doc: Document, id: string): Element | null {
  return Array.from(doc.querySelectorAll('[data-wb-id]')).find((element) => element.getAttribute('data-wb-id') === id) ?? null
}

/** iframe 좌표 → 호스트 픽셀의 배율 — 캔버스 줌이 iframe 을 늘이고 줄인다. */
function scaleOf(iframe: HTMLElement): number {
  return iframe.offsetHeight === 0 ? 1 : iframe.getBoundingClientRect().height / iframe.offsetHeight
}

/** 캔버스 칸에 보이는 iframe 위 끝에서 가장 가까운 아래 노드 — 놓지 않고 끝난 끌기의 붙잡을 자리. */
function topmostVisible(frame: CanvasFrame): string | null {
  const iframe = frame.window.frameElement as HTMLElement | null
  const scroller = scrollParent(iframe)
  if (iframe === null || scroller === null) return null
  const seen = (scroller.getBoundingClientRect().top - iframe.getBoundingClientRect().top) / scaleOf(iframe)
  let best: { id: string; top: number } | null = null
  for (const element of Array.from(frame.document.querySelectorAll('[data-wb-id]'))) {
    const id = element.getAttribute('data-wb-id') ?? ''
    if (id === '' || isPreviewId(id)) continue
    const top = element.getBoundingClientRect().top
    if (top >= seen && (best === null || top < best.top)) best = { id, top }
  }
  return best?.id ?? null
}
