/**
 * 상호작용 규칙의 정적 검증(설계서 「상호작용」의 「모델」 — *"그래서 규칙을 정적으로 검증할 수 있고
 * (타겟 존재 여부, prop 유효성)"*).
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { installCatalog } from '../src/component/catalog/index'
import type { Interaction } from '../src/node'
import type { PageDocument } from '../src/node'
import { ISSUE_SEVERITY, partitionIssues, validatePage } from '../src/validate'

beforeAll(() => {
  installCatalog()
})

const SOURCE = 'n_000000000002'
const TARGET = 'n_000000000003'

/** 트리거 노드 하나와 타겟 노드 하나를 담은 페이지. 타겟 타입은 부르는 쪽이 정한다. */
function pageWith(interaction: Interaction, targetType = 'List', targetProps?: Record<string, unknown>): PageDocument {
  return {
    version: 1,
    root: {
      id: 'n_000000000001',
      type: 'Page',
      children: [
        { id: SOURCE, type: 'Button', interactions: [interaction] },
        { id: TARGET, type: targetType, ...(targetProps ? { props: targetProps } : {}) },
      ],
    },
  }
}

/** 상호작용이 낸 이슈만 남긴다 — 다른 검사(타입·props)의 이슈와 섞이지 않게. */
function interactionIssues(doc: PageDocument): ReturnType<typeof validatePage> {
  return validatePage(doc).filter((issue) => issue.code.includes('interaction'))
}

describe('타겟 존재', () => {
  it('타겟이 문서에 있으면 이슈가 없다', () => {
    const doc = pageWith({ on: 'click', actions: [{ type: 'setVisible', target: TARGET, value: false }] })
    expect(interactionIssues(doc)).toEqual([])
  })

  it('setVisible의 타겟이 문서에 없으면 missing-interaction-target', () => {
    const doc = pageWith({ on: 'click', actions: [{ type: 'setVisible', target: 'n_deadbeef', value: false }] })
    expect(interactionIssues(doc)).toContainEqual(
      expect.objectContaining({ code: 'missing-interaction-target', nodeId: SOURCE }),
    )
  })

  it('setProp의 타겟이 문서에 없으면 missing-interaction-target', () => {
    const doc = pageWith({
      on: 'click',
      actions: [{ type: 'setProp', target: 'n_deadbeef', prop: 'loading', value: true }],
    })
    expect(interactionIssues(doc)).toContainEqual(
      expect.objectContaining({ code: 'missing-interaction-target' }),
    )
  })

  it('switchTab의 타겟이 문서에 없으면 missing-interaction-target', () => {
    const doc = pageWith({ on: 'click', actions: [{ type: 'switchTab', target: 'n_deadbeef', tab: 1 }] })
    expect(interactionIssues(doc)).toContainEqual(
      expect.objectContaining({ code: 'missing-interaction-target' }),
    )
  })

  /**
   * **타겟은 문서 뒤쪽에 있어도 된다.** 순회 중에 판정하면 아직 못 본 노드를 "없다"고
   * 말한다 — 상호작용 검사가 순회 **뒤**에 도는 이유다.
   */
  it('타겟이 트리거보다 뒤에 있어도 찾는다', () => {
    const doc: PageDocument = {
      version: 1,
      root: {
        id: 'n_000000000001',
        type: 'Page',
        children: [
          { id: SOURCE, type: 'Button', interactions: [{ on: 'click', actions: [{ type: 'setVisible', target: TARGET, value: false }] }] },
          { id: TARGET, type: 'List' },
        ],
      },
    }
    expect(interactionIssues(doc)).toEqual([])
  })

  it('중첩된 자식도 타겟이 된다', () => {
    const doc: PageDocument = {
      version: 1,
      root: {
        id: 'n_000000000001',
        type: 'Page',
        children: [
          { id: SOURCE, type: 'Button', interactions: [{ on: 'click', actions: [{ type: 'setVisible', target: TARGET, value: false }] }] },
          { id: 'n_000000000004', type: 'Section', children: [{ id: TARGET, type: 'List' }] },
        ],
      },
    }
    expect(interactionIssues(doc)).toEqual([])
  })

  /**
   * **아직 안 고른 타겟도 같은 코드로 잡되 문장이 다르다.** 할 일은 같으므로(타겟을 고른다)
   * 코드와 severity를 가르지 않지만, *"문서에 없습니다"*는 액션을 막 더한 사용자에게
   * 거짓이다 — 무엇이 없어진 것이 아니다. 문장화도 같은 구분을 한다
   * (`interaction/describe.ts`의 `targetName`).
   */
  it('타겟이 비어 있으면 "아직 고르지 않았다"고 말한다', () => {
    const doc = pageWith({ on: 'click', actions: [{ type: 'setVisible', target: '', value: false }] })
    const issue = interactionIssues(doc)[0]
    expect(issue?.code).toBe('missing-interaction-target')
    expect(issue?.message).toContain('아직 고르지 않았습니다')
    expect(issue?.message).not.toContain('문서에 없습니다')
  })

  it('path가 그 액션 자리를 가리킨다', () => {
    const doc = pageWith({
      on: 'click',
      actions: [
        { type: 'setVisible', target: TARGET, value: false },
        { type: 'setVisible', target: 'n_deadbeef', value: false },
      ],
    })
    expect(interactionIssues(doc)[0]).toMatchObject({
      path: '/root/children/0/interactions/0/actions/1',
    })
  })
})

