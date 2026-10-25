import type { ThemeManifest } from '@wirebound/theme-sdk'
import { Inflate, strFromU8, unzipSync, type UnzipFileInfo } from 'fflate'
import type { ManifestIssue, ManifestIssueCode } from '../manifest/schema'
import { validateManifest } from '../manifest/schema'

/** spec 「업로드 · 버전 · 인스턴스 관리자」의 «저장» 이 정한 상한 — 압축 10 MB · 풀었을 때 50 MB · 항목 500. */
export const WBTHEME_LIMITS = { zipBytes: 10_485_760, unzippedBytes: 52_428_800, entries: 500 } as const

export type WbthemeIssueCode =
  | 'too-large'
  | 'too-many-entries'
  | 'unzipped-too-large'
  | 'bad-path'
  | 'not-allowed'
  | 'symlink'
  | 'missing-manifest'
  | 'missing-theme-js'
  | 'bad-json'
  | 'manifest'
  | 'bad-zip'

export interface WbthemeIssue {
  code: WbthemeIssueCode
  /** zip 안의 항목 경로. `manifest` 이슈면 manifest 안의 자리(`manifest.json:components.DataGrid`). */
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
  /** 외부 속성의 위 16 비트 — 유닉스에서 만든 zip 이면 파일 모드다. */
  mode: number
  /** 로컬 머리의 자리(중앙 디렉터리 `+42`) — deflate 항목을 스스로 풀 때 데이터 시작을 찾는다. */
  offset: number
}

/**
 * `.wbtheme` 를 읽고 검증한다(spec 「업로드 검증」의 1 ~ 3). 이슈가 하나라도 있으면 `files` 는 `null` 이다.
 *
 * **크기 · 항목 수 · 경로 · 허용 목록 · 링크는 풀기 전에 본다** — 풀린 바이트를 만든 뒤 세면 zip 폭탄을 이미 펼친 것이다.
 *
 * **판정은 fflate 가 실제로 읽는 항목 목록에 맡긴다.** `unzipSync` 의 `filter` 가 늘 거짓을 돌려주면 fflate 는 아무것도 풀지
 * 않고 제가 풀 항목(이름 · 압축 크기 · 원래 크기 · 압축 방식)을 차례로 넘긴다 — 검사하는 목록과 푸는 목록이 같은 코드에서
 * 나온다. 손으로 읽는 중앙 디렉터리는 fflate 가 안 주는 외부 속성(링크 판정)만 얻고, 그 목록이 fflate 의 목록과 이름 ·
 * 차례 · 수까지 같아야 쓴다. 목록 대조는 외부 속성을 못 견주므로, 두 디렉터리가 이름까지 같은 zip64 판은 로케이터 거절이 혼자
 * 막는다. 손 판독기가 fflate 와 다른 칸을 읽으면(끝 레코드의 두 항목 수 · zip64 로케이터) 검사한 항목과
 * 푸는 항목이 갈려 검사를 비켜 간 것이 실린다. 그래서 두 칸이 갈리는 zip(두 항목 수가 다름 · 로케이터가 있음)은 받지 않고,
 * 남은 갈림은 목록 대조가 `bad-zip` 으로 막는다.
 *
 * **풀린 크기는 항목마다 `max(압축 크기, 원래 크기)` 로 센다** — fflate 는 stored 항목을 압축 크기로 잘라 싣고(원래 크기는 안
 * 본다) deflate 항목은 원래 크기만큼 버퍼를 잡는다(`inflateBounded` 도 같다). 한쪽만 세면 다른 쪽을 속인 zip 이 상한을 비켜 간다.
 */
