import { describeDatabaseTarget } from '../src/db/describe-target'

/**
 * 없는 DB 를 가리킨 채 스위트를 돌렸을 때 **고치는 한 줄**을 만든다.
 *
 * **왜 `global-setup.ts` 밖에 있나.** 이 로직이 `global-setup`의 `catch` 안에 있으면
 * 그 길은 **마이그레이션이 실패해야만** 지나므로 정상 실행의 어떤 케이스도 거기 못 닿는다.
 * 그러면 두 변조가 조용히 산다:
 *
 * - 관문을 `'3D000'` 이 아닌 값으로 바꾸면 힌트가 **안 뜨고** `테스트 DB 준비에 실패했습니다`만 남는다.
 * - 이름 대신 `TEST_DATABASE_URL` **원문**을 쓰면 `테스트 DB "postgres://wirebound:wirebound@…" 가 없습니다`
 *   — **자격 문자열이 통째로 실린다.**
 *
 * 뒤엣것이 무거운 쪽이다. *"DB 이름을 로그에 찍을 때 자격 문자열을 통째로 찍지 마라"*를
 * 지키는 자가 `describeDatabaseTarget`에만 걸려 있으면 이 경로는 비어 있다 —
 * `missing-database-hint.test.ts`가 양쪽을 다 문다.
 */

/**
 * **컨테이너를 이름으로 부르지 않는다.** `docker-compose.yml`이 `container_name`을 고정하지
 * 않으므로 컨테이너 이름은 워크트리마다 `<프로젝트>-postgres-1` 이고 프로젝트 이름은 디렉터리
 * 이름이다 — 고정 이름(`docker exec wirebound-postgres …` 류)을 권하면 그 이름이 없어 실패한다.
 * `docker compose exec` 는 그 이름을 몰라도 되고, **자기 디렉터리의 컨테이너**를
 * 고르므로 *"옆 워크트리의 DB 를 만들어 놓고 왜 안 되지"* 가 안 생긴다.
 *
 * 그래서 이 줄은 **저장소나 워크트리 루트에서** 쳐야 한다. 컨테이너를 공유하기로 한
 * 사람은 그 컨테이너를 띄운 디렉터리에서 치거나 `docker exec <이름>` 을 쓴다(README.md
 * 「컨테이너를 못 찾는다 / 포트가 이미 잡혀 있다」 절).
 */

/** 존재하지 않는 데이터베이스. Postgres 의 SQLSTATE 다(`postinit.c`의 `InitPostgres`). */
export const MISSING_DATABASE_SQLSTATE = '3D000'

/**
 * `3D000`**일 때만** 조치를 붙인다. 다른 실패에까지 붙이면 엉뚱한 곳을 보게 된다 —
 * 비밀번호가 틀린 경우(`28P01`)에 *"DB 를 만들어라"*를 권하는 것이 그 꼴이다.
 *
 * **나가는 값에 자격 문자열이 없다.** 이름만 `describeDatabaseTarget`을 지나 뽑는다.
 */
export function missingDatabaseHint(error: unknown, databaseUrl: string): string | undefined {
  if (typeof error !== 'object' || error === null || (error as { code?: unknown }).code !== MISSING_DATABASE_SQLSTATE) {
    return undefined
  }
  return [
    `테스트 DB "${databaseName(databaseUrl)}" 가 없습니다.`,
    '컨테이너 안에서 한 줄로 만든다 — 저장소(또는 워크트리) 루트에서:',
    `  docker compose exec postgres psql -U wirebound -d postgres -c 'CREATE DATABASE ${databaseName(databaseUrl)};'`,
    'TEST_DATABASE_URL 은 셸 → apps/api/.env → 기본값 순서로 정해진다.',
  ].join('\n')
}

/**
 * 접속 문자열에서 **DB 이름만** 뽑는다.
 *
 * `describeDatabaseTarget`은 `호스트:포트/이름`을 내므로 앞 조각을 뗀다. **그 함수를
 * 거치는 이유가 둘이다:** ⓐ 사용자 이름과 비밀번호가 거기서 이미 떨어진다 ⓑ 퍼센트
 * 디코딩을 한다 — 안 거치면 한글 DB 이름이 `wb_%EC%95%84…`로 나와 **붙여넣을 수 없는
 * 명령**을 권하게 된다(`missing-database-hint.test.ts`의 *"ASCII 가 아닌 이름을 퍼센트 인코딩된
 * 채로 권하지 않는다"*가 잰다).
 */
function databaseName(databaseUrl: string): string {
  return describeDatabaseTarget(databaseUrl).split('/').slice(1).join('/')
}
