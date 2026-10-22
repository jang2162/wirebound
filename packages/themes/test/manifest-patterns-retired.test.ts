/**
 * **`patterns` 를 실은 manifest 는 거절한다**(`src/manifest/schema.ts` 의 `PATTERNS_RETIRED`) — 조용히 버리지 않고 까닭을 말한다. 빌드
 * (`wb-theme build`) · 업로드 · 저장된 패키지의 다시 읽기가 모두 `validateManifest` 를 지나므로 이 판정 하나가 모든 입구를 막는다. 업로드
 * 라우트의 422 는 `apps/api/test/admin-themes.test.ts` 가 잰다.
 */
import { installCatalog } from '@wirebound/schema'
import { beforeAll, describe, expect, it } from 'vitest'
import { PATTERNS_RETIRED } from '../src/manifest/schema'
import { packWbtheme, readWbtheme, validateManifest, type ThemeManifest } from '../src/index'

beforeAll(() => {
  installCatalog()
})

const BASE = { id: 'acme', name: 'ACME', version: '1.0.0', sdk: '^1.0.0', tokens: { items: {} } }
const PATTERNS = { 'hero.split': { name: '히어로', schema: { type: 'Section' } } }

describe('validateManifest — patterns', () => {
  it('patterns 를 실으면 그 자리 · 까닭 하나로 거절한다(대조: 빼면 받는다)', () => {
    expect(validateManifest(BASE).issues).toEqual([])
    const r = validateManifest({ ...BASE, patterns: PATTERNS })
    expect(r.manifest).toBeNull()
    expect(r.issues).toEqual([{ code: 'shape', path: 'patterns', message: PATTERNS_RETIRED }])
    expect(PATTERNS_RETIRED).toContain('patterns 는 더 지원하지 않습니다')
  })

  it('빈 patterns 도 거절한다 — 값이 아니라 키를 본다', () => {
    expect(validateManifest({ ...BASE, patterns: {} }).issues).toEqual([{ code: 'shape', path: 'patterns', message: PATTERNS_RETIRED }])
  })

  it('나머지 모양 이슈도 한 번에 말한다', () => {
    const r = validateManifest({ ...BASE, name: '', patterns: PATTERNS })
    expect(r.issues.map((i) => [i.code, i.path])).toEqual([
      ['shape', 'patterns'],
      ['shape', 'name'],
    ])
  })
})

describe('readWbtheme — patterns', () => {
  it('patterns 를 실은 .wbtheme 은 manifest 이슈로 거절한다', () => {
    const manifest = { ...BASE, patterns: PATTERNS } as ThemeManifest
    const read = readWbtheme(packWbtheme({ manifest, themeJs: ';' }))
    expect(read.files).toBeNull()
    expect(read.issues).toEqual([{ code: 'manifest', path: 'manifest.json:patterns', message: PATTERNS_RETIRED, manifestCode: 'shape' }])
  })
})
