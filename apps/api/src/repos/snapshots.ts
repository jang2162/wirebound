/**
 * 스냅샷 저장소. SQL만 안다 — HTTP도 zod도 payload를 **만드는** 일도 이 파일 밖이다
 * (`repos/themes.ts`·`repos/comments.ts`와 같은 관례). API가 주고받는 키는 camelCase,
 * DB 컬럼은 snake_case이고 그 변환은 이 파일이 전담한다.
 *
 * ---
 *
 * # `payloadBytes`를 세는 단위는 **`payload::text`의 옥텟 수** 하나다 (계획서 D9)
 *
 * §16의 열린 항목(*"스냅샷 보관 정책 — 개수 제한 또는 보관 기간. 실사용 데이터가 쌓인 뒤
 * 결정한다"*)은 **관측 없이는 영원히 못 정한다.** 그래서 생성·목록·상세 셋 다 이 값을 낸다.
 *
 * **세 응답이 같은 SQL 식(`octet_length(payload::text)`)을 쓴다** — 아래 `PAYLOAD_BYTES`
 * 하나를 셋이 공유한다. 애플리케이션에서 `JSON.stringify(payload).length`로 세면 두 가지가
 * 갈린다: (ㄱ) `length`는 UTF-16 코드 유닛 수라 한글 한 글자가 1인데 옥텟으로는 3이고,
 * (ㄴ) `jsonb`는 저장 시 키를 정규화(중복 제거·순서 변경·공백 제거)하므로 **우리가 보낸
 * 문자열과 DB가 들고 있는 문서가 다르다.** 재는 대상은 **DB가 들고 있는 것**이어야 한다.
 *
 * **`pg_column_size`가 아닌 이유:** 그쪽은 TOAST 압축 뒤의 물리 크기라 같은 문서도 압축률에
 * 따라 값이 달라진다. 보관 정책이 알고 싶은 것은 *"이 스냅샷이 담은 내용의 크기"*다.
 *
 * **상한을 두지 않는다.** 두려면 값이 있어야 하고, 그 값이 지금 없다.
 *
 * ---
 *
 * # 목록은 payload 본문을 싣지 않는다 (D9)
 *
 * 목록이 payload 전부를 나르면 프로젝트가 커질수록 목록만으로 무거워진다. `listSnapshots`가
 * `payload` 컬럼을 **애초에 select하지 않고** 크기만 계산해 낸다 — 본문은 상세만 준다.
 *
 * ---
 *
 * # NUL(U+0000)을 여기서 막는다 (계획서 D7)
 *
 * **`payload`(jsonb)와 `tag`·`description`(text)의 실패 방식이 다르다.** 둘 다 저장에
 * 실패하지만 SQLSTATE가 갈리고(`22P05` vs `22021`), 어느 쪽이든 `pg`가 던지는 raw 예외라
 * `http/error-handler.ts`가 **500**으로 낸다. 사용자가 보내온 글자 때문에 나는 실패는
 * 500(서버가 잘못했다)이 아니라 400이어야 하므로 그 예외가 나기 전에 여기서 끊는다 —
 * `repos/comments.ts`와 같은 판단이다.
 *
 * **재라 #3을 재서 알게 된 것:** 페이지 제목·페이지 설명·메뉴 제목·프로젝트 이름·프로젝트
 * 설명·사용자 이름은 **아무도 막지 않는다.** NUL을 넣으면 전부 **500**이다(일곱 경로를
 * 실제로 쳐서 쟀다). 그 결과 **NUL이 든 값은 애초에 DB에 들어가지 못하고**, 그러므로
 * payload가 DB에서 읽어 조립되는 한 그 안에 NUL이 있을 수 없다. 즉 이 파일의 payload
 * NUL 검사는 **오늘 도달 경로가 0이다.** 그래도 남기는 이유는 `PUT .../schema`가
 * 파이프라인과 중복해서 같은 검사를 남긴 것과 같다: 여기서 걸러야 그 요청이 큰 jsonb를
 * 만들기 전에 끝나고, 위 여섯 경로 중 하나라도 400으로 고쳐지는 날(=NUL이 저장 가능해지는
 * 날이 아니라, 저장 경로가 바뀌는 날) 이 방벽이 이미 서 있다.
 *
 * **반대로 `tag`·`description`은 도달 경로가 열려 있다** — 요청 본문에서 곧장 온다. 그
 * 둘에 대해서는 이 검사가 500을 400으로 바꾸는 구분력을 실제로 갖는다.
 */
