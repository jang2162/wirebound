/**
 * 도구 이름 → 구현. **`TOOLS`의 이름을 키로 쓴다** — 표와 구현이 갈리는 경로가 없게
 * `test/tools.test.ts`가 양쪽에서 분모를 만들어 맞댄다.
 *
 * ---
 *
 * # 여기 조립이 없다
 *
 * `targetedPages` · `matchPageTargets` · `pageView` · `snapshotToLintInput` · `lintProject` ·
 * `filterLintIssues` · `installCatalog`을 **이 패키지가 부르지 않는다.** 부르는 것은
 * `packages/cli/src/read/`이고 `wireb page get`·`wireb lint`도 같은 자리를 부른다.
 *
 * **구조가 그것을 먼저 막는다:** 이 패키지의 런타임 의존은 `@wirebound/cli`와 MCP SDK
 * 둘뿐이라 `@wirebound/schema`를 import하는 줄이 애초에 해석되지 않는다.
 * `test/assembly-census.test.ts`가 그 위에 자를 하나 더 세운다 — 의존을 더하는 것은 한 줄이고,
 * 그 한 줄 뒤에 조용히 두 벌이 생긴다.
 *
 * # 이 파일이 하는 일은 **모양 짓기**다
 *
 * 값은 전부 읽기 층이 만들고, 여기서는 그것을 에이전트가 읽을 봉투에 담는다. 무엇을 담을지가
 * 판정인 자리는 각 함수의 머리말에 있다.
 */
import {
  applyCodeEdits,
  CliError,
  fetchCodeTable,
  fetchCodeUsage,
  fetchLintTheme,
  lintReport,
  listProject,
  lookupPage,
  readCodeEdit,
  readLintConfig,
  requireProject,
  type Io,
  type ProjectAccess,
} from '@wirebound/cli/embed'
import { toolFailureResult, toolResult, type ToolOutcome } from './outcome'
import { callProject, openProject, projectHead, rereadHeadSeq, type OpenProject } from './session'

export type ToolHandler = (io: Io, args: Record<string, unknown>) => Promise<ToolOutcome>

/**
 * 설계서 「MCP 도구」 *"프로젝트 메뉴/페이지 트리 조회"*.
 *
 * **경로를 앞에 싣는다.** 그것이 `get_page`·`validate`가 받는 인자이고, 에이전트가 이 응답을
 * 읽고 바로 다음 도구를 부를 수 있어야 한다 — `wireb lint`가 이슈 줄에 `페이지 <uuid>`가
 * 아니라 페이지 경로(설계서 「상호작용」의 「모델」 절의 `page:` 타겟)를 쓰는 것과 같은
 * 근거다.
 *
 * **겹치는 경로를 말한다.** 같은 메뉴 아래 같은 제목이거나 제목에 `/`가 들면 두 페이지가
 * 같은 타겟을 든다(`duplicateTargets`가 그 판정을 갖고 있다). 그 경로로는 `get_page`가 하나를 고를 수 없으므로
 * **부르기 전에 알아야 한다** — `wireb lint`는 이 상태를 아직 규칙으로 안 본다.
 */
const listPages: ToolHandler = async (io) => {
  const open = await openProject(io)
  const listing = listProject(open.payload)
  return toolResult({ ...projectHead(open), ...listing })
}

/**
 * 「MCP 도구」 *"페이지 스키마 + 코멘트 + 상호작용 문장 조회"*.
 *
 * # 못 찾은 것과 둘 이상을 **결과로 낸다** — 오류가 아니다
 *
 * `wireb page get`은 둘 다 코드 1(*"명령을 잘못 썼다"*)로 끝낸다. **여기서는 다르다:**
 * 경로가 틀린 것은 **에이전트가 고칠 수 있는 상태**이고, 고치려면 후보 목록을 읽어야 한다.
 * JSON-RPC 오류로 내면 그 목록이 *"도구가 고장났다"*와 함께 실려 나간다.
 *
 * **그래서 `isError`도 안 세운다** — `found: false`가 값이고, 그 옆에 무엇을 대신 부를지가
 * 함께 있다. `wireb`의 코드 1과 어긋나 보이지만 **어긋나는 것이 아니라 받는 쪽이 다르다**:
 * 셸은 코드를 읽고 에이전트는 값을 읽는다.
 *
 * # 무엇을 싣나
 *
 * `pageView`가 정한 것 전부다 — 노드 개요·문서 전문·코멘트·상호작용 문장. **문서 전문을
 * 뺄 이유가 없다:** 설계서 「스킬」의 흐름이 *"`get_page`로 스키마·코멘트·상호작용을 읽는다"*이고
 * 그것을 읽는 것이 에이전트의 일이다. 사람에게 쏟지 않으려고 개요를 따로 두는 것은 CLI의
 * 사정이다.
 *
 * # `notes`를 버리지 않는다
 *
 * 오늘 그 자리에 오는 것은 *"문서 버전을 못 올렸다"* 하나다(`read/page.ts`). 버리면
 * **저장된 그대로 읽은 것**이 최신으로 읽은 것과 같아 보인다.
 */
