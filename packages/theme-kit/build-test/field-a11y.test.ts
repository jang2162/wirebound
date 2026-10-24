/**
 * **값 칸의 입력 조각이 필드 라벨 · 필수와 짝 지어지는가** — Chrome 접근성 트리(`Accessibility.getFullAXTree`)로 잰다.
 *
 * 입력 칸만 훑는 판(양식 목록 · 다음 입력 칸으로 건너뛰기)에서는 묶음(`group`)의 이름을 지나지 않는다 — 조각 제 이름이 어느 라벨의 칸인지
 * 말해야 한다. 렌더러가 `Field` 몸통의 입력 조각에 필드 이름(`ViewProps.field`)을 넘기고 기본 뷰가 그것을 이름 · `aria-required` 로 편다.
 *
 * | 꼴 | 조각의 이름 |
 * |---|---|
 * | 입력 조각 하나(`[Input][단추]` 도 — 단추 · 사이 글자는 안 센다) | 라벨 |
 * | 입력 조각 여럿 | 라벨 + 별칭, 별칭이 없으면 라벨 + 차례(1부터) — 서로 갈린다 |
 * | 필드 밖의 조각 | 안내 문구 · 종류 이름(지금 그대로) |
 *
 * 테마 둘 — 기본테마(`system-themes/admin` 의 토큰 · `theme.css` · SDK 기본 CSS)와 SDK 기본 CSS 만 실은 판(스타터 테마의 첫 모습). 기본테마는
 * 뷰를 안 내 두 판 모두 SDK 기본 뷰로 선다 — 이름은 CSS 와 무관해야 한다(`display: none` 이 아니면). 소스 CSS 는 `readFileSync` 로 읽는다(build
 * 프로젝트에서 `?raw` 는 빈 글자다).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { renderToStaticMarkup } from 'react-dom/server'
import { chromium, type Browser } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { installCatalog, type PageDocument } from '@wirebound/schema'
import { renderDocument } from '@wirebound/renderer'
import { defaultViewsCss, type ThemeManifest } from '@wirebound/theme-sdk'
import { tokensCss } from '@wirebound/themes'

const repoRoot = process.cwd()

/** 띄워지는 첫 후보 — `shots.test.ts` 와 같은 차례. */
async function launch(): Promise<{ browser: Browser | null; skipReason: string }> {
  const fromShell = process.env.EDITOR_BROWSER_PATH
  const candidates =
    fromShell !== undefined && fromShell !== ''
      ? [fromShell]
      : ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', chromium.executablePath()]
  const failures: string[] = []
  for (const candidate of candidates) {
    try {
      return { browser: await chromium.launch({ executablePath: candidate, headless: true }), skipReason: '' }
    } catch (error) {
      failures.push(`${candidate}: ${(error as Error).message.split('\n')[0]}`)
    }
  }
  return { browser: null, skipReason: failures.join(' · ') }
}

const launched = await launch()
if (launched.browser === null) console.warn(`[field-a11y] Chrome 을 못 띄워 건너뛴다 — ${launched.skipReason}`)

const field = (id: string, props: Record<string, unknown>, children: unknown[]) => ({ id, type: 'Field', props, children })

