/**
 * `edit/preset-apply.ts` — 프리셋을 페이지에 놓는 편집.
 *
 * **화면 없이 잰다.** 순수 함수라 문서를 직접 만들어 넣고 op과 이유를 값으로 본다 —
 * 화면 흐름(확인·알림·선택 이동)은 `../panels/structure-preset.test.tsx`가 잰다.
 *
 * **패치 엔진을 실제로 돌린다.** 편집 파이프라인의 4·5단계가 `invertOps` → `applyOps`
 * 순서인 것과 같게 왕복시킨다(`apps/api/src/services/edit-pipeline.ts`) — op 모양만 보면
 * *"서버가 받아 준다"*를 재지 못한다.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import {
  BUILTIN_MODULES,
  CURRENT_DOCUMENT_VERSION,
  applyOps,
  installCatalog,
  invertOps,
  validatePage,
  type PageDocument,
  type WbNode,
} from '@wirebound/schema'
import { presetApply, presetFailureNotice } from '../../src/edit/preset-apply'

beforeAll(() => {
  installCatalog()
})

function doc(root: PageDocument['root']): PageDocument {
  return { version: CURRENT_DOCUMENT_VERSION, root }
}

/** `children: []`을 든 평범한 페이지. `POST .../pages`가 만드는 기본 문서와 같은 모양이다. */
function page(children: WbNode[] = [{ id: 'n_old00000001', type: 'Text' }]): PageDocument {
  return doc({ id: 'n_root00000001', type: 'Page', children })
}

/** id를 결정적으로 만드는 이음매. **임시 root가 하나를 가져간다**(`@wirebound/schema` 의 `prepareNodesForPaste` 머리말). */
function counter(): () => string {
  let next = 0
  return () => {
    next += 1
    return `n_new${String(next).padStart(9, '0')}`
  }
}

const LIST: WbNode = { id: 'sl_list', type: 'List', props: { items: 3 } }

