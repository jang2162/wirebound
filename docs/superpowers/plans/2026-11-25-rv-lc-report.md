# rv-lc 보고 — 레이아웃 T6(캔버스) 반증 리뷰

브리프: 코디네이터 `brief-rv-lc.md` · 공통 `common-ly3.md`. 대상 `feat/layout-canvas`(머리 `60261054` · 기준 main `27ef2cc9`). 판 Node v24.21.0 · DB 컨테이너 5547(`pnpm db port postgres 5432` → `0.0.0.0:5547`). **고치지 않았다** — 재현 · 값 · 탐침 원문만.

시작 · 끝 모두 `git ls-files -s | md5` = `f1ed53c2ca1564dca35a8573ed651a87` · `git status --short` = `?? .build/` 한 줄. `orca terminal list` 의 이 워크트리 터미널은 둘(셋업 «초기 설정» · 빈 셸 — 에이전트 없음). 이 세션은 목록에 안 보였다 — 위 md5 · status 를 시작 · 끝에 견줘 다른 쓰는 자가 없었음을 적는다.

## 요약 — 높음 0 · 중간 0 · 낮음 3

| # | 무엇 | 무게 | 새 장치가 연 길? |
|---|---|---|---|
| L1 | 표시 옵션: GET 답이 오기 **전에** 바꾸고 그 PUT 이 실패하면 화면이 «다 켬» 으로 돌아가 서버 값(`subpage.gnb`)과 갈린다 | 낮음(지금은 `set` 을 부르는 자리가 없다 — T7 «보기» 가 서면 중간) | 새 길(`use-view-prefs.ts`) |
| L2 | 뷰 모드 틀 링크로 **지금 페이지**를 누르면 이력이 한 칸 쌓인다(메뉴 트리 링크는 안 쌓는다) — «뒤로» 를 두 번 눌러야 나간다 | 낮음 | 새 길(`canvas.tsx` 의 `frameNavigate`) |
| L3 | 팝업 레이아웃의 막이 iframe 높이를 다 덮지 않는다(막 231px · iframe 320px) — 막 아래 바탕을 누르면 고름이 비고, 그 자리에 놓으면 «페이지 끝» 으로 들어간다. 막 위는 둘 다 안 된다 | 낮음 | 새 길(막은 이 차례에 섰다 · 바탕 갈래는 옛 것) |

나머지 겨눔(틀 위 누름 · 끌기 · 손잡이 옮기기 · 맞춤 배율 측정 · 페이지 왕복 · 넓은 팝업 · 덮개 층 · 앞 판 테마)은 값이 설계와 맞았다(아래 «잰 값»).

## 항목

### L1 — 표시 옵션: GET 전에 바꾼 판의 실패 되돌림

- **재현(jsdom)**: `apps/web/test/store/view-prefs.test.tsx` 의 `fakeServer` · `mount` · `latest` · `shown` 을 그대로 쓴 임시 파일 `apps/web/test/store/rv-lc-probe.test.tsx`(돌린 뒤 지움 — 커밋 안 함). 서버 처음 값 `['subpage.gnb']`.
  - F1: `set(['subpage.lnb'])` → GET 답 `['subpage.gnb']` → 그 PUT 실패 ⇒ `{"screen":"","server":["subpage.gnb"],"failure":{"kind":"message","message":"보기 설정을 저장하지 못했습니다"}}`
  - F2(대조 · GET 뒤에 바꿈): ⇒ `{"screen":"subpage.gnb","server":["subpage.gnb"]}`
- **기전**: `ViewPrefsProvider` 의 GET 답 처리가 `touched.current` 면 `saved.current` 까지 안 적고 버린다(`apps/web/src/store/use-view-prefs.ts` 의 `getViewPrefs(...).then`). 실패 되돌림은 `saved.current` 로 가므로 «서버가 받아 준 값» 이 아니라 처음 값(빈 목록)으로 간다. 머리말 표 «마지막으로 보낸 PUT 이 실패하면 | 서버가 마지막으로 받아 준 값으로 되돌리고» 와 어긋난다. 화면을 다시 열면 GNB 가 꺼진 채 선다 — 데이터는 안 잃는다.
- 고칠 방향(대응 트랙이 변조로 잰다): GET 답은 화면에 싣지 않더라도 `saved.current` 에는 적는다. 대응 케이스는 위 F1 꼴 — 그 한 줄을 뗀 변조가 `''` ≠ `subpage.gnb` 로 혼자 죽는다.
- 원문:

```tsx
it('GET 이 오기 전에 바꾸고 PUT 이 실패하면 — 화면 · 서버', async () => {
  const server = fakeServer(['subpage.gnb'])
  const store = mount(server.api)
  act(() => latest!.set(['subpage.lnb']))
  await act(async () => server.read.resolve(['subpage.gnb']))
  await act(async () => server.fail(server.open()[0]!))
  console.log('PROBE F1 ' + JSON.stringify({ screen: shown(), server: server.server.value, failure: store.getState().editFailure }))
})
```

### L2 — 뷰 모드 틀 링크의 같은 페이지 이동이 이력을 쌓는다

