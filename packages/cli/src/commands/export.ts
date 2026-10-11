/**
 * `wireb export --format <html|pptx> -o <dir>` — 설계서 「CLI」의 *"정적 번들 생성"*.
 *
 * | 형식 | 서버가 주는 것 | 여기서 하는 것 |
 * |---|---|---|
 * | `html` | 「HTML 정적 번들」의 zip | 뿌리를 벗기고 **파일 여럿**을 `-o` 아래에 푼다 |
 * | `pptx` | 「로드맵」의 pptx **하나** | **파일 하나**를 `-o` 아래에 그 이름으로 쓴다 |
 *
 * **pptx 를 풀지 않는다.** pptx 도 zip 이지만 그것은 **파일 하나의 안쪽**이다 — 풀어 놓으면
 * 사람이 받아야 할 `.pptx` 가 사라지고 `[Content_Types].xml` 같은 것이 디렉터리에 흩뿌려진다.
 *
 * # 이름을 지어내지 않는다
 *
 * pptx 는 파일 하나이므로 이름이 필요한데, **CLI 가 그것을 만들지 않고 서버의
 * `Content-Disposition` 에서 읽는다** — 사람이 읽는 이름은 `Content-Disposition`과
 * 미리보기의 `fileName`에만 있다. 지어내면 웹에서 내려받은 파일과 `wireb` 가 쓴 파일의
 * 이름이 갈린다.
 *
 * ---
 *
 * # 서버가 만든 zip을 받아 푼다 — 번들을 다시 만들지 않는다
 *
 * `exportBundle`이 순수해서 CLI가 번들을 만들 수는 있다. 그러면 **입력을 조립하는 자리가
 * 둘이 되고**(`apps/api`의 `exportProjectBundle`과 여기) 웹의 내려받기와 CLI의 결과가
 * 갈릴 수 있다. 서버가 만든 것을 그대로 받으면 **같은 바이트**다.
 *
 * # `fflate`를 들인다 — *"CLI는 런타임 의존을 새로 들이지 않는다"*의 예외 (근거를 적는다)
 *
 * - **새로 고르는 것이 아니라 이미 고른 것을 같은 이유로 다시 쓴다.** `apps/api`가 zip을
 *   만들 때 이것을 쓴다(`services/export-zip.ts`) — 같은 번들을 두 쪽이 같은 라이브러리로
 *   다룬다.
 * - **전이 의존이 0이다**(재는 법: `packages/cli/node_modules/fflate/package.json`에
 *   `dependencies`가 없다).
 * - 대안은 `node:zlib`으로 zip 컨테이너를 손으로 파싱하는 것인데, 그것은 `node:*`를
 *   `node-io.ts` 밖에서 부르는 일이라 `io.ts`의 경계(바깥 세계는 `io`로만 만진다)가 막는다.
 *
 * # 압축 안의 경로를 믿지 않는다
 *
 * 그 zip은 우리 서버가 만들지만 **이 명령은 *"서버가 준 archive를 사용자의 파일
 * 시스템에 푸는 도구"*다.** 그 부류가 오래 겪어 온 사고가 zip-slip이고, `..`나 절대
 * 경로가 든 항목 하나면 `-o` 바깥이 덮인다. **거부하고 멈춘다** — 걸러 내고 나머지를 풀면
 * 사람은 *"다 풀렸다"*고 읽는다.
 *
 * # 밀려 있으면 몇 번 다시 보낸다
 *
 * 서버의 내보내기는 떠 있는 수가 묶여 있어 넘으면 503 + `Retry-After`로 **일을 받지 않는다**(`apps/api` README 「에러 형식」).
 * 읽기뿐이라 다시 보내도 안전하다. 그래서 그 머리가 있는 503 이면 **그 초만큼 쉬고 다시 보낸다** — `EXPORT_BUSY_RETRIES`
 * 번까지. 넘으면 마지막 거절을 그대로 낸다(코드 3). 기다릴 때마다 표준에러에 한 줄을 적는다 — 조용히 멈춘 것처럼 보이지 않게.
 *
 * - **`Retry-After`가 없는 503 은 다시 보내지 않는다.** DB 에 닿지 못한 503 은 머리가 없다 — 서버가 «언제»를 말하지 않은
 *   거절을 기계가 두드리지 않는다.
 * - **`EXPORT_BUSY_WAIT_LIMIT_S`보다 긴 `Retry-After`는 따르지 않는다** — 그만큼 조용히 서 있는 명령은 멈춘 것과 같다.
 *
 * # 그림이 빠진 pptx 를 조용히 쓰지 않는다
 *
 * pptx 의 화면 이미지는 서버가 브라우저로 그린다. 브라우저가 없거나 글꼴이 없으면 파일은 200 으로 나오고 그 슬라이드에는 글자만
 * 실린다 — **이유는 미리보기가 말하는데 이 명령은 미리보기를 안 부른다**(부르면 서버가 같은 판정으로 한 번 더 그린다). 그래서
 * 서버가 파일 응답의 머리에 수를 싣고(`SCREEN_FAILURES_HEADER` · `SCREENLESS_HEADER` — `apps/api`의 `routes/export.ts`에 같은
 * 글자가 있다) 이 명령이 그것을 **경고로** 말한다. 파일은 그대로 쓰고 코드도 0 이다 — 쓴 것은 쓸 만한 pptx 이고, 사람이 알아야
 * 할 것은 무엇이 빠졌는지다.
 *
 * # 이미 있는 파일을 덮지 않는다
 *
 * `-o`를 지난 실행의 자리로 다시 겨누는 것은 흔한데, **덮어쓰기는 되돌릴 수 없다.**
 * 하나라도 있으면 **아무것도 쓰기 전에** 멈추고 무엇이 있는지 말한다. `--force`가 그것을
 * 넘긴다.
 *
 * # 뿌리 폴더를 벗긴다
 *
 * 서버의 zip은 `wirebound-export-<슬러그>/` 아래에 전부를 담는다(브라우저가 내려받아 아무
 * 데나 풀 때 흩뿌려지지 않게 하는 자리다 — `export-zip.ts`). **`-o`는 사람이 이미 고른
 * 디렉터리다.** 그대로 두면 `-o dist/design`이 `dist/design/wirebound-export-foo/index.html`을
 * 만들고, 그 슬러그를 **CLI가 사람에게 말해 준 적이 없어서** 정적 호스팅 설정이 그것을
 * 알 방법이 없다. 그래서 **모든 항목이 한 마디를 공유할 때만** 그 마디를 벗긴다.
 * 파일의 바이트는 건드리지 않는다.
 */
