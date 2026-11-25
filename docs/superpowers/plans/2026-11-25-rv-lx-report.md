# rv-lx — 레이아웃 T8(번들 · PPTX) 반증 리뷰

브리프 `brief-rv-lx.md` · 공통 `common-ly3.md` · 구현 보고 `docs/superpowers/plans/2026-11-25-lx-report.md`. 대상 `feat/layout-export` 머리 `9d2d6f49`(main `27ef2cc9` 위 9 커밋). 판 Node v24.21.0(`mise env`). 리뷰는 소스를 고치지 않았다 — 변조도 걸지 않았다(재현된 결함이 없어 고치기 전 · 뒤를 가를 일이 없었다).

시작 때 이 워크트리의 터미널은 둘(이 세션 · 셋업 셸 «초기 설정»)뿐이었다. 시작 `git ls-files -s | md5` = `52d1341d4a32aa626b39ba39a6484065` · `git status --short` = `?? .build/`. 끝 값은 「게이트」 끝에 적는다. 측정 전 `pnpm build`(종료 0)로 `dist` 를 지금 소스로 맞췄다 — 번들 · PPTX 판은 모두 그 빌드 뒤다.

탐침은 스크래치에 두고 테스트 글롭 밖에서 돌렸다(설정: `vitest.browser.config.ts` 를 실은 스크래치 설정 — `root` 체크아웃 · `test.dir` 스크래치 · `include: ['**/*.probe.ts']` · `maxWorkers: 1`). 원문은 끝 「탐침 원문」.

## 결론

**높음 0 · 중간 0 · 낮음 1(설계대로인 성질의 기록).** T8 이 세운 장치 다섯 축 모두 재현된 결함이 없다.

| 축 | 판정 | 무게 |
|---|---|---|
| 1 번들 내비 `assets/nav.js` | 크기는 장 수와 무관(장 HTML 은 메뉴 유무 · 깊이와 바이트까지 같다) · 사람 글 주입 0 · 콘솔 오류 0 · 같은 이름 장 · 팝업만 든 메뉴 · 지운 페이지 메뉴 · 해시로 연 장 모두 옳다 | 없음 |
| 2 영역 늘 다 켬 | 숨긴 사람의 라우트 zip(실 Chrome) · 라우트 PPTX 화소 모두 GNB · LNB 가 선다 | 없음 |
| 3 PPTX | 서브페이지 폭 720 · 앞 판 테마(1.5.0 · 1.7.0 · 2.1.0 · 테마 없음) 서브페이지 = 빈 그림 sha 같음 · 팝업 레이아웃 = blank 로 감싼 같은 뿌리 sha 같음 · 상한은 서브페이지가 틀 60px 만큼 먼저 닿는다(낮음 — 설계대로) | 낮음 1 |
| 4 popup-layer 기대값 «창 − 48» | 설계 문장과 같고, 덮개 층 팝업과 열두 판(창 4 × 크기 3)에서 폭 · 왼쪽 자리가 같다 · 실브라우저 전량 결과는 「게이트」 | 없음 |
| 5 셸 마크업 정규식 | `wb-export-` 정규식 케이스 6 파일 97 통과 · 모두 값으로 단언(0 건이면 죽는 꼴) | 없음 |

## 1 · 번들 내비

### 크기 — 장 수 · 메뉴 깊이

`exportBundle`(exporter 소스 별칭)로 장 N 개 · 메뉴 깊이 d 를 바꿔 쟀다(`size.probe.ts`).

| N | 깊이 | `nav.js` 바이트 | 장 HTML(최소–최대) |
|---|---|---|---|
| 2 | 0 | 298 | 2275 |
| 20 | 0 | 2482 | 4005–4011 |
| 200 | 0 | 25402 | 21665–21677 |
| 200 | 8 | 25826 | 21665–21677 |
| 200 | 메뉴 없음 | 4843 | 21665–21677 |

장 HTML 은 메뉴를 넘겼든 안 넘겼든 · 깊이를 8 겹 더했든 **같은 크기**다 — 장 HTML 이 N 으로 자라는 몫은 앞부터 있던 뷰어 셸의 좌측 목록이다(메뉴 없음 판과 같다). 내비는 `nav.js` 한 벌에서만 N 으로 자란다. **원래 있던 길**(좌측 목록) · 새 장치는 장 수 × 트리로 안 자란다.

### 사람 글 · 링크 대상 — 실 Chrome(`nav.probe.ts`)

픽스처: 레이아웃 뷰를 낸 탐침 테마 `layoutrv@1.0.0`(kit `buildTheme` · GNB · 브레드크럼브 · LNB 를 `LayoutLink` 로) · 뿌리 메뉴 여섯 —
`회원</script><script>window.__pwn=1</script>"U+202E관리`(팝업 «먼저 팝업» → 화면 `</script><img src=x onerror="window.__pwn2=1">목록U+202E` → 화면 «긴 장»(줄 60)) ·
`설정"'U+2028끝`(화면 `"인용'`) · «같은»(화면 «목록») · «같은»(화면 «목록») · «팝업만»(팝업 하나) · «지움»(화면 하나를 만든 뒤 `DELETE`). 그 사람은 `subpage.lnb` · `subpage.gnb` 를 꺼 둔다. 번들은 라우트(`GET …/export?format=html`)로 받았다.

번들의 html 8 파일(index 포함 · `codes.html` 뺌)을 다 열어 잰 값:

