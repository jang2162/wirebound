import { screen } from '@testing-library/react'
import { describe, it } from 'vitest'
import { App } from '../src/app'
import { fakeApi, renderWithProviders, unauthenticatedError } from './helpers'

/** 로그인하지 않은 사용자로 첫 화면을 띄운다. 세션 확인이 끝나야 무언가 그려진다. */
async function renderFirstScreen(): Promise<void> {
  renderWithProviders(<App />, {
    client: fakeApi({ me: async () => Promise.reject(unauthenticatedError()) }),
    route: '/login',
  })
  await screen.findByLabelText('이메일')
}

// 이 파일이 검증하는 것은 App의 내용이 아니라 **테스트 하네스가 성립하는지**다:
// jsdom 환경, .tsx 변환(자동 JSX 런타임), React 19 + testing-library 조합.
// 셋 중 하나라도 빠지면 렌더가 아예 죽는다.
describe('앱 골격', () => {
  it('앱을 렌더하면 제품 이름이 제목으로 보인다', async () => {
    await renderFirstScreen()
    // getByRole은 못 찾으면 스스로 던지므로 이 호출 자체가 단언이다.
    // 'heading' 역할까지 요구하니 제품 이름이 사라져도, 제목이 아닌 요소로
    // 바뀌어도 실패한다.
    screen.getByRole('heading', { name: 'wirebound' })
  })

  it('같은 파일에서 두 번 렌더해도 앞 DOM이 남지 않는다', async () => {
    await renderFirstScreen()
    // 앞 it이 붙인 DOM이 정리되지 않으면 heading이 둘이 되어
    // getByRole이 "found multiple elements"로 던진다.
    screen.getByRole('heading', { name: 'wirebound' })
  })
})
