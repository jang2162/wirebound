import { render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { ApiProvider, useApi } from '../../src/api/context'
import { fakeApi } from '../helpers'

/** `useApi`가 돌려준 것을 화면에 적는다 — 훅의 반환값을 밖에서 볼 통로. */
function Probe(): ReactElement {
  const api = useApi()
  return <span>{typeof api.login}</span>
}

describe('ApiProvider', () => {
  it('Provider 안에서는 넣어 준 클라이언트를 돌려준다', () => {
    render(
      <ApiProvider client={fakeApi()}>
        <Probe />
      </ApiProvider>,
    )

    screen.getByText('function')
  })

  it('Provider 밖에서 부르면 던진다', () => {
    // React가 렌더 중 오류를 콘솔에도 찍는다. 테스트 출력만 조용히 하고, 오류 자체는
    // 아래에서 그대로 단언한다.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      // 조용히 `undefined`를 돌려주면 첫 호출 지점에서 `undefined.login`이 되고,
      // 그때는 Provider를 빠뜨렸다는 사실이 스택에 남지 않는다.
      expect(() => render(<Probe />)).toThrow(/ApiProvider/)
    } finally {
      consoleError.mockRestore()
    }
  })
})