import { strFromU8, unzipSync } from 'fflate'
import { callApiBytes, type ApiBytesResponse, type ApiRequest } from '../client'
import { CliError, EXIT, serverError, usageError } from '../exit'
import type { Io } from '../io'
import { join, resolveFrom } from '../paths'
import { requireProject } from '../project'

/**
 * `--format`이 받는 값.
 *
 * **`apps/api`의 같은 이름과 다른 물음에 답한다.** 이쪽은 *"이 `wireb`가 파일로 쓸 줄 아는
 * 형식"*이고 그쪽은 *"이 서버가 만들 줄 아는 형식"*이다 — 형식마다 여기서 하는 일이 다르므로
 * (위 표) 서버가 형식을 더해도 옛 `wireb`는 그것을 못 쓰는 것이 맞다. 그때 사람이 볼 곳은
 * 이 사용법이고, **모르는 값은 네트워크를 타기 전에** 끊긴다.
 *
 * **두 목록이 같은 글자를 써야 하는 자리는 하나다** — `?format=` 에 실리는 값. 아래
 * `runExport`가 그 값을 그대로 싣고 `test/export.test.ts`가 요청 경로로 그것을 든다.
 */
export const EXPORT_FORMATS = ['html', 'pptx'] as const

type ExportFormat = (typeof EXPORT_FORMATS)[number]

export interface ExportOptions {
  format: string | undefined
  out: string | undefined
  force: boolean
}

/** 이미 있는 파일을 몇 개까지 이름으로 보일지. */
const CONFLICT_LIMIT = 5

/** 밀려 있다는 503 에 몇 번 다시 보내나 — 머리말 «밀려 있으면 몇 번 다시 보낸다». */
export const EXPORT_BUSY_RETRIES = 3

/** 이보다 긴 `Retry-After`는 따르지 않는다(초) — 같은 절. */
export const EXPORT_BUSY_WAIT_LIMIT_S = 60

/** pptx 파일 응답의 머리 — 머리말 «그림이 빠진 pptx 를 조용히 쓰지 않는다». */
export const SCREEN_FAILURES_HEADER = 'x-wb-screen-failures'
export const SCREENLESS_HEADER = 'x-wb-screenless'