const getPage: ToolHandler = async (io, args) => {
  const open = await openProject(io)
  const found = lookupPage(open.payload, path(args))
  const head = projectHead(open)

  if (found.kind === 'none') {
    return toolResult({
      ...head,
      found: false,
      reason: 'no-such-path',
      message: `그 경로의 페이지가 없습니다: ${path(args)}`,
      candidates: found.candidates,
    })
  }
  if (found.kind === 'ambiguous') {
    return toolResult({
      ...head,
      found: false,
      reason: 'ambiguous',
      // **하나를 고르면 그 판정이 조용히 묻힌다** — 설계서 쪽을 고쳐야 하는 상태다.
      message: `그 경로의 페이지가 ${found.matches.length}개입니다: ${path(args)} — 같은 타겟을 든 페이지가 둘 이상이면 설계서의 링크도 그 페이지들을 가리키지 못합니다`,
      matches: found.matches,
    })
  }
  return toolResult({ ...head, found: true, headSeq: found.headSeq, notes: found.notes, page: found.view })
}

/**
 * 「MCP 도구」 *"lint 규칙 실행"*.
 *
 * # 결함을 찾은 것은 **오류가 아니다**
 *
 * `wireb lint`는 그것을 코드 10으로 말하는데 그 번호가 1~4와 **멀리 떨어져 있는 것이
 * 판정이다**(`exit.ts`): *"명령이 서지 못했다"*와 *"제대로 서서 결함을 찾았다"*를 스크립트가
 * 갈라야 한다. 여기서도 같다 — `isError`를 세우면 에이전트가 *"도구가 고장났다"*로 읽고
 * 재시도한다. 대신 **`failing`을 값으로 낸다.**
 *
 * # 걸러진 것으로 답하되 **빠진 것을 필드로 말한다**
 *
 * `wireb lint <경로>`가 걸러진 것으로 종료 코드를 내는 판정(`commands/lint.ts`)을 그대로 쓴다 —
 * 다르게 정하면 같은 프로젝트를 두 도구가 다르게 말한다. **그러나 CLI가 stderr 한 줄로
 * 말하는 것을 에이전트는 놓친다.** 그래서 `outsideErrors`·`droppedProjectIssues`가 산문이
 * 아니라 필드다.
 *
 * # `LintConfig`는 리포의 파일에서만 온다
 *
 * `readLintConfig(binding)` 하나가 그 값을 만든다. **도구 인자에 그 자리가 없다** —
 * 근거는 `tools.ts`의 머리말이고 `test/tools.test.ts`가 그 부재를 든다.
 *
 * # `notes`를 버리지 않는다
 *
 * *"검사에서 빠진 것"*이다. 버리면 못 올린 문서 버전·메뉴를 잃은 페이지가 전부 **"결함 0건"으로 위장된다.**
 */