import { sql } from 'kysely'
import { containsNulByte } from '../db/nul-guard'
import { withTransaction, type DbHandle } from '../db/tx'
import type { SnapshotPayload } from '../services/snapshot-payload'

/** 스냅샷 어딘가에 NUL(U+0000)이 있을 때 던진다. 호출자가 400으로 매핑한다. */
export class SnapshotNulByteError extends Error {
  constructor() {
    super('스냅샷에 NUL 문자(U+0000)를 포함할 수 없습니다')
    this.name = 'SnapshotNulByteError'
  }
}

/** 목록이 내는 한 줄. **`payload`가 없다** — 본문은 상세만 준다(위 머리말). */
export interface SnapshotSummary {
  id: string
  projectId: string
  tag: string
  description: string | null
  createdBy: string
  /** 조인해서 낸다 — `repos/comments.ts`의 `authorName`과 같은 자리다. */
  createdByName: string
  createdAt: Date
  /** `octet_length(payload::text)`. 세는 단위는 위 머리말에 있다. */
  payloadBytes: number
}

/** 상세가 내는 것. 요약에 payload 본문이 더 붙는다. */
export interface SnapshotDetail extends SnapshotSummary {
  payload: SnapshotPayload
}

/**
 * payload의 크기를 세는 **유일한 식**. 생성·목록·상세 셋이 이것을 공유한다 — 흩어지면
 * 세 응답이 서로 다른 수를 낼 수 있고, 그러면 §16을 닫을 근거가 셋으로 갈린다.
 */
const PAYLOAD_BYTES = sql<number>`octet_length(snapshots.payload::text)`

/** 요약이 뽑는 컬럼. `payload` 본문은 여기 없다(위 머리말). */
const SUMMARY_COLUMNS = [
  'snapshots.id',
  'snapshots.project_id',
  'snapshots.tag',
  'snapshots.description',
  'snapshots.created_by',
  'snapshots.created_at',
] as const

interface SummaryRow {
  id: string
  project_id: string
  tag: string
  description: string | null
  created_by: string
  created_by_name: string
  created_at: Date
  payload_bytes: number | string
}

function toSummary(row: SummaryRow): SnapshotSummary {
  return {
    id: row.id,
    projectId: row.project_id,
    tag: row.tag,
    description: row.description,
    createdBy: row.created_by,
    createdByName: row.created_by_name,
    createdAt: row.created_at,
    // `octet_length`는 int4라 `pg`가 숫자로 주지만, 식이 int8로 바뀌어도(문자열이 와도)
    // 응답이 숫자이도록 경계에서 변환한다 — `head_seq`와 같은 자리다.
    payloadBytes: Number(row.payload_bytes),
  }
}

/**
 * 만든 사람을 조인한 기본 질의. **정렬이 계약이다** — `created_at` 내림차순(최근 것이
 * 먼저)이고, 같은 시각이면 `tag`로 가른다.
 *
 * **2차 키가 `id`가 아니라 `tag`인 것이 요점이다.** `created_at`의 기본값이 `now()`
 * (=트랜잭션 시작 시각)라 한 트랜잭션 안에서 만든 행이 같은 값을 갖는데, `id`는 랜덤
 * uuid라 그때 순서가 매번 달라진다. `tag`는 `(project_id, tag)`가 유일하므로 **동률을
 * 완전히 가른다** — `repos/comments.ts`가 `id`로 가르는 것과 갈리는 이유는 그쪽 표에는
 * 유일한 2차 키가 없기 때문이다.
 */
function selectSnapshots(db: DbHandle) {
  return db
    .selectFrom('snapshots')
    .innerJoin('users', 'users.id', 'snapshots.created_by')
    .select([...SUMMARY_COLUMNS, 'users.name as created_by_name', PAYLOAD_BYTES.as('payload_bytes')])
    .orderBy('snapshots.created_at', 'desc')
    .orderBy('snapshots.tag', 'asc')
}

