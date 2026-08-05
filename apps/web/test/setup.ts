import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// RTL은 **전역** `afterEach`가 있을 때만 자동 cleanup을 건다
// (`@testing-library/react/dist/index.js`의 `typeof afterEach === 'function'` 분기).
// 이 저장소는 vitest `globals`를 켜지 않으므로 그 분기가 성립하지 않는다. 직접
// 등록하지 않으면 같은 파일의 앞 테스트가 남긴 DOM 위에서 뒤 테스트가 돈다 —
// 실측으로 `smoke.test.tsx`의 두 번째 it이 "found multiple elements"로 실패했다.
//
// 이 파일이 사라지면 그 두 번째 it이 다시 실패한다.
afterEach(cleanup)
