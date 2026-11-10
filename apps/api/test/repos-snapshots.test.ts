/**
 * `repos/snapshots.ts` — 스냅샷 저장소.
 *
 * **payload를 손으로 짓는다.** 캡처(`services/snapshot-capture.ts`)를 지나지 않는 것이
 * 의도다 — 이 파일이 재는 것은 *"행 하나가 어떻게 들어가고 나오는가"*이고, 캡처가 무엇을
 * 담는지는 `snapshot-capture.test.ts`가 잰다. 둘을 섞으면 저장소 케이스가 캡처의 실패로
 * 함께 죽는다.
 */
import { describe, expect, it } from 'vitest'
import { Kysely, PostgresDialect, sql } from 'kysely'
import { DatabaseError } from 'pg'
import { createPool } from '../src/db/client'
import type { DbHandle } from '../src/db/tx'
import type { Database } from '../src/db/types'
import { SnapshotNulByteError, findSnapshotById, insertSnapshot, listSnapshots, readCaptureFingerprint } from '../src/repos/snapshots'
import { SNAPSHOT_PAYLOAD_VERSION, SNAPSHOT_RESOURCES, SnapshotPayloadSchema, type SnapshotPayload } from '@wirebound/themes'
import { TEST_DATABASE_URL, createProject, signup, withApi, type TestContext } from './helpers'

const NUL = String.fromCharCode(0)

/** 규격을 만족하는 최소 payload. 자원 넷이 전부 비어 있다. */
function emptyPayload(overrides?: Partial<SnapshotPayload>): SnapshotPayload {
  return {
    payloadVersion: SNAPSHOT_PAYLOAD_VERSION,
    capturedAt: '2026-08-12T00:00:00.000Z',
    menu: [],
    pages: [],
    layouts: [],
    comments: [],
    ...overrides,
  }
}

async function fixture(ctx: TestContext) {
  const owner = await signup(ctx)
  const project = await createProject(ctx, owner.cookie)
  return { owner, project }
}

describe('payload 규격', () => {
  it('빈 payload가 규격을 통과한다', () => {
    expect(SnapshotPayloadSchema.safeParse(emptyPayload()).success).toBe(true)
  })

  /**
   * *"payload에 담기는 것은 다섯(메뉴 · 페이지 · 레이아웃 · 코멘트 · 테마 바인딩)이고 겹layer는 없다."* **분모를 손으로 적지
   * 않는다**: 규격의 shape에서 자원 이름을 뽑아 센다(`SNAPSHOT_RESOURCES`).
   */
  it('자원은 여섯이고 겹layer가 없다', () => {
    expect([...SNAPSHOT_RESOURCES].sort()).toEqual(['codes', 'comments', 'layouts', 'menu', 'pages', 'theme'])
  })

  it('선언되지 않은 절(겹layer 등)은 그 자체로 거부된다', () => {
    const withOverlay = { ...emptyPayload(), overlays: [{ nodeId: 'n_a', pressed: true }] }
    const parsed = SnapshotPayloadSchema.safeParse(withOverlay)
    expect(parsed.success).toBe(false)
  })

  /**
   * 조회는 막지 않는다. 규격이 `payloadVersion`을 리터럴로 박으면 **미래 payload를
   * 파싱조차 못 하게** 되고, 그것은 *"스냅샷은 삭제 없는 태그다"*(설계서 「스냅샷」)와 어긋난다.
   */
  it('현재 값보다 큰 payloadVersion도 파싱된다 — 게이트는 복원의 몫이다', () => {
    const future = emptyPayload({ payloadVersion: SNAPSHOT_PAYLOAD_VERSION + 1 })
    expect(SnapshotPayloadSchema.safeParse(future).success).toBe(true)
  })

  /**
   * 저장된 문서를 그대로 담는다. `CURRENT_DOCUMENT_VERSION`(1)보다 큰 버전의 문서가
   * payload에서 거부되면 그 페이지가 있는 프로젝트는 **얼릴 수단 자체를 잃는다.**
   */
  it('CURRENT_DOCUMENT_VERSION보다 큰 문서 버전도 payload에 담긴다', () => {
    const payload = emptyPayload({
      pages: [
        {
          id: '00000000-0000-4000-8000-000000000001',
          menuNodeId: '00000000-0000-4000-8000-000000000002',
          title: '옛 페이지',
          description: null,
          sortOrder: 0,
          schemaVersion: 999,
          schema: { version: 999, root: { id: 'n_root', type: 'Page', children: [] } },
          headSeq: 3,
        },
      ],
    })
    expect(SnapshotPayloadSchema.safeParse(payload).success).toBe(true)
  })
})

