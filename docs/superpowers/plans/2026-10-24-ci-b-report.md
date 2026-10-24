# CI-B 보고 — 자리표시자 · 그림 올리기(3단계 문제 2)

설계: `docs/superpowers/specs/2026-10-24-compose-input-design.md` «문제 2 — 자리표시자». 브리프 `brief-ci-b.md` · 공통 규칙 `common-w8.md`. 판 번호는 SDK 1.5.0 · `system-admin` 1.5.0 이다(CI-A 의 1.4.0 위 — CI-A 병합 뒤 다시 맞춘다).

## B1 — props · 몸통 · 색 칸

### 바꾼 것

| 자리 | 무엇 |
| --- | --- |
| `packages/schema/src/component/catalog/document.ts` | `Placeholder` props: `label` · `width` · `height`(20 ~ 2000 · 선택) · `background` · `borderColor` · `color`(`PLACEHOLDER_COLOR` 소문자 `#rrggbb` 또는 `''` · 선택) · `border`(`dashed` · `solid` · `none`) · `radius`(0 ~ 999) · `fontSize`(10 ~ 72) · `align`(`start` · `center` · `end`) · `padding`(0 ~ 200). 몸통 구역 `body` «내용» |
| `packages/schema/src/component/define.ts` | `EditorControl` 에 `color` |
| `packages/theme-sdk/src/placeholder.ts`(새) | `placeholderVars(props)` · `PLACEHOLDER_VARS` — 정한 값만 `--wb-node-placeholder-*` 로(꼴 밖은 다시 거른다) |
| `packages/theme-sdk/src/default-views/document.tsx` | `PlaceholderView` — 뿌리에 변수 · 몸통이 있으면 `content`, 없으면 `label`. 기본 CSS(특이도 0): 변수 끊기 · 가로 줄 세우기 · 빈 칸 120px · 표지 규칙 · `Flex` 몫이면 너비가 바닥 |
| `packages/theme-sdk/src/marks.ts` | `Placeholder: { border, align }` |
| SDK 판 | 1.3.0 → 1.5.0(`version.ts` · `package.json`) |
| `system-themes/admin` | `theme.css` 가 변수를 대체값과 함께 읽는다 · 테두리 꼴 표지 · 몸통 `Text` 가 글 색을 물려받는다. 1.5.0(`sdk ^1.5.0`) · `checksums.json` 새 줄 |
| `packages/theme-gallery/src/samples.ts` | 자리표시자 표본 «정한 색 · 모서리 · 여백»(`PLACEHOLDER_SET_PROPS`) · «칩(내용)» |
| `packages/theme-kit/src/check.ts` | 정한 값 표본의 뿌리 변수를 잰다(`source: 'placeholder'`) |
| `packages/theme-kit/src/shots.ts` | 정한 값 표본의 계산 값을 실 Chromium 으로 잰다(`placeholder` · 문제 줄) |
| `packages/theme-kit/template` | `SKILL.md` 뷰 계약 · sdk 범위 `^1.5.0` |
| `apps/web/src/panels/controls/color-control.tsx`(새) | 색 칸 — 지금 색 · 글 칸(blur · Enter) · 고르개(`change` 한 번) · «테마 기본»(지우기) · 견본 열둘 · 잠금에 다 꺼짐 |
| `apps/web/config/llms-txt.ts` · `public/llms.txt` | 자리표시자 영어 설명 · `anyOf` · `pattern` 꼴 |
| 정본 설계서 | §4 «예외는 `Placeholder` 하나다» · 카탈로그 표 · §6.1 표지 목록 · «자리표시자의 그리기 값은 노드 변수로 실린다» · 속성 탭 «색 칸» |

### 결정과 이유

- **`wb-theme check` 는 계산된 색을 못 잰다 — 둘로 나눴다**(설계 «8» 과 다르다 · `q-ci-b.md` Q-B1). jsdom 25.0.1 은 특이도를 안 보고(문서 차례만) `var()` 를 안 푼다(계산 값이 `var(--x, blue)` 글자). 그래서 `check`(jsdom)는 뷰가 뿌리에 변수를 싣는지(오류), `shots`(실 Chromium)는 계산된 `background-color` · `border-top-color` · `border-top-style` · `color` · 모서리 · 글 크기 · 여백이 정한 값인지(문제 줄)를 잰다.
- **이미지 prop(`image` · `imageFit`)은 B2 에 넣는다** — B1 만 든 판에 위젯 없는 control 이 서지 않게.
- **색은 스키마가 소문자만 받는다** — 위젯이 대문자 · `#` 없는 여섯 자리를 바꿔 보낸다. 서버는 `#2563EB` 를 422 로 거절한다(문서에 두 표기가 섞이지 않게).
- **`Flex` 안에서 몫을 받은 자리표시자의 너비는 바닥(`min-width`)이다** — 몫 규칙 `flex: <몫>` 이 바탕 폭을 0 으로 두어 `width` 가 안 듣는다. 바탕 폭을 너비로 두려면 렌더러의 몫 변수 꼴을 바꿔야 해서(`Grid` 가 같은 변수를 칸 수로 읽는다) 안 했다.
- **안의 `Text` 는 기본테마에서 글 색만 물려받는다** — 글 크기까지 물려받게 하면 몸통의 제목(`h1`)이 캡션 크기가 된다.

