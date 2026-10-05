/**
 * 화면 상태의 모델 — 페이지 문서의 `viewStates`(상태 목록)와 상태 영역 노드(`StateSwitch` > `StateCase`)의 검증.
 * 설계 spec `docs/superpowers/specs/2026-10-05-page-states-design.md` 「데이터 모델」.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { CATALOG_TYPES, installCatalog } from '../src/component/catalog/index'
import { DocumentEnvelopeSchema, PageEnvelopeSchema } from '../src/envelope'
import {
  DEFAULT_CASE,
  THEMELESS_TYPES,
  VIEW_STATE_NAME_MAX,
  VIEW_STATES_MAX,
  type PageDocument,
  type WbNode,
} from '../src/index'
import { partitionIssues, validateLayout, validatePage } from '../src/validate'

beforeAll(() => {
  installCatalog()
})

const ROOT = 'n_root'

function page(children: WbNode[], viewStates?: unknown): PageDocument {
  const doc = { version: 1, root: { id: ROOT, type: 'Page', children } } as PageDocument
  if (viewStates !== undefined) (doc as { viewStates?: unknown }).viewStates = viewStates
  return doc
}

function caseOf(id: string, state: string, children: WbNode[] = []): WbNode {
  return { id, type: 'StateCase', props: { state }, children }
}

function switchOf(id: string, cases: WbNode[]): WbNode {
  return { id, type: 'StateSwitch', children: cases }
}

const text = (id: string): WbNode => ({ id, type: 'Text', props: { content: id } })
const ADMIN = { id: 's_admin', name: '관리자' }
const GUEST = { id: 's_guest', name: '비로그인' }

function codes(doc: PageDocument): string[] {
  return partitionIssues(validatePage(doc)).errors.map((issue) => issue.code)
}

describe('viewStates — 상태 목록', () => {
  it('없거나 비면 지금 페이지와 같다', () => {
    expect(validatePage(page([]))).toEqual([])
    expect(validatePage(page([], []))).toEqual([])
  })

  it('경계 안의 목록을 받는다 — 1자 · 30자 · 20개', () => {
    const many = Array.from({ length: VIEW_STATES_MAX }, (_, i) => ({ id: `s_${i}`, name: `상태 ${i}` }))
    expect(VIEW_STATES_MAX).toBe(20)
    expect(VIEW_STATE_NAME_MAX).toBe(30)
    expect(validatePage(page([], many))).toEqual([])
    expect(validatePage(page([], [{ id: 's_1', name: '가' }]))).toEqual([])
    expect(validatePage(page([], [{ id: 's_1', name: '가'.repeat(30) }]))).toEqual([])
    // 코드 포인트로 센다 — 이모지 하나가 한 글자다.
    expect(validatePage(page([], [{ id: 's_1', name: '😀'.repeat(30) }]))).toEqual([])
  })

  it.each([
    ['이름 0자', [{ id: 's_1', name: '' }]],
    ['이름 31자', [{ id: 's_1', name: '가'.repeat(31) }]],
    ['이름이 공백뿐', [{ id: 's_1', name: '   ' }]],
    ['이름 앞뒤 공백', [{ id: 's_1', name: ' 관리자' }]],
    ['이름에 줄바꿈', [{ id: 's_1', name: '관리\n자' }]],
    ['이름에 방향 제어 글자', [{ id: 's_1', name: '관리\u202e자' }]],
    ['이름에 폭 없는 글자뿐', [{ id: 's_1', name: '\u200b' }]],
    ['이름이 겹친다', [{ id: 's_1', name: '관리자' }, { id: 's_2', name: '관리자' }]],
    ['id 가 겹친다', [{ id: 's_1', name: '관리자' }, { id: 's_1', name: '손님' }]],
    ['21개', Array.from({ length: 21 }, (_, i) => ({ id: `s_${i}`, name: `상태 ${i}` }))],
    ['id 가 문자열이 아니다', [{ id: 7, name: '관리자' }]],
    ['id 가 노드 id 규칙 밖', [{ id: 's 1', name: '관리자' }]],
    ['id 가 default', [{ id: DEFAULT_CASE, name: '관리자' }]],
    ['이름이 문자열이 아니다', [{ id: 's_1', name: 3 }]],
    ['모르는 키', [{ id: 's_1', name: '관리자', role: 'admin' }]],
    ['배열이 아니다', { s_1: '관리자' }],
  ])('%s 이면 bad-document 다', (_label, viewStates) => {
    const issues = validatePage(page([], viewStates))
    expect(issues.length).toBeGreaterThan(0)
    expect(issues.every((issue) => issue.code === 'bad-document' && issue.severity === 'error')).toBe(true)
    expect(issues.every((issue) => issue.path.startsWith('/viewStates'))).toBe(true)
  })

  it('레이아웃은 상태 목록을 받지 않는다', () => {
    const layout = {
      version: 1,
      root: { id: ROOT, type: 'Page', children: [{ id: 'n_slot', type: 'Slot' }] },
      viewStates: [ADMIN],
    }
    expect(validateLayout(layout as never).map((issue) => issue.code)).toEqual(['bad-document'])
    expect(DocumentEnvelopeSchema.safeParse(layout).success).toBe(false)
    expect(PageEnvelopeSchema.safeParse(layout).success).toBe(true)
  })
})

describe('상태 영역 — StateSwitch · StateCase', () => {
  it('카탈로그에 둘이 있고 테마가 안 그리는 구조다', () => {
    expect(CATALOG_TYPES).toContain('StateSwitch')
    expect(CATALOG_TYPES).toContain('StateCase')
    expect([...THEMELESS_TYPES].sort()).toEqual(['StateCase', 'StateSwitch'])
  })

  it('기본 가지 하나 + 상태마다 하나면 오류가 없다', () => {
    const doc = page(
      [switchOf('n_sw', [caseOf('n_c0', DEFAULT_CASE, [text('n_t0')]), caseOf('n_c1', ADMIN.id, [text('n_t1')])])],
      [ADMIN, GUEST],
    )
    expect(validatePage(doc)).toEqual([])
  })

  it('목록에 없는 상태를 가리키는 가지는 검증 오류가 아니다(lint 몫)', () => {
    const doc = page([switchOf('n_sw', [caseOf('n_c0', DEFAULT_CASE), caseOf('n_c1', 's_gone')])])
    expect(codes(doc)).toEqual([])
  })

  it('상태 영역 안의 상태 영역을 받는다', () => {
    const inner = switchOf('n_in', [caseOf('n_ic0', DEFAULT_CASE)])
    const doc = page([switchOf('n_sw', [caseOf('n_c0', DEFAULT_CASE, [inner])])])
    expect(codes(doc)).toEqual([])
  })

  it('기본 가지가 없으면 state-case-default', () => {
    const doc = page([switchOf('n_sw', [caseOf('n_c1', ADMIN.id)])], [ADMIN])
    expect(validatePage(doc)).toContainEqual(
      expect.objectContaining({ code: 'state-case-default', severity: 'error', nodeId: 'n_sw', path: '/root/children/0' }),
    )
  })

  it('가지가 하나도 없으면 state-case-default', () => {
    expect(codes(page([switchOf('n_sw', [])]))).toEqual(['state-case-default'])
  })

  it('기본 가지가 둘이면 state-case-default', () => {
    const doc = page([switchOf('n_sw', [caseOf('n_c0', DEFAULT_CASE), caseOf('n_c1', DEFAULT_CASE)])])
    expect(codes(doc)).toEqual(['state-case-default'])
  })

  it('한 상태에 가지가 둘이면 state-case-duplicate', () => {
    const doc = page(
      [switchOf('n_sw', [caseOf('n_c0', DEFAULT_CASE), caseOf('n_c1', ADMIN.id), caseOf('n_c2', ADMIN.id)])],
      [ADMIN],
    )
    expect(validatePage(doc)).toContainEqual(
      expect.objectContaining({ code: 'state-case-duplicate', severity: 'error', nodeId: 'n_c2', path: '/root/children/0/children/2' }),
    )
    expect(codes(doc)).toEqual(['state-case-duplicate'])
  })

  it('StateCase 가 StateSwitch 밖이면 state-case-outside', () => {
    const doc = page([{ id: 'n_flex', type: 'Flex', children: [caseOf('n_c0', DEFAULT_CASE)] }])
    expect(validatePage(doc)).toContainEqual(
      expect.objectContaining({ code: 'state-case-outside', severity: 'error', nodeId: 'n_c0', path: '/root/children/0/children/0' }),
    )
  })

  it('StateCase 가 페이지 바로 아래면 state-case-outside', () => {
    expect(codes(page([caseOf('n_c0', DEFAULT_CASE)]))).toEqual(['state-case-outside'])
  })

  it('StateSwitch 아래에 다른 타입이 서면 state-switch-child', () => {
    const doc = page([switchOf('n_sw', [caseOf('n_c0', DEFAULT_CASE), text('n_t')])])
    expect(validatePage(doc)).toContainEqual(
      expect.objectContaining({ code: 'state-switch-child', severity: 'error', nodeId: 'n_t', path: '/root/children/0/children/1' }),
    )
    expect(codes(doc)).toEqual(['state-switch-child'])
  })

  it('StateCase 의 state 가 노드 id 규칙 밖이면 invalid-props', () => {
    const doc = page([switchOf('n_sw', [caseOf('n_c0', DEFAULT_CASE), caseOf('n_c1', '관 리')])])
    expect(codes(doc)).toEqual(['invalid-props'])
  })

  it('StateSwitch 는 props 를 받지 않는다', () => {
    const doc = page([{ ...switchOf('n_sw', [caseOf('n_c0', DEFAULT_CASE)]), props: { state: DEFAULT_CASE } }])
    expect(codes(doc)).toEqual(['invalid-props'])
  })

  it('레이아웃도 같은 구조 규칙을 본다', () => {
    const layout = {
      version: 1,
      root: { id: ROOT, type: 'Page', children: [{ id: 'n_slot', type: 'Slot' }, switchOf('n_sw', [])] },
    }
    expect(partitionIssues(validateLayout(layout as never)).errors.map((issue) => issue.code)).toEqual(['state-case-default'])
  })
})
