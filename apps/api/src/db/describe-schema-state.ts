/**
 * **빈 DB 로 뜬 것이 조용하면 안 된다**.
 *
 * 워크트리마다 컨테이너를 띄우므로(`docker/dev/compose.yaml` 이 `container_name` 을 고정하지
 * 않는다) **빈 DB 는 정상이다** — 다만 사람이 그것을 *"설계서가 사라졌다"* 로 읽는 길이
 * 열린다. 데이터는 사라진 것이 아니라 **다른 이름의 볼륨**에 있다(`docs/guides/development.md` 「컨테이너를
 * 못 찾는다 / 포트가 이미 잡혀 있다 / 빈 DB 가 떴다」 절).
 *
 * 그래서 서버가 **자기가 보는 스키마가 비었는지**를 말한다. 재는 값은 *적용된 마이그레이션
 * 수*다 — 스키마가 비었다는 것을 한 수로 말하는 것이 그것뿐이다.
 *
 * **말하는 자리가 둘이다.** *"서버가 뜰 때 마이그레이션이 0 건인지 말한다"* 하나로는
 * 모자라다 — **빈 DB 에서는 서버가 뜨기 전에 멈춘다**: `main.ts` 가 `listen` 앞에서
 * `assertSchemaVersion`(`schema-version.ts`)으로 견주고 빈 DB 면 거기서 멈춘다(`buildApp` 자체는 부팅 중에
 * DB 를 쓰지 않아 빈 DB 에서도 조립된다). 즉 **뜬 뒤에 찍는 줄은 0 건을 영영 못 본다.** 그래서:
 *
 * 1. **뜬 뒤** — `describeSchemaState` 가 `이 서버가 보는 DB:` 줄에 수를 붙인다. 워크트리
 *    둘을 나란히 놓은 사람이 *"내 쪽이 몇 건인가"* 를 가른다.
 * 2. **못 떴을 때** — `emptySchemaHint` 가 그 원문 대신 **빈 DB 라고 말한다.** 조치가
 *    갈리는 자리라 문장도 갈린다: *새 볼륨이면 migrate 를 올려라 · 데이터가 있어야 하는데
 *    비었다면 지우지 말고 다른 볼륨을 찾아라.* 뜨기 전의 견주기(`schema-version.ts`)가 빈 DB 를
 *    먼저 보면 같은 문장으로 멈춘다 — 이 자리는 그때 마이그레이션 표를 못 읽은 판이다.
 *
 * **이 자가 못 잡는 것을 적어 둔다:** *마이그레이션은 올렸는데 데이터만 없는* 볼륨은
 * 여기서 안 걸린다(수가 0 이 아니다). 그쪽은 `docs/guides/development.md` 「에디터가 뜨는데 로그인이 안 된다 /
 * 목록이 비어 있다」 절이 든다.
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
 * **자격 문자열은 안 싣는다** — `describeDatabaseTarget` 을 지난 값만 든다.
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
