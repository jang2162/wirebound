// @vitest-environment node
/**
 * **패널 칸의 선언**(`src/panels/panel-drafts.tsx`의 `slotsOf` — 리뷰 R4). 두 모듈이 같은 이름을 쓰면 요란하게 깨지고,
 * **같은 모듈이 다시 불린 것**(개발 서버의 HMR — Vite 는 다시 부른 모듈의 주소에 `?t=<시각>`을 붙인다)은 받아 **같은
 * 칸 객체**를 돌려준다. 앞 판은 뒤의 것도 던져 파일을 저장할 때마다 `Failed to reload`였고, 던지는 것만 떼면 새 객체라
 * 모든 칸이 첫 값으로 돌아갔다(Chrome — `panel-drafts.tsx`의 `slotsOf` 주석).
 *
 * 이름은 이 파일만의 것이다 — 칸 표는 모듈 전역이라 앱의 칸과 겹치면 그 모듈을 깨뜨린다.
 *
 * | 변조 | 죽는 것 |
 * |---|---|
 * | 같은 이름이면 늘 던진다(앞 판) | *"같은 모듈이 다시 불리면 같은 칸이다 …"* |
 * | 모듈의 주소에서 쿼리를 안 뗀다 | *"같은 모듈이 다시 불리면 같은 칸이다 …"* |
 * | 다시 불리면 새 객체를 낸다(갈아 끼우기만) | *"같은 모듈이 다시 불리면 같은 칸이다 …"* |
 * | 다시 불려도 앞 선언(`keeper`)을 그대로 둔다 | *"… 선언은 새것이다"* |
 * | 겹쳐도 안 던진다 | *"두 모듈이 같은 이름을 쓰면 던진다"* |
 */
import { describe, expect, it } from 'vitest'
import { slotsOf } from '../../src/panels/panel-drafts'

const keeper = (tag: string) => ({
  save: (value: string) => `${tag}:${value}`,
  load: (raw: unknown) => (typeof raw === 'string' ? raw : undefined),
})

describe('slotsOf — 패널 칸의 선언', () => {
  it('같은 모듈이 다시 불리면 같은 칸이다 — HMR 의 `?t=` 가 붙어도', () => {
    const first = slotsOf('http://localhost:5173/src/panels/a.tsx')('test/slot-owner/hmr', '', keeper('첫'))
    const again = slotsOf('http://localhost:5173/src/panels/a.tsx?t=1758600000000')('test/slot-owner/hmr', '', keeper('둘'))

    expect(again).toBe(first)
  })

  it('같은 모듈이 다시 불리면 같은 칸이다 — 선언은 새것이다(고친 `keeper`가 선다)', () => {
    const first = slotsOf('http://localhost:5173/src/panels/a.tsx')('test/slot-owner/renewed', '', keeper('첫'))
    slotsOf('http://localhost:5173/src/panels/a.tsx?t=1758600000001')('test/slot-owner/renewed', '', keeper('둘'))

    expect(first.keeper?.save('글')).toBe('둘:글')
  })

  it('두 모듈이 같은 이름을 쓰면 던진다', () => {
    slotsOf('http://localhost:5173/src/panels/a.tsx')('test/slot-owner/twice', 0)
    expect(() => slotsOf('http://localhost:5173/src/panels/b.tsx')('test/slot-owner/twice', 0)).toThrow(
      '패널 칸의 이름이 겹친다: test/slot-owner/twice',
    )
  })
})
