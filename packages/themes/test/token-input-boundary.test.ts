/**
 * 토큰 값 · manifest 이름 입력의 경계(A2 리뷰 — `docs/superpowers/plans/2026-09-27-a2-review.md` 항목 2 · 3).
 *
 * 값이 그 선언 밖에 효과를 내는지는 **실 Chrome 으로 쟀다**(리뷰 보고서의 표) — 여기서는 그 값을 받는지로 잠근다.
 * CSS 를 파싱해 재지 않는다: jsdom 의 CSSOM 값은 판정에 쓰지 않는다.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { installCatalog } from '@wirebound/schema'
import type { ThemeManifest } from '@wirebound/theme-sdk'
import { tokensCss, validateManifest } from '@wirebound/themes'

beforeAll(() => installCatalog())

const head = { id: 'acme', name: 'ACME', version: '1.0.0', sdk: '^1.0.0' }
const manifest = (items: Record<string, unknown>): ThemeManifest => {
  const { manifest: m, issues } = validateManifest({ ...head, tokens: { items } })
  if (m === null) throw new Error(JSON.stringify(issues))
  return m
}

describe('tokensCss — 뒤 선언을 삼키는 값을 받지 않는다', () => {
  const m = () =>
    manifest({
      'font.body': { type: 'font', label: 'f', default: 'serif' },
      'shadow.card': { type: 'shadow', label: 's', default: 'none' },
      'color.after': { type: 'color', label: 'c', default: '#0a0b0c' },
    })

  // Chrome: `/*` · `(` · `[` 는 뒤 토큰 전부와 같은 시트의 뒤 규칙까지, 따옴표는 뒤 선언 하나를, 끝의 `\` 는 `;` 를 이스케이프해
  // 뒤 선언 하나를 값으로 삼킨다.
  it.each([
    ['font.body', 'Arial /*'],
    ['font.body', 'Arial ('],
    ['font.body', 'Arial ['],
    ['font.body', 'Arial "'],
    ['font.body', "Arial '"],
    ['font.body', 'Arial \\'],
    ['shadow.card', '0 0 1px red /*'],
    ['shadow.card', '0 0 1px rgb(0'],
  ])('%s = %j 는 버리고 이슈로', (key, value) => {
    const { css, issues } = tokensCss(m(), { [key]: value })
    expect(issues.map((i) => i.path)).toContain(`values.${key}`)
    expect(css).not.toContain(value)
  })
})

describe('토큰 키 → CSS 변수 이름', () => {
  it('두 키가 같은 CSS 변수가 되면 manifest 검증이 거절한다', () => {
    // `a.b` · `a-b` 가 둘 다 `--wb-a-b` — 뒤 선언이 앞을 덮어 앞 토큰의 값을 고쳐도 화면이 안 바뀐다(`tokenValues` 와 CSS 가 갈린다).
    const { manifest: m } = validateManifest({
      ...head,
      tokens: { items: { 'a.b': { type: 'color', label: '1', default: '#111' }, 'a-b': { type: 'color', label: '2', default: '#222' } } },
    })
    expect(m).toBeNull()
  })
})

describe('프로토타입 이름', () => {
  it('선언에 없는 constructor · toString 값도 unknown-token 으로 버린다', () => {
    const m = manifest({ 'color.a': { type: 'color', label: 'a', default: '#000' } })
    const { issues } = tokensCss(m, { constructor: '#f00', toString: '#0f0' })
    expect(issues.map((i) => [i.code, i.path])).toEqual([
      ['unknown-token', 'values.constructor'],
      ['unknown-token', 'values.toString'],
    ])
  })

  it('toString 토큰을 선언하고 값을 안 주면 이슈가 없다', () => {
    const m = manifest({ toString: { type: 'color', label: 't', default: '#fff' } })
    expect(tokensCss(m, {}).issues).toEqual([])
  })

  it('components 의 __proto__ 키는 검증을 비켜 가지 않는다', () => {
    // JSON.parse 는 `__proto__` 를 자기 속성으로 만든다(업로드 경로). zod record 가 그 키를 조용히 떨궈 defaultVariant 가
    // variants 에 없는 선언이 검사 없이 통과한다 — 저장되는 manifest.json 원문에는 남는다.
    const raw = JSON.parse(
      `{"id":"acme","name":"ACME","version":"1.0.0","sdk":"^1.0.0","tokens":{"items":{}},` +
        `"components":{"__proto__":{"variants":[{"id":"x","label":"X"}],"defaultVariant":"zzz"}}}`,
    )
    expect(validateManifest(raw).manifest).toBeNull()
  })
})