describe('insertSnapshot', () => {
  it('만든 스냅샷을 payload·payloadBytes·만든 사람과 함께 낸다', async () => {
    await withApi(async (ctx) => {
      const { owner, project } = await fixture(ctx)
      const payload = emptyPayload()

      const record = await insertSnapshot(ctx.db, {
        projectId: project.id,
        tag: 'v1',
        description: '첫 스냅샷',
        payload,
        createdBy: owner.user.id,
      })

      expect(record.tag).toBe('v1')
      expect(record.description).toBe('첫 스냅샷')
      expect(record.createdBy).toBe(owner.user.id)
      expect(record.createdByName).toBe(owner.user.name)
      expect(record.payload).toEqual(payload)
      expect(record.payloadBytes).toBeGreaterThan(0)
    })
  })

  /**
   * **태그는 프로젝트 안에서 유일하다.** 실패가 `withTransaction`의 세이브포인트
   * 안에서 나므로 **호출자의 트랜잭션이 살아남는다** — 그 뒤에 무언가를 더 확인할 수 있는
   * 것이 그 증거다.
   */
  it('같은 프로젝트에 같은 태그를 두 번 넣으면 유니크 위반이다', async () => {
    await withApi(async (ctx) => {
      const { owner, project } = await fixture(ctx)
      const input = {
        projectId: project.id,
        tag: '중복',
        description: null,
        payload: emptyPayload(),
        createdBy: owner.user.id,
      }
      await insertSnapshot(ctx.db, input)

      const caught = await insertSnapshot(ctx.db, input).catch((error: unknown) => error)

      expect(caught).toBeInstanceOf(DatabaseError)
      expect((caught as DatabaseError).code).toBe('23505')
      expect((caught as DatabaseError).constraint).toBe('snapshots_project_tag_key')

      // 트랜잭션이 오염되지 않았다 — 위반 뒤에도 같은 핸들로 읽을 수 있다.
      expect(await listSnapshots(ctx.db, project.id)).toHaveLength(1)
    })
  })

  it('다른 프로젝트라면 같은 태그를 쓸 수 있다', async () => {
    await withApi(async (ctx) => {
      const { owner, project } = await fixture(ctx)
      const other = await createProject(ctx, owner.cookie)
      const input = {
        tag: '같은이름',
        description: null,
        payload: emptyPayload(),
        createdBy: owner.user.id,
      }

      await insertSnapshot(ctx.db, { ...input, projectId: project.id })
      await insertSnapshot(ctx.db, { ...input, projectId: other.id })

      expect(await listSnapshots(ctx.db, project.id)).toHaveLength(1)
      expect(await listSnapshots(ctx.db, other.id)).toHaveLength(1)
    })
  })

  it('태그의 NUL을 던져서 막는다 — 아무것도 쓰지 않는다', async () => {
    await withApi(async (ctx) => {
      const { owner, project } = await fixture(ctx)

      await expect(
        insertSnapshot(ctx.db, {
          projectId: project.id,
          tag: `v${NUL}1`,
          description: null,
          payload: emptyPayload(),
          createdBy: owner.user.id,
        }),
      ).rejects.toBeInstanceOf(SnapshotNulByteError)

      expect(await listSnapshots(ctx.db, project.id)).toHaveLength(0)
    })
  })

  it('설명의 NUL도 막는다', async () => {
    await withApi(async (ctx) => {
      const { owner, project } = await fixture(ctx)

      await expect(
        insertSnapshot(ctx.db, {
          projectId: project.id,
          tag: 'v1',
          description: `설명${NUL}`,
          payload: emptyPayload(),
          createdBy: owner.user.id,
        }),
      ).rejects.toBeInstanceOf(SnapshotNulByteError)
    })
  })

  it('payload 안의 NUL도 막는다', async () => {
    await withApi(async (ctx) => {
      const { owner, project } = await fixture(ctx)

      await expect(
        insertSnapshot(ctx.db, {
          projectId: project.id,
          tag: 'v1',
          description: null,
          payload: emptyPayload({ capturedAt: `2026${NUL}` }),
          createdBy: owner.user.id,
        }),
      ).rejects.toBeInstanceOf(SnapshotNulByteError)
    })
  })
})