/**
 * **`navigate`·`openModal`의 `page:` 타겟.** 「모델」의 예가
 * `"page:관리자/회원/상세"`이고 **그 페이지는 이 문서 안에 없다.** 검증은 문서 하나만
 * 받으므로 여기서 풀 수 없다 — **검사하지 않는다.**
 */
describe('navigate·openModal의 타겟은 검사하지 않는다', () => {
  it('navigate의 페이지 경로는 이슈를 내지 않는다', () => {
    const doc = pageWith({ on: 'click', actions: [{ type: 'navigate', target: 'page:관리자/회원/상세' }] })
    expect(interactionIssues(doc)).toEqual([])
  })

  it('openModal의 페이지 경로도 이슈를 내지 않는다', () => {
    const doc = pageWith({ on: 'click', actions: [{ type: 'openModal', target: 'page:관리자/회원/등록' }] })
    expect(interactionIssues(doc)).toEqual([])
  })

  /**
   * **노드 id처럼 생긴 값을 줘도 노드로 보지 않는다.** 그 둘의 `target`은 노드 id 공간이
   * 아니므로 *"문서에 없는 노드"*로 판정하면 거짓 경고가 된다.
   */
  it('노드 id처럼 생긴 값을 줘도 없는 노드라고 말하지 않는다', () => {
    const doc = pageWith({ on: 'click', actions: [{ type: 'navigate', target: 'n_deadbeef' }] })
    expect(interactionIssues(doc)).toEqual([])
  })
})