- **재현(실브라우저 · 탐침 D)**: 픽스처 테마 `layout@1.0.0` · 창 1600×1000 · 줌 100%. «첫째» 를 연 뒤 뷰 모드 → LNB 의 `a[aria-current="page"]`(«첫째») 를 `pointOn` 점으로 누름 → 메뉴 트리의 «첫째» 링크를 누름.
  - `history.length`: 연 뒤 2 → 틀 링크 뒤 **3** → 메뉴 트리 링크 뒤 3. 주소는 셋 다 같은 `/projects/:id/pages/<첫째>`.
- **기전**: `frameNavigate` 가 `navigate(path)`(push)를 부른다. 메뉴 트리 칸의 `<Link>` 는 react-router 가 같은 주소면 replace 로 바꾼다. 설계 «메뉴 트리 칸의 링크와 같은 이동» 과 이력 한 칸이 갈린다. `navigate(path, { replace: 같은 주소 })` 꼴이면 맞는다.
- `?state=` 가 걸린 주소의 판은 못 쟀다 — 픽스처에 화면 상태를 안 둬서 `?state=zz` 는 연 순간 걷혔다(`view-state-address.ts` «없는 id»). 코드로는 다른 페이지로 가는 이동이 질의를 버리는 것이 메뉴 트리 링크와 같다.

### L3 — 팝업 레이아웃의 막 아래 바탕

- **재현(탐침 A · E)**: 팝업 레이아웃 «창»(글 하나) · 뷰포트 1280. 막 `[data-wb-layout="popup"]` 상자 높이 231(기본테마 2.1.0 은 196 · 1.5.0/1.7.0 은 216) · iframe `clientHeight` 320(최소 높이). 훑기(6px 격자)에서 막 아래 바탕(`HTML` · `BODY`) 점 3210(픽스처 테마). 고름 `n_pop` 인 채 막 아래(막 바닥 + 6px · x 20)를 누르면 고름 `null`.
- 설계 «뷰포트 폭 전체를 흐린 막 … 막은 틀이다 — 누름 · 끌기 대상이 아니다» 는 높이를 안 정한다. 짧은 팝업에서는 흐린 막 밑에 흰 띠가 서고, 그 띠는 옛 바탕 갈래(고름 비움 · `pageEndHit`)를 탄다 — 막 위에서 놓을 수 없던 카드가 몇 px 아래에서는 팝업 몸통 끝에 들어간다. 막에 `min-height: 100%`(iframe 높이)를 주거나 바탕 갈래를 그대로 두고 설계에 적는 쪽은 대응 트랙이 정한다.

## 잰 값 — 설계와 맞은 것

탐침 원문은 맨 아래. 판은 `startEditorStack`(일회용 DB · api · vite · Chrome) · 픽스처는 구현 케이스(`apps/web/build-test/page-layout-canvas.test.ts`)의 `fixture` 와 같은 꼴(메뉴 «가»: 첫째 · 둘째(서브) · 창(팝업) · 빈쪽(빈) / 메뉴 «나»: 셋째).

**1. 틀은 노드가 아니다**

- 탐침 C(손잡이로 노드 옮기기): `n_text` 를 고르고 `.wb-shell-canvas-handle` 을 쥐어 LNB · GNB 링크 · 브레드크럼브 · 제목 위로 — 넷 다 `shownDrops` `[]` · 서버 문서 바뀜 없음 · 고름 `n_text` 그대로.
- 구현 케이스가 이미 잰 것: 팔레트 카드를 GNB 에 놓음 · 편집 모드 틀 링크 누름 · LNB 에서 시작한 사각형.
- 코드로만 본 것: 캔버스에 더블클릭 · 오른쪽 누름(행동 메뉴) 처리기가 없다(`apps/web/src/canvas/` 에 `onDoubleClick` · `contextmenu` 0). 붙이기 · 들여쓰기 · 지우기는 고른 노드에 돈다 — 틀 누름이 고름을 안 바꾸므로 틀을 누른 뒤의 Cmd+V 는 앞서 고른 노드에 붙는다(설계 «고름도 안 바뀐다» 와 같은 뜻). 가장자리 자동 스크롤은 호스트 `.wb-shell-canvas` 상자를 보아 틀과 무관하다. 셋은 실브라우저로 안 쟀다.
- **빈 레이아웃 · 뷰 없는 서브페이지는 틀 판정이 서는 점이 0** — 탐침 A(iframe 창 전체 6px 격자 · `elementFromPoint` 가 `[data-wb-layout]` 안 · `[data-wb-layout-content]` 밖인 점):

| 테마 | 빈 | 서브페이지 | 팝업(막) |
|---|---|---|---|
| `layout@1.0.0`(픽스처) | 0 | 8148(gnb 2140 · lnb 1920 · 틀 바탕 2776 · breadcrumb 492 · title 820) | 4626 |
| `system-admin@2.1.0` | 0 | 0 | 4062 |
| `system-admin@1.7.0` | 0 | 0 | 4344 |
| `system-admin@1.5.0` | 0 | 0 | 4344 |

  빈 · 뷰 없는 서브페이지에서 노드 · 바탕 점 수가 같은 테마끼리 같다(2.1.0: 노드 5564 · 바탕 5992 / 1.5.0 · 1.7.0: 6634 · 4922) — 감싼 틀이 옛 바탕을 먹지 않는다. 뿌리 상자 = 틀 상자.

