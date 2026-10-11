/**
 * `services/restore-plan.ts` — payload와 현재를 견주어 **조작 목록**을 만드는 순수 함수.
 *
 * **여기가 FK 순서를 고정하는 자리다** — *"지울 때는 페이지 먼저·자식 메뉴 먼저,
 * 만들 때는 부모 메뉴 먼저"*. 그 순서는 DB를 켜지 않고도 재진다 — `steps`의 `kind` 열이
 * 그대로 순서이므로 케이스가 그 열을 통째로 본다.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { CURRENT_DOCUMENT_VERSION, type PageDocument } from '@wirebound/schema'
import { ensureCatalog } from '../src/schema-setup'
import { planRestore, type RestoreCurrentState, type RestoreStep } from '../src/services/restore-plan'
import { SNAPSHOT_PAYLOAD_VERSION, type SnapshotPayload } from '@wirebound/themes'

const MENU_A = '11111111-1111-4111-8111-111111111111'
const MENU_B = '22222222-2222-4222-8222-222222222222'
const MENU_C = '33333333-3333-4333-8333-333333333333'
const PAGE_A = '44444444-4444-4444-8444-444444444444'
const PAGE_B = '55555555-5555-4555-8555-555555555555'
const COMMENT_A = '66666666-6666-4666-8666-666666666666'
const COMMENT_B = '77777777-7777-4777-8777-777777777777'
const LAYOUT_A = '88888888-8888-4888-8888-888888888888'
const USER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

/**
 * 문서 하나. **`Page`의 props는 `z.strictObject({})`라 아무 키도 못 받는다** —
 * `props: { title }`로 문서를 가르면 `invalid-props`로 전부 막힌다(계획이 아니라
 * `invalid-document`가 나온다). 그래서 내용은 **자식 노드의 id**로 가른다.
 */
function doc(text: string, version = CURRENT_DOCUMENT_VERSION): PageDocument {
  return {
    version,
    root: { id: 'n_root', type: 'Page', children: [{ id: nodeIdFor(text), type: 'Section', props: {} }] },
  } as PageDocument
}

/** 노드 id는 `/^[A-Za-z0-9_-]{1,64}$/`다 — 한글을 그대로 넣으면 봉투 검증에 걸린다. */
function nodeIdFor(text: string): string {
  return `n_${[...text].map((ch) => ch.codePointAt(0)!.toString(16)).join('')}`
}

function payload(over: Partial<SnapshotPayload> = {}): SnapshotPayload {
  return {
    payloadVersion: SNAPSHOT_PAYLOAD_VERSION,
    capturedAt: '2026-08-12T00:00:00.000Z',
    menu: [],
    pages: [],
    layouts: [],
    comments: [],
    ...over,
  }
}

function current(over: Partial<RestoreCurrentState> = {}): RestoreCurrentState {
  return { menu: [], pages: [], layouts: [], comments: [], ...over }
}

function menuNode(id: string, over: Partial<{ parentId: string | null; title: string; sortOrder: number }> = {}) {
  return { id, parentId: null, title: `메뉴 ${id.slice(0, 4)}`, sortOrder: 0, ...over }
}

function page(id: string, over: Partial<Record<string, unknown>> = {}) {
  return {
    id,
    menuNodeId: MENU_A,
    title: `페이지 ${id.slice(0, 4)}`,
    description: null,
    sortOrder: 0,
    schemaVersion: CURRENT_DOCUMENT_VERSION,
    schema: doc('본문'),
    headSeq: 0,
    ...over,
  } as never
}

function comment(id: string, over: Partial<Record<string, unknown>> = {}) {
  return {
    id,
    pageId: PAGE_A,
    nodeId: 'n_root',
    body: '코멘트',
    authorId: USER_A,
    authorName: '작성자',
    createdAt: '2026-08-12T00:00:00.000Z',
    updatedAt: '2026-08-12T00:00:00.000Z',
    ...over,
  } as never
}

// `validatePage`(만들어지는 페이지의 문서 검사)가 레지스트리를 필요로 한다 —
// 비어 있으면 모든 노드가 `unknown-type`이 된다(`schema-setup.ts`).
beforeAll(() => {
  ensureCatalog()
})

function kinds(steps: RestoreStep[]): string[] {
  return steps.map((step) => step.kind)
}

