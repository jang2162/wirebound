/**
 * **받는 쪽이 이 pptx를 여는가.**
 *
 * 이 저장소의 스모크는 *"빌드된 것을 진짜 소비자에게 먹인다"*이다. **PPTX의 소비자는
 * PowerPoint이고, 그것을 자로 쓰는 길이 있다** — 다만 **여기 있는 것은 그 자가 아니다.**
 * 아래가 그 갈림이다.
 *
 * ---
 *
 * # 진짜 자는 PowerPoint다 — **손으로 돌린다**
 *
 * **PowerPoint는 터미널에서도 쓸 수 있다** — **샌드박스는 자기 컨테이너 안의 파일에는
 * 대화상자를 안 띄운다.**
 *
 * ```
 * ~/Library/Containers/com.microsoft.Powerpoint/Data/Documents/   ← 여기 두고 열면 안 묻는다
 * open -a "Microsoft PowerPoint" <그 파일>
 * osascript -e 'tell application "Microsoft PowerPoint" to count of presentations'
 * osascript -e 'tell application "System Events" to tell process "Microsoft PowerPoint" …'
 *     └ 창·버튼·정적 텍스트를 읽어 **복구 대화상자**를 값으로 잡는다
 * ```
 *
 * **주의 둘.** `tell application "Microsoft PowerPoint"` 블록 안에서 `out`을 변수 이름으로
 * 쓰면 `-10003`이 난다(PowerPoint 사전의 낱말과 부딪힌다). 그리고 **쓰고 나면 컨테이너에
 * 만든 디렉터리를 지우고 PowerPoint를 종료한다.**
 *
 * **왜 이 파일이 그것을 안 하나:** GUI 앱을 띄우고 자동화 권한을 요구하는 것은 게이트가 할
 * 일이 아니다. `pnpm test:build`는 아무 기계에서나 돌아야 한다. **그래서 진짜 자는 사람이
 * 돌리고**(위 절차) 여기서는 **아무 기계에서나 도는 절반**을 잰다.
 *
 * # 여기서 쓰는 자 둘 — **Apple이 만든 OOXML 구현이다**
 *
 * | 후보 | 값 |
 * |---|---|
 * | **macOS Spotlight**(`/System/Library/Spotlight/Office.mdimporter`) | 파일 종류를 알아보고 **슬라이드 안의 글자를 뽑는다** |
 * | **macOS QuickLook**(`/System/Library/QuickLook/Office.qlgenerator`) | 첫 슬라이드를 **그린다** |
 * | LibreOffice · `python-pptx` | 이 기계에 없다 |
 *
 * 둘 다 우리 코드가 아니므로 *"우리가 만든 규칙에 우리가 맞춘 것"*은 아니다. **그래도
 * PowerPoint가 열었다는 뜻은 아니다** — 둘이 그냥 연 파일을 PowerPoint가 복구 대화상자로
 * 막는 자리가 있다(아래 표).
 *
 * # 이 자가 무엇을 잡고 무엇을 놓치나 — **변이로 쟀다**
 *
 * 다시 재는 법: 왼쪽 칸의 자리를 `src/pptx`에서 되돌리고 `pnpm test:build`로 이 파일을
 * 돌린다. **PowerPoint** 칸은 위 절차로 연다.
 *
 * | 되돌린 것 | 여기서 | **PowerPoint** |
 * |---|---|---|
 * | `presentation.xml.rels`의 슬라이드 관계 | **4 사망** | — |
 * | 마스터의 테마 관계 | **1 사망**(QuickLook). Spotlight는 글자를 그대로 뽑았다 | — |
 * | `[Content_Types].xml`의 슬라이드 `Override` | **0 사망 — 둘 다 그냥 읽었다** | — |
 * | **테마 파트를 두 마스터가 나눠 쓴다** | **0 사망 — 둘 다 그냥 열었다** | **복구 대화상자** |
 * | 슬라이드 → 레이아웃 관계 · 매달린 `r:id` · 매체 `png` `Default` | 앞 둘은 QuickLook 이 **상한에 걸린 정지**로 알린다. **매체 `Default` 는 둘 다 못 본다** | **셋 다 복구** |
 *
 * **표의 마지막 두 줄이 이 자의 한계다.** 규격이 요구하는 것을 받는 쪽 하나가 관대하게 넘긴다고
 * 규격이 느슨해지는 것이 아니다 — 그 다섯은 **`test/pptx-package.test.ts`의 *"파일이 열리는
 * 조건"* 절이 잡는다**(변이마다 1~2 사망). **세 자가 서로를 대신하지 않는다.**
 *
 * # 왜 `dist`인가
 *
 * `pnpm test`는 소스를 alias로 보므로 **`dist`가 깨져도 초록이다**(`dist-runtime.test.ts`의
 * 머리말). 받는 쪽이 받는 것은 `dist`이고, 여기서는 그것을 그대로 불러 파일을 만든다.
 *
 * # 여기서만 `fflate`를 쓴다
 *
 * `packages/exporter`는 zip을 모른다 — 그 성질을 `test/public-api.test.ts`가 `src/**`를
 * 훑어 지킨다. **진짜 파일을 만들어 먹이려면 누군가는 압축해야 하고**, 그 자리가 프로덕션이
 * 아니라 여기다. 프로덕션의 압축은 `apps/api`의 `zipParts`이고 그쪽은 `apps/api`의 케이스가
 * 잰다.
 *
 * `pnpm test`에는 안 들어간다(`--project '!build'`). `pnpm test:build`가 돌린다.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { strToU8, zipSync } from 'fflate'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const repoRoot = process.cwd()
const distPath = resolve(repoRoot, 'packages/exporter/dist/index.js')

/** `dist`가 내는 것 중 이 파일이 쓰는 것만. */
interface DistExporter {
  exportPptx: (options: {
    pages: readonly {
      title: string
      document: unknown
      description?: string | null
      comments?: readonly { nodeId: string; body: string }[]
    }[]
  }) => { parts: { path: string; content: string | Uint8Array }[]; screenless: string[] }
  NO_SCREEN: string
}

