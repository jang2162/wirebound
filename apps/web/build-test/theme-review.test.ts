/**
 * **A4 리뷰가 찾은 틈** — 실브라우저 판(`docs/superpowers/plans/2026-09-28-a4-review.md`). 앞 넷은 그 틈이 다시 서지 않는지 잰다 —
 * 고치기 전 소스에서 빨강이었다(`docs/superpowers/plans/2026-09-28-a4-fix-report.md`). 마지막 하나는 원래 성질(층 안의 전이 멈춤이 층 밖
 * `!important` 전이를 이긴다)을 잠근다 — 그 성질을 재는 케이스가 없었다.
 *
 * 픽스처 테마는 kit 이 지은 `sample@1.0.0`(`theme-fixtures.ts` 의 `sampleTheme`)의 `theme.js` · `manifest.json` 을 글자로 고쳐 다시 묶는다
 * (`packWbtheme`) — 업로드가 받는 진짜 모양이고, 고친 자리는 케이스마다 적었다.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright-core'
import { packWbtheme, readWbtheme, type WbthemeFiles } from '@wirebound/themes'
import { canvasFrame, editorStackPrerequisite, poll, startEditorStack, type EditorStack, type Session } from './editor-stack'
import { makeAdmin, putTheme, sampleTheme, themeProject, uploadRaw } from './theme-fixtures'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** 샘플을 `id@version` 으로 다시 묶는다. `js` · `manifest` · `css` 로 그 판만의 모양을 준다. */
function remake(
  base: WbthemeFiles,
  options: { id: string; version: string; js?: (js: string) => string; manifest?: (manifest: any) => any; css?: string },
): Uint8Array {
  let js = base.themeJs.replace('id:"sample"', `id:"${options.id}"`).replace('version:"1.0.0"', `version:"${options.version}"`)
  if (options.js !== undefined) js = options.js(js)
  let manifest: any = { ...base.manifest, id: options.id, version: options.version }
  if (options.manifest !== undefined) manifest = options.manifest(manifest)
  return packWbtheme({ manifest, themeJs: js, themeCss: options.css ?? base.themeCss, assets: base.assets })
}

/** 캔버스 문서에서 값 하나를 읽는다 — iframe 이 없으면 `null`. */
async function inCanvas<T>(page: Page, read: () => T): Promise<T | null> {
  const handle = await page.$('iframe.wb-shell-canvas-iframe')
  const frame = await handle?.contentFrame()
  if (frame === null || frame === undefined) return null
  return frame.evaluate(read)
}

const REGISTER = 'globalThis.__wirebound_runtime__.register(s)'

