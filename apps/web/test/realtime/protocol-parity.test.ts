// @vitest-environment node
/**
 * **두 벌이 갈라지는 것을 막는다.** `apps/api/src/ws/protocol.ts`와
 * `apps/web/src/realtime/protocol.ts`는 같은 계약을 두 번 적은 것이다 — `apps/*`가 서로
 * 의존하지 않으므로(`CLAUDE.md`) 웹이 api의 타입을 import할 수 없다.
 *
 * **이름을 손으로 맞추면 한쪽만 바뀐다.** 서버가 `page-changed`를 `page-updated`로 고쳐도
 * 웹은 컴파일이 되고, 화면은 **아무 프레임도 못 읽으면서 조용히** 돈다 — 낡은 프레임을
 * `null`로 버리는 것이 이 계층의 계약이라 오류조차 안 난다. 그래서 소스에서 세어 맞댄다.
 *
 * **`ClientFrame`(`ping`)도 함께 맞댄다.** 그쪽이 갈리면 하트비트가 조용히 죽고, 그러면
 * 반쯤 죽은 연결을 아무도 못 알아챈다.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const API_PROTOCOL = fileURLToPath(new URL('../../../api/src/ws/protocol.ts', import.meta.url))
const WEB_PROTOCOL = fileURLToPath(new URL('../../src/realtime/protocol.ts', import.meta.url))

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

/**
 * `ServerFrame` 선언 **안에서만** `type: '…'`을 센다.
 *
 * **범위를 좁히는 것이 요점이다** — 파일 전체를 훑으면 `EventActor`의
 * `type: 'user' | 'mcp'`가 프레임 이름으로 세어진다(재서 알았다: 그것 하나 때문에 양쪽이
 * 안 맞았다). 주석은 먼저 걷는다 — 머리말이 프레임 이름을 인용한다.
 */
function frameTypes(path: string): string[] {
  const source = stripComments(readFileSync(path, 'utf8'))
  const start = source.indexOf('export type ServerFrame =')
  if (start < 0) throw new Error(`${path}에 ServerFrame 선언이 없습니다`)
  const block = source.slice(start).split('\nexport ')[0]!
  return [...new Set([...block.matchAll(/type:\s*'([a-z-]+)'/g)].map((match) => match[1]!))].sort()
}

describe('서버와 웹의 프레임 이름', () => {
  it('두 소스를 실제로 읽는다', () => {
    // 경로가 어긋나면 `frameTypes`가 던지고, 범위가 어긋나면 **빈 집합끼리 같아져**
    // 아래가 조용히 통과한다.
    expect(frameTypes(API_PROTOCOL).length).toBeGreaterThan(4)
    expect(frameTypes(WEB_PROTOCOL).length).toBeGreaterThan(4)
  })

  it('한 글자도 갈리지 않는다', () => {
    expect(frameTypes(WEB_PROTOCOL)).toEqual(frameTypes(API_PROTOCOL))
  })

  it('웹이 보내는 ping을 서버가 그 이름으로 읽는다', () => {
    const api = stripComments(readFileSync(API_PROTOCOL, 'utf8'))
    const web = stripComments(readFileSync(WEB_PROTOCOL, 'utf8'))

    // 웹은 문자열을 미리 만들어 두고(`PING_FRAME`), 서버는 그 이름과 비교한다.
    expect(web).toContain("JSON.stringify({ type: 'ping' })")
    expect(api).toContain("type === 'ping'")
  })

  it('닫는 코드를 웹이 아는 값으로만 쓴다 — 4000번대는 애플리케이션 몫이다', () => {
    const api = stripComments(readFileSync(API_PROTOCOL, 'utf8'))
    const codes = [...api.matchAll(/:\s*(44\d\d),/g)].map((match) => Number(match[1]))

    expect(codes.length).toBeGreaterThan(2)
    expect(codes.every((code) => code >= 4000 && code < 5000)).toBe(true)
  })
})
