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
  markerPoint,
  NO_THEME,
  renderDocument,
  type InteractionEvent,
  type InteractionOverlay,
  type NodeRenderError,
} from '@wirebound/renderer'
import { describePageTarget, type PageDocument } from '@wirebound/schema'
import { defaultViewsCss, ThemeProvider, type ThemeDefinition } from '@wirebound/theme-sdk'
import { tokensCss, tokenValues } from '@wirebound/themes'
import { createPortal } from 'react-dom'
import { findNodeSafely, walkSafely } from '../edit/safe-walk'
import { nodeTypeLabel } from '../panels/node-shape'
import { useLockedBy } from '../store/use-locked-by'
import { useEditorStore, useEditorStoreInstance, useOpenDocument } from '../store/use-editor-store'
import { useAnnounceCanvasRemeasure, usePublishCanvasRegion } from '../drag/use-placement'
import { usePublishCanvasDocument } from './canvas-document'
import { CanvasDragHandle } from './canvas-drag-handle'
import { CanvasIframe, type CanvasFrame, type CanvasSheet } from './canvas-iframe'
import { themeFileUrl } from '../theme/bundle-loader'
import { useProjectTheme, type ProjectThemeState } from '../theme/project-theme'
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
const BASE_SHEET: CanvasSheet = { id: 'base', css: defaultViewsCss() }

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
 * - `requests` — **여기서 일어나지 않는 것**. 규칙은 옳은데 렌더러 밖의 일이다.
 *   **알리기만 하고 안 움직인다.** 지금 `"page:관리자/회원/상세"`를
 *   페이지 id로 풀 수단이 없다 — 트리(`getTree`)가 주는 것은 메뉴·페이지의 **제목**이고
 *   경로 형식은 규격이 정한 적이 없다.
 *   제목으로 어림잡아 옮기면 **틀린 페이지로 옮겨 놓고 맞다고 말하는** 화면이 된다.
 *
 * **문장에 조사를 계산하지 않는다.** `{이름} 이동 규칙입니다` 꼴이라 받침을 따질 자리가
 * 없다 — 문장화(`schema`)가 조사를 계산하는 것은 그쪽 형태가 필요로 해서다.
 */