**2. 좌표가 밀린 뒤** — 탐침 B: 줌을 안 맞춘 판(맞춤 배율), 창 1440×900 → 60% · 1024×900 → 34%. `n_last` 에 코멘트(첫째 · 빈쪽 둘 다). 서브 «첫째» 에서 `n_card` 고름 → 메뉴 트리로 «빈쪽» → 고름 → «첫째» 로 돌아옴 → 고름 → 뷰 모드. 모든 걸음에서 마커 가운데 − 노드 왼쪽 위 `{dx:0, dy:0}` · 외곽선 − 고른 노드 상자 `{0,0,0,0}`(돌아온 직후 뿌리가 골라진 판 포함).

**3. 표시 옵션** — L1 밖은 구현 케이스 대로. 다른 탭(같은 사람)의 값은 GET 이 `projectId` 가 바뀔 때만 돌아 에디터를 다시 열 때 보인다 — 설계 «실시간 방송이 없다 … 다시 열 때 읽는다» 와 같다(코드). 공급자는 프로젝트마다 하나라 페이지를 옮겨도 떠 있는 PUT 이 안 끊긴다(코드). 뷰어: 공급자는 역할을 안 가르고 서버도 viewer 의 PUT 을 받는다(설계 «viewer 도 저장한다») — 실브라우저로 안 쟀다. «빠르게 다섯 번» · PUT 500 판은 바꾸는 입구(T7 «보기»)가 없어 실브라우저로 못 세운다 — jsdom 케이스(`view-prefs.test.tsx`)가 세 번 판 · 실패 판을 잰다.

**4. 모드마다 끈 영역**(코드 — `canvas.tsx` 의 `hiddenKey`)

| 판 | 끈 영역 적용 |
|---|---|
| 에디터 편집 모드(역할 무관 — viewer 의 편집 모드도) | 선다 |
| 에디터 뷰 모드 | 안 선다(다 켬 — 구현 케이스 «끈 GNB 는 편집 모드에만») |
| 덮개 위 팝업(`PopupLayer`) | 틀 자체가 없다(탐침 G: 층 안 `[data-wb-layout]` 0) |
| 번들 · PPTX(내보내기 미리보기 포함) | 이 브랜치는 틀 없이 그린다 — lx(T8) 몫 |

모드는 `edit` · `view` 둘뿐이다(`EditorMode`) — 따로 선 코멘트 모드는 없다.

**5. 뷰 모드 틀 링크** — 탐침 D: LNB 항목 `["첫째","둘째","빈쪽"]` · GNB `["가","나"]` — 팝업 «창» 은 안 선다(설계 표). 지운 페이지 · 메뉴 밖 페이지는 링크가 트리 칸의 트리로 지어져 트리에서 빠지면 같이 빠진다(코드). 편집 모드 이동 0 은 구현 케이스. 같은 페이지 → L2.

**6. 팝업 레이아웃 캔버스** — 탐침 E: 뿌리 `size: 'large'`(960):

| 뷰포트 | 막 `[left, width]` | 상자 `[left, top−막 top, width]` | 문서 `scrollWidth` |
|---|---|---|---|
| 1280 | 0 · 1280 | 160 · 24 · 960 | 1280 |
| 768 | 0 · 768 | 24 · 24 · 720(= 768 − 48) | 768 |
| 375 | 0 · 375 | 24 · 24 · 327(= 375 − 48) | 375 |

  medium(720) 판 768 은 상자 24 · 720. 가로 넘침 0. 덮개 층(탐침 G): 서브 «첫째» 의 단추(`openModal` → `page:가/창`)를 뷰 모드로 누름 → 층 `[data-wb-popup-layer]` 하나 · 상자 720×183 · 상자 위끝 가운데의 `elementFromPoint` 가 층 안 · GNB 왼쪽 위 점도 층(덮개가 틀을 덮는다) · 층 안 틀 0.

**7. 앞 판 테마** — 탐침 A 의 표(빈 = 서브 · 영역 0). 탐침 H(끌기 훑기 — `Text` 카드를 쥐고 iframe 을 61×23px 격자로 훑은 뒤 Escape): 테마 넷 × 서브 · 팝업 여덟 판 모두 iframe 1 · 문서 바뀜 없음 · 콘솔 오류 0(`Maximum update` · pageerror 0) · 10 점마다 본 미리보기 8 – 19 번. 1.6.0 · 2.0.0 은 안 쟀다(2.0.0 은 얼린 사본이 없다).

## 변조

새 케이스를 안 세워 변조를 안 돌렸다(고치지 않는 트랙). L1 의 구분력은 F1/F2 대조(GET 전 · 뒤만 다른 두 판)로 갈랐다.

## 게이트

전량 게이트는 안 돌렸다(소스 변경 없음 · 보고만 커밋). 실브라우저 탐침 셋(스크래치 설정 — `vitest.browser.config.ts` 를 싣고 `test.dir` 을 스크래치로 · `maxWorkers: 1`)과 jsdom 탐침 하나:

