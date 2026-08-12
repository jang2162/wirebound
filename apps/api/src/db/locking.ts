import type { DbHandle } from './tx'

/**
 * `FOR UPDATE`를 거는 함수가 **트랜잭션 핸들로 불렸는지** 확인한다.
 *
 * `repos/pages.ts`의 `lockPageForEdit`이 자기 자리에서 하던 검사를 P6-2가 여기로 뽑았다 —
 * 복원이 다섯 테이블에 같은 검사를 걸게 되면서 소비자가 넷 더 생겼기 때문이다
 * (`http/edit-outcome.ts`·`http/warnings.ts`가 두 번째 소비자에서 옮겨 간 것과 같은 자리).
 *
 * **왜 크게 실패해야 하는가.** `db.selectFrom(...).forUpdate()`를 트랜잭션이 아닌 핸들로
 * 실행하면 Postgres가 그 문장 하나만을 위한 암묵적 트랜잭션을 열고 문장이 끝나자마자
 * 커밋한다 — `FOR UPDATE`가 건 잠금도 **그 순간 함께 풀린다.** 그러면 "잠갔다"고 믿는
 * 코드가 아무것도 잠그지 않은 채로 도는데, 그 상태는 **평소에 잘 돌고 경합에서만 틀린다.**
 * 조용히 동시성 방어를 없애는 종류이므로 그 자리에서 크게 죽인다.
 */
export function assertLocking(trx: DbHandle, fnName: string): void {
  if (!trx.isTransaction) {
    throw new Error(
      `${fnName}은 트랜잭션 핸들(trx)로만 불러야 합니다 — 그렇지 않으면 FOR UPDATE 잠금이 이 문장 직후 즉시 풀립니다.`,
    )
  }
}
