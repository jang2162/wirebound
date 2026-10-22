import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { installCatalog } from '@wirebound/schema'
import { readWbtheme } from '@wirebound/themes'
import { buildTheme, BuildError } from '@wirebound/theme-kit'

const FIXTURE = new URL('./fixtures/sample-theme/', import.meta.url).pathname
/**
 * 복사본을 kit 패키지 안(`.tmp/`)에 둔다 — 설치한 작성자 프로젝트처럼 `@wirebound/theme-sdk` 가 `node_modules` 로 풀리는
 * 자리여야 «SDK 를 밖으로 뺐는가» 를 값으로 잰다. `os.tmpdir()` 에 두면 SDK 를 못 풀어, 밖으로 안 뺀 빌드도 값이 아니라
 * 해석 실패로 죽는다.
 */
const TMP = new URL('../.tmp/', import.meta.url).pathname
beforeAll(() => {
  installCatalog()
  mkdirSync(TMP, { recursive: true })
})
afterAll(() => rmSync(TMP, { recursive: true, force: true }))

function copyFixture(): string {
  const dir = mkdtempSync(join(TMP, 'wb-kit-'))
  cpSync(FIXTURE, dir, { recursive: true })
  return dir
}

describe('buildTheme', () => {
  it('검증된 .wbtheme 를 <id>-<version>.wbtheme 로 낸다', async () => {
    const root = copyFixture()
    const r = await buildTheme({ root })
    expect(r.file.endsWith('dist/sample-1.0.0.wbtheme')).toBe(true)
    const { files, issues } = readWbtheme(new Uint8Array(readFileSync(r.file)))
    expect(issues).toEqual([])
    expect(files!.manifest.id).toBe('sample')
    expect(files!.themeCss).toContain('.sample-card')
    expect([...files!.assets.keys()].some((k) => k.startsWith('assets/') && k.endsWith('.svg'))).toBe(true)
  }, 60_000)

  it('CSS 의 자산 url 은 패키지 안 assets/ 상대 경로다 — 호스트가 한 디렉터리처럼 내준다', async () => {
    const { file } = await buildTheme({ root: copyFixture() })
    const { files } = readWbtheme(new Uint8Array(readFileSync(file)))
    const url = /url\((?:\.\/)?(assets\/dot-[\w-]+\.svg)\)/.exec(files!.themeCss!)
    expect(url, files!.themeCss!).not.toBeNull()
    expect(files!.assets.has(url![1]!)).toBe(true)
  }, 60_000)

  it('theme.js 는 일반 스크립트이고 import 가 없다 — 공유 런타임 전역만 읽는다', async () => {
    const { file } = await buildTheme({ root: copyFixture() })
    const js = readWbtheme(new Uint8Array(readFileSync(file))).files!.themeJs
    expect(js).not.toMatch(/^\s*import\s/m)
    expect(js).not.toMatch(/\bexport\s/)
    expect(js).toContain('__wirebound_runtime__')
  }, 60_000)

  it('빌드한 theme.js 에 theme-sdk · react 가 묶이지 않는다', async () => {
    const { file } = await buildTheme({ root: copyFixture() })
    const js = readWbtheme(new Uint8Array(readFileSync(file))).files!.themeJs
    expect(js).not.toContain('Root 는 뷰 안에서만') // theme-sdk 소스의 문장
    expect(js).not.toContain('react.production') // react 번들의 흔적
    expect(js.length).toBeLessThan(20_000)
  }, 60_000)

  it('NODE_ENV 가 production 이 아닌 셸에서 지어도 운영 JSX 다 — 운영 호스트의 React 에서 뷰가 안 던진다', async () => {
    // 판 카나리아 — vitest 는 `NODE_ENV=test` 로 돈다. vite 는 이미 선 NODE_ENV 를 안 덮어 이 판이 개발 빌드로 간다.
    expect(process.env.NODE_ENV).not.toBe('production')
    const { file } = await buildTheme({ root: copyFixture() })
    const js = readWbtheme(new Uint8Array(readFileSync(file))).files!.themeJs
    // 개발 JSX(`jsxDEV`)는 개발 React 의 내부(`getOwner`)를 불러 운영 호스트에서 «e.getOwner is not a function» 으로 던진다.
    expect({ jsxDEV: js.includes('jsxDEV'), runtime: js.includes('.jsxRuntime') }).toEqual({ jsxDEV: false, runtime: true })
  }, 60_000)

  it('manifest 가 틀리면 이유를 항목별로 던지고 파일을 만들지 않는다', async () => {
    const root = copyFixture()
    writeFileSync(
      join(root, 'theme.config.ts'),
      readFileSync(join(root, 'theme.config.ts'), 'utf8').replace("version: '1.0.0'", "version: '1.0'"),
    )
    const error = await buildTheme({ root }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(BuildError)
    expect((error as BuildError).issues.map((i) => i.code)).toContain('bad-version')
    expect(existsSync(join(root, 'dist'))).toBe(false)
  }, 60_000)

  it('patterns 를 실은 manifest 는 까닭을 말하며 거절하고 파일을 만들지 않는다', async () => {
    const root = copyFixture()
    const patterns = "patterns: { 'content.plain': { name: '글', schema: { type: 'Text', props: { content: '글' } } } },"
    writeFileSync(
      join(root, 'theme.config.ts'),
      readFileSync(join(root, 'theme.config.ts'), 'utf8').replace("sdk: '^1.0.0',", `sdk: '^1.0.0',\n  ${patterns}`),
    )
    const error = await buildTheme({ root }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(BuildError)
    expect((error as BuildError).issues.map((i) => [i.code, i.path])).toEqual([['shape', 'patterns']])
    expect((error as BuildError).issues[0]!.message).toContain('patterns 는 더 지원하지 않습니다')
    expect(existsSync(join(root, 'dist'))).toBe(false)
  }, 60_000)
})
