/**
 * `list_pages` 의 레이아웃 — 페이지마다 `layout` 을 `kind` 곁에 싣는다. 판 7 문서는 `layout` 에서, 판 6 이하 문서는 뿌리에서 읽는다
 * (`pageLayoutOf`). `get_page` 의 `layout` 은 `pageView` 가 싣고 `read-tools.test.ts` 의 키 목록이 잰다.
 */
import { describe, expect, it } from 'vitest'
import { PAGE_DETAIL, PAGE_LIST, snapshotPayload } from '@wirebound/cli/test-support'
import { callJson, harness } from './harness'

describe('list_pages — 레이아웃', () => {
  it('페이지마다 layout 을 낸다 — 판 7 서브페이지 · 판 5 뿌리 Popup · 판 5 뿌리 Page', async () => {
    const payload = snapshotPayload()
    const io = harness({
      payload: {
        ...payload,
        pages: payload.pages.map((item) => {
          if (item.id === PAGE_LIST) {
            return {
              ...item,
              schemaVersion: 7,
              schema: { version: 7, layout: 'subpage', root: { id: 'root', type: 'Page', children: [] } } as never,
            }
          }
          if (item.id === PAGE_DETAIL)
            return { ...item, schemaVersion: 5, schema: { version: 5, root: { id: 'pop', type: 'Popup' } } as never }
          return item
        }),
      },
    })
    const listing = (await callJson(io, 'list_pages')) as { pages: { path: string; kind: string; layout: string }[] }
    expect(listing.pages.map((p) => [p.path, p.layout, p.kind])).toEqual([
      ['관리자/회원/목록', 'subpage', 'page'],
      ['관리자/회원/상세', 'popup', 'popup'],
      ['마케팅/랜딩', 'blank', 'page'],
    ])
  })
})
