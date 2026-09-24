/**
 * `patch_page` · `add_comment`.
 *
 * 재는 것 다섯(근거는 `src/handlers.ts`의 각 머리말):
 *
 * 1. **사람 편집과 같은 라우트로 간다** — `PATCH .../ops`이고 `wireb` 명령을 안 지난다.
 * 2. **재시도하지 않는다** — 거절당해도 서버를 두 번 안 부른다.
 * 3. **409와 423이 다른 말을 한다** — 글자가 같아지면 죽는다.
 * 4. **`ops`를 도구가 검증하지 않는다** — 서버가 든다.
 * 5. **코멘트가 문서를 바꾼다는 것을 숨기지 않는다**.
 */
import { describe, expect, it } from 'vitest'
import { snapshotPayload, page, PAGE_DETAIL, MENU_ADMIN } from '@wirebound/cli/test-support'
import { callTool } from '../src/server'
import { PROJECT, SERVER, WRITE_PAGE, callJson, harness } from './harness'

/** 픽스처의 `관리자/회원/목록`. 쓰기 셋이 이 페이지를 본다. */
const PATH = '관리자/회원/목록'
const OPS = [{ op: 'remove', path: '/root/children/1' }]

const OPS_URL = `${SERVER}/api/projects/${PROJECT}/pages/${WRITE_PAGE}/ops`
const COMMENTS_URL = `${SERVER}/api/projects/${PROJECT}/pages/${WRITE_PAGE}/comments`

describe('patch_page — 사람 편집과 같은 라우트로 간다', () => {
  it('경로를 페이지로 풀어 `PATCH .../ops` 를 부른다', async () => {
    const io = harness()
    await callJson(io, 'patch_page', { path: PATH, baseSeq: 0, ops: OPS })

    const written = io.requests.filter((request) => request.method === 'PATCH')
    expect(written).toHaveLength(1)
    expect(written[0]!.url).toBe(OPS_URL)
    // **`baseSeq`와 `ops`가 그대로 간다** — 도구가 다시 만들지 않는다.
    expect(JSON.parse(written[0]!.body ?? '')).toEqual({ baseSeq: 0, ops: OPS })
  })

  it('자기 종류를 서버에 말한다 — actor_type 이 이 헤더에서 온다', async () => {
    // `bin.ts`가 심는 값은 스모크가 잰다. 여기서는 **헤더가 쓰기 요청에도 실린다**를 든다.
    const io = harness()
    await callJson(io, 'patch_page', { path: PATH, baseSeq: 0, ops: OPS })
    const written = io.requests.find((request) => request.method === 'PATCH')!
    expect(written.headers['x-wb-client']).toBe('cli')
    expect(written.headers.authorization).toMatch(/^Bearer /)
  })

  it('응답이 새 `headSeq` 를 낸다 — 다음 patch 의 baseSeq 다', async () => {
    const said = (await callJson(harness(), 'patch_page', { path: PATH, baseSeq: 0, ops: OPS })) as {
      applied: boolean
      headSeq: number
      revisionId: string
      warnings: unknown[]
    }
    expect(said.applied).toBe(true)
    expect(said.headSeq).toBe(1)
    expect(said.revisionId).toBe('rev_0001')
    // 경고가 없어도 키가 있다 — 없는 것과 안 읽은 것이 같아 보이면 안 된다.
    expect(said.warnings).toEqual([])
  })

  /**
   * **`ops`를 검증하는 자리는 서버다**(설계서 「LLM 편집 경로」의 *"사람 편집과 동일 경로"*).
   *
   * 도구가 자기 검증을 더하면 두 벌이 되고, 두 벌은 **오늘 같은 답을 내므로** 값을 재는
   * 케이스가 갈림을 못 본다. 여기서는 *"도구를 못 지나가는 `ops`가 없다"*를 든다.
   */
  it('도구가 `ops` 를 검증하지 않는다 — 모르는 연산도 서버까지 간다', async () => {
    const 이상한 = [{ op: '없는연산', path: '/root', 아무거나: 1 }]
    const io = harness({ patch: 'invalid' })
    const outcome = await callTool(io, 'patch_page', { path: PATH, baseSeq: 0, ops: 이상한 })

    // 서버가 거절했다 — **도구가 아니다.**
    expect(outcome.isError).toBe(true)
    const written = io.requests.find((request) => request.method === 'PATCH')!
    expect(JSON.parse(written.body ?? '').ops).toEqual(이상한)
  })

  it('빈 `ops` 도 그대로 보낸다 — 상한도 하한도 서버가 든다', async () => {
    const io = harness()
    await callJson(io, 'patch_page', { path: PATH, baseSeq: 0, ops: [] })
    expect(JSON.parse(io.requests.find((r) => r.method === 'PATCH')!.body ?? '').ops).toEqual([])
  })
})