const DOC = {
  version: 4,
  root: {
    id: 'n_r',
    type: 'Page',
    children: [
      {
        id: 'n_ef',
        type: 'EntryForm',
        props: { title: '등록' },
        children: [
          field('fa', { label: '이름', required: true }, [{ id: 'ia', type: 'Input', props: { placeholder: '이름을 입력' } }]),
          field('fb', { label: '나이' }, [{ id: 'ib', type: 'Input', props: { kind: 'number' } }]),
          field('fc', { label: '기간', required: true }, [
            { id: 'ic1', type: 'DateInput' },
            { id: 'ic2', type: 'Affix', props: { text: '~' } },
            { id: 'ic3', type: 'DateInput' },
          ]),
          field('fg', { label: '근무' }, [
            { id: 'ig1', type: 'TimeInput', alias: '시작' },
            { id: 'ig2', type: 'Affix', props: { text: '부터' } },
            { id: 'ig3', type: 'TimeInput', alias: '끝' },
          ]),
          field('fd', { label: '상태' }, [
            { id: 'id', type: 'Select', props: { options: [{ label: '가' }, { label: '나', selected: true }] } },
          ]),
          field('fe', { label: '여부', required: true }, [
            { id: 'ie', type: 'RadioGroup', props: { options: [{ label: 'Y', selected: true }, { label: 'N' }] } },
          ]),
          field('ff', { label: '요일' }, [
            { id: 'iff', type: 'CheckboxGroup', props: { options: [{ label: '월', selected: true }, { label: '화' }] } },
          ]),
          field('fh', { label: '아이디' }, [
            { id: 'ih1', type: 'Input' },
            { id: 'ih2', type: 'Button', props: { label: '중복확인' } },
          ]),
          field('fi', { label: '소개' }, [{ id: 'ii', type: 'TextArea' }]),
        ],
      },
      { id: 'n_bar', type: 'Flex', children: [{ id: 'n_out', type: 'Input', props: { placeholder: '필드 밖' } }] },
    ],
  },
}

/**
 * 같은 필드를 폼 표(제목 · 2열 · 나이는 몫 2 — 그 앞 구멍과 끝에 빈 쌍이 선다)에 넣은 판. 쌍 격자는 CSS(subgrid)라 이름이 그대로여야 하고, 제목이 표 하나를
 * 이름 붙은 `group` 으로 낸다. 빈 쌍(`aria-hidden`)은 트리에 안 선다.
 */
const TABLE_DOC = {
  ...DOC,
  root: {
    ...DOC.root,
    children: [
      {
        ...DOC.root.children[0]!,
        children: [
          {
            id: 'n_ft',
            type: 'FormTable',
            props: { title: '등록 정보', columns: 2 },
            children: DOC.root.children[0]!.children!.map((child) => (child.id === 'fb' ? { ...child, weight: 2 } : child)),
          },
        ],
      },
      DOC.root.children[1]!,
    ],
  },
}

/** 이 판에서 보는 역할 — 입력 조각 · 묶음 · 단추. */
const ROLES = ['textbox', 'spinbutton', 'combobox', 'radiogroup', 'group', 'button']

interface Row {
  role: string
  name: string
  required: boolean | null
}

async function axRows(css: string, doc: unknown = DOC): Promise<Row[]> {
  const html = renderToStaticMarkup(renderDocument(doc as unknown as PageDocument, {}))
  const page = await launched.browser!.newPage()
  try {
    await page.setContent(
      `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>${css}</style></head><body>${html}</body></html>`,
    )
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Accessibility.enable')
    const { nodes } = (await cdp.send('Accessibility.getFullAXTree')) as {
      nodes: {
        ignored: boolean
        role?: { value: string }
        name?: { value: string }
        properties?: { name: string; value: { value: unknown } }[]
      }[]
    }
    return nodes
      .filter((node) => !node.ignored && ROLES.includes(node.role?.value ?? ''))
      .map((node) => ({
        role: node.role!.value,
        name: node.name?.value ?? '',
        required: (node.properties?.find((property) => property.name === 'required')?.value.value as boolean | undefined) ?? null,
      }))
  } finally {
    await page.close()
  }
}

const sorted = (rows: readonly Row[]): Row[] => [...rows].sort((a, b) => `${a.role} ${a.name}`.localeCompare(`${b.role} ${b.name}`))

async function adminCss(): Promise<string> {
  const source = readFileSync(join(repoRoot, 'system-themes/admin/src/theme.css'), 'utf8')
  expect(source.length).toBeGreaterThan(0)
  const { MANIFEST } = (await import(pathToFileURL(join(repoRoot, 'system-themes/admin/src/manifest.ts')).href)) as {
    MANIFEST: ThemeManifest
  }
  return `${tokensCss(MANIFEST).css}\n${defaultViewsCss()}\n${source}`
}