describe('대상 종류', () => {
  it('switchTab의 타겟이 Tabs면 통과한다', () => {
    const doc = pageWith({ on: 'click', actions: [{ type: 'switchTab', target: TARGET, tab: 1 }] }, 'Tabs')
    expect(interactionIssues(doc)).toEqual([])
  })

  it('switchTab의 타겟이 Tabs가 아니면 invalid-interaction-target', () => {
    const doc = pageWith({ on: 'click', actions: [{ type: 'switchTab', target: TARGET, tab: 1 }] }, 'List')
    expect(interactionIssues(doc)).toContainEqual(
      expect.objectContaining({ code: 'invalid-interaction-target' }),
    )
  })

  it('메시지가 무엇이 와야 하는지와 무엇이 왔는지를 말한다', () => {
    const doc = pageWith({ on: 'click', actions: [{ type: 'switchTab', target: TARGET, tab: 1 }] }, 'List')
    const message = interactionIssues(doc)[0]?.message ?? ''
    expect(message).toContain('Tabs')
    expect(message).toContain('List')
  })

  /**
   * **`switchTab`의 `tab`은 `Tabs.active`와 같은 축의 값이다 — 같은 규칙으로 본다.**
   * *"상한이 없어서 검사하지 않는다"*는 **상한에만 해당하는 근거다** — `Tabs.active`의 zod는
   * `z.number().int().min(0)`이라 **하한과 정수성은 규칙이 있고**, 액션 자리가 그것을 안 보면
   * 같은 값이 prop 자리에서는 `invalid-props`(error)인데 액션 자리에서는 이슈 0건이 된다.
   *
   * **그 zod를 그대로 재사용한다** — 규칙을 베껴 적으면 둘이 따로 썩는다.
   * **상한은 없다**(카탈로그가 안 정했다) — 그래서 큰 수는 통과한다.
   */
  it('switchTab의 탭 번호가 음수면 invalid-interaction-prop', () => {
    const doc = pageWith({ on: 'click', actions: [{ type: 'switchTab', target: TARGET, tab: -3 }] }, 'Tabs')
    expect(interactionIssues(doc)).toContainEqual(
      expect.objectContaining({ code: 'invalid-interaction-prop' }),
    )
  })

  it('탭 번호가 정수가 아니어도 잡는다', () => {
    const doc = pageWith({ on: 'click', actions: [{ type: 'switchTab', target: TARGET, tab: 1.5 }] }, 'Tabs')
    expect(interactionIssues(doc)).toContainEqual(
      expect.objectContaining({ code: 'invalid-interaction-prop' }),
    )
  })

  it('메시지가 탭 번호에 대한 것임을 말한다', () => {
    const doc = pageWith({ on: 'click', actions: [{ type: 'switchTab', target: TARGET, tab: -3 }] }, 'Tabs')
    expect(interactionIssues(doc)[0]?.message).toContain('탭 번호')
  })

  /**
   * **`Tabs.active`와 같은 값을 넣으면 같은 판정이 나온다** — 두 자리가 갈리지 않는다는
   * 것을 값으로 고정한다. 상한은 둘 다 없으므로 큰 수는 둘 다 통과한다.
   */
  it('prop 자리와 액션 자리가 같은 값에 같은 판정을 낸다', () => {
    for (const tab of [-3, 1.5]) {
      const asProp = pageWith(
        { on: 'click', actions: [{ type: 'setVisible', target: TARGET, value: true }] },
        'Tabs',
        { active: tab },
      )
      const asAction = pageWith({ on: 'click', actions: [{ type: 'switchTab', target: TARGET, tab }] }, 'Tabs')
      // prop 자리: invalid-props(error) · 액션 자리: invalid-interaction-prop(warning)
      expect(validatePage(asProp).some((issue) => issue.code === 'invalid-props')).toBe(true)
      expect(interactionIssues(asAction)).toHaveLength(1)
    }

    // 상한은 어느 쪽도 없다 — 큰 수는 둘 다 통과한다.
    const big = pageWith({ on: 'click', actions: [{ type: 'switchTab', target: TARGET, tab: 99 }] }, 'Tabs')
    expect(interactionIssues(big)).toEqual([])
  })

  /**
   * **`setVisible`은 대상 종류를 가리지 않는다.** 숨기고 보이는
   * 것은 **모든 노드가 갖는 성질**이라 그것을 받을 자격을 따로 선언하는 자리가 카탈로그에
   * 없다 — `visible`이라는 prop도 상태도 어느 컴포넌트에 없다. 종류를 가리려면 그
   * 자격 선언을 설계서 「컴포넌트 정의 구조」의 계약에 새로 더해야 하고, 그 선언이 생기기
   * 전까지는 가리지 않는다.
   */
  it('setVisible은 어떤 종류의 노드든 받는다', () => {
    for (const type of ['List', 'Section', 'Tabs', 'Divider']) {
      const doc = pageWith({ on: 'click', actions: [{ type: 'setVisible', target: TARGET, value: false }] }, type)
      expect(interactionIssues(doc)).toEqual([])
    }
  })
})

describe('prop 유효성', () => {
  it('그 컴포넌트의 prop이고 값이 맞으면 통과한다', () => {
    const doc = pageWith({
      on: 'click',
      actions: [{ type: 'setProp', target: TARGET, prop: 'loading', value: true }],
    })
    expect(interactionIssues(doc)).toEqual([])
  })

  it('없는 prop이면 invalid-interaction-prop', () => {
    const doc = pageWith({
      on: 'click',
      actions: [{ type: 'setProp', target: TARGET, prop: '없는프롭', value: true }],
    })
    expect(interactionIssues(doc)).toContainEqual(
      expect.objectContaining({ code: 'invalid-interaction-prop' }),
    )
  })

  it('값이 그 prop의 타입이 아니면 invalid-interaction-prop', () => {
    const doc = pageWith({
      on: 'click',
      actions: [{ type: 'setProp', target: TARGET, prop: 'loading', value: '참' }],
    })
    expect(interactionIssues(doc)).toContainEqual(
      expect.objectContaining({ code: 'invalid-interaction-prop' }),
    )
  })

  /** 값 검사는 **그 prop 하나만** 떼어 본다 — 다른 prop이 없다고 실패하면 안 된다. */
  it('다른 prop을 안 줘도 값 검사가 통과한다', () => {
    const doc = pageWith({
      on: 'click',
      actions: [{ type: 'setProp', target: TARGET, prop: 'items', value: 3 }],
    })
    expect(interactionIssues(doc)).toEqual([])
  })

  it('범위를 벗어난 값도 잡는다', () => {
    const doc = pageWith({
      on: 'click',
      actions: [{ type: 'setProp', target: TARGET, prop: 'items', value: -1 }],
    })
    expect(interactionIssues(doc)).toContainEqual(
      expect.objectContaining({ code: 'invalid-interaction-prop' }),
    )
  })

  /**
   * 타입을 모르는 노드에는 대조할 계약이 없다. **`unknown-type`이 이미 그 사실을 말하므로**
   * 상호작용 쪽에서 같은 사실을 한 번 더 말하지 않는다.
   */
  it('카탈로그에 없는 타입이 타겟이면 prop을 판정하지 않는다', () => {
    const doc = pageWith(
      { on: 'click', actions: [{ type: 'setProp', target: TARGET, prop: '무엇이든', value: 1 }] },
      'Nope',
    )
    expect(interactionIssues(doc)).toEqual([])
  })

  it('메시지가 어느 컴포넌트의 어느 prop인지 말한다', () => {
    const doc = pageWith({
      on: 'click',
      actions: [{ type: 'setProp', target: TARGET, prop: '없는프롭', value: true }],
    })
    const message = interactionIssues(doc)[0]?.message ?? ''
    expect(message).toContain('List')
    expect(message).toContain('없는프롭')
  })
})

