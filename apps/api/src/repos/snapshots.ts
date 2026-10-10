/**
 * 스냅샷 저장소. SQL만 안다 — HTTP도 zod도 payload를 **만드는** 일도 이 파일 밖이다
 * (`repos/comments.ts`와 같은 관례). API가 주고받는 키는 camelCase,
 * DB 컬럼은 snake_case이고 그 변환은 이 파일이 전담한다.
 *
 * ---
 *
 * # `payloadBytes`를 세는 단위는 **`payload::text`의 옥텟 수** 하나다
 *
 * 설계서 「열린 질문 (구현 중 결정)」의 항목(*"스냅샷 보관 정책 — 개수 제한 또는 보관 기간. 실사용 데이터가 쌓인 뒤
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
 * # 목록은 payload 본문을 싣지 않는다
 *
 * 목록이 payload 전부를 나르면 프로젝트가 커질수록 목록만으로 무거워진다. `listSnapshots`가
 * `payload` 컬럼을 **애초에 select하지 않고** 크기만 계산해 낸다 — 본문은 상세만 준다.
 *
 * ---
 *
 * # NUL(U+0000)을 여기서 막는다
 *
 * **`payload`(jsonb)와 `tag`·`description`(text)의 실패 방식이 다르다.** 둘 다 저장에
 * 실패하지만 SQLSTATE가 갈리고(`22P05` vs `22021`), 어느 쪽이든 `pg`가 던지는 raw 예외라
 * `http/error-handler.ts`가 **500**으로 낸다. 사용자가 보내온 글자 때문에 나는 실패는
 * 500(서버가 잘못했다)이 아니라 400이어야 하므로 그 예외가 나기 전에 여기서 끊는다 —
 * `repos/comments.ts`와 같은 판단이다.
 *
 * ## payload 검사는 지금 저장된 값으로는 도달하지 않는다 — 그래도 둔다
 *
 * payload 의 값은 전부 `text`·`jsonb` 칸에서 온다. 둘 다 NUL 을 **삽입 시점에** 막으므로(`22021` · `22P05`) 저장된 값으로는
 * payload 에 NUL 이 실릴 수 없다. 막히지 않는 것은 `json` 칸이다 — 저장되는 것은 `JSON.stringify`가 만든 텍스트이고 거기서
 * NUL 은 여섯 글자 이스케이프(`\u0000`)라 `json`은 원문 그대로 받고 `jsonb`는 파싱하며 풀다가 죽는다:
 *
 * | 대상 | 결과 |
 * |---|---|
 * | `'{"a":"#fff\u0000"}'::json` | **들어간다** |
 * | 같은 값 `::jsonb` | **`22P05 unsupported Unicode escape sequence`** |
 *
 * **이 검사는 `json` 칸이 payload 의 출처가 되는 날의 방벽이다.** 없으면 그 요청은 `payload::jsonb` 캐스팅에서 `22P05`로
 * 죽어 **500**이 된다 — 사용자가 보낸 글자 때문에 서버가 잘못했다고 말하는 그 형태다. `test/repos-snapshots.test.ts`의
 * «payload 안의 NUL도 막는다»가 `insertSnapshot`을 직접 불러 잰다(저장된 값으로 만들 길이 없어서다).
 *
 * **`tag`·`description`은 더 짧은 경로다** — 요청 본문에서 곧장 온다. 그 둘은 `text`라
 * DB가 삽입 시점에 막지만, 그 실패도 `pg`의 raw 예외라 500이다. 여기서 끊어 400으로 만든다.
 *
 * ---
 *
 * **관련은 있으나 다른 이야기:** 페이지·메뉴·프로젝트의 제목·이름·설명의 NUL 은 저장소의 쓰기
 * 함수가 막는다(`db/nul-guard.ts`의 `NulByteError` — 칸별 표가 그 머리말에 있다). 그쪽은
 * `text`·`jsonb` 컬럼이라 값이 저장되지 못하므로 payload로는 못 온다.
 */