describe.skipIf(launched.browser === null)('값 칸 조각의 접근 이름 (Chrome 접근성 트리)', () => {
  beforeAll(() => installCatalog())
  afterAll(async () => {
    await launched.browser?.close()
  })

  for (const [theme, css] of [
    ['기본테마', adminCss],
    ['SDK 기본 CSS', async () => defaultViewsCss()],
  ] as const) {
    it(`${theme} — 조각 하나면 라벨 · 여럿이면 라벨 + 별칭(없으면 차례) · 필수는 aria-required · 필드 밖은 그대로`, async () => {
      const rows = await axRows(await css())
      const inputs = rows.filter((row) => row.role !== 'group' && row.role !== 'button')
      // 카나리아 — 입력 조각 열하나(이름 · 나이 · 기간 둘 · 근무 둘 · 상태 · 여부 · 아이디 · 소개 · 필드 밖) + 체크 묶음은 `group` 이다.
      expect(inputs).toHaveLength(11)
      // 접근성 트리의 노드 차례는 DOM 차례가 아니다 — 역할 · 이름으로 늘어놓고 견준다.
      expect(sorted(inputs)).toEqual(
        sorted([
          { role: 'textbox', name: '이름', required: true },
          { role: 'spinbutton', name: '나이', required: false },
          { role: 'textbox', name: '기간 1', required: true },
          { role: 'textbox', name: '기간 2', required: true },
          { role: 'textbox', name: '근무 시작', required: false },
          { role: 'textbox', name: '근무 끝', required: false },
          { role: 'combobox', name: '상태', required: false },
          { role: 'radiogroup', name: '여부', required: true },
          { role: 'textbox', name: '아이디', required: false },
          { role: 'textbox', name: '소개', required: false },
          { role: 'textbox', name: '필드 밖', required: false },
        ]),
      )
      // 체크 묶음은 필드 이름을 단 `group` 이다(그룹 역할은 `aria-required` 를 안 받는다) — 필드 뿌리 묶음 아홉 뒤에 선다.
      expect(rows.filter((row) => row.role === 'group').map((row) => row.name)).toContain('요일')
      // 단추는 제 이름 그대로다 — 필드 이름을 받지 않는다.
      expect(rows.filter((row) => row.role === 'button').map((row) => row.name)).toContain('중복확인')
    })

    // 필수 별은 라벨 조각의 생성 내용(`::before`)이라 대체 글을 안 주면 묶음 이름에 든다(«* 이름»). 필수는 입력 조각의 `required` 가 말한다.
    it(`${theme} — 필수 필드의 묶음 이름은 라벨 그대로다 — 필수 별은 이름에 안 든다`, async () => {
      const rows = await axRows(await css())
      const groups = rows.filter((row) => row.role === 'group').map((row) => row.name)
      // 카나리아 — 필수 필드 «이름» 의 입력 조각이 필수다.
      expect(rows).toContainEqual({ role: 'textbox', name: '이름', required: true })
      expect(groups).toContain('이름')
      expect(groups.filter((name) => name.includes('*'))).toEqual([])
    })

    it(`${theme} — 폼 표 안에서도 같은 이름 · 표는 제목 이름의 group · 빈 쌍은 트리에 없다`, async () => {
      const flat = await axRows(await css())
      const rows = await axRows(await css(), TABLE_DOC)
      // 카나리아 — 표가 섰다(빈 쌍 둘이 DOM 에 있다).
      const html = renderToStaticMarkup(renderDocument(TABLE_DOC as unknown as PageDocument, {}))
      expect(html.split('data-wb-part="filler"').length - 1).toBe(2)
      const groups = (list: readonly Row[]) => list.filter((row) => row.role === 'group').map((row) => row.name)
      expect(sorted(rows.filter((row) => row.role !== 'group'))).toEqual(sorted(flat.filter((row) => row.role !== 'group')))
      expect([...groups(rows)].sort()).toEqual([...groups(flat), '등록 정보'].sort())
    })
  }
})
