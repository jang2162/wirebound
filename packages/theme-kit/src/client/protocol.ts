import type { ThemeManifest } from '@wirebound/theme-sdk'

/** 셸이 프레임에 보내는 지금의 값 — 토큰(기본값과 다른 것만)과 겹쳐 보기. */
export interface FrameState {
  type: 'wb-state'
  tokens: Record<string, string | number>
  overlay: boolean
}

/** 프레임이 (다시) 섰다 — 셸이 지금의 값을 다시 보낸다. 뷰를 고쳐 프레임이 다시 실려도 토큰이 이어진다. */
export interface FrameReady {
  type: 'wb-frame-ready'
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
