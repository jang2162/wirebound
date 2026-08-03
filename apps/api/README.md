# @wirebound/api

Fastify 5 기반 REST + WebSocket 서버. 설계서 편집을 지원하는 백엔드다.

## 기동 절차

1. `docker compose up -d` — 저장소 루트에서. Postgres(호스트 포트 `5433`)를 띄운다.
   `docker compose ps`로 `healthy`가 될 때까지 기다린다. 컨테이너가 healthy가
   아니면 이후 마이그레이션·테스트가 전부 접속 실패로 죽는다.
   - `docker/postgres-init/01-test-db.sql`(`wirebound_test` 생성)은 Postgres 볼륨을
     **처음 만들 때만** 실행된다. `wirebound-pgdata` 볼륨이 이미 있는 상태로(예: 예전
     버전의 이미지를 쓰다가) 새로 받았다면 `wirebound_test`가 없을 수 있다 — 이 경우
     `docker compose down -v`로 볼륨까지 지우고 다시 `up -d`하거나, 컨테이너 안에서
     `CREATE DATABASE wirebound_test;`를 직접 실행한다. 그렇지 않으면 테스트
     `globalSetup`이 이유를 알기 어려운 접속 에러로 죽는다.
2. `.env.example`을 `.env`로 복사하고 필요하면 값을 조정한다.
3. `pnpm build` — `packages/schema`를 먼저 빌드한다. `tsx`는 워크스페이스 패키지를
   `package.json`의 `exports`를 통해 해석하는데, 그 `exports`가 가리키는 대상이
   `dist`이기 때문이다(소스 `.ts`가 아니다). 빌드하지 않으면 `@wirebound/schema`
   import가 깨진다.
   - 스키마를 함께 고치며 개발할 때는 `pnpm --filter @wirebound/schema build:watch`를
     별도 터미널에서 같이 돌린다.
4. `pnpm --filter @wirebound/api migrate` — 마이그레이션을 최신까지 올린다.
5. `pnpm --filter @wirebound/api dev` — `tsx watch`로 서버를 띄운다.

## 테스트

api 프로젝트의 vitest 테스트는 실제 Postgres에 붙는다. 컨테이너가 healthy인
상태에서 돌려야 한다 — `docker compose up -d` 이후 `pnpm vitest run --project api`
(또는 루트의 `pnpm test`)를 실행한다.

테스트 DB(`wirebound_test`)의 마이그레이션은 vitest의 `globalSetup`
(`test/global-setup.ts`)이 전체 실행 전 한 번 자동으로 올려준다 — 따로
`migrate`를 실행할 필요는 없다.

각 테스트는 `test/helpers.ts`의 `withApi()`로 감싼다. `withApi`는 테스트 하나를
트랜잭션으로 감싸고 끝나면 롤백하므로, 테스트가 커밋하는 데이터는 없다 — 다음
테스트는 항상 깨끗한 스키마에서 시작한다.

## DB 계층

- `src/db/types.ts` — Kysely `Database` 스키마 인터페이스. 새 테이블은 여기에 추가한다.
- `src/db/client.ts` — `createPool`·`createDb`. 풀의 생명주기는 호출자가 소유한다
  (`main.ts`가 운영에서, 테스트 하네스가 테스트에서 각각 정확히 한 번 닫는다).
- `src/db/tx.ts` — `withTransaction`. 중첩 트랜잭션 처리와 그 한계(JSDoc 참고).
- `src/db/migrations/` — 정적 마이그레이션 레지스트리. `index.ts`가 각 마이그레이션
  파일을 static import로 모은다(동적 `import()` 기반 `FileMigrationProvider`를
  쓰지 않는 이유는 `index.ts`의 주석 참고).
- `src/db/migrate.ts` — `migrate`/`migrate:down` CLI이자 `migrateToLatest` export.
