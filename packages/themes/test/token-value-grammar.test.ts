/**
 * `font` · `shadow` 토큰 값의 허용 문법(`checkTokenValue`). 받는 꼴을 적고, 그 밖은 거절한다 — 거절 표는 A2 리뷰가 실 Chrome
 * 으로 잰 «뒤를 삼키는 값» 과 «요청을 내는 값» 이다(`docs/superpowers/plans/2026-09-27-a2-review.md` 「2. 토큰 값 → tokensCss」).
 * manifest 의 기본값과 `tokensCss` 의 받은 값이 같은 함수를 쓰는지도 여기서 본다.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { installCatalog } from '@wirebound/schema'
import { tokensCss, validateManifest } from '@wirebound/themes'

beforeAll(() => installCatalog())

const head = { id: 'acme', name: 'ACME', version: '1.0.0', sdk: '^1.0.0' }
const defaultCodes = (type: 'font' | 'shadow', value: string) =>
  validateManifest({ ...head, tokens: { items: { t: { type, label: 't', default: value } } } }).issues.map((i) => i.code)
const valueCodes = (type: 'font' | 'shadow', value: string) => {
  const { manifest } = validateManifest({ ...head, tokens: { items: { t: { type, label: 't', default: type === 'font' ? 'serif' : 'none' } } } })
  return tokensCss(manifest!, { t: value }).issues.map((i) => i.code)
}

const FONT_OK = [
  'serif',
  'Pretendard, system-ui, sans-serif',
  '"Noto Sans KR", sans-serif',
  "'맑은 고딕', serif",
  '본고딕',
  '"Font, with comma", monospace',
]
const FONT_BAD = [
  'Arial /*', 'Arial (', 'Arial [', 'Arial "', "Arial '", 'Arial \\', 'Arial )', 'Arial;', 'Arial !important',
  'url(http://example.test/f)', 'var(--wb-a)', '"a</style><script>"', '"a\\"b"', 'Arial,', ', Arial', '', '   ', 'Arial\nx',
]
const SHADOW_OK = [
  'none',
  '0 1px 2px rgba(15,23,42,.06)',
  'inset 0 0 0 1px #e2e8f0, 0 4px 12px rgb(15 23 42 / 0.1)',
  '0 0 4px red inset',
  '2px 2px',
  '-1px 0 0 0 hsl(210 40% 50%)',
]
const SHADOW_BAD = [
  '0 0 1px red /*', '0 0 1px rgb(0', '0 0 1px rgb(0 0 0))', '1px red', '0 0 0 0 0 red', 'red blue 0 0', 'inset inset 0 0',
  '0 red 0', 'image-set("http://example.test/s" 1x)', 'url(x) 0 0', '0 0 var(--wb-a)', '0 0 1px rgb(0 0 calc(1))',
  '0 0 1px red,', 'none, 0 0 1px red', '0 0 1px red; color: blue', '',
  // 짝은 맞지만 그림자 낱말이 아닌 괄호 블록 · 괄호 안에 글자가 든 색 함수.
  '0 0 1px (red)', '0 0 1px rgb(0 0 0 / none)',
]

describe('font 토큰 값', () => {
  it.each(FONT_OK)('%j 를 받는다', (value) => {
    expect(defaultCodes('font', value)).toEqual([])
    expect(valueCodes('font', value)).toEqual([])
  })
  it.each(FONT_BAD)('%j 를 거절한다 — 기본값과 받은 값이 같게', (value) => {
    expect(defaultCodes('font', value)).toEqual(['token-default-type'])
    expect(valueCodes('font', value)).toEqual(['token-default-type'])
  })
})

describe('shadow 토큰 값', () => {
  it.each(SHADOW_OK)('%j 를 받는다', (value) => {
    expect(defaultCodes('shadow', value)).toEqual([])
    expect(valueCodes('shadow', value)).toEqual([])
  })
  it.each(SHADOW_BAD)('%j 를 거절한다 — 기본값과 받은 값이 같게', (value) => {
    expect(defaultCodes('shadow', value)).toEqual(['token-default-type'])
    expect(valueCodes('shadow', value)).toEqual(['token-default-type'])
  })
})

describe('color 토큰 값 — 색 함수의 괄호 안', () => {
  it.each(['rgb(1 2 3 / a)', 'rgb(var(--x))', 'hsl(120deg 50% 50%)'])('%j 를 거절한다', (value) => {
    expect(validateManifest({ ...head, tokens: { items: { c: { type: 'color', label: 'c', default: value } } } }).issues.map((i) => i.code)).toEqual(['token-default-type'])
  })
  it.each(['rgb(15 23 42 / 0.1)', 'rgba(0,0,0,.5)', 'hsl(210 40% 50%)'])('%j 를 받는다', (value) => {
    expect(validateManifest({ ...head, tokens: { items: { c: { type: 'color', label: 'c', default: value } } } }).issues).toEqual([])
  })
})

describe('shadow 토큰 값 — 흔한 실제 값(A2 좁은 반증 2)', () => {
  // 앞 점 소수(`.5rem`)는 CSS 의 길이다 — Bootstrap 의 기본 그림자(`$box-shadow` · `$box-shadow-sm`)가 이 꼴이다. 그림자 문법이
  // 길이를 `LENGTH`(앞에 숫자가 있어야 한다)로 재서 거절한다. 대응 전(거부 목록)에는 받던 값이다.
  it.each(['0 .5rem 1rem rgba(0, 0, 0, .15)', '0 .125rem .25rem rgba(0,0,0,.075)', '0 -.5px 1px #000'])('%j 를 받는다', (value) => {
    expect(defaultCodes('shadow', value)).toEqual([])
    expect(valueCodes('shadow', value)).toEqual([])
  })
})

describe('length 토큰 값 — 앞 점 소수', () => {
  it.each(['.5rem', '-.25em', '0.5px'])('%j 를 받는다', (value) => {
    expect(validateManifest({ ...head, tokens: { items: { l: { type: 'length', label: 'l', default: value } } } }).issues).toEqual([])
  })
  it.each(['.rem', '5.rem', '..5rem', '.5REM'])('%j 를 거절한다', (value) => {
    expect(validateManifest({ ...head, tokens: { items: { l: { type: 'length', label: 'l', default: value } } } }).issues.map((i) => i.code)).toEqual(['token-default-type'])
  })
})

