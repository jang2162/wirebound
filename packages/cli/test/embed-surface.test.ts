/**
 * **`./embed`이 내주는 면의 경계.**
 *
 * ---
 *
 * # 왜 따로 재나 — 그 문장을 지키는 것이 그 문장뿐이다
 *
 * `src/embed.ts`의 머리말이 *"`run`·`COMMANDS`·`usage`·argv 파싱은 여기 없다"*를 근거와
 * 함께 적는다. 그런데 이 파일이 없으면 `embed.ts`에 `export { run, COMMANDS, usage } from './run'`
 * 한 줄을 더해도 **모든 케이스가 초록**이다.
 *
 * `./embed`이 **모자라면** `packages/mcp`가 import에서 못 서므로 그 방향은 저절로 잡힌다.
 * **넘치는** 경우는 이 파일 말고 아무도 안 본다.
 *
 * # 무엇을 지키나 — *"`bin`은 안 내준다"*
 *
 * `wireb`의 명령 표·argv 파싱·쓰임말이 `embed`로 나가면 **도구가 CLI를 흉내 내는 길**이
 * 열린다. 그러면 종료 코드를 도구 결과로 옮기는 층이 하나 더 생기고, 그 층이 설계서
 * 「MCP 도구」의 표와 「CLI」의 표를 묶어 버린다 — 한쪽을 고칠 때 다른 쪽이 따라 움직인다.
 *
 * # 두 축으로 잰다
 *
 * 1. **런타임 면** — `import * as`로 실제 export 목록을 받아 금지된 이름이 없는지 본다.
 * 2. **소스** — `embed.ts`가 `./run`에서 재수출하지 않는지 본다. 이름을 바꿔 내주는 길
 *    (`export { run as start }`)을 축 1이 못 보기 때문이다.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import * as embed from '../src/embed'
import * as index from '../src/index'

const EMBED_SOURCE = readFileSync(fileURLToPath(new URL('../src/embed.ts', import.meta.url)), 'utf8')

/**
 * **`wireb`의 것이고 `embed`으로 나가면 안 되는 이름들.**
 *
 * 전부 `src/index.ts`(CLI의 공개 면)에는 있어야 한다 — 아래 첫 케이스가 그것을 확인해
 * **이름이 바뀌었을 때 이 목록이 조용히 아무것도 안 막는 상태**를 막는다.
 */
const CLI_ONLY = ['run', 'usage', 'COMMANDS', 'matchCommand', 'DEFAULT_PULL_FILE']

describe('`./embed`이 `bin`을 안 내준다', () => {
  it('막으려는 이름이 CLI의 공개 면에 실재한다 — 분모 확인', () => {
    // 이 케이스가 없으면 `run`을 `execute`로 바꾼 날 아래가 **아무것도 안 막고** 통과한다.
    const surface = Object.keys(index)
    for (const name of CLI_ONLY) expect(surface, name).toContain(name)
  })

  it('그 이름들이 `embed`의 면에 없다', () => {
    const surface = Object.keys(embed)
    // 분모가 비면 아래가 공허하다.
    expect(surface.length).toBeGreaterThan(15)
    expect(surface.filter((name) => CLI_ONLY.includes(name))).toEqual([])
  })

  it('`embed.ts`가 `./run`에서 아무것도 재수출하지 않는다 — 이름을 바꿔 내주는 길도 막는다', () => {
    // 축 1은 `export { run as start }`를 못 본다. 소스가 그것을 본다.
    expect(EMBED_SOURCE).not.toMatch(/from\s+['"]\.\/run['"]/)
    // 술어가 실제로 가르는지 — 이 파일이 다른 자리에서는 재수출을 하고 있다.
    expect(EMBED_SOURCE).toMatch(/from\s+['"]\.\/project['"]/)
  })

  it('붙는 자리는 실제로 나간다 — 반대편', () => {
    // 경계를 좁히다 못해 아무것도 안 내주면 `packages/mcp`가 못 선다.
    const surface = Object.keys(embed)
    for (const name of ['createNodeIo', 'requireProject', 'fetchSnapshot', 'readLintConfig', 'lookupPage']) {
      expect(surface, name).toContain(name)
    }
  })
})
