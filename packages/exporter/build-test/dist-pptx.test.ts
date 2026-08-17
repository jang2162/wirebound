/**
 * **받는 쪽이 이 pptx를 여는가**(P10-1 T6 · D6).
 *
 * 이 저장소의 스모크는 늘 *"빌드된 것을 진짜 소비자에게 먹인다"*였다. **PPTX의 소비자는
 * PowerPoint다.** 그것을 이 자리에서 쓸 수 없다는 것을 재서 확인했고(아래), 대신 **같은
 * 기계의 다른 OOXML 구현 둘**에게 먹인다.
 *
 * ---
 *
 * # 자를 어떻게 골랐나 — T1에서 쟀다
 *
 * | 후보 | 값 |
 * |---|---|
 * | **Microsoft PowerPoint 16.112** | 설치돼 있다. **터미널에서 못 쓴다** — 샌드박스가 파일마다 *"파일 액세스 부여"* 대화상자를 띄우고, 그것을 지나도 창 없이 뜬다. **PowerPoint가 만든 파일로 대조군을 돌려도 같았으므로 막는 것은 우리 파일이 아니라 자동화다** |
 * | **macOS Spotlight**(`/System/Library/Spotlight/Office.mdimporter`) | **쓴다.** 파일 종류를 알아보고 **슬라이드 안의 글자를 뽑는다** |
 * | **macOS QuickLook**(`/System/Library/QuickLook/Office.qlgenerator`) | **쓴다.** 첫 슬라이드를 **그린다** |
 * | LibreOffice · `python-pptx` | 이 기계에 없다 |
 *
 * **둘 다 Apple이 만든 OOXML 구현이고 우리 코드가 아니다.** 그래서 *"우리가 만든 규칙에
 * 우리가 맞춘 것"*이 아니다 — 그래도 **PowerPoint가 열었다는 뜻은 아니다.** 그 한계는
 * 이월이 말한다.
 *
 * # 이 자가 무엇을 잡고 무엇을 놓치나 — **변이로 쟀다**
 *
 * | 되돌린 것 | 여기서 |
 * |---|---|
 * | `presentation.xml.rels`의 슬라이드 관계 | **4 사망** — 둘 다 아무것도 못 읽는다 |
 * | 마스터의 테마 관계 | **1 사망**(QuickLook). **Spotlight는 글자를 그대로 뽑았다** |
 * | `[Content_Types].xml`의 슬라이드 `Override` | **0 사망 — 둘 다 그냥 읽었다** |
 *
 * 마지막 줄이 이 자의 한계다. **규격은 그 `Override`를 요구하고 우리 케이스는 그것을
 * 잡는다**(`test/pptx-package.test.ts` — 1 사망) — 받는 쪽 하나가 관대하다고 규격이
 * 느슨해지는 것이 아니다. **두 자가 서로를 대신하지 않는다.**
 *
 * # 왜 `dist`인가
 *
 * `pnpm test`는 소스를 alias로 보므로 **`dist`가 깨져도 초록이다**(`dist-runtime.test.ts`의
 * 머리말). 받는 쪽이 받는 것은 `dist`이고, 여기서는 그것을 그대로 불러 파일을 만든다.
 *
 * # 여기서만 `fflate`를 쓴다
 *
 * `packages/exporter`는 zip을 모른다(D1) — 그 성질을 `test/public-api.test.ts`가 `src/**`를
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
 * **깨진 pptx 에서 QuickLook 이 멈춘다 — 실패하지 않는다.** 마스터의 테마 관계를 지우고
 * 재 봤더니 `qlmanage`가 **9분을 넘게 매달려 있었고**(사람이 죽였다) 그 사이 케이스는
 * 아무것도 말하지 않았다. **상한이 없으면 빨강이 아니라 정지다** — 이 저장소가 15분
 * 타임아웃으로 겪어 온 부류와 같다.
 *
 * 정상 파일에서 이 둘은 1초 안쪽이다(쟀다).
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

describe('dist 가 만든 pptx (T6)', () => {
  it('파일이 떨어진다', () => {
    expect(existsSync(pptxPath)).toBe(true)
  })

  it('이미지 없이 나갔다는 것을 값이 말한다 — 오늘은 전부다', () => {
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

  it('코멘트 본문과 상호작용 문장을 뽑는다 — §8.2', () => {
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
 * 읽힌다 — 이 저장소가 반복해서 막아 온 부류다.
 */
describe('무엇으로 쟀는지 말한다', () => {
  it('macOS 의 OOXML 구현 둘 중 하나라도 있으면 위 검사가 돈다', () => {
    if (!HAS_MDIMPORT && !HAS_QLMANAGE) {
      // eslint 없는 저장소라 콘솔로 남긴다. **여기가 초록인 것은 *"안 쟀다"*는 뜻이다.**
      console.warn(
        '[P10-1] mdimport·qlmanage 가 없어 받는 쪽 검사를 안 돌렸습니다 (macOS 밖). ' +
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