describe('presetApply', () => {
  it('op이 하나이고 root의 children을 바꾼다', () => {
    const result = presetApply(page(), [LIST], counter())

    expect(result.reason).toBeNull()
    expect(result.apply!.ops).toEqual([{ op: 'replace', path: '/root/children', value: [{ ...LIST, id: 'n_new000000002' }] }])
  })

  it('root 자체는 바꾸지 않는다 — id·type·props가 그 페이지의 것이다', () => {
    const before = doc({ id: 'n_root00000001', type: 'Page', props: {}, children: [] })

    const result = presetApply(before, [LIST], counter())
    const after = applyOps(before, result.apply!.ops)

    expect(after.root.id).toBe('n_root00000001')
    expect(after.root.type).toBe('Page')
    expect(after.root.props).toEqual({})
  })

  it('undo 하나가 페이지 전체를 되돌린다', () => {
    const before = page([
      { id: 'n_a00000000001', type: 'Card', children: [{ id: 'n_b00000000001', type: 'Text' }] },
      { id: 'n_c00000000001', type: 'List' },
    ])

    const result = presetApply(before, BUILTIN_MODULES[0]!.nodes, counter())
    // 편집 파이프라인과 **같은 순서**로 돈다 — invertOps가 더 엄격하다.
    const inverse = invertOps(before, result.apply!.ops)
    const after = applyOps(before, result.apply!.ops)

    expect(after.root.children).toHaveLength(BUILTIN_MODULES[0]!.nodes.length)
    // **되돌리는 것이 편집 하나다.** 역도 op 하나이고, 그것 하나로 문서가 통째로 돌아온다.
    expect(inverse).toHaveLength(1)
    expect(applyOps(after, inverse)).toEqual(before)
  })

  /**
   * **`replace` 하나로는 절반만 참이다.** root에 `children` 키가 없으면
   * `replace`는 `applyOp`·`invertOps` 양쪽에서 던진다. 그래서 `add`로 갈린다.
   */
  it('root에 children 키가 없으면 add로 낸다 — replace는 던진다', () => {
    const before = doc({ id: 'n_root00000001', type: 'Page' })

    const result = presetApply(before, [LIST], counter())

    expect(result.apply!.ops[0]!.op).toBe('add')
    // 왕복이 실제로 된다.
    const inverse = invertOps(before, result.apply!.ops)
    const after = applyOps(before, result.apply!.ops)
    expect(after.root.children).toHaveLength(1)
    expect(applyOps(after, inverse)).toEqual(before)

    // **그 자리에 `replace`를 놓으면 던진다** — 갈래를 둔 이유가 값으로 남는다.
    expect(() => applyOps(before, [{ op: 'replace', path: '/root/children', value: [] }])).toThrow(/바꿀 키가 없습니다/)
    expect(() => invertOps(before, [{ op: 'replace', path: '/root/children', value: [] }])).toThrow(/바꿀 값을 찾을 수 없습니다/)
  })

  it('children 키가 있으면 replace이고, 그 역은 옛 children을 통째로 담는다', () => {
    const before = page([{ id: 'n_old00000001', type: 'Text', props: { text: '옛것' } }])

    const result = presetApply(before, [LIST], counter())
    const inverse = invertOps(before, result.apply!.ops)

    expect(inverse).toEqual([{ op: 'replace', path: '/root/children', value: before.root.children }])
  })

  it('노드 id를 새로 발급한다(설계서 「페이지 프리셋」)', () => {
    const result = presetApply(page(), [LIST], counter())

    const placed = (result.apply!.ops[0] as { value: WbNode[] }).value
    expect(placed[0]!.id).not.toBe('sl_list')
    expect(result.apply!.selectId).toBe(placed[0]!.id)
  })

  it('트리 안을 가리키던 상호작용 target도 함께 바뀐다', () => {
    const nodes: WbNode[] = [
      {
        id: 'src',
        type: 'Button',
        interactions: [{ on: 'click', actions: [{ type: 'setVisible', target: 'dst', value: false }] }],
      },
      { id: 'dst', type: 'List' },
    ]

    const result = presetApply(page(), nodes, counter())

    const placed = (result.apply!.ops[0] as { value: WbNode[] }).value
    const target = placed[0]!.interactions![0]!.actions[0]!.target
    expect(target).toBe(placed[1]!.id)
    expect(target).not.toBe('dst')
  })

  it('트리 밖(page:)을 가리키는 target은 그대로 둔다', () => {
    const nodes: WbNode[] = [
      {
        id: 'src',
        type: 'Button',
        interactions: [{ on: 'click', actions: [{ type: 'navigate', target: 'page:관리자/회원/상세' }] }],
      },
    ]

    const result = presetApply(page(), nodes, counter())

    const placed = (result.apply!.ops[0] as { value: WbNode[] }).value
    expect(placed[0]!.interactions![0]!.actions[0]!.target).toBe('page:관리자/회원/상세')
  })

  it('끊긴 상호작용은 막지 않는다 — warning이라 서버도 통과시킨다', () => {
    const nodes: WbNode[] = [
      {
        id: 'src',
        type: 'Button',
        interactions: [{ on: 'click', actions: [{ type: 'setVisible', target: '없는노드', value: true }] }],
      },
    ]

    const result = presetApply(page(), nodes, counter())

    expect(result.reason).toBeNull()
  })

  /**
   * **판정을 결과 문서로 한다.** 패턴은 프로브를 쓰므로 문서와의 관계를
   * 못 보지만, 프리셋은 결과 문서를 보므로 그 축이 저절로 덮인다.
   */
  it('프리셋 안에 중복 id가 있으면 duplicate-id로 막는다 — 프로브는 못 보는 축이다', () => {
    const nodes: WbNode[] = [
      { id: 'same', type: 'List' },
      { id: 'same', type: 'Text' },
    ]

    const result = presetApply(page(), nodes, counter())

    expect(result.reason).toBe('invalid')
    expect(result.issues.map((issue) => issue.code)).toContain('duplicate-id')
    expect(result.apply).toBeNull()
  })

  it('이미 깨진 문서라도 프리셋이 멀쩡하면 놓을 수 있다 — 치워지기 때문이다', () => {
    // 알 수 없는 타입이 있는 문서. **패턴 삽입이 프로브를 쓰는 이유가 이 상태다** —
    // 프리셋은 그 노드를 통째로 치우므로 결과 문서에 남지 않는다.
    const before = page([{ id: 'n_bad00000001', type: '없는타입' }])
    expect(validatePage(before).some((issue) => issue.code === 'unknown-type')).toBe(true)

    const result = presetApply(before, [LIST], counter())

    expect(result.reason).toBeNull()
    expect(validatePage(applyOps(before, result.apply!.ops))).toEqual([])
  })

  /**
   * **결과 문서 판정의 경계.** 결과 문서 전체를 판정하는 근거가 *"교체하면 깨진 부분이
   * 결과에 남지 않는다"*인데, **root는 교체 대상이 아니다.** 그래서 결과 문서로만 판정하면
   * root가 깨진 문서에서 멀쩡한 프리셋이 막히고, 문장이 프리셋을 탓한다 — 갈래를 따로 둔다.
   */
  it('root가 깨진 문서는 프리셋을 탓하지 않는다 — 갈래가 다르다', () => {
    const before = doc({ id: 'n_root00000001', type: 'Card', children: [] })

    const result = presetApply(before, [LIST], counter())

    expect(result.reason).toBe('broken-page')
    expect(result.issues.map((issue) => issue.code)).toEqual(['bad-root'])
    expect(result.apply).toBeNull()
  })

  it('root의 봉투가 깨져도 같은 갈래다', () => {
    // id가 `NODE_ID_PATTERN`을 어긴다 — 봉투 검증에 걸린다.
    const before = doc({ id: '루트 아이디', type: 'Page', children: [] })

    const result = presetApply(before, [LIST], counter())

    expect(result.reason).toBe('broken-page')
  })

  it('root가 멀쩡하면 프리셋의 이슈는 프리셋 갈래로 남는다 — 반대편', () => {
    const result = presetApply(page(), [{ id: 'x', type: '없는타입' }], counter())

    expect(result.reason).toBe('invalid')
  })

  it('프리셋에 알 수 없는 타입이 있으면 invalid이고 편집이 0건이다', () => {
    const result = presetApply(page(), [{ id: 'x', type: '없는타입' }], counter())

    expect(result.reason).toBe('invalid')
    expect(result.issues.map((issue) => issue.code)).toEqual(['unknown-type'])
    expect(result.apply).toBeNull()
  })

  it('Slot이 든 프리셋은 막힌다 — 페이지에는 Slot을 둘 수 없다', () => {
    const result = presetApply(page(), [{ id: 'x', type: 'Slot' }], counter())

    expect(result.reason).toBe('invalid')
    expect(result.issues.map((issue) => issue.code)).toContain('slot-count')
  })

  it('빈 프리셋은 실패가 아니라 "치우기"다', () => {
    const before = page([{ id: 'n_old00000001', type: 'Text' }])

    const result = presetApply(before, [], counter())

    expect(result.reason).toBeNull()
    // 고를 것이 없다 — 화면은 이 값으로 선택을 비운다.
    expect(result.apply!.selectId).toBeNull()
    expect(applyOps(before, result.apply!.ops).root.children).toEqual([])
  })

  it('root가 노드가 아니면 no-root다 — invalid로 뭉뚱그리지 않는다', () => {
    const broken = { version: 1, root: null } as unknown as PageDocument

    const result = presetApply(broken, [LIST], counter())

    expect(result.reason).toBe('no-root')
    expect(result.apply).toBeNull()
  })

  it('깨진 문서에서도 던지지 않는다', () => {
    const shapes: unknown[] = [
      { version: 1, root: undefined },
      { version: 1, root: '루트' },
      { version: 1, root: { id: 'n_root00000001', type: 'Page', children: null } },
      { version: 1, root: { id: 'n_root00000001', type: 'Page', children: [null] } },
    ]

    for (const shape of shapes) {
      expect(() => presetApply(shape as PageDocument, [LIST], counter())).not.toThrow()
    }
  })

  /**
   * **`marker`를 버리는 자리를 값으로 고정한다.** 버리는 자리는 **저장**이고(서버의 `POST .../presets`)
   * 적용이 아니다 — 여기서 몰래 버리기 시작하면 저장 쪽 규칙이 느슨해져도 아무도 모른다.
   */
  it('적용은 marker를 손대지 않는다 — 버리는 자리는 저장이다', () => {
    const result = presetApply(page(), [{ id: 'x', type: 'List', marker: 2 }], counter())

    const placed = (result.apply!.ops[0] as { value: WbNode[] }).value
    expect(placed[0]!.marker).toBe(2)
  })

  /**
   * **`expandPattern`에서 실증된 결함과 같은 부류다.** `remapNodeIds`는 노드를
   * 새 객체로 만들지만 `props`는 참조 그대로 옮긴다 — 내장 프리셋은 **모듈 상수**라
   * 그 공유가 프로세스 수명 내내 남는다.
   */
  it('놓인 값이 프리셋 원본과 값을 공유하지 않는다', () => {
    const source: WbNode[] = [{ id: 'x', type: 'List', props: { columns: ['하나'] } }]

    const result = presetApply(page(), source, counter())
    ;(source[0]!.props!['columns'] as string[]).push('둘')

    const placed = (result.apply!.ops[0] as { value: WbNode[] }).value
    expect(placed[0]!.props!['columns']).toEqual(['하나'])
  })

  it('내장 3종이 전부 빈 페이지에 놓인다', () => {
    for (const preset of BUILTIN_MODULES) {
      const before = page([])
      const result = presetApply(before, preset.nodes, counter())

      expect(result.reason).toBeNull()
      expect(validatePage(applyOps(before, result.apply!.ops))).toEqual([])
    }
  })
})

