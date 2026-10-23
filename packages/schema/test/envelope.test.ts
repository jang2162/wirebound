import { beforeAll, describe, expect, it } from 'vitest'
import { installCatalog, resetRegistry, validateLayout, validatePage } from '../src/index'
import { DocumentEnvelopeSchema, WbNodeSchema } from '../src/envelope'

beforeAll(() => {
  resetRegistry()
  installCatalog()
})

const goodRoot = { id: 'n_000000000001', type: 'Page', children: [] }
const goodPage = { version: 1, root: goodRoot }

describe('WbNodeSchema', () => {
  it('정상 노드를 통과시킨다', () => {
    expect(WbNodeSchema.safeParse(goodRoot).success).toBe(true)
  })

  it('64자 id를 통과시킨다', () => {
    const id64 = 'a'.repeat(64)
    expect(WbNodeSchema.safeParse({ id: id64, type: 'Page' }).success).toBe(true)
  })

  it('중첩된 children까지 검사한다', () => {
    const nested = {
      id: 'n_000000000001',
      type: 'Page',
      children: [{ id: 'n_000000000002', type: 'Flex', children: [{ id: '나쁜 id', type: 'Text' }] }],
    }
    const result = WbNodeSchema.safeParse(nested)
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error.issues[0]?.path).toEqual(['children', 0, 'children', 0, 'id'])
  })

  it.each([
    ['id가 null', { id: null, type: 'Page' }],
    ['id가 없음', { type: 'Page' }],
    ['id가 숫자', { id: 42, type: 'Page' }],
    ['id에 공백', { id: 'hello world', type: 'Page' }],
    ['id가 빈 문자열', { id: '', type: 'Page' }],
    ['id에 슬래시', { id: 'a/b', type: 'Page' }],
    ['id에 물결', { id: 'a~b', type: 'Page' }],
    ['id가 65자', { id: 'a'.repeat(65), type: 'Page' }],
    ['type이 없음', { id: 'n_000000000001' }],
    ['type이 빈 문자열', { id: 'n_000000000001', type: '' }],
    ['marker가 문자열', { id: 'n_000000000001', type: 'Page', marker: 'two' }],
    ['marker가 0', { id: 'n_000000000001', type: 'Page', marker: 0 }],
    ['marker가 소수', { id: 'n_000000000001', type: 'Page', marker: 1.5 }],
    ['variant가 숫자', { id: 'n_000000000001', type: 'Page', variant: 3 }],
    ['children이 배열이 아님', { id: 'n_000000000001', type: 'Page', children: {} }],
    ['선언되지 않은 키', { id: 'n_000000000001', type: 'Page', style: { color: 'red' } }],
  ])('%s를 거부한다', (_label, input) => {
    expect(WbNodeSchema.safeParse(input).success).toBe(false)
  })
})

describe('WbNodeSchema — interactions', () => {
  const withInteraction = (interactions: unknown) => ({
    id: 'n_000000000001',
    type: 'Page',
    interactions,
  })

  it('설계서 상호작용 「모델」의 5종 액션을 전부 통과시킨다', () => {
    const node = withInteraction([
      {
        on: 'click',
        actions: [
          { type: 'setProp', target: 'n_000000000002', prop: 'loading', value: true },
          { type: 'setVisible', target: 'n_000000000002', value: false },
          { type: 'switchTab', target: 'n_000000000002' },
          { type: 'navigate', target: 'page:관리자/회원/상세' },
          { type: 'openModal', target: 'page:관리자/회원/등록' },
        ],
      },
    ])
    expect(WbNodeSchema.safeParse(node).success).toBe(true)
  })

  it.each([
    ['알 수 없는 트리거', [{ on: 'telepathy', actions: [] }]],
    ['알 수 없는 액션 타입', [{ on: 'click', actions: [{ type: 'rm -rf', target: 'n_1' }] }]],
    ['target이 숫자', [{ on: 'click', actions: [{ type: 'navigate', target: 1 }] }]],
    ['actions가 없음', [{ on: 'click' }]],
    ['setVisible의 value가 문자열', [{ on: 'click', actions: [{ type: 'setVisible', target: 'n_1', value: 'no' }] }]],
    ['switchTab에 옛 탭 번호(tab)', [{ on: 'click', actions: [{ type: 'switchTab', target: 'n_1', tab: 1 }] }]],
    ['interactions가 배열이 아님', { on: 'click' }],
  ])('%s를 거부한다', (_label, interactions) => {
    expect(WbNodeSchema.safeParse(withInteraction(interactions)).success).toBe(false)
  })
})

describe('DocumentEnvelopeSchema', () => {
  it('정상 문서를 통과시킨다', () => {
    expect(DocumentEnvelopeSchema.safeParse(goodPage).success).toBe(true)
  })

  it.each([
    ['version이 문자열', { version: 'x', root: goodRoot }],
    ['version이 없음', { root: goodRoot }],
    ['version이 0', { version: 0, root: goodRoot }],
    ['version이 소수', { version: 1.5, root: goodRoot }],
    ['root가 없음', { version: 1 }],
    ['root가 null', { version: 1, root: null }],
    ['문서가 배열', [goodPage]],
    ['문서가 null', null],
    ['선언되지 않은 키', { version: 1, root: goodRoot, extra: 1 }],
  ])('%s를 거부한다', (_label, input) => {
    expect(DocumentEnvelopeSchema.safeParse(input).success).toBe(false)
  })
})

