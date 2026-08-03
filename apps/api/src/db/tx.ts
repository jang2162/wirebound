import type { Kysely } from 'kysely'
import type { Database } from './types'

export type DbHandle = Kysely<Database>

/**
 * 콜백을 트랜잭션 안에서 돌린다. 이미 트랜잭션 안이면 새 트랜잭션을 열지 않고
 * 그대로 실행한다.
 *
 * **왜 필요한가.** 테스트 하네스(`test/helpers.ts`의 `withApi`)는 앱 전체를 하나의
 * 바깥 트랜잭션 안에서 돌리고, 테스트가 끝나면 그 트랜잭션을 롤백해 격리를 만든다.
 * 만약 라우트 핸들러가 그 안에서 `db.transaction().execute()`를 또 부르면 Postgres에
 * 두 번째 `BEGIN`이 나가고, 안쪽 트랜잭션의 커밋이 (중첩이므로 실제로는 세이브포인트
 * 해제가 아니라) 바깥 트랜잭션까지 커밋해 버릴 수 있다. `db.isTransaction`으로 이미
 * 트랜잭션 핸들을 받았는지 확인해, 그런 경우 새 트랜잭션을 열지 않고 콜백을 그대로
 * 호출해 이 문제를 피한다.
 *
 * **대가 (테스트에서만).** 이미 트랜잭션 안이면 `withTransaction`이 부분 롤백을
 * 제공하지 않는다 — 콜백이 던지더라도 바깥 트랜잭션 자체가 롤백되지 않는 한 그
 * 안에서 쓴 내용은 그대로 남는다(바깥 트랜잭션이 결국 테스트 하네스에 의해 통째로
 * 롤백되므로 테스트 결과 자체는 새지 않지만, "이 라우트가 중간에 실패하면 자기가 쓴
 * 것만 롤백된다"는 성질은 테스트 안에서 검증할 수 없다). P1에는 요청 처리 중간의
 * 부분 롤백에 의존하는 코드가 없으므로 지금은 문제가 되지 않는다.
 *
 * **P3에서 다시 볼 지점.** P3의 동시 편집 테스트는 여러 커넥션이 실제로 커밋한
 * 결과가 서로에게 보여야 검증할 수 있다 — 즉 진짜 커밋이 필요하다. 이 하네스처럼
 * 트랜잭션 하나를 통째로 롤백하는 격리 전략은 그때는 쓸 수 없고, 테스트마다 관련
 * 테이블을 TRUNCATE하는 방식으로 격리 전략을 바꿔야 한다.
 */
export async function withTransaction<T>(db: DbHandle, fn: (trx: DbHandle) => Promise<T>): Promise<T> {
  if (db.isTransaction) return fn(db)
  return db.transaction().execute(fn)
}
