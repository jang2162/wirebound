/** 실행 중에 viewer 로 내린 화면을 훑는 케이스. 도구는 `./viewer-readonly-harness` 가 갖는다(머리말 · 사각 · 대조의 뜻). */
import { describe, expect, it } from 'vitest'
import { sweepEditor } from './viewer-readonly-harness'

describe('viewer 는 에디터에서 쓰기를 내지 않는다', () => {
  /**
   * **실행 중에 내린 viewer** — editor 로 열어 둔 화면이 새로고침 없이 viewer 가 된 뒤 같은 훑기. 내리기 전에는 아무것도
   * 안 눌렀다 — 루트는 잡지 않으므로 내리는 순간의 `unlock`도 없다(잡은 자리를 놓는 것은 `role-live.test.tsx`가 잰다).
   *
   * 혼자 죽는 변조: 코멘트 패널이 `canEdit`을 **마운트 때 값으로 굳힌다** — 새로 연 viewer 판은 못 본다(처음 값이 곧 거짓).
   */
  it('editor 로 연 화면을 실행 중에 viewer 로 내린 뒤 훑어도 HTTP 쓰기 0 · WS 쓰기 프레임 0', async () => {
    const wire = await sweepEditor('viewer', undefined, true)
    expect(wire.unrouted).toEqual([])
    expect({ http: [...new Set(wire.http)].sort(), frames: [...new Set(wire.frames)].sort() }).toEqual({
      http: [],
      frames: [],
    })
  }, 300_000)
})
