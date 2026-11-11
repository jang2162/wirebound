/**
 * MCP `get_page` 의 코멘트 토큰 — `comments[].resolved` 가 `commentTokenText(…, true)` 꼴이다(풀린 글 뒤 대상). 남의 프로젝트 id 는 끊김이고 그
 * 이름이 응답에 없다(Review Focus 2).
 */
import { describe, expect, it } from 'vitest'
import { PAGE_DETAIL, PAGE_LIST, snapshotPayload } from '@wirebound/cli/test-support'
import { callJson, harness } from './harness'

const FOREIGN = '99999999-9999-4999-8999-999999999999'

describe('get_page — 코멘트 토큰', () => {
  it('resolved 는 풀린 글 뒤에 대상을 싣는다 · 남의 id 는 찾을 수 없음', async () => {
    const payload = snapshotPayload()
    const body = `[옛](wb:comment/${PAGE_LIST}/btn) 과 [옛](wb:page/${PAGE_DETAIL}) · [남의 비밀](wb:page/${FOREIGN})`
    payload.comments = payload.comments.map((comment) => ({ ...comment, body }))
    const said = (await callJson(harness({ payload }), 'get_page', { path: '관리자/회원/목록' })) as {
      page: { comments: { body: string; text: string; resolved: string }[] }
    }
    expect(said.page.comments[0]).toMatchObject({
      body,
      text: '#1 과 상세 · 남의 비밀 (찾을 수 없음)',
      resolved: `#1 (comment:${PAGE_LIST}/btn) 과 상세 (page:${PAGE_DETAIL}) · 남의 비밀 (찾을 수 없음)`,
    })
  })
})