/**
 * 스냅샷을 만든다. **`(project_id, tag)` 유니크 위반이 날 수 있으므로 `withTransaction`으로
 * 감싼다** — 그 실패가 세이브포인트 없이 나면 호출자의 트랜잭션이 `25P02`로 오염된다
 * (`repos/themes.ts`의 `insertTheme`와 같은 이유).
 *
 * **삽입과 조회가 두 문장인 것은 조인 때문이다** — `RETURNING`은 삽입한 테이블의 컬럼만
 * 낼 수 있어 `users.name`을 함께 받을 수 없다(`repos/comments.ts`의 `insertComment`와 같다).
 */
export async function insertSnapshot(
  db: DbHandle,
  input: {
    projectId: string
    tag: string
    description: string | null
    payload: SnapshotPayload
    createdBy: string
  },
): Promise<SnapshotDetail> {
  assertNoNulByte(input)

  return withTransaction(db, async (trx) => {
    const inserted = await trx
      .insertInto('snapshots')
      .values({
        project_id: input.projectId,
        tag: input.tag,
        description: input.description,
        payload: JSON.stringify(input.payload),
        created_by: input.createdBy,
      })
      .returning('id')
      .executeTakeFirstOrThrow()

    const record = await findSnapshotById(trx, input.projectId, inserted.id)
    if (record === null) {
      // 방금 같은 트랜잭션에서 넣은 행이 안 보인다면 그것 자체가 버그다. 조용히 `null`을
      // 흘리면 라우트가 그것을 404로 옮겨 "만들었는데 없다"가 된다(`insertComment`와 같은 자리).
      throw new Error('방금 만든 스냅샷을 다시 읽지 못했습니다')
    }
    return record
  })
}

/** 그 프로젝트의 스냅샷 전부(최근 것이 먼저). **payload 본문은 싣지 않는다.** */
export async function listSnapshots(db: DbHandle, projectId: string): Promise<SnapshotSummary[]> {
  const rows = await selectSnapshots(db).where('snapshots.project_id', '=', projectId).execute()
  return rows.map((row) => toSummary(row as SummaryRow))
}

/**
 * 스냅샷 하나. **payload 본문을 함께 낸다.**
 *
 * **`projectId`를 함께 받는다** — 경로가 `.../projects/:projectId/snapshots/:snapshotId`라
 * 남의 프로젝트의 스냅샷 id를 실은 요청이 통하면 안 된다. id만으로 찾고 나서 비교하는 대신
 * 질의 조건에 두는 것은, 비교를 빠뜨린 판이 조용히 통과하기 때문이다(`findCommentById`와 같다).
 */
export async function findSnapshotById(
  db: DbHandle,
  projectId: string,
  snapshotId: string,
): Promise<SnapshotDetail | null> {
  const row = await selectSnapshots(db)
    .select('snapshots.payload')
    .where('snapshots.project_id', '=', projectId)
    .where('snapshots.id', '=', snapshotId)
    .executeTakeFirst()

  if (!row) return null
  return { ...toSummary(row as SummaryRow), payload: (row as { payload: SnapshotPayload }).payload }
}

function assertNoNulByte(input: { tag: string; description: string | null; payload: SnapshotPayload }): void {
  if (containsNulByte(input.tag) || containsNulByte(input.description) || containsNulByte(input.payload)) {
    throw new SnapshotNulByteError()
  }
}

