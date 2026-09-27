import type { ThemeManifest } from '@wirebound/theme-sdk'
import { strFromU8, unzipSync } from 'fflate'
import type { ManifestIssueCode } from '../manifest/schema'
import { validateManifest } from '../manifest/schema'

/** spec 「업로드 · 버전 · 인스턴스 관리자」의 «저장» 이 정한 상한 — 압축 10 MB · 풀었을 때 50 MB · 항목 500. */
export const WBTHEME_LIMITS = { zipBytes: 10_485_760, unzippedBytes: 52_428_800, entries: 500 } as const

export type WbthemeIssueCode =
  | 'too-large' | 'too-many-entries' | 'unzipped-too-large' | 'bad-path' | 'not-allowed' | 'symlink'
  | 'missing-manifest' | 'missing-theme-js' | 'bad-json' | 'manifest' | 'bad-zip'

export interface WbthemeIssue {
  code: WbthemeIssueCode
  /** zip 안의 항목 경로. `manifest` 이슈면 manifest 안의 자리(`manifest.json:components.List`). */
  path: string
  message: string
  /** `code` 가 `manifest` 일 때 `validateManifest` 가 낸 코드 — 업로드 화면이 사유를 항목별로 가른다. */
  manifestCode?: ManifestIssueCode
}

export interface WbthemeFiles {
  manifest: ThemeManifest
  themeJs: string
  themeCss: string | null
  assets: ReadonlyMap<string, Uint8Array>
}

const ROOT_FILES = new Set(['manifest.json', 'theme.js', 'theme.css'])
const ASSET_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'woff', 'woff2', 'ttf', 'otf'])
const S_IFMT = 0o170000
const S_IFLNK = 0o120000

interface CentralEntry {
  name: string
  originalSize: number
  /** 외부 속성의 위 16 비트 — 유닉스에서 만든 zip 이면 파일 모드다. */
  mode: number
}

/**
 * `.wbtheme` 를 읽고 검증한다(spec 「업로드 검증」의 1 ~ 3). 이슈가 하나라도 있으면 `files` 는 `null` 이다.
 *
 * **크기 · 항목 수 · 경로 · 허용 목록 · 링크는 풀기 전에 중앙 디렉터리만 읽어 본다.** 풀린 바이트를 만든 뒤 세면 zip
 * 폭탄을 이미 펼친 것이다. fflate 의 `unzipSync` 는 항목마다 중앙 디렉터리가 적은 원래 크기만큼만 버퍼를 잡으므로
 * (그보다 긴 스트림은 잘린다) 그 크기의 합을 먼저 막으면 펼치는 양도 막힌다. 링크를 가를 외부 속성은 fflate 의
 * `filter` 가 주지 않아(`UnzipFileInfo` 는 이름 · 크기 · 압축 방식뿐) 중앙 디렉터리를 직접 읽는다.
 */
export function readWbtheme(bytes: Uint8Array): { files: WbthemeFiles | null; issues: WbthemeIssue[] } {
  if (bytes.length > WBTHEME_LIMITS.zipBytes) {
    return fail({ code: 'too-large', path: '', message: `zip 이 ${WBTHEME_LIMITS.zipBytes} 바이트를 넘습니다(${bytes.length})` })
  }

  const entries = readCentralDirectory(bytes)
  if (entries === null) return fail({ code: 'bad-zip', path: '', message: 'zip 파일이 아닙니다' })
  if (entries.length > WBTHEME_LIMITS.entries) {
    return fail({ code: 'too-many-entries', path: '', message: `항목이 ${WBTHEME_LIMITS.entries} 개를 넘습니다(${entries.length})` })
  }

  const issues: WbthemeIssue[] = []
  const seen = new Set<string>()
  let unzipped = 0
  for (const entry of entries) {
    unzipped += entry.originalSize
    const { name } = entry
    const isDir = name.endsWith('/')
    const reason = pathProblem(isDir ? name.slice(0, -1) : name)
    if (reason !== null) {
      issues.push({ code: 'bad-path', path: name, message: reason })
      continue
    }
    if (seen.has(name)) {
      // 같은 이름이 둘이면 푸는 도구마다 다른 쪽을 고른다 — 검사한 쪽과 쓰이는 쪽이 갈린다.
      issues.push({ code: 'bad-path', path: name, message: '같은 경로의 항목이 둘입니다' })
      continue
    }
    seen.add(name)
    if ((entry.mode & S_IFMT) === S_IFLNK) {
      issues.push({ code: 'symlink', path: name, message: '심볼릭 링크는 담을 수 없습니다' })
      continue
    }
    if (!isDir && !isAllowed(name)) {
      issues.push({
        code: 'not-allowed',
        path: name,
        message: 'manifest.json · theme.js · theme.css · assets/**(글꼴 · 이미지) 밖의 파일입니다',
      })
    }
  }
  if (unzipped > WBTHEME_LIMITS.unzippedBytes) {
    issues.push({
      code: 'unzipped-too-large',
      path: '',
      message: `풀었을 때 ${WBTHEME_LIMITS.unzippedBytes} 바이트를 넘습니다(${unzipped})`,
    })
  }
  if (!seen.has('manifest.json')) issues.push({ code: 'missing-manifest', path: 'manifest.json', message: 'manifest.json 이 없습니다' })
  if (!seen.has('theme.js')) issues.push({ code: 'missing-theme-js', path: 'theme.js', message: 'theme.js 가 없습니다' })
  if (issues.length > 0) return { files: null, issues }

  let raw: Record<string, Uint8Array>
  try {
    raw = unzipSync(bytes, { filter: (file) => !file.name.endsWith('/') })
  } catch (error) {
    return fail({ code: 'bad-zip', path: '', message: `zip 을 풀 수 없습니다: ${(error as Error).message}` })
  }

  let json: unknown
  try {
    json = JSON.parse(strFromU8(raw['manifest.json']!))
  } catch (error) {
    return fail({ code: 'bad-json', path: 'manifest.json', message: `manifest.json 이 JSON 이 아닙니다: ${(error as Error).message}` })
  }
  const { manifest, issues: manifestIssues } = validateManifest(json)
  if (manifest === null) {
    return {
      files: null,
      issues: manifestIssues.map((i) => ({
        code: 'manifest' as const,
        path: `manifest.json:${i.path}`,
        message: i.message,
        manifestCode: i.code,
      })),
    }
  }

  const assets = new Map<string, Uint8Array>()
  for (const [name, data] of Object.entries(raw)) if (name.startsWith('assets/')) assets.set(name, data)
  const css = raw['theme.css']
  return {
    files: { manifest, themeJs: strFromU8(raw['theme.js']!), themeCss: css === undefined ? null : strFromU8(css), assets },
    issues: [],
  }
}