const validate: ToolHandler = async (io, args) => {
  const open = await openProject(io)
  // `wireb lint` 와 같은 길 — 테마를 못 받으면 테마 규칙만 빠지고 `notes` 가 그렇다고 말한다.
  const theme = await fetchLintTheme(io, open.access)
  const outcome = lintReport(open.payload, readLintConfig(open.access.binding), optionalPath(args), theme)
  const head = projectHead(open)

  if (outcome.kind === 'no-such-path') {
    // `get_page`와 같은 모양이다 — 경로가 틀린 것은 에이전트가 고칠 수 있는 상태다.
    return toolResult({
      ...head,
      ran: false,
      reason: 'no-such-path',
      message: `그 경로의 페이지가 없습니다: ${outcome.path}`,
      candidates: listProject(open.payload).pages.map((page) => page.path),
    })
  }

  const report = outcome.report
  return toolResult({
    ...head,
    ran: true,
    path: report.filtered ? optionalPath(args) : null,
    /** `wireb lint`가 코드 10을 내는 조건과 **같은 값**이다. */
    failing: report.errors > 0,
    errors: report.errors,
    warnings: report.warnings,
    /** 알림(`info`) 수 — 결함이 아니다. `failing` 에도 `warnings` 에도 안 든다. */
    infos: report.infos,
    totalIssues: report.totalIssues,
    /** 경로 밖에 남은 `error`. **0이 아니면 이 응답만 보고 *"괜찮다"*로 읽으면 안 된다.** */
    outsideErrors: report.outsideErrors,
    /** `pageId`가 `null`이라 경로 필터에서 통째로 빠진 이슈 수(메뉴 이름 규칙). */
    droppedProjectIssues: report.droppedProjectIssues,
    /** **검사에서 빠진 것.** 비어 있지 않으면 결함 0건이 *"깨끗하다"*가 아니다. */
    notes: report.notes,
    issues: report.issues.map((issue) => ({
      ...issue,
      // **`pageId`를 사람이 읽는 자리로도 옮긴다** — 에이전트가 이 값을 그대로
      // `get_page`에 넣을 수 있어야 한다. uuid로만 말하면 다음 걸음이 손으로 옮겨진다.
      pagePath: issue.pageId === null ? null : (report.pathOf.get(issue.pageId) ?? null),
    })),
  })
}

/**
 * 경로 하나를 페이지 하나로 푼다. **쓰기 둘이 공유한다** — 못 찾은 것과 둘 이상을
 * `get_page`와 **같은 모양**으로 답해야 에이전트가 세 도구에서 같은 갈래를 읽는다.
 *
 * `null`을 내면 그 결과가 이미 만들어진 것이다(부르는 쪽이 그대로 돌려준다).
 */
function resolvePage(open: OpenProject, args: Record<string, unknown>): { pageId: string } | { outcome: ToolOutcome } {
  const head = projectHead(open)
  const found = lookupPage(open.payload, path(args))

  if (found.kind === 'none') {
    return {
      outcome: toolResult({
        ...head,
        applied: false,
        reason: 'no-such-path',
        message: `그 경로의 페이지가 없습니다: ${path(args)}`,
        candidates: found.candidates,
      }),
    }
  }
  if (found.kind === 'ambiguous') {
    return {
      outcome: toolResult({
        ...head,
        applied: false,
        reason: 'ambiguous',
        message: `그 경로의 페이지가 ${found.matches.length}개입니다: ${path(args)} — 같은 타겟을 든 페이지가 둘 이상이면 어느 것을 고쳐야 하는지 정할 수 없습니다`,
        matches: found.matches,
      }),
    }
  }
  return { pageId: found.view.id }
}