describe('listSnapshots', () => {
  /**
   * **목록은 payload 본문을 싣지 않는다.** 응답 쪽을 잰다.
   *
   * **이 케이스만으로는 부족하다.** `SUMMARY_COLUMNS`에 `'snapshots.payload'`를
   * 더해 심어도 **0 사망**이다. `toSummary`가 요약 필드만 골라 새 객체를 짓기 때문에, SQL이
   * 무엇을 가져오든 응답 모양은 그대로다. 즉 이 케이스가 지키는 것은 *"클라이언트에게
   * 나르지 않는다"*이고, *"DB에서 끌어오지 않는다"*는 아래 `질의가 payload 컬럼을 …`이 잰다.
   */
  it('payload 본문을 싣지 않고 payloadBytes만 낸다', async () => {
    await withApi(async (ctx) => {
      const { owner, project } = await fixture(ctx)
      await insertSnapshot(ctx.db, {
        projectId: project.id,
        tag: 'v1',
        description: null,
        payload: emptyPayload(),
        createdBy: owner.user.id,
      })

      const rows = await listSnapshots(ctx.db, project.id)

      expect(rows).toHaveLength(1)
      expect(Object.hasOwn(rows[0]!, 'payload')).toBe(false)
      expect(rows[0]!.payloadBytes).toBeGreaterThan(0)
    })
  })

  it('남의 프로젝트 스냅샷은 나오지 않는다', async () => {
    await withApi(async (ctx) => {
      const { owner, project } = await fixture(ctx)
      const other = await createProject(ctx, owner.cookie)
      await insertSnapshot(ctx.db, {
        projectId: other.id,
        tag: 'v1',
        description: null,
        payload: emptyPayload(),
        createdBy: owner.user.id,
      })

      expect(await listSnapshots(ctx.db, project.id)).toHaveLength(0)
    })
  })

  /**
   * 정렬 계약: `created_at` 내림차순, 동률이면 `tag` 오름차순.
   *
   * **동률을 손으로 만든다 — 그것이 유일한 방법이다.** `created_at`은
   * `payload.capturedAt`에서 오고 그 값은 캡처가 읽은 `clock_timestamp()`라 요청마다
   * 다르다. 컬럼 기본값 `now()`가 트랜잭션 안에서 얼어 있는 것에 기대면 동률을
   * **우연히** 얻을 뿐이고, 그 형태는 *"무엇이 동률을 만드는가"*가 케이스에 안 보인다.
   */
  it('같은 시각이면 태그 오름차순이다', async () => {
    await withApi(async (ctx) => {
      const { owner, project } = await fixture(ctx)
      const sameMoment = '2026-08-12T00:00:00.000Z'
      for (const tag of ['c', 'a', 'b']) {
        await insertSnapshot(ctx.db, {
          projectId: project.id,
          tag,
          description: null,
          payload: emptyPayload({ capturedAt: sameMoment }),
          createdBy: owner.user.id,
        })
      }

      expect((await listSnapshots(ctx.db, project.id)).map((row) => row.tag)).toEqual(['a', 'b', 'c'])
    })
  })

  /**
   * **`created_at`은 `payload.capturedAt`의 사본이다.** 둘을 따로 읽으면(컬럼 기본값과
   * 캡처 시각) *"같은 트랜잭션의 같은 시점"*이 거짓이 된다 — 캡처가 걸린 만큼 벌어진다.
   * 값이 하나여야 그 문장이 참이고, 이 케이스가 그것을 지킨다.
   */
  it('created_at이 payload.capturedAt과 같은 값이다', async () => {
    await withApi(async (ctx) => {
      const { owner, project } = await fixture(ctx)
      const capturedAt = '2026-03-04T05:06:07.008Z'

      const record = await insertSnapshot(ctx.db, {
        projectId: project.id,
        tag: 'v1',
        description: null,
        payload: emptyPayload({ capturedAt }),
        createdBy: owner.user.id,
      })

      expect(record.createdAt.toISOString()).toBe(capturedAt)
      // 응답만이 아니라 **행**이 그렇다 — 컬럼 기본값(`now()`)이 이겼다면 여기서 갈린다.
      const row = await ctx.db.selectFrom('snapshots').select('created_at').where('id', '=', record.id).executeTakeFirstOrThrow()
      expect(row.created_at.toISOString()).toBe(capturedAt)
    })
  })

  /** 규격이 `capturedAt`을 ISO datetime으로 강제한다 — 깨진 값이 `Invalid Date`로 내려가지 않는다. */
  it('capturedAt이 ISO datetime이 아니면 규격이 거부한다', () => {
    expect(SnapshotPayloadSchema.safeParse(emptyPayload({ capturedAt: '2026-08-12' })).success).toBe(false)
    expect(SnapshotPayloadSchema.safeParse(emptyPayload({ capturedAt: '' })).success).toBe(false)
  })
})