describe('patch_page — 재시도하지 않는다', () => {
  it('409 를 받아도 `PATCH` 를 두 번 안 부른다', async () => {
    const io = harness({ patch: 'stale' })
    const outcome = await callTool(io, 'patch_page', { path: PATH, baseSeq: 0, ops: OPS })

    expect(outcome.isError).toBe(true)
    // **하나뿐이다.** 안에서 다시 부르면 에이전트가 만든 patch 가 다른 문서에 얹힌다.
    expect(io.requests.filter((request) => request.method === 'PATCH')).toHaveLength(1)
  })

  it('423 을 받아도 마찬가지다 — 기다림도 재시도도 도구의 일이 아니다', async () => {
    const io = harness({ patch: 'locked' })
    await callTool(io, 'patch_page', { path: PATH, baseSeq: 0, ops: OPS })
    expect(io.requests.filter((request) => request.method === 'PATCH')).toHaveLength(1)
  })

  /**
   * **새 `headSeq`를 실어 준다.** 「LLM 편집 경로」의 *"재조회 후 재시도"*를 도구가 지원하는 방법이
   * 그것이다 — 그리고 그 값은 **다시 읽은 것**이어야 한다.
   */
  it('409 의 `headSeq` 는 **다시 읽은 값**이다 — 처음 것을 재사용하지 않는다', async () => {
    const 처음 = snapshotPayload()
    const 나중 = snapshotPayload()
    나중.pages = 나중.pages.map((one) => (one.id === WRITE_PAGE ? { ...one, headSeq: 7 } : one))

    const io = harness({ patch: 'stale', payload: 처음, rereadPayload: 나중 })
    const outcome = await callTool(io, 'patch_page', { path: PATH, baseSeq: 0, ops: OPS })
    const said = JSON.parse(outcome.text) as { headSeq: number; baseSeq: number }

    expect(said.headSeq).toBe(7)
    // 분모가 0이면 위가 공허하다 — 처음 읽은 값은 0이었다.
    expect(처음.pages.find((one) => one.id === WRITE_PAGE)!.headSeq).toBe(0)
    expect(said.baseSeq).toBe(0)
    // 스냅샷을 **두 번** 읽었다: 경로를 풀 때 하나, 409 뒤에 하나.
    expect(io.requests.filter((request) => request.method === 'GET')).toHaveLength(2)
  })

  it('성공 갈래에서는 다시 안 읽는다 — 응답의 `seq` 가 곧 새 `headSeq` 다', async () => {
    const io = harness()
    await callJson(io, 'patch_page', { path: PATH, baseSeq: 0, ops: OPS })
    expect(io.requests.filter((request) => request.method === 'GET')).toHaveLength(1)
  })

  it('423 뒤에는 다시 안 읽는다 — 낡아서 막힌 것이 아니다', async () => {
    const io = harness({ patch: 'locked' })
    await callTool(io, 'patch_page', { path: PATH, baseSeq: 0, ops: OPS })
    expect(io.requests.filter((request) => request.method === 'GET')).toHaveLength(1)
  })
})

/**
 * **409와 423이 같은 말을 하면 안 된다.**
 *
 * 「LLM 편집 경로」는 **409에 대해서만** *"재조회 후 재시도"*를 적었다. 423은 재조회해도 안 풀린다 —
 * 문서가 아니라 사람이 막고 있다. `apps/api/README.md`가 *"자동 재시도를 짜지 마라"*를
 * 계약으로 적었고, **그 계약을 지킬 수 있게 하는 것이 두 문장의 갈림이다.**
 */