### 잰 값

- `wb-theme shots` — `system-admin` 390 · 1280 두 폭에서 정한 값 표본의 계산 값 7 속성 다 정한 값(`placeholder: []`). 스타터 템플릿(풀어서 빌드한 판) 1280 에서도 `[]`.
- 서버 거절 — `PUT …/schema` · `PATCH …/ops` 둘 다 `url(https://example.com/x.png)` · `#2563eb;color:red` · `#2563eb}` · `var(--wb-x)` · `#2563EB` · `red` · `#fff` 를 세 색 prop 마다 422(`invalid-props`) · 편집은 문서 · `headSeq` 를 안 바꾼다. `Text` 의 `background` 도 422(모르는 prop).
- 번들 바이트 — 상태 없는 페이지 번들에서 바뀐 파일은 `assets/views.css` 하나(`bef9cb8070612849` → `d640f37f50db8546`) · 페이지 HTML 그대로.

### 혼자 죽는 변조(B1)

변조마다 그 케이스 파일만 돌렸다. 복원은 경로 이름 백업 · 바이트 비교. 빌드 산출물을 거친 것(M2 · M5)은 복원 뒤 `pnpm --filter '@wirebound/theme-kit...' build` 를 다시 돌렸다.

| 변조 | 자리 | 죽은 케이스(실행 · 실패) | 실패 값 |
| --- | --- | --- | --- |
| M1 정한 값 검사를 안 부른다 | `theme-kit/src/check.ts` | check «정한 그리기 값을 안 싣는 …» (10 · 1) | `[]` ≠ 변수 여덟 |
| M18 «다르면» → «비었으면» | 〃 | 같은 케이스 (10 · 1) | 틀린 값 하나를 못 잡음 `[]` |
| M2 계산 값 다름을 안 적는다 | `theme-kit/src/shots.ts` | shots «자리표시자 변수를 덮는 …» (5 · 1) | 종료 코드 0(1 이어야) |
| M3 기본테마 바탕이 변수를 안 읽는다 | `system-themes/admin/src/theme.css` | shots «system-admin 을 두 폭으로 …» (5 · 1) | `placeholder` 한 줄 |
| M17 기본테마 `solid` 표지 규칙을 뗀다 | 〃 | 같은 케이스 (5 · 1) | `border-top-style` 한 줄 |
| M5 템플릿 CSS 가 바탕을 덮는다 | `theme-kit/template/src/theme.css` | template «자리표시자가 정한 …» (9 · 1 · 건너뜀 1 = 설치 판) | `placeholder` 한 줄 |
| M6 고르개를 `input` 에 커밋 | `color-control.tsx` | color «고르개는 …» (6 · 1) | 편집 3 개(0 이어야) |
| M7 소문자로 안 바꾼다 | 〃 | color `normalizeColor` · «글 칸은 blur …» (6 · 2) | `null` · 편집 0 |
| M8 꼴 밖에 말하지 않는다 | 〃 | color «꼴 밖의 글 …» (6 · 1) | `alert` 없음 |
| M9 견본이 잠금에 안 꺼진다 | 〃 | props-lock «위젯 여덟이 …» (23 · 1) | `color` 칸 하나 `false` |
| M10 «테마 기본» 이 다른 색을 보낸다 | 〃 | color ««테마 기본» 은 …» (6 · 1) | `replace` ≠ `remove` |
| M11 뿌리마다 변수 끊기를 뗀다 | `theme-sdk/src/default-views/document.tsx` | placeholder-view «기본 CSS 가 …» (5 · 1) | 끊는 줄 없음 |
| M12 몸통 판정을 뒤집는다 | 〃 | placeholder-view «몸통이 없으면 라벨 …» (5 · 1) | 라벨 없음 |
| M13 색 거름을 «비지 않음» 으로 | `theme-sdk/src/placeholder.ts` | placeholder-view «placeholderVars 는 꼴 밖의 …» (5 · 1) | 변수 셋 |
| M14 색 꼴의 끝 닻(`$`)을 뗀다 | `schema/.../document.ts` | api placeholder-props 둘 (2 · 2) | `#2563eb;color:red` 200 |
| M16 표지 표에서 자리표시자를 뺀다 | `theme-sdk/src/marks.ts` | prop-marks (92 · 5) | 표지 없음 · DOM 같음 |
| M19 `anyOf` 꼴을 안 읽는다 | `apps/web/config/llms-txt.ts` | llms-txt «public/llms.txt 가 …» (2 · 1) | 생성물 다름 |

