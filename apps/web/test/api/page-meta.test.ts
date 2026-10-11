/**
 * `api/page-meta.ts` — 페이지 메타 충돌의 **판정 하나**(`judgeMeta`)와 **409 를 읽는 법**(`metaConflict`). 화면을 안
 * 지나고 잰다. 화면의 갈래는 `panels/page-meta-conflict.test.tsx` · `write-ledger.test.tsx`의 «시간 안에 응답이 없으면 결과를 모르는 것이다» 절 ·
 * `menu-crud.test.tsx`의 «페이지 제목의 충돌»이 잰다.
 */
import { describe, expect, it } from 'vitest'
import { ApiError } from '../../src/api/client'
import { judgeMeta, metaConflict, PAGE_META_CHANGED } from '../../src/api/page-meta'

describe('judgeMeta — 서버 값 하나를 네 갈래로', () => {
  /**
   * **늘 화면 케이스와 함께 죽는다** — 갈래 하나를 바꾸면 그 갈래를 화면에서 재는 케이스가 함께 죽는다. 축의 주인:
   * `'mine'` — `page-meta-conflict.test.tsx`의 «409 의 지금 값이 내 글과 같으면 …» · `'base'` — `write-ledger.test.tsx`의
   * «서버 값이 다르면 저장되지 않았다고 …» · `'other'` — 같은 파일의 «서버 값이 내 글도 바탕도 아니면 …». 여기 남기는
   * 것은 표 한 장으로 읽히라고서다.
   */
  it('내 값이면 mine · 바탕이면 base · 둘 다 아니면 other', () => {
    expect(judgeMeta('앨리스', '앨리스', '처음')).toBe('mine')
    expect(judgeMeta('처음', '앨리스', '처음')).toBe('base')
    expect(judgeMeta('밥', '앨리스', '처음')).toBe('other')
  })

  /**
   * **빈 값은 `''`든 `null`이든 같다**(`@wirebound/schema`의 `samePageMeta` — 서버의 견주기와 같은 함수).
   * 혼자 죽는 변조: `judgeMeta`가 `samePageMeta` 대신 `===`로 견준다.
   */
  it('null 과 빈 문자열을 같게 본다 — 화면에서 둘 다 «설명 없음»이고 서버도 같게 견준다', () => {
    expect(judgeMeta(null, null, '처음')).toBe('mine')
    expect(judgeMeta('', null, '처음')).toBe('mine')
    expect(judgeMeta(null, '', '처음')).toBe('mine')
    expect(judgeMeta('', '앨리스', null)).toBe('base')
    expect(judgeMeta(null, '앨리스', '')).toBe('base')
    expect(judgeMeta(null, '앨리스', '처음')).toBe('other')
  })

  /**
   * **매달린 내 값이면 late.** 화면의 축(«저장되지 않았습니다» 뒤 늦게 닿은 글)은 `write-ledger.test.tsx`의 «시간 안에 응답이 없으면 결과를 모르는 것이다» 절
   * «… 늦게 커밋되면 …»이 주인이다 — `'late'` 갈래를 지우면 둘이 함께 죽는다.
   */
  it('매달린 내 값과 같으면 late — mine · base 가 먼저다', () => {
    expect(judgeMeta('앞 글', '더 친 글', '처음', ['앞 글'])).toBe('late')
    expect(judgeMeta('앞 글', '더 친 글', '처음', ['더 앞 글', '앞 글'])).toBe('late')
    expect(judgeMeta('밥', '더 친 글', '처음', ['앞 글'])).toBe('other')
    // 매달린 값도 빈 값은 `''`든 `null`이든 같다(위 케이스의 규칙).
    expect(judgeMeta('', '더 친 글', '처음', [null])).toBe('late')
    expect(judgeMeta('앞 글', '앞 글', '처음', ['앞 글'])).toBe('mine')
    expect(judgeMeta('처음', '더 친 글', '처음', ['처음'])).toBe('base')
  })

  it('내 값과 바탕이 같으면 mine 이 먼저다', () => {
    expect(judgeMeta('같다', '같다', '같다')).toBe('mine')
  })
})

describe('metaConflict — 409 에서 그 칸의 지금 값을 읽는다', () => {
  const issue = (path: string, current: unknown, code = PAGE_META_CHANGED) => ({ path, code, message: '…', current }) as never

  it('이슈 코드와 칸이 맞으면 지금 값을 낸다 — null 도 값이다', () => {
    expect(metaConflict(new ApiError(409, 'conflict', '…', [issue('description', '밥')]), 'description')).toEqual({ current: '밥' })
    expect(metaConflict(new ApiError(409, 'conflict', '…', [issue('description', null)]), 'description')).toEqual({ current: null })
  })

  it('다른 칸 · 다른 코드 · 코드 없는 409 · 409 가 아닌 것 · 지금 값이 없는 것은 충돌이 아니다', () => {
    expect(metaConflict(new ApiError(409, 'conflict', '…', [issue('title', '밥')]), 'description')).toBeNull()
    expect(
      metaConflict(new ApiError(409, 'conflict', '…', [issue('description', '밥', 'idempotency-key-reused')]), 'description'),
    ).toBeNull()
    expect(metaConflict(new ApiError(409, 'conflict', '…'), 'description')).toBeNull()
    expect(metaConflict(new ApiError(403, 'forbidden', '…', [issue('description', '밥')]), 'description')).toBeNull()
    expect(metaConflict(new ApiError(409, 'conflict', '…', [issue('description', undefined)]), 'description')).toBeNull()
    expect(metaConflict(new Error('그냥 오류'), 'description')).toBeNull()
  })
})