function fail(issue: WbthemeIssue): { files: null; issues: WbthemeIssue[] } {
  return { files: null, issues: [issue] }
}

function pathProblem(path: string): string | null {
  if (path === '') return '빈 경로입니다'
  if (path.startsWith('/') || /^[a-zA-Z]:/.test(path)) return '절대 경로입니다'
  if (path.includes('\\')) return '역슬래시가 든 경로입니다'
  if (path.includes('\0')) return 'NUL 이 든 경로입니다'
  const segments = path.split('/')
  if (segments.includes('..')) return '.. 이 든 경로입니다'
  if (segments.some((s) => s === '' || s === '.')) return '빈 조각이나 . 이 든 경로입니다'
  return null
}

function isAllowed(path: string): boolean {
  if (ROOT_FILES.has(path)) return true
  if (!path.startsWith('assets/')) return false
  const dot = path.lastIndexOf('.')
  return dot > path.lastIndexOf('/') && ASSET_EXTENSIONS.has(path.slice(dot + 1).toLowerCase())
}

const EOCD_SIGNATURE = 0x06054b50
const CENTRAL_SIGNATURE = 0x02014b50

/**
 * 중앙 디렉터리의 항목들. zip 이 아니거나 구조가 어긋나면 `null`.
 *
 * ZIP64 는 받지 않는다 — 상한(10 MB · 항목 500)이 ZIP64 가 필요한 크기보다 한참 작아, ZIP64 표지(`0xFFFF…`)가 있으면
 * 그 자체가 어긋난 파일이다.
 */
function readCentralDirectory(bytes: Uint8Array): CentralEntry[] | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  // 끝 레코드는 22 바이트 + 주석(최대 65535). 뒤에서부터 표지를 찾는다.
  let eocd = -1
  for (let at = bytes.length - 22; at >= Math.max(0, bytes.length - 22 - 0xffff); at--) {
    if (view.getUint32(at, true) === EOCD_SIGNATURE) {
      eocd = at
      break
    }
  }
  if (eocd < 0) return null
  const count = view.getUint16(eocd + 10, true)
  const size = view.getUint32(eocd + 12, true)
  const offset = view.getUint32(eocd + 16, true)
  if (count === 0xffff || size === 0xffffffff || offset === 0xffffffff) return null
  if (offset + size > eocd) return null

  const entries: CentralEntry[] = []
  let at = offset
  for (let i = 0; i < count; i++) {
    if (at + 46 > eocd || view.getUint32(at, true) !== CENTRAL_SIGNATURE) return null
    const flags = view.getUint16(at + 8, true)
    const originalSize = view.getUint32(at + 24, true)
    const nameLength = view.getUint16(at + 28, true)
    const extraLength = view.getUint16(at + 30, true)
    const commentLength = view.getUint16(at + 32, true)
    const external = view.getUint32(at + 38, true)
    if (originalSize === 0xffffffff) return null
    if (at + 46 + nameLength > eocd) return null
    // fflate 와 같은 규칙으로 이름을 읽는다 — 비트 11 이 서면 UTF-8, 아니면 latin1. 다르게 읽으면 검사한 이름과 푼 이름이 갈린다.
    const name = strFromU8(bytes.subarray(at + 46, at + 46 + nameLength), (flags & 0x800) === 0)
    entries.push({ name, originalSize, mode: external >>> 16 })
    at += 46 + nameLength + extraLength + commentLength
  }
  return entries
}