function planOf(p: SnapshotPayload, c: RestoreCurrentState) {
  const outcome = planRestore(p, c)
  if (outcome.kind !== 'plan') throw new Error(`계획이 아니라 ${outcome.kind}이다: ${JSON.stringify(outcome)}`)
  return outcome.plan
}

describe('아무것도 바뀌지 않았으면 조작이 없다', () => {
  it('빈 프로젝트 ↔ 빈 payload', () => {
    const plan = planOf(payload(), current())
    expect(plan.steps).toEqual([])
    expect(plan.summary.pages).toEqual({
      created: 0,
      metaUpdated: 0,
      schemaChanged: 0,
      schemaUnchanged: 0,
      deleted: 0,
    })
  })

  it('내용이 같은 페이지는 스키마를 쓰지 않는다', () => {
    const p = payload({ menu: [menuNode(MENU_A)], pages: [page(PAGE_A)] })
    const c = current({ menu: [menuNode(MENU_A)], pages: [page(PAGE_A)] })

    const plan = planOf(p, c)

    expect(kinds(plan.steps)).toEqual([])
    expect(plan.summary.pages.schemaUnchanged).toBe(1)
    expect(plan.summary.pages.schemaChanged).toBe(0)
  })

  it('headSeq만 달라도 내용이 같으면 쓰지 않는다 — "headSeq로 비교하지 마라"', () => {
    const p = payload({ menu: [menuNode(MENU_A)], pages: [page(PAGE_A, { headSeq: 3 })] })
    const c = current({ menu: [menuNode(MENU_A)], pages: [page(PAGE_A, { headSeq: 9 })] })

    expect(planOf(p, c).summary.pages.schemaUnchanged).toBe(1)
    expect(kinds(planOf(p, c).steps)).toEqual([])
  })

  it('내용이 다르면 쓴다', () => {
    const p = payload({ menu: [menuNode(MENU_A)], pages: [page(PAGE_A, { schema: doc('그때') })] })
    const c = current({ menu: [menuNode(MENU_A)], pages: [page(PAGE_A, { schema: doc('지금') })] })

    const plan = planOf(p, c)
    expect(kinds(plan.steps)).toEqual(['write-page-schema'])
    expect(plan.summary.pages.schemaChanged).toBe(1)
    expect(plan.summary.pages.schemaUnchanged).toBe(0)
  })
})

