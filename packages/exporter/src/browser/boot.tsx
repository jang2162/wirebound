/**
 * **번들 페이지 하나를 세운다** — 페이지의 인라인 스크립트가 `__wirebound_export__.boot()` 로 부른다(`runtime.tsx`).
 *
 * 차례: 페이지 JSON 을 읽는다 → 테마 번들의 등록을 받아(`take(#wb-export-theme)`) 서버 manifest 를 끼운다(`adoptManifest` — 에디터와
 * 같은 함수) → `.wb-export-canvas` 에 그린다(`mountExportDocument`) → 준비 신호(`ready.ts`). 테마를 못 쓰면 기본 뷰로 그리고 까닭을
 * 상태 줄과 `data-wb-failed` 에 적는다 — 준비 신호는 그래도 선다(PPTX 가 한도까지 기다리지 않고 그 장을 건너뛴다).
 *
 * **테마를 못 쓰면 테마 시트를 뗀다** — 캔버스와 같다(spec 「캔버스 iframe」 의 «번들이 실패하면 `theme` 을 뺀다»). 기본 뷰에 테마 CSS
 * 가 얹히면 어느 쪽도 아닌 화면이 된다.
 */
import { NO_THEME } from '@wirebound/renderer'
import type { ThemeDefinition } from '@wirebound/theme-sdk'
import { adoptManifest, type RuntimeHandle } from '@wirebound/theme-sdk/runtime'
import { tokenValues } from '@wirebound/themes'
import { PAGE_DATA_ID, SCREEN_HASH, THEME_SCRIPT_ID, type ExportPageData } from '../page-data'
import { mountExportDocument, type ExportMount } from './mount'
import { FAILED_ATTRIBUTE, fontsSettled, nextFrame, READY_ATTRIBUTE, SCREEN_ATTRIBUTE, sheetSettled } from './ready'

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
  if (win.location.hash === SCREEN_HASH) html.setAttribute(SCREEN_ATTRIBUTE, '')

  const failures: string[] = []
  const finish = async (mount: ExportMount | null): Promise<BootResult> => {
    if (failures.length > 0) html.setAttribute(FAILED_ATTRIBUTE, failures.join(' · '))
    await fontsSettled(doc)
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

    const mount = mountExportDocument(canvas, {
      document: data.document,
      theme,
      tokens,
      window: win,
      hrefs: data.hrefs,
      markers: data.markers,
      status,
      standing: failures,
      ...(env.navigate === undefined ? {} : { navigate: env.navigate }),
    })
    if (mount.thrown.length > 0) {
      failures.push(`테마 뷰가 던졌습니다: ${mount.thrown.join(', ')}`)
      mount.say(failures)
    }

    await sheetSettled(doc.querySelector<HTMLLinkElement>(THEME_SHEET_SELECTOR), win)
    mount.remeasure()
    return await finish(mount)
  } catch (error) {
    failures.push(`번들 페이지를 세우지 못했습니다: ${error instanceof Error ? error.message : String(error)}`)
    return await finish(null)
  }
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
