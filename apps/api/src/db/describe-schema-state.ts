/**
 * **빈 DB 로 뜬 것이 조용하면 안 된다**(2026-08-19 D3).
 *
 * 오늘까지 *"빈 볼륨이 마운트되는 것"*을 막고 있던 것은 `docker-compose.yml` 의
 * `container_name` 이 고정이라는 사실 하나였다 — 둘째 컨테이너가 이름 충돌로 안 떠서
 * 거기까지 못 갔다(README 6.3). **이 슬라이스가 그 방어를 걷어냈다.** 워크트리마다
 * 컨테이너를 띄우기로 한 이상 **빈 DB 는 정상이다** — 다만 사람이 그것을 *"설계서가
 * 사라졌다"* 로 읽는 길이 열린다. 데이터는 사라진 것이 아니라 **다른 이름의 볼륨**에 있다.
 *
 * 그래서 서버가 **자기가 보는 스키마가 비었는지**를 말한다. 재는 값은 *적용된 마이그레이션
 * 수*다 — 스키마가 비었다는 것을 한 수로 말하는 것이 그것뿐이다.
 *
 * **말하는 자리가 둘이다. 계획서는 하나만 봤고 그것은 틀렸다.**
 * 계획서 D3 은 *"서버가 뜰 때 마이그레이션이 0 건인지 말하게 하라"* 였는데, 이 판이 재 보니
 * **빈 DB 에서는 서버가 뜨지 못한다** — `buildApp` 이 부팅 중에 `themes` 에 쓰고 그 표가
 * 없어 `relation "themes" does not exist`(SQLSTATE `42P01`)로 죽는다(이 기계에서 쟀다,
 * 종료 코드 1). 즉 **뜬 뒤에 찍는 줄은 0 건을 영영 못 본다.** 그래서:
 *
 * 1. **뜬 뒤** — `describeSchemaState` 가 `이 서버가 보는 DB:` 줄에 수를 붙인다. 워크트리
 *    둘을 나란히 놓은 사람이 *"내 쪽이 몇 건인가"* 를 가른다.
 * 2. **못 떴을 때** — `emptySchemaHint` 가 그 원문 대신 **빈 DB 라고 말한다.** 조치가
 *    갈리는 자리라 문장도 갈린다: *새 볼륨이면 migrate 를 올려라 · 데이터가 있어야 하는데
 *    비었다면 지우지 말고 다른 볼륨을 찾아라.*
 *
 * **이 자가 못 잡는 것을 적어 둔다:** *마이그레이션은 올렸는데 데이터만 없는* 볼륨은
 * 여기서 안 걸린다(수가 0 이 아니다). 그쪽은 README 6.6 이 *"목록이 비어 있다"* 로 든다.
 */
import { describeDatabaseTarget } from './describe-target'

/** 아직 아무 마이그레이션도 안 올라간 DB. **이 수가 나오면 새 볼륨이다.** */
const EMPTY_SCHEMA = 0

/**
 * 마이그레이션 수를 사람이 읽는 한 조각으로 만든다. `main.ts` 가 이것을
 * `이 서버가 보는 DB: …` 줄에 이어 붙인다.
 *
 * `undefined` 는 **못 읽었다는 뜻이다**(DB 가 없거나 안 떠 있다). 그때 0 이라고 말하면
 * 안 된다 — *"빈 볼륨"* 과 *"접속 실패"* 는 조치가 다르다.
 */
export function describeSchemaState(executedMigrations: number | undefined): string {
  if (executedMigrations === undefined) {
    return '마이그레이션 상태를 읽지 못했습니다 (DB 가 없거나 아직 안 떠 있습니다)'
  }
  if (executedMigrations === EMPTY_SCHEMA) {
    return [
      '마이그레이션 0건 — **빈 DB 입니다.**',
      '새 볼륨이면 정상입니다(migrate 를 아직 안 돌렸습니다).',
      '데이터가 있어야 하는데 비었다면 지우지 말고 다른 이름의 볼륨을 찾으십시오: docker volume ls',
    ].join(' ')
  }
  return `마이그레이션 ${executedMigrations}건`
}

/**
 * 서버가 뜨다 죽었을 때, **그 원인이 빈 스키마이면** 사람이 읽을 문장을 낸다.
 * 0 건이 아니면 `undefined` — 다른 실패에까지 이 말을 붙이면 엉뚱한 곳을 보게 된다
 * (`missing-database-hint.ts` 가 `3D000` 에만 붙이는 것과 같은 규칙이다).
 *
 * **자격 문자열은 안 싣는다** — `describeDatabaseTarget` 을 지난 값만 든다(D4).
 */
export function emptySchemaHint(executedMigrations: number | undefined, databaseUrl: string): string | undefined {
  if (executedMigrations !== EMPTY_SCHEMA) {
    return undefined
  }
  return [
    `이 DB 는 비어 있습니다(마이그레이션 0건): ${describeDatabaseTarget(databaseUrl)}`,
    '새 볼륨이면 정상입니다 — 마이그레이션을 올리십시오:',
    '  pnpm --filter @wirebound/api migrate',
    '데이터가 있어야 하는데 비었다면 지우지 말고 다른 이름의 볼륨을 찾으십시오: docker volume ls',
  ].join('\n')
}
