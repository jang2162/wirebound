/**
 * 시스템 테마를 코드에서 DB로 동기화한다.
 *
 * **코드가 진실이고 DB는 그 사본이다.** `packages/themes/src/system/`이
 * 시스템 테마를 갖고 있고 사용자는 그것을 고칠 수 없다(설계서 「테마 관리」: 읽기 전용). DB에 행을
 * 두는 이유는 **`themes` 테이블 하나로 목록이 완결되게** 하기 위해서다 —
 * `listThemes`가 *"이 프로젝트에서 고를 수 있는 테마"*를 한 번에 내고,
 * `layouts.theme_id`가 시스템 테마도 uuid로 가리킬 수 있다(설계서 「테이블 정의」).
 *
 * **마이그레이션이 아니라 기동 시 동기화다.** 마이그레이션에 박으면 테마 파일을 고칠
 * 때마다 새 마이그레이션이 필요하다 — 시스템 테마는 배포에 실려 오는 **코드**이지
 * 스키마도 데이터도 아니다.
 *
 * ---
 *
 * **upsert만 한다. 삭제하지 않는다.**
 *
 * 코드에서 시스템 테마 하나가 사라져도 그 행을 지우지 않는다.
 *
 * 1. **`layouts.theme_id`가 `themes.id`를 참조한다**(0007). 지우면 그 레이아웃이 함께
 *    깨진다. 코드 한 줄을 지운 결과가 **사용자 데이터**에 닿는 것은 이 함수가 감당할
 *    권한 밖이다.
 * 2. **파생 테마가 `extends_ref`로 그 slug를 가리킨다.** 행이 사라지면 목록에서도
 *    사라져 사용자가 무엇이 끊겼는지 볼 수 없다 — 끊긴 것을 보여 주는 편이 낫다.
 * 3. **되돌릴 수 있는 쪽을 고른다.** 낡은 행이 남는 것은 다음 배포가 고칠 수 있지만,
 *    지워진 행에 매달렸던 레이아웃·파생 테마는 되살릴 수 없다. 배포 롤백이나 테마
 *    이름을 잠시 바꾸는 것만으로도 그 삭제가 일어난다.
 *
 * **대가를 알고 고른다: 코드에 없는 시스템 테마 행이 목록에 남는다.** 그 테마는 해석할
 * 수 없다(`systemTheme()`이 `undefined`를 낸다). 치우는 것은 사람이 판단할 일이라
 * 관리 경로의 몫으로 남긴다.
 *
 * ---
 *
 * **여러 인스턴스가 동시에 기동해도 경합하지 않는다.** `ON CONFLICT (project_id, slug)
 * DO UPDATE`가 한 문장이라 원자적이다. 둘이 같은 값을 쓰므로 어느 쪽이 이겨도 결과가
 * 같고, 조회 후 삽입이 아니라 삽입 자체가 판정하므로 그 사이의 창이 없다.
 *
 * **그 `ON CONFLICT`가 성립하는 것은 0006의 유니크가 `NULLS NOT DISTINCT`이기
 * 때문이다.** 평범한 UNIQUE였다면 `(NULL, 'admin')`이 충돌로 판정되지 않아 이 문장이
 * 매 기동마다 행을 하나씩 늘린다(`test/system-themes.test.ts`의 `두 번 돌려도 늘지 않는다 (멱등)`이 잰다).
 *
 * `services/`는 SQL을 직접 쓰지 않는다는 계층 규칙(README)을 지킨다 — 실제 SQL은
 * `repos/themes.ts`의 `upsertSystemTheme`이 갖고, 이 파일은 **무엇을 동기화할지**만 안다.
 */
import { SYSTEM_THEME_IDS, systemTheme } from '@wirebound/themes'
import type { DbHandle } from '../db/tx'
import { upsertSystemTheme } from '../repos/themes'

export async function syncSystemThemes(db: DbHandle): Promise<void> {
  for (const id of SYSTEM_THEME_IDS) {
    const theme = systemTheme(id)
    // `SYSTEM_THEME_IDS`가 같은 표의 키이므로 도달하지 않는다. 그래도 `!`로 좁히지
    // 않는 이유는 그 두 export가 갈리는 날 조용히 `undefined`를 저장하지 않기 위해서다.
    if (theme === undefined) continue
    await upsertSystemTheme(db, theme)
  }
}