describe('FK 순서', () => {
  it('지울 때: 코멘트 → 페이지 → 메뉴', () => {
    const p = payload()
    const c = current({
      menu: [menuNode(MENU_A)],
      pages: [page(PAGE_A)],
      comments: [{ id: COMMENT_A, pageId: PAGE_A, body: '코멘트' }],
    })

    expect(kinds(planOf(p, c).steps)).toEqual(['delete-comment', 'delete-page', 'delete-menu'])
  })

  it('지울 때 메뉴는 자식이 부모보다 먼저다 — parent_id가 RESTRICT다', () => {
    const p = payload()
    // A ← B ← C (C가 가장 깊다)
    const c = current({
      menu: [menuNode(MENU_A), menuNode(MENU_B, { parentId: MENU_A }), menuNode(MENU_C, { parentId: MENU_B })],
    })

    const steps = planOf(p, c).steps.filter((step) => step.kind === 'delete-menu')
    expect(steps.map((step) => (step as { id: string }).id)).toEqual([MENU_C, MENU_B, MENU_A])
  })

  it('만들 때 메뉴는 부모가 자식보다 먼저다', () => {
    // payload가 자식을 먼저 늘어놓아도 계획은 부모를 앞세운다.
    const p = payload({
      menu: [menuNode(MENU_C, { parentId: MENU_B }), menuNode(MENU_B, { parentId: MENU_A }), menuNode(MENU_A)],
    })

    const steps = planOf(p, current()).steps.filter((step) => step.kind === 'create-menu')
    expect(steps.map((step) => (step as { node: { id: string } }).node.id)).toEqual([MENU_A, MENU_B, MENU_C])
  })

  it('만들 때: 메뉴 → 페이지 → 코멘트', () => {
    const p = payload({
      menu: [menuNode(MENU_A)],
      pages: [page(PAGE_A)],
      comments: [comment(COMMENT_A)],
    })

    expect(kinds(planOf(p, current()).steps)).toEqual(['create-menu', 'create-page', 'create-comment'])
  })

  /**
   * **살아남는 자식을 먼저 옮기지 않으면 부모 삭제가 RESTRICT에 걸린다.**
   * 지금 B의 부모가 A인데 A는 payload에 없고 B는 있다 — B를 루트로 옮긴 **뒤에야** A를 지울 수 있다.
   */
  it('살아남는 자식의 재부모가 부모 삭제보다 먼저다', () => {
    const p = payload({ menu: [menuNode(MENU_B, { parentId: null })] })
    const c = current({ menu: [menuNode(MENU_A), menuNode(MENU_B, { parentId: MENU_A })] })

    expect(kinds(planOf(p, c).steps)).toEqual(['update-menu', 'delete-menu'])
  })

  /** 페이지도 같다 — 지울 메뉴 밑에 있던 페이지가 살아남으면 먼저 옮겨야 한다. */
  it('살아남는 페이지의 메뉴 이동이 메뉴 삭제보다 먼저다', () => {
    const p = payload({ menu: [menuNode(MENU_B)], pages: [page(PAGE_A, { menuNodeId: MENU_B })] })
    const c = current({
      menu: [menuNode(MENU_A), menuNode(MENU_B)],
      pages: [page(PAGE_A, { menuNodeId: MENU_A })],
    })

    expect(kinds(planOf(p, c).steps)).toEqual(['update-page-meta', 'delete-menu'])
  })

  /** 새 메뉴로 옮기는 경우 — 그 메뉴를 먼저 만들어야 한다. */
  it('메뉴 생성이 페이지 이동보다 먼저다', () => {
    const p = payload({ menu: [menuNode(MENU_A), menuNode(MENU_B)], pages: [page(PAGE_A, { menuNodeId: MENU_B })] })
    const c = current({ menu: [menuNode(MENU_A)], pages: [page(PAGE_A, { menuNodeId: MENU_A })] })

    expect(kinds(planOf(p, c).steps)).toEqual(['create-menu', 'update-page-meta'])
  })
})

describe('메뉴·페이지·코멘트의 변경 판정', () => {
  it('제목이 다르면 갱신한다', () => {
    const p = payload({ menu: [menuNode(MENU_A, { title: '그때' })] })
    const c = current({ menu: [menuNode(MENU_A, { title: '지금' })] })
    expect(kinds(planOf(p, c).steps)).toEqual(['update-menu'])
  })

  it('sortOrder만 달라도 갱신한다', () => {
    const p = payload({ menu: [menuNode(MENU_A, { sortOrder: 0 })] })
    const c = current({ menu: [menuNode(MENU_A, { sortOrder: 5 })] })
    expect(kinds(planOf(p, c).steps)).toEqual(['update-menu'])
  })

  it('페이지 설명만 달라도 메타를 갱신한다', () => {
    const p = payload({ menu: [menuNode(MENU_A)], pages: [page(PAGE_A, { description: '그때' })] })
    const c = current({ menu: [menuNode(MENU_A)], pages: [page(PAGE_A, { description: null })] })
    expect(kinds(planOf(p, c).steps)).toEqual(['update-page-meta'])
  })

  it('코멘트 본문이 다르면 갱신한다', () => {
    const p = payload({
      menu: [menuNode(MENU_A)],
      pages: [page(PAGE_A)],
      comments: [comment(COMMENT_A, { body: '그때' })],
    })
    const c = current({
      menu: [menuNode(MENU_A)],
      pages: [page(PAGE_A)],
      comments: [{ id: COMMENT_A, pageId: PAGE_A, body: '지금' }],
    })
    expect(kinds(planOf(p, c).steps)).toEqual(['update-comment'])
  })
})

describe('레이아웃', () => {
  it('레이아웃 id 집합이 다르면 계획을 내지 않는다 (409)', () => {
    const p = payload({ layouts: [{ id: LAYOUT_A, name: 'L', schema: doc('x') as never }] })
    const c = current({ layouts: [] })

    const outcome = planRestore(p, c)
    expect(outcome.kind).toBe('layout-mismatch')
  })

  it('레이아웃 id 집합이 같으면 레이아웃은 아무 단계도 내지 않는다', () => {
    const p = payload({ layouts: [{ id: LAYOUT_A, name: 'L', schema: doc('x') as never }] })
    const c = current({ layouts: [{ id: LAYOUT_A }] })
    expect(kinds(planOf(p, c).steps)).toEqual([])
  })
})

