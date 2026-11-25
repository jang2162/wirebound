/**
 * **번들 페이지와 내보내기 런타임 사이의 계약** — 페이지가 싣는 JSON 의 모양과 두 쪽이 함께 쓰는 이름.
 *
 * Node 쪽(`bundle/index.ts` 가 짓는다)과 브라우저 쪽(`browser/boot.tsx` 가 읽는다)이 이 파일 하나를 본다. DOM 을 모르고 값만 둔다 —
 * 두 `tsconfig`(`tsconfig.json` · `tsconfig.runtime.json`)가 함께 든다.
 */
import type { CodeTable, LayoutNavMenu, PageDocument } from '@wirebound/schema'
import type { ThemeManifest } from '@wirebound/theme-sdk'

/** 페이지 JSON 을 실은 `<script type="application/json">` 의 id. */
export const PAGE_DATA_ID = 'wb-export-page'

/** 테마 번들(`assets/theme/theme.js`)을 싣는 `<script>` 의 id — 런타임이 그 스크립트의 등록만 받는다(`take(script)`). */
export const THEME_SCRIPT_ID = 'wb-export-theme'

/** 런타임이 세우는 전역 — 페이지의 인라인 스크립트가 `boot()` 를 부른다. */
export const EXPORT_GLOBAL = '__wirebound_export__'

/** 이 해시로 열면 화면 모드다 — 셸을 숨기고 목업만 남긴다(PPTX 가 찍는 판). */
export const SCREEN_HASH = '#wb-screen'

/**
 * 화면 상태 전환기(`<select>`)의 id — 상태 목록이 있는 페이지만 싣는다(`bundle/shell.tsx`). 값은 `default`(기본) 또는 상태 id 다.
 */
export const STATE_SELECT_ID = 'wb-export-state'

/**
 * 고른 화면 상태를 싣는 주소 해시의 머리 — `#state=<id>`(id 는 `encodeURIComponent`). 기본은 해시를 비운다. 목록에 없는 id 는 기본으로
 * 그린다(런타임 `browser/boot.tsx`).
 */
export const STATE_HASH_PREFIX = '#state='

/**
 * 코멘트 칸 번호 줄의 닻 머리 — `#wb-marker-<nodeId>`(`bundle/comments.ts` 의 `markerAnchor` · 코멘트 토큰의 번들 주소). 런타임이 이 해시로 «코멘트» 탭을
 * 열고 그 줄로 굴린다(`browser/boot.tsx`).
 */
export const MARKER_ANCHOR_PREFIX = 'wb-marker-'

/** «코멘트» 탭의 라디오 id(`bundle/shell.tsx` 의 `radioId('comments')`) — 탭은 라디오 + CSS 라 이것을 골라야 그 칸이 보인다. */
export const COMMENTS_TAB_RADIO_ID = 'wb-export-tab-comments'

/**
 * 번들의 내비가 사는 자리 — 서브페이지 틀(GNB · LNB · 브레드크럼브)이 읽는 메뉴 트리와 페이지 경로를 **번들에 한 벌** 싣는다(`ExportNav`). 장마다 트리를
 * 실으면 장 수 × 트리 크기로 자란다. `file://` 로도 열리도록 JSON 이 아니라 전역을 세우는 일반 스크립트다(`EXPORT_NAV_GLOBAL`).
 */
export const NAV_JS_PATH = 'assets/nav.js'

/** `assets/nav.js` 가 세우는 전역 — 런타임이 읽는다(`browser/boot.tsx`). */
export const EXPORT_NAV_GLOBAL = '__wirebound_export_nav__'

/** 번들 한 벌의 내비(`assets/nav.js`). */
export interface ExportNav {
  /** 메뉴 트리 — `buildLayoutNav` 의 입력. 페이지마다 `layout` 을 든다(팝업은 내비에 안 선다). */
  menu: LayoutNavMenu[]
  /** 페이지 id → 그 장 파일의 번들 안 경로(`pages/….html` — 인코딩 전). 장은 제 자리(`ExportPageData.path`)에서 본 상대 경로로 바꿔 링크로 쓴다. */
  paths: Record<string, string>
}

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
  /**
   * 이 장의 페이지 id — 내비(`ExportNav`)에서 지금 페이지를 찾는 열쇠다. 장은 트리를 싣지 않고 이것만 든다. 없으면(`BundlePage.id` 를 안 준 번들) `null` 이고
   * 틀의 내비는 «트리에 없는 페이지» 판이다(`buildLayoutNav`).
   */
  pageId: string | null
  /** 페이지의 제목 그대로(`BundlePage.pageTitle`) — 틀의 제목 영역 · 트리에 없는 페이지의 브레드크럼브가 쓴다. `title` 은 조상이 붙은 번들 이름이다. */
  pageTitle: string
  /** 이 파일의 번들 안 경로(`index.html` · `pages/….html`) — 내비의 경로(`ExportNav.paths`)를 여기서 본 상대 경로로 바꿔 틀 링크의 `href` 를 짓는다. */
  path: string
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
  /**
   * 이 문서가 든 그림 id → **이 파일에서 본** 상대 경로(`assets/images/<id>.<확장자>`). 번들에 안 실린 그림(그 프로젝트가 안 가진 id)은 키가 없다 —
   * 런타임의 `assetUrl` 이 `null` 을 내 «그림을 불러올 수 없음» 표지가 선다. 실린 그림이 없는 페이지는 키째 없다 — 그림 없는 번들의 바이트가 그대로다.
   */
  images?: Record<string, string>
  /**
   * 이 페이지에서 «팝업 열기»(`openModal`)로 닿는 팝업 페이지의 문서 — 타겟 → 문서 · 그림 경로. 팝업이 연 팝업까지 닫힌 셈으로 한 벌씩 싣는다.
   * 번들은 `file://` 로도 열려 다른 파일을 읽을 수 없으므로 싣는다. 키가 없는 타겟(화면 페이지 · 둘 이상 · 없는 페이지)은 `hrefs` 의 길을
   * 그대로 간다. 닿는 팝업이 없으면 키째 없다 — 팝업 없는 번들의 바이트가 그대로다.
   */
  popups?: Record<string, ExportPopup>
  /**
   * 프로젝트의 공통코드 표 — 런타임이 묶인 노드를 표의 이름으로 그린다(`RenderOptions.codes`). 이 페이지 · 실린 팝업이 같은 표를 쓴다.
   * 표가 빈 프로젝트는 키째 없다 — 공통코드 없는 번들의 바이트가 그대로다.
   */
  codes?: CodeTable
}

/** 번들 페이지에 실은 팝업 하나(`ExportPageData.popups`). */
export interface ExportPopup {
  document: PageDocument
  /** 그 문서가 든 그림 id → **여는 파일에서 본** 상대 경로. 없으면 키째 없다. */
  images?: Record<string, string>
}

/** 번들 안 그림의 자리 — `assets/images/<id>.<확장자>`. */
export const IMAGES_DIRECTORY = 'assets/images'
