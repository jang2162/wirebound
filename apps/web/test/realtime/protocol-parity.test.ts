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
 * 어떤 선언 **안에서만** `type: '…'`을 센다.
 *
 * **범위를 좁히는 것이 요점이다** — 파일 전체를 훑으면 `EventActor`의
 * `type: 'user' | 'mcp'`가 프레임 이름으로 세어진다(재서 알았다: 그것 하나 때문에 양쪽이
 * 안 맞았다). 주석은 먼저 걷는다 — 머리말이 프레임 이름을 인용한다.
 */
function typesIn(path: string, declaration: string): string[] {
  const source = stripComments(readFileSync(path, 'utf8'))
  const start = source.indexOf(declaration)
  if (start < 0) throw new Error(`${path}에 ${declaration} 선언이 없습니다`)
  const block = source.slice(start + declaration.length).split('\nexport ')[0]!
  return [...new Set([...block.matchAll(/type:\s*'([a-z-]+)'/g)].map((match) => match[1]!))].sort()
}

function frameTypes(path: string): string[] {
  return typesIn(path, 'export type ServerFrame =')
}

/**
 * 클라이언트가 **보내는** 프레임의 이름.
 *
 * **양쪽 모양이 다르다 — 그래서 뽑는 방식도 다르다.** 서버는 P3-2에서 이 계약을 zod로
 * 옮겼으므로(D2 — `http/patch-ops.ts`의 경계를 그대로 넓힌다) 이름이 `z.literal('…')`에
 * 있고, 웹은 여전히 타입 선언이라 `type: '…'`에 있다.
 *
 * **`z.literal`을 파일 전체에서 세는 것은 좁히지 않은 자리다.** 오늘 이 파일의 `z.literal`은
 * 프레임 이름 둘뿐이고, 다른 용도로 그것을 쓰면 여기 섞인다 — 그때는 이 함수가 먼저
 * 실패하므로 조용히 새지는 않는다.
 */
function clientFrameTypes(): { api: string[]; web: string[] } {
  const api = stripComments(readFileSync(API_PROTOCOL, 'utf8'))
  return {
    api: [...new Set([...api.matchAll(/z\.literal\('([a-z-]+)'\)/g)].map((match) => match[1]!))].sort(),
    web: typesIn(WEB_PROTOCOL, 'export type ClientFrame ='),
  }
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

  /**
   * **클라이언트가 보내는 쪽도 맞댄다.** 앞 판은 `ping` 하나뿐이라 양쪽 소스에서 그 리터럴을
   * 글자로 찾았는데, P3-2가 서버의 파서를 zod로 옮기면서 그 문장(`type === 'ping'`)이
   * 사라졌다. **갈래가 늘었으므로 세는 방식도 `ServerFrame`과 같은 형태로 옮긴다** —
   * 글자 하나를 찾는 검사는 갈래마다 한 줄씩 늘어난다.
   *
   * 여기가 갈리면 **편집이 조용히 안 나간다**: 서버는 모르는 프레임을 `null`로 읽고 연결을
   * 닫으므로, 화면은 재연결만 반복하며 편집이 영영 저장되지 않는다.
   */
  it('보내는 프레임의 이름도 한 글자도 갈리지 않는다', () => {
    const { api, web } = clientFrameTypes()

    // 하나짜리면 이름을 아무렇게나 적어도 양쪽이 우연히 맞는다.
    expect(api.length).toBeGreaterThan(1)
    expect(web).toEqual(api)
  })

  it('웹이 미리 만들어 두는 하트비트가 그 이름을 쓴다', () => {
    const web = stripComments(readFileSync(WEB_PROTOCOL, 'utf8'))

    expect(web).toContain("JSON.stringify({ type: 'ping' }")
  })

  it('닫는 코드를 웹이 아는 값으로만 쓴다 — 4000번대는 애플리케이션 몫이다', () => {
    const api = stripComments(readFileSync(API_PROTOCOL, 'utf8'))
    const codes = [...api.matchAll(/:\s*(44\d\d),/g)].map((match) => Number(match[1]))

    expect(codes.length).toBeGreaterThan(2)
    expect(codes.every((code) => code >= 4000 && code < 5000)).toBe(true)
  })
})
