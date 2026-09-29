/**
 * **테마 번들(`theme.js`)을 싣는다** — 프로젝트가 고정한 `id@버전` 의 정의(`ThemeDefinition`)를 받아 캔버스 · 미리보기가 그린다.
 *
 * # 적재 realm — 캔버스 iframe 이 아니라 숨은 iframe 하나
 *
 * 호스트 문서에 **숨은 `about:blank` iframe 하나**(`wb-shell-bundle-realm`)를 두고 그 창에 `installRuntime` 한 뒤 `<script>` 로 싣는다.
 *
 * - **캔버스 iframe 에 싣지 않는 까닭:** 캔버스 iframe 은 페이지를 옮길 때마다 새로 서므로 번들을 매번 다시 실행하게 된다.
 * - **정의는 어느 iframe 에 그려도 같다.** 뷰 함수는 런타임이 준 **호스트의** React · SDK 로 지어지고(spec `2026-09-27-code-themes-design.md`
 *   「`.wbtheme` 파일」 의 «공유 런타임»), 호스트가 캔버스 · 미리보기 iframe 에 portal 로 그린다.
 * - **번들의 최상위 코드는 이 realm 에서만 돈다** — 에디터 문서를 칠하지 않는다(테마 번들은 신뢰 코드라 샌드박스는 아니다 — spec
 *   「인스턴스 관리자」). 대가: 뷰가 `window` 를 읽으면 이 realm 의 창을 본다 — 캔버스의 창은 SDK 의 `useWindow()` 로 받는다(SDK 계약).
 *
 * # 캐시와 한도
 *
 * - 같은 `ref` 는 한 번만 싣는다(진행 중 약속을 나눠 쓴다). `ok` 는 캐시하고 `failed` 는 캐시하지 않는다 — «다시 불러오기» 가 다시
 *   싣는다(`forget` 은 `ok` 도 걷는다). 파일 응답이 `immutable` 이라 두 번째 적재부터는 브라우저 캐시에서 온다.
 * - `error` 이벤트 · 등록 없음(`take()` 가 `null`) · `BUNDLE_DEADLINE_MS` 지남 → `failed` 와 까닭 문장.
 * - **등록은 `load` 이벤트 안에서 곧바로 받는다.** 외부 스크립트는 실행을 마친 그 자리에서 `load` 를 쏘므로(HTML 「execute the script
 *   element」) 여러 판이 한 realm 에 섞여 실려도 방금 돈 스크립트의 등록을 받는다. 한도 뒤에 늦게 돈 스크립트의 등록도 그 `load` 에서
 *   비워 버린다 — 안 비우면 다음 적재가 그것을 제 정의로 받는다.
 * - **그 `load` 를 낸 스크립트의 등록만 받는다**(`take(script)` — 런타임이 등록마다 `currentScript` 를 적는다). 스크립트가 끝난 뒤에
 *   미룬 등록(`setTimeout`)은 제 `load` 를 놓치고 칸에 남는데, 다음 번들의 `load` 가 그것을 버린다 — 등록하지 않는 번들이 앞 번들의 뷰로
 *   «성공» 하지 않게.
 */
import type { ThemeDefinition } from '@wirebound/theme-sdk'
import { installRuntime, type RuntimeHandle } from '@wirebound/theme-sdk/runtime'
import type { ThemeRef } from '../api/types'

export type { ThemeRef } from '../api/types'

export type BundleResult = { status: 'ok'; definition: ThemeDefinition } | { status: 'failed'; reason: string }

export interface ThemeBundleLoader {
  load(ref: ThemeRef): Promise<BundleResult>
  forget(ref: ThemeRef): void
}

/** 번들 하나를 기다리는 한도. 넘으면 캔버스는 기본 뷰로 그리고 알린다(`theme/project-theme.tsx`). */
export const BUNDLE_DEADLINE_MS = 10_000

/** 판 안 파일의 주소(api `GET /api/theme-packages/:id/:version/files/*`). */
export function themeFileUrl(ref: ThemeRef, file: string): string {
  return `/api/theme-packages/${encodeURIComponent(ref.themeId)}/${encodeURIComponent(ref.version)}/files/${file}`
}

export function refKey(ref: ThemeRef): string {
  return `${ref.themeId}@${ref.version}`
}

export function createScriptBundleLoader(host: Document = document, deadlineMs: number = BUNDLE_DEADLINE_MS): ThemeBundleLoader {
  const cache = new Map<string, Promise<BundleResult>>()
  let realm: { window: Window; document: Document; runtime: RuntimeHandle } | null = null

  function openRealm(): NonNullable<typeof realm> {
    // 떼인 realm(호스트 문서가 다시 섰다)은 버리고 새로 연다.
    if (realm !== null && realm.window.document === realm.document && realm.document.defaultView !== null) return realm
    const frame = host.createElement('iframe')
    frame.className = 'wb-shell-bundle-realm'
    frame.setAttribute('aria-hidden', 'true')
    frame.tabIndex = -1
    frame.title = '테마 번들'
    host.body.appendChild(frame)
    const win = frame.contentWindow!
    const doc = frame.contentDocument!
    // about:blank 은 브라우저마다 빈 head 를 갖기도, 안 갖기도 한다(`canvas/canvas-iframe.tsx` 와 같은 판단).
    if (doc.head === null) {
      doc.open()
      doc.write('<!doctype html><html><head></head><body></body></html>')
      doc.close()
    }
    realm = { window: win, document: doc, runtime: installRuntime(win as unknown as typeof globalThis) }
    return realm
  }

  function inject(ref: ThemeRef): Promise<BundleResult> {
    const { document: doc, runtime } = openRealm()
    const name = refKey(ref)
    return new Promise((resolve) => {
      let settled = false
      const settle = (result: BundleResult): void => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve(result)
      }
      const script = doc.createElement('script')
      script.addEventListener('load', () => {
        // 늦게 돈 스크립트여도 등록은 비운다(머리말 «등록은 load 이벤트 안에서 곧바로» · «그 load 를 낸 스크립트의 등록만»).
        const definition = runtime.take(script)
        settle(definition === null ? { status: 'failed', reason: `테마 번들이 등록하지 않았습니다(${name})` } : { status: 'ok', definition })
      })
      script.addEventListener('error', () => settle({ status: 'failed', reason: `테마 번들을 받지 못했습니다(${name})` }))
      const timer = setTimeout(
        () => settle({ status: 'failed', reason: `테마 번들이 ${Math.round(deadlineMs / 1000)}초 안에 오지 않았습니다(${name})` }),
        deadlineMs,
      )
      // realm 은 about:blank 이라 상대 주소를 호스트 문서 기준의 절대 주소로 바꿔 싣는다.
      script.src = new URL(themeFileUrl(ref, 'theme.js'), host.baseURI).href
      doc.head.appendChild(script)
    })
  }

  return {
    load(ref) {
      const key = refKey(ref)
      const hit = cache.get(key)
      if (hit !== undefined) return hit
      const pending = inject(ref).then((result) => {
        // 실패는 캐시하지 않는다 — «다시 불러오기» 가 새 스크립트를 붙인다. 그 사이 `forget` 이 걷었으면 남의 것을 지우지 않는다.
        if (result.status === 'failed' && cache.get(key) === pending) cache.delete(key)
        return result
      })
      cache.set(key, pending)
      return pending
    },
    forget(ref) {
      cache.delete(refKey(ref))
    },
  }
}
