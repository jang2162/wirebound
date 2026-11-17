/**
 * **번들 페이지 하나를 세운다** — 페이지의 인라인 스크립트가 `__wirebound_export__.boot()` 로 부른다(`runtime.tsx`).
 *
 * 차례: 페이지 JSON 을 읽는다 → 테마 번들의 등록을 받아(`take(#wb-export-theme)`) 서버 manifest 를 끼운다(`adoptManifest` — 에디터와
 * 같은 함수) → `.wb-export-canvas` 에 그린다(`mountExportDocument`) → 준비 신호(`ready.ts`). 테마를 못 쓰면 기본 뷰로 그리고 까닭을
 * 상태 줄과 `data-wb-failed` 에 적는다 — 준비 신호는 그래도 선다(PPTX 가 한도까지 기다리지 않고 그 장을 건너뛴다).
 *
 * **테마를 못 쓰면 테마 시트를 뗀다** — 캔버스와 같다(spec 「캔버스 iframe」 의 «번들이 실패하면 `theme` 을 뺀다»). 기본 뷰에 테마 CSS
 * 가 얹히면 어느 쪽도 아닌 화면이 된다.
 *
 * **화면 상태는 주소 해시가 든다**(`#state=<id>` — `STATE_HASH_PREFIX`). 처음 그릴 때 해시의 상태로 그리고, 셸의 전환기를 고르면 다시
 * 그리며 해시를 바꿔 쓴다(`replaceState` — 상태 전환은 이동이 아니라 뒤로 가기가 그것을 하나씩 밟지 않는다). 해시가 바뀌면(주소를 고침 ·
 * 같은 페이지의 링크) 그 상태로 다시 그린다. 목록에 없는 id 는 기본이다 — 렌더러도 기본으로 그리지만(`renderDocument`) 전환기가 그 id 를
 * 못 고르므로 여기서 먼저 기본으로 접는다. **`#state=` 아닌 해시(번호 닻 · 화면 모드)는 상태를 안 건드린다** — 같은 장의 번호 토큰을 누르면
 * 해시가 바뀌는데 그것이 고른 상태를 기본으로 되돌리면 안 된다. 빈 해시는 기본이다(뒤로 가기로 해시가 빠진 판).
 *
 * **번호 닻 해시(`#wb-marker-<nodeId>` — 코멘트 토큰의 번들 주소)로 열리거나 해시가 그리로 바뀌면 «코멘트» 탭을 고르고 그 줄로 굴린다** — 탭은
 * 라디오 + CSS 라 그 줄이 닫힌 탭 안이면 브라우저의 해시 이동이 아무것도 못 보인다. 그 노드의 줄이 없으면(코멘트가 다 지워져 번호가 걷힌 노드)
 * 목업의 그 노드로 굴린다 — 그 노드도 지금 상태에 안 그려졌으면 아무것도 안 한다(장 머리에 남는다). 스크립트가 없는 판은 장 머리다.
 */
import { NO_THEME } from '@wirebound/renderer'
import { DEFAULT_VIEW_STATE, indexCodes, type PageDocument } from '@wirebound/schema'
import type { ThemeDefinition } from '@wirebound/theme-sdk'
import { adoptManifest, type RuntimeHandle } from '@wirebound/theme-sdk/runtime'
import { tokenValues } from '@wirebound/themes'
import {
  COMMENTS_TAB_RADIO_ID,
  MARKER_ANCHOR_PREFIX,
  PAGE_DATA_ID,
  SCREEN_HASH,
  STATE_HASH_PREFIX,
  STATE_SELECT_ID,
  THEME_SCRIPT_ID,
  type ExportPageData,
} from '../page-data'
import { mountExportDocument, type ExportMount } from './mount'
import { FAILED_ATTRIBUTE, fontsSettled, imagesSettled, nextFrame, READY_ATTRIBUTE, SCREEN_CLASS, sheetSettled } from './ready'

/** 셸이 테마 시트 link 에 다는 표지(`bundle/shell.tsx`). */
export const THEME_SHEET_SELECTOR = 'link[data-wb-sheet="theme"]'

export interface BootEnv {
  window: Window
  /** `installRuntime(window)` 의 손잡이 — 테마 번들의 등록을 받는다. */
  runtime: RuntimeHandle
  /** 링크로 옮긴다. 기본은 `window.location.assign`. */
  navigate?: (href: string) => void
}

/** 세운 결과 — 케이스가 읽는다. */
export interface BootResult {
  /** 까닭들. 비면 정상이다. */
  failures: string[]
  mount: ExportMount | null
}

