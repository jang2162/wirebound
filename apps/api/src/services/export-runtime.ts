/**
 * **내보내기 런타임 `runtime.js` 를 읽어 쥔다** — 번들 페이지가 브라우저에서 목업을 그리는 일반 스크립트(`@wirebound/exporter` 의
 * `dist/runtime.js` — 저장소 빌드가 vite 로 짓는다). exporter 는 파일 시스템을 모르므로 api 가 글자를 읽어 넘긴다(`exportBundle` 의
 * `runtimeJs`).
 *
 * **없으면 기동이 멈춘다**(`buildApp`) — 없이 뜨면 내보낸 번들의 모든 페이지가 빈 목업이다. 시스템 테마 산출물과 같은 꼴이다
 * (`system-themes.ts`).
 *
 * 한 번 읽으면 경로마다 쥐고 다시 읽지 않는다 — 메인과 내보내기 워커가 각자 같은 파일을 읽어 같은 글자를 쓴다(워커는 모듈을 나눠
 * 갖지 않는다 — `export-worker.ts` 의 «워커가 싣는 코드는 메인과 같다»).
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const held = new Map<string, string>()

/** 패키지가 낸 자리(`exports["./runtime.js"]`). 파일이 없으면 풀기가 던진다. */
function defaultPath(): string {
  return createRequire(import.meta.url).resolve('@wirebound/exporter/runtime.js')
}

/** 런타임 글자. 경로를 안 주면 패키지의 것이다. 못 읽으면 까닭(`pnpm build`)과 함께 던진다. */
export function readExportRuntime(path?: string): string {
  let at = path ?? '@wirebound/exporter/runtime.js'
  try {
    at = path ?? defaultPath()
    const hit = held.get(at)
    if (hit !== undefined) return hit
    const text = readFileSync(at, 'utf8')
    held.set(at, text)
    return text
  } catch (error) {
    throw new Error(
      `내보내기 런타임이 없습니다(${at}) — 저장소 뿌리에서 \`pnpm build\` 를 먼저 돌립니다`,
      { cause: error },
    )
  }
}