describe('patch_page — 423 은 넷째 갈래다', () => {
  it('409 는 `stale` 이고 다시 읽으라고 말한다', async () => {
    const outcome = await callTool(harness({ patch: 'stale' }), 'patch_page', { path: PATH, baseSeq: 0, ops: OPS })
    const said = JSON.parse(outcome.text) as { applied: boolean; reason: string; status: number; next: string }

    expect(outcome.isError).toBe(true)
    expect(said.applied).toBe(false)
    expect(said.reason).toBe('stale')
    expect(said.status).toBe(409)
    expect(said.next).toContain('get_page')
    expect(said.next).toContain('재시도하지 않습니다')
  })

  it('423 은 `locked` 이고 **기다리라고** 말한다 — 다시 읽으라고 하지 않는다', async () => {
    const outcome = await callTool(harness({ patch: 'locked' }), 'patch_page', { path: PATH, baseSeq: 0, ops: OPS })
    const said = JSON.parse(outcome.text) as { reason: string; status: number; next: string; message: string }

    expect(outcome.isError).toBe(true)
    expect(said.reason).toBe('locked')
    expect(said.status).toBe(423)
    expect(said.next).toContain('기다')
    // **재조회를 시키면 안 된다.** 그것이 409의 답이고, 여기서는 루프가 된다.
    expect(said.next).not.toContain('get_page')
  })

  it('두 문장이 **글자가 다르다** — 같아지면 여기가 죽는다', async () => {
    const 낡음 = JSON.parse(
      (await callTool(harness({ patch: 'stale' }), 'patch_page', { path: PATH, baseSeq: 0, ops: OPS })).text,
    ) as { next: string; reason: string }
    const 잠김 = JSON.parse(
      (await callTool(harness({ patch: 'locked' }), 'patch_page', { path: PATH, baseSeq: 0, ops: OPS })).text,
    ) as { next: string; reason: string }

    expect(잠김.next).not.toBe(낡음.next)
    expect(잠김.reason).not.toBe(낡음.reason)
  })

  /**
   * **423의 문장이 누가 잡고 있는지를 말한다.**
   *
   * 서버가 그것을 문장에 싣고(`lock/check.ts`), `callApi`가 서버 문장을 그대로 옮기고
   * (`client.ts`의 표), 도구가 그것을 `message`로 낸다. **셋 중 하나라도 문장을 지어내면
   * 여기가 죽는다.**
   */
  it('423 의 문장에 **누가 잡고 있는지**가 실려 온다 — 세 층을 건너온다', async () => {
    const outcome = await callTool(harness({ patch: 'locked' }), 'patch_page', { path: PATH, baseSeq: 0, ops: OPS })
    const said = JSON.parse(outcome.text) as { message: string }

    expect(said.message).toContain('장병현님이 편집 중인 영역입니다')
    // 사람이 `wireb`에서 보는 번호와 같다.
    expect(said.message).toContain('[wireb 코드 3]')
  })

  it('그 밖의 거절은 `rejected` 다 — 셋으로 접지 않는다', async () => {
    const outcome = await callTool(harness({ patch: 'invalid' }), 'patch_page', { path: PATH, baseSeq: 0, ops: OPS })
    const said = JSON.parse(outcome.text) as { reason: string; status: number; message: string }

    expect(said.reason).toBe('rejected')
    expect(said.status).toBe(422)
    expect(said.message).toContain('스키마 검증에 실패했습니다')
  })
})

