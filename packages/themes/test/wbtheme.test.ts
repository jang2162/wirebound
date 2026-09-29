import { strToU8, zipSync } from 'fflate'
import { beforeAll, describe, expect, it } from 'vitest'
import { installCatalog } from '@wirebound/schema'
import { packWbtheme, readWbtheme, WBTHEME_LIMITS } from '@wirebound/themes'

beforeAll(() => installCatalog())
const MANIFEST = { id: 'acme', name: 'ACME', version: '1.0.0', sdk: '^1.0.0', tokens: { items: {} } }
const zip = (files: Record<string, Uint8Array>) => zipSync(files)
const base = () => ({ 'manifest.json': strToU8(JSON.stringify(MANIFEST)), 'theme.js': strToU8(';(()=>{})()') })
const codes = (b: Uint8Array) => readWbtheme(b).issues.map((i) => i.code)

describe('readWbtheme', () => {
  it('pack 한 것을 그대로 읽는다', () => {
    const assets = new Map([['assets/logo.svg', strToU8('<svg/>')]])
    const bytes = packWbtheme({ manifest: MANIFEST as never, themeJs: 'x', themeCss: 'a{}', assets })
    const { files, issues } = readWbtheme(bytes)
    expect(issues).toEqual([])
    expect(files!.themeJs).toBe('x')
    expect(files!.themeCss).toBe('a{}')
    expect([...files!.assets.keys()]).toEqual(['assets/logo.svg'])
  })

  it('같은 입력이면 같은 바이트 — 다시 빌드한 시스템 테마의 sha256 이 안 바뀐다', () => {
    const input = () => ({ manifest: MANIFEST as never, themeJs: 'x', assets: new Map([['assets/b.svg', strToU8('b')], ['assets/a.svg', strToU8('a')]]) })
    const first = packWbtheme(input())
    const assets = new Map([...input().assets].reverse())
    expect(packWbtheme({ ...input(), assets })).toEqual(first)
  })

  it.each([
    ['../ 경로', 'bad-path', { '../evil.js': strToU8('x') }],
    ['절대 경로', 'bad-path', { '/etc/x': strToU8('x') }],
    ['허용 밖 파일', 'not-allowed', { 'run.exe': strToU8('x') }],
    ['node_modules 아래', 'not-allowed', { 'node_modules/react/index.js': strToU8('x') }],
    ['assets 의 허용 밖 확장자', 'not-allowed', { 'assets/a.js': strToU8('x') }],
  ])('%s → %s', (_l, code, extra) => {
    expect(codes(zip({ ...base(), ...extra }))).toContain(code)
  })

  /**
   * 대소문자 · 유니코드 정규화만 다른 두 항목은 대소문자를 무시하는 파일시스템(macOS 기본)에 풀면 한 파일이 된다 — 뒤의 것이 앞의 것을
   * 덮어 자산 하나가 조용히 사라진다(`wireb export` 로 받은 번들을 풀 때). 한글 이름은 NFC · NFD 둘로 적힐 수 있다.
   */
  it.each([
    ['대소문자만 다름', 'assets/Case.png', 'assets/case.png'],
    ['디렉터리의 대소문자만 다름', 'assets/Img/a.png', 'assets/img/a.png'],
    ['NFC · NFD 만 다름', 'assets/한글.png', 'assets/한글.png'.normalize('NFD')],
  ])('%s — 두 번째 항목을 bad-path 로 거절한다', (_l, first, second) => {
    expect(first).not.toBe(second)
    const { files, issues } = readWbtheme(zip({ ...base(), [first]: strToU8('a'), [second]: strToU8('b') }))
    expect(files).toBeNull()
    expect(issues.map((i) => [i.code, i.path])).toEqual([['bad-path', second]])
  })

  it('심볼릭 링크 항목을 거절한다', () => {
    // 외부 속성의 위 16 비트가 유닉스 파일 모드다 — 0o120000 이 링크. fflate 가 `os: 3` · `attrs` 로 그 값을 쓴다.
    const link: [Uint8Array, { os: number; attrs: number }] = [strToU8('/etc/passwd'), { os: 3, attrs: (0o120777 << 16) >>> 0 }]
    const r = readWbtheme(zipSync({ ...base(), 'assets/logo.svg': link }))
    expect(r.files).toBeNull()
    expect(r.issues.map((i) => [i.code, i.path])).toContainEqual(['symlink', 'assets/logo.svg'])
  })

  it('manifest 가 없으면', () => expect(codes(zip({ 'theme.js': strToU8('x') }))).toContain('missing-manifest'))
  it('theme.js 가 없으면', () => expect(codes(zip({ 'manifest.json': strToU8(JSON.stringify(MANIFEST)) }))).toContain('missing-theme-js'))
  it('manifest 가 JSON 이 아니면', () => expect(codes(zip({ ...base(), 'manifest.json': strToU8('{') }))).toContain('bad-json'))
  it('manifest 검증 이슈를 싸서 낸다', () => {
    const r = readWbtheme(zip({ ...base(), 'manifest.json': strToU8(JSON.stringify({ ...MANIFEST, version: 'x' })) }))
    expect(r.issues.map((i) => [i.code, i.manifestCode])).toContainEqual(['manifest', 'bad-version'])
  })
  it('zip 이 아니면', () => expect(codes(strToU8('not a zip'))).toContain('bad-zip'))

  it('zip 크기 상한', () => {
    expect(codes(new Uint8Array(WBTHEME_LIMITS.zipBytes + 1))).toEqual(['too-large'])
  })

  it('풀린 크기가 상한을 넘으면 풀기 전에 거절한다', () => {
    // 같은 글자만 든 큰 파일은 작게 압축된다 — zip 크기는 상한 안, 풀린 크기는 밖.
    const big = new Uint8Array(WBTHEME_LIMITS.unzippedBytes + 1)
    const bytes = zipSync({ ...base(), 'assets/big.png': big }, { level: 9 })
    expect(bytes.length).toBeLessThan(WBTHEME_LIMITS.zipBytes)
    expect(codes(bytes)).toContain('unzipped-too-large')
  })

  it('항목 수 상한', () => {
    const many: Record<string, Uint8Array> = base()
    for (let i = 0; i < WBTHEME_LIMITS.entries; i++) many[`assets/${i}.png`] = strToU8('x')
    expect(codes(zip(many))).toContain('too-many-entries')
  })
})
