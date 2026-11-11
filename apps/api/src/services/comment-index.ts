/**
 * 코멘트 토큰을 푸는 프로젝트 전체의 «번호 색인»(설계 `docs/superpowers/specs/2026-11-11-comment-tokens-design.md` «풀 자료»).
 * 번호는 페이지 문서의 노드가 들고 본문은 `comments` 표가 들어(`routes/comments.ts` 머리말) 서버가 둘을 이어 낸다.
 *
 * 노드는 **코멘트가 달린 것**과 **이 프로젝트 코멘트의 토큰이 가리키는 것**만 싣는다 — 뒤의 것은 코멘트가 다 지워져 번호가 걷힌 노드가
 * «페이지 › 노드 이름» 으로 이어지게 한다(번호 `null`). 문서 전체의 노드를 다 실으면 응답이 문서 크기만큼 자란다.
 *
 * 프로젝트의 행만 읽는다 — 남의 프로젝트 id 를 든 토큰은 여기 없어 받는 쪽에서 끊김이 된다(설계 «반-목표»).
 */
import {
  buildMarkerIndex,
  indexCodes,
  markerKey,
  migrateDocument,
  parseCommentBody,
  targetedPages,
  type PageDocument,
} from '@wirebound/schema'
import type { DbHandle } from '../db/tx'
import { readCodeTable } from '../repos/codes'
import { listProjectComments } from '../repos/comments'
import { listMenuRows } from '../repos/menu'
import { listPages } from '../repos/pages'

/** 첫 코멘트 앞머리의 글자 수 — 자동완성 후보 한 줄에 들어갈 만큼. */
export const FIRST_COMMENT_PREVIEW = 40

export interface CommentIndex {
  pages: { id: string; title: string; menuPath: string }[]
  markers: { pageId: string; nodeId: string; marker: number | null; nodeName: string; firstComment: string }[]
}

export async function readCommentIndex(db: DbHandle, projectId: string): Promise<CommentIndex> {
  const menu = await listMenuRows(db, projectId)
  const records = await listPages(db, projectId)
  const comments = await listProjectComments(db, projectId)
  const codes = indexCodes(await readCodeTable(db, projectId))

  const ordered = targetedPages({
    menu: menu.map((row) => ({ id: row.id, parentId: row.parent_id, title: row.title, sortOrder: row.sort_order })),
    pages: records.map((page) => ({ id: page.id, menuNodeId: page.menuNodeId, title: page.title, sortOrder: page.sortOrder })),
  })
  const menuPathById = new Map(ordered.map((page) => [page.id, page.menuPath.join(' › ')]))

  // 이 서버가 못 올리는 문서는 그 페이지의 노드만 빠진다 — 색인 하나 때문에 패널 전체가 못 풀면 안 된다.
  const documents: { id: string; document: PageDocument }[] = []
  for (const record of records) {
    try {
      documents.push({ id: record.id, document: migrateDocument(record.schema) })
    } catch {
      // 그 페이지의 토큰은 끊김으로 보인다 — 페이지 자체는 저작 화면에서도 안 열린다(`GET …/pages/:id` 400).
    }
  }
  const nodes = buildMarkerIndex(documents, codes)

  // 가장 이른 코멘트 — `listProjectComments` 가 `created_at` 오름차순이라 처음 본 것이다.
  const first = new Map<string, string>()
  const wanted = new Set<string>()
  for (const comment of comments) {
    const key = markerKey(comment.pageId, comment.nodeId)
    if (!first.has(key)) first.set(key, comment.body)
    wanted.add(key)
    for (const segment of parseCommentBody(comment.body)) {
      if (segment.type === 'token' && segment.target.kind === 'comment') wanted.add(markerKey(segment.target.pageId, segment.target.nodeId))
    }
  }

  const order = new Map(ordered.map((page, i) => [page.id, i]))
  const markers: CommentIndex['markers'] = []
  // 열쇠는 `${pageId}/${nodeId}` 이고 페이지 id(uuid)에는 `/` 가 없다. 차례는 문서 순회 차례 — 페이지는 아래에서 번들 차례로 다시 선다.
  for (const [key, entry] of nodes) {
    if (!wanted.has(key)) continue
    const cut = key.indexOf('/')
    markers.push({
      pageId: key.slice(0, cut),
      nodeId: key.slice(cut + 1),
      marker: entry.marker,
      nodeName: entry.nodeName,
      firstComment: [...(first.get(key) ?? '')].slice(0, FIRST_COMMENT_PREVIEW).join(''),
    })
  }
  markers.sort((a, b) => (order.get(a.pageId) ?? 0) - (order.get(b.pageId) ?? 0))

  return {
    pages: records.map((page) => ({ id: page.id, title: page.title, menuPath: menuPathById.get(page.id) ?? '' })),
    markers,
  }
}
