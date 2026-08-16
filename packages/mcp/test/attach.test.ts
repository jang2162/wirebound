/**
 * **못 붙었을 때 무엇을 말하는가** — T3의 값이 이것이다(D3·D4·D8).
 *
 * 에이전트는 사람과 다르다. `wireb`를 친 사람은 자기가 어느 디렉터리에서 쳤는지 알고
 * 종료 코드를 셸이 보여 주지만, **에이전트가 보는 것은 도구가 낸 글자 하나**다. 그 글자가
 * *"무엇을 해야 하는가"*를 말하지 않으면 에이전트는 같은 도구를 다시 부른다.
 */
import { describe, expect, it } from 'vitest'
import { EXIT } from '@wirebound/cli/embed'
import { callTool } from '../src/server'
import { PROJECT, SERVER, TOKEN, harness } from './harness'

describe('붙지 못한 것은 결과이지 프로토콜 오류가 아니다 (D8)', () => {
  it('바인딩이 없으면 `wireb init`을 치라고 말한다 (D4)', async () => {
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

describe('자격을 다시 짜지 않는다 (D3)', () => {
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

  it('도구가 리포에 아무것도 안 쓴다 — 읽기뿐이다', async () => {
    const io = harness()
    const before = new Map(io.fs)
    await callTool(io, 'list_pages', {})
    expect([...io.fs.keys()]).toEqual([...before.keys()])
  })
})
