export const PACKAGE_NAME = '@wirebound/exporter'

export type { ExportPageOptions, ExportedPage } from './page'
export { exportPage } from './page'

// 설계서 「HTML 정적 번들」. `exportPage`가 페이지 한 장이고 이것이 그 위의 파일 트리다.
export type {
  BundleComment,
  BundleFile,
  BundleNodeError,
  BundlePage,
  BundleTheme,
  ExportBundleOptions,
  ExportedBundle,
} from './bundle/index'
export { exportBundle } from './bundle/index'

// **문서의 스니펫이 아니라 함수로 둔다.** `<script>`에 데이터를 심는 규칙을 문서에 두면 다음
// 사람이 복사하고, 복사된 스니펫은 어떤 검사도 지키지 않는다. 근거는 그 파일의 머리말에 있다.
export { scriptJson } from './script-json'

// 설계서 「로드맵」의 PPTX. `exportBundle`이 「HTML 정적 번들」이고 이것이 보고용 산출물이다.
// **파트 목록을 낼 뿐 zip을 만들지 않는다** — 그 이유는 `pptx/index.ts`의 「파일 시스템도 zip도
// 모른다」 절에 있다.
export type {
  ExportPptxOptions,
  ExportedPptx,
  PptxPage,
  PptxPart,
  PptxScreen,
} from './pptx/index'
export { exportPptx, NO_SCREEN } from './pptx/index'
