/**
 * **도구가 낸 글자에 토큰 원문이 없다.**
 *
 * ---
 *
 * # 왜 필요한가 — `wireb`가 리포에 안 쓰는 것과 같은 부류다
 *
 * `packages/cli/test/no-token-in-repo.test.ts`가 *"CLI가 리포 안에 쓴 파일 전부"*를 훑어
 * 토큰 원문이 어디에도 없는지 본다. **MCP의 표면은 파일이 아니라 응답이다** — 그 글자는
 * 호스트를 지나 **모델의 문맥으로 들어가고**, 거기 들어간 것은 로그·전사·다음 요청에 남는다.
 * 응답에 자격이 실리는 사고는 `wireb`가 파일에 쓰는 것보다 되돌리기 어렵다.
 *
 * # 분모가 `TOOLS`다
 *
 * 도구를 더하면서 이 검사를 빠뜨리는 경로가 없다 — 표에 줄을 더하면 여기가 그것을 바로
 * 부른다(`no-token-in-repo`가 `COMMANDS`를 분모로 쓰는 것과 같다).
 *
 * **성공 갈래만 재지 않는다.** 오류 문장이 서버 응답을 옮기므로(`client.ts`) 그 길로도
 * 새는지 본다.
 */
import { describe, expect, it } from 'vitest'
import { callTool } from '../src/server'
import { TOOLS } from '../src/tools'
import { TOKEN, harness } from './harness'

/** 도구마다 성공 갈래를 부를 인자. **표를 분모로 쓰므로 여기 없는 도구가 생기면 죽는다.** */
const ARGS: Record<string, Record<string, string>> = {
  list_pages: {},
  get_page: { path: '관리자/회원/목록' },
  validate: {},
}

describe('응답에 토큰 원문이 없다', () => {
  it('인자 표가 도구를 하나도 빠뜨리지 않는다', () => {
    expect(TOOLS.map((tool) => tool.name).filter((name) => ARGS[name] === undefined)).toEqual([])
  })

  it('토큰이 재는 값으로 쓸 만하다 — 반대편', () => {
    // 토큰이 빈 문자열이거나 흔한 조각이면 아래 검사가 아무것도 안 재고 통과한다.
    expect(TOKEN.length).toBeGreaterThan(8)
  })

  it('성공 갈래의 글자에 없다', async () => {
    for (const tool of TOOLS) {
      const outcome = await callTool(harness(), tool.name, ARGS[tool.name]!)
      expect(outcome.isError, tool.name).toBe(false)
      expect(outcome.text, tool.name).not.toContain(TOKEN)
    }
  })

  it('서버가 거절한 갈래의 글자에도 없다 — 오류 문장이 응답을 옮긴다', async () => {
    for (const tool of TOOLS) {
      const outcome = await callTool(harness({ snapshot: 'refused' }), tool.name, ARGS[tool.name]!)
      expect(outcome.isError, tool.name).toBe(true)
      expect(outcome.text, tool.name).not.toContain(TOKEN)
    }
  })

  it('못 닿은 갈래의 글자에도 없다 — 요청 URL이 문장에 실린다', async () => {
    for (const tool of TOOLS) {
      const outcome = await callTool(harness({ snapshot: 'unreachable' }), tool.name, ARGS[tool.name]!)
      expect(outcome.isError, tool.name).toBe(true)
      expect(outcome.text, tool.name).not.toContain(TOKEN)
    }
  })

  it('훑기가 실제로 토큰을 찾을 수 있다 — 자의 구분력', () => {
    // 위 셋이 *"아무 글자에도 없다"*로 언제나 통과하지 않는지 본다.
    expect(`요청 헤더: Bearer ${TOKEN}`).toContain(TOKEN)
  })
})
