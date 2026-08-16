/**
 * `wireb export --format html -o <dir>` — §12.3의 *"정적 번들 생성"*.
 *
 * ---
 *
 * # 서버가 만든 zip을 받아 푼다 — 번들을 다시 만들지 않는다 (D9)
 *
 * `exportBundle`이 순수해서 CLI가 번들을 만들 수는 있다. 그러면 **입력을 조립하는 자리가
 * 둘이 되고**(`apps/api`의 `exportProjectBundle`과 여기) 웹의 내려받기와 CLI의 결과가
 * 갈릴 수 있다. 서버가 만든 것을 그대로 받으면 **같은 바이트**다.
 *
 * # `fflate`를 들인다 — D10의 완화 (근거를 적는다)
 *
 * P9-2가 *"CLI는 런타임 의존을 새로 들이지 않는다"*를 정했다. 여기서 완화한다:
 *
 * - **새로 고르는 것이 아니라 이미 고른 것을 같은 이유로 다시 쓴다.** `apps/api`가 zip을
 *   만들 때 이것을 골랐고(`services/export-zip.ts`), 그 파일 머리말이 *"P9의 CLI가 같은
 *   번들을 파일로 쓸 때 같은 것을 쓸 수 있다"*고 **예고해 두었다.**
 * - **전이 의존이 0이다**(쟀다: `fflate@0.8.3`의 `dependencies`가 `{}`다).
 * - 대안은 `node:zlib`으로 zip 컨테이너를 손으로 파싱하는 것인데, 그것은 `node:*`를
 *   `node-io.ts` 밖에서 부르는 일이라 D9가 막는다.
 *
 * # 압축 안의 경로를 믿지 않는다
 *
 * 오늘 그 zip은 우리 서버가 만들지만 **이 명령은 *"서버가 준 archive를 사용자의 파일
 * 시스템에 푸는 도구"*다.** 그 부류가 오래 겪어 온 사고가 zip-slip이고, `..`나 절대
 * 경로가 든 항목 하나면 `-o` 바깥이 덮인다. **거부하고 멈춘다** — 걸러 내고 나머지를 풀면
 * 사람은 *"다 풀렸다"*고 읽는다.
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
import { callApiBytes } from '../client'
import { EXIT, serverError, usageError } from '../exit'
import type { Io } from '../io'
import { join, resolveFrom } from '../paths'
import { requireProject } from '../project'

/** `--format`이 받는 값. **`html`만이다** — 다른 것은 P10이 그 자리를 쓴다. */
export const EXPORT_FORMATS = ['html'] as const

export interface ExportOptions {
  format: string | undefined
  out: string | undefined
  force: boolean
}

/** 이미 있는 파일을 몇 개까지 이름으로 보일지. */
const CONFLICT_LIMIT = 5

export async function runExport(io: Io, options: ExportOptions): Promise<number> {
  const format = options.format ?? EXPORT_FORMATS[0]
  if (!(EXPORT_FORMATS as readonly string[]).includes(format)) {
    throw usageError(`--format 은 ${EXPORT_FORMATS.join(' 또는 ')} 입니다: ${format}`)
  }
  if (options.out === undefined || options.out.trim().length === 0) {
    throw usageError('풀어 놓을 디렉터리를 주세요: wireb export --format html -o <dir>')
  }

  const access = await requireProject(io)
  const response = await callApiBytes(io, access.binding.server, {
    method: 'GET',
    path: `/api/projects/${access.binding.projectId}/export`,
    token: access.token,
  })

  const entries = readArchive(response.bytes)
  const files = stripCommonRoot(entries)
  if (files.length === 0) throw serverError('번들이 비어 있습니다')

  // **사람이 친 경로는 사람이 서 있는 곳에서 읽힌다**(`pull`과 같은 규칙).
  const target = resolveFrom(io.cwd, options.out.trim())

  /**
   * **`-o`가 파일을 가리키면 여기서 끊는다**(리뷰 N6).
   *
   * 안 끊으면 `mkdir`이 `ENOTDIR`로 던지고 `run.ts`의 마지막 갈래가 그것을 **70**
   * (*"버그다 — 사용자가 고칠 수 없다"*)으로 낸다. **사람이 할 일은 `-o` 한 글자를
   * 고치는 것**이므로 `exit.ts`의 표대로면 그 자리는 1이다.
   *
   * **P9-2의 `a3c6d12`와 같은 부류다** — 헤더에 실을 수 없는 자격을 `fetch`가 던지게 두어
   * *"서버에 연결할 수 없습니다"*(4)로 나가던 것을 **보내기 전에** 보고 2로 끊은 그 고침.
   * 여기서도 **쓰기 전에** 본다.
   *
   * **`--force`보다 앞이다.** `--force`는 *"덮어써도 된다"*이지 *"파일을 디렉터리로
   * 만들어도 된다"*가 아니다 — 그쪽도 같은 `ENOTDIR`로 죽는다.
   *
   * **덮지 못하는 것 하나:** `-o`의 **조상**이 파일이면(`-o 파일/하위`) `mkdir`이 여전히
   * `ENOTDIR`을 내고 70으로 나간다. 실측: `stat('파일/하위')`가 `ENOTDIR`이라 위 `kind`가
   * 그것을 `null`(*"없다"*)로 접지 않고 올려 보낸다 — 접으면 술어가 거짓말을 한다.
   * 이월에 적었다.
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
  return EXIT.ok
}

/** 압축 안의 파일 하나. 디렉터리 항목은 안 담는다. */
interface ArchiveFile {
  path: string
  content: string
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
