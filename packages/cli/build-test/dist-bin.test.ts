/**
 * **`wireb`가 실제로 서는가**(D11).
 *
 * `pnpm test`는 소스를 alias로 보므로 **`dist`가 깨져도 초록이다.** shebang·실행 권한·
 * `bin` 필드·확장자는 **빌드 결과물에서만** 드러난다 — `packages/exporter/build-test/`가
 * 같은 이유로 생긴 자리이고(*"받는 쪽이 받는 글자"*), 여기가 그 둘째다.
 *
 * ---
 *
 * # 무엇이 여기서만 잡히나 — 쟀다 (계획서 재라 #5)
 *
 * 계획서는 *"`tsdown`이 shebang과 `bin`을 다룰 수 있다"*를 **안 재고 썼다**(exporter가 그것을
 * 한 적이 없다). 실측:
 *
 * | 물음 | 값 |
 * |---|---|
 * | shebang을 산출물의 첫 줄로 옮기는가 | **그렇다** — 글자 그대로 |
 * | 실행 권한을 주는가 | **그렇다** — `bin` 필드를 지워도 준다(판단의 근거가 shebang이다) |
 * | `bin` 필드가 가리키는 이름으로 내는가 | **아니다** — 기본값이면 `.mjs`가 나온다 |
 *
 * 셋째 줄이 이 파일의 존재 이유다. `tsdown.config.ts`의 `fixedExtension: false`가 그것을
 * 끄는데, **그 한 줄을 지워도 `pnpm test`는 전부 초록이다.**
 *
 * `pnpm test`에는 안 들어간다(`--project '!build'`). `pnpm test:build`가 돌린다.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { accessSync, constants, existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'

// vitest의 cwd는 루트 설정이 사는 저장소 뿌리다(exporter의 같은 자리와 같은 근거).
const repoRoot = process.cwd()
const packageRoot = resolve(repoRoot, 'packages/cli')
const manifest = JSON.parse(readFileSync(resolve(packageRoot, 'package.json'), 'utf8')) as {
  bin: Record<string, string>
}
/** **`package.json`이 가리키는 자리를 쓴다** — 여기 경로를 베끼면 그 사본이 진짜와 갈린다. */
const binPath = resolve(packageRoot, manifest.bin.wireb ?? '')

beforeAll(() => {
  execFileSync('pnpm', ['--filter', './packages/*', '-r', 'build'], { cwd: repoRoot, stdio: 'pipe' })
}, 300_000)

/** 빌드된 `wireb`를 그대로 돌린다. **소스가 아니라 산출물이다.** */
function runBin(args: string[]): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [binPath, ...args], { encoding: 'utf8', cwd: repoRoot })
  return { status: result.status, stdout: result.stdout, stderr: result.stderr }
}

describe('빌드된 wireb', () => {
  it('`bin`이 가리키는 파일이 실재한다 — 확장자가 어긋나면 여기서 죽는다', () => {
    expect(manifest.bin.wireb).toBe('./dist/bin.js')
    expect(existsSync(binPath), binPath).toBe(true)
    // 기본값(`fixedExtension`)이면 이쪽이 생긴다. **둘 다 확인해야** 어긋남이 드러난다.
    expect(existsSync(resolve(packageRoot, 'dist/bin.mjs'))).toBe(false)
  })

  it('첫 줄이 shebang이다', () => {
    expect(readFileSync(binPath, 'utf8').split('\n')[0]).toBe('#!/usr/bin/env node')
  })

  it('실행 권한이 있다', () => {
    expect(() => accessSync(binPath, constants.X_OK)).not.toThrow()
  })

  it('소스가 아니라 번들이다 — 카나리아', () => {
    const text = readFileSync(binPath, 'utf8')
    expect(text.length).toBeGreaterThan(200)
    expect(text).not.toContain("from './node-io'")
  })

  it('인자 없이 부르면 쓰임말이 stderr에 나오고 코드가 1이다', () => {
    const result = runBin([])

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('사용법: wireb <명령>')
    expect(result.stdout).toBe('')
  })

  it('--help 는 stdout이고 코드가 0이다', () => {
    const result = runBin(['--help'])

    expect(result.status).toBe(0)
    expect(result.stdout).toContain('사용법: wireb <명령>')
    expect(result.stderr).toBe('')
  })

  it('모르는 명령은 1이다', () => {
    const result = runBin(['nope'])

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('모르는 명령입니다: nope')
  })

  /** **D7이 실제 프로세스에서도 서는지.** 소스에서 재는 것과 여기서 재는 것이 갈릴 수 있다. */
  it('--password 는 인식할 수 없는 옵션이다 (D7)', () => {
    const result = runBin(['login', '--email', 'a@example.com', '--password', 'pw'])

    expect(result.status).toBe(1)
    expect(result.stderr).toContain("Unknown option '--password'")
  })

  /**
   * **한국어가 그대로 나온다.** 번들러가 인코딩을 건드리면 여기서 드러난다 — 위 케이스들이
   * 전부 한국어를 보므로 이미 걸리지만, 그 명제를 이름으로 남겨 둔다.
   */
  it('출력에 날 제어 바이트가 없다', () => {
    const result = runBin(['--help'])
    expect(CONTROL_BYTES.test(result.stdout)).toBe(false)
    // 분모가 0이면 위가 공허하다 — 실제로 한국어가 나왔는가.
    expect(result.stdout).toContain('설계서')
  })
})

/** 날 제어 바이트. **소스에 날로 적지 않는다** — exporter의 build-test와 같은 규칙이다. */
const CONTROL_BYTES = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u
