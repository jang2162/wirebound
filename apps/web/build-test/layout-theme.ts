/**
 * **레이아웃 뷰를 낸 픽스처 테마**(`layout@1.0.0`) — 캔버스의 서브페이지 틀 판(`page-layout-canvas.test.ts`)이 쓴다. 시스템 테마(기본테마 2.1.0)는
 * 레이아웃 뷰가 없어 서브페이지가 내용만 그린다(SDK 기본) — 틀을 재려면 틀을 그리는 테마가 든다. kit 의 `sample-theme` 를 복사해 manifest 에
 * `layouts.subpage` 를 선언하고 레이아웃 뷰를 더해 `buildTheme` 로 짓는다(`theme-fixtures.ts` 의 `controlsTheme` 와 같은 꼴 — 업로드가 받는 진짜
 * 산출물이다).
 *
 * 치수는 lms-skala 관리자 셸의 꼴을 따른다(설계 `docs/superpowers/specs/2026-11-25-page-layout-design.md` 머리 — GNB 높이 60 · LNB 폭 240 · 본문 패딩
 * 24/28). 영역 넷은 다 끌 수 있다.
 */
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildTheme } from '@wirebound/theme-kit'

const SAMPLE_ROOT = fileURLToPath(new URL('../../../packages/theme-kit/test/fixtures/sample-theme/', import.meta.url))

export const LAYOUT_THEME = { id: 'layout', version: '1.0.0' } as const

/** 틀의 치수(px) — 케이스가 «틀이 민 만큼» 을 이 값으로 견준다. */
export const GNB_HEIGHT = 60
export const LNB_WIDTH = 240

export async function layoutTheme(): Promise<Uint8Array> {
  const dir = mkdtempSync(join(tmpdir(), 'wb-layout-theme-'))
  try {
    cpSync(SAMPLE_ROOT, dir, { recursive: true })
    writeFileSync(
      join(dir, 'theme.config.ts'),
      `import { defineManifest } from '@wirebound/theme-sdk'
export default defineManifest({
  id: '${LAYOUT_THEME.id}',
  name: '레이아웃 판',
  version: '${LAYOUT_THEME.version}',
  sdk: '^1.10.0',
  tokens: { items: {} },
  layouts: {
    subpage: {
      regions: [
        { id: 'gnb', label: 'GNB' },
        { id: 'lnb', label: 'LNB' },
        { id: 'breadcrumb', label: '브레드크럼브' },
        { id: 'title', label: '페이지 제목' },
      ],
    },
  },
})
`,
    )
    writeFileSync(
      join(dir, 'src/index.tsx'),
      `import { defineTheme, LayoutLink, LayoutRegion, type LayoutView } from '@wirebound/theme-sdk'
import manifest from '../theme.config'
import './theme.css'
const Subpage: LayoutView = (props) => (
  <div data-wb-part="shell">
    <LayoutRegion id="gnb" as="nav" data-wb-part="gnb">
      {props.gnb.map((item) => <LayoutLink key={item.id} item={item} />)}
    </LayoutRegion>
    <div data-wb-part="frame-body">
      <LayoutRegion id="lnb" as="nav" data-wb-part="lnb">
        {(props.lnb?.children ?? []).map((item) => <LayoutLink key={item.id} item={item} />)}
      </LayoutRegion>
      <div data-wb-part="frame-main">
        <LayoutRegion id="breadcrumb" data-wb-part="breadcrumb">
          {props.trail.map((item) => <LayoutLink key={item.id} item={item} />)}
        </LayoutRegion>
        <LayoutRegion id="title" as="h1" data-wb-part="title">{props.title}</LayoutRegion>
        {props.children}
      </div>
    </div>
  </div>
)
export default defineTheme({ manifest, views: {}, layouts: { subpage: Subpage } })
`,
    )
    writeFileSync(
      join(dir, 'src/theme.css'),
      `[data-wb-part="gnb"] { display: flex; align-items: center; gap: 16px; box-sizing: border-box; height: ${GNB_HEIGHT}px; padding: 0 24px; background: #1e293b; }
[data-wb-part="gnb"] a { color: #fff; }
[data-wb-part="frame-body"] { display: flex; align-items: stretch; }
[data-wb-part="lnb"] { flex: none; box-sizing: border-box; width: ${LNB_WIDTH}px; background: #f1f5f9; }
[data-wb-part="lnb"] a { display: block; padding: 12px 16px; }
[data-wb-part="frame-main"] { flex: 1; min-width: 0; padding: 24px 28px; }
[data-wb-part="breadcrumb"] { display: flex; gap: 8px; font-size: 12.5px; }
[data-wb-part="title"] { margin: 8px 0 16px; font-size: 22px; }
`,
    )
    const built = await buildTheme({ root: dir, entry: 'src/index.tsx', outDir: join(dir, 'out') })
    return new Uint8Array(readFileSync(built.file))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