/** **하나짜리로 재지 않는다.** 슬라이드 셋 · 코멘트 · 상호작용 · 한글과 특수문자. */
const PAGES = [
  {
    title: '관리자 · 회원 · 목록',
    description: '회원을 조건으로 찾는 화면',
    document: {
      version: 1,
      root: {
        id: 'n_000000000001',
        type: 'Page',
        children: [
          {
            id: 'n_000000000002',
            type: 'Button',
            props: { label: '검색' },
            marker: 1,
            interactions: [
              {
                on: 'click',
                actions: [
                  { type: 'setProp', target: 'n_000000000003', prop: 'loading', value: true },
                ],
              },
            ],
          },
          { id: 'n_000000000003', type: 'List', props: {}, marker: 2 },
        ],
      },
    },
    comments: [{ nodeId: 'n_000000000002', body: '검색 조건은 AND & OR 로 묶는다' }],
  },
  {
    title: '관리자 · 회원 · 상세',
    document: {
      version: 1,
      root: {
        id: 'n_000000000011',
        type: 'Page',
        children: [{ id: 'n_000000000012', type: 'Text', props: { content: '상세' } }],
      },
    },
    comments: [],
  },
  {
    title: '마케팅 · 랜딩',
    document: {
      version: 1,
      root: {
        id: 'n_000000000021',
        type: 'Page',
        children: [{ id: 'n_000000000022', type: 'Text', props: { content: '문구' } }],
      },
    },
    comments: [],
  },
]

/**
 * 받는 쪽을 부르는 데 주는 시간.
 *
 * **깨진 pptx 에서 QuickLook 이 멈춘다 — 실패하지 않는다.** 마스터의 테마 관계를 지운
 * 파일에서 `qlmanage`가 **끝나지 않고 매달리고** 그 사이 케이스는 아무것도 말하지 않는다.
 * **상한이 없으면 빨강이 아니라 정지다.**
 *
 * 정상 파일에서 이 둘은 1초 안쪽이다(이 파일을 돌려 케이스 시간으로 본다).
 */
const CONSUMER_TIMEOUT_MS = 60_000

