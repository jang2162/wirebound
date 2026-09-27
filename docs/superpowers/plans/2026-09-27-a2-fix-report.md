# A2 리뷰 대응 보고

리뷰: `docs/superpowers/plans/2026-09-27-a2-review.md`(빨강 17 — `packages/themes/test/wbtheme-reader-divergence.test.ts` 4 · `packages/themes/test/token-input-boundary.test.ts` 12 · `packages/theme-kit/build-test/dev.test.ts` 1). 브랜치 `feat/code-themes-a2`, 시작 HEAD `9147b418`. 이 문서는 발행 시점의 기록이다(`docs/guideline/base/04-citation.md` 「이력 문서는 연대기 금지의 예외다」).

**재현 먼저**: 고치기 전에 빨강 17 을 돌렸고 17 전부 리뷰가 적은 값으로 죽었다(unit 16 — `pnpm vitest run` 두 파일 16 failed · dev 판 1 failed · 6 passed). 안 죽은 것은 없다.

변조는 전부 백업 → 변조 → 실행 → `cmp` 바이트 비교 복원 → `git status`. 백업 이름은 경로 전체다.

## 커밋

| 항목 | 커밋 | 내용 |
|---|---|---|
| F1 | `1234f27e` | `.wbtheme` 판정을 fflate 자신의 항목 목록에 맡김 — 끝 레코드 두 항목 수 · zip64 로케이터 거절, 크기는 `max(size, originalSize)` |
| F2 | `eddfd7e4` | `font` · `shadow` 토큰 값을 허용 문법으로 닫음, 색 함수 괄호 안은 수만 |
| F3 | `a304da4b` | 같은 CSS 변수가 되는 토큰 키 거절 · 자기 속성으로만 찾음 · `__proto__` 키를 모양 검사 전에 |
| F4 (5c) | `45c5359c` | dev 셸 경로가 로컬 이름으로 온 요청만 받음 |
| F4 (5b) | `74e92ab5` | dev 의 `/@fs` 를 갤러리 클라이언트 · 작성자 프로젝트로 좁힘 |
| 보고 | (이 보고서와 한 커밋) | |

## F1 — zip 판독기가 fflate 와 다른 것을 잰다(높음)

- **재현**: 4 건 리뷰 값 그대로 — `expected '/*UNCHECKED*/' not to be '/*UNCHECKED*/'` · `expected [ 'assets/../../evil.html' ] to not include …` · `expected '/*ZIP64*/' not to be '/*ZIP64*/'` · `expected 56623115 to be less than or equal to 52428800`.
- **고침**(`packages/themes/src/wbtheme/read.ts`):
  1. 손 판독기(`readCentralDirectory`)는 끝 레코드의 «이 디스크의 항목 수»(`+8`)와 «전체 항목 수»(`+10`)가 다르거나, 끝 레코드 앞 20 바이트에 zip64 로케이터(`0x07064b50`)가 있거나, zip64 표지(`0xFFFF…` — 항목 크기 칸 포함)가 있으면 이유 한 문장으로 `bad-zip`. 읽는 것은 이름과 외부 속성(링크 판정)뿐이다.
  2. `listEntries` — `unzipSync(bytes, { filter })` 의 `filter` 가 늘 거짓을 돌려 fflate 가 풀 항목 목록(이름 · `size` · `originalSize` · `compression`)만 받는다. fflate 가 던지면 `bad-zip`.
  3. `listingDivergence` — 두 목록이 이름 · 차례 · 수까지 같지 않으면 `bad-zip`.
  4. 풀린 크기 합은 fflate 목록의 항목마다 `max(size, originalSize)`.
- **새 케이스**(리뷰의 파일에 더함 — 같은 손 zip 짓개를 쓴다. 짓개에 압축 방식 칸을 더했다):
  - «stored 로컬 하나를 원래 크기 0 인 항목 여럿이 가리키면 풀기 전에 거절한다 — 메모리가 안 는다»(9.5 MB 로컬 × 항목 40, 비켜 가면 380 MB) → `unzipped-too-large`.
  - «판독기가 안 본 deflate 항목이 원래 크기를 크게 적어도 풀기 전에 거절한다»(끝 레코드 `+8`=3 · `+10`=2, 셋째가 원래 크기 `0xFFFFFFF0` 인 deflate — 리뷰가 안 잰 판) → `bad-zip`.
  - «filter 가 거절한 항목은 버퍼를 안 잡는다»(두 칸이 같은 zip 에 원래 크기 `0xFFFFFFF0` deflate) → `unzipped-too-large`.
  - «끝 레코드의 두 항목 수가 같으면 받는다»(거절이 두 수의 차에만 선다).