export function readWbtheme(bytes: Uint8Array): { files: WbthemeFiles | null; issues: WbthemeIssue[] } {
  if (bytes.length > WBTHEME_LIMITS.zipBytes) {
    return fail({ code: 'too-large', path: '', message: `zip 이 ${WBTHEME_LIMITS.zipBytes} 바이트를 넘습니다(${bytes.length})` })
  }

  const entries = readCentralDirectory(bytes)
  if (typeof entries === 'string') return fail({ code: 'bad-zip', path: '', message: entries })
  if (entries.length > WBTHEME_LIMITS.entries) {
    return fail({ code: 'too-many-entries', path: '', message: `항목이 ${WBTHEME_LIMITS.entries} 개를 넘습니다(${entries.length})` })
  }
  const listed = listEntries(bytes)
  if (typeof listed === 'string') return fail({ code: 'bad-zip', path: '', message: listed })
  const divergence = listingDivergence(entries, listed)
  if (divergence !== null) return fail({ code: 'bad-zip', path: '', message: divergence })

  const issues: WbthemeIssue[] = []
  const seen = new Set<string>()
  /** 파일 항목의 «접은 이름»(NFC · 소문자) → 먼저 온 이름. */
  const foldedFiles = new Map<string, string>()
  let unzipped = 0
  entries.forEach((entry, index) => {
    const file = listed[index]!
    unzipped += Math.max(file.size, file.originalSize)
    const { name } = entry
    const isDir = name.endsWith('/')
    const reason = pathProblem(isDir ? name.slice(0, -1) : name)
    if (reason !== null) {
      issues.push({ code: 'bad-path', path: name, message: reason })
      return
    }
    if (seen.has(name)) {
      // 같은 이름이 둘이면 푸는 도구마다 다른 쪽을 고른다 — 검사한 쪽과 쓰이는 쪽이 갈린다.
      issues.push({ code: 'bad-path', path: name, message: '같은 경로의 항목이 둘입니다' })
      return
    }
    seen.add(name)
    // 대소문자 · 유니코드 정규화(NFC)만 다른 두 파일은 대소문자를 무시하는 파일시스템(macOS 기본)에 풀면 한 파일이다 — 뒤의 것이 앞의 것을
    // 덮어 자산 하나가 조용히 사라진다(`wireb export` 로 받은 번들을 풀 때). 한글 이름은 NFC · NFD 둘로 적힐 수 있다.
    const folded = name.normalize('NFC').toLowerCase()
    const clash = isDir ? undefined : foldedFiles.get(folded)
    if (clash !== undefined) {
      issues.push({ code: 'bad-path', path: name, message: `대소문자나 유니코드 정규화만 다른 항목이 있습니다(${clash})` })
      return
    }
    if (!isDir) foldedFiles.set(folded, name)
    if ((entry.mode & S_IFMT) === S_IFLNK) {
      issues.push({ code: 'symlink', path: name, message: '심볼릭 링크는 담을 수 없습니다' })
      return
    }
    if (!isDir && !isAllowed(name)) {
      issues.push({
        code: 'not-allowed',
        path: name,
        message: 'manifest.json · theme.js · theme.css · assets/**(글꼴 · 이미지) 밖의 파일입니다',
      })
    }
  })
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

  // stored 항목은 fflate 가 자른다. deflate 항목은 스스로 푼다(`inflateBounded`) — fflate 의 `unzipSync` 는 적힌 원래 크기를 넘은
  // 뒤에도 스트림을 끝까지 풀어(넘친 쓰기만 버린다) 작은 zip 하나가 읽기를 수십 초 쥔다.
  let raw: Record<string, Uint8Array>
  try {
    raw = unzipSync(bytes, { filter: (file) => !file.name.endsWith('/') && file.compression === 0 })
  } catch (error) {
    return fail({ code: 'bad-zip', path: '', message: `zip 을 풀 수 없습니다: ${(error as Error).message}` })
  }
  for (const [index, file] of listed.entries()) {
    if (file.name.endsWith('/') || file.compression === 0) continue
    if (file.compression !== 8) return fail({ code: 'bad-zip', path: file.name, message: `모르는 압축 방식입니다(${file.compression})` })
    const data = inflateBounded(bytes, entries[index]!.offset, file.size, file.originalSize)
    if (typeof data === 'string') return fail({ code: 'bad-zip', path: file.name, message: data })
    raw[file.name] = data
  }

  let json: unknown
  try {
    json = JSON.parse(strFromU8(raw['manifest.json']!))
  } catch (error) {
    return fail({ code: 'bad-json', path: 'manifest.json', message: `manifest.json 이 JSON 이 아닙니다: ${(error as Error).message}` })
  }
  const { manifest, issues: manifestIssues } = validateManifest(json)
  if (manifest === null) {
    return { files: null, issues: manifestIssues.map(asWbthemeIssue) }
  }

  const assets = new Map<string, Uint8Array>()
  for (const [name, data] of Object.entries(raw)) if (name.startsWith('assets/')) assets.set(name, data)
  const css = raw['theme.css']
  return {
    files: { manifest, themeJs: strFromU8(raw['theme.js']!), themeCss: css === undefined ? null : strFromU8(css), assets },
    issues: [],
  }
}