import { sql } from 'kysely'
import { assertLocking } from '../db/locking'
import { containsNulByte } from '../db/nul-guard'
import { withTransaction, type DbHandle } from '../db/tx'
import { lockProjectComments } from './comments'
import { lockProjectLayouts } from './layouts'
import { lockProjectMenuNodes } from './menu'
import { lockProjectPages } from './pages'
import { lockProjectRow } from './projects'
import type { SnapshotKind } from '../db/types'
import type { SnapshotPayload } from '@wirebound/themes'

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
 * 세 응답이 서로 다른 수를 낼 수 있고, 그러면 보관 정책(「열린 질문」)을 닫을 근거가 셋으로 갈린다.
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
 * **동률은 자연히 생기지 않는다.** `created_at`이 `insertSnapshot`이 심는
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
 * (`db/tx.ts`의 `withTransaction` 머리말).
 *
 * **삽입과 조회가 두 문장인 것은 조인 때문이다** — `RETURNING`은 삽입한 테이블의 컬럼만
 * 낼 수 있어 `users.name`을 함께 받을 수 없다(`repos/comments.ts`의 `insertComment`와 같다).
 *
 * ---
 *
 * # `created_at`을 컬럼 기본값에 맡기지 않고 **`payload.capturedAt`에서 심는다**
 *
 * **둘을 따로 두면 *"같은 트랜잭션의 같은 시점"*이 아니다** — 어긋나고, 그 부호와 크기가
 * 경로(api 하네스 · 라우트)마다 다르다. 원인은 셋이 겹친 것이다:
 *
 * 1. `capturedAt`은 **수집이 끝난 시각**이고 기본값의 `created_at`은 **삽입 트랜잭션이 시작한
 *    시각**이다. 그 사이에 수집 여섯 질의와 payload 조립이 들어간다.
 * 2. 컬럼 기본값이 `now()`, 즉 **`transaction_timestamp()`**다. 한 트랜잭션 안에서는 얼어
 *    있으므로 *"삽입 시각"*조차 아니다 — api 하네스처럼 테스트 하나를 트랜잭션 하나로
 *    감싸면 **테스트가 시작한 시각**이 박힌다.
 * 3. `capturedAt`을 **Node의 시계**(`new Date()`)로 읽으면 `created_at`은 **Postgres의
 *    시계**다. 두 시계가 같다는 보장이 없다.
 *
 * **그래서 값을 하나로 만든다.** `capturedAt`은 캡처가 `clock_timestamp()`로 읽고
 * (`services/snapshot-capture.ts`), 이 함수가 **그 값을 `created_at`에 그대로 심는다.**
 * 셋이 한꺼번에 닫힌다: 시점이 하나이고, 시계가 하나이고, 트랜잭션 시작 시각이 끼어들지
 * 않는다. **컬럼 기본값(`now()`)은 도달하지 않는다** — 이 함수가 `snapshots`에 쓰는
 * 유일한 경로이고 언제나 값을 싣는다.
 *
 * **왜 반대 방향(= `created_at`을 읽어 `capturedAt`에 넣기)이 아닌가.** payload는 삽입
 * **전에** 완성돼야 한다(그것이 `insertSnapshot`의 인자다). 삽입 뒤에 payload를 고치면
 * 저장된 jsonb와 응답이 갈릴 자리가 생긴다.
 *
 * **복원이 *"그때"*로 읽어야 하는 값은 `payload.capturedAt`이다.** `created_at`은
 * 그것과 같은 값이고, 둘이 갈리는 유일한 경로는 누군가 이 함수를 지나지 않고 행을
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
    /** 없으면 `tag`(사람이 찍은 것). 안전망을 찍는 둘(복원 · 연쇄 삭제)이 제 값을 싣는다 — 뜻은 `0022-snapshot-kind`. */
    kind?: SnapshotKind
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
        kind: input.kind ?? 'tag',
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

/**
 * 그 프로젝트의 연쇄 삭제 안전망(`kind = 'cascade-safety'`) 가운데 최근 `keep`개만 남기고 지운다 — 지운 id 를 낸다. 차례는 목록과 같다
 * (`selectSnapshots` — `created_at` 내림차순, 같으면 `tag`).
 *
 * **프로젝트 행을 쥔 트랜잭션에서만 부른다**(`services/menu-cascade.ts` — `lockProjectForRestore` 뒤). 복원도 같은 행을 먼저 쥐므로, 복원이
 * 읽고 쓰는 동안 그 스냅샷이 지워지지 않고 지워진 뒤의 복원은 404 다(`test/menu-cascade-concurrency.test.ts` «안전망 상한»).
 */
