/**
 * 화면 상태의 모델 — 페이지 문서의 `viewStates`(상태 목록)의 검증 · 저장 경계의 `checkViewStateRemoval`(편집이 새로 만든 목록 밖 가리킴).
 * 설계 spec `docs/superpowers/specs/2026-10-18-modules-states-layout-design.md` 「C1」 · 「C2」. 트리(`parent`)는 `view-state-tree.test.ts`,
 * 노드 보임의 모양 · 판정은 `visibility.test.ts`.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { CATALOG_TYPES, installCatalog } from '../src/component/catalog/index'
import { DocumentEnvelopeSchema, PageEnvelopeSchema } from '../src/envelope'
import {
  DEFAULT_VIEW_STATE,
  VIEW_STATE_DESCRIPTION_MAX,
  VIEW_STATE_NAME_MAX,
  VIEW_STATES_MAX,
  type NodeVisibility,
  type PageDocument,
  type WbNode,
} from '../src/index'
import { checkViewStateRemoval, partitionIssues, validateLayout, validatePage } from '../src/validate'

beforeAll(() => {
  installCatalog()
})

const ROOT = 'n_root'

function page(children: WbNode[], viewStates?: unknown): PageDocument {
  const doc = { version: 2, root: { id: ROOT, type: 'Page', children } } as PageDocument
  if (viewStates !== undefined) (doc as { viewStates?: unknown }).viewStates = viewStates
  return doc
}

const text = (id: string, visibility?: NodeVisibility): WbNode => ({
  id,
  type: 'Text',
  props: { content: id },
  ...(visibility === undefined ? {} : { visibility }),
})
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

  it('설명 — 여러 줄 · 상한까지 받는다(UTF-16 단위 — 페이지 설명과 같다)', () => {
    expect(VIEW_STATE_DESCRIPTION_MAX).toBe(2000)
    expect(validatePage(page([], [{ id: 's_1', name: '관리자', description: '첫 줄\n  둘째 줄 ' }]))).toEqual([])
    expect(validatePage(page([], [{ id: 's_1', name: '관리자', description: '가'.repeat(VIEW_STATE_DESCRIPTION_MAX) }]))).toEqual([])
    expect(validatePage(page([], [{ id: 's_1', name: '관리자', description: '😀'.repeat(VIEW_STATE_DESCRIPTION_MAX / 2) }]))).toEqual([])
  })

  it.each([
    ['설명 0자', [{ id: 's_1', name: '관리자', description: '' }]],
    ['설명이 공백뿐', [{ id: 's_1', name: '관리자', description: ' \n\t' }]],
    ['설명 상한 + 1', [{ id: 's_1', name: '관리자', description: '가'.repeat(VIEW_STATE_DESCRIPTION_MAX + 1) }]],
    ['설명에 짝 없는 서로게이트', [{ id: 's_1', name: '관리자', description: '앞\ud800뒤' }]],
    ['설명이 문자열이 아니다', [{ id: 's_1', name: '관리자', description: 3 }]],
    ['이름 0자', [{ id: 's_1', name: '' }]],
    ['이름 31자', [{ id: 's_1', name: '가'.repeat(31) }]],
    ['이름이 공백뿐', [{ id: 's_1', name: '   ' }]],
    ['이름 앞뒤 공백', [{ id: 's_1', name: ' 관리자' }]],
    ['이름에 줄바꿈', [{ id: 's_1', name: '관리\n자' }]],
    ['이름에 방향 제어 글자', [{ id: 's_1', name: '관리\u202e자' }]],
    ['이름에 폭 없는 글자뿐', [{ id: 's_1', name: '\u200b' }]],
    [
      '이름이 겹친다',
      [
        { id: 's_1', name: '관리자' },
        { id: 's_2', name: '관리자' },
      ],
    ],
    [
      'id 가 겹친다',
      [
        { id: 's_1', name: '관리자' },
        { id: 's_1', name: '손님' },
      ],
    ],
    ['21개', Array.from({ length: 21 }, (_, i) => ({ id: `s_${i}`, name: `상태 ${i}` }))],
    ['id 가 문자열이 아니다', [{ id: 7, name: '관리자' }]],
    ['id 가 노드 id 규칙 밖', [{ id: 's 1', name: '관리자' }]],
    ['id 가 default', [{ id: DEFAULT_VIEW_STATE, name: '관리자' }]],
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

describe('상태 영역은 카탈로그에 없다', () => {
  it('StateSwitch · StateCase 는 모르는 타입이다 — 판 1 문서는 migrateDocument 가 판 2 로 옮긴다', () => {
    expect(CATALOG_TYPES).not.toContain('StateSwitch')
    expect(CATALOG_TYPES).not.toContain('StateCase')
    expect(codes(page([{ id: 'n_sw', type: 'StateSwitch', children: [] }]))).toEqual(['unknown-type'])
  })
})

describe('상태 목록 이슈의 노드 — 노드는 `root` 아래에만 있다', () => {
  it.each<[string, unknown, string]>([
    ['이름 겹침', [ADMIN, { id: 's_guest', name: '관리자' }], '/viewStates/1/name'],
    ['이름이 글자 아님', [ADMIN, { id: 's_guest', name: 5 }], '/viewStates/1/name'],
    ['이름 앞뒤 공백', [ADMIN, { id: 's_guest', name: ' 손님' }], '/viewStates/1/name'],
  ])('%s — `nodeId`는 null(상태 id 가 아니다)', (_name, viewStates, path) => {
    const issues = validatePage(page([text('n_a')], viewStates))
    expect(issues.map((issue) => ({ code: issue.code, nodeId: issue.nodeId, path: issue.path }))).toContainEqual({
      code: 'bad-document',
      nodeId: null,
      path,
    })
    expect(issues.every((issue) => issue.nodeId === null)).toBe(true)
  })

  it('노드 이슈는 그대로 그 노드다(음성 대조)', () => {
    const issues = validatePage(page([{ id: 'n_a', type: 'Text', props: 5 } as unknown as WbNode], [ADMIN]))
    expect(issues.map((issue) => `${issue.code} ${issue.nodeId}`)).toEqual(['bad-document n_a'])
  })
})

describe('checkViewStateRemoval — 편집이 목록 밖 상태를 가리키는 보임을 새로 만듦', () => {
  const tree = [
    text('n_a', { mode: 'only', states: ['s_admin'] }),
    text('n_b', { mode: 'except', states: ['s_guest', 's_admin'] }),
    text('n_c', { mode: 'only', states: [DEFAULT_VIEW_STATE] }),
  ]
  const before = page(tree, [ADMIN, GUEST])
  const left = (after: PageDocument) =>
    checkViewStateRemoval(before, after).map((issue) => `${issue.code} ${issue.severity} ${issue.nodeId} ${issue.path}`)

  it.each<[string, PageDocument, string[]]>([
    [
      '하나를 빼면 그 상태를 가리키는 노드마다',
      page(tree, [GUEST]),
      ['state-cases-left error n_a /root/children/0/visibility', 'state-cases-left error n_b /root/children/1/visibility'],
    ],
    [
      '목록째 빼면 상태를 가리키는 노드 전부(기본만 가리키는 노드는 아니다)',
      page(tree),
      ['state-cases-left error n_a /root/children/0/visibility', 'state-cases-left error n_b /root/children/1/visibility'],
    ],
    [
      'id 를 바꾸면 옛 id 를 가리키는 노드',
      page(tree, [{ id: 's_root', name: '관리자' }, GUEST]),
      ['state-cases-left error n_a /root/children/0/visibility', 'state-cases-left error n_b /root/children/1/visibility'],
    ],
    ['보임도 함께 고치면 없음', page([text('n_b', { mode: 'except', states: ['s_guest'] })], [GUEST]), []],
    ['이름 · 순서만 바꾸면 없음', page(tree, [GUEST, { id: 's_admin', name: '운영자' }]), []],
    ['상태를 더하면 없음', page(tree, [ADMIN, GUEST, { id: 's_new', name: '새' }]), []],
    [
      '편집이 목록 밖 상태를 보임에 넣으면',
      page([...tree, text('n_new', { mode: 'only', states: ['s_gone'] })], [ADMIN, GUEST]),
      ['state-cases-left error n_new /root/children/3/visibility'],
    ],
  ])('%s', (_name, after, expected) => {
    expect(left(after)).toEqual(expected)
  })

  it('편집 전부터 같은 노드가 목록 밖을 가리키던 것은 내지 않는다 — lint 의 몫 · 그 노드에 새로 더한 밖 상태는 낸다', () => {
    const old = page(tree, [GUEST])
    expect(checkViewStateRemoval(old, page(tree, [GUEST]))).toEqual([])
    expect(checkViewStateRemoval(old, page(tree, []))).toEqual([expect.objectContaining({ nodeId: 'n_b' })])
    expect(checkViewStateRemoval(old, page([text('n_a', { mode: 'only', states: ['s_admin', 's_x'] })], [GUEST]))[0]!.message).toContain(
      's_x',
    )
  })

  it('`validatePage`는 이 코드를 안 낸다 — 문서 하나로는 «새로»를 모른다', () => {
    expect(codes(page(tree, [GUEST]))).toEqual([])
  })
})