- **8 파일 모두** `pageerror` · 콘솔 error 0, `window.__pwn` · `__pwn2` 없음, `img[src="x"]` 0, `data-wb-failed` 없음, 내비 전역 `object`.
- GNB 이름 = `isolateBidi(메뉴 이름)` 그대로(U+202E 를 든 이름만 FSI … PDI 로 싸였다). `"` · `'` · `</script>` 는 글로만 선다 — `nav.js` 는 바깥 스크립트 파일이라 `</script>` 가 문맥을 못 끊고, 장 데이터는 앞부터 있던 `scriptJson` 을 지난다. U+2028 은 서버가 제목에서 공백으로 바꿔 받아(파일 이름 · 글 모두 «설정"' 끝») 런타임까지 안 왔다.
- **링크 대상**(링크 `href` 를 장 자리에서 풀어 그 파일의 장 데이터 `pageId` 로 견줌): GNB 차례 `[evil, quote, same1, same2, null, null]` — 앞선 팝업을 건너뛴 첫 화면, **같은 이름 «같은» 둘이 제 장**(`같은-목록.html` · `같은-목록-2.html`), «팝업만» · «지움» 은 링크가 아니다(`href` 없음). LNB 는 그 뿌리 메뉴의 화면만(팝업 빠짐) · 지금 장에 `aria-current`. 브레드크럼브의 메뉴 마디는 그 메뉴의 첫 화면.
- 팝업 장 둘(`index.html` = 첫 장 «먼저 팝업» · «팝업 하나») 은 틀 링크 0(팝업 레이아웃은 내비를 안 그린다).

### 해시로 연 장 — 지금 링크 상자

«긴 장»(줄 60) 파일의 LNB 지금 링크(`aria-current`):

| 연 꼴 | 넓이 | 위 · 왼 | 창 안 |
|---|---|---|---|
| 해시 없음 · 1280×500 | 647.4 | 160 · 300 | 참 |
| `#wb-screen` · 390×600 | 647.4 | 135 · 0 | 참 |
| `#wb-screen` · 1280×500 | 647.4 | 116 · 0 | 참 |

### 지나가며 본 것(이 트랙과 무관)

- 번들 파일 이름이 U+202E 를 그대로 싣는다(`회원-…-U+202E관리-긴-장.html`) — 파일 이름 규칙(`bundle/filename.ts`)은 T8 이 안 바꿨다. **원래 있던 길** · 낮음 · 이 리뷰 범위 밖이라 판정하지 않았다.
- 테마 스크립트는 `nav.js` 뒤에 실려 내비 전역을 덮을 수 있다 — 테마는 이미 그 장에서 무엇이든 돌리는 코드라 새로 여는 권한은 없다.

## 2 · 영역 늘 다 켬

- **라우트 zip · 실 Chrome**: 위 픽스처(그 사람이 GNB · LNB 를 끔)의 라우트 zip 에서 서브페이지 장 다섯 모두 GNB · LNB 링크가 선다(위 링크 표가 그 값이다).
- **라우트 PPTX**(`GET …/export?format=pptx` — 워커를 지난 판) 그림 7 장의 색 화소(2 화소 걸러 센 값 — GNB `rgb(12,34,156)` · LNB `rgb(210,230,40)`):

  | 그림 | 크기 | GNB | LNB |
  |---|---|---|---|
  | image1(팝업 «먼저 팝업») | 1440×1104 | 0 | 0 |
  | image2 – image6(서브페이지 다섯) | 1440×1104 · «긴 장» 1440×4390 | 39909 씩 | 11542 – 505702 |
  | image7(팝업 «팝업 하나») | 1440×1104 | 0 | 0 |

  GNB 39909 × 4 ≈ 159636 은 띠 전체(1440 × 120 = 172800)에서 링크 글 화소를 뺀 만큼이다. 숨긴 영역 설정이 PPTX 에 새지 않는다.
- **내보내기 미리보기**(`GET …/export/preview?format=pptx` — 에디터의 «내보내기» 상자가 읽는 것): 200 · 페이지 목록 · `kind` · 테마만 싣고 영역 · 표시 옵션 칸이 없다. 그 응답은 그리지 않으므로 «다 켬» 을 잴 화면이 없다.

## 3 · PPTX

`chromiumScreenRenderer` 를 직접 돌린 판(`pptx.probe.ts` — `apps/api/build-test/screen-jobs.ts` 의 `bundled` · `jobOf` · `inlineTheme`, 앞 판 테마는 `readWbtheme(…, { stored: true })` — 내보내기가 저장된 패키지를 읽는 것과 같은 길). 그림 크기는 화소(CSS px × 2), sha 는 PNG 바이트 sha256 앞 16 자.

### 앞 판 테마 고정 — 서브페이지 장 = 빈 장

줄 12 개 문서를 `subpage` · `blank` 로, 큰 팝업을 `popup` · (`blank` 로 감싼 같은 `Popup` 뿌리)로:

| 테마 | subpage | blank | popup | blank 뿌리 Popup |
|---|---|---|---|---|
| system-admin 1.5.0(`apps/web/build-test/fixtures`) | 1440×1132 `aad723c8a56e27d5` | 같음 | 1920×1104 `1fc83d49b71e340c` | 같음 |
| 1.7.0 | 1440×1132 `aad723c8a56e27d5` | 같음 | 1920×1104 `1fc83d49b71e340c` | 같음 |
| 2.1.0(`system-themes/admin/dist`) | 1440×1130 `14183c16c277d115` | 같음 | 1920×1104 `5d8a23d996b79886` | 같음 |
| 테마 없음 | 1440×1136 `b9067b4c9927902f` | 같음 | 1920×1104 `015f0453927ca642` | 같음 |

레이아웃 뷰가 없는 테마는 서브페이지 장이 빈 장과 **바이트까지 같은 그림**이다. 세 판 다 저장된 패키지 읽기(`stored`)가 섰다 — 읽기 실패로 `themeWarning` 이 설 꼴은 T8 이 안 건드린다(카탈로그 · manifest 검사를 안 바꿨다). DB 를 지난 `themeWarning` 값 자체는 이 판에서 안 쟀다.

### 팝업 장 — 막 없이 «상자만»

| 크기 | popup 레이아웃 | blank 로 감싼 같은 뿌리 |
|---|---|---|
| small | 1440×1104 `fd6c864dc965fb29` | 같음 |
| medium | 1440×1104 `5cc888499169fc3c` | 같음 |
| large | 1920×1104 `015f0453927ca642` | 같음 |

찍는 판의 팝업 그림은 틀이 없는 판(막 · 여백 0)과 같다 — 설계 «PPTX 는 상자만(그대로)» 그대로다. 그림은 «상자 크기» 로 잘리지 않고 문서 크기(폭 720 · 큰 팝업은 960)다 — 그 꼴은 T8 앞부터 같다(blank 대조가 그 증거).

### 크기 상한 — 낮음 1

줄 하나 35px 문서로 경계를 찾았다(틀은 GNB 60px):

| 줄 | blank | subpage |
|---|---|---|
| 232 | 1440×16240 | 1440×16360 |
| 233 | 1440×16310 | **실패** «페이지가 너무 커 화면을 그리지 않았습니다 — 720×8215px(상한 720×8192px 넓이)» |
| 300 | 실패 720×10500 | 실패 720×10560 |

**낮음 · 새 장치가 연 길(설계대로)** — 서브페이지 장은 틀 높이만큼 빈 장보다 먼저 상한에 닿는다. 설계 §PPTX «크기 상한(`maxArea`)도 그대로다» 와 「정한 것」 3 이 정한 성질이라 결함이 아니다. 실패는 값(이유 문장)으로 나고 다른 장을 막지 않는다. 사람에게 보이는 차이는 «빈 레이아웃이면 실리던 긴 장이 서브페이지로 바꾸면 그림이 빠진다» 다 — 문서에 적어 둘지는 코디네이터 판단.

## 4 · popup-layer 기대값 «창 − 48»

- 설계 「캔버스」 «상자가 뷰포트보다 넓으면 뷰포트 − 2 × 여백»(여백 24 — `packages/theme-sdk/src/default-views/layout.tsx` 의 `POPUP_GAP`) 그대로다.
- **덮개 층과 같은 값인가**(`overlay.probe.ts`) — 화면 모드 번들에서 «팝업 열기» 로 덮개 위에 연 상자와, 같은 팝업 장을 페이지로 연 상자의 [폭 · 위 · 왼]:

  | 창 | small | medium | large |
  |---|---|---|---|
  | 390 | 덮개 [342,326,24] · 장 [342,24,24] | [342,326,24] · [342,24,24] | [342,326,24] · [342,24,24] |
  | 720 | [480,326,120] · [480,24,120] | [672,326,24] · [672,24,24] | [672,326,24] · [672,24,24] |
  | 1000 | [480,326,260] · [480,24,260] | [720,326,140] · [720,24,140] | [952,326,24] · [952,24,24] |
  | 1280 | [480,326,400] · [480,24,400] | [720,326,280] · [720,24,280] | [960,326,160] · [960,24,160] |

  열두 판 모두 **폭 · 왼쪽 자리가 같다**(창 − 48 에서 묶이는 판도 같은 값). 위 자리만 다르다 — 덮개는 덮개 층의 배치(앞부터 있던 것), 장은 설계의 «가운데 위 24px». 캔버스의 페이지 팝업은 이 브랜치에서 아직 틀 없이 그린다(T6 · lc 의 몫) — 견줄 판이 없다.
- 실브라우저 전량 — 「게이트」.

## 5 · 번들 셸 마크업

`git grep -n 'wb-export-' apps/api/test` 14 줄 · 6 파일. 그 6 파일을 한 번 돌렸다(api 프로젝트 하나): export-bundle 27 · export-layout 2 · export-pptx-screens 19 · export-routes 15 · export-theme 20 · export-zip 14 — **97 통과 · 실패 0 · 건너뜀 0**. 정규식을 쓰는 자리는 모두 값으로 단언한다 — `pageHrefs` · `pageData` 는 못 찾으면 던지고, `commentEntries` 는 코멘트마다 `toBeDefined` 를 단언하며, export-routes 는 본문을 `toMatch(/^보세요 …/)` 로 견준다(0 건이면 빈 글이라 죽는다). T8 의 셸 변경은 `<script src="…nav.js">` 한 줄을 런타임 뒤에 더한 것뿐이라 `id="wb-export-page"` 등 속성 차례를 안 바꿨다.

## 게이트

실브라우저 전량 하나(`pnpm test:browser` — 브리프 4 «이 브랜치에서 한 번»). 스크립트 하나를 `nohup nice -n 10 caffeinate -i … & disown` 으로 띄웠다 — 자리 `gate-slots/rv-lx`(띄울 때 다른 자리 하나 `ls` · 끝에 지움). 상태 파일 첫 줄 `v24.21.0` · 머리 `9d2d6f49`.

| 단계 | 시작 – 끝 | 종료 | 실행 | load(1분) 시작 → 끝 |
|---|---|---|---|---|
| `pnpm test:browser` | 01:36:42 – 01:59:35 | 0 | 142 파일 · 882 케이스 — 통과 880 · 건너뜀 2 · 실패 0 | 10.48 → 26.45 |

그 안에서 `popup-layer.test.ts` 20 통과(바뀐 «창 − 48» 넷 포함) · `bundle-layout.test.ts` 4 통과. `pmset -g log` 의 마지막 Sleep 줄은 2026-11-25 22:30 — 게이트 안 잠듦 없음.

그 밖에 돈 것: api 6 파일(항목 5 — 97 통과 · 실패 0 · 건너뜀 0, api vitest 는 그 한 번) · 탐침 넷(실브라우저 `nav.probe.ts` 3 통과 · `overlay.probe.ts` 1 · node `size.probe.ts` 1 · `pptx.probe.ts` 3 — 탐침은 값을 적는 것이 몫이다). 끝에 이 워크트리 경로의 vitest · vite · tsx · Chrome 0, 게이트 그룹 프로세스 0.

끝: 보고 파일을 뺀 `git ls-files -s | md5` = `52d1341d4a32aa626b39ba39a6484065`(시작과 같다 — 다른 쓰는 자 없음) · `git status --short` = `?? .build/` · `9d2d6f49..HEAD` 의 바뀐 파일은 이 보고 하나.

## 남은 것

- 낮음 1(3 «크기 상한») — 서브페이지 장이 틀 높이만큼 먼저 상한에 닿는다. 설계대로라 고칠 것이 아니다. README 「화면 그리기 상한」 · 정본 PPTX 문단에 «틀이 든 높이도 상한에 든다» 한 줄을 둘지는 코디네이터 판단.
- 이 판에서 안 잰 것: DB 를 지난 `themeWarning`(앞 판 고정 프로젝트를 `theme_packages` 에 넣고 라우트로 미리보기) — T8 이 그 길(저장 패키지 읽기 · manifest 검사)을 안 바꿔 같은 함수(`readWbtheme` `stored`)로만 쟀다. 캔버스 팝업 장과의 값 견줌은 T6(lc) 의 틀 뒤에 선다. 기본테마 2.2.0(ls) 서브페이지 뷰로 찍은 번들 · PPTX 는 lx 보고 «남은 것» 그대로다.

## 지침

- 고칠 지침 없음.

## 탐침 원문

스크래치 설정(실브라우저 판 · node 판이 같은 꼴 — node 판은 `include` 만 `['**/size.probe.ts', '**/pptx.probe.ts']`). 스크래치에 체크아웃 `node_modules` 심링크를 둔다.

```ts
import { defineConfig } from 'vitest/config'
import base from '/Users/jang2162/orca/workspaces/wirebound/feat-layout-export/vitest.browser.config.ts'
export default defineConfig({ ...base, root: '<체크아웃>', test: { ...base.test, dir: '<스크래치>', include: ['**/*.probe.ts'], exclude: ['**/node_modules/**'], maxWorkers: 1 } })
```

### `nav.probe.ts`

(원문의 U+202E · U+2028 은 파일 도구가 날글자로 풀어 적었다 — 탐침은 날글자로 돌았고, 여기서는 이스케이프로 되돌려 실었다.)

```ts
/**
 * rv-lx 탐침 — 번들 내비(사람 글 · 같은 이름 장 · 지운 페이지 · 팝업만 든 메뉴 · 해시로 연 장) · 표시 옵션을 숨긴 사람의 라우트 zip / PPTX.
 */
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
const { unzipSync } = await import('/Users/jang2162/orca/workspaces/wirebound/feat-layout-export/apps/web/node_modules/fflate/esm/index.mjs')
import { isolateBidi } from '@wirebound/schema'
import type { Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
const CO = '/Users/jang2162/orca/workspaces/wirebound/feat-layout-export'
const { editorStackPrerequisite, startEditorStack } = await import(`${CO}/apps/web/build-test/editor-stack.ts`)
const { exportBundle } = await import(`${CO}/apps/web/build-test/layout-bundle.ts`)
const { makeAdmin, putTheme, uploadRaw } = await import(`${CO}/apps/web/build-test/theme-fixtures.ts`)
const { decodePng } = await import(`${CO}/apps/web/build-test/png-pixels.ts`)

const { buildTheme } = await import(`${CO}/packages/theme-kit/src/index.ts`)
const 전제 = await editorStackPrerequisite()
const SAMPLE_ROOT = `${CO}/packages/theme-kit/test/fixtures/sample-theme/`
const GNB = [12, 34, 156]
const LNB = [210, 230, 40]

const M_EVIL = '회원</script><script>window.__pwn=1</script>"\u202E관리'
const M_QUOTE = `설정"'\u2028끝`
const P_EVIL = '</script><img src=x onerror="window.__pwn2=1">목록\u202E'

async function layoutTheme(): Promise<Uint8Array> {
  const dir = mkdtempSync(join(tmpdir(), 'wb-rvlx-theme-'))
  try {
    cpSync(SAMPLE_ROOT, dir, { recursive: true })
    writeFileSync(
      join(dir, 'theme.config.ts'),
      `import { defineManifest } from '@wirebound/theme-sdk'
export default defineManifest({
  id: 'layoutrv', name: '레이아웃 탐침', version: '1.0.0', sdk: '^1.10.0', tokens: { items: {} },
  layouts: { subpage: { regions: [{ id: 'gnb', label: 'GNB' }, { id: 'lnb', label: 'LNB' }] } },
})
`,
    )
    writeFileSync(
      join(dir, 'src/theme.css'),
      `[data-probe="gnb"]{display:block;height:60px;background:rgb(${GNB.join(',')})}[data-probe="lnb"]{background:rgb(${LNB.join(',')})}`,
    )
    writeFileSync(
      join(dir, 'src/index.tsx'),
      `import { defineTheme, LayoutLink, LayoutRegion, type LayoutViewProps } from '@wirebound/theme-sdk'
import manifest from '../theme.config'
import './theme.css'
const Subpage = (props: LayoutViewProps) => (
  <div data-probe="frame">
    <LayoutRegion id="gnb" as="nav" data-probe="gnb">
      {props.gnb.map((item, index) => <span key={item.id}>{index > 0 ? ' | ' : ''}<LayoutLink item={item} data-probe="gnb-link" /></span>)}
    </LayoutRegion>
    <div data-probe="trail">{props.trail.map((item) => <span key={item.id}> / <LayoutLink item={item} data-probe="trail-link" /></span>)}</div>
    <div style={{ display: 'flex' }}>
      <LayoutRegion id="lnb" as="aside" data-probe="lnb" style={{ width: '240px', flex: 'none' }}>
        {(props.lnb?.children ?? []).map((item) => <div key={item.id}><LayoutLink item={item} data-probe="lnb-link" /></div>)}
      </LayoutRegion>
      <main style={{ minWidth: 0 }}>{props.children}</main>
    </div>
  </div>
)
export default defineTheme({ manifest, views: {}, layouts: { subpage: Subpage } })
`,
    )
    const built = await buildTheme({ root: dir, entry: 'src/index.tsx', outDir: join(dir, 'out') })
    return new Uint8Array(readFileSync(built.file))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

function ok(r: { status: number; body: any }, what: string): any {
  if (r.status >= 300) throw new Error(`픽스처 ${what} ${r.status} ${JSON.stringify(r.body)}`)
  return r.body
}

interface Fx {
  projectId: string
  ids: Record<string, string>
  menuOrder: { title: string; firstPage: string | null }[]
}

async function fixture(stack: any, owner: any): Promise<Fx> {
  const call = (m: string, p: string, b?: unknown) => stack.request(owner, m, p, b)
  const project = ok(await call('POST', '/projects', { name: 'rv', slug: `rvlx-${Date.now().toString(36)}` }), 'p')
  await putTheme(call, project.id, { themeId: 'layoutrv', version: '1.0.0', tokens: {} })
  const ids: Record<string, string> = {}
  const menu = async (key: string, title: string, parentId: string | null = null) =>
    (ids[key] = ok(await call('POST', `/projects/${project.id}/menu`, { parentId, title }), key).id)
  const page = async (key: string, menuNodeId: string, title: string, layout: 'subpage' | 'popup') => {
    const created = ok(await call('POST', `/projects/${project.id}/pages`, { menuNodeId, title, layout }), key)
    ids[key] = created.id
    if (layout === 'subpage') {
      const lines = key === 'long' ? 60 : 1
      ok(
        await call('PATCH', `/projects/${project.id}/pages/${created.id}/ops`, {
          baseSeq: 0,
          ops: Array.from({ length: lines }, (_u, i) => ({
            op: 'add',
            path: `/root/children/${i}`,
            value: { id: `n_t${i}_${created.id.slice(-6)}`, type: 'Text', props: { content: `${key} 본문 ${i}` } },
          })),
        }),
        `ops ${key}`,
      )
    }
  }
  await menu('mEvil', M_EVIL)
  await menu('mQuote', M_QUOTE)
  await menu('mSame1', '같은')
  await menu('mSame2', '같은')
  await menu('mPopupOnly', '팝업만')
  await menu('mDeleted', '지움')
  await page('evilPopup', ids.mEvil!, '먼저 팝업', 'popup')
  await page('evil', ids.mEvil!, P_EVIL, 'subpage')
  await page('long', ids.mEvil!, '긴 장', 'subpage')
  await page('quote', ids.mQuote!, `"인용'`, 'subpage')
  await page('same1', ids.mSame1!, '목록', 'subpage')
  await page('same2', ids.mSame2!, '목록', 'subpage')
  await page('popOnly', ids.mPopupOnly!, '팝업 하나', 'popup')
  await page('gone', ids.mDeleted!, '지울 장', 'subpage')
  ok(await call('DELETE', `/projects/${project.id}/pages/${ids.gone}`), '지움')
  ok(await call('PUT', `/projects/${project.id}/view-prefs`, { hiddenRegions: ['subpage.lnb', 'subpage.gnb'] }), 'prefs')
  return {
    projectId: project.id,
    ids,
    menuOrder: [
      { title: M_EVIL, firstPage: 'evil' },
      { title: M_QUOTE, firstPage: 'quote' },
      { title: '같은', firstPage: 'same1' },
      { title: '같은', firstPage: 'same2' },
      { title: '팝업만', firstPage: null },
      { title: '지움', firstPage: null },
    ],
  }
}

describe.skipIf(!전제.ok)('rv-lx 탐침', () => {
  let stack: any
  let bundle: any
  let fx: Fx
  let alice: any
  const fileToPageId = new Map<string, string | null>()

  beforeAll(async () => {
    stack = await startEditorStack(전제)
    await makeAdmin(stack, stack.users.alice)
    alice = await stack.login(stack.users.alice)
    expect(await uploadRaw(stack, alice, await layoutTheme())).toBe(201)
    fx = await fixture(stack, alice)
    bundle = await exportBundle(stack, alice, fx.projectId)
    const { readdirSync } = await import('node:fs')
    const all = (readdirSync(bundle.dir, { recursive: true }) as string[]).filter((f) => f.endsWith('.html') && !f.endsWith('codes.html')).map((f) => join(bundle.dir, f))
    for (const f of all) {
      const html = readFileSync(f, 'utf8')
      const m = /<script type="application\/json" id="[^"]+">([\s\S]*?)<\/script>/.exec(html)
      const data = JSON.parse(m![1]!)
      fileToPageId.set(resolve(f), data.pageId)
    }
    console.log('[rvlx] files', JSON.stringify([...fileToPageId].map(([f, id]) => [f.slice(bundle.dir.length), Object.entries(fx.ids).find(([, v]) => v === id)?.[0] ?? id])))
    console.log('[rvlx] nav.js bytes', readFileSync(join(dirname(all.find((f) => f.endsWith('index.html'))!), 'assets/nav.js')).length)
  }, 240_000)

  afterAll(async () => {
    bundle?.dispose()
    if (stack) await stack.close()
  })

  async function openFile(file: string, hash = '', viewport = { width: 1280, height: 800 }) {
    const context = await stack.browser.newContext({ viewport })
    const page: Page = await context.newPage()
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(`pageerror ${e.message}`))
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(`console ${m.text()}`)
    })
    await page.goto(pathToFileURL(file).href + hash)
    await page.waitForSelector('html[data-wb-ready]', { state: 'attached', timeout: 15_000 })
    return { context, page, errors }
  }

  async function linkTargets(page: Page, probe: string, from: string) {
    const raw: [string, string | null, boolean][] = await page.evaluate(
      (probe) =>
        [...document.querySelectorAll(`[data-probe="${probe}"]`)].map((e) => [
          e.textContent ?? '',
          e.getAttribute('href'),
          e.getAttribute('aria-current') === 'page',
        ]),
      probe,
    )
    return raw.map(([text, href, cur]) => {
      if (href === null) return [text, null, cur] as const
      const target = resolve(dirname(from), decodeURIComponent(href))
      const id = fileToPageId.has(target) ? fileToPageId.get(target) : `없는 파일 ${target}`
      const key = Object.entries(fx.ids).find(([, v]) => v === id)?.[0] ?? String(id)
      return [text, key, cur] as const
    })
  }

  it('모든 장 — 콘솔 오류 0 · 주입 0 · GNB 이름 · 링크 대상', async () => {
    const report: Record<string, unknown> = {}
    for (const [file, id] of fileToPageId) {
      const key = Object.entries(fx.ids).find(([, v]) => v === id)?.[0] ?? String(id)
      const { context, page, errors } = await openFile(file)
      const state = await page.evaluate(() => ({
        pwn: (window as any).__pwn ?? null,
        pwn2: (window as any).__pwn2 ?? null,
        failed: document.documentElement.getAttribute('data-wb-failed'),
        nav: typeof (window as any).__wirebound_export_nav__,
        imgs: document.querySelectorAll('img[src="x"]').length,
      }))
      report[`${file.slice(bundle.dir.length)} (${key})`] = {
        state,
        errors,
        gnb: await linkTargets(page, 'gnb-link', file),
        lnb: await linkTargets(page, 'lnb-link', file),
        trail: await linkTargets(page, 'trail-link', file),
      }
      await context.close()
    }
    console.log('[rvlx] report', JSON.stringify(report, null, 1))
    for (const v of Object.values(report) as any[]) {
      expect(v.errors).toEqual([])
      expect(v.state.pwn).toBeNull()
      expect(v.state.pwn2).toBeNull()
      expect(v.state.imgs).toBe(0)
    }
    const evil: any = Object.entries(report).find(([k]) => k.endsWith('(evil)'))![1]
    expect(evil.gnb.map((g: any) => [g[0], g[1]])).toEqual(fx.menuOrder.map((m) => [isolateBidi(m.title), m.firstPage]))
  }, 240_000)

  it('해시로 연 긴 장 — 지금 링크 상자가 0 이 아니고 창 안', async () => {
    const longFile = [...fileToPageId].find(([, id]) => id === fx.ids.long)![0]
    const out: Record<string, unknown> = {}
    for (const [hash, vp] of [
      ['#wb-screen', { width: 390, height: 600 }],
      ['', { width: 1280, height: 500 }],
      ['#wb-screen', { width: 1280, height: 500 }],
    ] as const) {
      const { context, page } = await openFile(longFile, hash, vp)
      out[`${hash}${vp.width}`] = await page.evaluate(() => {
        const e = document.querySelector('[data-probe="lnb-link"][aria-current="page"]')
        if (!e) return null
        const b = e.getBoundingClientRect()
        return { area: b.width * b.height, top: b.top, left: b.left, right: b.right, inView: b.top >= 0 && b.bottom <= innerHeight && b.left >= 0 && b.right <= innerWidth }
      })
      await context.close()
    }
    console.log('[rvlx] hash', JSON.stringify(out))
  }, 120_000)

  it('PPTX 라우트 — 숨긴 영역이 있는 사람의 내보내기에도 GNB · LNB 화소가 선다', async () => {
    const response = await fetch(`${stack.apiUrl}/api/projects/${fx.projectId}/export?format=pptx`, { headers: { cookie: alice.cookie } })
    expect(response.status).toBe(200)
    const entries = unzipSync(new Uint8Array(await response.arrayBuffer()))
    const shots = Object.entries(entries).filter(([p]) => p.startsWith('ppt/media/') && p.endsWith('.png'))
    const counts = shots.map(([p, bytes]) => {
      const px = decodePng(Buffer.from(bytes))
      let g = 0
      let l = 0
      for (let y = 0; y < px.height; y += 2)
        for (let x = 0; x < px.width; x += 2) {
          const [r, gg, b] = px.at(x, y)
          if (r === GNB[0] && gg === GNB[1] && b === GNB[2]) g++
          if (r === LNB[0] && gg === LNB[1] && b === LNB[2]) l++
        }
      return [p, px.width, px.height, g, l]
    })
    console.log('[rvlx] pptx', JSON.stringify(counts))
    const preview = await fetch(`${stack.apiUrl}/api/projects/${fx.projectId}/export/preview?format=pptx`, { headers: { cookie: alice.cookie } })
    console.log('[rvlx] preview', preview.status, (await preview.text()).slice(0, 600))
  }, 240_000)
})
```

### `overlay.probe.ts`

```ts
import { pathToFileURL } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
const CO = '/Users/jang2162/orca/workspaces/wirebound/feat-layout-export'
const { editorStackPrerequisite, startEditorStack } = await import(`${CO}/apps/web/build-test/editor-stack.ts`)
const { exportBundle } = await import(`${CO}/apps/web/build-test/layout-bundle.ts`)
const 전제 = await editorStackPrerequisite()
describe.skipIf(!전제.ok)('덮개 vs 장', () => {
  let stack: any, bundle: any
  beforeAll(async () => {
    stack = await startEditorStack(전제)
    const alice = await stack.login(stack.users.alice)
    const call = (m: string, p: string, b?: unknown) => stack.request(alice, m, p, b)
    const ok = (r: any, w: string) => { if (r.status >= 300) throw new Error(`${w} ${r.status} ${JSON.stringify(r.body)}`); return r.body }
    const project = ok(await call('POST', '/projects', { name: 'ov', slug: `ov-${Date.now().toString(36)}` }), 'p')
    const menu = ok(await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '관리자' }), 'm')
    const mk = async (title: string, layout: string, nodes: unknown[], size?: string) => {
      const page = ok(await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title, layout }), title)
      const ops: unknown[] = nodes.map((value, i) => ({ op: 'add', path: `/root/children/${i}`, value }))
      if (size) ops.push({ op: 'add', path: '/root/props/size', value: size })
      ok(await call('PATCH', `/projects/${project.id}/pages/${page.id}/ops`, { baseSeq: 0, ops }), title)
    }
    const op = (id: string, t: string) => ({ id, type: 'Button', props: { label: t }, interactions: [{ on: 'click', actions: [{ type: 'openModal', target: `page:관리자/${t}` }] }] })
    await mk('열기', 'blank', [op('n_o_s', '작은'), op('n_o_m', '보통'), op('n_o_l', '넓은')])
    for (const [t, s] of [['작은', 'small'], ['보통', 'medium'], ['넓은', 'large']]) await mk(t, 'popup', [{ id: `n_${s}`, type: 'Text', props: { content: `${t} 몸통` } }], s)
    bundle = await exportBundle(stack, alice, project.id)
  }, 180_000)
  afterAll(async () => { bundle?.dispose(); if (stack) await stack.close() })
  it('폭을 견준다', async () => {
    const rows: unknown[] = []
    for (const w of [390, 720, 1000, 1280]) {
      for (const [t, id] of [['작은', 'n_o_s'], ['보통', 'n_o_m'], ['넓은', 'n_o_l']]) {
        const ctx = await stack.browser.newContext({ viewport: { width: w, height: 800 } })
        const p = await ctx.newPage()
        await p.goto(pathToFileURL(bundle.pages['관리자-열기']).href + '#wb-screen')
        await p.waitForSelector('html[data-wb-ready]', { state: 'attached' })
        await p.locator(`[data-wb-id="${id}"]`).click()
        await p.locator('[data-wb-popup-frame]').waitFor()
        const overlay = await p.evaluate(() => { const b = document.querySelector('[data-wb-popup-frame] > [data-wb-component="Popup"]')!.getBoundingClientRect(); return [Math.round(b.width), Math.round(b.top), Math.round(b.left)] })
        await p.goto(pathToFileURL(bundle.pages[`관리자-${t}`]).href + '#wb-screen')
        await p.waitForSelector('html[data-wb-ready]', { state: 'attached' })
        const asPage = await p.evaluate(() => { const b = document.querySelector('.wb-export-canvas [data-wb-component="Popup"]')!.getBoundingClientRect(); return [Math.round(b.width), Math.round(b.top), Math.round(b.left)] })
        rows.push([w, t, overlay, asPage])
        await ctx.close()
      }
    }
    console.log('[ov]', JSON.stringify(rows))
    expect(rows.length).toBe(12)
  }, 240_000)
})
```

### `pptx.probe.ts`

```ts
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { installCatalog, type PageDocument } from '@wirebound/schema'
import { describe, expect, it } from 'vitest'
const CO = '/Users/jang2162/orca/workspaces/wirebound/feat-layout-export'
const { chromiumScreenRenderer } = await import(`${CO}/apps/api/src/services/screen-render-chromium.ts`)
const { bundled, jobOf, inlineTheme } = await import(`${CO}/apps/api/build-test/screen-jobs.ts`)
const { readWbtheme } = await import('@wirebound/themes')
function packageTheme(bytes: Uint8Array) {
  const r = readWbtheme(bytes, { stored: true })
  if (r.files === null) throw new Error('못 읽음 ' + JSON.stringify(r.issues))
  const files = r.files
  return { ref: { themeId: files.manifest.id, version: files.manifest.version }, manifest: files.manifest, tokens: {}, themeJs: files.themeJs, themeCss: files.themeCss, assets: [...files.assets.entries()] }
}
installCatalog()
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex').slice(0, 16)
function page(layout: string, lines: number): PageDocument {
  return { version: 7, layout, root: { id: 'n_root', type: 'Page', children: Array.from({ length: lines }, (_u, i) => ({ id: `n_t${i}`, type: 'Text', props: { content: `${i}번째 줄 — 한글 본문` } })) } } as any
}
function popup(layout: string, size: string): PageDocument {
  return { version: 7, layout, root: { id: 'n_p', type: 'Popup', props: { title: '사용자 검색', size }, children: [{ id: 'n_pt', type: 'Text', props: { content: '이름으로 찾는다' } }] } } as any
}
async function draw(...entries: any[]) {
  const batch = await chromiumScreenRenderer({}).render(jobOf(...entries))
  return batch.results.map((r: any) => (r.ok ? { w: r.width, h: r.height, sha: sha(r.bytes) } : { fail: r.reason }))
}
const FIX = `${CO}/apps/web/build-test/fixtures`
const themes: [string, any][] = [
  ['1.5.0', packageTheme(new Uint8Array(readFileSync(`${FIX}/system-admin-1.5.0.wbtheme`)))],
  ['1.7.0', packageTheme(new Uint8Array(readFileSync(`${FIX}/system-admin-1.7.0.wbtheme`)))],
  ['2.1.0', packageTheme(new Uint8Array(readFileSync(`${CO}/system-themes/admin/dist/system-admin-2.1.0.wbtheme`)))],
  ['none', null],
]
describe('pptx', () => {
  it('앞 판 테마 — 서브페이지 = 빈', async () => {
    for (const [v, t] of themes) {
      const out = await draw(bundled('s', page('subpage', 12), t), bundled('b', page('blank', 12), t), bundled('pp', popup('popup', 'large'), t), bundled('pb', popup('blank', 'large'), t))
      console.log('[pptx] theme', v, JSON.stringify(out))
    }
  }, 300_000)
  it('팝업 크기 — popup 레이아웃 = blank 로 감싼 같은 뿌리', async () => {
    const t = inlineTheme({ id: 'p' })
    for (const size of ['small', 'medium', 'large']) console.log('[pptx] popup', size, JSON.stringify(await draw(bundled('a', popup('popup', size), t), bundled('b', popup('blank', size), t))))
  }, 300_000)
  it('maxArea 근처 긴 장', async () => {
    const t = inlineTheme({
      id: 'lay', themeCss: '[data-probe="gnb"]{display:block;height:60px}',
      layouts: `{ subpage: (props) => { const h = rt.react.createElement; return h('div', null, h(rt.sdk.LayoutRegion, { id: 'gnb', 'data-probe': 'gnb' }), props.children) } }`,
      manifestLayouts: { subpage: { regions: [{ id: 'gnb', label: 'GNB' }] } },
    })
    for (const n of [232, 233]) console.log('[pptx] long', n, JSON.stringify(await draw(bundled('b', page('blank', n), t), bundled('s', page('subpage', n), t))))
  }, 300_000)
})
```

### `size.probe.ts`

```ts
import { describe, it } from 'vitest'
import { exportBundle } from '@wirebound/exporter'
import { installCatalog } from '@wirebound/schema'
installCatalog()
function run(n: number, depth: number) {
  const pages = Array.from({ length: n }, (_u, i) => ({ id: `p${i}`, title: `장${i}`, pageTitle: `장${i}`, document: { version: 7, layout: 'subpage', root: { id: `n_r${i}`, type: 'Page', children: [] } } as any }))
  let menu: any[] = pages.map((p) => ({ id: `m${p.id}`, title: `메뉴 ${p.id}`, pages: [{ id: p.id, title: p.title, layout: 'subpage' }], children: [] }))
  for (let d = 0; d < depth; d++) menu = [{ id: `deep${d}`, title: `깊이${d}`, pages: [], children: menu }]
  const b = exportBundle({ pages, runtimeJs: '', menu: depth < 0 ? [] : menu })
  const html = b.files.filter((f) => f.path.endsWith('.html') && f.path.startsWith('pages/')).map((f) => String(f.content).length)
  const nav = String(b.files.find((f) => f.path === 'assets/nav.js')!.content).length
  return { n, depth, nav, minPage: Math.min(...html), maxPage: Math.max(...html) }
}
describe('size', () => { it('scales', () => { for (const [n, d] of [[2, 0], [20, 0], [200, 0], [200, 8], [200, -1]]) console.log('[size]', JSON.stringify(run(n, d))) }) })
```