/**
 * **이유가 빈 실패 문장의 모양을 재는 자리다.** 툴바가 문장을 만들면 화면을 지나야만
 * 도달해 케이스를 쓸 수 없다. 여기서는 문장 생성이 순수 함수라 **빈 이유 목록을 직접
 * 넣어** 잴 수 있다.
 */
describe('presetFailureNotice', () => {
  it('이유가 있으면 콜론 뒤에 잇는다', () => {
    const result = presetApply(page(), [{ id: 'x', type: '없는타입' }], counter())

    const notice = presetFailureNotice(result)
    expect(notice).toContain('프리셋을 놓지 못했습니다: ')
    expect(notice).toContain('알 수 없는 컴포넌트 타입')
  })

  it('이유가 없으면 콜론도 없다 — 뒤가 빈 문장이 되지 않는다', () => {
    const notice = presetFailureNotice({ apply: null, reason: 'invalid', issues: [] })

    expect(notice).toBe('프리셋을 놓지 못했습니다.')
    expect(notice.endsWith(':')).toBe(false)
  })

  it('root가 깨진 갈래는 페이지를 고치라고 말한다 — 프리셋을 탓하지 않는다', () => {
    const before = doc({ id: 'n_root00000001', type: 'Card', children: [] })

    const notice = presetFailureNotice(presetApply(before, [LIST], counter()))

    expect(notice).toContain('페이지')
    expect(notice).not.toContain('프리셋을 놓지 못했습니다')
    // 이유는 그대로 싣는다 — 무엇을 고쳐야 하는지가 거기 있다.
    expect(notice).toContain('루트는 Page여야 합니다')
  })

  it('문서가 깨진 갈래는 다른 문장이다 — 사용자가 할 일이 다르다', () => {
    const broken = { version: 1, root: null } as unknown as PageDocument

    const notice = presetFailureNotice(presetApply(broken, [LIST], counter()))

    expect(notice).toContain('새로고침')
    expect(notice).not.toContain('프리셋을 놓지 못했습니다')
  })

  it('성공한 결과에는 문장이 없다 — 던지지 않는다', () => {
    expect(presetFailureNotice(presetApply(page(), [LIST], counter()))).toBe('')
  })
})