/**
 * **DB에서 무엇을 끌어오는지를 잰다 — 응답 모양이 아니라 질의 자체를 본다.**
 *
 * *"목록이 payload 전부를 나르면 프로젝트가 커질수록 무거워진다"*는 두 층에 걸린다:
 * 클라이언트로 나르는 것(위 케이스)과 **DB에서 Node로 끌어오는 것**. 뒤쪽은 `toSummary`가
 * 가려 주므로 응답을 보는 케이스로는 잡히지 않는다(변이: `SUMMARY_COLUMNS`에 `payload`를
 * 더해도 응답을 보는 케이스는 안 죽는다).
 *
 * Kysely의 `log` 훅으로 **실제로 나간 SQL 문자열**을 잡는다. 하네스의 공유 핸들에는 훅을
 * 걸 수 없으므로(그것은 이미 만들어진 인스턴스다) 이 블록만 자기 풀을 열고 닫는다.
 */
describe('목록 질의가 끌어오는 컬럼', () => {
  async function capturedSql(run: (db: DbHandle) => Promise<unknown>): Promise<string> {
    const pool = createPool(TEST_DATABASE_URL)
    const queries: string[] = []
    const db = new Kysely<Database>({
      dialect: new PostgresDialect({ pool }),
      log: (event) => {
        queries.push(event.query.sql)
      },
    })
    try {
      await run(db)
    } finally {
      await db.destroy()
    }
    // 이 블록의 호출은 질의를 하나만 낸다(조인은 한 문장이다).
    return queries.join('\n')
  }

  it('listSnapshots의 SQL에 payload 컬럼이 없다', async () => {
    // 존재하지 않는 프로젝트여도 된다 — 재는 것은 결과가 아니라 질의 텍스트다.
    const sqlText = await capturedSql((db) => listSnapshots(db, '00000000-0000-4000-8000-0000000000ff'))

    expect(sqlText).toContain('octet_length')
    expect(sqlText).not.toMatch(/"snapshots"\."payload"(?!::)/)
  })

  it('findSnapshotById의 SQL에는 payload 컬럼이 있다 — 음성 대조', async () => {
    const sqlText = await capturedSql((db) =>
      findSnapshotById(db, '00000000-0000-4000-8000-0000000000ff', '00000000-0000-4000-8000-0000000000fe'),
    )

    expect(sqlText).toMatch(/"snapshots"\."payload"(?!::)/)
  })
})

