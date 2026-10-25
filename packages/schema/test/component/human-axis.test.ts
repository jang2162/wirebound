/**
 * **사람이 읽을 축**(`label`·`description`·`group`)의 계약이 지키는 것들.
 *
 * ## 무엇을 재는가
 *
 * 1. **`defineComponent`가 같은 결로 검사한다.** 어휘 쪽 검사들이 *"선언은 있는데 닿을 수
 *    없다"*를 막듯, 이쪽은 *"화면에 낼 말이 없다"*·*"내면 화면이 깨진다"*를 막는다.
 * 2. **이름은 레지스트리에서 겹칠 수 없다.** `defineComponent`는 정의 하나만 보므로
 *    겹침을 볼 수 없고, `registerComponent`가 본다.
 * 3. **사람이 읽을 필드는 `data-wb-*`를 하나도 만들지 않는다.** 렌더러가 노드에 싣는 속성은
 *    `packages/renderer/test/contract-attrs.test.ts`가 원문에서 센다.
 * 4. **`COMPONENT_NOUNS`가 카탈로그에서 유도된다.** 이름 표가 두 벌이 아니라는 것과,
 *    그러면서도 `installCatalog()`와 무관하게 선다는 것(exporter가 그것에 기댄다).
 */
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { CATALOG_DEFS, installCatalog } from '../../src/component/catalog/index'
import { defineComponent } from '../../src/component/define'
import { COMPONENT_NOUNS } from '../../src/interaction/describe'
import { getComponent, registerComponent, resetRegistry } from '../../src/component/registry'

const base = {
  type: 'T',
  label: '티',
  description: '검사용 표본.',
  group: 'document' as const,
  props: z.strictObject({}),
  editor: [],
  states: [],
  zones: [] as const,
}

describe('defineComponent — 사람이 읽을 축', () => {
  it('label이 비어 있으면 던진다', () => {
    // 타입만으로는 `''`이 막히지 않는다. 그러면 고르개에 **글자 없는 항목**이 서고
    // 고를 수는 있다 — 없는 것보다 나쁜 상태다.
    expect(() => defineComponent({ ...base, label: '' })).toThrow('label가 비어 있습니다')
    expect(() => defineComponent({ ...base, label: '   ' })).toThrow('label가 비어 있습니다')
  })

  it('description이 비어 있으면 던진다', () => {
    expect(() => defineComponent({ ...base, description: '' })).toThrow('description가 비어 있습니다')
  })

  it('줄바꿈이 든 말은 던진다', () => {
    // `<option>`은 줄바꿈을 공백으로 접어 조용히 넘어가고, 설명 줄은 반대로 상자를
    // 세로로 민다 — 어느 쪽이든 적은 사람이 본 모양과 화면이 갈린다. 상한만으로는 안 막힌다.
    expect(() => defineComponent({ ...base, label: '두\n줄' })).toThrow('label는 한 줄이어야 합니다')
    expect(() => defineComponent({ ...base, description: '앞.\n뒤.' })).toThrow('description는 한 줄이어야 합니다')
  })

  it('상한을 넘으면 던진다', () => {
    expect(() => defineComponent({ ...base, label: '가'.repeat(13) })).toThrow('label가 12자를 넘습니다 (13자)')
    expect(() => defineComponent({ ...base, description: '가'.repeat(61) })).toThrow('description가 60자를 넘습니다 (61자)')
    // 경계는 통과한다 — 상한이 «넘으면»이지 «닿으면»이 아니다.
    expect(() => defineComponent({ ...base, label: '가'.repeat(12) })).not.toThrow()
    expect(() => defineComponent({ ...base, description: '가'.repeat(60) })).not.toThrow()
  })

  it('갈래 목록 밖의 group은 던진다', () => {
    // 타입이 이미 막지만 `as`로 지나온 값·JSON에서 온 값은 여기서만 걸린다. 조용히
    // 통과하면 고르개가 그 컴포넌트를 어느 그룹에도 못 넣어 목록에서 통째로 사라진다.
    expect(() => defineComponent({ ...base, group: 'layout' as unknown as typeof base.group })).toThrow(
      'group이 갈래 목록에 없습니다: layout',
    )
  })
})