## B2 — 그림

### 바꾼 것

| 자리 | 무엇 |
| --- | --- |
| `packages/schema` | `Placeholder` 에 `image`(`ASSET_ID_PATTERN` — sha256 소문자 64 자 또는 `''`) · `imageFit`(`cover` · `contain`). `EditorControl` 에 `image`. `images.ts`(새) — `imageIdsIn` · `clearImages`(몸통 · 구역 자손까지 · 검증 전 값에서 안 던진다). 클립보드 봉투에 `source: { projectId }`(선택) |
| `packages/theme-sdk` | `useAsset` · `AssetProvider` · `AssetResolver`. 기본 뷰의 그림 조각(`image` · `image-missing` · `data-wb-frame`) · CSS. 표지 `imageFit` |
| `packages/renderer` | `RenderOptions.assetUrl` |
| `packages/exporter` | 번들 `assets/images/<id>.<ext>`(호출자가 넘긴 것만) · 페이지 데이터 `images`(그 파일에서 본 상대 주소) · 런타임 `assetUrl` · 준비 신호가 그림을 기다린다(`imagesSettled` — 한도 5s) |
| `packages/theme-gallery` | 그림 든 자리표시자 표본(저장소 안 표본 PNG · `data:`) |
| `apps/api` | 마이그레이션 `0030-assets`(표 셋 · 덩이 지우기 트리거) · `routes/assets.ts`(라우트 여섯) · `repos/assets.ts` · `services/asset-format.ts`(꼴 · 크기) · 오류 코드 `too-large` 413 · `unsupported-media` 415 · `asset-quota` 409 · 한도 env 셋 · 번들 수집(`export-source.ts` 의 `readExportImages` → 워커 프로토콜 `images` 조각) |
| `apps/web` | API 메서드 넷(`uploadAsset` — XHR 진행 · `listAssets` · `claimAssets` · `claimMyAssets`) · 캔버스 `assetUrl` · 그림 칸(`controls/image-control.tsx`) · 패널의 `usePlaceImage`(누른 때의 노드 · 그 순간의 판) · `edit/claim-images.ts`(가져오고 못 가져온 것을 비움 · 개인 몫이면 거절) · 붙이기 · 모듈 넣기 · 복사 · 저장에 가져오기 · `shell.css` 그림 칸 |
| `packages/mcp` | `/llms.txt` REST 요약에 `GET` · `POST …/assets` |
| 문서 | 정본 §4.2 표 셋 · §4.3 · §6.1 · §9 클립보드 · 속성 탭 «그림 칸» · §10 · §11.1 · §11.3 · **§11.4 «그림»(새)** · `apps/api/README.md` 라우트 여섯 · 오류 셋 · «그림» 절 · `docs/guides/deploy-docker.md` env 셋 · 백업 한 줄 · `.env.example` 둘 · SKILL.md `useAsset` |

### 결정과 이유

