/**
 * **읽는 명령 셋이 공유하는 두 걸음** — 자격을 찾는 것과 스냅샷을 받는 것.
 *
 * `page get`·`lint`·`export`가 전부 *"바인딩을 읽고 · 토큰을 찾고 · 프로젝트를 부른다"*로
 * 시작한다. 명령마다 다시 짜면 *"자격이 없습니다"*의 문장이 셋으로 갈리고, 그것이
 * `client.ts`가 세 갈래를 한 자리에 둔 것과 같은 부류다.
 *
 * ---
 *
 * # 스냅샷을 규격으로 검사한다
 *
 * `SnapshotPayloadSchema`가 `packages/themes`로 올라온 이유의 절반이 이것이다 — 타입만
 * 올리면 **서버는 검사하고 CLI는 안 하는** 상태가 된다. 응답이 규격과 다르면 코드 3이다:
 * 서버가 준 것을 이 `wireb`가 읽을 수 없다는 뜻이고, 사람이 볼 곳은 서버 쪽이다.
 *
 * # 모르는 payload 형식을 **막지 않고 말한다**
 *
 * `payloadVersion`이 이 `wireb`가 아는 값보다 크면 서버가 더 새것이다. **읽기를 막지
 * 않는다** — 규격이 리터럴이 아닌 이유(`@wirebound/themes`의 `snapshot/payload.ts` —
 * *"`payloadVersion`은 `PageDocument.version`과 다른 축이다"* 절)가 그것이고, 막으면
 * 새 서버에 붙은 옛 CLI가 아무것도 못 읽는다. 대신 **stderr로 말한다**: 이 판이 모르는
 * 절이 payload에 있어도 조용히 빠질 뿐이라는 것을 사람이 알아야 한다.
 *
 * **`out`이 아니라 `err`다.** `--json`을 파이프로 받는 쪽에 섞이면 그 출력이 JSON이
 * 아니게 된다.
 *
 * # `wireb pull`의 출력 파일을 읽지 않는다
 *
 * `wirebound-snapshot.json`은 사람이 커밋할 수도 있는 산출물이라 **낡을 수 있고**, 낡은
 * 파일로 읽으면 *"없는 결함을 말하거나 있는 결함을 놓친다."* 그래서 언제나 서버를 부른다.
 */
import {
  SNAPSHOT_PAYLOAD_VERSION,
  SnapshotPayloadSchema,
  validateManifest,
  type SnapshotPayload,
  type ThemeManifest,
} from '@wirebound/themes'
import { requireBinding, type LoadedBinding } from './binding'
import { callApi, parseJson } from './client'
import { findToken } from './credentials'
import { CliError, configError, serverError } from './exit'
import type { Io } from './io'
import { prepareCatalog } from './read/catalog'

/** 이 리포가 붙을 프로젝트와 그것에 쓸 자격. */
export interface ProjectAccess {
  binding: LoadedBinding
  token: string
}

/**
 * 바인딩과 토큰을 찾는다. 없으면 **무엇을 하라고 말하고** 끝낸다(코드 2).
 */
export async function requireProject(io: Io): Promise<ProjectAccess> {
  const binding = await requireBinding(io)
  const token = await findToken(io, binding.server, binding.projectId)
  if (token === null) {
    throw configError(`${binding.server} 의 프로젝트 ${binding.projectId} 에 쓸 자격이 없습니다. \`wireb login\`을 먼저 실행하세요`)
  }
  return { binding, token }
}

/** `GET .../snapshot`(**단수** — 행을 쓰지 않는다)을 부르고 규격으로 검사한다. */
export async function fetchSnapshot(io: Io, access: ProjectAccess): Promise<SnapshotPayload> {
  const response = await callApi(io, access.binding.server, {
    method: 'GET',
    path: `/api/projects/${access.binding.projectId}/snapshot`,
    token: access.token,
  })

  const parsed = SnapshotPayloadSchema.safeParse(parseJson(response, '프로젝트 덤프'))
  if (!parsed.success) {
    throw serverError(`프로젝트 덤프 응답이 규격과 다릅니다: ${firstIssue(parsed.error)}`)
  }

  const payload = parsed.data
  if (payload.payloadVersion > SNAPSHOT_PAYLOAD_VERSION) {
    io.err(
      `경고: 서버의 스냅샷 형식이 ${payload.payloadVersion}이고 이 wireb는 ${SNAPSHOT_PAYLOAD_VERSION}까지 압니다 — 모르는 절은 읽지 않습니다`,
    )
  }
  return payload
}

/** 프로젝트가 고정한 테마 — lint 의 테마 규칙이 쓴다. 못 받았으면 까닭을 값으로 든다. */
export type LintTheme = { kind: 'bound'; manifest: ThemeManifest } | { kind: 'unavailable'; reason: string }

/**
 * `GET .../theme`(토큰으로 닿는 `:projectId` 라우트)으로 프로젝트가 고정한 manifest 를 받는다.
 *
 * **실패해도 던지지 않는다** — 테마를 못 받은 것은 lint 의 테마 규칙 하나만 못 도는 것이다. 나머지 규칙은 스냅샷만으로 선다. 대신
 * 까닭을 값으로 돌려주고, 부르는 쪽이 «검사에서 빠진 것» 으로 말한다(`read/lint.ts`의 `theme-unavailable`). 이 라우트가 없는 옛 서버
 * (404)도 같은 갈래다. 서버가 준 manifest 는 규격으로 다시 본다 — 규격 밖이면 없는 결함을 말한다.
 */
export async function fetchLintTheme(io: Io, access: ProjectAccess): Promise<LintTheme> {
  let body: unknown
  try {
    const response = await callApi(io, access.binding.server, {
      method: 'GET',
      path: `/api/projects/${access.binding.projectId}/theme`,
      token: access.token,
    })
    body = parseJson(response, '프로젝트 테마')
  } catch (error) {
    if (error instanceof CliError) return { kind: 'unavailable', reason: error.message }
    throw error
  }
  const manifest = typeof body === 'object' && body !== null ? (body as { manifest?: unknown }).manifest : undefined
  if (manifest === null || manifest === undefined) {
    return { kind: 'unavailable', reason: '프로젝트가 아직 테마를 고정하지 않았습니다' }
  }
  // manifest 검증은 컴포넌트 이름을 카탈로그로 본다. 서버가 준 것은 저장된 판이라 서버의 다시 읽기(`readWbtheme` 의 `stored`)와 같은
  // 판정으로 본다 — 카탈로그가 뒤에 걷은 타입(`Slot` · `List`)의 선언으로 그 판에 고정한 프로젝트의 테마 규칙을 잃지 않는다.
  prepareCatalog()
  const checked = validateManifest(manifest, { stored: true })
  if (checked.manifest === null) {
    return { kind: 'unavailable', reason: `서버가 준 manifest 가 규격과 다릅니다: ${checked.issues[0]?.message ?? '알 수 없는 형식 오류'}` }
  }
  return { kind: 'bound', manifest: checked.manifest }
}

/** zod 오류에서 **첫 자리 한 줄**만 옮긴다. 전문을 터미널에 쏟지 않는다. */
function firstIssue(error: { issues: readonly { path: readonly PropertyKey[]; message: string }[] }): string {
  const issue = error.issues[0]
  if (issue === undefined) return '알 수 없는 형식 오류'
  const where = issue.path.map((key) => String(key)).join('.')
  return where.length === 0 ? issue.message : `${where}: ${issue.message}`
}