describe.skipIf(!전제.ok)('A4 리뷰', () => {
  let stack: EditorStack
  let alice: Session
  let base: WbthemeFiles

  async function upload(bytes: Uint8Array): Promise<void> {
    expect(await uploadRaw(stack, alice, bytes)).toBe(201)
  }

  beforeAll(async () => {
    if (!전제.ok) return
    stack = await startEditorStack(전제)
    await makeAdmin(stack, stack.users.alice)
    alice = await stack.login(stack.users.alice)
    const sample = await sampleTheme()
    base = readWbtheme(sample).files!
    // 같은 테마의 두 판 — 둘 다 토큰 `color.primary` 를 선언한다.
    await upload(sample)
    await upload(remake(base, { id: 'sample', version: '1.0.1' }))
  })

  afterAll(async () => {
    if (stack === undefined) return
    const { before, after } = await stack.close()
    expect(before.processes).toBeGreaterThan(0)
    expect(before.listeningPorts.length).toBeGreaterThanOrEqual(2)
    expect(before.databases).toBe(1)
    expect(after).toEqual({ processes: 0, listeningPorts: [], databases: 0 })
  })

  /**
   * 고르개의 저장 · 고르개의 409 다시 읽기도 절이 토큰 편집기에 넘기는 바인딩(`view`)을 바꾼다 — 편집기가 그때 초안을 서버 값으로 다시
   * 세우면 저장 안 한 값이 말없이 사라진다(`settings/token-editor.tsx` 머리말 «바인딩이 바뀌어도»). 판정: 초안이 새 판에도 있는 키면 남는다.
   */
  it('토큰 초안을 둔 채 같은 테마의 새 판으로 바꿔도 친 값이 말없이 사라지지 않는다', async () => {
    const project = await themeProject(stack, alice)
    await putTheme(project.call, project.id, { themeId: 'sample', version: '1.0.0', tokens: {} })
    const { context, page } = await stack.openTab(stack.users.alice)
    try {
      await page.goto(`/projects/${project.id}/settings?section=theme`)
      const section = page.getByRole('region', { name: '테마' })
      const primary = page.getByRole('group', { name: '토큰' }).getByLabel('주색', { exact: true })
      await primary.fill('#ff5500')
      await section.getByLabel('버전', { exact: true }).selectOption('1.0.1')
      await section.getByRole('group', { name: '테마 바꾸기 확인' }).getByRole('button', { name: '바꾸기' }).click()
      await section.getByText('샘플 sample@1.0.1').waitFor()
      // 판이 섰다 — 서버가 새 판이다.
      expect((await project.call('GET', `/projects/${project.id}/theme`)).body.version).toBe('1.0.1')
      await sleep(300)
      expect(await primary.inputValue()).toBe('#ff5500')
    } finally {
      await context.close()
    }
  })

  it('토큰 초안을 둔 채 고르개가 409 로 다시 읽어도 친 값이 말없이 사라지지 않는다', async () => {
    const project = await themeProject(stack, alice)
    await putTheme(project.call, project.id, { themeId: 'sample', version: '1.0.0', tokens: {} })
    const { context, page } = await stack.openTab(stack.users.alice)
    try {
      await page.goto(`/projects/${project.id}/settings?section=theme`)
      const section = page.getByRole('region', { name: '테마' })
      const primary = page.getByRole('group', { name: '토큰' }).getByLabel('주색', { exact: true })
      await primary.fill('#ff5500')
      await putTheme(project.call, project.id, { themeId: 'sample', version: '1.0.0', tokens: { 'color.primary': '#000000' } })
      await section.getByLabel('버전', { exact: true }).selectOption('1.0.1')
      await section.getByRole('group', { name: '테마 바꾸기 확인' }).getByRole('button', { name: '바꾸기' }).click()
      // 판이 섰다 — 고르개가 409 를 받아 절이 다시 읽었다.
      await page.getByText('다른 사람이 먼저 바꿨습니다 — 지금 값을 다시 읽었습니다').waitFor()
      await sleep(300)
      expect(await primary.inputValue()).toBe('#ff5500')
    } finally {
      await context.close()
    }
  })

  /**
   * 번들이 등록을 미루면(`setTimeout`) 그 `load` 는 빈손으로 실패하고, 미룬 등록은 런타임의 칸에 남는다. 로더가 그 칸을 가리지 않고 받으면
   * **다음 번들의 `load`** 가 제 정의로 받아 등록하지 않는 번들이 앞 번들의 뷰로 «성공» 하고 캐시된다(`theme/bundle-loader.ts` 머리말 «그
   * load 를 낸 스크립트의 등록만»). 판정: 등록하지 않은 번들은 실패로 알린다.
   */
  it('늦게 등록한 번들의 정의를 다음 번들이 제 것으로 받지 않는다', async () => {
    await upload(
      remake(base, {
        id: 'late',
        version: '1.0.0',
        js: (js) => js.replace('"샘플 카드"', '"늦은 카드"').replace(REGISTER, `setTimeout(()=>${REGISTER},0)`),
      }),
    )
    await upload(remake(base, { id: 'silent', version: '1.0.0', js: (js) => js.replace(REGISTER, 'void s') }))
    const project = await themeProject(stack, alice)
    await putTheme(project.call, project.id, { themeId: 'late', version: '1.0.0', tokens: {} })
    const { context, page } = await stack.openTab(stack.users.alice)
    const alert = page.locator('.wb-shell-theme-alert')
    try {
      await page.goto(`/projects/${project.id}/pages/${project.first}`)
      await canvasFrame(page).locator('body', { hasText: '원문' }).waitFor()
      // 판이 섰다 — 미룬 등록은 그 `load` 에 없어 실패로 알린다.
      await alert.filter({ hasText: '테마 번들이 등록하지 않았습니다(late@1.0.0)' }).waitFor()

      await putTheme(project.call, project.id, { themeId: 'silent', version: '1.0.0', tokens: {} })
      const read = async () => ({
        alert: (await alert.count()) > 0 ? await alert.innerText() : null,
        note: await inCanvas(page, () => document.querySelector('.sample-card-note')?.textContent ?? null),
      })
      await poll('silent 가 끝난다', read, (s) => s.alert?.includes('silent@1.0.0') === true || s.note !== null)
      // 알림이 걷히는 한 커밋을 넘겨 선 값으로 읽는다.
      await sleep(300)
      expect(await read()).toEqual({ alert: expect.stringContaining('테마 번들이 등록하지 않았습니다(silent@1.0.0)'), note: null })
    } finally {
      await context.close()
    }
  })

  /**
   * 캔버스는 정의의 manifest(`definition.manifest` — 렌더러의 `resolveVariant`)로 variant 를 풀고, 속성 패널 · 패턴 고르개는 서버의
   * manifest(`GET …/theme`)로 칸을 짓는다. 정의가 번들이 실은 manifest 를 그대로 쓰면 둘이 다른 패키지(업로드는 `theme.js` 를 실행하지 않아
   * 못 견준다)에서 패널이 고른 variant 를 캔버스가 말없이 기본으로 그린다(`theme/bundle-loader.ts` 의 `withServerManifest`). 판정: 패널이
   * 보이는 값과 캔버스가 그린 값이 같다.
   */
  it('번들 안 manifest 가 서버 manifest 와 달라도 패널이 보이는 variant 와 캔버스가 그리는 variant 가 같다', async () => {
    await upload(
      remake(base, {
        id: 'drift',
        version: '1.0.0',
        // 서버 manifest 에만 `huge` — 번들의 manifest 는 plain · loud 그대로다.
        manifest: (m) => ({
          ...m,
          components: { Card: { variants: [...m.components.Card.variants, { id: 'huge', label: '아주 큼' }], defaultVariant: 'plain' } },
        }),
      }),
    )
    const project = await themeProject(stack, alice)
    await putTheme(project.call, project.id, { themeId: 'drift', version: '1.0.0', tokens: {} })
    const op = await project.call('PATCH', `/projects/${project.id}/pages/${project.first}/ops`, {
      baseSeq: 1,
      ops: [{ op: 'add', path: '/root/children/1/variant', value: 'huge' }],
    })
    expect(op.status).toBe(200)
    const { context, page } = await stack.openTab(stack.users.alice)
    try {
      await page.goto(`/projects/${project.id}/pages/${project.first}`)
      await canvasFrame(page).locator('.sample-card').waitFor()
      await canvasFrame(page).locator('[data-wb-id="n_card000001"]').click()
      const panel = page.getByRole('combobox', { name: '변형' })
      await panel.waitFor()
      const drawn = await inCanvas(
        page,
        () => document.querySelector('[data-wb-id="n_card000001"]')?.getAttribute('data-wb-variant') ?? null,
      )
      expect({ panel: await panel.inputValue(), drawn }).toEqual({ panel: 'huge', drawn: 'huge' })
    } finally {
      await context.close()
    }
  })

  /**
   * 전이 멈춤(`canvas/canvas-iframe.tsx` 의 `HOLD_CSS`)은 `@layer` 안의 `!important` 다 — 층 밖(테마 시트)의 `!important` 전이를 이긴다.
   * 층을 걷으면(`*` 의 `!important`) 테마의 `.sample-card` `!important` 가 특이도로 이겨 노드가 미끄러진다 — 그 변조를 이 케이스만 죽인다
   * (`canvas-iframe.test.ts` · `theme-canvas.test.ts` · jsdom `canvas-iframe.test.tsx` 는 `!important` 없는 테마로 재 초록이었다). 층 안
   * `!important` 전이(`@layer t { … }`)도 같은 값이다 — 앞에 선언된 층이 이긴다.
   */
  it('층 밖 !important 전이를 실은 테마 CSS 가 늦게 실려도 노드가 미끄러지지 않는다', async () => {
    await upload(
      remake(base, { id: 'loud-css', version: '1.0.0', css: '.sample-card{padding:60px !important;transition:padding 1s !important}' }),
    )
    const project = await themeProject(stack, alice)
    await putTheme(project.call, project.id, { themeId: 'loud-css', version: '1.0.0', tokens: {} })
    const { context, page } = await stack.openTab(stack.users.alice)
    // 시트가 첫 그림 뒤에 오게 늦춘다.
    await page.route('**/loud-css/1.0.0/files/theme.css', async (route) => {
      await sleep(800)
      await route.continue()
    })
    try {
      await page.goto(`/projects/${project.id}/pages/${project.first}`)
      await canvasFrame(page).locator('.sample-card').waitFor()
      const heights = (await inCanvas(
        page,
        () =>
          new Promise<number[]>((resolve) => {
            const out: number[] = []
            const t0 = performance.now()
            const step = () => {
              const el = document.querySelector('.sample-card')
              out.push(el === null ? -1 : Math.round(el.getBoundingClientRect().height * 10) / 10)
              if (performance.now() - t0 < 2500) requestAnimationFrame(step)
              else resolve(out)
            }
            requestAnimationFrame(step)
          }),
      ))!
      const runs = heights.filter((h, i) => i === 0 || h !== heights[i - 1])
      // 카나리아: 시트가 실렸고(padding 60px) 멈춤이 걷혀 전이가 되살아났다.
      const after = await inCanvas(page, () => {
        const el = document.querySelector('.sample-card')!
        return {
          padding: getComputedStyle(el).paddingTop,
          duration: getComputedStyle(el).transitionDuration,
          hold: document.querySelector('style[data-wb-hold]') !== null,
        }
      })
      expect(after).toEqual({ padding: '60px', duration: '1s', hold: false })
      expect(runs.length, `자리 ${runs.join(', ')}`).toBeLessThanOrEqual(2)
    } finally {
      await context.close()
    }
  })
})