| 판 | 시각 | 결과 | load(1분) |
|---|---|---|---|
| 탐침 1판 | 01:27 | 6 케이스 전부 픽스처(팝업 시드 경로)로 죽음 — 안 잰 판 | 7.96 |
| 탐침 2판 A · B · C · D · E · G | 01:29 – 01:31 | 통과 6 · 실패 0 | — |
| 탐침 3판 E · H(나머지 skip 5) | 01:34 – 01:36 | 통과 2 · 건너뜀 5 | 12.76 |
| jsdom `rv-lc-probe.test.tsx`(web) | 01:32 | 통과 2 | — |

자리 `gate-slots/rv-lc` 는 판마다 만들고 지웠다(띄울 때 다른 자리 `ls` 하나). `pmset -g log` 의 Sleep 줄은 11-25 22:28 · 22:30 뿐 — 탐침(01:27 – 01:36) 밖. 끝에 이 워크트리 · 스크래치 경로의 vitest · vite · Chrome 0(`ps` — 스택은 `stack.close()` 가 거뒀다). 자기 DB 컨테이너는 그대로.

## 남은 것

- L1 · L2 · L3 의 대응(무게 낮음 — 병합을 막지 않는다). L1 은 T7 이 `set` 을 부르게 되면 사람 손에 닿는다 — T7 전에 고치거나 T7 브리프에 싣는다.
- 안 잰 것: 오른쪽 누름 · 더블클릭(처리기 없음 — 코드) · 틀을 누른 뒤의 Cmd+V · 들여쓰기(고름 대상 — 코드) · 가장자리 자동 스크롤 띠 · viewer 계정 실브라우저 · `?state=` 이 걸린 주소의 이동 · 앞 판 1.6.0 · 2.0.0.

## 지침

- **팝업 문서를 시드할 때 뿌리 `Popup` 의 몸통은 `/root/children` 이다** — `zones: [{ name: 'body' }]` 라 `/root/zones/body` 로 짓기 쉬운데 409(«경로를 찾을 수 없습니다»)다. `AGENTS.md` 「검증 — wirebound」 에 넣을 만큼은 아니다(첫 판이 픽스처에서 값으로 죽어 바로 보인다) — 넣지 않는다.

## 탐침 원문

`<스크래치>/probe/vitest.probe.config.ts`:

```ts
import { defineConfig } from 'vitest/config'
import base from '/Users/jang2162/orca/workspaces/wirebound/feat-layout-canvas/vitest.browser.config.ts'
export default defineConfig({
  ...base,
  root: '/Users/jang2162/orca/workspaces/wirebound/feat-layout-canvas',
  test: { ...base.test, dir: '<스크래치>/probe', include: ['**/*.probe.ts'], exclude: ['**/node_modules/**'], maxWorkers: 1 },
})
```

돌린 줄: `DATABASE_URL=<apps/api/.env 의 값> pnpm exec vitest run --config <스크래치>/probe/vitest.probe.config.ts`(스크래치에 체크아웃 `node_modules` 심링크). 아래는 3판의 파일이다(2판은 같은 파일에서 E 의 op 가 `replace` 이고 skip · H 가 없다).