export async function runExport(io: Io, options: ExportOptions): Promise<number> {
  const format = options.format ?? EXPORT_FORMATS[0]
  if (!(EXPORT_FORMATS as readonly string[]).includes(format)) {
    throw usageError(`--format 은 ${EXPORT_FORMATS.join(' 또는 ')} 입니다: ${format}`)
  }
  if (options.out === undefined || options.out.trim().length === 0) {
    throw usageError(`받아 놓을 디렉터리를 주세요: wireb export --format ${format} -o <dir>`)
  }

  const access = await requireProject(io)
  const response = await fetchExport(io, access.binding.server, {
    method: 'GET',
    // **형식을 그대로 싣는다.** 서버가 아는 값이 아니면 그쪽이 400을 내고 그 문장이 나온다.
    path: `/api/projects/${access.binding.projectId}/export?format=${format}`,
    token: access.token,
  })

  const files = format === 'pptx' ? [singleFile(response)] : stripCommonRoot(readArchive(response.bytes))
  if (files.length === 0) throw serverError('번들이 비어 있습니다')

  // **사람이 친 경로는 사람이 서 있는 곳에서 읽힌다**(`pull`과 같은 규칙).
  const target = resolveFrom(io.cwd, options.out.trim())

  /**
   * **`-o`가 파일을 가리키면 여기서 끊는다.**
   *
   * 안 끊으면 `mkdir`이 `ENOTDIR`로 던지고 `run.ts`의 마지막 갈래가 그것을 **70**
   * (*"버그다 — 사용자가 고칠 수 없다"*)으로 낸다. **사람이 할 일은 `-o` 한 글자를
   * 고치는 것**이므로 `exit.ts`의 표대로면 그 자리는 1이다.
   *
   * **`client.ts`의 `assertSendableHeaders`와 같은 부류다** — 헤더에 실을 수 없는 자격을
   * `fetch`가 던지게 두면 *"서버에 연결할 수 없습니다"*(4)로 나가므로 **보내기 전에** 보고
   * 2로 끊는다. 여기서도 **쓰기 전에** 본다.
   *
   * **`--force`보다 앞이다.** `--force`는 *"덮어써도 된다"*이지 *"파일을 디렉터리로
   * 만들어도 된다"*가 아니다 — 그쪽도 같은 `ENOTDIR`로 죽는다.
   *
   * **덮지 못하는 것 하나:** `-o`의 **조상**이 파일이면(`-o 파일/하위`) `mkdir`이 여전히
   * `ENOTDIR`을 내고 70으로 나간다. `stat('파일/하위')`가 `ENOTDIR`이라 위 `kind`가
   * 그것을 `null`(*"없다"*)로 접지 않고 올려 보낸다 — 접으면 술어가 거짓말을 한다.
   */
  if ((await io.files.kind(target)) === 'file') {
    throw usageError(`${target} 는 파일입니다. -o 는 디렉터리를 가리켜야 합니다`)
  }

  if (!options.force) {
    const existing = await conflicts(io, target, files)
    if (existing.length > 0) {
      io.err(`${target} 에 이미 파일이 있습니다 (${existing.length}개). --force 로 덮어쓸 수 있습니다`)
      for (const path of existing.slice(0, CONFLICT_LIMIT)) io.err(`  - ${path}`)
      if (existing.length > CONFLICT_LIMIT) io.err(`  … 그리고 ${existing.length - CONFLICT_LIMIT}개 더`)
      return EXIT.usage
    }
  }

  for (const file of files) {
    await io.files.write(join(target, file.path), file.content)
  }

  io.out(`${target} 에 ${files.length}개 파일을 썼습니다`)
  if (format === 'pptx') warnMissingScreens(io, response)
  return EXIT.ok
}

/** 내보내기를 받는다 — 밀려 있다는 503 이면 머리말 «밀려 있으면 몇 번 다시 보낸다»대로 다시 보낸다. */
async function fetchExport(io: Io, server: string, request: ApiRequest): Promise<ApiBytesResponse> {
  for (let retry = 0; ; retry++) {
    try {
      return await callApiBytes(io, server, request)
    } catch (error) {
      const wait = error instanceof CliError && error.status === 503 ? error.retryAfterSeconds : undefined
      if (wait === undefined || wait > EXPORT_BUSY_WAIT_LIMIT_S || retry >= EXPORT_BUSY_RETRIES) throw error
      io.err(`${(error as CliError).message} — ${wait}초 뒤 다시 보냅니다 (${retry + 1}/${EXPORT_BUSY_RETRIES})`)
      await io.sleep(wait * 1000)
    }
  }
}

/**
 * 머리의 수가 0 이 아니면 경고한다 — 머리말 «그림이 빠진 pptx 를 조용히 쓰지 않는다». 머리가 없으면(이 머리를 모르는 서버)
 * 아무 말도 하지 않는다 — 모르는 것을 «0 장»으로 읽지 않는다.
 */
function warnMissingScreens(io: Io, response: ApiBytesResponse): void {
  const count = (name: string): number => {
    const value = response.header(name)
    return value !== null && /^\d+$/.test(value) ? Number(value) : 0
  }
  const failed = count(SCREEN_FAILURES_HEADER)
  const skipped = count(SCREENLESS_HEADER)
  if (failed > 0) {
    io.err(
      `경고: 화면 이미지 ${failed}장을 그리지 못해 그 슬라이드에는 글자만 실렸습니다. 이유는 웹의 내보내기 창에서 PPTX 를 고르면 보입니다`,
    )
  }
  if (skipped > 0) {
    io.err(`경고: 서버가 화면 이미지를 그리지 않아 ${skipped}장이 글자만 실렸습니다`)
  }
}

