/**
 * **뷰 모드의 «팝업 열기» · «팝업 닫기»** — 캔버스가 상호작용 요청을 여기로 넘기고, 열린 팝업은 렌더러의 덮개 층(`PopupLayer`)이 캔버스 문서
 * 위에 그린다(번들과 같은 층 — `@wirebound/renderer` 의 `popup-layer.tsx` 머리말).
 *
 * | 요청 | 하는 일 |
 * |---|---|
 * | `openModal` | 트리로 대상 글자를 풀어(`pageTargetsOf` · `matchPageTargets`) 그 페이지를 읽는다. 팝업 페이지면 쌓고, 화면 페이지면 열지 않고 말한다 · 없는 · 둘 이상인 대상 · 읽기 실패도 한 줄 |
 * | `closeModal` | 맨 위를 닫는다. 열린 것이 없으면 한 줄(바로 연 팝업 페이지면 그렇다고) |
 *
 * **열 때마다 읽는다** — 연 동안 남이 그 팝업을 고쳐도 상자는 그대로이고, 닫았다 열면 새 판이다. 트리 · 페이지를 읽는 동안 모드 · 페이지를
 * 옮기면(겹layer 의 리셋 축 `runtimeKey` — `canvas.tsx`) 받은 답을 버린다.
 *
 * **같은 대상을 읽는 동안의 둘째 열기는 버린다** — 덮개는 읽기가 끝나야 서므로 그 사이 여는 단추가 다시 눌린다(안 버리면 더블클릭이 같은 팝업을
 * 두 겹 쌓는다). 덮개를 먼저 세우지 않은 까닭: 읽기가 실패 · 화면 페이지 · 없는 대상으로 끝나면 세운 덮개를 걷고 한 줄로 말해야 해 겹 수 · 포커스
 * 되돌림이 그 갈래마다 갈린다. 버림은 열기를 기다리는 동안만이다 — 다른 대상 · 쌓인 뒤 다시 열기(팝업 안 «다시 열기») · 닫은 뒤 열기는 그대로 연다.
 */
import {
  NO_OPEN_POPUP,
  NO_OPEN_POPUP_DIRECT,
  POPUP_DEPTH_NOTICE,
  isPopupDocument,
  popupOpener,
  type InteractionRequest,
  type PopupArea,
  type PopupStack,
} from '@wirebound/renderer'
import { describePageTarget, matchPageTargets, pageTargetKey } from '@wirebound/schema'
import { useLayoutEffect, useRef, useState } from 'react'
import type { ApiClient } from '../api/client'
import { projectAssetUrl } from '../api/asset-url'
import { pageTargetsOf } from '../edit/paste-ops'
import type { CanvasFrame } from './canvas-iframe'

/** 읽기가 실패했다(망 · 권한 · 지워진 페이지). */
export const POPUP_LOAD_FAILED = '팝업을 불러오지 못했습니다'

/** 대상 글자로 푼 페이지가 없다. */
export function popupMissingPage(target: string): string {
  return `이 프로젝트에 없는 페이지입니다: ${target}`
}

/** 대상 글자로 푼 페이지가 둘 이상이다 — 조용히 첫 페이지를 열지 않는다. */
export function popupAmbiguousPage(target: string): string {
  return `이 타겟을 가리키는 페이지가 프로젝트에 둘 이상입니다: ${target}`
}

/** 대상이 팝업 페이지가 아니다 — 화면 페이지를 상자에 우겨 넣으면 그 페이지의 폭 가정이 깨진다(lint `modal-target-not-popup`). */
export function notPopupPage(target: string): string {
  return `${describePageTarget(target)} 팝업 열기 규칙입니다. 팝업 페이지가 아니라 이 화면에서는 열지 않습니다.`
}

export interface CanvasPopups {
  /** 요청 가운데 열기 · 닫기를 처리한다. 이동은 부른 쪽의 몫이다. */
  handle: (requests: readonly InteractionRequest[]) => void
}

/**
 * 캔버스의 열기 · 닫기. `say` 는 한 줄을 지금 겹layer 의 알림에 덧붙인다 — 늦게 온 답은 `key` 가 그대로일 때만 말한다.
 */
export function useCanvasPopups(input: {
  api: ApiClient
  projectId: string
  stack: PopupStack
  frame: CanvasFrame | null
  /** 지금 화면의 뿌리가 팝업인가 — «열린 팝업이 없습니다» 의 문장을 가른다. */
  rootIsPopup: boolean
  /** 겹layer 의 리셋 축 — 바뀌면 받은 답을 버린다. */
  runtimeKey: string
  say: (line: string, key: string) => void
}): CanvasPopups {
  const latest = useRef(input)
  latest.current = input
  /** 읽는 중인 열기 — `runtimeKey` 와 대상의 열쇠(`pageTargetKey`)로 짓는다. */
  const loading = useRef(new Set<string>())

  const open = async (request: { target: string; sourceNodeId: string }): Promise<void> => {
    const { api, projectId, frame, runtimeKey: key } = latest.current
    const pending = `${key}\n${pageTargetKey(request.target)}`
    if (loading.current.has(pending)) return
    loading.current.add(pending)
    const opener = frame === null ? null : popupOpener(frame.document, request.sourceNodeId)
    const say = (line: string): void => latest.current.say(line, key)
    try {
      const matches = matchPageTargets(pageTargetsOf(await api.getTree(projectId)), request.target)
      if (latest.current.runtimeKey !== key) return
      if (matches.length !== 1) {
        say(matches.length === 0 ? popupMissingPage(request.target) : popupAmbiguousPage(request.target))
        return
      }
      const page = await api.getPage(projectId, matches[0]!.id)
      if (latest.current.runtimeKey !== key) return
      if (!isPopupDocument(page.schema)) {
        say(notPopupPage(request.target))
        return
      }
      const pushed = latest.current.stack.push({
        document: page.schema,
        opener,
        assetUrl: (id) => projectAssetUrl(projectId, id),
      })
      if (!pushed) say(POPUP_DEPTH_NOTICE)
    } catch {
      if (latest.current.runtimeKey === key) say(POPUP_LOAD_FAILED)
    } finally {
      loading.current.delete(pending)
    }
  }

  return {
    handle: (requests) => {
      for (const request of requests) {
        if (request.type === 'closeModal') {
          if (!latest.current.stack.pop())
            latest.current.say(latest.current.rootIsPopup ? NO_OPEN_POPUP_DIRECT : NO_OPEN_POPUP, latest.current.runtimeKey)
        } else if (request.type === 'openModal') {
          void open(request)
        }
      }
    },
  }
}