```ts
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import type { Page } from 'playwright-core'
import { readWbtheme } from '@wirebound/themes'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { canvasFrame, dragLayoutSettled, editorStackPrerequisite, poll, shownDrops, startEditorStack, zoomToFull, type EditorStack, type Session } from '/Users/jang2162/orca/workspaces/wirebound/feat-layout-canvas/apps/web/build-test/editor-stack'
import { LAYOUT_THEME, layoutTheme } from '/Users/jang2162/orca/workspaces/wirebound/feat-layout-canvas/apps/web/build-test/layout-theme'
import { makeAdmin, putTheme, uploadRaw } from '/Users/jang2162/orca/workspaces/wirebound/feat-layout-canvas/apps/web/build-test/theme-fixtures'

const W = '/Users/jang2162/orca/workspaces/wirebound/feat-layout-canvas'
const 전제 = await editorStackPrerequisite()
const log = (k: string, v: unknown) => console.log(`PROBE ${k} ${JSON.stringify(v)}`)

const SEED = [
  { id: 'n_text', type: 'Text', props: { content: '글' } },
  { id: 'n_card', type: 'Card', props: { title: '카드' }, children: [{ id: 'n_intx', type: 'Text', props: { content: '안' } }] },
  { id: 'n_last', type: 'Text', props: { content: '끝' } },
]

describe.skipIf(!전제.ok)('rv-lc 탐침', () => {
  let stack: EditorStack
  let alice: Session
  beforeAll(async () => {
    if (!전제.ok) return
    stack = await startEditorStack(전제)
    alice = await stack.login(stack.users.alice)
    await makeAdmin(stack, stack.users.alice)
    expect(await uploadRaw(stack, alice, await layoutTheme())).toBe(201)
    for (const v of ['1.5.0', '1.7.0']) {
      const bytes = readFileSync(`${W}/apps/web/build-test/fixtures/system-admin-${v}.wbtheme`)
      const old = readWbtheme(new Uint8Array(bytes), { stored: true }).files!.manifest
      await stack.query(
        `insert into theme_packages (theme_id, version, name, description, sdk_range, manifest, files, size, sha256, uploaded_by)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, null) on conflict do nothing`,
        [old.id, old.version, old.name, old.description ?? null, old.sdk, JSON.stringify(old), bytes, bytes.byteLength, createHash('sha256').update(bytes).digest('hex')],
      )
    }
  }, 180_000)
  afterAll(async () => { if (stack !== undefined) await stack.close() })

  const call = (m: string, p: string, b?: unknown) => stack.request(alice, m, p, b)
  async function created(r: Promise<{ status: number; body: any }>, what: string): Promise<any> {
    const d = await r
    if (d.status !== 201) throw new Error(`픽스처 ${what} ${d.status} ${JSON.stringify(d.body)}`)
    return d.body
  }
  async function seed(pageId: string, projectId: string, nodes: readonly unknown[], root = '/root/children') {
    const s = await call('PATCH', `/projects/${projectId}/pages/${pageId}/ops`, { baseSeq: 0, ops: nodes.map((value, at) => ({ op: 'add', path: `${root}/${at}`, value })) })
    if (s.status >= 300) throw new Error(`seed ${s.status} ${JSON.stringify(s.body)}`)
  }
  async function fixture(slug: string, theme = { themeId: LAYOUT_THEME.id, version: LAYOUT_THEME.version }, firstSeed: readonly unknown[] = SEED) {
    const project = await created(call('POST', '/projects', { name: '레이아웃 판', slug: `${slug}-${Date.now().toString(36)}` }), '프로젝트')
    await putTheme(call, project.id, { ...theme, tokens: {} })
    const menu = await created(call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '가' }), '메뉴')
    const other = await created(call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '나' }), '메뉴 나')
    const page = (title: string, layout: string, m = menu.id) => created(call('POST', `/projects/${project.id}/pages`, { menuNodeId: m, title, layout }), title)
    const first = await page('첫째', 'subpage')
    const second = await page('둘째', 'subpage')
    const popup = await page('창', 'popup')
    const blank = await page('빈쪽', 'blank')
    await page('셋째', 'subpage', other.id)
    await seed(first.id, project.id, firstSeed)
    await seed(blank.id, project.id, SEED)
    await seed(second.id, project.id, [{ id: 'n_two', type: 'Text', props: { content: '둘째 글' } }])
    await seed(popup.id, project.id, [{ id: 'n_pop', type: 'Text', props: { content: '창 글' } }])
    return { projectId: project.id, first: first.id, second: second.id, popup: popup.id, blank: blank.id, path: (id: string) => `/projects/${project.id}/pages/${id}` }
  }
  async function open(path: string, wait: string, opt: { width?: number; height?: number; full?: boolean } = {}) {
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: opt.width ?? 1600, height: opt.height ?? 1000 } })
    await page.goto(path)
    await canvasFrame(page).locator(wait).first().waitFor({ state: 'attached' })
    if (opt.full !== false) await zoomToFull(page)
    else await page.waitForTimeout(800)
    return { page, close: () => context.close() }
  }
  async function pointOn(page: Page, css: string, o: { exact?: boolean; nodeId?: string } = {}) {
    return (await page.evaluate(`(() => { const f = document.querySelector('iframe.wb-shell-canvas-iframe'); const r = f.getBoundingClientRect(); const d = f.contentDocument;
      const scale = r.width / f.clientWidth; const target = d.querySelector(${JSON.stringify(css)}); if (target === null) return null;
      const b = target.getBoundingClientRect();
      const left = r.left + b.left * scale, top = r.top + b.top * scale, right = left + b.width * scale, bottom = top + b.height * scale;
      for (let y = top + 2; y < bottom - 1; y += 4) for (let x = left + 2; x < right - 1; x += 4) {
        if (document.elementFromPoint(x, y) !== f) continue
        const el = d.elementFromPoint((x - r.left) / scale, (y - r.top) / scale)
        if (el === null || !target.contains(el)) continue
        if (${o.exact === true} && el !== target) continue
        if (${JSON.stringify(o.nodeId ?? null)} !== null && el.closest('[data-wb-id]')?.getAttribute('data-wb-id') !== ${JSON.stringify(o.nodeId ?? null)}) continue
        return { x, y }
      }
      return null })()`)) as { x: number; y: number } | null
  }
  const selectedId = (page: Page) => page.evaluate(() => document.querySelector('.wb-shell-selection')?.getAttribute('data-wb-selected-id') ?? null)
  async function selectNode(page: Page, id: string) {
    const at = await pointOn(page, `[data-wb-id="${id}"]`, { nodeId: id })
    expect(at, id).not.toBeNull()
    await page.mouse.click(at!.x, at!.y)
    await poll(`${id} 고름`, () => selectedId(page), (v) => v === id)
  }
  const docJson = async (f: any, id: string) => JSON.stringify((await call('GET', `/projects/${f.projectId}/pages/${id}`)).body.schema)

  // A — 틀 판정이 서는 점을 iframe 전체에서 센다(빈 · 서브 · 팝업 × 테마)
  it.skip('A 틀 판정 훑기', async () => {
    const themes = [
      { themeId: LAYOUT_THEME.id, version: LAYOUT_THEME.version },
      { themeId: 'system-admin', version: '2.1.0' },
      { themeId: 'system-admin', version: '1.7.0' },
      { themeId: 'system-admin', version: '1.5.0' },
    ]
    for (const theme of themes) {
      const f = await fixture(`lc-a-${theme.version.replace(/\./g, '')}`, theme)
      for (const [name, id, wait] of [['blank', f.blank, '[data-wb-id="n_last"]'], ['subpage', f.first, '[data-wb-id="n_last"]'], ['popup', f.popup, '[data-wb-id="n_pop"]']] as const) {
        const { page, close } = await open(f.path(id), wait)
        try {
          const r = await canvasFrame(page).locator('html').evaluate(() => {
            const out = { node: 0, frame: 0, bodyBg: 0, otherNoNode: 0, frameTags: {} as Record<string, number>, w: document.documentElement.clientWidth, h: document.documentElement.scrollHeight }
            for (let y = 1; y < Math.min(document.documentElement.scrollHeight, window.innerHeight); y += 6) for (let x = 1; x < document.documentElement.clientWidth; x += 6) {
              const el = document.elementFromPoint(x, y)
              if (el === null) continue
              const fr = el.closest('[data-wb-layout]'); const ct = el.closest('[data-wb-layout-content]')
              const inFrame = fr !== null && (ct === null || !fr.contains(ct))
              if (inFrame) { out.frame++; const k = (el.getAttribute('data-wb-layout-region') ?? el.closest('[data-wb-layout-region]')?.getAttribute('data-wb-layout-region') ?? el.tagName + (el.hasAttribute('data-wb-layout') ? `[layout=${el.getAttribute('data-wb-layout')}]` : '')); out.frameTags[k] = (out.frameTags[k] ?? 0) + 1 }
              else if (el.closest('[data-wb-id]') !== null) out.node++
              else if (el === document.body || el === document.documentElement) out.bodyBg++
              else out.otherNoNode++
            }
            const root = document.querySelector('[data-wb-layout-content] > [data-wb-id], [data-wb-layout] [data-wb-id]')
            const lay = document.querySelector('[data-wb-layout]')!.getBoundingClientRect()
            const rb = root?.getBoundingClientRect()
            return { ...out, layoutBox: [lay.left, lay.top, lay.width, lay.height].map(Math.round), rootBox: rb ? [rb.left, rb.top, rb.width, rb.height].map(Math.round) : null }
          })
          log(`A ${theme.themeId}@${theme.version} ${name}`, r)
        } finally { await close() }
      }
    }
  })

  // B — 맞춤 배율(줌 맞추지 않음) 창 1440 · 1024: 외곽선 · 번호 마커가 노드를 따르나, 페이지를 오간 뒤도
  it.skip('B 맞춤 배율 측정', async () => {
    const f = await fixture('lc-b')
    for (const pid of [f.first, f.blank]) expect((await call('POST', `${f.path(pid)}/comments`, { nodeId: 'n_last', body: '여기' })).status).toBeLessThan(300)
    for (const width of [1440, 1024]) {
      const { page, close } = await open(f.path(f.first), '[data-wb-layout-region="lnb"] a', { width, height: 900, full: false })
      try {
        const measure = async (label: string) => {
          await page.waitForTimeout(500)
          const zoom = await page.getByRole('group', { name: '줌' }).locator('.wb-shell-zoom-value').textContent()
          const marker = await page.locator('.wb-shell-marker[data-wb-marker-for="n_last"]').boundingBox()
          const node = await canvasFrame(page).locator('[data-wb-id="n_last"]').boundingBox()
          const sel = await page.locator('.wb-shell-selection').first().boundingBox().catch(() => null)
          const selId = await selectedId(page)
          const selNode = selId ? await canvasFrame(page).locator(`[data-wb-id="${selId}"]`).boundingBox() : null
          const r = (v: number) => Math.round(v)
          log(`B ${width} ${label}`, {
            zoom, selId,
            marker: marker && node ? { dx: r(marker.x + marker.width / 2 - node.x), dy: r(marker.y + marker.height / 2 - node.y) } : { marker, node },
            outline: sel && selNode ? { dx: r(sel.x - selNode.x), dy: r(sel.y - selNode.y), dw: r(sel.width - selNode.width), dh: r(sel.height - selNode.height) } : { sel, selNode },
          })
        }
        await page.locator('.wb-shell-marker[data-wb-marker-for="n_last"]').waitFor()
        await selectNode(page, 'n_card')
        await measure('subpage-card')
        // 편집 모드에서 메뉴 트리로 빈 페이지로 → 다시 서브페이지로
        await page.getByRole('link', { name: '빈쪽', exact: true }).click()
        await canvasFrame(page).locator('[data-wb-id="n_last"]').waitFor({ state: 'attached' })
        await page.locator('.wb-shell-marker[data-wb-marker-for="n_last"]').waitFor()
        await selectNode(page, 'n_card')
        await measure('blank-card')
        await page.getByRole('link', { name: '첫째', exact: true }).click()
        await canvasFrame(page).locator('[data-wb-layout-region="lnb"] a').first().waitFor({ state: 'attached' })
        await page.locator('.wb-shell-marker[data-wb-marker-for="n_last"]').waitFor()
        await measure('subpage-back (root selected?)')
        await selectNode(page, 'n_card')
        await measure('subpage-back-card')
        await page.getByRole('button', { name: '뷰 모드', exact: true }).click()
        await measure('view')
      } finally { await close() }
    }
  })

  // C — 노드 옮기기 끌기: n_text 를 LNB · GNB · 브레드크럼브 위로 놓음
  it.skip('C 손잡이 끌기를 틀 위에 놓기', async () => {
    const f = await fixture('lc-c')
    const { page, close } = await open(f.path(f.first), '[data-wb-layout-region="lnb"] a')
    try {
      for (const css of ['[data-wb-layout-region="lnb"]', '[data-wb-layout-region="gnb"] a', '[data-wb-layout-region="breadcrumb"]', '[data-wb-layout-region="title"]']) {
        await selectNode(page, 'n_text')
        const target = await pointOn(page, css)
        const before = await docJson(f, f.first)
        const box = (await page.locator('.wb-shell-canvas-handle').boundingBox())!
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
        await page.mouse.down()
        await page.mouse.move(box.x + box.width / 2 + 3, box.y + box.height / 2 + 6, { steps: 3 })
        await dragLayoutSettled(page)
        await page.mouse.move(target!.x, target!.y, { steps: 10 })
        await page.waitForTimeout(200)
        const drops = await shownDrops(page)
        await page.mouse.up()
        await page.waitForTimeout(700)
        log(`C ${css}`, { target, drops, changed: (await docJson(f, f.first)) !== before, selected: await selectedId(page) })
      }
    } finally { await close() }
  })

  // D — 뷰 모드: 지금 페이지 링크 · 다른 페이지 링크의 history · 주소, 메뉴 트리 링크와 견줌
  it.skip('D 뷰 모드 틀 링크의 이력', async () => {
    const f = await fixture('lc-d')
    const { page, close } = await open(f.path(f.first) + '?state=zz', '[data-wb-layout-region="lnb"] a')
    try {
      await page.getByRole('button', { name: '뷰 모드', exact: true }).click()
      await page.waitForTimeout(400)
      const hl = () => page.evaluate(() => history.length)
      const s0 = { url: page.url(), h: await hl() }
      const cur = await pointOn(page, '[data-wb-layout-region="lnb"] a[aria-current="page"]')
      await page.mouse.click(cur!.x, cur!.y); await page.waitForTimeout(500)
      const s1 = { url: page.url(), h: await hl() }
      await page.getByRole('link', { name: '첫째', exact: true }).click(); await page.waitForTimeout(500)
      const s2 = { url: page.url(), h: await hl() }
      const lnbTitles = await canvasFrame(page).locator('[data-wb-layout-region="lnb"] a').allTextContents()
      const gnbTitles = await canvasFrame(page).locator('[data-wb-layout-region="gnb"] a').allTextContents()
      log('D', { s0, s1, s2, lnbTitles, gnbTitles })
    } finally { await close() }
  })

  // E — 팝업 레이아웃: large(960) 상자 × 뷰포트 1280 · 768 · 375
  it('E 넓은 팝업 · 좁은 뷰포트', async () => {
    const f = await fixture('lc-e')
    const doc = (await call('GET', `/projects/${f.projectId}/pages/${f.popup}`)).body
    const p = await call('PATCH', `/projects/${f.projectId}/pages/${f.popup}/ops`, { baseSeq: doc.seq ?? doc.headSeq ?? 1, ops: [{ op: 'add', path: '/root/props/size', value: 'large' }] })
    log('E patch', { status: p.status, body: p.status >= 300 ? p.body : null, keys: Object.keys(doc) })
    const { page, close } = await open(f.path(f.popup), '[data-wb-id="n_pop"]')
    try {
      for (const vw of ['1280', '768', '375']) {
        await page.getByLabel('뷰포트 폭').selectOption(vw)
        await page.waitForTimeout(700)
        const m = await canvasFrame(page).locator('html').evaluate(() => {
          const backdrop = document.querySelector('[data-wb-layout="popup"]')!.getBoundingClientRect()
          const box = document.querySelector('[data-wb-component="Popup"]')!.getBoundingClientRect()
          return { doc: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth, backdrop: [backdrop.left, backdrop.width, backdrop.height].map(Math.round), box: [box.left, box.top - backdrop.top, box.width, box.height].map(Math.round) }
        })
        const iframeH = await page.locator('iframe.wb-shell-canvas-iframe').evaluate((el) => (el as HTMLIFrameElement).clientHeight)
        log(`E ${vw}`, { ...m, iframeH })
      }
      // 막 아래(iframe 안 · 막 밖) 를 누르면?
      await selectNode(page, 'n_pop')
      const below = await page.evaluate(`(() => { const f = document.querySelector('iframe.wb-shell-canvas-iframe'); const r = f.getBoundingClientRect(); const d = f.contentDocument; const s = r.width / f.clientWidth;
        const b = d.querySelector('[data-wb-layout="popup"]').getBoundingClientRect(); const y = b.bottom + 6; const x = 20; if (y >= f.clientHeight) return { none: true, bottom: b.bottom, ih: f.clientHeight };
        return { x: r.left + x * s, y: r.top + y * s, host: document.elementFromPoint(r.left + x*s, r.top + y*s) === f, el: d.elementFromPoint(x, y)?.tagName } })()`) as any
      if (below.x !== undefined && below.host) { await page.mouse.click(below.x, below.y); await page.waitForTimeout(300) }
      log('E below-backdrop', { below, selected: await selectedId(page) })
    } finally { await close() }
  })

  // G — 뷰 모드 덮개 층: 서브페이지에서 팝업 레이아웃 페이지를 덮개로 연다
  it.skip('G 덮개 층', async () => {
    const opener = [{ id: 'n_btn', type: 'Button', props: { label: '열기' }, interactions: [{ on: 'click', actions: [{ type: 'openModal', target: 'page:가/창' }] }] }, ...SEED]
    const f = await fixture('lc-g', undefined, opener)
    const { page, close } = await open(f.path(f.first), '[data-wb-id="n_btn"]')
    try {
      await page.getByRole('button', { name: '뷰 모드', exact: true }).click()
      await page.waitForTimeout(400)
      const btn = await pointOn(page, '[data-wb-id="n_btn"]', { nodeId: 'n_btn' })
      await page.mouse.click(btn!.x, btn!.y)
      await page.waitForTimeout(800)
      const r = await canvasFrame(page).locator('html').evaluate(() => {
        const layer = document.querySelector('[data-wb-popup-layer]')
        const pop = layer?.querySelector('[data-wb-component="Popup"]')
        const b = pop?.getBoundingClientRect()
        const hit = b ? document.elementFromPoint(b.left + b.width / 2, b.top + 10) : null
        return { layer: layer !== null, framesInLayer: layer?.querySelectorAll('[data-wb-layout]').length ?? -1, box: b ? [b.left, b.top, b.width, b.height].map(Math.round) : null, hitInLayer: hit ? layer!.contains(hit) : null, gnbHit: (() => { const g = document.querySelector('[data-wb-layout-region="gnb"]')?.getBoundingClientRect(); if (!g) return null; const e = document.elementFromPoint(g.left + 5, g.top + 5); return e ? (layer?.contains(e) ? 'layer' : e.closest('[data-wb-layout-region]')?.getAttribute('data-wb-layout-region') ?? e.tagName) : null })() }
      })
      log('G', r)
    } finally { await close() }
  })

  // H — 끌기 훑기: 카드를 쥐고 캔버스를 격자로 훑는다(앞 판 테마 · 픽스처 테마의 서브페이지 · 팝업)
  it('H 끌기 훑기', async () => {
    for (const theme of [{ themeId: LAYOUT_THEME.id, version: LAYOUT_THEME.version }, { themeId: 'system-admin', version: '1.7.0' }, { themeId: 'system-admin', version: '1.5.0' }, { themeId: 'system-admin', version: '2.1.0' }]) {
      const f = await fixture(`lc-h-${theme.version.replace(/\./g, '')}`, theme)
      for (const [name, id, wait] of [['subpage', f.first, '[data-wb-id="n_last"]'], ['popup', f.popup, '[data-wb-id="n_pop"]']] as const) {
        const { page, close } = await open(f.path(id), wait)
        const errors: string[] = []
        page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 120)) })
        page.on('pageerror', (e) => errors.push('pageerror ' + String(e).slice(0, 120)))
        try {
          const before = await docJson(f, id)
          if ((await page.getByRole('region', { name: '컴포넌트 목록' }).count()) === 0) {
            await page.getByRole('contentinfo', { name: '하단 바' }).getByRole('button', { name: '컴포넌트', exact: true }).click()
            await page.getByRole('region', { name: '컴포넌트 목록' }).waitFor()
          }
          await page.getByRole('searchbox', { name: '컴포넌트 찾기' }).fill('Text')
          const card = page.locator('[data-wb-palette-card="Text"]'); await card.waitFor()
          const cb = (await card.boundingBox())!
          const fr = (await page.locator('iframe.wb-shell-canvas-iframe').boundingBox())!
          await page.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2); await page.mouse.down()
          await page.mouse.move(cb.x + cb.width / 2 + 3, cb.y + cb.height / 2 - 6, { steps: 3 })
          await dragLayoutSettled(page)
          let previews = 0, points = 0
          for (let y = fr.y + 4; y < Math.min(fr.y + fr.height, 990); y += 23) for (let x = fr.x + 4; x < Math.min(fr.x + fr.width, 1590); x += 61) {
            await page.mouse.move(x, y, { steps: 2 }); points++
            if (points % 10 === 0 && (await shownDrops(page)).length > 0) previews++
          }
          await page.keyboard.press('Escape'); await page.mouse.up(); await page.waitForTimeout(500)
          const alive = await page.locator('iframe.wb-shell-canvas-iframe').count()
          log(`H ${theme.version} ${name}`, { points, previewSamples: previews, alive, changed: (await docJson(f, id)) !== before, errors: errors.filter((e) => /Maximum update|pageerror/.test(e)), errorsN: errors.length })
        } finally { await close() }
      }
    }
  }, 600_000)
})

```
