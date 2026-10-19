/**
 * 가져오기의 순수 부분(설계서 「페이지 JSON」). **id를 재발급하고 참조 셋을 함께 옮긴다.**
 *
 * `remapNodeIds`가 내는 `mapping`은 **받는 쪽이 코멘트에 적용해야 한다** — 트리만 옮기고
 * 코멘트를 안 옮기면 코멘트가 파일의 옛 id를 가리킨 채 들어간다. 그 자리를 잰다.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { installCatalog } from '../src/component/catalog/index'
import { WIREBOUND_PAGE_VERSION, pageJsonText, readPageJson, toPageJson } from '../src/page-json/envelope'
import { gatePageImport, planPageImport } from '../src/page-json/import'
import { CURRENT_DOCUMENT_VERSION } from '../src/migrate'
import type { PageDocument } from '../src/node'
import { collectNodeIds, walkNodes } from '../src/tree'
import { partitionIssues, validatePage } from '../src/validate'

beforeAll(() => {
  installCatalog()
})

/** 결정적인 id 발급기. 케이스가 새 id를 이름으로 집을 수 있어야 한다. */
function counter(): () => string {
  let next = 0
  return () => {
    next += 1
    return `new_${next}`
  }
}

const DOCUMENT: PageDocument = {
  version: 1,
  root: {
    id: 'file_root',
    type: 'Page',
    children: [
      {
        id: 'file_form',
        type: 'SearchForm',
        marker: 2,
        props: { collapsed: false },
        interactions: [
          {
            on: 'submit',
            actions: [
              { type: 'setVisible', target: 'file_list', value: true },
              // 트리 밖 참조 — 리매핑 대상이 아니다.
              { type: 'navigate', target: 'page:other' },
            ],
          },
        ],
      },
      { id: 'file_list', type: 'List', marker: 1 },
    ],
  },
}

const COMMENTS = [
  { nodeId: 'file_list', body: '목록은 10개씩' },
  { nodeId: 'file_form', body: '검색 조건은 AND 결합' },
]

function idsOf(document: PageDocument): string[] {
  return collectNodeIds(document.root)
}

function markersOf(document: PageDocument): (number | undefined)[] {
  return [...walkNodes(document.root)].map((visit) => visit.node.marker)
}