/**
 * 덮개 층을 세울 구간 — 캔버스 iframe 은 문서 높이로 자라 안쪽 스크롤이 없고(`canvas-iframe.tsx`) 폭은 기기 폭이라 캔버스 칸보다 넓을 수 있으므로,
 * 창 전체(`inset: 0`)에 세우면 상자가 긴 문서의 가운데(화면 밖)나 칸 오른쪽 밖(✖ 가 안 보인다)에 선다. 호스트에서 보이는 구간을 iframe 문서
 * 좌표(줌을 걷은 CSS px)로 옮겨 그 구간에 세운다. 굴리거나 창이 바뀌면 다시 잰다. 열린 팝업이 없으면 재지 않는다.
 *
 * **보이는 구간은 스크롤 상자와 창(뷰포트)이 겹친 곳이다** — 설정의 테마 미리보기(`settings/theme-preview.tsx`)는 상자가 창 아래로 뻗을 수 있어
 * 상자만 보면 팝업이 창 밖(상자의 가운데)에 섰다. 캔버스 칸은 늘 창 안이라 겹친 곳이 곧 칸이다. 상자의 조상(뼈대의 내용 칸)이 굴러도 다시
 * 재도록 호스트 문서의 `scroll` 을 캡처로 듣는다(`scroll` 은 버블하지 않는다).
 *
 * **iframe 요소의 크기가 바뀌어도 다시 잰다**(`ResizeObserver`) — 미리보기는 장을 바꿔도 같은 iframe 에 다른 문서를 실어 높이만 바뀐다. 창이
 * 상자를 다 담아 아무것도 안 구르는 판에서는 `scroll` · `resize` 가 안 와 덮개가 앞 장의 높이로 남고, 상자가 그 가운데(iframe 밖)에 섰다.
 */
export function usePopupArea(frame: CanvasFrame | null, zoom: number, active: boolean): PopupArea | undefined {
  const [area, setArea] = useState<PopupArea | undefined>(undefined)
  useLayoutEffect(() => {
    const element = frame?.window.frameElement ?? null
    if (!active || element === null) return
    const host = element.ownerDocument.defaultView
    const scroller = scrollParent(element)
    const measure = (): void => {
      const outer = element.getBoundingClientRect()
      const box = scroller?.getBoundingClientRect()
      const view = {
        top: Math.max(box?.top ?? 0, 0),
        bottom: Math.min(box?.bottom ?? Number.POSITIVE_INFINITY, host?.innerHeight ?? outer.bottom),
        left: Math.max(box?.left ?? 0, 0),
        right: Math.min(box?.right ?? Number.POSITIVE_INFINITY, host?.innerWidth ?? outer.right),
      }
      const top = Math.max(0, (view.top - outer.top) / zoom)
      const bottom = Math.min(outer.height, view.bottom - outer.top) / zoom
      const left = Math.max(0, (view.left - outer.left) / zoom)
      const right = Math.min(outer.width, view.right - outer.left) / zoom
      const next = { top, height: Math.max(0, bottom - top), left, width: Math.max(0, right - left) }
      setArea((prev) =>
        prev !== undefined && prev.top === next.top && prev.height === next.height && prev.left === next.left && prev.width === next.width
          ? prev
          : next,
      )
    }
    measure()
    const doc = element.ownerDocument
    doc.addEventListener('scroll', measure, { capture: true, passive: true })
    host?.addEventListener('resize', measure)
    const Observer = (host as (Window & typeof globalThis) | null)?.ResizeObserver
    const observer = Observer === undefined ? null : new Observer(measure)
    observer?.observe(element)
    return () => {
      doc.removeEventListener('scroll', measure, { capture: true })
      host?.removeEventListener('resize', measure)
      observer?.disconnect()
    }
  }, [frame, zoom, active])
  return active ? area : undefined
}

/** 가장 가까운 세로 스크롤 조상. 없으면 `null` — 창이 굴린다. */
export function scrollParent(element: Element): Element | null {
  const view = element.ownerDocument.defaultView
  for (let at = element.parentElement; at !== null; at = at.parentElement) {
    const overflow = view?.getComputedStyle(at).overflowY ?? ''
    if (overflow === 'auto' || overflow === 'scroll') return at
  }
  return null
}
