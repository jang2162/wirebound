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
 * ## payload 검사는 **죽은 코드가 아니다** — 도달 경로가 실재한다 (G-2)
 *
 * **앞 판은 여기에 *"DB가 삽입 시점에 막으니 payload의 도달 경로는 0"*이라고 적어 두었고,
 * 그것은 거짓 근거였다.** 그 문장대로면 이 검사는 지워도 되는 줄이 되고, 다음 사람이
 * 지운다. **리뷰어가 도달 경로를 지목했고 내가 재현했다.**
 *
 * 구멍은 `themes`다. 그 표의 절 다섯은 `jsonb`가 아니라 **`json`** 컬럼이고(0006 — 키 순서
 * 계약 때문에 그렇게 골랐다), **`json`은 NUL을 받는다.** 같은 값으로 두 캐스팅을 나란히 쳐
 * 갈랐다:
 *
 * | 대상 | 결과 |
 * |---|---|
 * | `'{"semantic":{"primary":"#fff\u0000"}}'::json` | **들어간다** |
 * | 같은 값 `::jsonb` | **`22P05 unsupported Unicode escape sequence`** |
 *
 * **왜 들어가는가:** 저장되는 것은 `JSON.stringify`가 만든 텍스트이고 거기서 NUL은 여섯
 * 글자 이스케이프(`\u0000`)다 — **날 NUL 바이트가 아니다.** `json`은 원문을 그대로 두므로
 * 통과하고, `jsonb`는 파싱하면서 그 이스케이프를 실제 문자로 풀기 때문에 죽는다.
 *
 * **그래서 그 절을 막는 것은 DB가 아니라 `repos/themes.ts`의 `assertNoNulByte` 한 줄뿐이다.**
 * 그 줄을 꺼서 전체 사슬을 재현했다(변이로 심고 복구했다):
 *
 * ```
 * POST /themes            → 201            (가드가 켜져 있으면 400)
 * findThemeById 되읽기    → NUL 있음 = true
 * captureSnapshot         → 'captured', payload에 NUL 있음 = true
 * POST /snapshots         → 400 "스냅샷에 NUL 문자(U+0000)를 포함할 수 없습니다"
 * 남은 snapshots 행       → 0
 * ```
 *
 * **마지막 400을 내는 것이 이 검사다.** 없으면 그 요청은 `payload::jsonb` 캐스팅에서
 * `22P05`로 죽어 **500**이 된다 — 사용자가 보낸 글자 때문에 서버가 잘못했다고 말하는 그
 * 형태다. `test/snapshots.test.ts`의 `payload에 NUL이 실리면 400이다`가 **프로덕션을 고치지
 * 않고** 같은 상태를 만든다(raw SQL로 `json` 컬럼에 넣는다 — DB가 실제로 허용하는 일이다).
 *
 * **`tag`·`description`은 더 짧은 경로다** — 요청 본문에서 곧장 온다. 그 둘은 `text`라
 * DB가 삽입 시점에 막지만, 그 실패도 `pg`의 raw 예외라 500이다. 여기서 끊어 400으로 만든다.
 *
 * ---
 *
 * **재라 #3에서 함께 쟀던 것(관련은 있으나 다른 이야기):** 페이지 제목·페이지 설명·메뉴
 * 제목·프로젝트 이름·프로젝트 설명·사용자 이름 여섯은 **아무도 막지 않아** NUL을 넣으면
 * **500**이다. 그쪽은 `text`·`jsonb` 컬럼이라 값이 저장되지 못하므로 payload로는 못 오지만,
 * *"사용자 입력 때문에 500"*이라는 문제는 그대로 남아 있다(P6-1 이월 문서에 적었다).
 */
