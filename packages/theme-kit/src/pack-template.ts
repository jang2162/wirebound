import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { strToU8, zipSync, type Zippable } from 'fflate'

/** 템플릿 zip 의 뿌리 디렉터리 — 풀면 이 이름의 폴더 하나가 선다(spec 「템플릿 zip」). */
export const TEMPLATE_ROOT = 'wirebound-theme-starter'

const PROJECT_NAME = 'my-wirebound-theme'

/** 템플릿의 `src/views/` 로 옮기는 SDK 기본 뷰 묶음(`@wirebound/theme-sdk` 의 `src/default-views/`). */
const VIEW_GROUPS = ['structure', 'data', 'input', 'action', 'document'] as const

const VIEW_HEADER =
  '// SDK 기본 뷰를 옮긴 출발점이다 — 마음대로 고친다. 뷰 계약은 SKILL.md 「뷰 계약」.\n' +
  '// 기본 뷰의 최소 CSS(Flex · Grid 배치 등)는 호스트가 먼저 싣는다 — 여기 없는 규칙은 src/theme.css 에 쓴다.\n'

export interface PackTemplateResult {
  file: string
  bytes: number
  tarballs: { name: string; bytes: number }[]
}

function packageDir(from: string): string {
  let dir = dirname(from)
  while (!existsSync(join(dir, 'package.json'))) {
    const up = dirname(dir)
    if (up === dir) throw new Error(`package.json 을 못 찾았습니다: ${from}`)
    dir = up
  }
  return dir
}

function run(args: string[], cwd: string): string {
  return execFileSync('pnpm', args, { cwd, stdio: 'pipe', encoding: 'utf8' })
}

/**
 * SDK 기본 뷰 소스 하나를 템플릿의 뷰 파일로 옮긴다 — 상대 import 를 `@wirebound/theme-sdk` 한 줄로 바꾸고, SDK 안에서만 쓰는
 * CSS 블록 함수(`*CssBlocks` — 호스트가 `defaultViewsCss()` 로 싣는다)와 머리 주석(SDK 파일을 가리킨다)을 걷는다.
 *
 * **저장소에 사본을 두지 않고 pack 할 때 짓는다** — 사본을 두면 SDK 기본 뷰가 바뀔 때 조용히 갈라진다. 옮긴 뒤 남은 이름이 SDK
 * 가 내보내지 않는 것이면 던진다: 빌드는 SDK 를 전역으로 바꿔 써 없는 이름을 잡지 않고, 그 뷰는 설치한 기계에서 `undefined` 를
 * 부르며 죽는다.
 */
export function templateView(source: string, sdkExports: ReadonlySet<string>, file: string): string {
  let body = source.replace(/^\/\*\*(?:(?!\*\/)[\s\S])*\*\/\n/, '')
  const cut = body.search(/\n(?:\/\*\*(?:(?!\*\/)[\s\S])*\*\/\n)?export function \w+CssBlocks\(/)
  if (cut < 0) throw new Error(`${file}: CSS 블록 함수를 못 찾았습니다`)
  body = `${body.slice(0, cut).trimEnd()}\n`

  const imported = new Set<string>()
  body = body.replace(/^import \{([^}]*)\} from '\.\.\/[\w-]+'\n/gm, (_, list: string) => {
    for (const name of list.split(',')) if (name.trim() !== '') imported.add(name.trim())
    return ''
  })
  if (/from '\.\.?\//.test(body)) throw new Error(`${file}: 옮기지 못한 상대 import 가 남았습니다`)
  const used = [...imported].filter((name) => new RegExp(`\\b${name}\\b`).test(body)).sort()
  const missing = used.filter((name) => !sdkExports.has(name))
  if (missing.length > 0) throw new Error(`${file}: SDK 가 내보내지 않는 이름을 씁니다 — ${missing.join(', ')}`)

  const sdkImport = `import { ${used.join(', ')} } from '@wirebound/theme-sdk'\n`
  const lastImport = [...body.matchAll(/^import .*\n/gm)].at(-1)
  const at = lastImport === undefined ? 0 : lastImport.index + lastImport[0].length
  return `${VIEW_HEADER}${body.slice(0, at)}${sdkImport}${body.slice(at)}`
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? walk(path) : [path]
  })
}

