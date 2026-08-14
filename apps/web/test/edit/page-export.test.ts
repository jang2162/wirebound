/**
 * 페이지 내보내기(P7-3 T2 — D3·D10). **화면 없이 잰다** — `edit/`의 다른 판정들과 같은 층이다.
 *
 * **왕복은 여기까지가 아니다.** 내보낸 글자를 다시 읽어 가져오기 계획까지 세우는 왕복은
 * `packages/schema/test/page-import.test.ts`가 잰다(그 층이 두 쪽을 다 갖는다). 여기서
 * 재는 것은 **API 타입에서 봉투로 옮기는 자리**다.
 */
import { describe, expect, it } from 'vitest'
import { readPageJson } from '@wirebound/schema'
import { pageExport } from '../../src/edit/page-export'
import type { Comment, PageDetail } from '../../src/api/types'

const PAGE: PageDetail = {
  id: 'pg1',
  menuNodeId: 'mn1',
  title: '회원 목록',
  description: '가입한 회원을 본다',
  sortOrder: 0,
  schemaVersion: 1,
  headSeq: 3,
  schema: {
    version: 1,
    root: { id: 'n_root', type: 'Page', children: [{ id: 'n_list', type: 'List', marker: 1 }] },
  },
}

const COMMENTS: Comment[] = [
  {
    id: 'c1',
    nodeId: 'n_list',
    body: '목록은 10개씩',
    authorId: 'u1',
    authorName: '장병현',
    createdAt: '2026-08-14T00:00:00.000Z',
    updatedAt: '2026-08-14T00:00:00.000Z',
  },
]

describe('페이지 내보내기', () => {
  it('§11.2의 네 키를 담는다', () => {
    const exported = pageExport(PAGE, COMMENTS)

    expect(Object.keys(exported.file)).toEqual(['wireboundVersion', 'page', 'schema', 'comments'])
    expect(exported.file.page).toEqual({ title: '회원 목록', description: '가입한 회원을 본다' })
    expect(exported.file.schema).toBe(PAGE.schema)
  })

  it('코멘트에서 나가는 것은 nodeId와 body 둘뿐이다', () => {
    const exported = pageExport(PAGE, COMMENTS)

    // 작성자·시각·id는 받는 쪽이 쓸 수 없는 값이다. `marker`도 없다 — 번호는 노드가 든다(D6).
    expect(exported.file.comments).toEqual([{ nodeId: 'n_list', body: '목록은 10개씩' }])
  })

  it('번호는 문서에 실려 나간다 (D6)', () => {
    const exported = pageExport(PAGE, COMMENTS)

    expect(exported.file.schema.root.children?.[0]?.marker).toBe(1)
    expect(JSON.stringify(exported.file.comments)).not.toContain('marker')
  })

  it('설명이 없으면 null로 나간다 — 키를 없애지 않는다', () => {
    const exported = pageExport({ ...PAGE, description: null }, [])

    expect(exported.file.page.description).toBeNull()
  })

  it('파일 이름이 제목에서 나온다', () => {
    expect(pageExport(PAGE, []).fileName).toBe('회원-목록.wirebound-page.json')
  })

  it('내보낸 글자를 봉투 읽기가 그대로 받는다 — 두 쪽이 같은 규격이다', () => {
    const exported = pageExport(PAGE, COMMENTS)
    const result = readPageJson(exported.text)

    expect(result.status).toBe('read')
    if (result.status !== 'read') return
    expect(result.file).toEqual(exported.file)
  })
})
