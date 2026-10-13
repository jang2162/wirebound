/**
 * **새 패키지의 읽기(`readNewWbtheme`)와 다시 읽기(`readWbtheme`)가 `Page` 가 든 패턴에서 갈린다** — 새로 들이는 입구(업로드 ·
 * `wb-theme build`)는 거절하고, 저장된 패키지를 다시 읽는 자리(내보내기 · 시딩 · CLI lint 의 `validateManifest`)는 받는다.
 */
import { installCatalog } from '@wirebound/schema'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  checkNewPatterns,
  checkPatterns,
  packWbtheme,
  readNewWbtheme,
  readWbtheme,
  validateManifest,
  type ThemeManifest,
} from '../src/index'

beforeAll(() => {
  installCatalog()
})

const PATTERNS = {
  'content.page': { name: '페이지째', schema: { type: 'Page', children: [{ type: 'Text', props: { content: '안' } }] } },
  'content.deep': { name: '깊은', schema: { type: 'Section', children: [{ type: 'Card', children: [{ type: 'Page' }] }] } },
  'content.plain': { name: '글', schema: { type: 'Section', children: [{ type: 'Text', props: { content: '글' } }] } },
}

function manifest(patterns: Record<string, unknown>): ThemeManifest {
  return { id: 'paged', name: '페이지', version: '1.0.0', sdk: '^1.0.0', tokens: { items: {} }, patterns } as ThemeManifest
}

function bytesOf(patterns: Record<string, unknown>): Uint8Array {
  return packWbtheme({ manifest: manifest(patterns), themeJs: ';', themeCss: null, assets: new Map() })
}

describe('checkNewPatterns', () => {
  it('맨 위 · 깊은 Page 를 그 노드의 자리로 낸다 — Page 없는 패턴은 이슈 없음', () => {
    const { issues } = checkNewPatterns(PATTERNS as never)
    expect(issues.map((issue) => [issue.code, issue.path])).toEqual([
      ['bad-pattern-node', 'patterns.content.page.schema'],
      ['bad-pattern-node', 'patterns.content.deep.schema.children.0.children.0'],
    ])
  })

  it('checkPatterns(다시 읽기에서도 도는 검사)는 Page 를 안 본다', () => {
    expect(checkPatterns(PATTERNS as never).issues).toEqual([])
  })
})

describe('readNewWbtheme · readWbtheme', () => {
  it('새 패키지의 읽기는 Page 패턴을 manifest 이슈(pattern)로 거절한다', () => {
    const read = readNewWbtheme(bytesOf(PATTERNS))
    expect(read.files).toBeNull()
    expect(read.issues.map((issue) => [issue.code, issue.manifestCode, issue.path])).toEqual([
      ['manifest', 'pattern', 'manifest.json:patterns.content.page.schema'],
      ['manifest', 'pattern', 'manifest.json:patterns.content.deep.schema.children.0.children.0'],
    ])
  })

  it('다시 읽기는 같은 바이트를 받는다 — validateManifest 도', () => {
    const read = readWbtheme(bytesOf(PATTERNS))
    expect(read.issues).toEqual([])
    expect(Object.keys(read.files!.manifest.patterns ?? {})).toEqual(Object.keys(PATTERNS))
    expect(validateManifest(manifest(PATTERNS)).issues).toEqual([])
  })

  it('Page 가 없으면 새 패키지의 읽기도 받는다 · 다른 거절은 다시 읽기와 같다', () => {
    const plain = { 'content.plain': PATTERNS['content.plain'] }
    expect(readNewWbtheme(bytesOf(plain)).issues).toEqual([])
    const broken = bytesOf({ 'nope.x': PATTERNS['content.plain'] })
    expect(readNewWbtheme(broken)).toEqual(readWbtheme(broken))
    expect(readWbtheme(broken).files).toBeNull()
  })
})
