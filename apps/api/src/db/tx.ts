import { sql, type Kysely } from 'kysely'
import type { Database } from './types'

export type DbHandle = Kysely<Database>

/**
 * SAVEPOINT 이름을 매긴다. `Math.random()`이 아니라 모듈 스코프 카운터를 쓴다 —
 * 이름이 프로세스 생애 동안 절대 겹치지 않아 트랜잭션 안 유일성이 보장되고,
 * 실패를 재현할 때 이름이 매번 바뀌지 않아 디버깅이 쉽다.
 */
let savepointCounter = 0

function nextSavepointName(): string {
  savepointCounter += 1
  return `wb_sp_${savepointCounter}`
}

/**
 * 콜백을 트랜잭션 안에서 돌린다.
 *
 * - 아직 트랜잭션 밖이면 `db.transaction().execute(fn)`으로 새 트랜잭션을 연다.
 * - 이미 트랜잭션 안이면(`db.isTransaction`) **SAVEPOINT로 감싸** 그 구간만
 *   독립적으로 롤백 가능하게 만든다: `SAVEPOINT` → `fn` 실행 → 성공하면
 *   `RELEASE SAVEPOINT`, 실패하면 `ROLLBACK TO SAVEPOINT` 후 원래 에러를 다시 던진다.
 *
 * **왜 SAVEPOINT가 필요한가 (그냥 콜백을 그대로 부르면 안 되는 이유).**
 * Postgres는 트랜잭션 안에서 문장 하나가 에러를 내면 그 트랜잭션 전체를
 * "aborted" 상태로 만든다 — 이후의 모든 문장이 실제 내용과 무관하게
 * `25P02 current transaction is aborted`로 실패한다. 이 함수가 옛날처럼
 * `if (db.isTransaction) return fn(db)`로 콜백을 그대로 불렀다면, `fn` 안에서
 * DB 제약(유니크 위반 등) 하나만 걸려도 같은 트랜잭션을 공유하는 이후 모든 쿼리가
 * 오염된다. 이 단계(P1)의 409 경로(가입 시 중복 이메일, 프로젝트 슬러그 중복,
 * 멤버 PK 중복 등)는 전부 이런 DB 제약 위반으로 구현되므로, 테스트가 그 위반을
 * 유발한 뒤 같은 `withApi` 트랜잭션 안에서 다른 걸 확인하려 하면 실제로는 아무것도
 * 검증하지 못한 채 통과해 버릴 수 있었다(라우트가 DB 에러를 폭넓게 잡아 409로
 * 매핑하면, 원인이 제약 위반이든 트랜잭션 오염이든 겉보기엔 똑같이 409가 나간다).
 * `ROLLBACK TO SAVEPOINT`는 aborted 상태에서도 Postgres가 받아주는 몇 안 되는
 * 명령 중 하나이고, 실행하면 트랜잭션이 다시 정상 상태로 돌아온다 — 그래서 이
 * 함수가 이미 트랜잭션 안에 있을 때도 "그 구간만의 실패"와 "바깥 트랜잭션 전체의
 * 상태"를 분리할 수 있다.
 *
 * **왜 Kysely의 `ControlledTransaction.savepoint()`를 안 쓰고 raw SQL로 직접
 * 짜는가.** Kysely 0.28은 `savepoint()`/`rollbackToSavepoint()`/`releaseSavepoint()`
 * 메서드를 `ControlledTransaction`에만 두고 있고, 이 인스턴스는 `db.startTransaction()
 * .execute()`로만 얻는다. 반면 이 하네스와 이 함수의 `else` 분기가 쓰는
 * `db.transaction().execute(callback)`은 평범한 `Transaction<DB>`를 콜백에 넘기고,
 * 그 타입엔 저 세 메서드가 없다(직접 실행해 `typeof trx.savepoint === 'undefined'`로
 * 확인함). 즉 이미 확보한 트랜잭션 핸들에 문서의 메서드 체인을 그대로 쓸 수 없다.
 * 대신 `sql`SAVEPOINT ${sql.id(name)}\`` 형태로 직접 SQL을 내는데, 이는 Kysely
 * 내부에서 `ControlledTransaction.savepoint()`가 하는 일(`parseSavepointCommand`가
 * `IdentifierNode`로 이름을 감싸 컴파일하는 것)과 동일하다 — `sql.id()`가 같은
 * 방식으로 식별자를 인용 처리해 준다. 즉 "즉흥적인 우회"가 아니라 Kysely가 이미
 * 쓰는 메커니즘을 우리가 들고 있는 핸들 타입 위에 그대로 재현한 것이다.
 *
 * **P3에서 다시 볼 지점 — 앞 문장은 참이고 뒷 문장은 틀렸다(P3-1이 고쳐 적는다).**
 * 여러 커넥션이 실제로 커밋한 결과가 서로에게 보여야 검증되는 성질이 있고(동시 편집,
 * 브로드캐스트), 이 하네스처럼 트랜잭션 하나를 통째로 롤백하는 격리 전략은 그것을 잴 수
 * 없다 — **여기까지는 참이다.**
 *
 * 이어지던 *"테스트마다 관련 테이블을 TRUNCATE하는 방식으로 격리 전략을 바꿔야 한다"*는
 * **거짓이다.** 이 문단이 쓰이고 같은 날 `test/revisions-concurrency.test.ts`가 그 길을
 * 가지 않고 **두 번째 하네스**를 세웠다 — 앱을 트랜잭션이 아니라 풀 핸들 위에 올려 요청마다
 * 다른 커넥션이 각자 커밋하게 하고, 격리는 `projects`·`users` 두 줄의 DELETE(CASCADE가
 * 나머지를 데려간다)로 한다. 그 뒤 같은 것이 필요해진 슬라이스들이 전부 그 꼴을 따랐고,
 * P3-1이 그 사본들을 `test/helpers.ts`의 `withRealApi`·`resetRealData` 한 벌로 합쳤다.
 * **`withApi`는 그대로 두었다** — 이것을 쓰는 파일이 저장소에 널려 있어 가는 것은 실제로
 * 필요한 것보다 훨씬 큰 변경이고, 필요한 성질은 하네스를 하나 더 세워 전부 얻었다.
 *
 * **이 문단을 근거로 하네스를 갈아엎지 마라.**
 *
 * **이후 태스크를 위한 표준 규칙.** 제약 위반(유니크·FK 등)으로 실패할 수 있는
 * 라우트 경로는 전부 이 함수를 거쳐야 한다 — 그래야 그 실패가 요청(또는 테스트)
 * 트랜잭션 전체를 오염시키지 않고 그 자리에서 회복된다. 지금(P1 초기)은 그런
 * 라우트가 아직 없어 강제하지 않지만, 다음 구현자가 409를 내는 라우트를 추가할
 * 때는 반드시 지켜야 한다.
 */
export async function withTransaction<T>(db: DbHandle, fn: (trx: DbHandle) => Promise<T>): Promise<T> {
  if (!db.isTransaction) {
    return db.transaction().execute(fn)
  }

  const name = nextSavepointName()
  await sql`savepoint ${sql.id(name)}`.execute(db)
  try {
    const result = await fn(db)
    await sql`release savepoint ${sql.id(name)}`.execute(db)
    return result
  } catch (error) {
    await sql`rollback to savepoint ${sql.id(name)}`.execute(db)
    throw error
  }
}