- **덩이 지우기는 트리거다**(두 소유 표의 `AFTER DELETE`) — 프로젝트 CASCADE · 사람 삭제 · 손으로 지운 행이 같은 길을 지난다. 트리거는 ① 다른 소유 행이 보이면 아무것도 안 잡고 ② 안 보이면 덩이 `FOR UPDATE` ③ 다시 세어 지운다. ①이 앞인 까닭: 프로젝트 삭제가 남과 나눈 덩이까지 잡으면 그 덩이 여럿을 다른 차례로 잡는 가져오기와 고리가 선다. ②③이 따로인 까닭: 넣는 쪽(덩이 `KEY SHARE`)의 커밋을 기다린 뒤 세야 FK 위반(23503)이 안 난다(`0030-assets` 머리말).
- **한도는 소유자마다의 자물쇠**(`pg_advisory_xact_lock`) — 프로젝트 행 `NO KEY UPDATE` 로 줄 세우면 트리 쓰기와 한 줄에 선다.
- **가져오기가 출처 멤버 행을 `FOR SHARE` 로 읽는다** — 읽은 뒤 · 커밋 전에 그 사람이 빠져도 «멤버였다» 로 커밋하지 않게.
- **그림 응답 전부에 격리 머리를 싣는다**(SVG 만이 아니다) + `Cross-Origin-Resource-Policy: same-origin`(설계에 없던 줄 — 다른 origin 의 문서가 `<img>` 로 싣지 못하게).
- **올리기 라우트의 파서는 꼴을 가리지 않고 바이트로 받는다** — `Content-Type` 으로 파서에서 415 를 내면 가드보다 먼저 답해 비멤버에게 404 대신 415 가 나간다(`actor-census` · `pre-guard-hook-census`). 꼴은 바이트로 가른다.
- **«올린 그림에서» 목록 · 지금 그림 정보는 `listAssets` 한 길** — 그림 하나의 메타 라우트를 더하지 않았다.
- **개인 몫으로 옮기는 자리(저장 · 프로젝트 → 개인 복사)는 하나라도 못 가져오면 저장하지 않는다 · 프로젝트로 옮기는 자리(붙이기 · 넣기 · 개인 → 프로젝트 복사)는 비우고 말한다** — 설계 «10» 의 표 그대로. 복사는 서버 라우트가 따로 없어(웹이 원본을 다시 읽고 새로 저장한다) 가져오기도 웹이 부른다(설계 «복사 라우트 안에서 서버가 한다» 와 다르다 — 복사 라우트가 없다).
- **준비 신호의 그림 기다림에 한도 5s** — 멈춘 요청이 PPTX 캡처를 붙잡지 않게(AGENTS.md «답을 기다리며 미뤄 두는 장치에는 한도를 둔다»).
- **exporter 의 그림 id 걷기를 schema 의 `imageIdsIn` 하나로** — 같은 걷기가 두 벌이었다.
- **B1 의 색 칸 · 그림 칸 CSS 는 단일 클래스 선택자만** — `shell-css` 누수 검사가 결합자를 막는다.

### 잰 값

**1. 읽기 권한 — 채널마다**(`apps/api/test/assets.test.ts` «채널마다 상태 · 바이트» · 같은 해시 · PNG 32×20)

| 판 | 상태 | 바이트가 나왔나 |
| --- | --- | --- |
| P viewer · editor · P 의 토큰 | 200 | 같음 |
| 비멤버 · Q 멤버(P 에) · Q 멤버(Q 에 — 해시를 안다) · Q 토큰(P · Q 에) | 404 | 아님(봉투 `not-found` «그림을 찾을 수 없습니다» · 그림 머리 16 바이트 없음) |
| 로그아웃 | 401 | 아님 |
| 번들(`GET …/export`) — 문서에 Q 의 해시를 적은 P | 200 | zip 에 P 의 그림만(`assets/images/<P 의 해시>.png` · 바이트 같음) · Q 의 바이트가 어느 파일에도 없다 · 페이지 데이터에 Q 의 해시 없음 |
| 캔버스(실브라우저) | — | P 의 그림 `naturalWidth` 64 · Q 의 해시는 «그림을 불러올 수 없음» |
| 내보낸 번들 `file://`(실브라우저) | — | P 의 그림 64 · Q 의 해시는 표지 |
| PPTX(실브라우저) | — | 화면 이미지에서 240×160 칸의 자홍 화소(두 칸마다 셈) > 19,200 |

**2. 개인 몫 — 남의 개인 그림 · 없는 해시** — 상태 · 몸 · `content-type` · `content-length` 가 같다(404). 시간(inject · 300 번 번갈아 · ms):

| 판 | 중앙값 | p90 |
| --- | --- | --- |
| 개인 몫 — 남의 것 | 2.21 | 4.32 |
| 개인 몫 — 없는 해시 | 2.18 | 4.22 |
| 프로젝트 — 남의 프로젝트 그림의 해시 | 2.72 | 5.17 |
| 프로젝트 — 없는 해시 | 2.81 | 5.29 |

토큰으로 `GET /api/me/assets/:id` · `POST /api/me/assets/claim` 은 401, `POST …/assets/claim` 은 403.

