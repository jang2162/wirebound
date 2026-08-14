/**
 * 페이지 JSON 가져오기의 조율(§11.2 — P7-3 D7). **세 자원을 한 트랜잭션 안에서 만든다:**
 * 페이지 행 · 페이지 문서 · 코멘트 행.
 *
 * `services/`는 SQL을 직접 쓰지 않고 HTTP도 모른다 — `repos/`의 함수와 `applyEdit`을
 * 조율할 뿐이다. 상태 코드로 옮기는 표는 `routes/pages.ts`에 있다
 * (`services/restore.ts`와 `routes/snapshots.ts`가 같은 배치다).
 *
 * ---
 *
 * # 한 트랜잭션이어야 하는 이유 — P6-2 이월 §8이 이 슬라이스를 겨냥해 적어 뒀다
 *
 * > *"가져오기는 복원보다 **앞 단계 쓰기가 많다**(페이지를 먼저 만들고 문서를 나중에
 * > 쓴다). … 값으로 `return`하는 순간 그 둘이 **커밋된다**."*
 *
 * `withTransaction`의 콜백이 **정상 종료하면 그 구간은 커밋된다**(`db/tx.ts`). 그래서
 * 실패를 값으로 내보내면 그 앞에서 쓴 것이 그대로 남는다 — *"실패했다고 말하는데 조작은
 * 일어났다"*(이 저장소가 일곱 형태로 만난 부류). **그래서 `PageImportAbort`를 던지고
 * `withTransaction` 바깥에서 잡아 판별 유니온으로 바꾼다** — 복원의 `RestoreAbort`와
 * 같은 형식이고, 호출자는 값 하나만 다루면서도 그 사이에 커밋되는 것이 없다.
 *
 * ## 실패 갈래마다 *"무엇을 되돌리는가"* (P6-1 이월 §6이 만든 규칙)
 *
 * | 갈래 | 어디서 | 되돌리는 것 |
 * |---|---|---|
 * | `unsupported-version` | 트랜잭션 **앞** | 없다 — 아직 아무것도 안 썼다 |
 * | `invalid-document` | 트랜잭션 **앞** | 없다 |
 * | `nul-byte`(제목·설명) | 트랜잭션 **앞** | 없다 |
 * | `menu-not-found` | 첫 쓰기 시도(`insertPage`) | 없다 — 그 함수가 INSERT 전에 던진다 |
 * | `edit-failed` | 문서 쓰기 | **페이지 행**(트랜잭션이 되돌린다) |
 * | `comment-nul-byte` | 코멘트 쓰기 | **페이지 행 · 문서 · revision** |
 *
 * ## NUL을 어디서 막는가 — **막는 자리가 이미 있는 것은 그 자리를 쓴다**
 *
 * | 무엇 | 누가 막나 | 결과 |
 * |---|---|---|
 * | 문서 | `applyEdit` 8단계 | `edit-failed`(reason `nul-byte`) → 400 |
 * | 코멘트 본문 | `repos/comments.ts`의 `assertNoNulByte` | `comment-nul-byte` → 400 |
 * | **제목·설명** | **여기** | `nul-byte` → 400 |
 *
 * 셋째만 이 파일이 직접 보는 것은 **`pages.title`에 그런 자리가 없기** 때문이다 — 막지
 * 않으면 `pg`의 raw 예외가 `http/error-handler.ts`에서 **500**이 된다. 사용자가 보낸 글자
 * 때문에 나는 실패는 500이 아니라 400이다(`repos/comments.ts` 머리말과 같은 판단).
 *
 * **앞의 둘을 여기서 미리 끊지 않는 것이 판정이다.** `routes/pages.ts`의 `PUT .../schema`는
 * 미리 끊는데(*"여기서 걸러야 이 요청이 잠금도 트랜잭션도 열지 않고 끝난다"*), 그쪽은
 * 실패 시점에 **되돌릴 것이 없다.** 여기는 페이지가 이미 들어가 있으므로 그 되돌림이
 * 실제로 일어나야 하고, 미리 끊으면 **그 경로가 한 번도 실행되지 않아** 규칙이 지켜지는지
 * 아무도 확인할 수 없다. `test/page-import.test.ts`의 `실패하면 아무것도 남지 않는다`가
 * 그 되돌림을 두 갈래로 잰다.
 *
 * ---
 *
 * # 복원 전용 함수를 쓰지 않는다 (P6-2 이월 §1)
 *
 * `insertPageWithId`·`writePagePlacement`는 **payload의 id와 `sort_order`를 그대로 쓴다** —
 * 가져오기가 원하는 것과 정확히 반대다(같은 파일을 두 번 가져오면 PK가 충돌하고, 남의
 * 프로젝트의 `sort_order`가 이 프로젝트의 불변식을 깬다 — 그 이월의 §2). **`insertPage`를
 * 쓴다**: id를 발급하고 형제 그룹의 맨 끝에 붙인다.
 *
 * > **재라 #4를 재서 정정한다.** P6-2 이월은 그쪽을 *"id를 발급하고 맨 끝에 붙이고 형제를
 * > **재번호한다**"*고 적었는데, `insertPage`는 재번호를 하지 않는다 — `countPagesInMenuNode`로
 * > 형제 수를 세어 그 값을 `sort_order`로 쓸 뿐이다(`repos/pages.ts`). 재번호하는 것은
 * > `updatePage`(이동·재정렬)와 `deletePage`(`closeGap`)다. **결론은 바뀌지 않는다** —
 * > 맨 끝에 붙이는 것만으로 `0..n-1` 불변식이 유지되므로 재번호할 것이 애초에 없다.
 * > 케이스가 그 불변식을 잰다(`sort_order가 연속이다`).
 */