export async function trimCascadeSafetySnapshots(trx: DbHandle, projectId: string, keep: number): Promise<string[]> {
  assertLocking(trx, 'trimCascadeSafetySnapshots')
  const rows = await trx
    .deleteFrom('snapshots')
    .where(
      'id',
      'in',
      trx
        .selectFrom('snapshots')
        .select('id')
        .where('project_id', '=', projectId)
        .where('kind', '=', 'cascade-safety')
        .orderBy('created_at', 'desc')
        .orderBy('tag', 'asc')
        .offset(keep),
    )
    .returning('id')
    .execute()
  return rows.map((row) => row.id)
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
 * # 캡처가 자기가 본 것이 한 시점인지 확인하는 지문
 *
 * `withTransaction`은 격리 수준을 올리지 **못할 수 있다.** 경로에 따라 갈린다:
 *
 * | 경로 | `SET TRANSACTION ISOLATION LEVEL REPEATABLE READ` |
 * |---|---|
 * | 트랜잭션 **밖**에서 시작(`db.transaction().execute`) | **성공한다** — 첫 문장이므로 |
 * | 이미 트랜잭션 안(SAVEPOINT 경로) | **`25001 SET TRANSACTION ISOLATION LEVEL must be called before any query`** |
 *
 * 즉 *"`withTransaction`이 격리 수준을 못 올린다"*는 **한쪽만 참이다.** 그런데
 * 라우트는 자기가 어느 쪽인지 **모른다** — 운영에서는 `app.db`가 풀 핸들이라 앞쪽이지만,
 * api 테스트 하네스(`withApi`)는 테스트 하나를 통째로 트랜잭션에 감싸므로 뒤쪽이다. 격리
 * 수준에 기대면 **테스트가 재는 것과 운영에서 도는 것이 갈린다.**
 *
 * 그래서 격리 수준을 올리는 대신 **지문을 수집 전후로 읽어 같은지 본다.** READ COMMITTED에서는
 * SELECT마다 스냅샷이 새로 잡히므로 **한 번도 함께 존재한 적 없는 조합**이 payload에 담길 수
 * 있다: 페이지 A는 seq 5, 페이지 B는 seq 3인데 그 둘이 동시에 그랬던 적은 없는 상태.
 *
 * ## 지문은 개수 + 시각이 아니라 **내용**이다
 *
 * 지문을 *"`count` + `max(updated_at)`"* 꼴로 짜면 **변화를 못 보는 자리가 있다** — 수집 도중 **메뉴 제목을 고쳐도**
 * 지문이 같다: `menu_nodes`에 **`updated_at` 컬럼이 아예 없다**(`0003-menu-nodes.ts`). `count`도 `max(created_at)`도 제목
 * 변경에 반응하지 않는다. 그리고 `updated_at`을 **`now()`**(=트랜잭션 시작 시각)로 쓰는 표는 api 테스트 하네스(테스트 하나를
 * 트랜잭션 하나로 감싼다) 안에서 그 값이 얼어 있어, 시각 지문의 구멍을 케이스로 고정할 수 없다.
 * 그래서 시각에 기대지 않고 **payload에 실릴 내용 자체를 지문으로 삼는다.**
 *
 * 그러면 지문의 뜻이 한 문장이 된다: **"payload에 들어갈 값 중 무엇도 바뀌지 않았다."**
 * `count`+시각은 그 명제의 **근사**이고, 근사이므로 구멍이 있다.
 *
 * **지문에 들어가는 것(세는 단위: 테이블 하나당 한 줄):**
 *
 * | # | 테이블 | 담는 것 | payload의 어느 필드를 덮는가 |
 * |---|---|---|---|
 * | 1 | `menu_nodes` | `(id, parent_id, title, sort_order)` 목록 | `menu[]` 전부 |
 * | 2 | `pages` | `(id, menu_node_id, title, description, sort_order, schema_version, head_seq, md5(schema))` 목록 | `pages[]` 전부 |
 * | 3 | `layouts` | `(id, name, md5(schema))` 목록 | `layouts[]` 전부 |
 * | 4 | `comments` | `(id, md5(행 전체), 작성자 이름)` 목록 | `comments[]` 전부 |
 *
 * **4가 `users.name`을 조인해 넣는 이유:** payload의 `comments[].authorName`이 코멘트 행이
 * 아니라 **`users` 행**에서 온다(`repos/comments.ts` — *"조인해서 낸다, 스냅샷이 아니다"*).
 * 넣지 않으면 이름을 바꾸는 경로가 생기는 날 payload는 달라지는데 지문은 그대로다.
 *
 * **`md5`를 쓰는 자리와 안 쓰는 자리가 갈린다.** 값이 짧고 개수가 적은 컬럼은 그대로 담고,
 * 문서(`pages.schema`·`layouts.schema`)와 행 전체(`comments`)는 해시로 접는다 —
 * 지문 문자열이 payload만큼 커지면 지문을 두 번 읽는 비용이 캡처 자체와 같아진다.
 * `pages.schema`를 **해시로라도 담는 것**은, 담지 않으면 *"`schema`는 `head_seq` 없이 바뀔
 * 수 없다"*는 다른 파일의 불변식(`repos/pages.ts`의 머리말)에 기대게 되기 때문이다 —
 * 그 파일이 바뀌면 여기가 조용히 헐거워진다.
 *
 * **전후가 다르면 409로 끝낸다. 재시도 루프를 넣지 않는다** — `PUT .../schema`가 같은
 * 자리에서 같은 판단을 한다(*"`stale`을 조용히 삼켜 덮어쓰면 무엇을 덮어썼는지 모르는
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
 * 트랜잭션 하나로 감싸므로 그 값이 **테스트 시작 시각**이 된다(같은 트랜잭션의 같은 순간에
 * 둘을 나란히 읽으면 `now()`가 더 이르다).
 *
 * **그래서 `capturedAt`의 뜻이 정확히 이것이다:** *"캡처가 payload의 내용을 마지막으로
 * 확인한 순간(Postgres의 시계)."* `insertSnapshot`이 그 값을 `created_at`에 그대로 심으므로
 * 두 값이 같다.
 *
 * ---
 *
 * # 테마 바인딩도 덮는다
 *
 * `projects` 의 바인딩 칸 넷(토큰은 해시로)이다. `theme_rev` 만 담으면 «바인딩이 바뀌면 번호가 오른다»는 다른 파일의 불변식
 * (`repos/projects.ts`의 `updateProjectTheme` · `restoreProjectTheme`)에 기대게 된다 — 페이지 문서를 해시로 담는 것과 같은 판정이다.
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
          json_agg(json_build_array(l.id, l.name, md5(l.schema::text)) order by l.id),
          '[]'::json
        )
        from layouts l where l.project_id = ${projectId}
      ),
      'comments', (
        select coalesce(json_agg(json_build_array(c.id, md5(c::text), u.name) order by c.id), '[]'::json)
        from comments c
        join pages p on p.id = c.page_id
        join users u on u.id = c.author_id
        where p.project_id = ${projectId}
      ),
      'theme', (
        select json_build_array(pr.theme_id, pr.theme_version, md5(pr.theme_tokens::text), pr.theme_rev)
        from projects pr where pr.id = ${projectId}
      )
    )::text as fingerprint
  `.execute(db)

  // 서브쿼리 하나짜리 SELECT라 행이 반드시 하나다.
  return { fingerprint: row.rows[0]!.fingerprint, at: row.rows[0]!.at }
}

/**
 * # 복원이 쓰는 동안 남이 못 고치게 잠근다
 *
 * **메뉴 연쇄 삭제도 이 잠금을 그대로 쥔다**(`services/menu-cascade.ts` 머리말 — 안전망 캡처가 프로젝트 전체를 본다). 아래의 «무엇이
 * 막히고 무엇이 안 막히나»는 그 삭제에도 같다.
 *
 * 캡처는 **아무것도 쓰지 않아서** 지문 확인만으로 버텼다. 복원은 쓴다 — 확인과 쓰기
 * 사이가 또 열려 있으므로 잠금이 필요하다.
 *
 * ## 실측 — 무엇이 막히고 무엇이 안 막히나
 *
 * **행 잠금이 새 행 삽입까지 막는다** — 다만 **`projects` 행을 함께 잠글 때만** 그렇다.
 *
 * **수를 여기 적지 않는다 — `test/restore-lock-census.test.ts`가 센다.** 손으로 고른
 * 분모를 주석에 적으면 **빠진 항목이 결과를 바꿔도 아무도 모른다.** 그 파일이
 * 분모를 등록된 라우트에서 만들고, 라우트가 하나 늘면 먼저 죽는다.
 *
 * **그 파일이 재서 고정한 것(값이 아니라 성질):**
 *
 * | 성질 | 어디서 |
 * |---|---|
 * | 복원이 되돌리는 행을 쓰는 라우트는 **하나도 빠짐없이** 막힌다 | `복원이 쓰는 행을 쓰는 라우트는 하나도 빠짐없이 막힌다` |
 * | 막히지 않는 줄의 **목록이 고정돼 있다**(새 줄이 들어오면 사람이 다시 판정한다) | `막히지 않는 줄의 목록이 고정돼 있다` |
 * | 잠금 없이는 그 요청들이 전부 창 안에 끝난다(음성 대조) | `잠금이 없으면 표의 모든 요청이 창 안에 끝난다` |
 *
 * ## 왜 그렇게 갈리나
 *
 * `FOR UPDATE`는 **이미 있는 행**에만 걸리고 Postgres에는 술어 잠금이 없다. 그래서
 * *"새 행 삽입"*은 원래 막히지 않아야 하는데, 대부분이 막히는 것은 **FK 때문**이다:
 * 자식 행을 넣으면 Postgres가 **참조되는 부모 행에 `FOR KEY SHARE`를 건다.**
 * `FOR UPDATE`는 그것과 충돌한다.
 *
 * 그러므로 남는 구멍은 **잠긴 어떤 행도 참조하지 않는 삽입**이다 — 네 표(메뉴·페이지·
 * 레이아웃·코멘트)만 잠그면 `parent_id`가 `NULL`인 메뉴 노드 삽입이 그 모양이다.
 * `projects` 행을 잠그면 그것도 막힌다 — `menu_nodes.project_id`가 `projects(id)`를
 * 참조하므로 그 삽입도 `projects` 행에 `FOR KEY SHARE`를 걸기 때문이다.
 * `pages`·`layouts`·`snapshots`도 같은 컬럼을 갖는다.
 *
 * **그러니 "네 표를 잠근다"가 아니라 "프로젝트를 잠근다"가 이 함수의 뜻이다.**
 * 네 표의 행 잠금은 여전히 필요하다 — `projects` 행 잠금은 **UPDATE·DELETE를 막지
 * 못한다**(그 문장들은 `project_id`를 건드리지 않으므로 부모 행에 잠금을 걸지 않는다).
 * 둘이 서로 다른 절반을 막는다.
 *
 * ## 남는 구멍 — 정직하게
 *
 * - **이 프로젝트의 쓰기 중 막히지 않는 것**은 `test/restore-lock-census.test.ts`의 «막히지 않는 줄의 목록이 고정돼 있다»가
 *   목록과 까닭을 갖는다 — 여기 옮겨 적지 않는다.
 * - **다른 프로젝트는 잠그지 않는다.** 복원의 단위가 프로젝트다.
 *
 * ## 순서
 *
 * `projects`를 **먼저** 잠근다(`repos/projects.ts`의 `lockProjectRow`). **프로젝트 삭제**(`routes/projects.ts`)도
 * 같은 순서(`projects` → 페이지)다 — 삭제가 페이지를 먼저 잠그면 이 순서와 엇갈려 복원과 삭제가 서로를
 * 기다리는 교착이 나고 복원이 500 으로 끝난다.
 * 그 순서를 재는 자는 `test/guard-in-lock.test.ts`의 «잠금 순서» 절이다.
 */
export async function lockProjectForRestore(trx: DbHandle, projectId: string): Promise<void> {
  assertLocking(trx, 'lockProjectForRestore')
  await lockProjectRow(trx, projectId)
  await lockProjectMenuNodes(trx, projectId)
  await lockProjectPages(trx, projectId)
  await lockProjectLayouts(trx, projectId)
  await lockProjectComments(trx, projectId)
}
