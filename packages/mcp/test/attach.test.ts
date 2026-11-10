/**
 * **못 붙었을 때 무엇을 말하는가.**
 *
 * 에이전트는 사람과 다르다. `wireb`를 친 사람은 자기가 어느 디렉터리에서 쳤는지 알고
 * 종료 코드를 셸이 보여 주지만, **에이전트가 보는 것은 도구가 낸 글자 하나**다. 그 글자가
 * *"무엇을 해야 하는가"*를 말하지 않으면 에이전트는 같은 도구를 다시 부른다.
 */
import { describe, expect, it } from 'vitest'
import { EXIT } from '@wirebound/cli/embed'
import { callTool } from '../src/server'
import { TOOLS } from '../src/tools'
import { PROJECT, SERVER, TOKEN, harness } from './harness'

describe('붙지 못한 것은 결과이지 프로토콜 오류가 아니다', () => {
  it('바인딩이 없으면 `wireb init`을 치라고 말한다', async () => {
    const io = harness({ binding: false })
    const outcome = await callTool(io, 'list_pages', {})

    // **예외가 아니다.** 던지면 호스트가 *"도구가 고장났다"*로 접고 에이전트가 재시도한다.
    expect(outcome.isError).toBe(true)
    expect(outcome.text).toContain('.wirebound.json')
    expect(outcome.text).toContain('wireb init')
    // 종료 코드를 그대로 옮긴다 — 사람이 `wireb`에서 보는 번호와 같다.
    expect(outcome.text).toContain(`[wireb 코드 ${EXIT.config}]`)
  })

  it('바인딩이 없을 때 **어디서 찾았는지**를 함께 말한다', async () => {
    // 사람은 자기 cwd를 알지만 에이전트는 호스트가 띄운 자리를 모른다.
    const io = harness({ binding: false, cwd: '/somewhere/else' })
    const outcome = await callTool(io, 'list_pages', {})
    expect(outcome.text).toContain('/somewhere/else')
  })

  it('자격이 없으면 `wireb login`을 치라고 말한다', async () => {
    const io = harness({ token: false })
    const outcome = await callTool(io, 'list_pages', {})

    expect(outcome.isError).toBe(true)
    expect(outcome.text).toContain('wireb login')
    expect(outcome.text).toContain(PROJECT)
    expect(outcome.text).toContain(`[wireb 코드 ${EXIT.config}]`)
  })

  it('서버가 거절하면 서버가 쓴 문장을 옮긴다 — 코드 3이다', async () => {
    const io = harness({ snapshot: 'refused' })
    const outcome = await callTool(io, 'list_pages', {})

    expect(outcome.isError).toBe(true)
    // **CLI가 서버 문장을 옮기기로 한 판정이 여기서도 값을 낸다**(`client.ts`의 표).
    expect(outcome.text).toContain('이 프로젝트에 대한 권한이 없습니다')
    expect(outcome.text).toContain(`[wireb 코드 ${EXIT.server}]`)
  })

  it('서버에 못 닿으면 원인 문장을 함께 낸다 — 코드 4이고 3과 갈린다', async () => {
    const io = harness({ snapshot: 'unreachable' })
    const outcome = await callTool(io, 'list_pages', {})

    expect(outcome.isError).toBe(true)
    expect(outcome.text).toContain('ECONNREFUSED')
    expect(outcome.text).toContain(`[wireb 코드 ${EXIT.unreachable}]`)
  })

  it('바인딩의 server가 못 쓰는 주소면 설정을 고치라고 말한다 — 코드 2다', async () => {
    const io = harness({ binding: { server: 'wb.example.com', projectId: PROJECT } })
    const outcome = await callTool(io, 'list_pages', {})

    expect(outcome.isError).toBe(true)
    expect(outcome.text).toContain('http://')
    expect(outcome.text).toContain(`[wireb 코드 ${EXIT.config}]`)
  })
})

describe('자격을 다시 짜지 않는다', () => {
  it('`.wirebound.json`을 cwd에서 **위로** 찾는다 — CLI가 정한 규칙 그대로', async () => {
    // 파일은 `/repo`에 있고 서버는 `/repo/apps/web`에서 돈다.
    const io = harness({ cwd: '/repo/apps/web' })
    const outcome = await callTool(io, 'list_pages', {})
    expect(outcome.isError).toBe(false)
  })

  it('홈 아래 자격 파일의 토큰을 Bearer로 싣는다 — 리포 안을 안 본다', async () => {
    const io = harness()
    await callTool(io, 'list_pages', {})

    expect(io.requests).toHaveLength(1)
    expect(io.requests[0]!.headers.authorization).toBe(`Bearer ${TOKEN}`)
    expect(io.requests[0]!.url).toBe(`${SERVER}/api/projects/${PROJECT}/snapshot`)
  })

  it('`WIREB_TOKEN`이 파일을 이긴다 — CLI와 같은 우선순위다', async () => {
    const io = harness({ token: true })
    io.env.WIREB_TOKEN = 'from-env'
    await callTool(io, 'list_pages', {})
    expect(io.requests[0]!.headers.authorization).toBe('Bearer from-env')
  })

  /**
   * **분모가 `TOOLS`다.** 도구 하나로 재면 도구가 늘 때 새 도구는 아무도 안 본다.
   * `no-token-in-response.test.ts`가 분모를 표에서 만든 것과 같은 자세다.
   */
  it('어느 도구도 리포에 파일을 안 쓴다 — 쓰기 둘도 서버로만 쓴다', async () => {
    for (const tool of TOOLS) {
      const io = harness()
      const before = [...io.fs.keys()]
      await callTool(io, tool.name, READ_ARGS[tool.name] ?? {})
      expect([...io.fs.keys()], tool.name).toEqual(before)
    }
  })

  it('그 표가 도구를 하나도 안 빠뜨린다', () => {
    expect(TOOLS.map((tool) => tool.name).filter((name) => READ_ARGS[name] === undefined)).toEqual([])
  })
})

/**
 * 도구마다 성공 갈래를 부를 인자. **표를 분모로 쓰므로 여기 없는 도구가 생기면 죽는다.**
 * 도구를 더하면 `no-token-in-response.test.ts`의 `ARGS`와 함께 여기에도 줄을 더한다.
 */
const READ_ARGS: Record<string, Record<string, unknown>> = {
  list_pages: {},
  get_page: { path: '관리자/회원/목록' },
  patch_page: { path: '관리자/회원/목록', baseSeq: 0, ops: [{ op: 'remove', path: '/root/children/1' }] },
  add_comment: { path: '관리자/회원/목록', nodeId: 'list', body: '정렬 기준이 없습니다' },
  validate: {},
  list_codes: {},
  code_usage: { group: 'KIND' },
  edit_codes: { ops: [{ op: 'add-group', group: 'NEW', name: '새 그룹' }] },
}