describe('미지원 문서 버전 — 설계서 「스키마 마이그레이션」', () => {
  it('payload의 문서가 미지원이면 어느 페이지가 어떤 버전인지 낸다', () => {
    const p = payload({
      menu: [menuNode(MENU_A)],
      pages: [page(PAGE_A, { schemaVersion: 999, schema: doc('x', 999) })],
    })
    const outcome = planRestore(p, current())

    expect(outcome.kind).toBe('unsupported-version')
    if (outcome.kind !== 'unsupported-version') return
    expect(outcome.pages).toEqual([{ id: PAGE_A, title: `페이지 ${PAGE_A.slice(0, 4)}`, version: 999, source: 'snapshot' }])
  })

  it('저장된 문서가 미지원이면 그것도 막는다 — 두 방향 모두', () => {
    const p = payload({ menu: [menuNode(MENU_A)], pages: [page(PAGE_A)] })
    const c = current({ menu: [menuNode(MENU_A)], pages: [page(PAGE_A, { schemaVersion: 999, schema: doc('x', 999) })] })

    const outcome = planRestore(p, c)
    expect(outcome.kind).toBe('unsupported-version')
    if (outcome.kind !== 'unsupported-version') return
    expect(outcome.pages.map((entry) => entry.source)).toEqual(['stored'])
  })

  /** 지워질 페이지의 버전은 막지 않는다 — 지우는 데 마이그레이션이 필요 없다. */
  it('지워질 페이지가 미지원 버전이어도 막지 않는다', () => {
    const p = payload()
    const c = current({ menu: [menuNode(MENU_A)], pages: [page(PAGE_A, { schemaVersion: 999, schema: doc('x', 999) })] })

    expect(planRestore(p, c).kind).toBe('plan')
  })

  /**
   * **좁힘의 둘째 칸.** 양쪽 문서가 **같아서 쓸 것이 없는** 페이지는 막지
   * 않는다. 막으면 그런 페이지가 하나 생긴 프로젝트는 **어떤 스냅샷으로도 되돌아갈 수 없게**
   * 된다 — 그 페이지와 무관한 복원까지 전부 400이다.
   *
   * 복원은 이미 *"내용이 같으면 아무것도 쓰지 않는다"*(위 *"내용이 같은 페이지는 스키마를
   * 쓰지 않는다"*)이므로, 쓰지 않는 페이지를 버전 때문에 막는 것은 그 결정과 일관되지 않는다.
   */
  it('양쪽이 같아 쓸 것이 없으면 미지원 버전이어도 막지 않는다', () => {
    const same = doc('x', 999)
    const p = payload({ menu: [menuNode(MENU_A)], pages: [page(PAGE_A, { schemaVersion: 999, schema: same })] })
    const c = current({ menu: [menuNode(MENU_A)], pages: [page(PAGE_A, { schemaVersion: 999, schema: same })] })

    const outcome = planRestore(p, c)
    expect(outcome.kind).toBe('plan')
    if (outcome.kind !== 'plan') return
    // **쓰지 않는다** — 그대로인 페이지로 세어진다.
    expect(kinds(outcome.plan.steps)).toEqual([])
    expect(outcome.plan.summary.pages.schemaUnchanged).toBe(1)
  })

  /**
   * **좁힘이 다른 갈래를 흔들지 않는다 — 같은 판에서 내용만 달라지면 다시 막힌다.**
   * 이것이 없으면 위 케이스가 *"999면 늘 통과한다"*로도 통과한다.
   */
  it('같은 999라도 내용이 다르면 막는다 — 그때는 쓰기 때문이다', () => {
    const p = payload({ menu: [menuNode(MENU_A)], pages: [page(PAGE_A, { schemaVersion: 999, schema: doc('그때', 999) })] })
    const c = current({ menu: [menuNode(MENU_A)], pages: [page(PAGE_A, { schemaVersion: 999, schema: doc('지금', 999) })] })

    const outcome = planRestore(p, c)
    expect(outcome.kind).toBe('unsupported-version')
    if (outcome.kind !== 'unsupported-version') return
    // 두 방향이 **함께** 잡힌다 — 저장된 것도 999이고 payload의 것도 999다.
    expect(outcome.pages.map((entry) => entry.source).sort()).toEqual(['snapshot', 'stored'])
  })

  /**
   * **만들어지는 페이지는 여전히 막는다.** 그것은 쓰기이고, 999 문서를 새로 심으면
   * **열 수 없는 페이지를 복원이 만들어 내는** 셈이 된다.
   */
  it('되살아날 페이지가 미지원 버전이면 막는다 — 그것은 쓰기다', () => {
    const p = payload({ menu: [menuNode(MENU_A)], pages: [page(PAGE_A, { schemaVersion: 999, schema: doc('x', 999) })] })

    const outcome = planRestore(p, current({ menu: [menuNode(MENU_A)] }))
    expect(outcome.kind).toBe('unsupported-version')
    if (outcome.kind !== 'unsupported-version') return
    expect(outcome.pages.map((entry) => entry.source)).toEqual(['snapshot'])
  })

  /**
   * **좁힘이 페이지 단위인지 프로젝트 단위인지 가른다.** 건드리지 않는 999 페이지가 하나
   * 있어도, **다른 페이지의 복원은 그대로 일어나야 한다** — 그것이 이 좁힘의 목적이다.
   */
  it('건드리지 않는 999 페이지가 있어도 다른 페이지는 되돌아간다', () => {
    const frozen = doc('그대로', 999)
    const p = payload({
      menu: [menuNode(MENU_A)],
      pages: [page(PAGE_A, { schemaVersion: 999, schema: frozen }), page(PAGE_B, { schema: doc('그때') })],
    })
    const c = current({
      menu: [menuNode(MENU_A)],
      pages: [page(PAGE_A, { schemaVersion: 999, schema: frozen }), page(PAGE_B, { schema: doc('지금') })],
    })

    const outcome = planRestore(p, c)
    expect(outcome.kind).toBe('plan')
    if (outcome.kind !== 'plan') return
    expect(kinds(outcome.plan.steps)).toEqual(['write-page-schema'])
    expect(outcome.plan.summary.pages).toMatchObject({ schemaChanged: 1, schemaUnchanged: 1 })
  })
})

