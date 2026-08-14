/**
 * **소스에 날 제어 바이트가 들어 있으면 `grep`이 그 파일을 조용히 건너뛴다.**
 *
 * # 왜 이 파일이 생겼나 — 이 슬라이스에서 실제로 당했다
 *
 * P7-3이 `packages/schema/src/page-json/envelope.ts`의 정규식에 **NUL(U+0000)과 U+001F를
 * 날바이트로** 적어 커밋했다(`[…|.<제어 바이트 둘>]`를 이스케이프 없이 썼다). 동작은 옳았지만
 * `file`이 그 파일을 `data`로 보고 **`grep -n "COMMENT_BODY_MAX_LENGTH"`가 아무것도 내지
 * 않았다** — 그 상수가 거기 네 번 나오는데도 그렇다(python으로 읽으면 나온다).
 *
 * **그래서 무엇이 위험한가.** 이 저장소는 *"수를 산문에 적지 말고 세는 것을 실행으로
 * 옮겨라"*를 반복해 골랐고, 그 검사들과 사람·에이전트의 확인이 **전부 소스를 훑는다.**
 * 훑는 도구가 `grep`이면 제어 바이트가 든 파일에 대해서만 **거짓 음성**이 된다 —
 * *"그런 호출은 없다"*·*"그 상수를 쓰는 자리가 없다"*가 조용히 참처럼 보인다.
 *
 * > **`node:fs`로 읽는 검사는 안 속는다** — `readFileSync(…, 'utf8')`은 제어 문자를 그냥
 * > 문자로 돌려주고 정규식도 정상으로 돈다. 그러니 이 검사가 지키는 것은 **테스트가 아니라
 * > 사람과 CLI**다. 그 구별을 적어 두는 이유는, 이것을 *"census를 지킨다"*로 읽으면 범위를
 * > 잘못 넓히게 되기 때문이다.
 *
 * # 무엇을 재나
 *
 * **탭·개행·복귀(`\t`·`\n`·`\r`)를 뺀 U+0000~U+001F가 소스 파일에 날것으로 있으면 안 된다.**
 * 필요하면 이스케이프(`\u0000`)로 적는다 — 값으로 쓰든 산문에서 이름을 부르든 마찬가지다.
 * 이 검사를 켜면서 걸린 파일들 중 **주석 안에서 NUL을 이야기하다 진짜 NUL을 적은** 것이
 * 둘이었다(`0006-themes.ts` · `themes-schema.test.ts`). 값이 아니라 **말**이었다는 것이
 * 이 부류의 모양이다.
 *
 * > **이 파일 자신이 첫 손님이었다.** 위 문단에 이스케이프를 적으려다 편집 도구가 그것을
 * > **해석해서** 날바이트를 써 버렸고, 켜자마자 이 검사가 자기 파일을 잡았다. 그러니
 * > *"조심해서 적으면 된다"*는 대책이 아니다 — 손이 아니라 도구가 넣는 경로가 있다.
 *
 * # 왜 `apps/api/test/`인가
 *
 * 훑는 범위는 **저장소 전체**인데 파일은 여기 있다. `apps/api`가 이미 `node:fs`로 소스를
 * 훑는 검사 셋을 갖고 있어(`permission-matrix` · `restore-lock-census` ·
 * `write-path-invariant`) 그 관례를 따르는 것이 가장 싸다. 패키지 쪽 테스트 디렉터리에
 * 두면 그 프로젝트가 `apps/`를 들여다보게 되어 의존 방향의 결을 흐린다.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/** 저장소 루트. 이 파일 기준으로 잡는다 — vitest의 cwd에 묶이지 않는다. */
const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url))

/** 훑을 뿌리. 소스와 케이스 둘 다 본다 — 케이스도 사람이 `grep`으로 확인하는 대상이다. */
const ROOTS = ['packages', 'apps']

/** 들어가지 않는 디렉터리. 빌드 산출물과 남의 코드는 우리가 고칠 자리가 아니다. */
const SKIP_DIRS = new Set(['node_modules', 'dist', '.tsbuild', '.worktrees', 'coverage', '.git'])

const EXTENSIONS = ['.ts', '.tsx', '.css']

/** 소스에 있어도 되는 제어 문자. 탭·개행·복귀뿐이다. */
const ALLOWED = new Set([0x09, 0x0a, 0x0d])

function sourceFilesUnder(dir: string, prefix: string): string[] {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return []
  }
  return entries.flatMap((entry) => {
    if (SKIP_DIRS.has(entry.name)) return []
    const rel = `${prefix}/${entry.name}`
    const full = join(dir, entry.name)
    if (entry.isDirectory()) return sourceFilesUnder(full, rel)
    if (!entry.isFile()) return []
    return EXTENSIONS.some((ext) => entry.name.endsWith(ext)) ? [rel] : []
  })
}

function allSources(): string[] {
  return ROOTS.flatMap((root) => sourceFilesUnder(join(REPO_ROOT, root), root))
}

/** 그 파일이 든 날 제어 바이트를 코드로 낸다. 없으면 빈 배열이다. */
function controlBytesIn(relative: string): string[] {
  const bytes = readFileSync(join(REPO_ROOT, relative))
  const found = new Set<string>()
  for (const byte of bytes) {
    if (byte < 0x20 && !ALLOWED.has(byte)) found.add(`0x${byte.toString(16).padStart(2, '0')}`)
  }
  return [...found].sort()
}

describe('소스에 날 제어 바이트가 없다', () => {
  it('훑을 소스를 실제로 읽는다', () => {
    // **분모가 비면 아래가 공허하게 통과한다** — 이 저장소가 세 번 겪은 사고다.
    const files = allSources()
    expect(files.length).toBeGreaterThan(100)
    expect(files.some((path) => path.endsWith('.tsx'))).toBe(true)
    expect(files.some((path) => path.startsWith('packages/'))).toBe(true)
    expect(readFileSync(join(REPO_ROOT, files[0] as string)).length).toBeGreaterThan(0)
  })

  it('제어 바이트가 든 파일이 하나도 없다', () => {
    const offenders = allSources()
      .map((path) => ({ path, bytes: controlBytesIn(path) }))
      .filter((entry) => entry.bytes.length > 0)
      .map((entry) => `${entry.path} ${entry.bytes.join(',')}`)

    expect(offenders).toEqual([])
  })

  it('심으면 잡는다 — 검사의 구분력', () => {
    // **파일에 심지 않는다.** 그러면 이 파일 자신이 위 검사에 걸려 두 케이스가 한꺼번에
    // 죽고, 무엇이 잡았는지 갈리지 않는다. 판정 함수에 바이트를 직접 넣어 잰다.
    const clean = Buffer.from('const a = 1\n\tconst b = 2\r\n')
    const dirty = Buffer.from([...clean, 0x00])

    const codesOf = (buffer: Buffer): string[] =>
      [...new Set([...buffer].filter((byte) => byte < 0x20 && !ALLOWED.has(byte)))].map(
        (byte) => `0x${byte.toString(16).padStart(2, '0')}`,
      )

    expect(codesOf(clean)).toEqual([])
    expect(codesOf(dirty)).toEqual(['0x00'])
  })
})