- **메모리**(`readWbtheme` 한 번의 앞뒤 차, 케이스가 찍는 `[wbtheme 메모리]` 줄): 세 거절 판 모두 `arrayBuffers +0.0 MB · rss +0.0 MB`. 자가 느는 것을 보는 판 — 아래 M2 에서 stored 40 개 판이 `arrayBuffers +344.3 MB · rss +366.6 MB`.
- **변조**(`wbtheme-reader-divergence` · `wbtheme` 두 파일 24 케이스):

| 변조 | 결과 |
|---|---|
| M1 목록 대조만 뗌 | **안 죽음**(24 초록) — 두 수 · 로케이터 거절이 먼저 막는다 |
| M2 `max` 만 뗌(원래 크기만 셈) | 2 죽음: «stored 원래 크기 0» `expected 56623115 to be less than or equal to 52428800` · «stored 40 개» `expected [] to deeply equal [ 'unzipped-too-large' ]` |
| M3 로케이터 거절만 뗌 | **안 죽음** — 목록 대조가 막는다 |
| M4 두 항목 수 거절만 뗌 | **안 죽음** — 목록 대조가 막는다 |
| M5 두 수 + 로케이터 뗌(목록 대조만 남김) | 안 죽음 — 목록 대조 혼자 1a · 1b · deflate 판을 막는다 |
| M6 목록 대조 + 두 수 뗌 | 3 죽음: `/*UNCHECKED*/` · `evil.html` · deflate 판 `expected { Object (manifest, themeJs, ...) } to be null` |
| M7 목록 대조 + 로케이터 뗌 | 1 죽음: `expected '/*ZIP64*/' not to be '/*ZIP64*/'` |

  세 겹(두 수 · 로케이터 · 목록 대조)은 서로를 받친다 — 하나만 떼면 남은 겹이 막고, 목록 대조와 짝 하나를 함께 떼야 죽는다. 브리프 문장 그대로 짠 판(세 겹 + `max`)이다.

## F2 — `font` · `shadow` 토큰 값이 선언 밖으로 샌다(중간)