function noticesOf(event: InteractionEvent): string[] {
  const out: string[] = []
  for (const issue of event.issues) out.push(issue.message)
  for (const request of event.requests) {
    const page = describePageTarget(request.target)
    out.push(
      request.type === 'navigate'
        ? `${page} 이동 규칙입니다. 이 화면에서는 페이지를 옮기지 않습니다.`
        : `${page} 모달 열기 규칙입니다. 이 화면에서는 모달을 열지 않습니다.`,
    )
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
  /**
   * **`renderComposed`를 쓰지 않는다.** *"기본 레이아웃이 `Page > Slot`이라 결과가
   * 같다"*는 **성립하지 않는다** — 합성은 레이아웃 루트와 `Slot`
   * **두 노드를 더 그리고**, 그 id는 페이지 문서에 없어 아래 `nodeIdAt`이 유령 노드를
   * 고르게 된다. 측정과 그 결과는 `packages/renderer/test/compose-identity.test.tsx`에 있다.
   */
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
  const selectedNodeId = useEditorStore(store, (s) => s.selectedNodeId)
  const mode = useEditorStore(store, (s) => s.mode)
  // 손잡이는 남이 잡은 노드에 안 선다 — 판정은 스토어(`store/use-locked-by.ts`).
  const lockOf = useLockedBy()
  const documentLoads = useEditorStore(store, (s) => s.documentLoads)
  const zoom = useEditorStore(store, (s) => s.zoom)
  const viewportWidth = useEditorStore(store, (s) => s.viewportWidth)

  const surfaceRef = useRef<HTMLDivElement | null>(null)
  const [box, setBox] = useState<Box | null>(null)
  const [markers, setMarkers] = useState<MarkerBox[]>(NO_MARKERS)
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
   * 지금 키의 상태로 맞춘 것. **갱신 함수 안에서 옛 키의 상태에 얹지 않기 위해서다** —
   * 모드를 바꾼 뒤 첫 이벤트가 앞 모드의 알림에 덧붙는 것을 막는다.
   */
  const normalize = (prev: RuntimeState): RuntimeState =>
    prev.key === runtimeKey ? prev : emptyRuntime(runtimeKey)

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
          },
        }
      : undefined

  // 아웃라인은 편집 모드에만 있다(설계서 「설계서 화면 구조」 — 뷰 모드는 결과만 보여 준다). 선택 자체는
  // 남는다. 뷰 모드에서 선택을 지우면 모드를 오갈 때마다 고른 것이 사라진다.
  const outlinedNodeId = mode === 'edit' ? selectedNodeId : null

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
    const target =
      frame !== null && outlinedNodeId !== null ? findNodeElement(frame.document, outlinedNodeId) : null

    if (surface === null || frame === null || target === null) {
      setBox(null)
      return
    }

    const next = measure(target, frameOffset(frame, surface, zoom))
    setBox((prev) => (sameBox(prev, next) ? prev : next))
    // `doc`·`viewportWidth`가 의존성에 있는 것은 둘이 바뀌면 노드의 자리가 바뀌기
    // 때문이다. `zoom`은 자리를 바꾸지는 않지만 아래 계산이 그 값을 쓴다.
    // **겹layer도 자리를 바꾼다** — `setVisible`이 노드를 통째로 빼고 `setProp`이 크기를
    // 바꾼다. 빠뜨리면 아웃라인이 사라진 노드의 옛 자리에 남는다.
    // **`live.notices`도 자리를 바꾼다.** 알림 줄이 문서 **위에** 그려져 문서를 아래로
    // 밀기 때문이다 — 겹layer가 안 바뀐 조작(`applied === 0`, 즉 깨진 규칙만 만난 클릭)에서는
    // `live.overlay`의 참조가 그대로라 이 이펙트가 안 돌고, **아웃라인이 옛 자리에 남는다**.
    // **`frame`·`measureTick`도 자리를 바꾼다** — iframe 문서가 서야 잴 수 있고, 문서 밖의 것이 상자를 바꾸면
    // iframe 이 다시 잰다(위 `measureTick`).
  }, [outlinedNodeId, doc, zoom, viewportWidth, live.overlay, live.notices, frame, measureTick])

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
  }, [doc, zoom, viewportWidth, live.overlay, live.notices, frame, measureTick])

  /**
   * **다시 잰 판** — 위 두 측정 이펙트와 같은 의존이 바뀔 때마다 새 값이다. 손잡이가 끄는 중이면 이 값이 바뀔 때 마지막 좌표로 다시
   * 묻는다(`./canvas-drag-handle.tsx` 머리말 «캔버스가 다시 잴 때») — 노드가 밀려도 표시가 옛 좌표에 남지 않게.
   */
  const layoutKey = useMemo(() => ({}), [doc, zoom, viewportWidth, live.overlay, live.notices, frame, measureTick])
  // 캔버스 밖에서 끄는 쪽(컴포넌트 목록 카드)도 같은 때 다시 묻는다(`drag/use-placement.ts` 의 `useCanvasRemeasured`).
  useAnnounceCanvasRemeasure(layoutKey)

  if (doc === null) return null

  /** 손잡이를 세울 노드 — 뿌리 · 남이 잡은 노드 · 문서에 없는 id 면 없다. */
  const handleNode =
    outlinedNodeId === null || outlinedNodeId === doc.root?.id || lockOf(outlinedNodeId) !== null
      ? undefined
      : findNodeSafely(doc.root, outlinedNodeId)

  return (
    <div
      className="wb-shell-canvas-surface"
      ref={surfaceRef}
      // 노드마다 핸들러를 다는 대신 상자 하나에서 받는다. 렌더러가 만든 DOM에는 핸들러를
      // 끼워 넣을 자리가 없고(구조 구현체가 그리는 것은 평범한 태그다), 있더라도 노드
      // 수만큼 핸들러가 생긴다. 누른 자리에서 가장 가까운 노드를 찾는 일은
      // `nodeIdAt`이 한다.
      // **뷰 모드에서는 선택을 바꾸지 않는다**. 「실행」은 *"편집 모드에서는
      // 상호작용이 동작하지 않는다(노드 선택이 우선)"*까지만 적었는데, 뒤집으면 뷰 모드의
      // 우선순위는 상호작용이다. 그런데 선택은 뷰 모드에서 **아무것도 그리지 않으므로**
      // (아웃라인이 없다) 바뀌어도 화면에 안 보인다 — 즉 편집 모드로 돌아왔을 때 떠날 때와
      // 다른 노드가 골라져 있게 된다. **조용히 바뀌는 화면 상태**다. 선택을 남기는 판정(아래 `outlinedNodeId` 주석)과도 이쪽이 맞다.
      //
      // iframe 안의 클릭도 여기 닿는다 — 문서는 portal 로 그려져 React 이벤트가 이 트리로 버블링한다.
      onClick={(event: MouseEvent<HTMLDivElement>) => {
        if (mode !== 'edit') return
        store.selectNode(frame === null ? null : nodeIdAt(event.target, frame.document.body))
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
          onBackgroundClick={() => {
            if (mode === 'view') beginGesture()
            else store.selectNode(null)
          }}
        >
          {(f) => (
            <ThemeProvider value={{ tokens, window: f.window }}>
              <CanvasDocument doc={doc} theme={definition} interaction={interaction} bannerHost={bannerHost} />
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
      {outlinedNodeId !== null && box !== null && (
        <div
          className="wb-shell-selection"
          data-wb-selected-id={outlinedNodeId}
          style={{ left: box.left, top: box.top, width: box.width, height: box.height }}
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
          label={nodeTypeLabel(handleNode)}
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
  theme: ThemeDefinition
  /**
   * 상호작용 런타임(「실행」). **`undefined`면 꺼진 것이고 편집 모드가 그렇다.**
   * 켜고 끄는 판단은 `Canvas`가 하고 여기는 그대로 넘긴다.
   */
  interaction?: { overlay: InteractionOverlay; onEvent: (event: InteractionEvent) => void }
  /** 오류 배너를 그릴 호스트 요소. 아직 없으면 배너를 그리지 않는다 — 곧 서고 다시 그려진다. */
  bannerHost: HTMLElement | null
}): ReactElement {
  /**
   * 렌더 중에 모은다. `onNodeError` 안에서 `setState`를 부르면 안 되고(렌더러 주석),
   * `renderDocument`가 돌아온 시점에는 트리 전체의 오류가 이미 이 배열에 들어 있다.
   * 렌더마다 새 배열이므로 StrictMode의 이중 렌더에서도 누적되지 않는다.
   */
  const errors: NodeRenderError[] = []
  const tree = renderDocument(props.doc, {
    theme: props.theme,
    onNodeError: (error) => errors.push(error),
    // **키를 조건부로 넣는다.** `interaction: undefined`를 그냥 실어도 렌더러는 같게
    // 다루지만(`options.interaction === undefined` 검사), 켜지지 않았다는 것이 호출부에서
    // 보이는 편이 낫다.
    ...(props.interaction === undefined ? {} : { interaction: props.interaction }),
  })

  return (
    <>
      {errors.length > 0 &&
        props.bannerHost !== null &&
        createPortal(
        <div className="wb-shell-canvas-error" role="alert">
          <p className="wb-shell-canvas-error-title">
            노드 {errors.length}개를 그리지 못했습니다
          </p>
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
      {tree}
    </>
  )
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
class CanvasBoundary extends Component<
  { resetKey: PageDocument; children: ReactNode },
  BoundaryState
> {
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
 * 누른 자리에서 가장 가까운 노드의 id. 노드 위가 아니면 `null`이다 — 빈 자리를 누르면
 * 선택이 풀린다. iframe 문서의 `body` 까지만 올라간다 — iframe 밖(표면의 알림 · 배너)을 누르면 노드가 없다.
 *
 * **빈 `data-wb-id`는 건너뛴다.** 렌더러의 모양 가드가 흡수한 폴백은 id를 문자열로 읽지
 * 못한 노드라 빈 문자열을 단다(`packages/renderer/src/fallback.tsx`). 그것을 그대로
 * 넣으면 스토어에는 선택이 있는데 가리키는 노드는 없는 상태가 된다.
 */
function nodeIdAt(target: EventTarget | null, body: HTMLElement): string | null {
  // `instanceof Element` 를 쓰지 않는다 — iframe 안의 요소는 iframe 창의 `Element` 로 만들어져 호스트 창의 것과 다르다.
  let element = isElement(target) ? target : null

  while (element !== null && body.contains(element)) {
    const id = element.getAttribute('data-wb-id')
    if (id !== null && id !== '') return id
    element = element.parentElement
  }

  return null
}

function isElement(target: EventTarget | null): target is Element {
  return target !== null && (target as Node).nodeType === 1
}

/**
 * iframe 문서 안에서 그 id를 가진 노드의 엘리먼트.
 *
 * `querySelector('[data-wb-id="…"]')`를 쓰지 않는 것은 id가 문서에서 온 임의의
 * 문자열이기 때문이다 — 따옴표나 역슬래시가 섞이면 셀렉터 문법이 깨진다.
 */
function findNodeElement(doc: Document, nodeId: string): Element | null {
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
function frameOffset(frame: CanvasFrame, surface: HTMLElement, zoom: number): { left: number; top: number } {
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
  return (
    a !== null && a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height
  )
}