/**
 * # 캡처가 자기가 본 것이 한 시점인지 확인하는 지문 (계획서 D6)
 *
 * `withTransaction`은 격리 수준을 올리지 **못할 수 있다.** 재라 #1을 재서 갈랐다:
 *
 * | 경로 | `SET TRANSACTION ISOLATION LEVEL REPEATABLE READ` |
 * |---|---|
 * | 트랜잭션 **밖**에서 시작(`db.transaction().execute`) | **성공한다** — 첫 문장이므로 |
 * | 이미 트랜잭션 안(SAVEPOINT 경로) | **`25001 SET TRANSACTION ISOLATION LEVEL must be called before any query`** |
 *
 * 즉 계획서의 *"`withTransaction`이 격리 수준을 못 올린다"*는 **한쪽만 참이다.** 그런데
 * 라우트는 자기가 어느 쪽인지 **모른다** — 운영에서는 `app.db`가 풀 핸들이라 앞쪽이지만,
 * api 테스트 하네스(`withApi`)는 테스트 하나를 통째로 트랜잭션에 감싸므로 뒤쪽이다. 격리
 * 수준에 기대면 **테스트가 재는 것과 운영에서 도는 것이 갈린다.**
 *
 * 그래서 격리 수준을 올리는 대신 **지문을 수집 전후로 읽어 같은지 본다.** READ COMMITTED에서는
 * SELECT마다 스냅샷이 새로 잡히므로 **한 번도 함께 존재한 적 없는 조합**이 payload에 담길 수
 * 있다: 페이지 A는 seq 5, 페이지 B는 seq 3인데 그 둘이 동시에 그랬던 적은 없는 상태.
 *
 * **지문에 들어가는 것(세는 단위: 테이블 하나당 한 줄):**
 *
 * | # | 테이블 | 담는 것 |
 * |---|---|---|
 * | 1 | `pages` | `(id, head_seq)` 전체 목록 |
 * | 2 | `menu_nodes` | `count` + `max(created_at)` |
 * | 3 | `pages` | `count` + `max(updated_at)` |
 * | 4 | `layouts` | 레이아웃별 `(id, theme_id)` 목록 |
 * | 5 | `themes` | **담기는 테마들**의 `(id, updated_at)` 목록 |
 * | 6 | `comments` | `count` + `max(updated_at)` |
 *
 * **5가 "프로젝트의 테마 전부"가 아니라 "담기는 테마"인 것이 요점이다.** payload에 얼리는
 * 것은 레이아웃이 가리키는 테마뿐이므로(D5), 그 조인을 지문이 그대로 쓴다. 프로젝트의 다른
 * 테마를 함께 넣으면 캡처와 무관한 편집이 409를 만든다. 반대로 **파생 테마의 base는 넣지
 * 않는다** — base는 DB 행이 아니라 **코드의 시스템 테마**이고(`systemTheme()`), 코드는 한
 * 요청 동안 바뀌지 않는다.
 *
 * **전후가 다르면 409로 끝낸다. 재시도 루프를 넣지 않는다** — `PUT .../schema`가 같은
 * 자리에서 같은 판단을 했다(*"`stale`을 조용히 삼켜 덮어쓰면 무엇을 덮어썼는지 모르는
 * 상황이 된다"*).
 *
 * **문자열 하나로 낸다.** 구조체로 내면 비교가 호출자마다 갈릴 수 있고(깊은 비교를 손으로
 * 짜야 한다), 여기서 필요한 것은 *"같은가"* 하나뿐이다. `json_agg` + `ORDER BY`로 SQL이
 * 결정적인 텍스트를 만들므로 행 순서가 비교에 새어 들지 않는다.
 */
export async function readCaptureFingerprint(db: DbHandle, projectId: string): Promise<string> {
  const row = await sql<{ fingerprint: string }>`
    select json_build_object(
      'pages_head', (
        select coalesce(json_agg(json_build_array(p.id, p.head_seq) order by p.id), '[]'::json)
        from pages p where p.project_id = ${projectId}
      ),
      'menu', (
        select json_build_array(count(*), max(m.created_at))
        from menu_nodes m where m.project_id = ${projectId}
      ),
      'pages', (
        select json_build_array(count(*), max(p.updated_at))
        from pages p where p.project_id = ${projectId}
      ),
      'layouts', (
        select coalesce(json_agg(json_build_array(l.id, l.theme_id) order by l.id), '[]'::json)
        from layouts l where l.project_id = ${projectId}
      ),
      'themes', (
        select coalesce(json_agg(json_build_array(t.id, t.updated_at) order by t.id), '[]'::json)
        from themes t
        join layouts l on l.theme_id = t.id
        where l.project_id = ${projectId}
      ),
      'comments', (
        select json_build_array(count(*), max(c.updated_at))
        from comments c
        join pages p on p.id = c.page_id
        where p.project_id = ${projectId}
      )
    )::text as fingerprint
  `.execute(db)

  // 서브쿼리 하나짜리 SELECT라 행이 반드시 하나다.
  return row.rows[0]!.fingerprint
}