**3. 가져오기 입구마다** — 서버(`assets.test.ts` «가져오기»): 다른 프로젝트의 멤버면 옮기고, 출처에 없는 해시 · 비멤버 · 지워진 출처는 `not-readable` · 소유 행 수를 값으로. 웹(jsdom): 붙이기(`edit/paste-images.test.tsx` — 편집 전 가져오기 1 · 못 가져온 것만 비움 · «그림 1개를 가져오지 못해 비웠습니다 — 출처에 들어갈 수 없습니다» · 끊김이면 둘 다 비움 · 같은 프로젝트 · 출처 없는 봉투는 0 번) · 넣기 · 복사 둘(`palette/module-tab.test.tsx` «그림 —») · 저장(`panels/save-module.test.tsx` «그림»).

**4. 한도** — 파일: 같으면 201 · +1 바이트 413(«그림은 5 MB 까지 올릴 수 있습니다(이 파일 7.2 MB)» 꼴) · 프로젝트: 합이 한도와 같으면 201 · +1 바이트 409 `asset-quota` · 이미 가진 그림은 다시 올려도 200(안 센다) · 사람: 같으면 옮기고 +1 바이트는 `quota`. 겹친 올리기(`assets-race.test.ts` — 둘이 한도 자물쇠에 줄 선 것을 `pg_locks` 로 본 뒤 놓는다): 하나 201 · 하나 409 · 합은 한도 안.

**5. 꼴** — 확장자 · `Content-Type` 과 내용이 다른 파일은 바이트로 가른다(PNG 바이트를 `image/svg+xml` · 이름 `사진.jpg` 로 보내면 `mime: image/png` 로 저장되고 `content-type: image/png` 로 나간다 · 아홉 표본을 `application/octet-stream` 으로 보내도 꼴 · 크기가 바르다 · 꼴 밖은 415). 응답 머리(실브라우저 · 직접 연 SVG): `content-type: image/svg+xml` · `content-security-policy: default-src 'none'; style-src 'unsafe-inline'; sandbox` · `x-content-type-options: nosniff` · `cross-origin-resource-policy: same-origin`. 스크립트 든 SVG 의 전역 표지 `__wbSvgRan`: 캔버스 `<img>` — 호스트 0 · 캔버스 0 · 직접 연 탭 0 · 번들 0. **카나리아**: 같은 origin 의 다른 주소에서 같은 바이트를 격리 머리 없이 내면 > 0(이 판이 «도는 것» 을 본다). viewBox 만 든 SVG 의 `naturalWidth` 는 Chrome 이 225 로 정한다(서버가 잰 크기는 120×80).

**6. 지우기** — 프로젝트를 지우면 그 소유 행 0 · 남이 안 가진 덩이 0 · 다른 프로젝트 · 사람이 가진 덩이는 남는다(`assets.test.ts` «지우기»).

**7. 번들 · PPTX** — 번들 zip `assets/images/` 두 파일(PNG 64×40 · SVG) 크기가 올린 바이트와 같다 · `file://` 로 연 페이지의 `src` 가 `../assets/images/<id>.<ext>` · PNG `naturalWidth` 64. PPTX 화면 이미지 한 장 · 그 칸이 자홍(위 1).

**8. 그리기 prop** — B1 «잰 값».

**파일 놓기(실브라우저 · CDP `Input.dispatchDragEvent`)** — 패널의 라벨 칸에 놓음: 탭 1 · 주소 그대로 · 올리기 0. 그림 칸에 놓음: 탭 1 · 주소 그대로 · 올리기 1.

### 혼자 죽는 변조(B2)

변조마다 그 케이스 파일(이름이 든 갈래는 `-t`)만 돌렸다. 복원은 경로 이름 백업 · 바이트 비교(24 개 다 `restored: true`) · 끝에 그 워크트리의 vitest 0. 실행 수는 `통과 + 실패`.

