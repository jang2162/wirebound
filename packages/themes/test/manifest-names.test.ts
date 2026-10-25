/**
 * manifest 의 이름 입력 — CSS 변수 이름 겹침 · 프로토타입 이름 · `__proto__` 키(A2 리뷰 3a ~ 3c). 리뷰의 빨강 케이스
 * (`token-input-boundary.test.ts`)가 «거절하는가» 를 보고, 여기서는 이슈의 코드와 자리를 본다.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { installCatalog } from '@wirebound/schema'
import { validateManifest } from '@wirebound/themes'

beforeAll(() => installCatalog())

const head = '"id":"acme","name":"ACME","version":"1.0.0","sdk":"^1.0.0"'
const issuesOf = (json: string) => validateManifest(JSON.parse(`{${head},${json}}`)).issues.map((i) => [i.code, i.path])

describe('manifest 이름 입력', () => {
  it('같은 CSS 변수가 되는 두 번째 키를 token-var-collision 으로 가리킨다', () => {
    expect(
      issuesOf(
        '"tokens":{"items":{"a.b":{"type":"color","label":"1","default":"#111"},"a-b":{"type":"color","label":"2","default":"#222"}}}',
      ),
    ).toEqual([['token-var-collision', 'tokens.items.a-b']])
  })

  it('프로토타입 이름을 가리키는 참조는 «없는 토큰» 이다', () => {
    expect(issuesOf('"tokens":{"items":{"c":{"type":"color","label":"c","default":"{toString}"}}}')).toEqual([
      ['unknown-token-ref', 'tokens.items.c.default'],
    ])
  })

  it.each([
    ['tokens.items', '"tokens":{"items":{"__proto__":{"type":"color","label":"x","default":"#000"}}}', 'tokens.items.__proto__'],
    [
      '깊은 자리',
      '"tokens":{"items":{}},"components":{"DataGrid":{"variants":[{"id":"a","label":"a","__proto__":{}}],"defaultVariant":"a"}}',
      'components.DataGrid.variants.0.__proto__',
    ],
  ])('%s 의 __proto__ 키를 모양 검사 전에 그 자리로 가리킨다', (_label, json, path) => {
    expect(issuesOf(json)).toEqual([['shape', path]])
  })
})