/**
 * 「MCP 도구」 *"사람 편집과 동일 경로의 수정 (baseSeq 필수)"*.
 *
 * ---
 *
 * # REST를 직접 부른다 — `wireb`의 명령을 안 지난다
 *
 * 설계서 「LLM 편집 경로」: *"WebSocket 대신 REST로 들어오지만 그 뒤 파이프라인(검증 → revision →
 * 브로드캐스트)은 완전히 같다."* 그 문장이 참인 것은 `PATCH .../ops`가 사람의 편집이
 * 들어오는 **바로 그 라우트**이기 때문이다. 도구가 자기 검증이나 자기 이력을 더하면
 * 그 문장이 거짓이 된다.
 *
 * # 재시도하지 않는다
 *
 * 409를 받으면 문서를 **다시 읽고 patch를 다시 만들어야** 한다. 그것은 에이전트의
 * 판단이다 — 도구가 몰래 재시도하면 **에이전트가 만든 patch가 다른 문서에 얹힌다.**
 * 그 편집은 200으로 끝나고, 무엇이 잘못됐는지 아무도 모른다.
 *
 * **대신 새 `headSeq`를 실어 준다.** 「LLM 편집 경로」의 *"재조회 후 재시도"*를 도구가 지원하는
 * 방법이 그것이다 — 산문으로 *"다시 읽으세요"*만 말하면 에이전트가 그 번호를 어디서
 * 얻는지 모른다. `test/write-tools.test.ts`가 **도구가 서버를 두 번 부르지 않는 것**을
 * 든다(409 뒤의 재조회 하나는 세고, 두 번째 `PATCH`는 없어야 한다).
 *
 * # 409와 423은 **다른 말을 한다**
 *
 * | 상태 | `reason` | 에이전트가 할 일 |
 * |---|---|---|
 * | 409 | `stale` | **다시 읽고 다시 만든다.** 문서가 내 밑에서 움직였다 |
 * | 423 | `locked` | **기다렸다 다시 하거나 다른 일을 한다.** 재조회해도 안 풀린다 — 문서가 아니라 사람이 막고 있다 |
 * | 그 밖 | `rejected` | 서버가 쓴 문장을 읽는다(권한·검증·없는 페이지) |
 *
 * 두 문장이 같아지면 에이전트가 잠긴 자리에 **재시도 루프**를 돈다. `apps/api/README.md`가
 * *"자동 재시도를 짜지 마라"*를 계약으로 적었고, 그 계약을 지킬 수 있게 하는 것이 이 표다.
 *
 * # `isError`가 서는 것과 안 서는 것
 *
 * **경로를 못 찾은 것은 결과다**(`get_page`와 같다 — 에이전트가 고칠 수 있고 후보를 읽어야
 * 고친다). **서버가 거절한 것은 `isError`다** — 편집이 일어나지 않았고, 그 사실이 값의
 * 한 필드로 묻히면 에이전트가 다음 걸음을 잘못 딛는다.
 */
const patchPage: ToolHandler = async (io, args) => {
  const open = await openProject(io)
  const resolved = resolvePage(open, args)
  if ('outcome' in resolved) return resolved.outcome

  const head = projectHead(open)
  const baseSeq = args.baseSeq as number

  try {
    const said = (await callProject(io, open, {
      method: 'PATCH',
      path: `/api/projects/${open.access.binding.projectId}/pages/${resolved.pageId}/ops`,
      // **`ops`를 그대로 넘긴다** — 검증하는 자리는 서버다(`tools.ts`의 머리말).
      body: { baseSeq, ops: args.ops },
    })) as { seq: number; revisionId: string; warnings?: unknown[] }

    return toolResult({
      ...head,
      applied: true,
      path: path(args),
      pageId: resolved.pageId,
      /** **다음 `patch_page`의 `baseSeq`다.** 없으면 에이전트가 매번 `get_page`를 다시 부른다. */
      headSeq: said.seq,
      revisionId: said.revisionId,
      /** 저장을 막지 않은 이슈. **버리지 않는다** — 적은 값이 버려진 것을 아무도 모르게 된다. */
      warnings: said.warnings ?? [],
    })
  } catch (error) {
    if (!(error instanceof CliError) || error.status === undefined) throw error

    const message = `[wireb 코드 ${error.code}] ${error.message}`
    if (error.status === 423) {
      return toolFailureResult({
        ...head,
        applied: false,
        reason: 'locked',
        status: 423,
        message,
        // **409와 글자가 달라야 한다**(위 표). 같으면 에이전트가 재시도 루프를 돈다.
        next: '사람이 그 영역을 편집 중입니다. 재조회해도 풀리지 않습니다 — 잠금이 풀릴 때까지 기다렸다 다시 하거나 다른 페이지를 먼저 하세요. 문장에 누가 잡고 있는지가 있습니다.',
      })
    }
    if (error.status === 409) {
      const headSeq = await rereadHeadSeq(io, open, resolved.pageId)
      return toolFailureResult({
        ...head,
        applied: false,
        reason: 'stale',
        status: 409,
        message,
        baseSeq,
        /** 다시 읽은 값. **`null`이면 그 사이 페이지가 사라졌다.** */
        headSeq,
        next: 'get_page 로 문서와 headSeq 를 다시 읽고 ops 를 새로 만드세요 — 이 도구는 재시도하지 않습니다. 같은 ops 를 새 baseSeq 로 다시 보내면 남이 고친 것 위에 얹힙니다.',
      })
    }
    return toolFailureResult({
      ...head,
      applied: false,
      reason: 'rejected',
      status: error.status,
      message,
      next: '서버가 쓴 문장이 무엇을 고쳐야 하는지 말합니다. 문서 검증에 걸린 것이면 get_page 로 다시 읽고 ops 를 고치세요.',
    })
  }
}