describe('patch_page — 못 찾은 것과 둘 이상은 결과다', () => {
  it('없는 경로는 `isError` 가 아니다 — 후보를 읽고 고칠 수 있다', async () => {
    const io = harness()
    const outcome = await callTool(io, 'patch_page', { path: '관리자/없는페이지', baseSeq: 0, ops: OPS })

    expect(outcome.isError).toBe(false)
    const said = JSON.parse(outcome.text) as { applied: boolean; reason: string; candidates: string[] }
    expect(said.applied).toBe(false)
    expect(said.reason).toBe('no-such-path')
    expect(said.candidates).toContain(PATH)
    // **아무것도 안 보냈다.**
    expect(io.requests.filter((request) => request.method === 'PATCH')).toHaveLength(0)
  })

  it('둘 이상이면 하나를 고르지 않는다 — 어느 것을 고쳤는지 아무도 모르게 된다', async () => {
    const 겹침 = snapshotPayload()
    겹침.pages.push(
      page(PAGE_DETAIL.replace(/2$/, '9'), MENU_ADMIN, '목록', 5, { version: 1, root: { id: 'r', type: 'Page' } }, null),
    )
    겹침.pages.push(
      page(PAGE_DETAIL.replace(/2$/, '8'), MENU_ADMIN, '목록', 6, { version: 1, root: { id: 'r', type: 'Page' } }, null),
    )

    const io = harness({ payload: 겹침 })
    const outcome = await callTool(io, 'patch_page', { path: '관리자/목록', baseSeq: 0, ops: OPS })

    const said = JSON.parse(outcome.text) as { applied: boolean; reason: string; matches: unknown[] }
    expect(said.reason).toBe('ambiguous')
    expect(said.matches).toHaveLength(2)
    expect(io.requests.filter((request) => request.method === 'PATCH')).toHaveLength(0)
  })
})

/**
 * **코멘트가 문서를 바꾼다는 것을 숨기지 않는다.**
 *
 * 값은 진짜 서버의 것이다(`apps/api/test/agent-flow.test.ts`가 든다):
 * 번호가 없던 노드면 `headSeq`가 1→2로 오르고 옛 `baseSeq`의 patch가 **409**다. 이미
 * 번호가 있으면 `markerOps`가 비고 `headSeq`가 **안 오른다.** 두 갈래가 갈리므로
 * 응답이 그것을 말하지 않으면 에이전트가 어느 쪽인지 알 수 없다.
 */
describe('add_comment — 문서가 바뀌었는지를 말한다', () => {
  it('번호를 새로 붙이면 `documentChanged` 가 서고 `headSeq` 가 오른다', async () => {
    const io = harness()
    const said = (await callJson(io, 'add_comment', { path: PATH, nodeId: 'list', body: '정렬 기준이 없습니다' })) as {
      added: boolean
      marker: number
      documentChanged: boolean
      headSeq: number
      note: string
    }

    expect(said.added).toBe(true)
    expect(said.marker).toBe(3)
    expect(said.documentChanged).toBe(true)
    expect(said.headSeq).toBe(1)
    // **다음 걸음이 409가 된다는 것을 말한다.** 그것이 이 도구가 숨기면 안 되는 것이다.
    expect(said.note).toContain('409')
    expect(io.requests.find((request) => request.method === 'POST')!.url).toBe(COMMENTS_URL)
  })

  it('이미 번호가 있으면 문서가 안 바뀐다 — 그때는 옛 `baseSeq` 가 여전히 유효하다', async () => {
    const said = (await callJson(harness({ comment: 'existing-marker' }), 'add_comment', {
      path: PATH,
      nodeId: 'list',
      body: '하나 더',
    })) as { documentChanged: boolean; headSeq: number; note: string }

    expect(said.documentChanged).toBe(false)
    expect(said.headSeq).toBe(0)
    expect(said.note).not.toContain('409')
  })

  it('본문을 그대로 보낸다 — 도구가 손대지 않는다', async () => {
    const io = harness()
    await callJson(io, 'add_comment', { path: PATH, nodeId: 'list', body: '① 정렬\n② 기준' })
    expect(JSON.parse(io.requests.find((r) => r.method === 'POST')!.body ?? '')).toEqual({
      nodeId: 'list',
      body: '① 정렬\n② 기준',
    })
  })

  it('없는 노드는 `no-such-node` 이고 어디서 id 를 얻는지 말한다', async () => {
    const outcome = await callTool(harness({ comment: 'no-node' }), 'add_comment', {
      path: PATH,
      nodeId: 'n_없음',
      body: '아무거나',
    })
    const said = JSON.parse(outcome.text) as { added: boolean; reason: string; status: number; next: string }

    expect(outcome.isError).toBe(true)
    expect(said.added).toBe(false)
    expect(said.reason).toBe('no-such-node')
    expect(said.status).toBe(404)
    expect(said.next).toContain('get_page')
  })

  it('재시도하지 않는다 — 거절당해도 한 번뿐이다', async () => {
    const io = harness({ comment: 'stale' })
    await callTool(io, 'add_comment', { path: PATH, nodeId: 'list', body: '아무거나' })
    expect(io.requests.filter((request) => request.method === 'POST')).toHaveLength(1)
  })
})

