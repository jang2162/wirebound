import { describe, expect, it } from 'vitest'
import { AssetsSchema, ICON_SETS } from '../src/spec/assets'
import { MetaSchema } from '../src/spec/meta'

const MINIMAL = { id: 'acme-portal', name: 'ACME 포털', version: '1.2.0' }

describe('MetaSchema', () => {
  it('id·name·version이 최소 계약이다', () => {
    expect(MetaSchema.safeParse(MINIMAL).success).toBe(true)
  })

  it('셋 중 하나라도 빠지면 실패다', () => {
    for (const key of ['id', 'name', 'version'] as const) {
      const { [key]: _dropped, ...rest } = MINIMAL
      expect(MetaSchema.safeParse(rest).success, `${key} 없음`).toBe(false)
    }
  })

  it('선언되지 않은 키는 그 자체로 실패다', () => {
    // schema·api의 관례다(z.strictObject). 오타가 조용히 무시되면 테마 작성자가
    // 왜 안 먹는지 알 수 없다.
    expect(MetaSchema.safeParse({ ...MINIMAL, theme: 'x' }).success).toBe(false)
  })

  it('description·preview는 선택이다', () => {
    expect(
      MetaSchema.safeParse({ ...MINIMAL, description: '사내 포털용 파생 테마', preview: 'data:…' })
        .success,
    ).toBe(true)
  })

  it('id는 CSS 셀렉터·파일 이름에 실릴 수 없는 문자를 받지 않는다', () => {
    for (const bad of ['', 'a b', 'a"b', 'a/b', 'a.b', 'a<b']) {
      expect(MetaSchema.safeParse({ ...MINIMAL, id: bad }).success, JSON.stringify(bad)).toBe(false)
    }
  })

  describe('extends', () => {
    // 규격 결정: `system:<id>` 형태만 받는다. 근거는 소스 주석(EXTENDS_PATTERN)에 있다.
    it('system: 접두어가 붙은 것만 받는다', () => {
      expect(MetaSchema.safeParse({ ...MINIMAL, extends: 'system:portal' }).success).toBe(true)
    })

    it('접두어 없는 테마 id는 상속 대상이 아니다', () => {
      expect(MetaSchema.safeParse({ ...MINIMAL, extends: 'portal' }).success).toBe(false)
    })

    it('system: 말고 다른 접두어는 받지 않는다', () => {
      expect(MetaSchema.safeParse({ ...MINIMAL, extends: 'project:portal' }).success).toBe(false)
    })

    it('접두어만 있고 id가 비면 실패다', () => {
      expect(MetaSchema.safeParse({ ...MINIMAL, extends: 'system:' }).success).toBe(false)
    })
  })
})

describe('AssetsSchema', () => {
  it('빈 객체가 통과한다 — 셋 다 선택이다', () => {
    expect(AssetsSchema.safeParse({}).success).toBe(true)
  })

  it('설계 §6.7의 예시가 그대로 통과한다', () => {
    expect(
      AssetsSchema.safeParse({
        fonts: [{ family: 'Pretendard', src: 'https://…/pretendard.woff2', weights: [400, 500, 700] }],
        icons: 'lucide',
        placeholder: { style: 'skeleton' },
      }).success,
    ).toBe(true)
  })

  it('icons는 내장 세트 목록 안의 값이어야 한다', () => {
    // 목록 자체는 손으로 적었다 — 근거는 ICON_SETS의 주석에 있다.
    for (const name of ICON_SETS) {
      expect(AssetsSchema.safeParse({ icons: name }).success, name).toBe(true)
    }
    expect(AssetsSchema.safeParse({ icons: 'heroicons' }).success).toBe(false)
    expect(AssetsSchema.safeParse({ icons: '' }).success).toBe(false)
  })

  it('placeholder.style은 넷 중 하나다', () => {
    for (const style of ['skeleton', 'blueprint', 'photo', 'solid']) {
      expect(AssetsSchema.safeParse({ placeholder: { style } }).success, style).toBe(true)
    }
    expect(AssetsSchema.safeParse({ placeholder: { style: 'wireframe' } }).success).toBe(false)
  })

  it('선언되지 않은 키는 어느 깊이에서도 실패다', () => {
    expect(AssetsSchema.safeParse({ sprites: [] }).success).toBe(false)
    expect(AssetsSchema.safeParse({ placeholder: { style: 'photo', tint: '#fff' } }).success).toBe(false)
    expect(
      AssetsSchema.safeParse({ fonts: [{ family: 'A', src: 'b', display: 'swap' }] }).success,
    ).toBe(false)
  })

  it('폰트는 family·src가 필수이고 weights는 선택이다', () => {
    expect(AssetsSchema.safeParse({ fonts: [{ family: 'A', src: 'b' }] }).success).toBe(true)
    expect(AssetsSchema.safeParse({ fonts: [{ family: 'A' }] }).success).toBe(false)
    expect(AssetsSchema.safeParse({ fonts: [{ src: 'b' }] }).success).toBe(false)
    expect(AssetsSchema.safeParse({ fonts: [{ family: 'A', src: 'b', weights: [350.5] }] }).success)
      .toBe(false)
  })
})