/**
 * 「MCP 도구」 *"구현 중 발견한 이슈를 설계서에 기록"*. 「스킬」 흐름의 4단계다.
 *
 * ---
 *
 * # 문서를 바꾼다는 것을 숨기지 않는다
 *
 * 번호가 없던 노드에 코멘트를 달면 서버가 `marker`를 붙이고 **그것은 문서 편집이라
 * revision이 쌓이고 `headSeq`가 오른다**(그래야 undo가 되고 그 뒤 편집의 `baseSeq`가 안
 * 틀어진다).
 *
 * **에이전트가 그것을 모르면 자기가 들고 있던 `baseSeq`로 다음 `patch_page`를 불러 409를
 * 받는다.** 그 순간 원인이 **자기 코멘트**라는 것을 알 수 없다 — 남이 고친 것으로 읽고
 * 문서를 다시 읽는다. 그래서 응답이 `documentChanged`와 새 `headSeq`를 **필드로** 낸다.
 *
 * **진짜 서버의 값이다**(다시 재는 곳: `apps/api/test/agent-flow.test.ts`): 번호가 없던
 * 노드에 첫 코멘트를 달면 `headSeq`가 1→2로 오르고 옛 `baseSeq`의 patch가 **409**다. 이미 번호가 있는 노드에 하나 더 달면 `markerOps`가 비고 `headSeq`가
 * **안 오른다**(2→2) — 그때는 옛 `baseSeq`가 여전히 유효하다. **두 갈래가 갈리므로**
 * 응답이 그것을 말하지 않으면 에이전트가 어느 쪽인지 알 수 없다.
 *
 * # 작성자는 사람이다
 *
 * `comments.author_id`가 `users(id)`에 FK를 걸므로 코멘트 행의 작성자는 **토큰 발급자**다.
 * 도구가 만든 **revision**의 actor는 `mcp`다(「LLM 편집 경로」) — 둘이 다른 물음에 답한다.
 */
const addComment: ToolHandler = async (io, args) => {
  const open = await openProject(io)
  const resolved = resolvePage(open, args)
  if ('outcome' in resolved) return resolved.outcome

  const head = projectHead(open)

  try {
    const said = (await callProject(io, open, {
      method: 'POST',
      path: `/api/projects/${open.access.binding.projectId}/pages/${resolved.pageId}/comments`,
      body: { nodeId: args.nodeId, body: args.body },
    })) as { comment: { id: string; authorName: string }; marker: number; seq: number; markerOps: unknown[] }

    const changed = said.markerOps.length > 0
    return toolResult({
      ...head,
      added: true,
      path: path(args),
      pageId: resolved.pageId,
      commentId: said.comment.id,
      /** 그 노드의 번호(설계서 「페이지 스키마 노드」의 `marker`). 스레드가 이 번호를 공유한다. */
      marker: said.marker,
      /** **문서가 바뀌었는가**(위 머리말). 번호를 새로 붙였으면 `true`다. */
      documentChanged: changed,
      /** 지금의 `headSeq`. **다음 `patch_page`의 `baseSeq`가 이 값이다.** */
      headSeq: said.seq,
      note: changed
        ? `번호 ${said.marker}을 새로 붙이느라 문서가 바뀌었습니다 — headSeq 가 ${said.seq} 로 올랐습니다. 들고 있던 baseSeq 로 patch_page 를 부르면 409 입니다.`
        : '이미 번호가 있는 노드라 문서는 그대로입니다 — headSeq 가 오르지 않았습니다.',
    })
  } catch (error) {
    if (!(error instanceof CliError) || error.status === undefined) throw error
    return toolFailureResult({
      ...head,
      added: false,
      reason: error.status === 409 ? 'stale' : error.status === 404 ? 'no-such-node' : 'rejected',
      status: error.status,
      message: `[wireb 코드 ${error.code}] ${error.message}`,
      next:
        error.status === 404
          ? 'get_page 로 nodes[].id 를 다시 읽으세요 — 그 노드가 이 페이지에 없습니다.'
          : '서버가 쓴 문장이 무엇을 고쳐야 하는지 말합니다. 이 도구는 재시도하지 않습니다.',
    })
  }
}

