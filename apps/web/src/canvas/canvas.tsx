/**
 * 캔버스 안쪽 — 스토어의 문서를 렌더러로 그리고, 눌러서 노드를 고르고, 선택을 아웃라인으로
 * 보여 준다. 바깥 상자(뷰포트 폭·줌·조회 상태별 안내)는 `routes/editor.tsx`의
 * `CanvasFrame`이다.
 *
 * **문서는 스토어에서 읽는다.** 여기서 `getPage`를 부르지 않는 이유는 `CanvasFrame`의
 * 주석에 있다 — 요지는 "주소가 열린 페이지의 단일 진실"이라는 것이다. 스토어가 든 문서가
 * **지금 주소의 것인지**는 `useOpenDocument`가 대조한다(`store/use-editor-store.tsx`) —
 * 여기서 다시 확인하지 않는 것은 그 대조가 한 곳에 있기 때문이지, 어긋날 수 없어서가 아니다.
 *
 * **문서는 iframe 안에 그린다**(`./canvas-iframe.tsx`). 테마 CSS 는 그 iframe 문서에만 실려 에디터를 칠하지 않고,
 * 테마의 `@media` 는 뷰포트 프리셋 폭으로 판정된다. 테마는 프로젝트가 고정한 `id@버전` 이다(`theme/project-theme.tsx`) — 시트의
 * 차례는 `canvasSheets` 가 갖는다.
 *
 * **이 파일이 그리는 것 중 문서 안쪽에 스타일을 주는 것은 없다.** 셸의 클래스가 붙는 것은 호스트 문서의 상자
 * (`wb-shell-canvas-surface` · `wb-shell-canvas-iframe`)와 문서 **옆에** 그려지는 셸의 장치
 * (`wb-shell-selection` · `wb-shell-marker` · `wb-shell-canvas-error` · `wb-shell-canvas-runtime`)뿐이고, 전부 호스트
 * 문서에 있다 — 셸 CSS 는 iframe 안에 실리지 않는다. 자세한 근거는 `shell.css` 머리말에 있다.
 */
import {
  Component,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ErrorInfo,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
} from 'react'
import {
  EMPTY_OVERLAY,
  focusElement,
  isPopupClose,
  isPopupDocument,
  LayoutFrame,
  markerPoint,
  NO_OPEN_POPUP,
  NO_OPEN_POPUP_DIRECT,
  NO_THEME,
  PopupLayer,
  renderDocument,
  usePopupStack,
  type InteractionEvent,
  type InteractionOverlay,
  type NodeRenderError,
  type RevealTarget,
} from '@wirebound/renderer'
import {
  buildLayoutNav,
  DEFAULT_VIEW_STATE,
  describePageTarget,
  PAGE_LAYOUTS,
  type LayoutNav,
  type LayoutNavMenu,
  type PageDocument,
  type PageLayout,
} from '@wirebound/schema'
import { defaultViewsCss, ThemeProvider, type ThemeDefinition } from '@wirebound/theme-sdk'
import { tokensCss, tokenValues } from '@wirebound/themes'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router'
import { KeepDropPlace } from './keep-drop-place'
import { projectAssetUrl } from '../api/asset-url'
import { useApi } from '../api/context'
import { COPY_OF_ATTR, inLayoutFrame, nodeIdAt } from './canvas-pick'
import { useLayoutMenu } from './layout-menu'
import type { TreeMenuNode } from '../api/types'
import { useCanvasPopups, usePopupArea } from './canvas-popups'
import { platformOf } from '../edit/editor-shortcuts'
import { findNodeSafely, walkSafely } from '../edit/safe-walk'
import { selectionCapNotice } from '../panels/toolbar-status'
import type { SelectionChange } from '../store/editor-store'
import { nodeHeadingLabel } from '../panels/node-shape'
import { useLockedBy } from '../store/use-locked-by'
import { useEditorStore, useEditorStoreInstance, useOpenDocument } from '../store/use-editor-store'
import { hiddenIn, useViewPrefs } from '../store/use-view-prefs'
import { useViewState } from '../shell/use-view-state'
import { useTellCanvasPick } from '../shell/canvas-pick'
import { useCommentPointing, type Revealed } from '../comments/comment-pointing'
import { useAnnounceCanvasRemeasure, useDragging, usePlacementPreview, usePublishCanvasRegion } from '../drag/use-placement'
import { applyPreviewLook, isPreviewId, previewDocument } from './canvas-preview'
import { emptyZonesFor, type EmptyZones } from './empty-zones'
import { usePublishCanvasDocument } from './canvas-document'
import { CanvasDragHandle } from './canvas-drag-handle'
import { CanvasIframe, type CanvasFrame, type CanvasSheet } from './canvas-iframe'
import { guideOf, useLayoutGuides, type Guide, type GuideLine } from './layout-guides'
import { useCanvasMarquee } from './use-canvas-marquee'
import { themeFileUrl } from '../theme/bundle-loader'
import { useProjectTheme, type ProjectThemeState } from '../theme/project-theme'
import { useProjectCodes } from '../codes/project-codes'
// 카탈로그·구조 구현체가 없으면 모든 노드가 폴백으로 그려진다. 설치는 import만으로
// 끝난다 — 그 모듈의 주석 참고.
import '../catalog-setup'

/** 선택 아웃라인이 덮을 자리. 표면 안의 좌표이고 프레임의 배율을 걷어 낸 값이다. */
interface Box {
  left: number
  top: number
  width: number
  height: number
}

/**
 * 번호 마커 하나가 앉을 자리(설계서 「설계서 화면 구조」의 번호 마커). `left`·`top` 은 마커의 **중심**이다 —
 * 렌더러의 `markerPoint` 가 뷰의 `data-wb-marker` 로 정한 점이고, `.wb-shell-marker` 가 `translate(-50%, -50%)` 로 가운데 맞춘다.
 *
 * **아웃라인과 같은 장치를 쓴다** — `findNodeElement`로 노드를 잡아 표면 좌표로 옮긴다. 다른 것은
 * **한 번에 여럿**이라는 점뿐이고, 그 차이가 비용이다(아웃라인은 늘 하나다).
 */
interface MarkerBox {
  nodeId: string
  marker: number
  left: number
  top: number
}

/**
 * 마커가 하나도 없을 때 쓰는 배열. **매번 `[]`를 새로 만들면 참조가 달라져** 문서에
 * 마커가 없는 페이지에서 레이아웃 이펙트가 돌 때마다 리렌더가 난다(스토어의 `#apply`가
 * 빈 배열의 참조를 유지하는 것과 같은 이유).
 */
const NO_MARKERS: MarkerBox[] = []

/** SDK 기본 뷰의 CSS — 테마 시트보다 **먼저** 와야 같은 특이도에서 테마가 이긴다. 판과 무관해 한 번만 짓는다. */
/**
 * **끊긴 공통코드 참조의 표지** — 렌더러가 단 `data-wb-code-broken`(테마 어휘가 아니다 · `packages/renderer` 의 `CodeBrokenAttrs`)에 점선 외곽을 긋는다.
 * 테마가 겨냥하지 않는 속성이라 셸이 기본 시트에 얹어 그린다 — 테마 · 토큰 시트보다 앞이어도 그 속성을 덮는 규칙이 없다. 외곽선이라 자리를 안 바꾼다.
 */
const CODE_MARK_CSS = '[data-wb-code-broken] { outline: 2px dashed #b54708; outline-offset: 2px; }'

const BASE_SHEET: CanvasSheet = { id: 'base', css: `${defaultViewsCss()}\n${CODE_MARK_CSS}` }

/**
 * 캔버스 iframe 머리의 시트 — `base`(SDK 기본 뷰) → `theme`(그 판의 `theme.css` — `<link>` 라 자산 경로가 파일 주소 기준으로 풀린다) →
 * `tokens`(토큰의 CSS 변수). **토큰이 테마 시트 뒤다** — 테마 CSS 가 `:root` 에 토큰의 기본값을 적으므로(system-admin 이 그렇다) 앞에 두면
 * 저장한 토큰이 안 먹는다(실브라우저 판 `build-test/theme-canvas.test.ts` 가 계산값으로 잰다). 번들이 실패하면 `theme` 을 뺀다 — 기본 뷰는
 * 그 판의 CSS 를 모른다. 설정 페이지의 미리보기도 같은 함수로 짓는다.
 */
export function canvasSheets(theme: Pick<ProjectThemeState, 'ref' | 'manifest' | 'tokens' | 'bundled'>): readonly CanvasSheet[] {
  const sheets: CanvasSheet[] = [BASE_SHEET]
  if (theme.bundled && theme.ref !== null) sheets.push({ id: 'theme', href: themeFileUrl(theme.ref, 'theme.css') })
  sheets.push({ id: 'tokens', css: theme.manifest === null ? '' : tokensCss(theme.manifest, theme.tokens).css })
  return sheets
}

/**
 * 상호작용 런타임이 캔버스에 남기는 상태.
 *
 * `key`는 **리셋 축**이다 — `{모드}:{페이지}:{문서를 실은 횟수}`. 근거는 `Canvas` 안의 `runtimeKey` 주석.
 */
interface RuntimeState {
  key: string
  overlay: InteractionOverlay
  /** 이번 트리거가 남긴 말. **쌓지 않는다** — 다음 트리거가 덮는다. */
  notices: string[]
}

/** 쓰이지 않는 알림 배열. `NO_MARKERS`와 같은 이유로 참조를 고정한다. */
const NO_NOTICES: string[] = []

function emptyRuntime(key: string): RuntimeState {
  return { key, overlay: EMPTY_OVERLAY, notices: NO_NOTICES }
}