/** 이 기계에 그 명령이 있는가. **없으면 그 케이스는 건너뛰고 그렇다고 말한다.** */
function has(command: string): boolean {
  try {
    execFileSync('/usr/bin/which', [command], { stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}

const HAS_MDIMPORT = has('mdimport')
const HAS_QLMANAGE = has('qlmanage')

let workspace = ''
let pptxPath = ''
let screenless: string[] = []
let noScreen = ''

beforeAll(async () => {
  if (!existsSync(distPath)) {
    execFileSync('pnpm', ['--filter', '@wirebound/exporter', 'build'], {
      cwd: repoRoot,
      stdio: 'inherit',
    })
  }
  const dist = (await import(pathToFileURL(distPath).href)) as DistExporter
  const built = dist.exportPptx({ pages: PAGES })
  screenless = built.screenless
  noScreen = dist.NO_SCREEN

  const tree: Record<string, Uint8Array> = {}
  for (const part of built.parts) {
    tree[part.path] = typeof part.content === 'string' ? strToU8(part.content) : part.content
  }

  workspace = mkdtempSync(join(tmpdir(), 'wirebound-pptx-'))
  pptxPath = join(workspace, 'wirebound-export-smoke.pptx')
  writeFileSync(pptxPath, zipSync(tree, { level: 6 }))
})

afterAll(() => {
  if (workspace !== '') rmSync(workspace, { recursive: true, force: true })
})

describe('dist 가 만든 pptx', () => {
  it('파일이 떨어진다', () => {
    expect(existsSync(pptxPath)).toBe(true)
  })

  it('이미지 없이 나갔다는 것을 값이 말한다 — 화면을 안 넘겼으니 전부다', () => {
    expect(screenless).toEqual(PAGES.map((page) => page.title))
    expect(noScreen.length).toBeGreaterThan(0)
  })
})

/**
 * **Spotlight 의 Office 임포터**가 이 파일을 무엇으로 읽는가.
 *
 * `mdimport -t -d3`은 **인덱스를 건드리지 않고** 시험 삼아 읽어 속성을 찍는다.
 */
describe.runIf(HAS_MDIMPORT)('macOS Spotlight 이 읽는다', () => {
  let attributes = ''

  beforeAll(() => {
    attributes = execFileSync('mdimport', ['-t', '-d3', pptxPath], {
      encoding: 'utf8',
      timeout: CONSUMER_TIMEOUT_MS,
    })
  })

  it('Office 임포터가 맡는다 — 우리 코드가 아닌 파서다', () => {
    expect(attributes).toContain('/System/Library/Spotlight/Office.mdimporter')
  })

  it('파일 종류를 프레젠테이션으로 알아본다', () => {
    expect(attributes).toContain('org.openxmlformats.presentationml.presentation')
  })

  /**
   * **글자가 실제로 뽑힌다.** 종류만 재면 *"zip 이고 확장자가 pptx"*만 확인한 것이 된다 —
   * 파서가 슬라이드 XML 안까지 들어갔는지는 글자로만 알 수 있다.
   *
   * `mdimport`는 비-ASCII 를 `\Uxxxx`로 찍으므로 그 형태로 견준다.
   */
  it('슬라이드마다의 제목을 뽑는다', () => {
    for (const page of PAGES) {
      expect(attributes, page.title).toContain(escapeForMdimport(page.title))
    }
  })

  it('코멘트 본문과 상호작용 문장을 뽑는다 — 설계서 「자동 문장화」', () => {
    expect(attributes).toContain(escapeForMdimport('검색 조건은 AND & OR 로 묶는다'))
    expect(attributes).toContain(escapeForMdimport('클릭 시'))
  })

  it('이미지가 없다는 말도 파일 안에 있다 — 사람이 파일만 열어도 안다', () => {
    expect(attributes).toContain(escapeForMdimport(noScreen))
  })
})

/**
 * **QuickLook 의 Office 생성기**가 이 파일을 그리는가.
 *
 * 여기까지 오면 파서가 파트 관계를 따라 마스터·레이아웃·테마를 찾았다는 뜻이다 — 그중
 * 하나라도 없으면 썸네일이 안 나온다.
 */
describe.runIf(HAS_QLMANAGE)('macOS QuickLook 이 그린다', () => {
  it('첫 슬라이드의 썸네일이 나온다', () => {
    const out = execFileSync('qlmanage', ['-t', '-s', '600', '-o', workspace, pptxPath], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      // **멈추는 것을 빨강으로 바꾼다**(위 `CONSUMER_TIMEOUT_MS`).
      timeout: CONSUMER_TIMEOUT_MS,
    })
    expect(out).toContain('produced one thumbnail')
    expect(existsSync(join(workspace, 'wirebound-export-smoke.pptx.png'))).toBe(true)
  })
})

/**
 * **자가 없으면 없다고 말한다.** 조용히 건너뛰면 다른 기계에서 *"스모크가 통과했다"*로
 * 읽힌다.
 */
describe('무엇으로 쟀는지 말한다', () => {
  it('macOS 의 OOXML 구현 둘 중 하나라도 있으면 위 검사가 돈다', () => {
    if (!HAS_MDIMPORT && !HAS_QLMANAGE) {
      // eslint 없는 저장소라 콘솔로 남긴다. **여기가 초록인 것은 *"안 쟀다"*는 뜻이다.**
      console.warn(
        '[pptx 받는 쪽 검사] mdimport·qlmanage 가 없어 받는 쪽 검사를 안 돌렸습니다 (macOS 밖). ' +
          '패키지가 닫혀 있는지는 packages/exporter/test/pptx-package.test.ts 가 잽니다.',
      )
    }
    expect(HAS_MDIMPORT || HAS_QLMANAGE || process.platform !== 'darwin').toBe(true)
  })
})

/** `mdimport`가 비-ASCII 를 찍는 형태(`\Uxxxx`)로 바꾼다. ASCII 는 그대로다. */
function escapeForMdimport(text: string): string {
  return [...text]
    .map((character) => {
      const code = character.codePointAt(0)!
      if (code < 0x80) return character
      return `\\U${code.toString(16).padStart(4, '0')}`
    })
    .join('')
}