/**
 * 공통코드 도구 셋의 머리 — 스냅샷을 안 받으므로 `capturedAt` 이 없다(표는 지금 값이다).
 */
function accessHead(access: ProjectAccess): { server: string; projectId: string } {
  return { server: access.binding.server, projectId: access.binding.projectId }
}

/** 「MCP 도구」 *"공통코드 표 + 사용 수 조회"*. 표와 사용 수는 `wireb codes list` 와 같은 함수(`fetchCodeTable`)가 읽는다. */
const listCodes: ToolHandler = async (io) => {
  const access = await requireProject(io)
  const listing = await fetchCodeTable(io, access)
  return toolResult({ ...accessHead(access), groups: listing.groups, counts: listing.counts })
}

/** 「MCP 도구」 *"공통코드 그룹 · 항목의 사용처 조회"*. 세는 것은 서버다(`codeUsage` 한 벌). */
const codeUsage: ToolHandler = async (io, args) => {
  const access = await requireProject(io)
  const group = args.group as string
  const item = args.item as string | undefined
  const usage = await fetchCodeUsage(io, access, group, item)
  return toolResult({ ...accessHead(access), group, item: item ?? null, usage })
}

/**
 * 「MCP 도구」 *"공통코드 그룹 · 항목 만들기 · 고치기 · 지우기"*.
 *
 * **원소의 꼴은 보내기 전에 다 읽는다** — 셋째 원소가 틀렸는데 앞 둘을 보낸 뒤에야 알면 묶음이 반쯤 선다. 그 밖(키 꼴 · 길이 · 겹침 · 상한)은
 * 서버가 본다(두 벌을 두지 않는다). **첫 거절에서 멈추고 `isError` 를 세운다** — 앞에서 된 것은 `applied` 가 말한다(표에 이력이 없어 되돌리지 않는다).
 */
const editCodes: ToolHandler = async (io, args) => {
  const ops = (args.ops as unknown[]).map((op, index) => readCodeEdit(op, `ops[${index}]`))
  const access = await requireProject(io)
  const outcome = await applyCodeEdits(io, access, ops)
  const head = { ...accessHead(access), total: ops.length, applied: outcome.applied }
  if (outcome.rejected === null) return toolResult({ ...head, rejected: null })
  return toolFailureResult({
    ...head,
    rejected: {
      index: outcome.rejected.index,
      status: outcome.rejected.status,
      message: `[wireb 코드 ${outcome.rejected.code}] ${outcome.rejected.message}`,
    },
    next: `ops[${outcome.rejected.index}] 부터 보내지 않았습니다 — 앞의 ${outcome.applied}개는 이미 표에 섰습니다. list_codes 로 표를 다시 읽고 남은 것을 고쳐 보내세요.`,
  })
}

/**
 * 필수 `path` 인자. **`server.ts`가 이미 모양을 봤다** — 여기 오는 값은 반드시 문자열이다.
 *
 * **좁히는 자리를 한 곳에 둔다.** 도구마다 `args.path as string`을 적으면 그 캐스팅이
 * 검사를 안 지난 자리에도 복사된다.
 */
function path(args: Record<string, unknown>): string {
  return args.path as string
}

/** `validate`의 `path`는 선택이다. 안 주면 프로젝트 전체다. */
function optionalPath(args: Record<string, unknown>): string | undefined {
  return args.path as string | undefined
}

export const HANDLERS: Record<string, ToolHandler> = {
  list_pages: listPages,
  get_page: getPage,
  patch_page: patchPage,
  add_comment: addComment,
  validate,
  list_codes: listCodes,
  code_usage: codeUsage,
  edit_codes: editCodes,
}