/**
 * 이번 트리거가 사용자에게 할 말.
 *
 * **둘을 함께 낸다 — 성질이 다르지만 시점이 같다.**
 *
 * - `issues` — **일어나지 않은 것**. 조용히 지나가면 *"눌렀는데 아무 일도 안
 *   일어난다"*가 된다.
 * - `navigate` 요청 — **여기서 일어나지 않는 것**. 규칙은 옳은데 렌더러 밖의 일이다.
 *   **알리기만 하고 안 움직인다** — 편집하던 페이지를 떠나게 하지 않는다.
 *
 * 팝업 열기 · 닫기는 여기서 말하지 않는다 — 덮개 층이 열고 닫는다(`./canvas-popups.tsx`). 못 열면 그쪽이 말한다.
 *
 * **문장에 조사를 계산하지 않는다.** `{이름} 이동 규칙입니다` 꼴이라 받침을 따질 자리가
 * 없다 — 문장화(`schema`)가 조사를 계산하는 것은 그쪽 형태가 필요로 해서다.
 */
function noticesOf(event: InteractionEvent): string[] {
  const out: string[] = []
  for (const issue of event.issues) out.push(issue.message)
  for (const request of event.requests) {
    if (request.type === 'navigate')
      out.push(`${describePageTarget(request.target)} 이동 규칙입니다. 이 화면에서는 페이지를 옮기지 않습니다.`)
  }
  return out.length === 0 ? NO_NOTICES : out
}

/**
 * 스토어의 문서를 그린다. **`CanvasFrame`의 `ready` 분기에서만 쓴다** — 조회 중·실패
 * 상태의 안내는 그쪽이 그린다.
 *
 * 문서가 없으면 아무것도 그리지 않는다. 그 상태(페이지 미선택·조회 중·조회 실패)를
 * 갈라 안내하는 것은 `CanvasFrame`의 몫이고, 여기서 또 문안을 내면 같은 자리에 두 개가
 * 겹친다.
 */
