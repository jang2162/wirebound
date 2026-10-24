/**
 * **복사 표지**(`src/edit/copy-marks.ts`) — 해시가 sha256 그대로인지 · 쌓이는 표지의 한도 · 막힌 저장소. 붙이기가 표지를 어떻게 쓰는지는
 * `paste-images.test.tsx` 가 잰다.
 */
import { createHash } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { COPY_MARKS_KEY, COPY_MARKS_MAX, copiedHere, markCopiedEnvelope, sha256Hex } from '../../src/edit/copy-marks'

afterEach(() => {
  vi.restoreAllMocks()
  window.localStorage.removeItem(COPY_MARKS_KEY)
})

describe('복사 표지', () => {
  it('sha256Hex 는 node 의 sha256 과 같다 — 블록 경계 · 한글 · 긴 글', () => {
    const samples = ['', 'a', 'x'.repeat(55), 'x'.repeat(56), 'x'.repeat(64), '그림 봉투 🖼', '{"wirebound":"nodes"}'.repeat(500)]
    expect(samples.map(sha256Hex)).toEqual(samples.map((text) => createHash('sha256').update(text, 'utf8').digest('hex')))
  })

  it(`최근 ${COPY_MARKS_MAX} 개만 남는다 — 오래된 것부터 버리고 · 다시 복사한 것은 맨 뒤로`, () => {
    const texts = Array.from({ length: COPY_MARKS_MAX + 1 }, (_, index) => `봉투 ${index}`)
    markCopiedEnvelope(texts[0]!)
    markCopiedEnvelope(texts[1]!)
    markCopiedEnvelope(texts[0]!)
    for (const text of texts.slice(2)) markCopiedEnvelope(text)
    const stored = JSON.parse(window.localStorage.getItem(COPY_MARKS_KEY) ?? '[]') as string[]
    expect({ count: stored.length, kept: texts.map(copiedHere) }).toEqual({
      count: COPY_MARKS_MAX,
      kept: texts.map((_, index) => index !== 1),
    })
  })

  it('저장소가 던지면 적기를 건너뛰고 읽기는 «안 믿음» 이다 · 모양이 틀린 값도', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('막힌 저장소', 'SecurityError')
    })
    expect(() => markCopiedEnvelope('봉투')).not.toThrow()
    vi.restoreAllMocks()
    expect(copiedHere('봉투')).toBe(false)
    window.localStorage.setItem(COPY_MARKS_KEY, '{깨진')
    expect(copiedHere('봉투')).toBe(false)
    markCopiedEnvelope('봉투')
    expect(copiedHere('봉투')).toBe(true)
  })
})