export async function boot(env: BootEnv): Promise<BootResult> {
  const win = env.window
  const doc = win.document
  const html = doc.documentElement
  if (win.location.hash === SCREEN_HASH) html.classList.add(SCREEN_CLASS)

  const failures: string[] = []
  const finish = async (mount: ExportMount | null): Promise<BootResult> => {
    if (failures.length > 0) html.setAttribute(FAILED_ATTRIBUTE, failures.join(' · '))
    await fontsSettled(doc)
    await imagesSettled(doc)
    mount?.remeasure()
    await nextFrame(win)
    html.setAttribute(READY_ATTRIBUTE, '')
    return { failures, mount }
  }

  try {
    const canvas = doc.querySelector('.wb-export-canvas')
    const status = doc.querySelector('.wb-export-status')
    const data = readPageData(doc)
    if (canvas === null || data === null) {
      failures.push(canvas === null ? '목업 자리를 찾지 못했습니다' : '페이지 데이터를 읽지 못했습니다')
      if (status !== null) say(status, failures)
      return await finish(null)
    }

    let theme: ThemeDefinition = NO_THEME
    let tokens: Record<string, string | number> = {}
    if (data.themeRef !== null && data.manifest !== null) {
      tokens = tokenValues(data.manifest, data.tokens)
      const script = doc.getElementById(THEME_SCRIPT_ID)
      const registered = script === null ? null : env.runtime.take(script)
      if (registered === null) {
        failures.push(`테마 번들이 등록하지 않았습니다(${data.themeRef.themeId}@${data.themeRef.version})`)
      } else {
        const adopted = adoptManifest(registered, data.manifest)
        if (adopted.ok) theme = adopted.definition
        else failures.push(adopted.reason)
      }
      if (failures.length > 0) doc.querySelector(THEME_SHEET_SELECTOR)?.remove()
    }

    const states = stateIds(data.document)
    /** 상호작용이 바꾼 상태를 셸에 싣는다 — 전환기를 걸고 나서 채운다(`wireStatePicker`). */
    let reflect: (state: string | null) => void = () => {}
    const mount = mountExportDocument(canvas, {
      onViewState: (state) => reflect(state),
      viewState: stateFromHash(win.location.hash, states),
      document: data.document,
      theme,
      tokens,
      window: win,
      hrefs: data.hrefs,
      markers: data.markers,
      images: data.images ?? {},
      popups: data.popups ?? {},
      ...(data.codes === undefined ? {} : { codes: indexCodes(data.codes) }),
      status,
      standing: failures,
      ...(env.navigate === undefined ? {} : { navigate: env.navigate }),
    })
    const picker = wireStatePicker(win, mount, states)
    reflect = picker.reflect
    const unwire = picker.unwire
    const unfollow = wireMarkerHash(win, canvas)
    const unmount = mount.unmount
    mount.unmount = () => {
      unwire()
      unfollow()
      unmount()
    }
    if (mount.thrown.length > 0) {
      failures.push(`테마 뷰가 던졌습니다: ${mount.thrown.join(', ')}`)
      mount.say(failures)
    }

    await sheetSettled(doc.querySelector<HTMLLinkElement>(THEME_SHEET_SELECTOR), win)
    mount.remeasure()
    // 시트가 서서 자리가 굳은 뒤에 굴린다 — 그 앞에 굴리면 뒤에 실린 시트가 줄을 밀어낸다.
    followMarkerHash(win, canvas)
    return await finish(mount)
  } catch (error) {
    failures.push(`번들 페이지를 세우지 못했습니다: ${error instanceof Error ? error.message : String(error)}`)
    return await finish(null)
  }
}

/** 문서의 상태 id 들. 목록이 없거나 모양이 틀리면 비어 있다 — 그러면 모든 해시가 기본이다. */
function stateIds(document: PageDocument): Set<string> {
  const ids = new Set<string>()
  if (!Array.isArray(document.viewStates)) return ids
  for (const state of document.viewStates) if (typeof state?.id === 'string') ids.add(state.id)
  return ids
}

/** 해시의 상태 — `#state=<id>` 이고 그 id 가 목록에 있을 때만. 아니면 기본(`null`). */
function stateFromHash(hash: string, ids: ReadonlySet<string>): string | null {
  if (!hash.startsWith(STATE_HASH_PREFIX)) return null
  let id: string
  try {
    id = decodeURIComponent(hash.slice(STATE_HASH_PREFIX.length))
  } catch {
    return null
  }
  return ids.has(id) ? id : null
}

/**
 * 셸의 전환기(상태 목록이 있는 페이지만 싣는다)와 주소 해시를 마운트에 잇는다. 전환기가 없으면 아무것도 안 건다. 건 것을 거두는 함수(`unwire`)
 * 를 낸다 — 마운트를 내리면 함께 거둔다(케이스가 한 창에서 여러 번 세운다). `reflect` 는 상호작용이 바꾼 상태를 전환기와 해시에 싣는다 —
 * 전환기로 고른 것과 같은 주소가 된다(해시를 바꿔 써도 `hashchange` 는 안 난다 — `replaceState`). 화면 모드에서는 해시를 안 쓴다.
 */
