/**
 * `comment-token-broken`(설계서 「lint 규칙」) — 끊긴 토큰마다 이슈 하나(정보). 산 토큰 · 보통 글은 0, 표를 안 준 판의 코드 토큰은 안 본다.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { formatCommentToken } from '../src/comment-tokens'
import { installCatalog } from '../src/component/catalog/index'
import { lintDesign } from '../src/lint/design'
import type { LintProject } from '../src/lint/input'

beforeAll(() => {
  installCatalog()
})

const PG = '11111111-1111-4111-8111-111111111111'
const GONE = '99999999-9999-4999-8999-999999999999'

function lint(bodies: string[], withCodes = true) {
  const project: LintProject = {
    menu: [{ id: 'm1', parentId: null, title: '관리자' }],
    pages: [
      {
        id: PG,
        menuNodeId: 'm1',
        title: '목록',
        target: 'page:관리자/목록',
        document: { version: 2, root: { id: 'n_root', type: 'Page', children: [{ id: 'n_g', type: 'Text', marker: 1 }] } },
      },
    ],
    comments: bodies.map((body) => ({ pageId: PG, nodeId: 'n_g', body })),
    ...(withCodes ? { codes: [{ key: 'S', name: '상태', items: [{ value: 'ON', name: '사용', active: true }] }] } : {}),
  }
  return lintDesign(project).filter((issue) => issue.rule === 'comment-token-broken')
}

describe('comment-token-broken', () => {
  it('산 토큰 · 보통 글은 0', () => {
    const body = [
      formatCommentToken('x', { kind: 'page', pageId: PG }),
      formatCommentToken('x', { kind: 'comment', pageId: PG, nodeId: 'n_g' }),
      formatCommentToken('x', { kind: 'code', group: 'S', item: 'ON' }),
      '[링크](https://a.b)',
    ].join(' ')
    expect(lint([body])).toEqual([])
  })

  it('끊긴 토큰마다 하나 — 정보 · 그 코멘트의 자리', () => {
    const issues = lint([
      `${formatCommentToken('옛 페이지', { kind: 'page', pageId: GONE })} ${formatCommentToken('옛 번호', { kind: 'comment', pageId: PG, nodeId: 'n_x' })}`,
      formatCommentToken('옛 코드', { kind: 'code', group: 'S', item: 'OFF' }),
    ])
    expect(issues.map((i) => [i.severity, i.pageId, i.nodeId])).toEqual([
      ['info', PG, 'n_g'],
      ['info', PG, 'n_g'],
      ['info', PG, 'n_g'],
    ])
    expect(issues.map((i) => i.message)).toEqual([
      '코멘트의 토큰이 가리키는 대상을 찾을 수 없습니다: 옛 페이지',
      '코멘트의 토큰이 가리키는 대상을 찾을 수 없습니다: 옛 번호',
      '코멘트의 토큰이 가리키는 대상을 찾을 수 없습니다: 옛 코드',
    ])
  })

  it('표를 안 준 판의 코드 토큰은 안 본다 — 다른 토큰은 본다', () => {
    const body = `${formatCommentToken('c', { kind: 'code', group: 'NONE' })} ${formatCommentToken('p', { kind: 'page', pageId: GONE })}`
    expect(lint([body], false).map((i) => i.message)).toEqual(['코멘트의 토큰이 가리키는 대상을 찾을 수 없습니다: p'])
  })
})