/**
 * **파일 하나로 오는 형식**(pptx)을 그대로 든다.
 *
 * **이름이 없으면 끊는다.** 코드는 3이다 — 서버가 준 것이 이상한 상태이고 사용자가 자기
 * 리포에서 고칠 것이 없다. **지어낸 이름으로 쓰지 않는다**: 그러면 웹에서 내려받은 파일과
 * 이름이 갈리고, 사람은 그 둘이 같은 산출물인지 알 수 없다.
 */
function singleFile(response: { bytes: Uint8Array; fileName: string | null }): ArchiveFile {
  if (response.fileName === null) {
    throw serverError('서버가 파일 이름을 주지 않았습니다')
  }
  return { path: response.fileName, content: response.bytes }
}

/**
 * `-o` 아래에 쓸 파일 하나. 디렉터리 항목은 안 담는다.
 *
 * **`content`가 바이트도 된다.** pptx 는 바이너리이고, 문자열로 왕복시키면 바이트가
 * 조용히 달라진다.
 */
interface ArchiveFile {
  path: string
  content: string | Uint8Array
}

/**
 * zip을 읽어 **안전한 경로만** 낸다. 하나라도 위험하면 **던진다.**
 *
 * 코드는 3이다: 서버가 준 것이 이상한 상태이고 사용자가 자기 리포에서 고칠 것이 없다.
 */
function readArchive(bytes: Uint8Array): ArchiveFile[] {
  let unzipped: Record<string, Uint8Array>
  try {
    unzipped = unzipSync(bytes)
  } catch (error) {
    throw serverError(`번들 압축을 풀 수 없습니다: ${error instanceof Error ? error.message : String(error)}`)
  }

  const files: ArchiveFile[] = []
  for (const [path, content] of Object.entries(unzipped)) {
    // 디렉터리 항목(`a/b/`)은 담을 것이 없다. 파일을 쓰면 부모가 생긴다.
    if (path.endsWith('/')) continue
    const unsafe = unsafeReason(path)
    if (unsafe !== null) {
      throw serverError(`번들에 안전하지 않은 경로가 있습니다: ${JSON.stringify(path)} (${unsafe})`)
    }
    files.push({ path, content: strFromU8(content) })
  }
  return files
}

/**
 * 그 항목 경로가 `-o` 바깥을 겨누는가. 겨누면 이유를, 아니면 `null`.
 *
 * **정규화한 뒤 판정하지 않는다** — `a/../b`처럼 결과가 안쪽에 떨어지는 것도 거부한다.
 * 우리 서버가 그런 이름을 만들 이유가 없으므로 거부의 대가가 0이고, 정규화 코드를 두면
 * 그 코드가 틀렸을 때 조용히 바깥을 쓴다.
 */
function unsafeReason(path: string): string | null {
  if (path.length === 0) return '빈 경로'
  if (path.startsWith('/')) return '절대 경로'
  // 윈도우 드라이브(`C:`)와 UNC(`\\host`). `paths.ts`가 POSIX만 다루므로 여기서 끊는다.
  if (/^[A-Za-z]:/.test(path)) return '드라이브 경로'
  if (path.includes('\\')) return '역슬래시'
  if (path.split('/').includes('..')) return '상위 디렉터리 참조'
  return null
}

/**
 * 모든 항목이 첫 마디를 공유하면 그 마디를 벗긴다(위 머리말).
 *
 * **하나라도 다르면 아무것도 안 벗긴다** — 어중간하게 벗기면 트리 모양이 바뀐다.
 */
function stripCommonRoot(files: readonly ArchiveFile[]): ArchiveFile[] {
  const first = files[0]?.path.split('/')[0]
  if (first === undefined || first.length === 0) return [...files]
  const shared = files.every((file) => {
    const segments = file.path.split('/')
    return segments.length > 1 && segments[0] === first
  })
  if (!shared) return [...files]
  return files.map((file) => ({ path: file.path.slice(first.length + 1), content: file.content }))
}

/** 이미 있는 파일들. **쓰기 전에 전부 본다** — 절반 쓰고 멈추면 그 디렉터리가 섞인다. */
async function conflicts(io: Io, target: string, files: readonly ArchiveFile[]): Promise<string[]> {
  const found: string[] = []
  for (const file of files) {
    const path = join(target, file.path)
    if ((await io.files.read(path)) !== null) found.push(path)
  }
  return found
}
