/**
 * **번들 페이지와 내보내기 런타임 사이의 계약** — 페이지가 싣는 JSON 의 모양과 두 쪽이 함께 쓰는 이름.
 *
 * Node 쪽(`bundle/index.ts` 가 짓는다)과 브라우저 쪽(`browser/boot.tsx` 가 읽는다)이 이 파일 하나를 본다. DOM 을 모르고 값만 둔다 —
 * 두 `tsconfig`(`tsconfig.json` · `tsconfig.runtime.json`)가 함께 든다.
 */
import type { PageDocument } from '@wirebound/schema'
import type { ThemeManifest } from '@wirebound/theme-sdk'

/** 페이지 JSON 을 실은 `<script type="application/json">` 의 id. */
export const PAGE_DATA_ID = 'wb-export-page'

/** 테마 번들(`assets/theme/theme.js`)을 싣는 `<script>` 의 id — 런타임이 그 스크립트의 등록만 받는다(`take(script)`). */
export const THEME_SCRIPT_ID = 'wb-export-theme'

/** 런타임이 세우는 전역 — 페이지의 인라인 스크립트가 `boot()` 를 부른다. */
export const EXPORT_GLOBAL = '__wirebound_export__'

/** 이 해시로 열면 화면 모드다 — 셸을 숨기고 목업만 남긴다(PPTX 가 찍는 판). */
export const SCREEN_HASH = '#wb-screen'

/** 번들 안에서 런타임이 사는 자리. */
export const RUNTIME_JS_PATH = 'assets/runtime.js'

/** 번들 안에서 테마 패키지 파일이 사는 디렉터리 — 패키지를 한 디렉터리처럼 그대로 싣는다(spec 「`.wbtheme` 파일」). */
export const THEME_DIRECTORY = 'assets/theme'

/** 코멘트 번호 마커 하나 — 코멘트 탭의 줄과 같은 출처(`bundle/comments.ts` 의 `commentEntries`)에서 짓는다. */
export interface ExportMarker {
  nodeId: string
  /** 화면에 찍을 번호(글자). */
  marker: string
}

/** 페이지 한 장의 JSON — `<script id="wb-export-page">` 에 `scriptJson` 으로 싣는다. */
export interface ExportPageData {
  document: PageDocument
  title: string
  /** 이 페이지를 가리키는 상호작용 타겟. 없으면 `null`. */
  target: string | null
  /** 프로젝트가 고정한 `테마@판`. 없으면(바인딩 없음 · 패키지를 못 읽음) `null` — 런타임이 기본 뷰로 그린다. */
  themeRef: { themeId: string; version: string } | null
  /** 서버 manifest — 번들 정의의 manifest 를 이것으로 바꿔 끼운다(`adoptManifest`). `themeRef` 가 `null` 이면 `null`. */
  manifest: ThemeManifest | null
  /** 프로젝트가 저장한 토큰 값(기본값과 다른 것만). */
  tokens: Record<string, string | number>
  /**
   * 이 문서가 겨누는 타겟 → **이 파일에서 본** 상대 경로. `null` 이면 그 타겟을 든 페이지가 둘 이상이고, 키가 없으면 번들에 없다 —
   * 둘은 읽는 사람이 할 일이 달라 런타임이 다른 문장으로 말한다.
   */
  hrefs: Record<string, string | null>
  markers: ExportMarker[]
}