import {
  CURRENT_DOCUMENT_VERSION,
  createNodeId,
  migrateDocument,
  partitionIssues,
  planPageImport,
  validatePage,
  type PageJson,
  type ValidationIssue,
} from '@wirebound/schema'
import { containsNulByte } from '../db/nul-guard'
import { withTransaction, type DbHandle } from '../db/tx'
import { CommentNulByteError, insertComment } from '../repos/comments'
import { MenuNodeNotFoundError, insertPage, type PageRecord } from '../repos/pages'
import type { RevisionActor } from '../repos/revisions'
import { applyEdit, type EditOutcome } from './edit-pipeline'

export interface PageImportInput {
  projectId: string
  /** 페이지를 매달 메뉴 노드(D4 — 가져오기는 **새 페이지를 만든다**). */
  menuNodeId: string
  file: PageJson
  /**
   * 파일의 제목을 덮는다. 없으면 파일의 것을 쓴다.
   *
   * **왜 필요한가:** 페이지 제목에는 유일 제약이 없어 같은 파일을 두 번 가져오면 트리에
   * **같은 이름의 페이지 둘**이 생긴다. 사용자가 그것을 가르지 못한다.
   */
  title?: string
  actor: RevisionActor
  /** 코멘트의 작성자. 파일의 작성자를 쓰지 않는 이유는 아래 `insertComments` 참고. */
  authorId: string
}

export type PageImportOutcome =
  | {
      kind: 'imported'
      page: PageRecord
      seq: number
      /** 저장을 막지 않은 이슈. 호출자가 응답에 실어야 한다(`applyEdit`과 같은 계약). */
      warnings: ValidationIssue[]
      /** 넣은 코멘트 수. */
      inserted: number
      /** 그중 **파일의 트리에 없는 노드**를 가리키던 것(D5 — 고아로 들어간다). */
      dangling: number
    }
  | { kind: 'unsupported-version'; message: string }
  | { kind: 'invalid-document'; issues: ValidationIssue[] }
  | { kind: 'nul-byte' }
  | { kind: 'menu-not-found' }
  | { kind: 'edit-failed'; baseSeq: number; outcome: Extract<EditOutcome, { ok: false }> }
  | { kind: 'comment-nul-byte' }

type PageImportFailure = Exclude<PageImportOutcome, { kind: 'imported' }>

/**
 * 트랜잭션을 되돌리기 위해 던지는 값. **밖으로 새지 않는다** — `importPage`가
 * `withTransaction` 바깥에서 잡아 값으로 바꾼다(위 머리말).
 */
class PageImportAbort extends Error {
  constructor(readonly outcome: PageImportFailure) {
    super(`page-import-abort: ${outcome.kind}`)
    this.name = 'PageImportAbort'
  }
}

/**
 * 파일 한 벌로 페이지를 만든다.
 *
 * 순서가 규격이다:
 *
 * 1. `migrateDocument` — §13.1이 *"가져오기와 스냅샷 복원도 같은 경로를 탄다"*고 적은 자리.
 * 2. `validatePage` — **리매핑 *전* 문서로 본다**(D8). 이슈의 `nodeId`가 사용자의 파일에서
 *    찾을 수 있는 값이어야 하기 때문이고, 두 판의 이슈가 `code`·`path`는 같고 `nodeId`만
 *    다르다는 것은 `packages/schema`의 케이스가 잰다.
 *    **전부에 건다** — P6-2 이월 §7: 복원은 *만드는* 페이지에만 걸지만 가져오기는 전부 만든다.
 * 3. 제목·설명의 NUL(위 표).
 * 4. `planPageImport` — id 재발급과 참조 옮기기(D5).
 * 5. 한 트랜잭션: 페이지 → 문서(`applyEdit`) → 코멘트.
 */
