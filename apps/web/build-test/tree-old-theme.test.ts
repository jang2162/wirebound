/**
 * **앞 판 기본테마에 고정된 프로젝트로 트리 내보내기 — 실브라우저 판.** 트리 기본 뷰는 줄을 옛 조각 이름(`node`)으로 두고 품는 항목에 새 이름(`item`)을
 * 줬다(`docs/superpowers/plans/2026-11-03-tr-report.md` 결정 3) — 테마가 `[data-wb-part="node"]` 를 한 줄로 꾸민 앞 판(1.5.0 · 1.6.0 · 1.7.0)이 새 DOM 에
 * 그대로 맞는지 잰다.
 *
 * | 케이스 | 무엇이 거짓이면 죽나 |
 * |---|---|
 * | 판마다(1.5.0 · 1.6.0 · 1.7.0) | 내보내기 미리보기(HTML · PPTX)의 `themeWarning` 이 비지 않는다 · 번들이 그 판의 테마 CSS 를 안 싣는다 · 펼친 항목의 자식 목록이 줄 아래 · 한 단 들여 서지 않는다(줄 옆에 선다) · 접힌 항목의 자식이 그려진다 · PPTX 에 그 쪽의 화면 그림이 없다 |
 *
 * 픽스처 `fixtures/system-admin-<판>.wbtheme` 은 그 판의 커밋을 `git archive` 로 풀어 그 판의 kit 로 지은 것이다 — sha256 이
 * `system-themes/admin/checksums.json` 의 그 줄과 같다(사용자 DB 에 시딩된 판). 1.5.0 은 `0b1ecdae^`, 1.6.0 은 `2b1f4b8e`, 1.7.0 은 `1fa01f1e`
 * (줄이 마지막으로 값을 바꾼 커밋 — 1.5.0 은 그 다음 커밋이 다시 지은 값이다). 1.5.0 · 1.6.0 의 manifest 는 걷힌 `List` 를 선언해 지금 kit 로는 못 짓는다.
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { unzipSync } from 'fflate'
import { readWbtheme } from '@wirebound/themes'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { editorStackPrerequisite, startEditorStack, type EditorStack, type Session } from './editor-stack'
import { cssMentions, exportBundle, openBundlePage } from './layout-bundle'
import { decodePng } from './png-pixels'
import { putTheme } from './theme-fixtures'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

const VERSIONS = ['1.5.0', '1.6.0', '1.7.0'] as const
const fixture = (version: string) => fileURLToPath(new URL(`./fixtures/system-admin-${version}.wbtheme`, import.meta.url))
const CHECKSUMS = fileURLToPath(new URL('../../../system-themes/admin/checksums.json', import.meta.url))

/** 세 단 · 펼친 항목 둘 · 접힌 항목 하나 · 잎. 펼친 것만 그려 보이는 이름은 다섯이다. */
const TREE = {
  id: 't_tree',
  type: 'Tree',
  props: {
    items: [
      {
        label: '가',
        open: true,
        children: [{ label: '가-1', open: true, children: [{ label: '가-1-a' }] }, { label: '가-2' }],
      },
      { label: '나', children: [{ label: '나-1' }] },
    ],
  },
}

