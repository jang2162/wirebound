export const PACKAGE_NAME = '@wirebound/exporter'

export type { ExportPageOptions, ExportedPage } from './page'
export { exportPage } from './page'

// P8-2 — §11.3의 번들. `exportPage`가 페이지 한 장이고 이것이 그 위의 파일 트리다.
export type {
  BundleComment,
  BundleFile,
  BundleNodeError,
  BundlePage,
  ExportBundleOptions,
  ExportedBundle,
} from './bundle/index'
export { exportBundle } from './bundle/index'

// P8-1 델타 리뷰 — **이월의 스니펫이 아니라 함수로 둔다.** `<script>`에 데이터를 심는 자리는
// P8-3이 만들지만, 규칙을 문서에 두면 다음 사람이 복사한다(그리고 앞 판의 스니펫은 실제로
// 틀려 있었다). 근거는 그 파일의 머리말에 있다.
export { scriptJson } from './script-json'

// P10-1 — §15의 P10. `exportBundle`이 §11.3의 번들이고 이것이 보고용 산출물이다.
// **파트 목록을 낼 뿐 zip을 만들지 않는다** — 그 이유는 `pptx/index.ts`의 D1 절에 있다.
export type {
  ExportPptxOptions,
  ExportedPptx,
  PptxPage,
  PptxPart,
  PptxScreen,
} from './pptx/index'
export { exportPptx, NO_SCREEN } from './pptx/index'
