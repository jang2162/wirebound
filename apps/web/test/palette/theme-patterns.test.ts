/**
 * `themePatterns` — 캔버스 테마의 manifest `patterns` 를 규격으로 읽는다(`src/palette/theme-patterns.ts`). 하단 판 «모듈» 탭의 «테마 패턴»
 * 묶음이 이 목록이다 — 화면은 `./module-tab.test.tsx` 가 잰다. 옛 패턴 고르개(`panels/pattern-picker.test.tsx`)의 순수 케이스를 옮겼다.
 */
import { describe, expect, it } from 'vitest'
import { BROKEN_NOTICE, themePatterns } from '../../src/palette/theme-patterns'
import { ADMIN_FIXTURE } from '../admin-theme'

const PATTERNS = {
  'content.noticeBoard': {
    name: '공지 목록',
    slots: { title: 'text' },
    schema: { type: 'Section', children: [{ type: 'Text', props: { role: 'h2', content: '공지사항' }, slot: 'title' }] },
  },
}

describe('themePatterns', () => {
  it('manifest 의 패턴을 규격으로 읽어 목록을 낸다', () => {
    const { entries, broken } = themePatterns({ ...ADMIN_FIXTURE.manifest, patterns: PATTERNS })
    expect(entries.map(([key]) => key)).toEqual(['content.noticeBoard'])
    expect(broken).toBeNull()
  })

  it('규격을 통과하지 못하면 목록이 비고 그렇다고 말한다', () => {
    const { entries, broken } = themePatterns({ ...ADMIN_FIXTURE.manifest, patterns: { 'hero.x': { name: '' } } })
    expect(entries).toEqual([])
    expect(broken).toBe(BROKEN_NOTICE)
  })
})