describe('validatePage — 봉투 게이트', () => {
  it('정상 문서에는 이슈가 없다', () => {
    expect(validatePage(goodPage)).toEqual([])
  })

  it.each([
    ['id가 null인 루트', { version: 1, root: { id: null, type: 'Page' } }],
    ['id가 없는 루트', { version: 1, root: { type: 'Page' } }],
    ['id가 숫자인 루트', { version: 1, root: { id: 42, type: 'Page' } }],
    ['공백이 든 id', { version: 1, root: { id: 'hello world', type: 'Page' } }],
    ['잘못된 marker', { version: 1, root: { id: 'n_000000000001', type: 'Page', marker: 'two' } }],
    [
      '잘못된 interactions',
      {
        version: 1,
        root: {
          id: 'n_000000000001',
          type: 'Page',
          interactions: [{ on: 'telepathy', actions: [{ type: 'rm -rf', target: 1 }] }],
        },
      },
    ],
    ['version이 문자열', { version: 'x', root: goodRoot }],
    ['version이 없음', { root: goodRoot }],
  ])('%s를 bad-document로 잡는다', (_label, input) => {
    // 봉투가 깨진 입력은 타입 시스템을 통과하지 못하므로 캐스트가 불가피하다.
    // 이 함수의 계약은 "신뢰할 수 없는 입력을 받는다"이므로 캐스트 자체가 테스트 대상이다.
    const issues = validatePage(input as never)
    expect(issues.length).toBeGreaterThan(0)
    expect(issues[0]?.code).toBe('bad-document')
  })

  it('봉투가 깨지면 트리 순회를 시도하지 않는다', () => {
    // root가 null이면 walkNodes가 터진다. 게이트가 먼저 막아야 한다.
    expect(() => validatePage({ version: 1, root: null } as never)).not.toThrow()
    expect(validatePage({ version: 1, root: null } as never)[0]?.code).toBe('bad-document')
  })

  it('봉투 이슈 메시지는 한국어다', () => {
    const issues = validatePage({ version: 1, root: { id: 42, type: 'Page' } } as never)
    expect(issues[0]?.message).toMatch(/[가-힣]/)
    expect(issues[0]?.message).not.toMatch(/expected|received|invalid/i)
  })

  it('봉투 이슈는 zod 경로를 path에 싣는다', () => {
    const issues = validatePage({ version: 1, root: { id: 42, type: 'Page' } } as never)
    expect(issues[0]?.path).toBe('/root/id')
  })

  it('봉투를 통과하면 기존 검증이 이어서 돈다', () => {
    const doc = { version: 1, root: { id: 'n_000000000001', type: 'Nonexistent' } }
    const issues = validatePage(doc as never)
    expect(issues.some((issue) => issue.code === 'unknown-type')).toBe(true)
  })
})

describe('validatePage — bad-document의 nodeId 해석', () => {
  it('id 필드 자체가 문자열이지만 패턴을 어기면 nodeId는 null이다', () => {
    const doc = { version: 1, root: { id: 'hello world', type: 'Page' } }
    const issues = validatePage(doc as never)
    const issue = issues.find((i) => i.path === '/root/id')
    expect(issue?.nodeId).toBeNull()
  })

  it.each([
    ['id가 null', null],
    ['id가 숫자', 42],
  ])('id 필드 자체가 깨지면(%s) nodeId는 null이다', (_label, id) => {
    const doc = { version: 1, root: { id, type: 'Page' } }
    const issues = validatePage(doc as never)
    const issue = issues.find((i) => i.path === '/root/id')
    expect(issue?.nodeId).toBeNull()
  })

  it('자식의 marker가 깨지고 자식 id가 유효하면 nodeId는 자식의 id다', () => {
    const doc = {
      version: 1,
      root: {
        id: 'n_000000000001',
        type: 'Page',
        children: [{ id: 'n_000000000002', type: 'Text', marker: 'two' }],
      },
    }
    const issues = validatePage(doc as never)
    const issue = issues.find((i) => i.path === '/root/children/0/marker')
    expect(issue?.nodeId).toBe('n_000000000002')
  })

  it('자식의 id가 깨지고 루트 id가 유효하면 nodeId는 루트의 id다', () => {
    const doc = {
      version: 1,
      root: {
        id: 'n_000000000001',
        type: 'Page',
        children: [{ id: 'bad id', type: 'Text' }],
      },
    }
    const issues = validatePage(doc as never)
    const issue = issues.find((i) => i.path === '/root/children/0/id')
    expect(issue?.nodeId).toBe('n_000000000001')
  })

  it('자식의 marker가 깨지고 루트 id가 패턴을 어기면 nodeId는 null이다 (조상의 손상이 전파된다)', () => {
    const doc = {
      version: 1,
      root: {
        id: 'hello world',
        type: 'Page',
        children: [{ id: 'n_000000000002', type: 'Text', marker: 'two' }],
      },
    }
    const issues = validatePage(doc as never)
    const issue = issues.find((i) => i.path === '/root/children/0/marker')
    expect(issue?.nodeId).toBeNull()
  })
})

describe('validateLayout — 봉투 게이트', () => {
  it('봉투가 깨지면 bad-document를 낸다', () => {
    const issues = validateLayout({ version: 1, root: { id: null, type: 'Page' } } as never)
    expect(issues[0]?.code).toBe('bad-document')
  })

  it('봉투를 통과한 정상 레이아웃에는 이슈가 없다', () => {
    const layout = {
      version: 1,
      root: { id: 'n_000000000001', type: 'Page', children: [{ id: 'n_000000000002', type: 'Slot' }] },
    }
    expect(validateLayout(layout)).toEqual([])
  })
})
