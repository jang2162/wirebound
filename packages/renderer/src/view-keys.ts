import { getComponent } from '@wirebound/schema'
import type { ThemeDefinition } from '@wirebound/theme-sdk'

/**
 * **렌더러가 안 읽는 뷰 키** — 렌더러는 `views[노드 타입]` 만 읽는다. 카탈로그에 없는 타입의 뷰는 닿을 노드가 없다.
 * 테마가 그런 키를 정의해도 그리는 데는 아무 일이 없어 작성자가 «내 뷰가 안 쓰인다» 를 화면에서 못 안다.
 *
 * 판정과 문장은 이 한 벌이다 — 작성자 도구(`wb-theme check` — `packages/theme-kit/src/check.ts`)는 오류로 내고 호스트 런타임은 `warnUnusedViewKeys` 로
 * 경고한다. 업로드는 `theme.js` 를 실행하지 않아 서버가 못 본다.
 */
export function unusedViewKeys(views: ThemeDefinition['views']): { key: string; message: string }[] {
  const out: { key: string; message: string }[] = []
  for (const key of Object.keys(views)) {
    if (getComponent(key) === undefined) {
      out.push({ key, message: `views.${key} 는 카탈로그에 없는 타입의 뷰입니다 — 쓰이지 않습니다` })
    }
  }
  return out
}

/** 이미 알린 `views` 객체 — 서버 manifest 를 끼운 사본(`{ ...definition, manifest }`)은 `views` 를 그대로 쥐어 한 번이다. */
const told = new WeakSet<object>()

/**
 * 호스트 런타임(에디터 · 내보낸 번들)이 테마를 처음 그릴 때 안 쓰이는 뷰 키를 `console.warn` 으로 한 번 알린다. 그리는 결과는 안 바꾼다.
 * `views` 가 없거나 객체가 아니면(검증 전 값) 조용히 지나간다 — 렌더러가 던지는 일은 이 자리 몫이 아니다.
 */
export function warnUnusedViewKeys(theme: ThemeDefinition | undefined): void {
  const views: unknown = theme?.views
  if (views === null || typeof views !== 'object' || told.has(views)) return
  told.add(views)
  const label = theme?.manifest === undefined ? '' : `${String(theme.manifest.id)}@${String(theme.manifest.version)} `
  for (const { message } of unusedViewKeys(views as ThemeDefinition['views'])) console.warn(`[wirebound] 테마 ${label}${message}`)
}
