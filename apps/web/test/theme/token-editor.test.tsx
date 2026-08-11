/**
 * **토큰 GUI(② W1) — 케이스 자리.** ①이 미리 만들어 두었다.
 *
 * 셋이 병렬로 일하므로 **각자 자기 케이스 파일에만 쓴다.** `test/routes/theme-editor.test.tsx`는
 * 라우트·권한·저장의 케이스 파일이고 ②가 열면 셋이 같은 파일에서 부딪힌다 — ①의 P5가
 * 그 충돌을 회귀가 못 잡는다는 것을 밟아서 확인했다.
 *
 * 아래 케이스는 **계약 하나**를 잡는다: 이 컴포넌트는 초안 스토어 문맥 안에서 산다.
 * 채우고 나서도 참이어야 하므로 지우지 말고 **아래에 더해라.**
 */
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TokenEditor } from '../../src/theme/token-editor'
import { ThemeDraftStore } from '../../src/store/theme-draft-store'
import { ThemeDraftProvider } from '../../src/store/use-theme-draft'

describe('TokenEditor', () => {
  it('초안 스토어 문맥 안에서 그려진다', () => {
    const store = new ThemeDraftStore()
    store.loadTheme('t1', { meta: { id: 'brand', name: '브랜드', version: '1.0.0' } })

    const view = render(
      <ThemeDraftProvider store={store}>
        <TokenEditor locked={false} />
      </ThemeDraftProvider>,
    )

    expect(view.container).toBeTruthy()
  })
})