| 변조 | 자리 | 죽은 케이스(실행 · 실패) | 실패 값 |
| --- | --- | --- | --- |
| N1 읽기가 프로젝트를 안 가린다 | `repos/assets.ts` 의 `readProjectAsset` | «채널마다 상태 · 바이트» (1 · 1) | Q 멤버 · Q 토큰이 해시로 200 |
| N2 CSP 에서 `sandbox` · `default-src` 를 뗀다 | `routes/assets.ts` 의 `ASSET_HEADERS` | «응답 머리» (1 · 1) | `csp` 값 |
| N2b 같은 변조 · 실브라우저 | 〃 | «SVG 주소를 탭으로 직접 열어도» (1 · 1) | 응답 머리 값 |
| N3 한도 비교 `>` → `>=` | `repos/assets.ts` 의 `addProjectAsset` | «프로젝트 한도» (1 · 1) | 한도와 같은 합이 409(201 이어야) |
| N4 한도 자물쇠를 뗀다 | 〃 | 겹친 올리기 (1 · 1) · 세 번 다 | `[201, 201]`(`[201, 409]` 이어야) |
| N5 출처 멤버 확인을 뗀다 | `repos/assets.ts` 의 `readableFromProject` | «다른 프로젝트에서» (1 · 1) | 비멤버의 가져오기가 `claimed` |
| N6 트리거가 덩이를 안 지운다 | `0030-assets` | «프로젝트를 지우면» (1 · 1) | 덩이 셋(둘이어야) |
| N7 트리거가 남이 가진 덩이도 지운다 | 〃 | 같은 케이스 (1 · 1) | 프로젝트 삭제 500(FK `RESTRICT`) |
| N8 번들 수집이 프로젝트를 안 가린다 | `repos/assets.ts` 의 `readProjectAssetsForBundle` | «번들 — 그 프로젝트가 가진 그림만» (1 · 1) | zip 의 그림 둘(하나여야) |
| N9 개인 몫 읽기가 사람을 안 가린다 | `repos/assets.ts` 의 `readPersonalAsset` | «상태 · 몸 · 머리가 같다» (1 · 1) | 남의 개인 그림 200 |
| N10 가져오기가 토큰을 받는다 | `routes/assets.ts` 의 claim 라우트 | «세션만» (1 · 1) | 토큰 200(403 이어야) |
| N11 `cross-origin-resource-policy` 를 뗀다 | `ASSET_HEADERS` | «응답 머리» (1 · 1) | `corp` 값 |
| W1 못 가져온 그림을 안 비운다 | `edit/claim-images.ts` | paste-images 둘 (4 · 2) | `image` 가 남음 |
| W2 출처를 안 본다(가져오기 0) | `shell/editor-keys.tsx` 의 `claimFrom` | paste-images 둘 (4 · 2) | 가져오기 `[]` · 그림 남음 |
| W3 복사가 출처를 안 싣는다 | `shell/editor-keys.tsx` 의 `copySelected` | «복사는 봉투에 이 프로젝트를 출처로» (4 · 1) | `source` 없음 |
| W4 개인 모듈 넣기가 안 가져온다 | `palette/module-tab.tsx` | «개인 모듈 넣기 — …» (4 · 1) | 가져오기 `[]` |
| W5 개인 몫 복사가 거절을 무시한다 | 〃 | «개인 모듈로 복사 — …» (4 · 1) | 통지 `''` · 저장됨 |
| W6 저장이 거절을 무시한다 | `panels/save-module-dialog.tsx` | «못 가져오면 저장하지 않고» (2 · 1) | 상자가 닫힘(저장됨 — 상자를 못 찾는 실패로 보인다) |
| W7 패널 놓기 막이를 뗀다 | `controls/image-control.tsx` | «칸에 놓은 파일은 올리고 …» (8 · 1) | `defaultPrevented` `[false, false]` |
| W7b 같은 변조 · 실브라우저 | 〃 | «파일 놓기» (1 · 1) | 탭 2(Chrome 이 놓은 파일을 새 탭으로 연다) |
| W8 올리기의 꼴 머리를 늘 octet-stream | `api/http-client.ts` 의 `uploadAsset` | uploadAsset 첫 케이스 (3 · 1) | `content-type` 값 |
| W9 그림을 안 기다린다 | `exporter/src/browser/ready.ts` | `imagesSettled` 둘 (5 · 2) | `done` 이 곧바로 참 · 0ms |
| W10 안 실린 그림도 주소 표에 | `exporter/src/bundle/index.ts` | 주소 표 · 런타임 (5 · 2) | 표에 남의 id · 표지 대신 `<img>` |
| W11 몸통을 안 걷는다 | `schema/src/images.ts` 의 `clearImages` | «고른 id 의 image 키만 …» (3 · 1) | 비운 수 1(2 여야) |

**N4 의 첫 판은 구분력이 아니었다** — 겹친 올리기의 문이 한도 자물쇠 자체였어서 자물쇠를 뗀 변조가 판 카나리아(«줄 서지 않았다(0)»)로 죽었다. 문을 프로젝트 행(`FOR UPDATE` — 한도 자물쇠 앞)으로 옮기고 `project_assets` 커밋을 늦춘 판(`pg_sleep(0.5)` 제약 트리거)으로 다시 지었다 — 변조 3 번 다 `[201, 201]` · 고친 소스 3 번 다 초록.

**못 재는 것** — `imagesSettled` 의 한도를 떼는 변조는 값이 아니라 케이스 시간 초과로 죽는다(기다림이 끝나지 않는 것이 그 결함이다). 한도 케이스는 «한도에서 놓는다»(60ms) 하나다.

