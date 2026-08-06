import { act, cleanup, configure, getConfig } from '@testing-library/react'
import { afterEach } from 'vitest'

// RTL은 **전역** `afterEach`가 있을 때만 자동 cleanup을 건다
// (`@testing-library/react/dist/index.js`의 `typeof afterEach === 'function'` 분기).
// 이 저장소는 vitest `globals`를 켜지 않으므로 그 분기가 성립하지 않는다. 직접
// 등록하지 않으면 같은 파일의 앞 테스트가 남긴 DOM 위에서 뒤 테스트가 돈다 —
// 실측으로 `smoke.test.tsx`의 두 번째 it이 "found multiple elements"로 실패했다.
//
// 이 파일이 사라지면 그 두 번째 it이 다시 실패한다.
afterEach(cleanup)

/**
 * `findBy*`·`waitFor`가 돌아온 뒤 **passive effect가 다 흐르도록** `act`를 한 번 더 준다.
 *
 * **왜 필요한가.** `findBy*`는 MutationObserver로 깨어난다 — React가 커밋해 DOM에 노드를
 * 꽂는 순간이다. 그 커밋의 passive effect는 그 시점에 아직 스케줄만 되어 있다.
 * `useSyncExternalStore`의 스토어 구독이 바로 그 passive effect에서 붙으므로,
 * `await screen.findByRole(…)`로 화면이 떴다고 판단한 직후에도 **스토어의 구독자가
 * 0명일 수 있다.** 그 상태에서 `fireEvent.click`이 스토어를 바꾸면 알릴 대상이 없어
 * 리렌더가 스케줄되지 않고, 클릭 직후의 동기 단언이 클릭 **이전** DOM을 읽는다.
 *
 * RTL의 `asyncWrapper`는 그 뒤에 매크로태스크를 딱 한 칸(`setTimeout(…, 0)`) 준다.
 * 보통은 그 한 칸에서 React가 이펙트를 흘리지만 CPU가 붐비면 그 경주에서 진다.
 *
 * **실측(태스크 8 시점, 그 뒤로 다시 재지 않았다).** 그 한 칸만 없앤 판(`asyncWrapper`에서
 * `setTimeout`만 제거)에서 `apps/web/test` 전량이 3회 연속 **다섯을 죽였다** — 죽는 다섯이
 * 매번 같고 전부 `editor-shell.test.tsx`의 "`findBy*` 직후에 무언가를 누르는" 케이스다.
 * 이 `act`를 얹으면 같은 판이 3회 연속 전량 통과가 된다. **분모를 적지 않는 것은 케이스를
 * 더할 때마다 어긋나기 때문이다.**
 *
 * 부하 시험(단독 96회·전량 20회, 수정 전 대조군과 나란히)은 태스크 8 보고서
 * §fix 라운드 4에 있다. **여기서 재지 못한 것도 그 절에 적었다 — 이 한 줄이 모든 간헐
 * 실패를 닫는다고는 말할 수 없다.** 잰 것은 그 표본에서 실패가 0이라는 것까지다.
 *
 * **테스트를 약하게 만들지 않는지도 쟀다 — 다만 "그대로"는 아니다.** 이 브랜치의 변이
 * 11종을 수정 전후로 각각 걸어 봤고, **열에서는 죽는 케이스 집합이 같았다.** 예외가
 * 하나 있다(§fix 라운드 4의 표 R16: 2 사망 → 1 사망) — 재리뷰가 그 한 자리를 "간헐 실패
 * 그 자체"로 확정했다. 단언은 한 줄도 바뀌지 않는다 — 화면이 살아난 **뒤에** 테스트가
 * 손대게 만들 뿐이다.
 *
 * **대가는 하나다: 커밋 하나짜리 중간 상태가 이 스위트에 보이지 않는다.** 모든 단언이
 * "완전히 가라앉은 트리"만 보게 되므로(원래는 경주였다), 잘못된 중간 커밋은 어떤 `expect`도
 * 잡지 못한다 — 실제로 그런 결함이 하나 있었다(`pageId`가 바뀐 뒤 첫 커밋에 앞 페이지가
 * 그려지던 것). 그 부류를 보려면 커밋 자체를 읽는 장치가 따로 필요하다:
 * `test/editor-harness.tsx`의 `CommitProbe`가 그것이다.
 *
 * 이 블록을 지우면 위 재현판이 다시 다섯을 죽인다.
 */
const rtlAsyncWrapper = getConfig().asyncWrapper
configure({
  asyncWrapper: async (cb) => {
    const result = await rtlAsyncWrapper(cb)
    await act(async () => {})
    return result
  },
})
