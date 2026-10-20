/**
 * 시험용 번들 로더. **jsdom 은 `<script src>` 를 실행하지 않는다** — 캔버스 · 미리보기를 그리는 화면 테스트는 이것을
 * `ThemeBundleProvider` 에 끼운다. 스크립트 적재 자체(realm · 캐시 · 한도)는 `test/theme/bundle-loader.test.ts` 가 경계를, 실브라우저 판이
 * 실물을 잰다.
 */
import { createElement, type ReactElement, type ReactNode } from 'react'
import { ADMIN_FIXTURE } from './admin-theme'
import type { ThemeDefinition } from '@wirebound/theme-sdk'
import type { ProjectThemeView } from '../src/api/types'
import { refKey, type BundleResult, type ThemeBundleLoader, type ThemeRef } from '../src/theme/bundle-loader'
import { ProjectThemeValueProvider, type ProjectTheme } from '../src/theme/project-theme'

/** 판마다 줄 것 — 정의 · `'fail'`(곧바로 실패) · `'hang'`(`release` 전까지 안 끝남). */
export type StaticBundle = ThemeDefinition | 'fail' | 'hang'

export interface StaticBundleLoader extends ThemeBundleLoader {
  /** 부른 차례의 `id@버전`. */
  readonly calls: string[]
  /** 그 판의 답을 바꾼다 — 다음 `load` 부터(«다시 불러오기» 판). */
  set(key: string, bundle: StaticBundle): void
  /** 매달린 적재를 그 결과로 끝낸다. */
  release(key: string, result: BundleResult): void
}

/** 기본 하네스의 판 — 새 프로젝트가 서는 `system-admin@0.1.0`. */
export const ADMIN_REF: ThemeRef = { themeId: 'system-admin', version: ADMIN_FIXTURE.manifest.version }

export function staticBundleLoader(map: Record<string, StaticBundle> = { [refKey(ADMIN_REF)]: ADMIN_FIXTURE }): StaticBundleLoader {
  const bundles = new Map(Object.entries(map))
  const hanging = new Map<string, ((result: BundleResult) => void)[]>()
  const calls: string[] = []
  return {
    calls,
    set(key, bundle) {
      bundles.set(key, bundle)
    },
    release(key, result) {
      for (const resolve of hanging.get(key) ?? []) resolve(result)
      hanging.delete(key)
    },
    load(ref) {
      const key = refKey(ref)
      calls.push(key)
      const bundle = bundles.get(key)
      if (bundle === undefined) return Promise.resolve({ status: 'failed', reason: `시험용 로더에 ${key} 가 없습니다` })
      if (bundle === 'fail') return Promise.resolve({ status: 'failed', reason: `테마 번들을 받지 못했습니다(${key})` })
      if (bundle === 'hang') {
        return new Promise((resolve) => hanging.set(key, [...(hanging.get(key) ?? []), resolve]))
      }
      return Promise.resolve({ status: 'ok', definition: bundle })
    },
    forget() {},
  }
}

/** 기본 하네스가 `getProjectTheme` 으로 주는 바인딩 — 새 프로젝트가 서는 판 그대로다. */
export function adminThemeView(tokens: Record<string, string | number> = {}, rev = 0): ProjectThemeView {
  return {
    themeId: ADMIN_REF.themeId,
    version: ADMIN_REF.version,
    tokens,
    rev,
    manifest: ADMIN_FIXTURE.manifest,
    latest: ADMIN_REF.version,
    latestName: ADMIN_FIXTURE.manifest.name,
  }
}

/**
 * **셸 없이 패널을 세우는 테스트의 공급자** — 조회 · 로더 없이 그 정의와 토큰으로 선 바인딩을 건넨다. 셸째 세우는 테스트는 기본 하네스의
 * `getProjectTheme` · 로더를 쓴다(`editor-harness.tsx`).
 */
export function withProjectTheme(
  definition: ThemeDefinition = ADMIN_FIXTURE,
  tokens: Record<string, string | number> = {},
): (props: { children: ReactNode }) => ReactElement {
  const value: ProjectTheme = {
    status: 'ready',
    ref: { themeId: definition.manifest.id, version: definition.manifest.version },
    manifest: definition.manifest,
    tokens,
    rev: 0,
    definition,
    bundled: true,
    failure: null,
    retry() {},
    catchUp() {},
    applyFrame() {},
  }
  return (props) => createElement(ProjectThemeValueProvider, { value }, props.children)
}