export async function importPage(db: DbHandle, input: PageImportInput): Promise<PageImportOutcome> {
  let migrated
  try {
    migrated = migrateDocument(input.file.schema)
  } catch (error) {
    return {
      kind: 'unsupported-version',
      message: error instanceof Error ? error.message : '지원하지 않는 문서 버전입니다',
    }
  }

  // **`error`만 막는다**(P7-1 이월 §7). 경고는 편집 파이프라인도 막지 않으므로 여기서
  // 막으면 가져오기만 서버의 다른 쓰기 경로보다 엄격해진다 — 끊긴 상호작용 `target`이
  // 그 자리다(P5-2).
  const issues = validatePage(migrated)
  if (partitionIssues(issues).errors.length > 0) {
    // **경고까지 함께 싣는다** — `PUT .../schema`·파이프라인과 같다.
    return { kind: 'invalid-document', issues }
  }

  const title = input.title ?? input.file.page.title
  const description = input.file.page.description ?? null
  if (containsNulByte(title) || containsNulByte(description)) {
    return { kind: 'nul-byte' }
  }

  const plan = planPageImport(migrated, input.file.comments)

  try {
    return await withTransaction(db, async (trx) => {
      let page: PageRecord
      try {
        page = await insertPage(trx, input.projectId, {
          menuNodeId: input.menuNodeId,
          title,
          description,
          // **빈 문서로 만든다** — 문서는 아래 `applyEdit`이 쓴다(D7·D1). `POST .../pages`가
          // 만드는 것과 같은 모양이라, 이 가져오기의 **역(inverse)이 빈 페이지로 되돌린다.**
          schema: { version: CURRENT_DOCUMENT_VERSION, root: { id: createNodeId(), type: 'Page', children: [] } },
          schemaVersion: CURRENT_DOCUMENT_VERSION,
        })
      } catch (error) {
        if (error instanceof MenuNodeNotFoundError) throw new PageImportAbort({ kind: 'menu-not-found' })
        throw error
      }

      // **`PUT .../schema`와 같은 두 op이다.** `applyOp`가 문서 루트(`""`)에 연산을 적용하지
      // 못하므로 `/root`와 `/version`을 따로 replace한다. 방금 만든 페이지라 `headSeq`는 0이고
      // 그 값을 그대로 `baseSeq`로 쓴다 — 이 페이지의 id를 아는 다른 요청이 아직 없다.
      const outcome = await applyEdit(trx, {
        projectId: input.projectId,
        pageId: page.id,
        baseSeq: page.headSeq,
        ops: [
          { op: 'replace', path: '/root', value: plan.document.root },
          { op: 'replace', path: '/version', value: plan.document.version },
        ],
        actor: input.actor,
      })
      // **던진다 — `return`이 아니다.** 여기서 값으로 돌려주면 위의 `insertPage`가 **커밋된다**
      // (P6-2 이월 §8). 그러면 *"가져오기에 실패했다"*는 응답과 함께 **빈 페이지가 남는다.**
      if (!outcome.ok) {
        throw new PageImportAbort({ kind: 'edit-failed', baseSeq: page.headSeq, outcome })
      }

      await insertComments(trx, page.id, input.authorId, plan.comments)

      return {
        kind: 'imported' as const,
        page: { ...page, schema: outcome.schema, schemaVersion: outcome.schemaVersion, headSeq: outcome.seq },
        seq: outcome.seq,
        warnings: outcome.warnings,
        inserted: plan.comments.length,
        dangling: plan.dangling.length,
      }
    })
  } catch (error) {
    if (error instanceof PageImportAbort) return error.outcome
    throw error
  }
}

/**
 * 코멘트를 넣는다. **문서 쓰기 뒤다** — 순서가 반대면 문서가 아직 없는 페이지에 코멘트가
 * 달린다(그 자체로 깨지지는 않지만, 실패했을 때 남는 것이 늘어난다).
 *
 * **작성자는 가져온 사람이다.** 파일에는 작성자가 없다(봉투가 `nodeId`·`body`만 든다 —
 * D6의 이웃 판정). 그리고 있더라도 쓸 수 없다: `comments.author_id`가 `users`를 참조하므로
 * 남의 서버의 사용자 id는 FK 위반이 된다 — 복원이 `missing-author`로 409를 내는 자리와 같은
 * 제약이고, 복원은 **같은 서버 안의 이력**이라 그 검사가 성립하지만 가져오기는 아니다.
 *
 * **번호를 새로 매기지 않는다.** 문서의 노드가 이미 번호를 들고 왔고(D6), 여기서 다시 매기면
 * *"번호를 부여하는 자리"*가 `routes/comments.ts` 말고 하나 더 생긴다(P5-1 D1·D2가 그 자리를
 * 하나로 묶어 둔 것을 뚫는 일이다). 번호가 없는 노드를 가리키는 코멘트는 **번호 없는 코멘트**가
 * 되고, 그것은 화면이 이미 갈라 보이는 정상 상태다(`comment-panel.tsx`의 무리 셋 중 둘째).
 */
async function insertComments(
  trx: DbHandle,
  pageId: string,
  authorId: string,
  comments: readonly { nodeId: string; body: string }[],
): Promise<void> {
  for (const comment of comments) {
    try {
      await insertComment(trx, { pageId, nodeId: comment.nodeId, body: comment.body, authorId })
    } catch (error) {
      // **던져서 되돌린다** — 여기까지 오면 페이지·문서·revision이 이미 들어가 있다.
      if (error instanceof CommentNulByteError) throw new PageImportAbort({ kind: 'comment-nul-byte' })
      throw error
    }
  }
}