describe('registerComponent — 이름 겹침', () => {
  it('같은 이름을 두 번 등록하면 던진다', () => {
    // **고르개에서 구별되지 않는 항목 둘이 되는 것**을 막는다. 타입이 달라 동작은
    // 갈리는데 화면의 글자가 같으면 사용자가 어느 쪽을 골랐는지 알 수 없다.
    resetRegistry()
    registerComponent(defineComponent({ ...base, type: 'A' }))
    expect(() => registerComponent(defineComponent({ ...base, type: 'B' }))).toThrow('이미 쓰이는 컴포넌트 이름: 티 (A · B)')
    resetRegistry()
  })

  it('카탈로그의 이름이 서로 다르다', () => {
    const labels = CATALOG_DEFS.map((def) => def.label)
    expect(new Set(labels).size).toBe(labels.length)
  })
})

describe('사람이 읽을 축', () => {
  it('카탈로그가 사람이 읽을 축을 전부 채운다', () => {
    for (const def of CATALOG_DEFS) {
      expect(def.label.trim(), def.type).toBeTruthy()
      expect(def.description.trim(), def.type).toBeTruthy()
      expect(def.group, def.type).toBeTruthy()
    }
  })
})

describe('COMPONENT_NOUNS는 카탈로그에서 유도된다', () => {
  it('이름이 def.label과 같다', () => {
    /**
     * **이 케이스가 잡는 것은 «두 벌»이 아니라 «어긋남»이다.**
     *
     * `COMPONENT_NOUNS`를 **같은 값의 리터럴로 되돌려도** 이 파일도
     * `interaction-describe.test.ts`도 **전부 통과한다**(다시 재는 법: 유도를 같은 값의 리터럴
     * 표로 바꾸고 두 파일을 돌린다). 값이 같은 사본은 어떤 단언으로도 안 보인다.
     *
     * **그래도 지키려는 것은 지켜진다.** 리터럴인 채 카탈로그의 이름만 고쳐 보면
     * (`Tree`의 `label`을 `나무`로) 이 케이스가 **죽는다** — 사본이 해로운 것은 사본이라서가
     * 아니라 **갈릴 수 있어서**이고, 갈리는 순간이 여기서 잡힌다. 유도로 둔 것은 그 위에
     * 얹는 안전장치이지 이 케이스가 증명하는 것이 아니다.
     */
    for (const def of CATALOG_DEFS) {
      expect(COMPONENT_NOUNS[def.type]?.name, def.type).toBe(def.label)
    }
  })

  it('키 집합이 카탈로그와 정확히 같다', () => {
    // **하나를 놓치면 그 노드의 문장이 조용히 영문 타입명으로 떨어진다** — 파일 머리말의
    // 표가 그 폴백을 적고 있다(*"이름이 없으면 → 영문 타입 이름을 쓴다"*). 유도가 한
    // 항목을 빠뜨리는 형태가 그것이고, 값 대조만으로는 «없는 키»가 안 보인다.
    expect(Object.keys(COMPONENT_NOUNS).slice().sort()).toEqual(
      CATALOG_DEFS.map((def) => def.type)
        .slice()
        .sort(),
    )
  })

  it('installCatalog() 없이도 이름이 선다', () => {
    // **`packages/exporter`가 그것에 기댄다**(`test/pptx-catalog.test.ts`의 주석:
    // *"COMPONENT_NOUNS는 정적 표라 이쪽은 설치와 무관하다"*). 레지스트리를 훑는 구현으로
    // 바꾸면 모듈 로드 순서에 따라 표가 조용히 비고, 문장이 전부 영문으로 떨어진다.
    resetRegistry()
    expect(COMPONENT_NOUNS['DataGrid']?.name).toBe('그리드')
    expect(Object.keys(COMPONENT_NOUNS)).toHaveLength(CATALOG_DEFS.length)
    installCatalog()
  })

  it('Slot은 표에 있지만 고르개에는 없다 — 다른 질문이다', () => {
    // 문장은 **레이아웃 문서**의 노드도 부른다(설계서 「레이아웃」의 `Slot`). 고르개가 답하는 것은
    // *"페이지에 무엇을 둘 수 있는가"*이고 `validatePage`가 `Slot`을 거른다. 두 집합이
    // 다른 것이 정상이고, 같아야 한다고 착각하면 둘 중 하나가 틀린 답을 내게 된다.
    expect(COMPONENT_NOUNS['Slot']?.name).toBe('슬롯')
  })
})
