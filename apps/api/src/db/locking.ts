import type { DbHandle } from './tx'

/**
 * `FOR UPDATE`를 거는 함수가 **트랜잭션 핸들로 불렸는지** 확인한다.
 *
 * 한 자리에 두는 이유는 소비자가 여럿이기 때문이다 — `repos/pages.ts`의 `lockPageForEdit`과
 * 복원이 잠그는 다섯 테이블이 같은 검사를 건다. 같은 검사를 두 벌로 두면 한쪽만 고쳐진다
 * (`http/edit-outcome.ts`·`http/warnings.ts`가 한 자리에 선 것과 같은 이유).
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
