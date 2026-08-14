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
 * **탭·개행·복귀(`\t`·`\n`·`\r`)를 뺀 U+0000~U+001F가 날것으로 있으면 안 된다.**
 * 필요하면 이스케이프(`\u0000`)로 적는다 — 값으로 쓰든 산문에서 이름을 부르든 마찬가지다.
 *
 * **걸린 것의 대부분이 *"NUL을 이야기하다 진짜 NUL을 적은"* 부류였다** — 코드가 아니라
 * **말**이다(`0006-themes.ts`의 주석 · `themes-schema.test.ts`의 주석 · P4a-3 보고서와
 * 계획서의 산문). 그래서 분모가 코드에서 멈추면 안 된다: 아래 `EXTENSIONS`가 `.md`를
 * 포함하는 이유이고, **넓히자마자 문서 둘이 걸렸다.**
 *
 * > **이 파일 자신이 첫 손님이었다.** 위 문단에 이스케이프를 적으려다 편집 도구가 그것을
 * > **해석해서** 날바이트를 써 버렸고, 켜자마자 이 검사가 자기 파일을 잡았다. 그러니
 * > *"조심해서 적으면 된다"*는 대책이 아니다 — 손이 아니라 도구가 넣는 경로가 있다.
 *
 * # 분모 — **저장소 루트에서 내려간다**
 *
 * `SKIP_DIRS`(빌드 산출물·남의 코드)를 빼고 루트부터 훑으므로 `packages`·`apps`만이 아니라
 * **`docs/**`와 루트의 `*.md`까지** 들어온다.
 *
 * > **앞 판은 `['packages','apps']`로 좁혀 두고 머리말에는 *"저장소 전체"*라고 적었다** —
 * > 델타 리뷰가 잡았다. 문장이 코드보다 넓었고, 그 차이에 **정확히 이 사고가 가장 잘 나는
 * > 자리**(이월·계획 문서)가 들어 있었다. 문장을 좁히는 대신 **분모를 넓혀** 참으로 만들었다.
 *
 * # 왜 `apps/api/test/`인가
 *
 * 훑는 범위는 저장소 전체인데 파일은 여기 있다. `apps/api`가 이미 `node:fs`로 소스를
 * 훑는 검사 셋을 갖고 있어(`permission-matrix` · `restore-lock-census` ·
 * `write-path-invariant`) 그 관례를 따르는 것이 가장 싸다. 패키지 쪽 테스트 디렉터리에
 * 두면 그 프로젝트가 `apps/`를 들여다보게 되어 의존 방향의 결을 흐린다.
 */
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/** 저장소 루트. 이 파일 기준으로 잡는다 — vitest의 cwd에 묶이지 않는다. */
const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url))

/**
 * 들어가지 않는 디렉터리. 빌드 산출물과 남의 코드는 우리가 고칠 자리가 아니다.
 *
 * **뿌리 목록을 따로 두지 않고 저장소 루트에서 내려간다** — 앞 판은 `['packages','apps']`로
 * 좁혀 두고 머리말에는 *"저장소 전체"*라고 적었다(델타 리뷰가 잡았다). 좁힌 채로 두면
 * **`docs/**`가 안 덮이는데**, 이월과 계획 문서야말로 *"NUL을 이야기하다 진짜 NUL을 적는"*
 * 그 사고가 나는 자리다 — 넓히자마자 그런 문서 둘이 실제로 걸렸다.
 */
const SKIP_DIRS = new Set(['node_modules', 'dist', '.tsbuild', '.worktrees', 'coverage', '.git'])

/**
 * 훑을 확장자. **우리가 손으로 쓰는 글**이 기준이다 — 소스·케이스·스타일·문서.
 *
 * `.json`을 넣지 않는다: 거기 NUL이 들어가면 `JSON.parse`가 **큰 소리로** 죽으므로 조용한
 * 거짓 음성이 되지 않는다. 이 검사가 막는 것은 **조용한 쪽**이다.
 */
const EXTENSIONS = ['.ts', '.tsx', '.css', '.md']

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
    const rel = prefix === '' ? entry.name : `${prefix}/${entry.name}`
    const full = join(dir, entry.name)
    if (entry.isDirectory()) return sourceFilesUnder(full, rel)
    if (!entry.isFile()) return []
    return EXTENSIONS.some((ext) => entry.name.endsWith(ext)) ? [rel] : []
  })
}

function allSources(): string[] {
  return sourceFilesUnder(REPO_ROOT, '')
}

/**
 * 바이트 뭉치가 든 날 제어 바이트를 코드로 낸다. 없으면 빈 배열이다.
 *
 * **판정을 파일 읽기에서 갈라 둔 것이 요점이다(델타 리뷰 (1)).** 앞 판은 이것이
 * `controlBytesIn` 안에 붙어 있어 **구분력 케이스가 같은 로직을 베껴** 잴 수밖에 없었고,
 * 그래서 진짜 함수를 무력화해도 **0 사망**이었다 — 케이스가 구현과 다른 것을 재고 있었다.
 * (M14의 거울상이다: 그때는 같은 함수를 불러 **함께 움직여서** 못 쟀고, 이번은 **안 불러서**
 * 안 움직였다.)
 */