function wireStatePicker(
  win: Window,
  mount: ExportMount,
  ids: ReadonlySet<string>,
): { unwire: () => void; reflect: (state: string | null) => void } {
  const writeHash = (state: string | null): void => {
    const { pathname, search } = win.location
    win.history.replaceState(
      win.history.state,
      '',
      state === null ? `${pathname}${search}` : `${STATE_HASH_PREFIX}${encodeURIComponent(state)}`,
    )
  }
  const found = win.document.getElementById(STATE_SELECT_ID)
  // 전환기가 없는 페이지(상태 목록이 없다)는 기본으로만 바뀐다 — 그대로라 해시(번호 닻 따위)를 안 건드린다.
  if (found === null || found.tagName !== 'SELECT') return { unwire: () => {}, reflect: () => {} }
  const select = found as HTMLSelectElement
  select.value = stateFromHash(win.location.hash, ids) ?? DEFAULT_VIEW_STATE
  const onChange = (): void => {
    const state = ids.has(select.value) ? select.value : null
    mount.setViewState(state)
    writeHash(state)
  }
  const onHash = (): void => {
    const hash = win.location.hash
    if (hash !== '' && hash !== '#' && !hash.startsWith(STATE_HASH_PREFIX)) return
    const state = stateFromHash(hash, ids)
    select.value = state ?? DEFAULT_VIEW_STATE
    mount.setViewState(state)
  }
  select.addEventListener('change', onChange)
  win.addEventListener('hashchange', onHash)
  return {
    unwire: () => {
      select.removeEventListener('change', onChange)
      win.removeEventListener('hashchange', onHash)
    },
    reflect: (state) => {
      select.value = state ?? DEFAULT_VIEW_STATE
      // 화면 모드(`#wb-screen` — PPTX 를 찍는 판 · 셸과 전환기가 숨는다)의 해시를 덮으면 새로고침이 셸을 세운다 — 전환기 값만 싣는다.
      if (!win.document.documentElement.classList.contains(SCREEN_CLASS)) writeHash(state)
    },
  }
}

/** 해시가 번호 닻이면 그 노드 id. 아니면 `null`. */
function markerFromHash(hash: string): string | null {
  const prefix = `#${MARKER_ANCHOR_PREFIX}`
  if (!hash.startsWith(prefix)) return null
  try {
    return decodeURIComponent(hash.slice(prefix.length))
  } catch {
    return null
  }
}

/** 머리말 «번호 닻 해시». */
function followMarkerHash(win: Window, canvas: Element): void {
  const nodeId = markerFromHash(win.location.hash)
  if (nodeId === null) return
  const doc = win.document
  const row = doc.getElementById(`${MARKER_ANCHOR_PREFIX}${nodeId}`)
  if (row !== null) {
    const radio = doc.getElementById(COMMENTS_TAB_RADIO_ID)
    // 다른 창(realm)의 요소라 `instanceof` 를 안 쓴다 — 케이스는 jsdom 창을 넘긴다.
    if (radio !== null && radio.tagName === 'INPUT') (radio as HTMLInputElement).checked = true
    // jsdom 에는 없다(케이스 판) — 없으면 탭만 고른다.
    row.scrollIntoView?.({ block: 'center' })
    return
  }
  for (const element of Array.from(canvas.querySelectorAll('[data-wb-id]'))) {
    if (element.getAttribute('data-wb-id') !== nodeId) continue
    element.scrollIntoView?.({ block: 'center' })
    return
  }
}

function wireMarkerHash(win: Window, canvas: Element): () => void {
  const onHash = (): void => followMarkerHash(win, canvas)
  win.addEventListener('hashchange', onHash)
  return () => win.removeEventListener('hashchange', onHash)
}

function readPageData(doc: Document): ExportPageData | null {
  const node = doc.getElementById(PAGE_DATA_ID)
  if (node === null) return null
  try {
    return JSON.parse(node.textContent ?? '') as ExportPageData
  } catch {
    return null
  }
}

/** 그리기 전의 실패 — 마운트가 없어 상태 줄을 손으로 쓴다(`mount.tsx` 와 같은 모양). */
function say(status: Element, lines: readonly string[]): void {
  status.textContent = ''
  for (const line of lines) {
    const item = status.ownerDocument.createElement('p')
    item.className = 'wb-export-status-line'
    item.textContent = line
    status.appendChild(item)
  }
  if (lines.length === 0) status.setAttribute('hidden', '')
  else status.removeAttribute('hidden')
}