describe('가져오기 계획', () => {
  it('트리의 모든 노드가 새 id를 받는다', () => {
    const plan = planPageImport(DOCUMENT, COMMENTS, counter())

    expect(idsOf(plan.document)).toEqual(['new_1', 'new_2', 'new_3'])
    // 파일의 id는 하나도 남지 않는다.
    expect(idsOf(plan.document).some((id) => idsOf(DOCUMENT).includes(id))).toBe(false)
  })

  it('코멘트의 nodeId를 같은 맵으로 옮긴다', () => {
    const plan = planPageImport(DOCUMENT, COMMENTS, counter())
    const ids = new Set(idsOf(plan.document))

    expect(plan.comments.map((comment) => comment.nodeId)).toEqual(['new_3', 'new_2'])
    // 옮긴 값이 결과 문서 안의 노드를 실제로 가리킨다.
    expect(plan.comments.every((comment) => ids.has(comment.nodeId))).toBe(true)
    expect(plan.comments.map((comment) => comment.body)).toEqual(['목록은 10개씩', '검색 조건은 AND 결합'])
  })

  it('상호작용 target도 함께 옮겨지고, 트리 밖 참조는 그대로다', () => {
    const plan = planPageImport(DOCUMENT, COMMENTS, counter())
    const form = plan.document.root.children?.[0]
    const actions = form?.interactions?.[0]?.actions ?? []

    expect(actions.map((action) => ('target' in action ? action.target : null))).toEqual(['new_3', 'page:other'])
  })

  it('번호는 문서에 그대로 살아 돌아온다', () => {
    const plan = planPageImport(DOCUMENT, COMMENTS, counter())

    expect(markersOf(plan.document)).toEqual(markersOf(DOCUMENT))
  })

  it('버전은 손대지 않는다 — 올리는 것은 부르는 쪽이다', () => {
    const plan = planPageImport({ ...DOCUMENT, version: 1 }, [], counter())

    expect(plan.document.version).toBe(1)
  })

  it('같은 노드를 가리키는 코멘트 둘은 같은 새 id로 간다', () => {
    const plan = planPageImport(
      DOCUMENT,
      [
        { nodeId: 'file_list', body: '먼저' },
        { nodeId: 'file_list', body: '나중' },
      ],
      counter(),
    )

    expect(plan.comments[0]?.nodeId).toBe(plan.comments[1]?.nodeId)
  })

  it('파일의 트리에 없는 노드를 가리킨 코멘트는 버리지 않고 넣으며, 갈라 세운다', () => {
    const plan = planPageImport(DOCUMENT, [...COMMENTS, { nodeId: 'file_gone', body: '지워진 노드에 붙어 있던 말' }], counter())

    // **본문이 사라지지 않는다.** 버리면 사용자가 적은 것이 소리 없이 없어진다.
    expect(plan.comments.map((comment) => comment.body)).toContain('지워진 노드에 붙어 있던 말')
    // **옛 id를 그대로 든다** — 옮길 곳이 없다.
    expect(plan.dangling.map((comment) => comment.nodeId)).toEqual(['file_gone'])
    // 성한 것은 끊긴 것으로 세지 않는다.
    expect(plan.dangling).toHaveLength(1)
  })

  it('끊긴 코멘트가 `comments`에도 그대로 들어 있다 — 두 목록을 겹쳐 넣으면 안 된다', () => {
    const dangling = { nodeId: 'file_gone', body: '가' }
    const plan = planPageImport(DOCUMENT, [dangling], counter())

    expect(plan.comments).toHaveLength(1)
    expect(plan.dangling[0]).toBe(plan.comments[0])
  })

  it('입력과 값을 공유하지 않는다 — `remapNodeIds`의 계약이 여기까지 닿는다', () => {
    const plan = planPageImport(DOCUMENT, COMMENTS, counter())
    const form = plan.document.root.children?.[0]

    // 결과를 고쳐도 파일의 문서는 그대로다. 입력이 오래 사는 객체(초안 스토어, 모듈 상수)일
    // 때 이 공유가 프로세스 수명 내내 남는다.
    if (form?.props !== undefined) form.props.collapsed = true
    expect(DOCUMENT.root.children?.[0]?.props?.collapsed).toBe(false)
  })

  it('파일의 중복 id는 결과에도 중복으로 남아 검증이 그것을 말한다', () => {
    // 프로브는 못 보지만 결과 문서 전체는 본다.
    const duplicated: PageDocument = {
      version: 1,
      root: {
        id: 'file_root',
        type: 'Page',
        children: [
          { id: 'same', type: 'List' },
          { id: 'same', type: 'List' },
        ],
      },
    }
    const plan = planPageImport(duplicated, [], counter())
    const ids = idsOf(plan.document)

    expect(new Set(ids).size).toBeLessThan(ids.length)
    expect(partitionIssues(validatePage(plan.document)).errors.map((issue) => issue.code)).toContain('duplicate-id')
  })

  it('D8 — 검증을 리매핑 전 문서로 하면 이슈가 파일의 id를 가리킨다', () => {
    const broken: PageDocument = {
      version: 1,
      root: { id: 'file_root', type: 'Page', children: [{ id: 'file_odd', type: '없는타입' }] },
    }
    const plan = planPageImport(broken, [], counter())

    const before = partitionIssues(validatePage(broken)).errors
    const after = partitionIssues(validatePage(plan.document)).errors

    // 같은 이슈이고 같은 자리인데 **가리키는 id가 다르다.** 사용자에게 남는 것은 파일이므로
    // 파일의 id를 말해야 한다.
    expect(after.map((issue) => `${issue.code} ${issue.path}`)).toEqual(before.map((issue) => `${issue.code} ${issue.path}`))
    expect(before.map((issue) => issue.nodeId)).toContain('file_odd')
    expect(after.map((issue) => issue.nodeId)).not.toContain('file_odd')
  })
})