- **재현**: 8 건 리뷰 값 그대로(`expected [] to include 'values.font.body'` 등).
- **고침**(`packages/themes/src/manifest/tokens.ts` 의 `checkTokenValue` — manifest 기본값(`checkTokens`)과 받은 값(`tokensCss` · `tokenValues`)이 이 함수 하나를 쓴다):
  - `font`: 쉼표로 가른 글꼴 이름 목록. 이름은 짝이 맞는 따옴표 문자열(안에 따옴표 · `\` · 줄바꿈 · `<` 없음) 또는 글자 · 숫자 · `_` · `-` 낱말들(유니코드 글자 — 한글 포함). **따옴표 안의 `<` 도 막는다** — 브리프 문장보다 좁다. `</style>` 은 CSS 문자열과 무관하게 HTML 의 `<style>` 을 닫는다.
  - `shadow`: `none`, 또는 괄호 밖 쉼표로 가른 목록 — 각 그림자는 `inset` 한 번까지 · 이어진 길이 2 ~ 4 개 · 색 한 개까지(색 검사는 색 토큰과 같은 함수). 낱말로 다시 이은 것이 원문과 같아야 한다(짝 맞는 괄호 블록 `(red)` 같은 낱말 밖 글자를 막는다).
  - 색 함수(`rgb()` · `rgba()` · `hsl()` · `hsla()`)의 괄호 안은 수 · `%` · `,` · 공백 · `/` 뿐이다. 그래서 `hsl(120deg …)` 도 이제 거절한다.
  - 템플릿 · `system-admin` 의 manifest 는 그대로 지난다(`system-themes` 케이스 · 템플릿 케이스 초록).
- **새 케이스** `packages/themes/test/token-value-grammar.test.ts` 54: `font` 받음 6 · 거절 18, `shadow` 받음 6 · 거절 18 — 각각 기본값과 받은 값 **양쪽**을 같은 기대로 잰다. 색 함수 괄호 받음 3 · 거절 3.
- **실 Chrome 표 다시**(리뷰의 스크래치 `rv-a2/css-probe.mjs` 를 그대로, themes `dist` 를 다시 빌드한 뒤): 36 행(값 18 × 테마 두 판) 전부 `:root` 선언 4 · 토큰 시트 규칙 1 · 요청 0(Chrome 이 스스로 내는 `/favicon.ico` 는 뺌) · 평범한 테마 판의 카나리아(`body` outline · `#b` 배경) 그대로. **받아 준 값 가운데 새는 것 0.** 받아 준 값은 1 MB 낱말(`xxx…`) 하나다(리뷰 판에서도 밖 효과 없음 — 길이 한도는 A4 api 의 몫). 옛 판이 받던 `rgb(1 2 3 / a)`(색) 도 이제 거절한다.
- **변조**(문법 · 경계 두 파일):

| 변조 | 결과 |
|---|---|
| Fa `font` 를 옛 거부 목록(`/^[^;{}<]+$/`)으로 | 25 죽음 — 리뷰 `font` 6 + 표의 거절 19 |
| Fb 그림자의 «낱말로 다시 이은 것» 대조를 뗌 | 처음에는 **안 죽음** — 표에 그 겹만 잡는 입력이 없었다. `0 0 1px (red)` 를 표에 더한 뒤 그 1 건이 `expected [] to deeply equal [ 'token-default-type' ]` |
| Fc 색 함수 괄호 안에 글자를 다시 허용 | 처음에는 **안 죽음** — 같은 까닭. 괄호 안 글자 케이스(`rgb(1 2 3 / a)` · `hsl(120deg …)` · 그림자의 `rgb(0 0 0 / none)`)를 더한 뒤 3 건 |

## F3 — 이름 입력(낮음)

- **재현**: 4 건 리뷰 값 그대로.
- **고침**:
  - 3a `checkTokens` — 두 키의 `tokenVar(key)` 가 같으면 둘째 키 자리에 `token-var-collision`(`ManifestIssueCode` 에 더함).
  - 3b `effectiveValues` 의 `key in items` · `key in values` → `Object.hasOwn`. 같은 뿌리의 자리 하나를 더 고쳤다 — `checkTokens` 의 참조 대상 `items[ref]` 가 `{toString}` 에서 프로토타입의 함수를 집어 `token-ref-type`(«타입이 다르다») 이던 것이 `unknown-token-ref` 가 된다.
  - 3c `validateManifest` — zod 모양 검사 **전에** 원문의 자기 속성 `__proto__` 를 어디서든 찾아 `shape` · 그 자리 path 로 거절한다.
- **새 케이스** `packages/themes/test/manifest-names.test.ts` 5: 겹침의 코드 · 자리, `{toString}` 참조 = `unknown-token-ref`, `__proto__` 세 자리(`tokens.items` · `patterns` · variant 객체 안). variant 객체 안의 `__proto__` 도 zod `strictObject` 가 조용히 떨궈 이슈 0 이었다.
- **변조**: 3a 겹침 검사 뗌 → 2 죽음(리뷰 1 · 새 1 `expected [] to deeply equal [ [ 'token-var-collision', … ] ]`). 3b `in` 복원 → 리뷰 2 죽음. 3b' `items[ref]` 복원 → 새 1 죽음(`token-ref-type` ≠ `unknown-token-ref`). 3c 앞 검사 뗌 → 4 죽음(새 3 `expected [] …` · 리뷰 1).

## F4 — dev 서버(낮음)

- **재현**: `expected { shell: '200', project: '200' } to deeply equal { shell: '403', project: '403' }`.
- **5c 고침**(`packages/theme-kit/src/dev.ts`): 셸 미들웨어가 제 경로(`/` · `/index.html` · `/__wb/project` · `/__wb/events`)에서 Host 가 `localhost` · `127.0.0.1` · `[::1]`(포트가 붙어도)가 아니면 403.
- **vite 판정과 견줌**(새 케이스 «로컬 이름 … 두 판정이 같다» 가 찍는 `[dev host]` 표):

| Host | `/` | `/__wb/project` | `/frame.html`(vite) |
|---|---|---|---|
| `localhost:<포트>` · `127.0.0.1:<포트>` · `[::1]:<포트>` · `localhost` | 200 | 200 | 200 |
| `sub.localhost:<포트>` | 403 | 403 | **200** |
| `evil.example:<포트>` | 403 | 403 | 403 |

  vite 6 의 기본 `allowedHosts` 는 `*.localhost` 도 받는다 — 셸이 그만큼 더 좁다. 케이스는 이 줄을 단언하지 않고 찍기만 한다.
- **5c 변조**: 판정 뗌 → 리뷰 1 · 새 1 죽음(`{ '/': '200', … }` ≠ 403). `[::1]` 만 뗌 → 새 1 **만** 죽음(`{ '/': '403', … }` ≠ 200).
- **5b — 좁혔다.** `fs.allow` 를 `[client, root]` 로 좁힌 판이 두 판에서 섰다:
  - 저장소 안 dev 케이스: 8/8 통과.
  - 템플릿 설치판: 좁힌 소스로 `packTemplate` → 저장소 밖(스크래치) 에 풀고 `npm install` → `npx wb-theme dev` + Chrome 탐침. 칸 37 · 종류 19 · `data-wb-error` 0 · `pageerror` 0 · 제목 «내 테마 · 0.1.0». 설치판 dev 는 케이스로 잠그지 않았다(`WB_TEMPLATE_INSTALL=1` 판은 build 까지만 돈다).
  - 새 케이스 «/@fs 로 작성자 프로젝트 · 갤러리 클라이언트 밖(저장소 뿌리의 README)을 못 읽는다» — 카나리아는 프로젝트의 `theme.config.ts`(200). 넓은 판으로 되돌린 변조 → 그 1 건 `expected 200 to be 403`.
  - 링크한 SDK(저장소 안 판)가 좁힌 `fs.allow` 밖에 있는데도 갤러리가 서는 까닭은 재지 않았다.

## 게이트

| 명령 | 결과 |
|---|---|
| `pnpm typecheck` | 오류 0 |
| `pnpm test` | 342 파일 · **5929 통과 · 1 건너뜀 · 실패 0**(건너뜀은 전부터 있던 `apps/api/test/log-destination.test.ts` «Linux /dev/full»). api 는 워크트리 자기 DB(5442). 리뷰 직후(338 파일 · 5850 + 리뷰 빨강 16)에 F1 4 · F2 54 · F3 5 를 더한 수 |
| `pnpm test:build` | 30 파일 · **176 통과 · 1 건너뜀 · 실패 0**(건너뜀은 `template.test.ts` 의 설치 판). dev 판 9(리뷰 1 · 5c 1 · 5b 1 더함) |
| `WB_TEMPLATE_INSTALL=1` 로 `template.test.ts` | **9 통과 · 건너뜀 0** — 저장소 밖 `npm install` → build → typecheck. 템플릿 zip 236,319 B · kit tarball 205,579 B · SDK tarball 16,184 B |
| 리뷰의 빨강 17 | 전부 초록 |

## 이월 · 알릴 것

- **설치판의 dev 는 케이스가 없다** — `WB_TEMPLATE_INSTALL=1` 판에 dev(서버 · Chrome)를 더하면 좁힌 `fs.allow` 가 설치판에서 계속 서는지 잠근다.
- 셸의 Host 판정이 vite 보다 좁다(`*.localhost`) — 작성자가 `*.localhost` 로 열면 셸만 403 이다.
- 1e(`assets/．．/x.png` 전각 점)는 리뷰대로 이월 — 자산 이름으로 파일을 쓰거나 URL 로 내는 소비자(A3 · A5)가 서면 다시 잰다.
- 토큰 값의 길이 한도는 두지 않았다(1 MB 낱말을 받는다) — 저장 한도는 A4 api 가 정한다.

---

## 좁은 반증 2 대응

리뷰: `docs/superpowers/plans/2026-09-27-a2-review-2.md`(보고 `90301d3d` · 빨강 `b8481bc0` — `token-value-grammar.test.ts` 3 · `dev.test.ts` 1, 잠금 1). 시작 HEAD `90301d3d`.

**재현 먼저**: 빨강 4 가 리뷰 값 그대로 죽었다 — 그림자 3 건 `expected [ 'token-default-type' ] to deeply equal []`, dev 1 건 `expected 403 to be 200`.

### 커밋

| 항목 | 커밋 | 내용 |
|---|---|---|
| F5 | `17d3f971` | 길이의 수가 앞 점 소수(`.5rem`)를 받음 — 그림자 · `length` 토큰 |
| F6 | `29179e4b` | dev 의 `fs.allow` 에 작성자 프로젝트가 든 워크스페이스 뿌리의 `node_modules` 를 더함 |
| F7 | `f5de2f06` | deflate 항목을 스트리밍으로 풀며 적힌 원래 크기를 넘는 순간 멈춤 |
| 문장 | `d2b3e55d` | `readWbtheme` 머리말(로케이터 거절이 혼자 지키는 것) · `isLocalHost` 머리말(vite 보다 좁다) |
| 보고 | (이 절과 한 커밋) | |

### F5 — 앞 점 소수(중간)

- **고침**: `LENGTH` 의 수를 `-?(?:\d+(?:\.\d+)?|\.\d+)` 로. `length` 토큰도 같은 식이라 함께 닫힌다(원래 있던 길).
- **안 받음**(설계 판단 — 이 차수): 그림자 · 색의 `oklch()` · `calc()` · 대문자 단위(`1PX`) · `deg`(`hsl(120deg …)`).
- **새 케이스** 7(`token-value-grammar.test.ts` «length 토큰 값 — 앞 점 소수»): 받음 `.5rem` · `-.25em` · `0.5px`, 거절 `.rem` · `5.rem` · `..5rem` · `.5REM`.
- **변조**: 앞 점 갈래를 뗌 → 5 죽음(리뷰 3 · 새 받음 2), 모두 `expected [ 'token-default-type' ] to deeply equal []`.

### F6 — 워크스페이스로 올린 `node_modules`(중간)

- **고침**: `fs.allow` = `[client, root, join(searchForWorkspaceRoot(root), 'node_modules')]`.
- **값**: 저장소 안 dev 판 10/10 — 리뷰의 글꼴 케이스(pnpm 워크스페이스) 초록, 대응 때 세운 «README 는 밖» 초록 그대로.
- **리뷰의 워크스페이스 두 판**(코디네이터 스크래치 `rv2-a2/ws-pnpm` · `ws-npm`, `@fontsource/inter`): 설치된 kit 의 `dist` 를 지금 소스로 빌드한 `dist` 로 바꿔 끼우고 리뷰의 `ws-dev-probe.mjs` 를 돌렸다. 두 판 모두 칸 37 · 종류 19 · `data-wb-error` 0 · 4xx 0 · `Inter:loaded`(콘솔의 404 한 줄은 `/favicon.ico`). 탐침 뒤 두 워크스페이스의 kit `dist` 는 백업에서 되돌렸다(`diff -rq` 같음). npm 판은 케이스가 없다.
- **변조**(서로 다른 케이스가 죽는다 — 두 겹이 각자 제 성질을 잡는다):
  - `node_modules` 를 뗌(대응 판) → 글꼴 1 건 `expected 403 to be 200`.
  - `node_modules` 대신 워크스페이스 뿌리 전체 → README 1 건 `expected 200 to be 403`.

### F7 — deflate 원래 크기를 속인 zip 이 읽기를 쥔다(원래 있던 길 · 중간)

- **케이스**(`wbtheme-reader-divergence.test.ts` «deflate 항목의 원래 크기를 작게 적은 zip 이 읽기를 오래 쥐지 않는다»): 0 바이트 256 MB 를 fflate 스트리밍 `Deflate`(level 9)로 지은 스트림 하나를 원래 크기 1 인 항목 195 개가 가리킨다(zip 276,361 B). 시간 한도 5 s 로 단언.
- **고치기 전**(HEAD 소스): **425,711 ms** · 판정 `[]` → `expected 425710.84 to be less than 5000`. 리뷰가 잰 59 s 보다 길다 — 리뷰는 node `zlib` 으로 스트림을 지었고, 이 케이스는 fflate 로 지었다. 그 차이의 까닭은 재지 않았다.
- **고침**(`packages/themes/src/wbtheme/read.ts`): `unzipSync` 는 stored 항목만 푼다. deflate 항목은 `inflateBounded` 가 푼다.
  - 데이터 시작은 fflate 와 같게 로컬 머리의 이름 · 확장 길이로 찾는다.
  - 4096 바이트씩 `Inflate.push` 하고, 나온 바이트가 적힌 원래 크기를 넘는 순간 멈춘다 → `bad-zip`.
  - 압축 방식이 0 · 8 밖이면 `bad-zip`.
- **고친 뒤**: 같은 케이스가 **14 ms** 에 `["bad-zip"]`.
- **정상 `.wbtheme` 읽기**(한 번 읽는 시간 — 500 회 평균, 두 번 잼, 스크래치 `read-time.mjs` 가 빌드한 `dist` 를 부름):

| 파일 | 고치기 전 | 고친 뒤 |
|---|---|---|
| `system-admin-0.1.0.wbtheme`(3,812 B) | 0.077 ms | 0.138 ms |
| 템플릿 빌드 산출물 `my-theme-0.1.0.wbtheme`(3,096 B) | 0.048 ms | 0.102 ms |

  비율로는 두 배 가깝다. 더해진 것은 한 번에 0.06 ms 안쪽이다(업로드 · 시딩에서 한 번 부른다).
- **변조**:
  - Ga 넘침 판정만 뗌 → **안 죽음**(26 초록, 14 ms). 버퍼(`originalSize`) 밖으로 쓰는 `out.set` 이 `RangeError` 를 던져 같은 자리에서 `bad-zip` 이 된다 — 두 번째 겹이다.
  - Gb 판정을 떼고 넘친 쓰기를 버리며 계속 풂 → `expected 31909.27 to be less than 5000`.

### 문장 두 곳

- `readWbtheme` 머리말: «목록 대조는 외부 속성을 못 견주므로, 두 디렉터리가 이름까지 같은 zip64 판은 로케이터 거절이 혼자 막는다.» 를 더했다. 같은 머리말의 «deflate 항목은 원래 크기만큼 버퍼를 잡는다» 에 `inflateBounded` 도 같다고 덧붙였다.
- `isLocalHost` 머리말: «vite 와 같은 판정이어야 한다» → «vite 보다 좁다 — `*.localhost` · IP 꼴은 셸만 403, 대문자는 셸만 받는다(브라우저는 Host 를 소문자로 보낸다)».

### 게이트

| 명령 | 결과 |
|---|---|
| `pnpm typecheck` | 오류 0 |
| `pnpm test` | 342 파일 · **5941 통과 · 1 건너뜀 · 실패 0**(건너뜀은 전부터 있던 `log-destination` «Linux /dev/full»). DB 5442. 앞 게이트 5929 에 리뷰 빨강 3 · 잠금 1 · F5 7 · F7 1 |
| `pnpm test:build` | 30 파일 · **177 통과 · 1 건너뜀 · 실패 0**(건너뜀은 템플릿 설치 판). dev 판 10(리뷰 빨강 1 더함) |
| 리뷰 2 의 빨강 4 | 전부 초록 |

### 이월

- npm 워크스페이스의 dev 글꼴 판 · 설치판 dev 는 케이스가 없다(탐침으로만 확인).
- 그림자 · 색의 `oklch` · `calc` · 대문자 단위 · `deg` 는 받지 않는다 — 받을지는 설계 판단이다.
- 정상 파일의 읽기가 0.06 ms 늘었다 — 스트리밍 `Inflate` 의 비용이다. 한 번에 넣는 크기(4096)와의 관계는 재지 않았다.
