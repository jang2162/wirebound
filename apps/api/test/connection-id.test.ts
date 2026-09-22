/**
 * 연결 id 가 **재기동을 넘어** 겹치지 않는가(`src/ws/connection-id.ts` — 좁은 반증 3차).
 *
 * 재기동은 모듈을 다시 읽는 것으로 흉내 낸다(`vi.resetModules` 뒤 동적 `import`) — 모듈 스코프의 상태가
 * 처음부터 다시 선다. 앞 판(카운터)은 두 판 모두 `wsc_1`부터 매겨 **전부** 겹쳤다. 실제 재기동의 값은
 * Chrome 이 잰다(`apps/api` 를 죽였다 띄우고 옛 id 를 받은 남의 연결 — 리뷰 (c-1)).
 *
 * **예측할 수 없는지는 여기서 안 잰다.** 방송은 제외 대상의 세션을 보므로(`ws-broadcast.test.ts`의 «다른
 * 세션의 요청이 실은 id 로는 …») id 를 맞혀도 남을 뺄 수 없다 — 짐작 가능성이 해가 되는 길이 그 케이스에서
 * 닫힌다.
 */
import { describe, expect, it, vi } from 'vitest'

/** 모듈을 새로 읽어 id 를 `count`개 짓는다 — 새 프로세스의 첫 연결들이다. */
async function idsOfFreshProcess(count: number): Promise<string[]> {
  vi.resetModules()
  const { nextConnectionId } = await import('../src/ws/connection-id')
  return Array.from({ length: count }, () => nextConnectionId())
}

describe('연결 id (좁은 반증 3차)', () => {
  it('새 프로세스의 id 가 앞 프로세스의 id 와 안 겹친다 — 재기동 전의 id 를 실은 요청이 남을 가리키지 않는다', async () => {
    const before = await idsOfFreshProcess(50)
    const after = await idsOfFreshProcess(50)

    expect(new Set(before).size).toBe(50)
    expect(after.filter((id) => before.includes(id))).toEqual([])
  })
})