/**
 * **`get_page`가 `baseSeq`가 될 값을 낸다** — 없으면 설계서 「MCP 도구」의 *"baseSeq 필수"*를 지킬 길이
 * 에이전트에게 없다.
 */
describe('get_page 가 `headSeq` 를 낸다 — 쓰기의 입력이 읽기의 출력이다', () => {
  it('응답 봉투에 `headSeq` 가 있다', async () => {
    const said = (await callJson(harness(), 'get_page', { path: PATH })) as { headSeq: number }
    expect(said.headSeq).toBe(0)
  })

  it('payload 의 값을 그대로 옮긴다 — 지어내지 않는다', async () => {
    const payload = snapshotPayload()
    payload.pages = payload.pages.map((one) => (one.id === WRITE_PAGE ? { ...one, headSeq: 42 } : one))
    const said = (await callJson(harness({ payload }), 'get_page', { path: PATH })) as { headSeq: number }
    expect(said.headSeq).toBe(42)
  })

  it('그 값을 그대로 `patch_page` 에 넣을 수 있다 — 설계서 「스킬」의 흐름이 그 모양이다', async () => {
    const io = harness()
    const got = (await callJson(io, 'get_page', { path: PATH })) as { headSeq: number; page: { path: string } }
    await callJson(io, 'patch_page', { path: got.page.path, baseSeq: got.headSeq, ops: OPS })

    expect(JSON.parse(io.requests.find((r) => r.method === 'PATCH')!.body ?? '').baseSeq).toBe(got.headSeq)
  })
})

describe('인자 검사 — 수와 배열도 표에서 나온다', () => {
  it('`baseSeq` 가 수가 아니면 JSON-RPC 오류다', async () => {
    const io = harness()
    await expect(callTool(io, 'patch_page', { path: PATH, baseSeq: '0', ops: OPS })).rejects.toMatchObject({
      code: -32602,
    })
  })

  it('`baseSeq` 가 정수가 아니어도 마찬가지다', async () => {
    await expect(
      callTool(harness(), 'patch_page', { path: PATH, baseSeq: 1.5, ops: OPS }),
    ).rejects.toMatchObject({ code: -32602 })
  })

  it('음수 `baseSeq` 도 막는다 — 그런 revision 은 없다', async () => {
    await expect(callTool(harness(), 'patch_page', { path: PATH, baseSeq: -1, ops: OPS })).rejects.toMatchObject({
      code: -32602,
    })
  })

  it('`ops` 가 배열이 아니면 JSON-RPC 오류다', async () => {
    await expect(
      callTool(harness(), 'patch_page', { path: PATH, baseSeq: 0, ops: { op: 'remove' } }),
    ).rejects.toMatchObject({ code: -32602 })
  })

  it('셋 중 하나라도 빠지면 JSON-RPC 오류다', async () => {
    for (const args of [
      { baseSeq: 0, ops: OPS },
      { path: PATH, ops: OPS },
      { path: PATH, baseSeq: 0 },
    ]) {
      await expect(callTool(harness(), 'patch_page', args), JSON.stringify(args)).rejects.toMatchObject({
        code: -32602,
      })
    }
  })

  it('아무것도 안 보냈다 — 검사가 서버 앞에서 끊는다', async () => {
    const io = harness()
    await callTool(io, 'patch_page', { path: PATH, baseSeq: '0', ops: OPS }).catch(() => undefined)
    expect(io.requests).toHaveLength(0)
  })
})