/**
 * **한 노드에 상호작용이 여럿일 때.** `interactions`가 배열이고 같은 `on`이
 * 둘일 수 있다. **막지 않는다.** 「모델」이 금지하지 않았고, 같은 트리거 둘은 액션을
 * 이어 붙인 것과 결과가 같다. 다만 **검사는 배열 전부를 돈다** — 두
 * 번째 상호작용의 끊긴 타겟이 조용히 지나가면 안 된다.
 */
describe('같은 트리거가 둘이어도 막지 않는다', () => {
  it('같은 on이 둘이어도 이슈가 아니다', () => {
    const doc = pageWith({ on: 'click', actions: [{ type: 'setVisible', target: TARGET, value: false }] })
    doc.root.children?.[0]?.interactions?.push({
      on: 'click',
      actions: [{ type: 'setVisible', target: TARGET, value: true }],
    })
    expect(interactionIssues(doc)).toEqual([])
  })

  it('두 번째 상호작용의 끊긴 타겟도 잡는다', () => {
    const doc = pageWith({ on: 'click', actions: [{ type: 'setVisible', target: TARGET, value: false }] })
    doc.root.children?.[0]?.interactions?.push({
      on: 'change',
      actions: [{ type: 'setVisible', target: 'n_deadbeef', value: true }],
    })
    expect(interactionIssues(doc)).toHaveLength(1)
    expect(interactionIssues(doc)[0]).toMatchObject({
      path: '/root/children/0/interactions/1/actions/0',
    })
  })
})

/**
 * **severity.** 판정과 근거는 `validate.ts`의 `ISSUE_SEVERITY` 머리말에 있다.
 * 여기서는 그 판정이 **무엇을 지키는지**를 잰다.
 */
describe('셋 다 warning이다', () => {
  it('상호작용 코드 셋이 전부 warning이다', () => {
    expect(ISSUE_SEVERITY['missing-interaction-target']).toBe('warning')
    expect(ISSUE_SEVERITY['invalid-interaction-target']).toBe('warning')
    expect(ISSUE_SEVERITY['invalid-interaction-prop']).toBe('warning')
  })

  /**
   * **이것이 `warning`의 결정적 근거다.** `error`로 두면 설계서 「정방향 흐름」의 저장 게이트와
   * `edit-pipeline`의 6단계가 이 문서를 거부한다 — **노드를 지운 사용자가 자기 문서를
   * 저장할 수 없게 된다.** `partitionIssues`가 그 선을 긋는 유일한 자리이므로 여기서 잰다.
   */
  it('타겟이 된 노드를 지우는 편집이 막히지 않는다', () => {
    // 타겟 노드를 지운 문서 — 참조만 남았다.
    const doc = pageWith({ on: 'click', actions: [{ type: 'setVisible', target: TARGET, value: false }] })
    doc.root.children = doc.root.children?.slice(0, 1)

    const issues = validatePage(doc)
    expect(issues).toContainEqual(expect.objectContaining({ code: 'missing-interaction-target' }))
    // 저장 게이트가 보는 것은 `errors`다. 비어 있어야 저장된다.
    expect(partitionIssues(issues).errors).toEqual([])
  })
})
