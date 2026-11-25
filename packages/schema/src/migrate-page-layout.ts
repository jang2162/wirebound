/**
 * **문서 판 6 → 7 — 페이지 문서에 레이아웃(`layout`)을 채운다.** 판 6 까지 페이지의 «종류» 는 뿌리 타입이었다(`Popup` = 팝업 · 그 밖 = 화면).
 * 판 7 은 그 판정을 문서 필드 `layout` 으로 옮긴다 — 뿌리 `Popup` 은 팝업 레이아웃의 짝으로 남는다(`validate.ts` 의 `layout-root-mismatch`).
 * 문서가 들어오는 모든 경계가 이 단계를 탄다 — `migrate.ts` 의 `MIGRATIONS` 셋째 줄이고, DB 마이그레이션(`apps/api` 의 `0037-page-layout`)은
 * 이 파일의 `liftPageLayout` 을 직접 부른다.
 *
 * **이 단계는 판 6 → 7 의 뜻으로 얼어 있다 — 고치지 않는다.** 판 6 문서의 화면이 한 픽셀도 안 바뀌는 값을 고른다: 뿌리 `Popup` → `popup`, 그
 * 밖 → `blank`(틀 없음). `subpage` 는 판 6 에 없던 뜻이라 이 단계가 짓지 않는다.
 *
 * 이미 `layout` 을 든 판 6 문서(판 7 꼴을 판 6 으로 적어 보낸 입력)는 아는 값이면 그대로 두고 모르는 값이면 위 규칙으로 덮는다 — 판 6 문서의
 * 뜻은 뿌리가 정하므로 짝이 어긋난 값은 다음 검증(`layout-root-mismatch`)이 말한다.
 */
import { PAGE_LAYOUTS, type PageDocument, type PageLayout } from './node'

/**
 * **판 6 문서의 레이아웃** — 뿌리가 `Popup` 이면 `popup`, 그 밖은 `blank`. 레이아웃을 아직 안 든 문서(판 6 이하 · 검증 전 입력)의 뜻을 읽는
 * 자리(`new-page.ts` 의 `pageLayoutOf`)도 이 규칙 하나를 부른다 — 판 6 의 뜻을 두 벌로 두지 않는다.
 */
export function legacyPageLayout(doc: { root?: { type?: unknown } } | null | undefined): PageLayout {
  return doc?.root?.type === 'Popup' ? 'popup' : 'blank'
}

/** 판 6 → 7 한 단계. 문서를 바꾸지 않고 새 문서를 낸다(뿌리는 같은 객체다 — 사슬이 앞에서 사본을 떴다). */
export function liftPageLayout<T extends PageDocument>(doc: T): T {
  const current = (doc as { layout?: unknown }).layout
  const layout = PAGE_LAYOUTS.includes(current as PageLayout) ? (current as PageLayout) : legacyPageLayout(doc)
  return { ...doc, layout }
}
