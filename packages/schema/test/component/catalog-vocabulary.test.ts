/**
 * **카탈로그가 설계 문서의 예시와 어긋나는 자리.**
 *
 * P4a-1이 세운 판정 원칙을 그대로 쓴다 — **규격이 이기고 예시가 틀린 것으로 본다.**
 * 설계 문서는 고치지 않고(`docs/superpowers/specs/*`), 어긋난 사실과 근거를 여기 남긴다.
 *
 * **예시를 손으로 인용하지 않는다.** 설계 절을 읽어 대조하므로, 설계가 예시를 고치면
 * 카나리아가 먼저 죽고 그때 판정을 다시 한다.
 */
import designDoc from '../../../../docs/superpowers/specs/2026-08-03-wirebound-design.md?raw'
import { beforeAll, describe, expect, it } from 'vitest'
import { installCatalog } from '../../src/component/catalog/index'
import { getComponent } from '../../src/component/registry'
import type { PageDocument } from '../../src/node'
import { validatePage } from '../../src/validate'

beforeAll(() => {
  installCatalog()
})

/** 설계 문서의 절 하나를 통째로 잘라 온다. 다음 `### ` 앞까지다. */
function section(heading: string): string {
  const body = designDoc.split(heading)[1] ?? ''
  return body.split('\n### ')[0] ?? ''
}

/**
 * **재라 #8 — §6.6 예시의 `Grid.props.gap`.**
 *
 * §6.6의 `hero.split` 패턴이 `{ type: 'Grid', props: { columns: 2, gap: 'space.10' } }`를
 * 쓰는데 카탈로그의 `Grid`는 `columns` 하나만 선언한다.
 *
 * **판정: 예시가 틀렸다. `gap`을 카탈로그에 더하지 않는다.** 근거 셋 — 전부 재서 확인했다.
 *
 * 1. **§6.8이 `gap`을 이미 갖고 있다.** 그것은 **테마의** 스타일 어휘다. 같은 이름을 노드
 *    prop으로도 두면 어느 쪽이 이기는지를 설계가 답하지 않는 자리가 새로 생긴다.
 * 2. **노드 props는 토큰 해석기를 지나지 않는다.** 예시의 값이 `"space.10"`(토큰 참조)인데
 *    `validatePage`는 zod 스키마만 보고 `resolveTokens`를 부르지 않는다 — 통과시켜도 그
 *    문자열이 CSS에 그대로 실려 **무효 선언**이 된다. 참조를 푸는 층을 노드 props에
 *    만드는 것은 §4.3·§5.1 어디에도 근거가 없다.
 * 3. **같은 화면에 닿는 길이 이미 있다** — `components.Grid.base.gap: "space.10"`.
 *
 * **이 판정을 뒤집으려면 2번부터 반증해야 한다.**
 */
describe('재라 #8 — §6.6 예시의 Grid.props.gap', () => {
  it('§6.6이 실제로 Grid에 gap을 쓴다 — 카나리아', () => {
    // 파싱이 깨지면 아래 판정이 근거를 잃고 조용히 통과한다.
    const patterns = section('### 6.6 patterns')
    expect(patterns).toContain('"type": "Grid"')
    expect(patterns).toContain('"gap": "space.10"')
  })

  it('카탈로그의 Grid는 gap을 선언하지 않는다', () => {
    const grid = getComponent('Grid')
    expect(grid).toBeDefined()

    const shape = (grid!.props as unknown as { shape: Record<string, unknown> }).shape
    expect(Object.keys(shape)).toEqual(['columns'])
  })

  it('예시를 그대로 페이지에 넣으면 invalid-props다 — 실측', () => {
    // **`unknown-prop`이 아니다.** `Grid.props`가 `z.strictObject`라 미선언 키가 zod의
    // 파싱 단계에서 걸리고, 그 실패가 통째로 `invalid-props` 하나로 나온다. 코드 이름을
    // 기억으로 적었다가 실측으로 고쳤다.
    const doc: PageDocument = {
      version: 1,
      root: {
        id: 'n_000000000001',
        type: 'Page',
        children: [
          { id: 'n_000000000002', type: 'Grid', props: { columns: 2, gap: 'space.10' } },
        ],
      },
    }

    const issues = validatePage(doc)
    expect(issues.map((issue) => issue.code)).toEqual(['invalid-props'])
    expect(issues[0]?.message).toContain('gap')
  })

  it('gap을 빼면 통과한다 — 어긋나는 것이 그 키 하나다', () => {
    // 음성 대조. 이것이 없으면 위 케이스가 `columns: 2` 때문에 죽는 것과 구별되지 않는다.
    const doc: PageDocument = {
      version: 1,
      root: {
        id: 'n_000000000001',
        type: 'Page',
        children: [{ id: 'n_000000000002', type: 'Grid', props: { columns: 2 } }],
      },
    }

    expect(validatePage(doc)).toEqual([])
  })

  it('§6.8이 gap을 테마의 어휘로 갖고 있다 — 대신 쓸 길', () => {
    // 근거 3. `themes`를 import하지 않는다 — 의존 방향이 반대다(§3.3). 설계 절을 읽는다.
    expect(section('### 6.8 스타일 프로퍼티 화이트리스트')).toContain('gap')
  })
})