export function Canvas(props: {
  projectId: string
  pageId: string | undefined
  /** 편집 모드 && `canEdit` — 셸의 그 값. 손잡이(`./canvas-drag-handle.tsx`)가 이것으로 선다. */
  editable: boolean
}): ReactElement | null {
  const theme = useProjectTheme()
  // `useToken` 의 값 — 참조 기본값을 푼 값(`tokenValues`). 반쯤 친 값처럼 검사에 걸리는 토큰은 기본값으로 선다.
  const tokens = useMemo(() => (theme.manifest === null ? {} : tokenValues(theme.manifest, theme.tokens)), [theme.manifest, theme.tokens])
  const sheets = useMemo(
    () => canvasSheets({ ref: theme.ref, manifest: theme.manifest, tokens: theme.tokens, bundled: theme.bundled }),
    [theme.ref, theme.manifest, theme.tokens, theme.bundled],
  )
  const definition = theme.definition ?? NO_THEME

  const store = useEditorStoreInstance()
  // selector를 여러 번 부른다. 상태 객체 전체(`(s) => s`)를 고르면 어느 필드가 바뀌든
  // 다시 그린다 — `use-editor-store.tsx`의 주석 참고.
  const doc = useOpenDocument(props.pageId)
  // **지금 고른 화면 상태**(`shell/use-view-state.ts`) — 상태 영역은 그 상태의 가지를 그린다(없으면 기본 가지).
  const { state: viewState, choose: chooseViewState } = useViewState(props.pageId)
  const selectedNodeId = useEditorStore(store, (s) => s.selectedNodeId)
  const selectedNodeIds = useEditorStore(store, (s) => s.selectedNodeIds)
  const mode = useEditorStore(store, (s) => s.mode)
  // 손잡이는 남이 잡은 노드에 안 선다 — 판정은 스토어(`store/use-locked-by.ts`).
  const lockOf = useLockedBy()
  const documentLoads = useEditorStore(store, (s) => s.documentLoads)
  const zoom = useEditorStore(store, (s) => s.zoom)
  const viewportWidth = useEditorStore(store, (s) => s.viewportWidth)
  /**
   * **레이아웃 틀**(설계 `docs/superpowers/specs/2026-11-25-page-layout-design.md` 「캔버스」) — 문서를 렌더러의 `LayoutFrame` 으로 감싼다. 내비는 트리
   * 칸이 그린 메뉴 트리로 짓고(`./layout-menu.tsx`), 끈 영역은 **편집 모드에만** 적용한다(뷰 모드는 늘 다 켬 — 설계 «정해진 것» 3). 뷰 모드의 틀
   * 링크는 그 페이지를 연다(메뉴 트리 칸의 링크와 같은 주소 — `panels/menu-tree.tsx`) · 편집 모드는 아무 일도 없다(`LayoutLink` 가 기본 동작을 막는다).
   */
  const menu = useLayoutMenu()
  const prefs = useViewPrefs()
  const navigateTo = useNavigate()
  const layout = layoutOf(doc)
  const nav = useMemo(() => layoutNav(menu, props.pageId), [menu, props.pageId])
  const hiddenKey = mode === 'edit' ? hiddenIn(prefs.hidden, layout).join('\n') : ''
  const hiddenRegions = useMemo(() => (hiddenKey === '' ? NO_IDS : hiddenKey.split('\n')), [hiddenKey])
  const projectId = props.projectId
  const frameNavigate = useMemo(
    () => (mode === 'view' ? (pageId: string) => navigateTo(`/projects/${projectId}/pages/${pageId}`) : undefined),
    [mode, navigateTo, projectId],
  )
  /**
   * **틀이 노드를 미는 값** — 내비 · 끈 영역 · 레이아웃이 바뀌면 틀의 크기가 바뀌어 문서의 노드가 옮긴다. 아래 측정 이펙트(외곽선 · 마커 · 배치 선 ·
   * 다시 잰 판)의 의존이다 — iframe 의 높이 관찰은 높이가 그대로인 판(LNB 폭만 바뀜 · 같은 높이의 GNB 를 끔)을 못 받는다.
   */
  const frameShape = useMemo(() => ({}), [layout, nav, hiddenRegions])

  const surfaceRef = useRef<HTMLDivElement | null>(null)
  /** 고른 노드마다의 외곽선 상자 — 고른 차례(문서 차례). 기준 노드의 것이 `box`, 코멘트 링의 것이 `ringBox` 다(아래 `outlinedIds`). */
  const [boxes, setBoxes] = useState<readonly OutlineBox[]>(NO_OUTLINES)
  const [markers, setMarkers] = useState<MarkerBox[]>(NO_MARKERS)
  /** 배치 선(`./layout-guides.tsx`) — 켰고 편집 모드일 때 Flex · Grid 노드마다. */
  const [guides, setGuides] = useState<readonly GuideBox[]>(NO_GUIDES)
  /** 문서를 그리는 iframe. 그 문서가 서기 전에는 잴 것이 없다. */
  const [frame, setFrame] = useState<CanvasFrame | null>(null)
  /**
   * 노드 렌더 실패 배너가 앉을 호스트 요소. 배너는 문서를 그리는 자리(iframe 안)에서 오류를 모으지만 셸 CSS 가 없는
   * iframe 에 두면 모양을 잃으므로 portal 로 호스트에 되돌린다.
   */
  const [bannerHost, setBannerHost] = useState<HTMLDivElement | null>(null)
  /**
   * **iframe 이 다시 잰 횟수.** 이미지 · 글꼴 · 테마 CSS 처럼 문서 밖의 것이 노드 상자를 바꾸면 아래 두 측정 이펙트의
   * 다른 의존이 안 바뀐다 — iframe 의 높이를 다시 잴 때마다 올려 외곽선 · 마커가 새 자리를 따라가게 한다.
   */
  const [measureTick, setMeasureTick] = useState(0)
  const bumpMeasure = useCallback(() => setMeasureTick((tick) => tick + 1), [])
  // 셸의 호스트 리스너(팝오버 닫기)가 캔버스 위의 조작을 받게 이 iframe 의 문서를 싣는다(`./canvas-document.tsx`).
  usePublishCanvasDocument(frame?.document ?? null)
  // 끄는 포인터가 캔버스 칸 위인지 · 어느 노드 위인지를 경로 층이 이 창으로 잰다(`drag/use-placement.ts`).
  usePublishCanvasRegion(frame?.window ?? null, zoom)
  /**
   * **배치 미리보기**(`./canvas-preview.ts`) — 끄는 동안 보인 자리에 미리보기를 끼운 사본을 스토어 문서 대신 그린다. 편집 모드에서만
   * 선다(끌기는 편집 모드에만 있다). 사본은 렌더마다 지금 문서로 다시 지어 남의 편집이 오면 새 문서 위에 다시 선다. 외곽선 · 마커 · 손잡이는
   * 사본 위에서 다시 재 밀린 자리를 따르고, 미리보기가 걷히면 다시 재 제자리로 온다(아래 두 측정 이펙트의 의존 `rendered`).
   */
  const preview = usePlacementPreview()
  const shownPreview = mode === 'edit' && doc !== null ? preview : null
  /**
   * **끄는 동안만 서는 빈 구역 칸**(`./empty-zones.tsx` — 설계 spec Q2 (가)). 칸은 스토어 문서로 정한다(미리보기를 끼운 사본이 아니다 — 그 파일 머리말).
   * 끌지 않을 때는 렌더러에 아무것도 안 넘겨 캔버스가 내보낸 화면과 같다.
   */
  const dragging = useDragging()
  /**
   * **고른 노드를 펼쳐 보인다**(설계 spec Q3 (가)) — 고른 노드 · 고른 구역의 부모가 지금 탭이 아닌 패널 · 접힌 검색폼 안이면 그 화면에서만 펼친 판으로 그린다
   * (렌더러의 `reveal`). 고른 구역은 그 부모 자신이 그 구역을 가리면(접힌 검색폼의 단추 구역) 부모도 펼친다(리뷰 RV-ZE L2). 문서(`active` ·
   * `collapsed`)는 안 바뀐다 — 남의 화면 · 내보내기는 그대로다. 고른 노드의 펼침은 편집 모드에서만이다(뷰 모드에는 고른 표지가 없다).
   */
  const selectedZone = useEditorStore(store, (s) => s.selectedZone)
  /**
   * **코멘트 묶음을 고른 노드도 펼친다**(`../comments/comment-pointing.tsx` 머리말 «펼침») — 두 모드 다. 고를 때의 진짜 선택과 지금 선택이 다르면
   * 걷는다(진짜 선택의 펼침이 이긴다 — 같은 `Tabs` 의 다른 패널을 둘이 펼치면 한쪽만 선다). 걷어야 선택이 되돌아와도 되살지 않는다. 그리기 전에
   * 걷는다(`useLayoutEffect`) — 둘이 함께 선 판이 화면에 안 나간다.
   */
  const { nodeId: pointedId, point, revealed, reveal: setCommentReveal } = useCommentPointing()
  const selectionKey = selectedNodeIds.join('\n')
  useLayoutEffect(() => {
    if (revealed !== null && revealed.selection !== selectionKey) setCommentReveal(null)
  }, [revealed, selectionKey, setCommentReveal])
  const commentReveal = revealed?.nodeId ?? null
  const revealKey = [...(mode === 'edit' ? selectedNodeIds : NO_IDS), ...(commentReveal === null ? [] : [commentReveal])].join('\n')
  const zoneParent = mode === 'edit' ? (selectedZone?.parentId ?? null) : null
  const zoneName = mode === 'edit' ? (selectedZone?.zone ?? null) : null
  const reveal = useMemo((): RevealTarget[] | undefined => {
    const targets: RevealTarget[] = revealKey === '' ? [] : revealKey.split('\n')
    if (zoneParent !== null && zoneName !== null) targets.push({ nodeId: zoneParent, zone: zoneName })
    return targets.length === 0 ? undefined : targets
  }, [revealKey, zoneParent, zoneName])
  const emptyZones = useMemo(
    () => (mode === 'edit' && doc !== null && dragging !== null ? emptyZonesFor(doc, dragging) : null),
    [mode, doc, dragging],
  )
  const rendered = useMemo(
    () => (doc === null || shownPreview === null ? doc : (previewDocument(doc, shownPreview) ?? doc)),
    [doc, shownPreview],
  )
  // 그린 뒤 미리보기에 모양(반투명)을 얹는다 — 걷히거나 자리가 바뀌면 되돌린다.
  useLayoutEffect(() => {
    if (frame === null || shownPreview === null || rendered === doc) return
    // 숨은 자리의 미리보기는 부모를 셸의 강조색 테두리로 보인다(`applyPreviewLook`) — 색은 호스트의 셸 변수에서 읽는다(캔버스 문서에는 셸 CSS 가 없다).
    const accent = surfaceRef.current === null ? '' : getComputedStyle(surfaceRef.current).getPropertyValue('--wb-shell-accent').trim()
    return applyPreviewLook(frame.document, shownPreview, accent === '' ? '#2f6fed' : accent)
  }, [frame, rendered, doc, shownPreview])

  /**
   * **상호작용 런타임의 상태**(설계서 「상호작용」의 「실행」 절). 문서가 아니라 **문서 옆**이다 —
   * 뷰 모드에서 버튼을 눌러 일어나는 것은 시연이지 편집이 아니고, 문서를 건드리면
   * revision이 쌓이고 남의 화면이 바뀌고 undo 스택에 섞인다.
   *
   * **`key`가 리셋 장치다**. 모드를 나가거나 페이지를 옮기면 겹layer가 사라져야
   * 하는데, 그것을 `useEffect`로 하면 **키가 바뀐 첫 커밋 하나 동안 옛 겹layer로 그려진다** —
   * `openPageId`가 닫는 것과 같은 창이다(`routes/editor.tsx`의 `CanvasFrame`
   * 주석). 렌더 중에 키를 대조하면 그 창이 없다.
   *
   * **리셋의 축이 셋이다.** 모드는 「실행」이 정한 경계이고(편집 모드에서는 안 돈다),
   * 페이지는 노드 id의 유효 범위다 — 겹layer의 키가 노드 id라 다른 페이지에서는 뜻이 없다.
   * **문서를 통째로 실은 것**(스토어의 `documentLoads` — 복원 · 재연결 재조회)도 축이다 — 겹layer는
   * 옛 문서 위의 시연이다. 복원은 같은 id 의 노드를 되살리므로 페이지 축만으로는 옛 시연이 새 문서에 얹힌다
   * (Chrome: 뷰 모드에서 버튼으로 글을 숨긴 뒤 스냅샷으로 복원하면 되살아난 글이 숨은 채였고, 모드를 오가야 보였다).
   *
   * **문서를 고쳐 가는 것은 축이 아니다.** 뷰 모드에서 사용자는 편집하지 않는다 — 되돌리기·
   * 다시 실행을 포함한 편집 도구는 편집 모드에만 있다(`routes/editor.tsx`). 뷰 모드에 편집
   * 도구가 하나라도 살아 있으면 이 전제가 깨진다. 코멘트가 바꾸는 것은 `marker`뿐이라
   * 겹layer가 덮는 값과 겹치지 않는다. **남의 편집은 실시간으로 온다**(WS 편집 채널 — `main.tsx`의
   * `createEditChannel`) — 그 편집이 문서를 고쳐도 겹layer는 남는다. 편집 하나로 시연을 버리면 남이 글자 하나 고칠
   * 때마다 보던 시연이 사라진다.
   *
   * **실시간으로 온 남의 편집은 축이 아니다 · 끊긴 사이를 따라잡는 재조회는 축이다.** 재조회는 판을 통째로 싣는다
   * (`loadPage`) — 끊긴 사이 무엇이 바뀌었는지(편집 몇 개인지, 복원으로 판이 갈렸는지) 모른 채 서버 판으로 갈아 끼우므로
   * 시연도 새로 시작한다. 그래서 같은 남의 편집이 실시간으로 오면 시연이 남고 끊긴 사이 오면 사라진다 — 받아들인 대가다.
   * 서버 판이 그대로면 재조회가 싣지 않아 시연도 남는다(`routes/editor.tsx`의 재연결 이펙트 — `holdsServerPage`).
   */
  const runtimeKey = `${mode}:${props.pageId ?? ''}:${documentLoads}`
  const [runtime, setRuntime] = useState<RuntimeState>(() => emptyRuntime(runtimeKey))
  // **버리는 것까지 해야 리셋이다.** 아래 `live`처럼 렌더 중에 대조만 하고 상태를
  // 그대로 두면 **키가 되돌아오는 축이라 안 닫힌다** — 뷰 → 편집 → 뷰로 오가면 키가 다시
  // `view:pg-1`이 되어 **버렸어야 할 겹layer가 되살아난다**(재는 케이스:
  // `interaction-runtime.test.tsx`의 `모드를 나가면 사라진다` · `알림도 함께 사라진다`).
  // 페이지 축은 되돌아오는 일이 드물어 이 결함이 모드 축에서 먼저 드러난다.
  //
  // **렌더 중 상태 조정이다** — React가 커밋 전에 이 컴포넌트를 다시 그리므로 이펙트로
  // 하는 것과 달리 옛 겹layer로 그려진 커밋이 남지 않는다. 조건이 곧바로 거짓이 되어
  // 루프가 되지 않는다.
  if (runtime.key !== runtimeKey) setRuntime(emptyRuntime(runtimeKey))
  // 위 조정이 반영되기 전의 이 렌더에서도 옛 값을 쓰지 않는다.
  const live = runtime.key === runtimeKey ? runtime : emptyRuntime(runtimeKey)

  /**
   * **덮개 위에 연 팝업**(`./canvas-popups.tsx`) — 겹layer 와 같은 리셋 축이다. 모드 · 페이지를 옮기거나 문서를 통째로 실으면 모두 닫는다
   * (포커스는 돌려주지 않는다). 편집 모드에서는 층을 안 그린다.
   */
  const api = useApi()
  const popupStack = usePopupStack()
  const codes = useProjectCodes()
  useLayoutEffect(() => {
    popupStack.clear()
  }, [runtimeKey, popupStack.clear])
  const popupArea = usePopupArea(frame, zoom, mode === 'view' && popupStack.popups.length > 0)
  /** 늦게 온 한 줄(팝업을 읽은 답) — 그 사이 리셋됐으면 버린다. */
  const sayLater = (line: string, key: string): void => {
    setRuntime((prev) => (prev.key === key ? { ...prev, notices: [...prev.notices, line] } : prev))
  }
  const popups = useCanvasPopups({
    api,
    projectId: props.projectId,
    stack: popupStack,
    frame,
    rootIsPopup: isPopupDocument(doc),
    runtimeKey,
    say: sayLater,
  })

  /**
   * 지금 키의 상태로 맞춘 것. **갱신 함수 안에서 옛 키의 상태에 얹지 않기 위해서다** —
   * 모드를 바꾼 뒤 첫 이벤트가 앞 모드의 알림에 덧붙는 것을 막는다.
   */
  const normalize = (prev: RuntimeState): RuntimeState => (prev.key === runtimeKey ? prev : emptyRuntime(runtimeKey))

  /**
   * **알림은 "마지막 조작이 만든 것"이다** — 이 규칙 하나가 아래 갈래 둘을 함께 닫는다.
   *
   * | 갈래 | 이 규칙이 없으면 |
   * |---|---|
   * | 규칙이 **없는** 노드를 누른다 | `matched === 0`이라 `onEvent`가 안 불려 **앞 알림이 그대로 남는다** |
   * | 한 클릭에 `click`·`select`가 함께 걸린다 | 뒤 트리거의 결과가 앞 것을 **덮어** 앞 이슈 문장이 사라진다 |
   *
   * 둘 다 *"화면이 낡은 채로 남는다"*는 한 부류다. 그래서 규칙도
   * 하나다: **조작이 시작될 때 비우고, 그 조작 동안 일어난 것을 쌓는다.**
   *
   * **캡처 단계가 그 "시작"이다.** 캡처는 뿌리에서 타겟으로 내려가므로 **노드의 핸들러보다
   * 먼저** 돈다. 같은 이벤트 안의 두 `setRuntime`은 React가 한 번에 처리하고 갱신 함수는
   * 부른 순서대로 쌓이므로, 비우기가 반드시 앞선다.
   *
   * **`onClick`(버블)로는 안 된다** — 그쪽은 노드 핸들러보다 **뒤에** 돌아 방금 만든 알림을
   * 지운다. 선택을 그 자리에서 처리하는 것(아래 표면의 `onClick`)과 단계가 갈리는 이유다.
   */
  const beginGesture = (): void => {
    setRuntime((prev) => {
      const base = normalize(prev)
      return base.notices.length === 0 ? base : { ...base, notices: NO_NOTICES }
    })
  }

  /**
   * **상호작용은 뷰 모드에서만 돈다**(「실행」: *"편집 모드에서는 상호작용이 동작하지 않는다"*).
   * 편집 모드에서는 이 값이 `undefined`라 렌더러가 **상호작용이 없는 판과 한 글자도 다르지 않게** 그린다.
   */
  const interaction =
    mode === 'view'
      ? {
          overlay: live.overlay,
          onEvent: (event: InteractionEvent) => {
            // **렌더 중이 아니라 이벤트 핸들러 안이다** — `onNodeError`와 달리 여기서
            // `setState`를 불러도 된다(`render.tsx`의 `onEvent` 주석).
            setRuntime((prev) => {
              const base = normalize(prev)
              const added = noticesOf(event)
              return {
                key: runtimeKey,
                overlay: event.overlay,
                // **쌓는다**(위 `beginGesture`). 한 조작에 트리거가 둘이면 둘의 말이 다 남는다.
                notices: added.length === 0 ? base.notices : [...base.notices, ...added],
              }
            })
            popups.handle(event.requests)
            // «화면 상태 바꾸기» — 셸의 고름을 바꾼다(전환기도 그 상태를 보인다). 뷰 모드를 나가면 들어가기 전 고름으로 돌아간다
            // (`shell/use-view-state.ts`). 팝업 겹 안의 요청은 층이 그 겹에서 처리해 여기 안 온다(`PopupLayer`).
            for (const request of event.requests) {
              if (request.type === 'setViewState') chooseViewState(request.target === DEFAULT_VIEW_STATE ? null : request.target)
            }
          },
        }
      : undefined

  /** 덮개 위 팝업 안의 상호작용 — 겹layer 는 층이 들고, 말은 같은 알림 줄에 · 열기 · 닫기는 위와 같은 길로. */
  const onPopupEvent = (event: InteractionEvent): void => {
    const added = noticesOf(event)
    if (added.length > 0) {
      setRuntime((prev) => {
        const base = normalize(prev)
        return { ...base, notices: [...base.notices, ...added] }
      })
    }
    popups.handle(event.requests)
  }

  // 고른 노드의 아웃라인은 편집 모드에만 있다(설계서 「설계서 화면 구조」 — 뷰 모드는 결과만 보여 준다). 선택 자체는
  // 남는다. 뷰 모드에서 선택을 지우면 모드를 오갈 때마다 고른 것이 사라진다.
  const outlinedNodeId = mode === 'edit' ? selectedNodeId : null
  const selectedOutlined = mode === 'edit' ? selectedNodeIds : NO_IDS
  /**
   * **코멘트가 가리킨 노드의 링**(`../comments/comment-pointing.tsx`) — 두 모드 다. 고른 것이 아니라 기준 외곽선과 같은 꼴(`.wb-shell-selection`)
   * 하나를 따로 그린다. **이미 고른 노드를 가리키면 따로 안 그린다** — 그 노드의 외곽선(기준이면 진한 선 · 옅으면 가는 끊은 선)이 그대로 선다. 옅은
   * 노드에 링을 그리면 캔버스에 진한 실선이 둘 서 어느 쪽이 기준 노드인지 못 가른다(설계서 「설계서 화면 구조」 «보이는 것»).
   */
  const ringId = pointedId !== null && !selectedOutlined.includes(pointedId) ? pointedId : null
  /**
   * 외곽선을 잴 노드 전부 — 고른 것마다 하나(설계서 «보이는 것») + 링. 링도 같은 측정 이펙트가 잰다 — 두 벌로 재면 하나만 자리를 따라간다.
   * 이펙트의 의존이라 같은 값이면 같은 배열이어야 한다.
   */
  const outlinedIds = useMemo(() => (ringId === null ? selectedOutlined : [...selectedOutlined, ringId]), [selectedOutlined, ringId])
  const box = boxes.find((item) => item.nodeId === outlinedNodeId)?.box ?? null
  const ringBox = ringId === null ? null : (boxes.find((item) => item.nodeId === ringId)?.box ?? null)
  /**
   * **링 · 고른 묶음의 노드를 캔버스 칸 안으로 굴린다**(설계서 «코멘트» 탭) — 링이 새로 설 때(그 노드로 처음 잰 때 — 숨었다 보이게 된 때도) · 묶음을
   * 고를 때(`revealed` 가 새 값 — 머리 단추로 고른 진짜 선택도)마다 한 번, 그 노드의 외곽선이 칸의 보이는 구간에 다 안 들면 가장 가까운 쪽으로
   * 굴린다(`bringIntoPane`). 이미 보이면 안 굴린다. 한 번 굴린 링은 그 링이 걷히거나 다른 노드로 옮기기 전에는 다시 안 굴린다 — 사람이 칸을 굴려
   * 링을 밀어내도 끌려오지 않는다.
   */
  const scrolledRing = useRef<string | null>(null)
  const scrolledPick = useRef<Revealed | null>(null)
  const [platform] = useState(() => platformOf(navigator))
  /** «사람이 캔버스에서 눌러 골랐다» — 우측 패널이 «컴포넌트» 탭으로 옮긴다(`../shell/canvas-pick.tsx`). 고름이 서지 않았으면(남이 잡음 · 뺌) 안 알린다. */
  const tellPick = useTellCanvasPick()
  /** 고르기 몸짓의 답 — 상한에 걸려 더 고르지 않았으면 하단 바가 말한다(구조 트리와 같은 문장). */
  const tellCapped = (change: SelectionChange): void => {
    if (change.capped > 0) store.setEditFailure({ kind: 'message', message: selectionCapNotice() })
  }
  /** Cmd(mac) · Ctrl · Shift 를 든 클릭 — 더하기 · 빼기(구조 트리는 Shift 가 범위다 · 캔버스에는 보이는 차례가 없어 더하기다). */
  const adds = (event: { metaKey: boolean; ctrlKey: boolean; shiftKey: boolean }): boolean =>
    event.shiftKey || (platform === 'mac' ? event.metaKey : event.ctrlKey)
  /** 사각형 고르기(`./use-canvas-marquee.ts`) — 그리는 동안의 사각형. */
  const marquee = useCanvasMarquee({
    frame,
    surface: () => surfaceRef.current,
    zoom,
    enabled: mode === 'edit' && doc !== null,
    root: () => (rendered ?? doc)?.root ?? null,
    onPick: (nodeIds, add) => tellCapped(store.selectMany(nodeIds, add ? 'add' : 'replace')),
  })

  /**
   * 선택된 노드의 자리를 재서 아웃라인 상자에 싣는다.
   *
   * `useLayoutEffect`인 것은 그려진 뒤 한 프레임 늦게 아웃라인이 따라붙는 것을 막기
   * 위해서다. **여기서 재는 것은 문서의 DOM이므로 이펙트 말고는 잴 자리가 없다** —
   * 렌더 중에는 아직 커밋되지 않았다.
   *
   * 값이 같으면 `prev`를 그대로 돌려준다. 상태가 같은 객체로 남으면 React가 뒤이은 렌더를
   * 건너뛸 수 있다 — 아끼는 것은 그것뿐이다.
   *
   * **무한 루프를 막는 장치가 아니다.** 아래 의존성 배열에 `box`가 없으므로 `setBox`가
   * 만든 리렌더는 이 이펙트를 다시 돌리지 않는다(다시 재는 법: 가드를 빼고 `setBox(next)`로
   * 두고 `pnpm vitest run --project web`을 돌리면 전부 통과하고, 멈추지 않고 정상 종료한다).
   */
  useLayoutEffect(() => {
    const surface = surfaceRef.current
    if (surface === null || frame === null || outlinedIds.length === 0) {
      setBoxes((prev) => (prev.length === 0 ? prev : NO_OUTLINES))
      if (ringId === null) scrolledRing.current = null
      if (revealed !== null) scrolledPick.current = revealed
      return
    }

    const offset = frameOffset(frame, surface, zoom)
    const next: OutlineBox[] = []
    for (const nodeId of outlinedIds) {
      const target = findNodeElement(frame.document, nodeId)
      // 지금 상태에서 숨은 노드는 요소가 없다 — 외곽선을 안 세운다(구조 트리 · 속성 패널로 다룬다).
      if (target !== null) next.push({ nodeId, box: measureLines(target, nodeId, offset) })
    }
    setBoxes((prev) => (sameOutlines(prev, next) ? prev : next))
    // 링이 새로 섰거나 묶음을 새로 골랐으면 그 노드를 칸 안으로 굴린다(위 `scrolledRing` 머리말). 그리기 전에 굴린다 — 칸 밖의 링이 한 번 그려지지 않게.
    let show: string | null = null
    if (ringId === null) scrolledRing.current = null
    else if (scrolledRing.current !== ringId && next.some((item) => item.nodeId === ringId)) {
      scrolledRing.current = ringId
      show = ringId
    }
    if (revealed !== null && scrolledPick.current !== revealed) {
      scrolledPick.current = revealed
      show = revealed.nodeId
    }
    const shown = show === null ? undefined : next.find((item) => item.nodeId === show)
    if (shown !== undefined) bringIntoPane(surface, shown.box, zoom)
    // `doc`·`viewportWidth`가 의존성에 있는 것은 둘이 바뀌면 노드의 자리가 바뀌기
    // 때문이다. `zoom`은 자리를 바꾸지는 않지만 아래 계산이 그 값을 쓴다.
    // **겹layer도 자리를 바꾼다** — `setVisible`이 노드를 통째로 빼고 `setProp`이 크기를
    // 바꾼다. 빠뜨리면 아웃라인이 사라진 노드의 옛 자리에 남는다.
    // **`live.notices`도 자리를 바꾼다.** 알림 줄이 문서 **위에** 그려져 문서를 아래로
    // 밀기 때문이다 — 겹layer가 안 바뀐 조작(`applied === 0`, 즉 깨진 규칙만 만난 클릭)에서는
    // `live.overlay`의 참조가 그대로라 이 이펙트가 안 돌고, **아웃라인이 옛 자리에 남는다**.
    // **`frame`·`measureTick`도 자리를 바꾼다** — iframe 문서가 서야 잴 수 있고, 문서 밖의 것이 상자를 바꾸면
    // iframe 이 다시 잰다(위 `measureTick`).
  }, [
    outlinedIds,
    ringId,
    revealed,
    rendered,
    reveal,
    viewState,
    zoom,
    viewportWidth,
    live.overlay,
    live.notices,
    frame,
    measureTick,
    frameShape,
  ])

  /**
   * **번호 마커의 자리를 잰다**(「설계서 화면 구조」). 위 아웃라인 이펙트와 같은 장치이고
   * 의존성도 같다 — 문서·줌·뷰포트 폭이 바뀌면 노드의 자리가 바뀐다.
   *
   * **`outlinedNodeId`가 의존성에 없고 `mode`도 안 본다**. 「설계서 화면 구조」의 탭 구성은
   * 뷰 모드에도 코멘트를 두므로 **마커는 두 모드에 다 있다** — 아웃라인이 편집 모드
   * 전용인 것과 갈리는 자리이고, 그것이 이 이펙트를 따로 둔 이유이기도 하다(합치면 선택이
   * 바뀔 때마다 마커 전부를 다시 재게 된다).
   *
   * **이펙트를 나눈 대가는 순회 하나다.** 문서의 노드 수만큼 도는 순회가 렌더당 한 번
   * 늘지만, 그 순회는 `findNodeElement`(마커 하나마다 `querySelectorAll` 한 번)에 비하면
   * 작다. 최적화하지 않는다 — 페이지 문서는 작고 편집 빈도는 사람의 속도다.
   *
   * **`walkSafely`를 쓴다.** 검증 전 문서가 스토어에 실릴 수 있고, `walkNodes`는
   * `children` 안의 노드 아닌 원소에서 던진다(`edit/safe-walk.ts`의 실측). 여기는 오류
   * 경계 **안**이라 셸까지 지우지는 않지만, 캔버스가 통째로 오류 문장이 되는 것도
   * 마커 때문에 일어날 일이 아니다.
   */
  useLayoutEffect(() => {
    const surface = surfaceRef.current
    if (surface === null || frame === null || doc === null) {
      setMarkers((prev) => (prev.length === 0 ? prev : NO_MARKERS))
      return
    }

    const offset = frameOffset(frame, surface, zoom)
    const next: MarkerBox[] = []
    for (const visit of walkSafely(doc.root)) {
      const marker = visit.node.marker
      // 정수가 아닌 값은 없는 것으로 다룬다 — 봉투 검증(`z.int().positive()`)이 막지만
      // 검증 **전** 문서에 대해서는 그 보장이 없다.
      if (typeof marker !== 'number' || !Number.isInteger(marker)) continue

      const target = findNodeElement(frame.document, visit.node.id)
      // **그려지지 않은 노드는 건너뛴다.** 렌더러가 흡수한 폴백은 id가 빈 문자열이라
      // 찾을 수 없고(`fallback.tsx`), 뷰가 자식을 안 그리는 경우도 있다.
      if (target === null) continue

      // 자리는 뷰가 정한다(`data-wb-marker` — 없으면 기준 상자의 왼쪽 위). 계산은 렌더러의 `markerPoint` 한 곳이다.
      const point = markerPoint(target)
      next.push({ nodeId: visit.node.id, marker, left: offset.left + point.x, top: offset.top + point.y })
    }

    setMarkers((prev) => (sameMarkers(prev, next) ? prev : next))
    // 아웃라인 쪽과 같은 이유로 `live.overlay`가 있다 — 숨겨진 노드의 마커는 사라져야 한다
    // (`findNodeElement`가 `null`을 내므로 아래 루프가 건너뛴다). `live.notices`도 같은
    // 이유다: 알림 줄이 문서를 아래로 민다. **빠뜨리면 마커가 옛 자리에 남는다.**
    // `rendered` 는 배치 미리보기가 끼운 사본이다 — 미리보기가 노드를 밀거나 걷히면 다시 잰다(위 `preview` 주석).
  }, [doc, rendered, reveal, zoom, viewportWidth, live.overlay, live.notices, frame, measureTick, frameShape])

  /**
   * **배치 선의 자리를 잰다**(`./layout-guides.tsx`). 외곽선 · 마커와 같은 장치 · 같은 의존이다 — 줌 · 뷰포트 폭 · 남의 편집 · 미리보기 ·
   * iframe 이 다시 잼이 노드를 옮긴다. **그린 문서(`rendered`)를 돈다** — 끄는 동안 미리보기가 형제를 밀면 선도 따라간다. 미리보기 노드
   * 자체(`wb:preview:` — `./canvas-preview.ts`)에는 안 그린다 — 문서의 노드가 아니라 그 위의 그림이다. 편집 모드에서만 그린다 — 단추가
   * 편집 모드에만 있다(`routes/editor.tsx` 의 머리).
   */
  const guidesOn = useLayoutGuides() && mode === 'edit'
  useLayoutEffect(() => {
    const surface = surfaceRef.current
    if (!guidesOn || surface === null || frame === null || rendered === null) {
      setGuides((prev) => (prev.length === 0 ? prev : NO_GUIDES))
      return
    }
    const offset = frameOffset(frame, surface, zoom)
    const next: GuideBox[] = []
    for (const visit of walkSafely(rendered.root)) {
      const node = visit.node
      if (node.type !== 'Flex' && node.type !== 'Grid') continue
      if (isPreviewId(node.id)) continue
      const target = findNodeElement(frame.document, node.id)
      if (target === null) continue
      const guide = guideOf(node, target, frame.window)
      if (guide !== null)
        next.push({ nodeId: node.id, ...guide, lines: guide.lines.map((line) => onSurface(line, offset)), box: measure(target, offset) })
    }
    setGuides((prev) => (sameGuides(prev, next) ? prev : next))
  }, [guidesOn, rendered, reveal, zoom, viewportWidth, live.overlay, live.notices, frame, measureTick, frameShape])

  /**
   * **다시 잰 판** — 위 두 측정 이펙트와 같은 의존이 바뀔 때마다 새 값이다. 손잡이가 끄는 중이면 이 값이 바뀔 때 마지막 좌표로 다시
   * 묻는다(`./canvas-drag-handle.tsx` 머리말 «캔버스가 다시 잴 때») — 노드가 밀려도 표시가 옛 좌표에 남지 않게.
   */
  const layoutKey = useMemo(() => ({}), [rendered, zoom, viewportWidth, live.overlay, live.notices, frame, measureTick, frameShape])
  // 캔버스 밖에서 끄는 쪽(컴포넌트 목록 카드)도 같은 때 다시 묻는다(`drag/use-placement.ts` 의 `useCanvasRemeasured`).
  useAnnounceCanvasRemeasure(layoutKey)

  if (doc === null) return null
  const previewDrawn = shownPreview !== null && rendered !== doc

  /** 손잡이를 세울 노드 — 뿌리 · 남이 잡은 노드 · 문서에 없는 id 면 없다. **하나 골랐을 때만**(여럿을 함께 끌어 옮기지 않는다 — spec 범위 밖). */
  const handleNode =
    outlinedNodeId === null || selectedNodeIds.length !== 1 || outlinedNodeId === doc.root?.id || lockOf(outlinedNodeId) !== null
      ? undefined
      : findNodeSafely(doc.root, outlinedNodeId)

  return (
    <div
      className="wb-shell-canvas-surface"
      ref={surfaceRef}
      // 지금 그린 배치 미리보기의 띠 · 축(`./canvas-preview.ts`) — 셸 쪽 요소에 비춘다(문서 노드에는 셸의 표지를 안 단다). 선택 외곽선의
      // `data-wb-selected-id` 와 같은 꼴이고 실브라우저 판이 «보인 자리»를 이것으로 읽는다(`build-test/editor-stack.ts` 의 `shownDrops`).
      data-wb-preview={previewDrawn ? shownPreview.target.placement : undefined}
      data-wb-preview-axis={previewDrawn && shownPreview.target.placement !== 'inside' ? (shownPreview.axis ?? 'y') : undefined}
      // 노드마다 핸들러를 다는 대신 상자 하나에서 받는다. 렌더러가 만든 DOM에는 핸들러를
      // 끼워 넣을 자리가 없고(구조 구현체가 그리는 것은 평범한 태그다), 있더라도 노드
      // 수만큼 핸들러가 생긴다. 누른 자리에서 가장 가까운 노드를 찾는 일은
      // `nodeIdAt`(`./canvas-pick.ts` — 사각형과 같은 판정)이 한다.
      // **뷰 모드에서는 선택을 바꾸지 않는다**. 「실행」은 *"편집 모드에서는
      // 상호작용이 동작하지 않는다(노드 선택이 우선)"*까지만 적었는데, 뒤집으면 뷰 모드의
      // 우선순위는 상호작용이다. 그런데 선택은 뷰 모드에서 **아무것도 그리지 않으므로**
      // (아웃라인이 없다) 바뀌어도 화면에 안 보인다 — 즉 편집 모드로 돌아왔을 때 떠날 때와
      // 다른 노드가 골라져 있게 된다. **조용히 바뀌는 화면 상태**다. 선택을 남기는 판정(아래 `outlinedNodeId` 주석)과도 이쪽이 맞다.
      //
      // iframe 안의 클릭도 여기 닿는다 — 문서는 portal 로 그려져 React 이벤트가 이 트리로 버블링한다.
      onClick={(event: MouseEvent<HTMLDivElement>) => {
        // 레이아웃 틀은 노드가 아니다 — 누름은 고름도 링도 안 바꾼다(`./canvas-pick.ts` 의 `inLayoutFrame`). 뷰 모드의 틀 링크는 `LayoutLink` 가 연다.
        if (inLayoutFrame(event.target)) return
        // 캔버스를 누르면 코멘트의 링 · 펼침이 걷힌다(`../comments/comment-pointing.tsx` «걷히는 때») — 두 모드 다.
        point(null)
        setCommentReveal(null)
        // 바로 연 팝업 페이지의 ✖ — 덮개 위의 것은 층이 닫는다.
        if (mode === 'view' && isPopupClose(event.target) && (event.target as Element).closest?.('[data-wb-popup-layer]') == null) {
          const line = popupStack.popups.length === 0 && isPopupDocument(doc) ? NO_OPEN_POPUP_DIRECT : NO_OPEN_POPUP
          setRuntime((prev) => {
            const base = normalize(prev)
            return { ...base, notices: [...base.notices, line] }
          })
          return
        }
        if (mode !== 'edit') return
        const nodeId = frame === null ? null : nodeIdAt(event.target, frame.document.body)
        // **Cmd · Shift 클릭은 더하거나 뺀다**(`toggleSelect`) — 노드 밖이면 아무것도 안 한다(고른 것을 지키려고 든 수식 키다).
        if (adds(event)) {
          if (nodeId === null) return
          tellCapped(store.toggleSelect(nodeId))
          if (store.getState().selectedNodeIds.includes(nodeId)) tellPick()
          return
        }
        store.selectNode(nodeId)
        if (nodeId !== null && store.getState().selectedNodeId === nodeId) tellPick()
      }}
      // **조작이 시작되는 자리**(위 `beginGesture`). 셋을 다는 것은 트리거 4종이 도는 DOM
      // 이벤트가 셋이기 때문이다(`render.tsx`의 `DOM_EVENT`) — 하나라도 빠뜨리면 그
      // 트리거로 시작한 조작에서 앞 알림이 남는다.
      onClickCapture={mode === 'view' ? beginGesture : undefined}
      onSubmitCapture={mode === 'view' ? beginGesture : undefined}
      onChangeCapture={mode === 'view' ? beginGesture : undefined}
    >
      {/* **이번 클릭이 무엇을 했고 무엇을 못 했는가**. 배너가 아니라 `status`인 것은
          실패가 아니기 때문이다 — 깨진 규칙은 저장을 막지 않고(severity가 `warning`)
          `navigate`는 규칙이 옳은데도 여기서 안 도는 것이다. 다음 클릭이 이 자리를 덮어쓴다:
          쌓으면 무엇이 방금 일어난 일인지 알 수 없다. */}
      {live.notices.length > 0 && (
        <div className="wb-shell-canvas-runtime" role="status">
          <ul className="wb-shell-canvas-runtime-list">
            {live.notices.map((notice, index) => (
              <li key={index} className="wb-shell-canvas-runtime-item">
                {notice}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 노드 렌더 실패 배너가 portal 로 들어오는 자리(위 `bannerHost`). */}
      <div ref={setBannerHost} />

      {/* 경계를 iframe **밖**에 둔다 — portal 안에서 던진 것도 React 트리를 따라 여기 닿고, 대신 그린 문장이
          셸 CSS 가 있는 호스트 문서에 선다. 경계가 문서를 대신 그리는 동안 iframe 은 내려간다. */}
      <CanvasBoundary resetKey={doc}>
        <CanvasIframe
          styles={sheets}
          width={viewportWidth}
          onFrame={setFrame}
          onResize={bumpMeasure}
          // 문서 밖(iframe 의 빈 자리)을 누른 것 — 표면의 `onClick` · `onClickCapture` 가 받는 클릭과 같게 다룬다.
          onBackgroundClick={(event) => {
            point(null)
            setCommentReveal(null)
            if (mode === 'view') beginGesture()
            else if (!adds(event)) store.selectNode(null)
          }}
        >
          {(f) => (
            <ThemeProvider value={{ tokens, window: f.window }}>
              {/* 빈 구역 칸이 걷힐 때 놓인 노드의 화면 자리를 지킨다(`./keep-drop-place.tsx`). */}
              <KeepDropPlace slots={emptyZones !== null} frame={f}>
                <CanvasDocument
                  doc={rendered ?? doc}
                  layout={layout}
                  title={pageTitle(menu, props.pageId)}
                  nav={nav}
                  hiddenRegions={hiddenRegions}
                  {...(frameNavigate === undefined ? {} : { navigate: frameNavigate })}
                  theme={definition}
                  viewState={viewState}
                  interaction={interaction}
                  bannerHost={bannerHost}
                  emptyZones={emptyZones}
                  reveal={reveal}
                  projectId={props.projectId}
                />
              </KeepDropPlace>
              {mode === 'view' && (
                <PopupLayer
                  stack={popupStack}
                  theme={definition}
                  area={popupArea}
                  onEvent={onPopupEvent}
                  {...(codes.index === undefined ? {} : { codes: codes.index })}
                />
              )}
            </ThemeProvider>
          )}
        </CanvasIframe>
      </CanvasBoundary>

      {/* 아웃라인은 문서 **옆에** 그린다. 노드에 클래스나 스타일을 얹으면 셸이 테마의
          자리를 침범하고(`shell.css` 머리말), 낙관적 패치가 노드를 갈아 끼울 때마다 다시 얹어야 한다.
          `pointer-events: none`이라 아래의 노드가 그대로 눌린다.

          조건이 둘인 것은 `box`만 보면 모드가 뷰로 바뀐 렌더와 그것을 지우는 레이아웃
          이펙트 사이에서 **id 없는 아웃라인**이 한 번 만들어지기 때문이다(레이아웃
          이펙트라 그려지기 전에 지워지지만, 만들지 않는 편이 낫다). */}
      {/* **배치 선**(`./layout-guides.tsx`) — 외곽선보다 먼저 그려 그 밑에 선다. 모서리 글은 줌을 걷어 화면에서 늘 같은 크기다(손잡이와 같은 꼴). */}
      {guides.map((item) => (
        <div
          key={item.nodeId}
          className={item.kind === 'flex' ? 'wb-shell-guide' : 'wb-shell-guide wb-shell-guide-grid'}
          data-wb-guide-kind={item.kind}
          data-wb-guide-for={item.nodeId}
          data-wb-guide={item.label}
          style={{ left: item.box.left, top: item.box.top, width: item.box.width, height: item.box.height }}
        >
          {/* 안쪽 선(`./layout-guides.tsx` 머리말 «안쪽 선») — 굵기는 줌을 걷어 화면에서 늘 1px 이고, 선의 가운데가 잰 자리에 선다. */}
          {item.lines.map((line, index) => (
            <i
              key={index}
              className={item.kind === 'flex' ? 'wb-shell-guide-line' : 'wb-shell-guide-line wb-shell-guide-line-grid'}
              data-wb-guide-line={line.axis}
              style={
                line.axis === 'x'
                  ? {
                      left: line.at - item.box.left - 0.5 / zoom,
                      top: line.from - item.box.top,
                      height: line.to - line.from,
                      borderLeftWidth: 1 / zoom,
                    }
                  : {
                      top: line.at - item.box.top - 0.5 / zoom,
                      left: line.from - item.box.left,
                      width: line.to - line.from,
                      borderTopWidth: 1 / zoom,
                    }
              }
            />
          ))}
          <span
            className={item.kind === 'flex' ? 'wb-shell-guide-tag' : 'wb-shell-guide-tag wb-shell-guide-tag-grid'}
            style={{ transform: `scale(${1 / zoom})` }}
          >
            {item.label}
          </span>
        </div>
      ))}
      {outlinedNodeId !== null && box !== null && (
        <div
          className="wb-shell-selection"
          data-wb-selected-id={outlinedNodeId}
          style={{ left: box.left, top: box.top, width: box.width, height: box.height, outlineWidth: 2 / zoom, outlineOffset: 1 / zoom }}
        />
      )}
      {/* 코멘트가 가리킨 노드의 링(위 `ringId`) — 기준 외곽선 **뒤에** 그린다. `.wb-shell-selection` 의 첫 요소를 고른 외곽선으로 읽는 케이스가
          많다. `data-wb-selected-id` 를 안 단다 — 고른 것이 아니다. */}
      {ringId !== null && ringBox !== null && (
        <div
          className="wb-shell-selection"
          data-wb-comment-pointed={ringId}
          style={{
            left: ringBox.left,
            top: ringBox.top,
            width: ringBox.width,
            height: ringBox.height,
            outlineWidth: 2 / zoom,
            outlineOffset: 1 / zoom,
          }}
        />
      )}
      {/* 기준 노드가 아닌 고른 노드의 외곽선 — 옅게(`.wb-shell-selection-member`). 기준 노드의 것(`data-wb-selected-id`)은 위 하나다. */}
      {boxes
        .filter((item) => item.nodeId !== outlinedNodeId && item.nodeId !== ringId)
        .map((item) => (
          <div
            key={item.nodeId}
            className="wb-shell-selection-member"
            data-wb-member-id={item.nodeId}
            style={{
              left: item.box.left,
              top: item.box.top,
              width: item.box.width,
              height: item.box.height,
              outlineWidth: 1 / zoom,
              outlineOffset: 1 / zoom,
            }}
          />
        ))}
      {/* 그리는 동안의 사각형(`./use-canvas-marquee.ts`) — 문서 옆 셸 겹이다(외곽선과 같은 까닭). */}
      {marquee !== null && (
        <div
          className="wb-shell-marquee"
          data-wb-marquee=""
          style={{ left: marquee.left, top: marquee.top, width: marquee.width, height: marquee.height }}
        />
      )}

      {/* **손잡이**(`./canvas-drag-handle.tsx`) — 아웃라인 곁. 서는 조건: 편집할 수 있음(`editable` — 편집 모드 · `canEdit`) · 뿌리 아님 ·
          남이 안 잡음(고른 뒤 잠금이 도착한 판). 뿌리는 옮기지 않는다(`edit/structure-drop.ts` 의 표). */}
      {props.editable && outlinedNodeId !== null && box !== null && handleNode !== undefined && (
        <CanvasDragHandle
          key={outlinedNodeId}
          projectId={props.projectId}
          pageId={props.pageId}
          nodeId={outlinedNodeId}
          label={nodeHeadingLabel(handleNode)}
          box={box}
          zoom={zoom}
          layoutKey={layoutKey}
        />
      )}

      {/* **번호 마커**(「설계서 화면 구조」). 아웃라인과 같은 자리·같은 근거로 문서 **옆에** 그린다 —
          노드에 클래스나 스타일을 얹으면 셸이 테마의 자리를 침범한다. 인라인 `style`이
          자리·크기를 코드가 계산하는 부류(`test/shell-css-guard.ts`의 ㉠)라는 것도 같다.

          **`mode`를 안 본다** — 「설계서 화면 구조」의 뷰 모드 탭에도 코멘트가 있으므로 마커는 두 모드에
          다 있다. 아웃라인만 `mode === 'edit'`으로 갈린다.

          `title`을 다는 것은 숫자 하나만으로는 그것이 무엇인지 알 수 없기 때문이다. */}
      {markers.map((item) => (
        <span
          key={item.nodeId}
          className="wb-shell-marker"
          data-wb-marker-for={item.nodeId}
          title={`코멘트 ${item.marker}번`}
          style={{ left: item.left, top: item.top }}
        >
          {item.marker}
        </span>
      ))}
    </div>
  )
}

/**
 * 문서를 실제로 그리는 자리. `Canvas`에서 갈라 둔 이유는 **오류 경계 때문**이다.
 *
 * `renderDocument`는 엘리먼트를 만드는 함수이지 컴포넌트가 아니다. 그 호출이 `Canvas`의 렌더 본문에 있으면 경계보다
 * **위에서** 던지는 셈이 되어 경계가 잡지 못한다. 호출을 경계 **안쪽 컴포넌트**로 내려야 잡힌다. 테마 뷰 본문의 예외는
 * 렌더러가 노드마다 둔 경계가 먼저 받는다(`packages/renderer/src/view-host.tsx`) — 여기 경계는 그 밖에서 던진 것을 받는다.
 */
function CanvasDocument(props: {
  doc: PageDocument
  /** 레이아웃 틀(`LayoutFrame`)의 입력 — `Canvas` 의 «레이아웃 틀» 머리말. */
  layout: PageLayout
  title: string
  nav: LayoutNav
  hiddenRegions: readonly string[]
  navigate?: (pageId: string) => void
  theme: ThemeDefinition
  /** 지금 상태 — 렌더러의 `viewState`(목록 밖 id 는 렌더러가 기본으로 읽는다). */
  viewState: string | null
  /**
   * 상호작용 런타임(「실행」). **`undefined`면 꺼진 것이고 편집 모드가 그렇다.**
   * 켜고 끄는 판단은 `Canvas`가 하고 여기는 그대로 넘긴다.
   */
  interaction?: { overlay: InteractionOverlay; onEvent: (event: InteractionEvent) => void }
  /** 오류 배너를 그릴 호스트 요소. 아직 없으면 배너를 그리지 않는다 — 곧 서고 다시 그려진다. */
  bannerHost: HTMLElement | null
  /** 끄는 동안의 빈 구역 칸(`./empty-zones.tsx`). 끌지 않으면 `null` — 렌더러에 안 넘긴다. */
  emptyZones?: EmptyZones | null
  /** 펼쳐 보일 노드 · 구역 — 렌더러의 `reveal`. 없으면 안 넘긴다. */
  reveal?: readonly RevealTarget[] | undefined
  /** 그림 주소의 프로젝트(`../api/asset-url.ts`). */
  projectId: string
}): ReactElement {
  /**
   * 렌더 중에 모은다. `onNodeError` 안에서 `setState`를 부르면 안 되고(렌더러 주석),
   * `renderDocument`가 돌아온 시점에는 트리 전체의 오류가 이미 이 배열에 들어 있다.
   * 렌더마다 새 배열이므로 StrictMode의 이중 렌더에서도 누적되지 않는다.
   */
  const errors: NodeRenderError[] = []
  const codes = useProjectCodes().index
  const tree = renderDocument(props.doc, {
    theme: props.theme,
    viewState: props.viewState,
    onNodeError: (error) => errors.push(error),
    // **키를 조건부로 넣는다.** `interaction: undefined`를 그냥 실어도 렌더러는 같게
    // 다루지만(`options.interaction === undefined` 검사), 켜지지 않았다는 것이 호출부에서
    // 보이는 편이 낫다.
    ...(props.interaction === undefined ? {} : { interaction: props.interaction }),
    ...(props.emptyZones === undefined || props.emptyZones === null ? {} : { emptyZones: props.emptyZones }),
    ...(props.reveal === undefined ? {} : { reveal: props.reveal }),
    assetUrl: (id) => projectAssetUrl(props.projectId, id),
    // 공통코드에 묶인 노드는 셸의 표로 — 표가 없으면(읽기 전 · 실패) prop 의 글이다(`codes/project-codes.tsx`).
    ...(codes === undefined ? {} : { codes }),
  })

  return (
    <>
      {errors.length > 0 &&
        props.bannerHost !== null &&
        createPortal(
          <div className="wb-shell-canvas-error" role="alert">
            <p className="wb-shell-canvas-error-title">노드 {errors.length}개를 그리지 못했습니다</p>
            <ul className="wb-shell-canvas-error-list">
              {/* 키가 인덱스인 것은 이 목록이 렌더마다 새로 만들어지고 상태를 갖는 자식이
                없기 때문이다. 노드 id는 키가 될 수 없다 — 모양 가드가 흡수한 폴백은
                id가 빈 문자열이라 서로 겹친다. */}
              {errors.map((error, index) => (
                <li key={index} className="wb-shell-canvas-error-item">
                  {error.message}
                </li>
              ))}
            </ul>
          </div>,
          props.bannerHost,
        )}
      <LayoutFrame
        theme={props.theme}
        layout={props.layout}
        title={props.title}
        nav={props.nav}
        hiddenRegions={props.hiddenRegions}
        {...(props.navigate === undefined ? {} : { navigate: props.navigate })}
      >
        {tree}
      </LayoutFrame>
    </>
  )
}

/**
 * 문서의 레이아웃 — 판 7 문서에는 늘 있다(봉투가 지킨다). 검증 전 문서 · 모르는 값은 빈 레이아웃으로 그린다(틀 없음 — 옛 화면과 같다). 판정의
 * 출처는 `layout` 하나다(설계 「팝업 옮기기」 — 뿌리 타입을 읽지 않는다).
 */
function layoutOf(doc: PageDocument | null): PageLayout {
  const value = (doc as { layout?: unknown } | null)?.layout
  return PAGE_LAYOUTS.includes(value as PageLayout) ? (value as PageLayout) : 'blank'
}

/** 트리 칸의 트리에서 지은 내비 — 트리가 없으면(첫 조회 중 · 실패) 빈 트리로 «지금 페이지가 트리에 없는» 판이다. */
function layoutNav(menu: readonly TreeMenuNode[] | null, pageId: string | undefined): LayoutNav {
  return buildLayoutNav(byOrder(menu ?? NO_MENU).map(navMenu), { id: pageId ?? '', title: pageTitle(menu, pageId) })
}

const NO_MENU: readonly TreeMenuNode[] = []

/**
 * 트리 응답 → 내비 입력. **차례는 `sortOrder` 다** — 트리 응답은 차례대로 오지 않고 트리 칸이 그릴 때 정렬한다(`panels/menu-tree.tsx` 의 `byOrder`).
 * 레이아웃을 안 실은 페이지(가짜 api 의 트리)는 빈 레이아웃이다(`api/types.ts` 의 `TreePage.layout`).
 */
function navMenu(node: TreeMenuNode): LayoutNavMenu {
  return {
    id: node.id,
    title: node.title,
    pages: byOrder(node.pages).map((page) => ({ id: page.id, title: page.title, layout: page.layout ?? 'blank' })),
    children: byOrder(node.children).map(navMenu),
  }
}

function byOrder<T extends { sortOrder: number }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => a.sortOrder - b.sortOrder)
}

/** 지금 페이지의 이름(`pages.title`) — 트리 칸이 그린 이름이다(이름 바꾸기가 트리를 다시 받아 따라온다). 트리에 없으면 빈 글. */
function pageTitle(menu: readonly TreeMenuNode[] | null, pageId: string | undefined): string {
  if (menu === null || pageId === undefined) return ''
  const walk = (nodes: readonly TreeMenuNode[]): string | null => {
    for (const node of nodes) {
      const page = node.pages.find((item) => item.id === pageId)
      if (page !== undefined) return page.title
      const below = walk(node.children)
      if (below !== null) return below
    }
    return null
  }
  return walk(menu) ?? ''
}

/** 오류 경계의 상태. 메시지가 있으면 그 문장을 대신 그린다. */
interface BoundaryState {
  message: string | null
}

/**
 * 문서를 그리다 던진 예외를 잡는다.
 *
 * **렌더러는 노드가 잘못된 정도로는 던지지 않는다** — 폴백으로 흡수하고 `onNodeError`로
 * 알린다. 테마 뷰 본문의 예외도 렌더러의 노드 경계가 그 자리에 가둔다. 여기 남는 것은 그 밖에서 던진 것(렌더러 ·
 * 캔버스 자신의 버그)이고, 경계가 없으면 그 하나가 앱 트리 전체를 흰 화면으로 만든다.
 *
 * `resetKey`가 바뀌면 다시 그려 본다. 그러지 않으면 한 번 던진 뒤로는 다른 페이지를 열어도
 * 오류 문장이 남는다. 문서 객체의 동일성을 키로 쓰는 것은 스토어가 문서를 갈아 끼울 때만
 * 새 객체가 되기 때문이다(`editor-store.ts`).
 */
class CanvasBoundary extends Component<{ resetKey: PageDocument; children: ReactNode }, BoundaryState> {
  override state: BoundaryState = { message: null }

  static getDerivedStateFromError(error: unknown): BoundaryState {
    return { message: error instanceof Error ? error.message : String(error) }
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    // 사용자에게는 문장 하나만 보이므로, 원인을 찾을 사람을 위해 콘솔에 남긴다.
    console.error('캔버스가 문서를 그리지 못했습니다', error, info.componentStack)
  }

  override componentDidUpdate(prev: { resetKey: PageDocument }): void {
    if (prev.resetKey !== this.props.resetKey && this.state.message !== null) {
      this.setState({ message: null })
    }
  }

  override render(): ReactNode {
    if (this.state.message === null) return this.props.children

    return (
      <div className="wb-shell-canvas-error" role="alert">
        <p className="wb-shell-canvas-error-title">이 페이지를 그리지 못했습니다</p>
        <p className="wb-shell-canvas-error-item">{this.state.message}</p>
      </div>
    )
  }
}

/**
 * iframe 문서 안에서 그 id를 가진 노드의 엘리먼트.
 *
 * `querySelector('[data-wb-id="…"]')`를 쓰지 않는 것은 id가 문서에서 온 임의의
 * 문자열이기 때문이다 — 따옴표나 역슬래시가 섞이면 셀렉터 문법이 깨진다.
 */
export function findNodeElement(doc: Document, nodeId: string): Element | null {
  for (const element of Array.from(doc.querySelectorAll('[data-wb-id]'))) {
    if (element.getAttribute('data-wb-id') === nodeId) return element
  }
  return null
}

/**
 * iframe 의 왼쪽 위가 표면의 어디에 서는가. 표면 좌표이고 배율을 걷어 낸 값이다.
 *
 * 두 사각형 모두 호스트 화면 좌표라 프레임의 `scale(zoom)`이 곱해져 있어 차를 `zoom`으로 나눈다. iframe 이 표면의
 * 맨 위에 서지 않는 판(알림 줄 · 오류 배너가 위에 있다)이 있어 0 으로 두지 않는다.
 */
export function frameOffset(frame: CanvasFrame, surface: HTMLElement, zoom: number): { left: number; top: number } {
  const element = frame.window.frameElement
  if (element === null) return { left: 0, top: 0 }
  const outer = element.getBoundingClientRect()
  const base = surface.getBoundingClientRect()
  return { left: (outer.left - base.left) / zoom, top: (outer.top - base.top) / zoom }
}

/**
 * 노드가 덮는 자리를 표면 좌표로 옮긴다. **감쌀 요소는 뷰가 정한다**(`data-wb-focus` — 없으면 노드 루트).
 *
 * iframe 안의 사각형은 iframe 문서의 CSS px 이다 — 바깥 프레임의 `scale(zoom)` 은 iframe 요소에 걸리고 그 안의
 * 레이아웃에는 안 곱해진다. 그래서 줌으로 나누지 않고 iframe 의 자리만 더한다. iframe 은 문서 높이를 따라 자라
 * 안쪽 세로 스크롤이 없다(`canvas-iframe.tsx`).
 */
function measure(target: Element, offset: { left: number; top: number }): Box {
  const node = focusElement(target).getBoundingClientRect()
  return { left: offset.left + node.left, top: offset.top + node.top, width: node.width, height: node.height }
}

/**
 * 고른 노드의 외곽선 상자 — 노드 상자에 **바로 뒤에 이어 선 제 사본 형제**(되풀이 행의 둘째 줄부터 — `data-wb-copy-of`)를 합친다. 행을 고르면
 * 되풀이 N 줄이 다 그 행이라 표지도 N 줄을 덮는다 — 사본 줄을 눌러 행을 골랐을 때 표지가 첫 줄에만 서면 무엇이 골라졌는지(이어진 Delete 가 무엇을
 * 지울지) 안 보인다. 셀 틀 조각의 사본은 다른 줄(다른 부모)에 서므로 형제가 아니라 안 합쳐진다.
 */
function measureLines(target: Element, nodeId: string, offset: { left: number; top: number }): Box {
  let box = measure(target, offset)
  for (let line = target.nextElementSibling; line !== null && line.getAttribute(COPY_OF_ATTR) === nodeId; line = line.nextElementSibling) {
    const more = measure(line, offset)
    const right = Math.max(box.left + box.width, more.left + more.width)
    const bottom = Math.max(box.top + box.height, more.top + more.height)
    const left = Math.min(box.left, more.left)
    const top = Math.min(box.top, more.top)
    box = { left, top, width: right - left, height: bottom - top }
  }
  return box
}

/**
 * 두 마커 목록이 같은가. **자리까지 본다** — 노드가 그대로여도 문서가 바뀌면 상자가
 * 움직이고, 그때 갱신하지 않으면 마커가 옛 자리에 남는다.
 *
 * `sameBox`와 같은 이유로 있다: 값이 같으면 `prev`를 그대로 돌려줘 React가 뒤이은 렌더를
 * 건너뛸 수 있게 한다. **무한 루프를 막는 장치가 아니다** — 의존성 배열에 `markers`가 없다.
 */
function sameMarkers(a: readonly MarkerBox[], b: readonly MarkerBox[]): boolean {
  if (a.length !== b.length) return false
  return a.every((item, index) => {
    const other = b[index]
    return (
      other !== undefined &&
      item.nodeId === other.nodeId &&
      item.marker === other.marker &&
      item.left === other.left &&
      item.top === other.top
    )
  })
}

function sameBox(a: Box | null, b: Box): boolean {
  return a !== null && a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height
}

/** 고른 노드 하나의 외곽선. */
interface OutlineBox {
  nodeId: string
  box: Box
}

const NO_OUTLINES: readonly OutlineBox[] = []

/** 배치 선 하나 — 노드 · 종류 · 모서리 글 · 상자. */
/** 배치 선 하나 — 상자와 안쪽 선은 표면 좌표다(`measure` · `onSurface`). */
interface GuideBox extends Guide {
  nodeId: string
  box: Box
}

const NO_GUIDES: readonly GuideBox[] = []

/** 캔버스 문서 좌표의 안쪽 선 → 표면 좌표(`measure` 와 같은 셈 — iframe 의 자리만 더한다). */
function onSurface(line: GuideLine, offset: { left: number; top: number }): GuideLine {
  const [along, across] = line.axis === 'x' ? [offset.left, offset.top] : [offset.top, offset.left]
  return { axis: line.axis, at: line.at + along, from: line.from + across, to: line.to + across }
}

/**
 * 두 배치 선 목록이 같은가 — `sameBox` 와 같은 까닭(값이 같으면 앞 배열을 그대로 둔다). **안쪽 선까지 본다** — 남의 편집이 자식만 옮기면
 * 노드 상자는 그대로라 상자만 보면 선이 옛 자리에 남는다.
 */
function sameGuides(a: readonly GuideBox[], b: readonly GuideBox[]): boolean {
  return (
    a.length === b.length &&
    a.every((item, index) => {
      const other = b[index]
      return (
        other !== undefined &&
        item.nodeId === other.nodeId &&
        item.label === other.label &&
        sameBox(item.box, other.box) &&
        item.lines.length === other.lines.length &&
        item.lines.every((line, at) => {
          const twin = other.lines[at]!
          return line.axis === twin.axis && line.at === twin.at && line.from === twin.from && line.to === twin.to
        })
      )
    })
  )
}
const NO_IDS: readonly string[] = []

/** 두 외곽선 목록이 같은가 — `sameBox`와 같은 까닭(값이 같으면 앞 배열을 그대로 둔다). */
function sameOutlines(a: readonly OutlineBox[], b: readonly OutlineBox[]): boolean {
  return a.length === b.length && a.every((item, index) => item.nodeId === b[index]?.nodeId && sameBox(item.box, b[index]!.box))
}

/** 외곽선 · 링이 칸 가장자리에 붙어 잘리지 않게 더 들이는 몫(px) — 외곽선은 상자 밖으로 `outlineOffset` + `outlineWidth`(3px) 그려진다. */
const PANE_MARGIN = 4

/**
 * 표면 좌표의 상자를 캔버스 칸(`.wb-shell-canvas` — 표면을 품은 스크롤 상자)의 보이는 구간에 들인다 — 다 들어 있으면 안 굴리고, 아니면 가장
 * 가까운 쪽 끝에 붙인다(`scrollIntoView({ block: 'nearest', inline: 'nearest' })` 와 같은 뜻). 칸보다 크면 위 · 왼 끝을 맞춘다.
 * `scrollIntoView` 를 안 쓰는 것은 그것이 칸 밖의 조상(셸 · 문서)까지 굴리기 때문이다. 표면은 줌만큼 커져 그려진다(`frameOffset` 과 같은 축).
 */
function bringIntoPane(surface: HTMLElement, box: Box, zoom: number): void {
  const pane = surface.closest<HTMLElement>('.wb-shell-canvas')
  if (pane === null) return
  const base = surface.getBoundingClientRect()
  const view = pane.getBoundingClientRect()
  const top = view.top + pane.clientTop
  const left = view.left + pane.clientLeft
  const dy = nearest(base.top + box.top * zoom, box.height * zoom, top, pane.clientHeight)
  const dx = nearest(base.left + box.left * zoom, box.width * zoom, left, pane.clientWidth)
  if (dy !== 0) pane.scrollTop += dy
  if (dx !== 0) pane.scrollLeft += dx
}

/**
 * 한 축에서 상자를 구간 안에 들일 굴림 양 — 들어 있으면 0. 1px 안은 들어 있다고 본다 — 끝에 붙여 굴린 상자를 다시 재면 1px 아래의 소수점만큼 구간을
 * 넘어, 같은 상자를 다시 고를 때마다 칸에 값이 안 바뀌는 쓰기를 한 번 더 한다(Chrome · `build-test/comment-focus.test.ts` «가장 가까운 쪽»).
 */
function nearest(start: number, size: number, viewStart: number, viewSize: number): number {
  const from = start - PANE_MARGIN
  const to = start + size + PANE_MARGIN
  if (from >= viewStart - 1 && to <= viewStart + viewSize + 1) return 0
  if (to - from > viewSize || from < viewStart) return from - viewStart
  return to - (viewStart + viewSize)
}