/**
 * 템플릿 zip 을 짓는다 — ① SDK · kit 을 빌드하고 `pnpm pack` 으로 tarball 둘 ② `template/**` 를 옮기고(`package.json.tpl` 을
 * tarball 이름으로 채워 `package.json` 으로) SDK 기본 뷰를 `src/views/` 로 ③ `vendor/` 에 tarball 둘 ④ zip.
 *
 * **저장소 안에서만 돈다** — SDK · kit 의 워크스페이스 패키지를 빌드 · pack 한다. 설치한 kit 에서 부르면 SDK 소스가 없어 던진다.
 *
 * 두 패키지의 `package.json` 은 `publishConfig.exports` 를 갖는다 — 저장소의 `exports` 는 `development` 조건이 `src/` 를 가리키는데
 * tarball 에는 `dist/` 만 든다. pnpm 이 pack 할 때 그 필드로 덮지 않으면 작성자의 dev 서버(vite 는 `development` 조건으로 푼다)가
 * 없는 파일을 찾는다. `workspace:` 의존도 pnpm pack 이 판 번호로 바꾼다.
 */
export async function packTemplate(opts: { outFile?: string; build?: boolean } = {}): Promise<PackTemplateResult> {
  const kitDir = packageDir(fileURLToPath(import.meta.url))
  if (opts.build !== false) run(['--filter', '@wirebound/theme-kit...', 'build'], kitDir)
  const sdkDir = packageDir(createRequire(import.meta.url).resolve('@wirebound/theme-sdk'))
  const viewsDir = join(sdkDir, 'src', 'default-views')
  if (!existsSync(viewsDir)) throw new Error(`SDK 기본 뷰 소스가 없습니다(${viewsDir}) — pack-template 은 저장소 안에서 부른다`)

  const work = mkdtempSync(join(tmpdir(), 'wb-theme-template-'))
  try {
    for (const dir of [sdkDir, kitDir]) run(['pack', '--pack-destination', work], dir)
    const tarballs = readdirSync(work).filter((name) => name.endsWith('.tgz'))
    const sdkTarball = tarballs.find((name) => name.startsWith('wirebound-theme-sdk-'))
    const kitTarball = tarballs.find((name) => name.startsWith('wirebound-theme-kit-'))
    if (sdkTarball === undefined || kitTarball === undefined) throw new Error(`tarball 이 없습니다: ${tarballs.join(', ')}`)

    const files: Zippable = {}
    const put = (path: string, data: Uint8Array) => {
      files[`${TEMPLATE_ROOT}/${path}`] = data
    }
    const templateDir = join(kitDir, 'template')
    for (const path of walk(templateDir)) {
      const rel = relative(templateDir, path).split(sep).join('/')
      if (rel === 'package.json.tpl') {
        const filled = readFileSync(path, 'utf8')
          .replaceAll('{{name}}', PROJECT_NAME)
          .replaceAll('{{sdkTarball}}', sdkTarball)
          .replaceAll('{{kitTarball}}', kitTarball)
        if (filled.includes('{{')) throw new Error('package.json.tpl 에 채우지 못한 자리표가 남았습니다')
        put('package.json', strToU8(filled))
      } else if (rel === 'gitignore') {
        // `.gitignore` 라는 이름으로 두면 pack 이 그 파일을 빼거나 `.npmignore` 로 바꾼다 — 이름을 풀 때 바꾼다.
        put('.gitignore', readFileSync(path))
      } else {
        put(rel, readFileSync(path))
      }
    }
    const sdk = (await import('@wirebound/theme-sdk')) as Record<string, unknown>
    const sdkExports = new Set(Object.keys(sdk))
    for (const group of VIEW_GROUPS) {
      const source = readFileSync(join(viewsDir, `${group}.tsx`), 'utf8')
      put(`src/views/${group}.tsx`, strToU8(templateView(source, sdkExports, `${group}.tsx`)))
    }
    for (const name of [sdkTarball, kitTarball]) put(`vendor/${name}`, readFileSync(join(work, name)))

    const zip = zipSync(files)
    const file = opts.outFile ?? join(kitDir, 'dist', `${TEMPLATE_ROOT}.zip`)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, zip)
    return {
      file,
      bytes: zip.length,
      tarballs: [sdkTarball, kitTarball].map((name) => ({ name, bytes: statSync(join(work, name)).size })),
    }
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}