### 설계와 다른 점(B2)

- **복사(개인 ↔ 프로젝트 모듈)의 가져오기는 웹이 부른다** — 설계 «10» 은 «복사 라우트 안에서 서버가 한다» 인데 복사 라우트가 없다(웹이 원본을 다시 읽고 `createModule` · `createMyModule` 로 새로 저장한다 — 정본 §11.1). 서버 라우트를 새로 세우지 않고 붙이기 · 넣기와 같은 `edit/claim-images.ts` 를 지난다. 그 대가: MCP · CLI 가 그림 든 노드로 개인 모듈을 저장하면 가져오기가 없다(둘 다 모듈 도구가 없어 오늘은 길이 없다).
- **응답 머리에 `Cross-Origin-Resource-Policy: same-origin` 을 더했다**(설계에 없다).
- **번들 페이지 데이터의 `images` 는 실린 그림이 있을 때만 싣는다** — 그림 없는 번들의 페이지 HTML 바이트가 그대로다(`bundle-stateless-bytes` 의 핀은 `assets/views.css` 하나만 바뀐다).

## 게이트

커밋 `df118fe0`(B1 `e12a139d` + B2) · node v24.21.0 · `nohup nice -n 10 caffeinate -i` 체인 하나(슬롯 `gate-slots/ci-b` · 띄울 때 슬롯 0). `README.md` 「트랙 게이트」 의 web · schema · renderer · theme-sdk · themes · theme-kit · exporter · api 줄을 합친 것 = `pnpm test` · `pnpm test:build` 두 갈래다. 마이그레이션 디렉터리를 글자로 세는 자(`git grep -lE 'MIGRATIONS_DIR|db/migrations' apps/api/test` — 14 파일)는 api 프로젝트라 `pnpm test` 에 든다.

| 단계 | 시각 | rc | 파일 | 통과 | 실패 | 건너뜀 |
| --- | --- | --- | --- | --- | --- | --- |
| `pnpm test --maxWorkers=25%` | 05:14 – 05:23 | 0 | 519 | 8308 | 0 | 1(`log-destination` 의 Linux `/dev/full` 판 — macOS) |
| `test:build:serial`(`vitest run --project build`) | 05:23 – 05:25 | 1 | 17 | 157 | **1** | 1(`template` 의 `WB_TEMPLATE_INSTALL=1` 판) |
| `test:browser` | 05:25 – 05:39 | 0 | 86 | 515 | 0 | 1(`layout-weight` 의 스크린숏 판) |
| `test:build:serial` 다시 | 05:42 – 05:44 | 0 | 17 | 158 | 0 | 1(같은 판) |

- **실패 하나** — `apps/api/build-test/screen-chromium.test.ts` «장 수를 네 배로 늘려도 최고치가 거의 그대로다» 의 `많이.after`(0) ≠ `적게.after`(2): 첫 판이 끝난 뒤 500ms 에 이 프로세스의 Chromium 자손 둘이 아직 남아 있었다(닫히는 중). 그 파일을 혼자 세 번 — 31 · 31 · 31 통과, 그 갈래를 다시 — 158 통과. 이 트랙은 그 경로(`screen-render-chromium.ts`)를 안 바꿨고(그림 없는 페이지는 `imagesSettled` 가 곧바로 끝난다) 도는 동안 CI-A 의 슬롯이 섰다(같은 기계의 부하). 두 판 다 적는다.
- **잠듦** — `pmset -g log` 의 마지막 ` Sleep ` 줄은 2026-10-23 20:49 — 게이트 시각(2026-10-24 05:14 – 05:44)과 안 겹친다.
- `pnpm fmt` · `pnpm lint`(경고만 — 오류 0) · `pnpm typecheck` 깨끗. 바뀐 파일의 숨은 글자(제어 · 방향 · 폭 없는 · U+2028)는 0(날 BOM 둘을 `\uFEFF` 로 되돌렸다).

## 남은 것

