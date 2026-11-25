import type { ExamplePageId } from '@wirebound/theme-gallery'
import type { ThemeManifest } from '@wirebound/theme-sdk'

/** 미리보기 보기 — 웹의 테마 미리보기(`apps/web/src/settings/theme-preview.tsx`)와 같은 둘. */
export type PreviewView = 'components' | 'examples'

/** 셸이 프레임에 보내는 지금의 값 — 토큰(기본값과 다른 것만) · 겹쳐 보기 · 보기 · 예제 장 · 예제 틀에서 끈 영역. */
export interface FrameState {
  type: 'wb-state'
  tokens: Record<string, string | number>
  overlay: boolean
  view: PreviewView
  page: ExamplePageId
  /** 예제 장(서브페이지)의 틀에서 끈 영역 id — manifest `layouts.subpage.regions` 가운데 끌 수 있는 것. */
  hiddenRegions: string[]
}

/** 예제 안의 이동이 장을 바꿨다 — 셸의 장 이름 줄이 따라간다. */
export interface FramePage {
  type: 'wb-page'
  page: ExamplePageId
}

/**
 * 프레임 주소의 질의 — `?layout=list` 면 «한 줄에 하나» 목록 판 갤러리만 그리고 셸의 보기를 안 따른다(`wb-theme shots` 가 연다 · 칸 폭이 창 폭이어야
 * 창 폭 넘침을 재는 관문의 뜻이 선다). 없으면 셸이 고른 보기(«컴포넌트» 는 그룹 격자).
 */
export const LIST_LAYOUT_QUERY = 'layout=list'

/**
 * 프레임이 (다시) 섰다 — 셸이 지금의 값을 다시 보낸다. 뷰를 고쳐 프레임이 다시 실려도 토큰이 이어진다. 예제의 장 목록(`EXAMPLE_PAGES` 의 id ·
 * 제목)을 싣는다 — **셸은 `@wirebound/theme-gallery` 를 import 하지 않는다**: 하면 클라이언트 빌드가 갤러리 · 렌더러를 셸 · 프레임 공용 조각에 묶고
 * 그 조각이 SDK 를 끌어와, dev 서버가 셸 페이지(react 새로 고침 프리앰블이 없다)에서 SDK 소스를 새로 고침 꼴로 바꿔 셸이 죽는다
 * («@vitejs/plugin-react can't detect preamble» — `build-test/dev.test.ts` 가 프레임을 못 찾는다).
 */
export interface FrameReady {
  type: 'wb-frame-ready'
  pages: { id: ExamplePageId; title: string }[]
}

export interface ProjectIssue {
  code: string
  path: string
  message: string
}

/** 서버가 셸에 주는 프로젝트 상태(`/__wb/project` · `/__wb/events`). 설정이 틀리면 `manifest` 는 마지막으로 지난 것이다. */
export interface ProjectState {
  manifest: ThemeManifest | null
  issues: ProjectIssue[]
}

export const PROJECT_PATH = '/__wb/project'
export const EVENTS_PATH = '/__wb/events'