describe.skipIf(!전제.ok)('앞 판 기본테마에 고정된 트리 내보내기(실브라우저)', () => {
  let stack: EditorStack
  let alice: Session

  beforeAll(async () => {
    if (!전제.ok) return
    stack = await startEditorStack(전제)
    alice = await stack.login(stack.users.alice)
  })

  afterAll(async () => {
    if (stack === undefined) return
    const { after } = await stack.close()
    expect(after).toEqual({ processes: 0, listeningPorts: [], databases: 0 })
  })

  const call = (m: string, p: string, b?: unknown) => stack.request(alice, m, p, b)

  /** 그 판을 시딩된 판처럼 넣는다(`theme-system.test.ts` 의 0.1.0 과 같은 길) · 테마 CSS 를 돌려준다. */
  async function install(version: string): Promise<string> {
    const bytes = readFileSync(fixture(version))
    const sha256 = createHash('sha256').update(bytes).digest('hex')
    expect(sha256, `${version} 픽스처가 사용자 DB 에 시딩된 판(체크섬 줄)과 같다`).toBe(
      JSON.parse(readFileSync(CHECKSUMS, 'utf8'))[`system-admin@${version}`],
    )
    const { files } = readWbtheme(new Uint8Array(bytes), { stored: true })
    const m = files!.manifest
    await stack.query(
      `insert into theme_packages (theme_id, version, name, description, sdk_range, manifest, files, size, sha256, uploaded_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, null)`,
      [m.id, m.version, m.name, m.description ?? null, m.sdk, JSON.stringify(m), bytes, bytes.byteLength, sha256],
    )
    return files!.themeCss ?? ''
  }

  for (const version of VERSIONS) {
    it(`기본테마 ${version} — 미리보기 경고 없음 · 번들의 트리가 줄 아래로 한 단씩 들여 선다 · PPTX 화면 그림`, async () => {
      const css = await install(version)
      // 카나리아 — 그 판의 테마 CSS 가 줄(`node` 조각)을 꾸민다. 안 꾸미면 이 판은 결정 3 을 안 잰다.
      expect(css.includes('data-wb-part="node"') || css.includes("data-wb-part='node'") || css.includes('data-wb-part=node')).toBe(true)

      const project = (
        await call('POST', '/projects', {
          name: `옛 판 트리 ${version}`,
          slug: `tree-old-${version.replaceAll('.', '')}-${Date.now().toString(36)}`,
        })
      ).body
      const menu = (await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '메뉴' })).body
      const pageId = (await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '트리' })).body.id as string
      const seeded = await call('PATCH', `/projects/${project.id}/pages/${pageId}/ops`, {
        baseSeq: 0,
        ops: [{ op: 'add', path: '/root/children/0', value: TREE }],
      })
      expect(seeded.status).toBe(200)
      await putTheme(call, project.id, { themeId: 'system-admin', version, tokens: {} })

      const preview = async (format: string) => {
        const r = await call('GET', `/projects/${project.id}/export/preview?format=${format}`)
        return {
          status: r.status,
          ...(r.body.themeId === undefined ? {} : { theme: r.body.themeId }),
          themeWarning: r.body.themeWarning ?? null,
        }
      }
      const previews = { html: await preview('html'), pptx: await preview('pptx') }

      const bundle = await exportBundle(stack, alice, project.id)
      let tree: unknown
      let bundledCss: number
      try {
        // 카나리아 — 번들이 그 판의 테마 CSS 를 실었다(그 판 CSS 의 첫 규칙 조각이 번들의 테마 CSS 에 있다).
        bundledCss = cssMentions(bundle, 'assets/theme/theme.css', css.slice(0, 60))
        const file = Object.values(bundle.pages)[0]!
        const { context, page } = await openBundlePage(stack, file, { viewport: { width: 1280, height: 900 }, screen: true })
        try {
          tree = await page.evaluate(() => {
            const root = document.querySelector('[data-wb-id="t_tree"]')!
            const labels = [...root.querySelectorAll('[data-wb-part="label"]')].map((el) => el.textContent)
            // 펼친 항목마다: 자식 목록의 위끝이 그 줄의 아래끝 이상(줄 아래) · 자식 줄의 왼끝이 그 줄보다 오른쪽(들여 섬).
            // 찾기는 직계(`:scope >`)로 묶지 않는다 — 조각의 품는 꼴이 바뀐 판(자식 목록이 줄 안)도 값(`below: false`)으로 죽게.
            const open = [...root.querySelectorAll('[data-wb-part="item"][data-wb-open="true"]')].map((item) => {
              const row = item.querySelector('[data-wb-part="node"]')!.getBoundingClientRect()
              // «줄 아래» 는 이름 글 아래로 잰다 — 줄 상자로 재면 테마와 무관하게 품는 꼴만으로 갈린다. 테마가 줄을 가로로 펴 자식이 이름 옆에 서면 거짓이다.
              const name = item.querySelector('[data-wb-part="label"]')!.getBoundingClientRect()
              const list = item.querySelector('[data-wb-part="children"]')!
              const child = list.querySelector('[data-wb-part="node"]')!.getBoundingClientRect()
              return {
                label: item.querySelector('[data-wb-part="label"]')!.textContent,
                below: list.getBoundingClientRect().top >= name.bottom - 0.5,
                indented: child.left > row.left + 0.5,
              }
            })
            return { labels, open }
          })
        } finally {
          await context.close()
        }
      } finally {
        bundle.dispose()
      }

      const pptx = await fetch(`${stack.apiUrl}/api/projects/${project.id}/export?format=pptx`, { headers: { cookie: alice.cookie } })
      const entries = pptx.status === 200 ? unzipSync(new Uint8Array(await pptx.arrayBuffer())) : {}
      const shots = Object.entries(entries)
        .filter(([path]) => path.startsWith('ppt/media/') && path.endsWith('.png'))
        .map(([, bytes]) => decodePng(Buffer.from(bytes)).width)

      // eslint-disable-next-line no-console
      console.log(`[옛 판 트리 ${version}]`, JSON.stringify({ previews, bundledCss, tree, pptx: pptx.status, shots }))
      expect({ previews, bundled: bundledCss > 0, tree, pptx: pptx.status, shots: shots.length }).toEqual({
        previews: {
          html: { status: 200, theme: `system-admin@${version}`, themeWarning: null },
          // PPTX 미리보기 답에는 `themeId` 칸이 없다 — 경고만 본다.
          pptx: { status: 200, themeWarning: null },
        },
        bundled: true,
        tree: {
          labels: ['가', '가-1', '가-1-a', '가-2', '나'],
          open: [
            { label: '가', below: true, indented: true },
            { label: '가-1', below: true, indented: true },
          ],
        },
        pptx: 200,
        shots: 1,
      })
    }, 180_000)
  }
})