describe('payload 자체가 어긋나 있으면 쓰기 전에 막는다', () => {
  it('페이지가 payload에 없는 메뉴를 가리키면', () => {
    const p = payload({ pages: [page(PAGE_A, { menuNodeId: MENU_A })] })
    const outcome = planRestore(p, current())
    expect(outcome.kind).toBe('dangling-reference')
  })

  it('코멘트가 payload에 없는 페이지를 가리키면', () => {
    const p = payload({ menu: [menuNode(MENU_A)], comments: [comment(COMMENT_A, { pageId: PAGE_B })] })
    const outcome = planRestore(p, current())
    expect(outcome.kind).toBe('dangling-reference')
  })

  it('메뉴가 payload에 없는 부모를 가리키면', () => {
    const p = payload({ menu: [menuNode(MENU_B, { parentId: MENU_A })] })
    expect(planRestore(p, current()).kind).toBe('dangling-reference')
  })
})

describe('요약이 세는 것', () => {
  it('만든 것·바꾼 것·지운 것을 자원마다 센다', () => {
    const p = payload({
      menu: [menuNode(MENU_A), menuNode(MENU_B)],
      pages: [page(PAGE_A, { schema: doc('그때') }), page(PAGE_B)],
      comments: [comment(COMMENT_A)],
    })
    const c = current({
      menu: [menuNode(MENU_A), menuNode(MENU_C)],
      pages: [page(PAGE_A, { schema: doc('지금') })],
      comments: [{ id: COMMENT_B, pageId: PAGE_A, body: '지울 코멘트' }],
    })

    const plan = planOf(p, c)
    expect(plan.summary).toEqual({
      menu: { created: 1, updated: 0, deleted: 1 },
      pages: { created: 1, metaUpdated: 0, schemaChanged: 1, schemaUnchanged: 0, deleted: 0 },
      comments: { created: 1, updated: 0, deleted: 1 },
    })
  })
})