import { sql } from 'kysely'
import { assertLocking } from '../db/locking'
import { containsNulByte } from '../db/nul-guard'
import { withTransaction, type DbHandle } from '../db/tx'
import { lockProjectComments } from './comments'
import { lockProjectLayouts } from './layouts'
import { lockProjectMenuNodes } from './menu'
import { lockProjectPages } from './pages'
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
 * **2차 키가 `id`가 아니라 `tag`인 것이 요점이다.** `id`는 랜덤 uuid라 동률에서 순서가
 * 매번 달라지는데, `tag`는 `(project_id, tag)`가 유일하므로 **동률을 완전히 가른다** —
 * `repos/comments.ts`가 `id`로 가르는 것과 갈리는 이유는 그쪽 표에는 유일한 2차 키가
 * 없기 때문이다.
 *
 * **동률은 오늘 자연히 생기지 않는다.** `created_at`이 `insertSnapshot`이 심는
 * `payload.capturedAt`이고 그 값은 `clock_timestamp()`라 요청마다 다르다(아래 머리말).
 * 그래도 2차 키를 두는 것은 **정렬이 결정적이어야 하기 때문**이고, 케이스가 두 행에 같은
 * `capturedAt`을 심어 그 자리를 실제로 잰다.
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
 *
 * ---
 *
 * # `created_at`을 컬럼 기본값에 맡기지 않고 **`payload.capturedAt`에서 심는다**
 *
 * **앞 판은 그 둘이 *"같은 트랜잭션의 같은 시점"*이라고 적어 두었고 거짓이었다.** 재 보니
 * `capturedAt - created_at = +103ms`였다(api 하네스. 리뷰어는 같은 어긋남을 라우트 경로에서
 * **+25ms**로 쟀다 — 부호와 크기가 경로마다 다르다는 것이 오히려 요점이다). 원인은 셋이
 * 겹친 것이다:
 *
 * 1. `capturedAt`은 **수집이 끝난 시각**이고 `created_at`은 **삽입 트랜잭션이 시작한
 *    시각**이다. 그 사이에 수집 여섯 질의와 payload 조립이 들어간다.
 * 2. 컬럼 기본값이 `now()`, 즉 **`transaction_timestamp()`**다. 한 트랜잭션 안에서는 얼어
 *    있으므로 *"삽입 시각"*조차 아니다 — api 하네스처럼 테스트 하나를 트랜잭션 하나로
 *    감싸면 **테스트가 시작한 시각**이 박힌다(위 +103ms가 그것이다).
 * 3. 앞 판의 `capturedAt`은 **Node의 시계**(`new Date()`)였고 `created_at`은 **Postgres의
 *    시계**였다. 두 시계가 같다는 보장이 없다.
 *
 * **그래서 값을 하나로 만든다.** `capturedAt`은 캡처가 `clock_timestamp()`로 읽고
 * (`services/snapshot-capture.ts`), 이 함수가 **그 값을 `created_at`에 그대로 심는다.**
 * 셋이 한꺼번에 닫힌다: 시점이 하나이고, 시계가 하나이고, 트랜잭션 시작 시각이 끼어들지
 * 않는다. **컬럼 기본값(`now()`)은 오늘 도달하지 않는다** — 이 함수가 `snapshots`에 쓰는
 * 유일한 경로이고 언제나 값을 싣는다.
 *
 * **왜 반대 방향(= `created_at`을 읽어 `capturedAt`에 넣기)이 아닌가.** payload는 삽입
 * **전에** 완성돼야 한다(그것이 `insertSnapshot`의 인자다). 삽입 뒤에 payload를 고치면
 * 저장된 jsonb와 응답이 갈릴 자리가 생긴다.
 *
 * **P6-2에게:** *"그때"*로 읽어야 하는 값은 **`payload.capturedAt`**이다. `created_at`은
 * 이제 그것의 사본이고, 둘이 갈리는 유일한 경로는 누군가 이 함수를 지나지 않고 행을
 * 넣는 것이다.
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
        // **`capturedAt`과 같은 값이다 — 사본이 아니라 같은 값이다**(위 머리말).
        // `SnapshotPayloadSchema`가 `capturedAt`을 ISO datetime으로 강제하므로 여기서
        // `Invalid Date`가 나올 수 없다.
        created_at: new Date(input.payload.capturedAt),
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
 * ## 계획서 D6의 지문(개수 + 시각)을 **내용 지문으로 바꿨다 — 재서 구멍 둘을 찾았다**
 *
 * D6은 지문을 *"`count` + `max(updated_at)`"* 꼴로 적었다. 그대로 짜서 재 보니 **변화를
 * 못 보는 자리가 둘** 나왔다.
 *
 * | 구멍 | 관찰된 값 | 원인 | 운영에서도 참인가 |
 * |---|---|---|---|
 * | 수집 도중 **테마를 고쳐도** 지문이 같다 | `captureSnapshot` → `'captured'`(기대: `'fingerprint-mismatch'`) | `updateTheme`이 `updated_at`을 **`now()`**(=트랜잭션 시작 시각)로 쓴다. api 테스트 하네스는 테스트 하나를 트랜잭션 하나로 감싸므로 그 값이 **얼어 있다** | **아니다** — 요청마다 트랜잭션이 갈리는 운영에서는 값이 움직인다. 이것은 **측정 장치(하네스)의 성질**이다 |
 * | 수집 도중 **메뉴 제목을 고쳐도** 지문이 같다 | 〃 | `menu_nodes`에 **`updated_at` 컬럼이 아예 없다**(`0003-menu-nodes.ts`). `count`도 `max(created_at)`도 제목 변경에 반응하지 않는다 | **그렇다** — 하네스와 무관한 D6의 실제 구멍이다 |
 *
 * 앞쪽은 하네스의 성질이지만 **그 성질 때문에 케이스로 고정할 수 없다**는 점이 그대로
 * 대가다(잴 수 없는 방어는 다음 사람이 지우기 쉽다). 뒤쪽은 운영에서도 참인 구멍이다.
 * 그래서 시각에 기대는 것을 그만두고 **payload에 실릴 내용 자체를 지문으로 삼는다.**
 *
 * 그러면 지문의 뜻이 한 문장이 된다: **"payload에 들어갈 값 중 무엇도 바뀌지 않았다."**
 * `count`+시각은 그 명제의 **근사**였고, 근사이므로 구멍이 있었다.
 *
 * **지문에 들어가는 것(세는 단위: 테이블 하나당 한 줄):**
 *
 * | # | 테이블 | 담는 것 | payload의 어느 필드를 덮는가 |
 * |---|---|---|---|
 * | 1 | `menu_nodes` | `(id, parent_id, title, sort_order)` 목록 | `menu[]` 전부 |
 * | 2 | `pages` | `(id, menu_node_id, title, description, sort_order, schema_version, head_seq, md5(schema))` 목록 | `pages[]` 전부 |
 * | 3 | `layouts` | `(id, name, theme_id, md5(schema))` 목록 | `layouts[]` 전부 |
 * | 4 | `themes` | **담기는 테마들**의 `(id, md5(행 전체))` 목록 | `themes[].theme` |
 * | 5 | `comments` | `(id, md5(행 전체), 작성자 이름)` 목록 | `comments[]` 전부 |
 *
 * **4가 "프로젝트의 테마 전부"가 아니라 "담기는 테마"인 것이 요점이다.** payload에 얼리는
 * 것은 레이아웃이 가리키는 테마뿐이므로(D5), 그 조인을 지문이 그대로 쓴다. 프로젝트의 다른
 * 테마를 함께 넣으면 캡처와 무관한 편집이 409를 만든다. 반대로 **파생 테마의 base는 넣지
 * 않는다** — base는 DB 행이 아니라 **코드의 시스템 테마**이고(`systemTheme()`), 코드는 한
 * 요청 동안 바뀌지 않는다.
 *
 * **5가 `users.name`을 조인해 넣는 이유:** payload의 `comments[].authorName`이 코멘트 행이
 * 아니라 **`users` 행**에서 온다(`repos/comments.ts` — *"조인해서 낸다, 스냅샷이 아니다"*).
 * 넣지 않으면 이름을 바꾸는 경로가 생기는 날 payload는 달라지는데 지문은 그대로다.
 *
 * **`md5`를 쓰는 자리와 안 쓰는 자리가 갈린다.** 값이 짧고 개수가 적은 컬럼은 그대로 담고,
 * 문서(`pages.schema`·`layouts.schema`)와 행 전체(`themes`·`comments`)는 해시로 접는다 —
 * 지문 문자열이 payload만큼 커지면 지문을 두 번 읽는 비용이 캡처 자체와 같아진다.
 * `pages.schema`를 **해시로라도 담는 것**은, 담지 않으면 *"`schema`는 `head_seq` 없이 바뀔
 * 수 없다"*는 다른 파일의 불변식(`repos/pages.ts`의 머리말)에 기대게 되기 때문이다 —
 * 그 파일이 바뀌면 여기가 조용히 헐거워진다.
 *
 * **전후가 다르면 409로 끝낸다. 재시도 루프를 넣지 않는다** — `PUT .../schema`가 같은
 * 자리에서 같은 판단을 했다(*"`stale`을 조용히 삼켜 덮어쓰면 무엇을 덮어썼는지 모르는
 * 상황이 된다"*).
 *
 * **지문 자체는 문자열 하나다.** 구조체로 내면 비교가 호출자마다 갈릴 수 있고(깊은 비교를
 * 손으로 짜야 한다), 여기서 필요한 것은 *"같은가"* 하나뿐이다. `json_agg` + `ORDER BY`로
 * SQL이 결정적인 텍스트를 만들므로 행 순서가 비교에 새어 들지 않는다.
 *
 * ---
 *
 * # `at`을 **같은 문장 안에서** 함께 낸다 — 그것이 `capturedAt`이 된다
 *
 * `clock_timestamp()`를 지문과 **한 문장**으로 읽는다. 따로 읽으면 그 값이 *"상태가
 * 그대로였음을 증명한 마지막 관찰"* 바깥으로 나간다 — 두 문장 사이에 무언가 바뀌었을 수
 * 있고, 그러면 `capturedAt`이 가리키는 순간에 payload가 참이었다고 말할 수 없다.
 *
 * **`now()`가 아니라 `clock_timestamp()`인 것이 요점이다.** `now()`는
 * `transaction_timestamp()`라 트랜잭션 안에서 얼어 있고, api 테스트 하네스는 테스트 하나를
 * 트랜잭션 하나로 감싸므로 그 값이 **테스트 시작 시각**이 된다(실측: `now()` 07:16:20.160 vs
 * `clock_timestamp()` 07:16:20.295 — 같은 트랜잭션의 같은 순간에 읽은 두 값이다).
 *
 * **그래서 `capturedAt`의 뜻이 정확히 이것이다:** *"캡처가 payload의 내용을 마지막으로
 * 확인한 순간(Postgres의 시계)."* `insertSnapshot`이 그 값을 `created_at`에 그대로 심으므로
 * 두 값이 같다.
 */
export async function readCaptureFingerprint(
  db: DbHandle,
  projectId: string,
): Promise<{ fingerprint: string; at: Date }> {
  const row = await sql<{ fingerprint: string; at: Date }>`
    select clock_timestamp() as at, json_build_object(
      'menu_nodes', (
        select coalesce(
          json_agg(json_build_array(m.id, m.parent_id, m.title, m.sort_order) order by m.id),
          '[]'::json
        )
        from menu_nodes m where m.project_id = ${projectId}
      ),
      'pages', (
        select coalesce(
          json_agg(
            json_build_array(
              p.id, p.menu_node_id, p.title, p.description, p.sort_order,
              p.schema_version, p.head_seq, md5(p.schema::text)
            ) order by p.id
          ),
          '[]'::json
        )
        from pages p where p.project_id = ${projectId}
      ),
      'layouts', (
        select coalesce(
          json_agg(json_build_array(l.id, l.name, l.theme_id, md5(l.schema::text)) order by l.id),
          '[]'::json
        )
        from layouts l where l.project_id = ${projectId}
      ),
      'themes', (
        select coalesce(json_agg(json_build_array(t.id, md5(t::text)) order by t.id), '[]'::json)
        from themes t
        join layouts l on l.theme_id = t.id
        where l.project_id = ${projectId}
      ),
      'comments', (
        select coalesce(json_agg(json_build_array(c.id, md5(c::text), u.name) order by c.id), '[]'::json)
        from comments c
        join pages p on p.id = c.page_id
        join users u on u.id = c.author_id
        where p.project_id = ${projectId}
      )
    )::text as fingerprint
  `.execute(db)

  // 서브쿼리 하나짜리 SELECT라 행이 반드시 하나다.
  return { fingerprint: row.rows[0]!.fingerprint, at: row.rows[0]!.at }
}

/**
 * # 복원이 쓰는 동안 남이 못 고치게 잠근다 (P6-2 D8)
 *
 * 캡처는 **아무것도 쓰지 않아서** 지문 확인만으로 버텼다. 복원은 쓴다 — 확인과 쓰기
 * 사이가 또 열려 있으므로 잠금이 필요하다.
 *
 * ## 실측 — 무엇이 막히고 무엇이 안 막히나
 *
 * **계획서 재라 #5는 *"막지 못할 가능성이 높다"*고 봤다. 재 보니 반대였다** — 다만
 * **`projects` 행을 함께 잠글 때만** 그렇다. 오늘의 쓰기 라우트 아홉을 각각 재고
 * (실제 커밋하는 두 커넥션, 잠금을 쥔 채 요청을 쏘고 700ms 안에 끝나는지 본다), 같은
 * 요청을 잠금 없이 한 번 더 재서 **음성 대조**로 뒀다(그것이 없으면 *"막힌다"*와
 * *"그냥 느리다"*가 구분되지 않는다).
 *
 * | 라우트 | 다섯 표만 잠갔을 때 | **+ `projects` 행** |
 * |---|---|---|
 * | `POST .../menu` (parentId 없음) | **안 막힌다** | **막힌다** |
 * | `POST .../menu` (parentId 있음) | 막힌다 | 막힌다 |
 * | `PATCH .../menu/:nodeId` | 막힌다 | 막힌다 |
 * | `DELETE .../menu/:nodeId` | 막힌다 | 막힌다 |
 * | `POST .../pages` | 막힌다 | 막힌다 |
 * | `PATCH .../pages/:pageId` | 막힌다 | 막힌다 |
 * | `POST .../comments` | 막힌다 | 막힌다 |
 * | `PATCH .../comments/:commentId` | 막힌다 | 막힌다 |
 * | `DELETE .../comments/:commentId` | 막힌다 | 막힌다 |
 *
 * (음성 대조는 아홉 전부 창 안에 끝났다 — 2xx.)
 *
 * ## 왜 그렇게 갈리나
 *
 * `FOR UPDATE`는 **이미 있는 행**에만 걸리고 Postgres에는 술어 잠금이 없다. 그래서
 * *"새 행 삽입"*은 원래 막히지 않아야 하는데, 표의 대부분이 막힌 것은 **FK 때문**이다:
 * 자식 행을 넣으면 Postgres가 **참조되는 부모 행에 `FOR KEY SHARE`를 건다.**
 * `FOR UPDATE`는 그것과 충돌한다.
 *
 * 그러므로 남는 구멍은 **잠긴 어떤 행도 참조하지 않는 삽입** 하나였고, 오늘 그 모양은
 * `parent_id`가 `NULL`인 메뉴 노드 하나뿐이다. `projects` 행을 잠그면 그것도 막힌다 —
 * `menu_nodes.project_id`가 `projects(id)`를 참조하므로 그 삽입도 `projects` 행에
 * `FOR KEY SHARE`를 걸기 때문이다. `pages`·`layouts`·`snapshots`도 같은 컬럼을 갖는다.
 *
 * **그러니 "다섯 표를 잠근다"가 아니라 "프로젝트를 잠근다"가 이 함수의 뜻이다.**
 * 다섯 표의 행 잠금은 여전히 필요하다 — `projects` 행 잠금은 **UPDATE·DELETE를 막지
 * 못한다**(그 문장들은 `project_id`를 건드리지 않으므로 부모 행에 잠금을 걸지 않는다).
 * 둘이 서로 다른 절반을 막는다.
 *
 * ## 남는 구멍 — 정직하게
 *
 * - **테마 표는 잠그지 않는다.** 복원이 테마 **행**을 쓰지 않기 때문이다(D6). 복원이
 *   도는 동안 누가 테마 문서를 고치면 그 편집이 이긴다 — 복원은 참조만 되돌리므로
 *   충돌이 아니다. 다만 응답의 *"테마가 다르다"* 판정은 그 순간의 값으로 내려진다.
 * - **다른 프로젝트는 잠그지 않는다.** 복원의 단위가 프로젝트다.
 * - **`projects` 행 자체의 UPDATE**(`PATCH /:projectId` — 이름·슬러그)는 이 잠금이
 *   막지만, 그것은 복원이 되돌리는 대상이 아니다(payload에 프로젝트 메타가 없다).
 *   막히는 것이 손해는 아니다 — 잠깐 기다렸다 통과한다.
 *
 * ## 순서
 *
 * `projects`를 **먼저** 잠근다. 다른 순서로 잠그는 경로가 오늘 없으므로 교착이 날 자리는
 * 아니지만, 순서를 한 자리에 고정해 두면 두 번째 잠금 경로가 생길 때 맞출 기준이 생긴다.
 */
export async function lockProjectForRestore(trx: DbHandle, projectId: string): Promise<void> {
  assertLocking(trx, 'lockProjectForRestore')
  await trx.selectFrom('projects').select('id').where('id', '=', projectId).forUpdate().execute()
  await lockProjectMenuNodes(trx, projectId)
  await lockProjectPages(trx, projectId)
  await lockProjectLayouts(trx, projectId)
  await lockProjectComments(trx, projectId)
}