describe('가져오기 게이트 — 서버와 화면이 같은 함수를 부른다', () => {
  /**
   * **이 함수가 하나여야 한다.** 서버만 이 검사를 돌리고 미리보기가 봉투에서 멈추면, 같은
   * 파일을 미리보기는 `ready`로 보이고 서버는 400·422로 거절한다. 아래 셋이 그렇게 갈리는
   * 입력이고, **같은 파일로 세 층의 케이스가 선다:** 여기(게이트) ·
   * `apps/api/test/page-import.test.ts`(서버 상태) · `apps/web/…/page-json.test.tsx`(미리보기).
   */
  function envelopeOf(schema: PageDocument) {
    return {
      wireboundVersion: WIREBOUND_PAGE_VERSION,
      page: { title: '가져온 목록', description: null },
      schema,
      comments: [],
    }
  }

  it('지원하지 않는 문서 버전을 막고 그 값을 말한다', () => {
    const gate = gatePageImport(envelopeOf({ version: 999, root: { id: 'file_root', type: 'Page' } }))

    expect(gate.ok).toBe(false)
    if (gate.ok || gate.reason !== 'unsupported-version') return
    expect(gate.message).toContain('999')
  })

  it('카탈로그에 없는 타입을 막고 **파일의 노드 id**를 가리킨다', () => {
    const gate = gatePageImport(
      envelopeOf({
        version: 1,
        root: { id: 'file_root', type: 'Page', children: [{ id: 'file_odd', type: '없는타입' }] },
      }),
    )

    expect(gate.ok).toBe(false)
    if (gate.ok || gate.reason !== 'invalid-document') return
    expect(gate.issues.map((issue) => issue.nodeId)).toContain('file_odd')
  })

  it('duplicate-id를 막는다', () => {
    const gate = gatePageImport(
      envelopeOf({
        version: 1,
        root: {
          id: 'file_root',
          type: 'Page',
          children: [
            { id: 'same', type: 'List' },
            { id: 'same', type: 'List' },
          ],
        },
      }),
    )

    expect(gate.ok).toBe(false)
    if (gate.ok || gate.reason !== 'invalid-document') return
    expect(gate.issues.map((issue) => issue.code)).toContain('duplicate-id')
  })

  it('경고만 있으면 막지 않고 실어 낸다 — 화면도 서버도 이것으로 막지 않는다', () => {
    // `Field`는 `variantFrom: 'control'`이라 노드가 든 `variant`가 버려지고 경고가 난다.
    const gate = gatePageImport(
      envelopeOf({
        version: 1,
        root: {
          id: 'file_root',
          type: 'Page',
          children: [{ id: 'file_field', type: 'Field', props: { label: '이름', control: 'text' }, variant: 'x' }],
        },
      }),
    )

    expect(gate.ok).toBe(true)
    if (!gate.ok) return
    expect(gate.warnings.map((issue) => issue.code)).toContain('ignored-variant')
    expect(gate.warnings.every((issue) => issue.severity === 'warning')).toBe(true)
  })

  it('막을 때 **경고까지 함께** 싣는다 — 서버 응답과 같은 관례다', () => {
    const gate = gatePageImport(
      envelopeOf({
        version: 1,
        root: {
          id: 'file_root',
          type: 'Page',
          children: [
            { id: 'file_odd', type: '없는타입' },
            { id: 'file_field', type: 'Field', props: { label: '이름', control: 'text' }, variant: 'x' },
          ],
        },
      }),
    )

    expect(gate.ok).toBe(false)
    if (gate.ok || gate.reason !== 'invalid-document') return
    expect(gate.issues.some((issue) => issue.severity === 'warning')).toBe(true)
    expect(gate.issues.some((issue) => issue.severity === 'error')).toBe(true)
  })

  it('멀쩡한 파일은 올린 문서를 낸다', () => {
    const gate = gatePageImport(envelopeOf(DOCUMENT))

    expect(gate.ok).toBe(true)
    if (!gate.ok) return
    expect(gate.document.version).toBe(CURRENT_DOCUMENT_VERSION)
    expect(collectNodeIds(gate.document.root)).toEqual(collectNodeIds(DOCUMENT.root))
  })
})

describe('왕복 — 내보낸 것을 다시 가져오면', () => {
  it('id는 바뀌고 구조·본문·번호는 같다', () => {
    const text = pageJsonText(toPageJson({ page: { title: '회원 목록', description: null }, document: DOCUMENT, comments: COMMENTS }))
    const result = readPageJson(text)
    expect(result.status).toBe('read')
    if (result.status !== 'read') return

    const plan = planPageImport(result.file.schema, result.file.comments, counter())

    // 구조 — 타입을 트리 순서대로.
    expect([...walkNodes(plan.document.root)].map((visit) => visit.node.type)).toEqual(
      [...walkNodes(DOCUMENT.root)].map((visit) => visit.node.type),
    )
    // 번호.
    expect(markersOf(plan.document)).toEqual(markersOf(DOCUMENT))
    // 본문.
    expect(plan.comments.map((comment) => comment.body)).toEqual(COMMENTS.map((c) => c.body))
    // 코멘트가 가리키는 **노드의 타입**이 같다 — id는 달라도 붙은 자리는 같다.
    const typeOf = (document: PageDocument, nodeId: string): string | undefined =>
      [...walkNodes(document.root)].find((visit) => visit.node.id === nodeId)?.node.type
    expect(plan.comments.map((comment) => typeOf(plan.document, comment.nodeId))).toEqual(
      COMMENTS.map((comment) => typeOf(DOCUMENT, comment.nodeId)),
    )
    // id는 바뀐다.
    expect(idsOf(plan.document)).not.toEqual(idsOf(DOCUMENT))
    // 끊긴 것이 왕복에서 생기지 않는다.
    expect(plan.dangling).toEqual([])
  })
})