function asWbthemeIssue(issue: ManifestIssue): WbthemeIssue {
  return { code: 'manifest', path: `manifest.json:${issue.path}`, message: issue.message, manifestCode: issue.code }
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
const ZIP64_LOCATOR_SIGNATURE = 0x07064b50

/**
 * 중앙 디렉터리의 항목들(이름 · 외부 속성). zip 이 아니거나 구조가 어긋나면 이유 한 문장.
 *
 * **fflate 와 같은 칸을 읽는 zip 만 받는다.** 끝 레코드의 «이 디스크의 항목 수»(`+8` — fflate 가 센다)와 «전체 항목 수»
 * (`+10`)가 다르거나, 끝 레코드 앞 20 바이트에 zip64 로케이터가 있으면(fflate 는 그것이 가리키는 zip64 끝 레코드의 수 ·
 * 오프셋을 믿는다) 거절한다 — 받으면 이 판독기와 fflate 가 서로 다른 항목 목록을 읽는다. zip64 표지(`0xFFFF…`)도 받지 않는다:
 * 상한(10 MB · 항목 500)이 zip64 가 필요한 크기보다 한참 작아 그 자체가 어긋난 파일이다.
 */
function readCentralDirectory(bytes: Uint8Array): CentralEntry[] | string {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  // 끝 레코드는 22 바이트 + 주석(최대 65535). fflate 와 같게 뒤에서부터 표지를 찾는다.
  let eocd = -1
  for (let at = bytes.length - 22; at >= Math.max(0, bytes.length - 22 - 0xffff); at--) {
    if (view.getUint32(at, true) === EOCD_SIGNATURE) {
      eocd = at
      break
    }
  }
  if (eocd < 0) return 'zip 파일이 아닙니다'
  const diskCount = view.getUint16(eocd + 8, true)
  const count = view.getUint16(eocd + 10, true)
  const size = view.getUint32(eocd + 12, true)
  const offset = view.getUint32(eocd + 16, true)
  if (diskCount !== count) return `끝 레코드의 두 항목 수가 다릅니다(이 디스크 ${diskCount} · 전체 ${count})`
  if (eocd >= 20 && view.getUint32(eocd - 20, true) === ZIP64_LOCATOR_SIGNATURE) return 'zip64 는 받지 않습니다(로케이터가 있습니다)'
  if (count === 0xffff || size === 0xffffffff || offset === 0xffffffff) return 'zip64 는 받지 않습니다(표지가 있습니다)'
  if (offset + size > eocd) return '중앙 디렉터리가 끝 레코드를 넘습니다'

  const entries: CentralEntry[] = []
  let at = offset
  for (let i = 0; i < count; i++) {
    if (at + 46 > eocd || view.getUint32(at, true) !== CENTRAL_SIGNATURE) return '중앙 디렉터리의 항목 머리가 어긋납니다'
    const flags = view.getUint16(at + 8, true)
    const nameLength = view.getUint16(at + 28, true)
    const extraLength = view.getUint16(at + 30, true)
    const commentLength = view.getUint16(at + 32, true)
    const external = view.getUint32(at + 38, true)
    if (view.getUint32(at + 20, true) === 0xffffffff || view.getUint32(at + 24, true) === 0xffffffff) {
      return 'zip64 는 받지 않습니다(항목 크기 표지)'
    }
    if (at + 46 + nameLength > eocd) return '중앙 디렉터리의 항목 이름이 끝 레코드를 넘습니다'
    // fflate 와 같은 규칙으로 이름을 읽는다 — 비트 11 이 서면 UTF-8, 아니면 latin1. 어긋나면 `listingDivergence` 가 잡는다.
    const name = strFromU8(bytes.subarray(at + 46, at + 46 + nameLength), (flags & 0x800) === 0)
    entries.push({ name, mode: external >>> 16, offset: view.getUint32(at + 42, true) })
    at += 46 + nameLength + extraLength + commentLength
  }
  return entries
}

/**
 * fflate 가 풀 항목 목록 — `filter` 가 늘 거짓을 돌려줘 아무것도 풀지 않는다(항목마다 버퍼를 안 잡는다 — 케이스
 * «filter 가 거절한 항목은 버퍼를 안 잡는다» 가 잰다). fflate 가 목록을 못 읽으면 이유 한 문장.
 */
function listEntries(bytes: Uint8Array): UnzipFileInfo[] | string {
  const listed: UnzipFileInfo[] = []
  try {
    unzipSync(bytes, {
      filter: (file) => {
        listed.push(file)
        return false
      },
    })
  } catch (error) {
    return `zip 을 읽을 수 없습니다: ${(error as Error).message}`
  }
  return listed
}

/** 두 목록이 이름 · 차례 · 수까지 같으면 `null`, 아니면 이유 한 문장. */
function listingDivergence(entries: readonly CentralEntry[], listed: readonly UnzipFileInfo[]): string | null {
  if (entries.length !== listed.length) return `중앙 디렉터리의 항목 수(${entries.length})와 푸는 항목 수(${listed.length})가 다릅니다`
  const at = entries.findIndex((entry, index) => entry.name !== listed[index]!.name)
  return at < 0 ? null : `${at} 번째 항목의 이름이 중앙 디렉터리(${entries[at]!.name})와 푸는 쪽(${listed[at]!.name})에서 다릅니다`
}

/** 한 번에 넣는 압축 바이트 — deflate 의 최대 비율(≈ 1032 배)로도 한 번의 출력이 몇 MB 안에 든다. */
const INFLATE_STEP = 4096

class InflateOverrun extends Error {}

/**
 * deflate 항목 하나를 푼다 — 나온 바이트를 세어 **중앙 디렉터리에 적힌 원래 크기를 넘는 순간** 멈추고 이유 한 문장을 돌려준다.
 * 데이터 시작은 fflate 와 같게 로컬 머리의 이름 · 확장 길이로 찾는다(로컬 머리의 나머지 칸은 안 본다).
 */
function inflateBounded(bytes: Uint8Array, offset: number, size: number, originalSize: number): Uint8Array | string {
  if (offset + 30 > bytes.length) return '로컬 머리가 파일 밖입니다'
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const start = offset + 30 + view.getUint16(offset + 26, true) + view.getUint16(offset + 28, true)
  const input = bytes.subarray(start, start + size)
  const out = new Uint8Array(originalSize)
  let written = 0
  const inflate = new Inflate((chunk) => {
    if (written + chunk.length > originalSize) throw new InflateOverrun()
    out.set(chunk, written)
    written += chunk.length
  })
  try {
    let at = 0
    do {
      const next = Math.min(at + INFLATE_STEP, input.length)
      inflate.push(input.subarray(at, next), next >= input.length)
      at = next
    } while (at < input.length)
  } catch (error) {
    if (error instanceof InflateOverrun) return `풀린 바이트가 적힌 원래 크기(${originalSize})를 넘습니다`
    return `zip 을 풀 수 없습니다: ${(error as Error).message}`
  }
  return written === originalSize ? out : out.subarray(0, written)
}