function controlBytesOf(bytes: Uint8Array): string[] {
  const found = new Set<string>()
  for (const byte of bytes) {
    if (byte < 0x20 && !ALLOWED.has(byte)) found.add(`0x${byte.toString(16).padStart(2, '0')}`)
  }
  return [...found].sort()
}

/** 그 파일이 든 날 제어 바이트. 읽기만 더한 껍데기다. */
function controlBytesIn(relative: string): string[] {
  return controlBytesOf(readFileSync(join(REPO_ROOT, relative)))
}

describe('소스에 날 제어 바이트가 없다', () => {
  it('훑을 소스를 실제로 읽는다', () => {
    // **분모가 비면 아래가 공허하게 통과한다** — 이 저장소가 세 번 겪은 사고다.
    const files = allSources()
    expect(files.length).toBeGreaterThan(100)
    // **넓힌 분모가 실제로 넓은지 본다**(델타 리뷰 (3)). 머리말이 *"저장소 전체"*라고 적는
    // 근거가 이 네 줄이고, 뿌리를 다시 좁히면 여기가 먼저 죽는다.
    expect(files.some((path) => path.startsWith('packages/'))).toBe(true)
    expect(files.some((path) => path.startsWith('apps/'))).toBe(true)
    expect(files.some((path) => path.startsWith('docs/'))).toBe(true)
    expect(files.some((path) => path.endsWith('.tsx'))).toBe(true)
    expect(files.some((path) => path.endsWith('.md'))).toBe(true)
    expect(readFileSync(join(REPO_ROOT, files[0] as string)).length).toBeGreaterThan(0)
  })

  it('제어 바이트가 든 파일이 하나도 없다', () => {
    const offenders = allSources()
      .map((path) => ({ path, bytes: controlBytesIn(path) }))
      .filter((entry) => entry.bytes.length > 0)
      .map((entry) => `${entry.path} ${entry.bytes.join(',')}`)

    expect(offenders).toEqual([])
  })

  /**
   * **판정 함수를 직접 부른다(델타 리뷰 (1)).** 앞 판은 여기서 같은 로직을 **베껴** 재서,
   * 진짜 함수를 무력화해도 아무것도 죽지 않았다 — 케이스가 구현이 아니라 자기 사본을
   * 재고 있었다.
   *
   * **파일에 심지 않는다.** 그러면 이 파일 자신이 위 census에 걸려 두 케이스가 한꺼번에
   * 죽고 무엇이 잡았는지 갈리지 않는다. 그래서 판정 쪽(`controlBytesOf`)에는 **바이트를
   * 직접** 넣고, 읽기까지 도는 것은 **census 밖의 임시 파일**로 잰다(아래).
   */
  it('심으면 잡는다 — 판정 함수를 직접 부른다', () => {
    const clean = Buffer.from('const a = 1\n\tconst b = 2\r\n')

    expect(controlBytesOf(clean)).toEqual([])
    // 탭·개행·복귀는 통과하고 나머지는 코드까지 낸다.
    expect(controlBytesOf(Buffer.from([...clean, 0x00]))).toEqual(['0x00'])
    expect(controlBytesOf(Buffer.from([...clean, 0x1f, 0x00]))).toEqual(['0x00', '0x1f'])
  })

  /**
   * **읽기까지 도는 껍데기도 잰다.** `controlBytesOf`만 재면 *"파일을 읽어 그 판정에
   * 넘긴다"*는 절반이 빈다 — 경로를 잘못 잇거나 읽기를 빠뜨려도 위 케이스는 초록이다.
   *
   * **census가 훑지 않는 자리에 심는다.** 확장자를 목록 밖(`.probe`)으로 두면 census의
   * 분모에 들어가지 않으므로 이 파일이 도는 동안 `제어 바이트가 든 파일이 하나도 없다`가
   * 함께 죽지 않는다. `finally`에서 지운다.
   */
  it('파일을 읽어 그 판정에 넘긴다 — 껍데기의 구분력', () => {
    const relative = 'control-byte-probe.probe'
    const full = join(REPO_ROOT, relative)
    try {
      writeFileSync(full, Buffer.from([0x61, 0x1f, 0x0a]))
      expect(controlBytesIn(relative)).toEqual(['0x1f'])

      writeFileSync(full, Buffer.from('깨끗하다\n', 'utf8'))
      expect(controlBytesIn(relative)).toEqual([])
    } finally {
      rmSync(full, { force: true })
    }
    // 심은 파일이 남지 않는다 — 남으면 다음 실행의 census가 그것을 본다.
    expect(existsSync(full)).toBe(false)
  })
})