- **CI-A 병합을 기다림** — 병합되면 main 을 합치고 SDK · `system-admin` 판(1.5.0 이 CI-A 의 1.4.0 위인지) · `checksums.json` 새 줄 · `/llms.txt` 다시 내기 · 겹침 표의 손 합치기(`EditorControl` · `marks.ts` · `render.tsx` · `samples.ts` · `prop-marks.test.tsx` · SKILL.md)를 한 뒤 게이트를 다시 돈다. 병합 전에 이 워크트리 테스트 DB 의 `kysely_migration` 에서 `0029` 없이 `0030` 을 기록한 판을 내린다(AGENTS.md «마이그레이션 번호를 옮기면»).
- **그림 칸의 «올리는 사이 남이 잠금 · 지움» 갈래는 jsdom 케이스가 없다** — `usePlaceImage` 의 `locked` · `gone` 문장. 잰 것은 «다른 노드를 골라도 처음 노드에»(`image-control.test.tsx`) 하나다. 잠금 판은 실브라우저 두 사람 판으로 재는 것이 맞다(리뷰 몫).
- **칸 안의 붙여넣기(`paste` 의 `clipboardData.files`)는 jsdom 흉내로만 쟀다** — Chrome 에서 파일 붙여넣기를 자동화로 낼 길(CDP)이 없어 실브라우저 판이 없다.
- **쓰지 않는 그림의 정리 단추는 없다**(Q5 — 프로젝트 · 사람과 함께만 지운다). 한도를 먹는 판은 «올린 그림에서» 의 쓴 용량으로 보인다.
- **페이지 JSON 은 그림을 안 싣는다** — 다른 프로젝트로 가져오면 그림이 «그림을 불러올 수 없음» 이다(설계 «10»).
- **번들의 SVG 를 `file://` 로 직접 열면 그 로컬 origin 에서 스크립트가 돈다**(Q7 이 받은 대가 · 쿠키 · 세션 없음).

## 지침

1. **무엇이 틀렸나** — `.ruler/20-verification.md` 「「통과」를 보기 전에 몇 개가 실행됐는지 확인한다 — 덧붙임」 의 zsh 항목이 줄바꿈 목록을 `F=("${(@f)$(…)}")` 배열로 받아 `"${F[@]}"` 로 넘기라고 하는데, 그 꼴로 `git add -- "${F[@]}"` 를 치자 에이전트 셸의 안전 검사가 «rm 이 든지 읽을 수 없다» 로 거절했다(명령 안에 `rm` 이 없었다). **넣을 문장**(같은 항목 끝): «경로 목록을 `git add` 에 넘길 때는 배열 대신 목록을 스크래치 파일에 쓰고 `git add --pathspec-from-file=<파일>` 로 넘긴다 — `"${(@f)…}"` 배열 확장이 든 명령은 에이전트 셸의 안전 검사가 못 읽어 거절한다.»
2. **비어 있던 것** — `.ruler/30-delegation.md` 「경주를 재는 케이스는 두 요청이 겹친 판만 센다」 절. 겹침의 문을 **재려는 장치 그 자체**(한도 자물쇠)로 세우면 그 장치를 뗀 변조가 값이 아니라 판 카나리아(«줄 서지 않았다(0)»)로 죽는다 — 구분력이 아니다. **넣을 문장**: «겹침의 문은 재려는 장치 **앞**의 다른 잠금(그 요청이 먼저 지나는 행)으로 세운다 — 재려는 장치를 문으로 쓰면 그 장치를 뗀 변조가 판 카나리아로 죽는다. 문을 놓은 뒤 둘이 함께 읽는 창은 그 쓰기의 커밋을 늦춰(`DEFERRABLE INITIALLY DEFERRED` 제약 트리거의 `pg_sleep`) 넓힌다(`apps/api/test/assets-race.test.ts`).»
3. **비어 있던 것** — `.ruler/30-delegation.md` 「jsdom 값은 실브라우저 값이 아니다」 절. **넣을 문장**: «**jsdom 은 그림을 싣지 않는다** — `img.complete` 가 거짓인 채 `load` · `error` 가 오지 않아, 그림을 기다리는 준비 신호(`packages/exporter/src/browser/ready.ts` 의 `imagesSettled`)를 타는 jsdom 케이스는 한도까지 멈춘다. 그 케이스는 `HTMLImageElement.prototype.complete` 를 참으로 세워 돌리고, 기다림 자체는 그 함수에 직접 단 케이스로 잰다(`packages/exporter/test/bundle-images.test.ts`).»
4. **비어 있던 것** — 같은 절의 실브라우저 크기 항목. Chrome 은 `viewBox` 만 든 SVG 의 `naturalWidth` 를 기본 300×150 에 맞춘 값(120×80 → 225)으로 낸다 — 서버가 머리에서 잰 크기와 다르다. **넣을 문장**: «`viewBox` 만 든 SVG 의 `naturalWidth` 는 Chrome 이 기본 크기 300×150 에 맞춰 정한다 — 그림이 실렸는지는 `> 0` 으로 재고 크기는 서버가 잰 값(`asset_blobs.width`)으로 견준다.»