describe('findSnapshotById', () => {
  it('payload 본문을 함께 낸다', async () => {
    await withApi(async (ctx) => {
      const { owner, project } = await fixture(ctx)
      const payload = emptyPayload({ capturedAt: '2026-01-02T03:04:05.000Z' })
      const created = await insertSnapshot(ctx.db, {
        projectId: project.id,
        tag: 'v1',
        description: null,
        payload,
        createdBy: owner.user.id,
      })

      const found = await findSnapshotById(ctx.db, project.id, created.id)

      expect(found?.payload).toEqual(payload)
      expect(found?.payloadBytes).toBe(created.payloadBytes)
    })
  })

  it('남의 프로젝트 id로는 찾지 못한다', async () => {
    await withApi(async (ctx) => {
      const { owner, project } = await fixture(ctx)
      const other = await createProject(ctx, owner.cookie)
      const created = await insertSnapshot(ctx.db, {
        projectId: project.id,
        tag: 'v1',
        description: null,
        payload: emptyPayload(),
        createdBy: owner.user.id,
      })

      expect(await findSnapshotById(ctx.db, other.id, created.id)).toBeNull()
    })
  })
})

describe('readCaptureFingerprint', () => {
  it('아무것도 바뀌지 않으면 두 번 읽은 지문이 같다', async () => {
    await withApi(async (ctx) => {
      const { project } = await fixture(ctx)

      const first = await readCaptureFingerprint(ctx.db, project.id)
      const second = await readCaptureFingerprint(ctx.db, project.id)

      expect(second.fingerprint).toBe(first.fingerprint)
    })
  })

  /**
   * **`at`은 지문과 **같은 문장**에서 읽은 `clock_timestamp()`다.** 그것이
   * `capturedAt`이 되고, `insertSnapshot`이 그 값을 `created_at`에 심는다.
   *
   * **`now()`였다면 이 케이스가 죽는다** — 하네스가 테스트 하나를 트랜잭션 하나로 감싸므로
   * `transaction_timestamp()`는 두 호출에서 **같은 값**이다.
   *
   * **두 호출 사이를 재우는 것이 필수다 — 안 재우면 깜빡인다.**
   * `clock_timestamp()`는 마이크로초인데 `pg`가 주는 JS `Date`는 밀리초라, 연달아 두 번
   * 읽으면 **같은 밀리초로 접혀** 가끔 `expected N to be greater than N`으로 죽는다. 50ms를 두면 `now()`는
   * 여전히 **동률**이라 변이가 죽고, `clock_timestamp()`는 확실히 벌어져 깜빡이지 않는다.
   */
  it('at은 호출마다 나아간다 — 트랜잭션 시작 시각이 아니다', async () => {
    await withApi(async (ctx) => {
      const { project } = await fixture(ctx)

      const first = await readCaptureFingerprint(ctx.db, project.id)
      await sql`select pg_sleep(0.05)`.execute(ctx.db)
      const second = await readCaptureFingerprint(ctx.db, project.id)

      expect(second.at.getTime()).toBeGreaterThan(first.at.getTime())
    })
  })

  /**
   * **지문이 덮는 테이블은 payload가 담는 자원과 하나씩 맞물린다.** 하나라도 빠지면 그
   * 자원의 변화가 수집 도중에 일어나도 지문이 침묵한다.
   */
  it('빈 프로젝트라도 네 테이블과 테마 바인딩 · 공통코드 표를 전부 낸다', async () => {
    await withApi(async (ctx) => {
      const { project } = await fixture(ctx)

      const parsed = JSON.parse((await readCaptureFingerprint(ctx.db, project.id)).fingerprint) as Record<string, unknown>

      expect(Object.keys(parsed).sort()).toEqual(['codes', 'comments', 'layouts', 'menu_nodes', 'pages', 'theme'])
    })
  })
})
