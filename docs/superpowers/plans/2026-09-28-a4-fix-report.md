# A4 리뷰 대응 — 토큰 초안 · 번들 등록 · manifest 한 벌 (2026-09-29)

대상: 브랜치 `feat/code-themes-a4`, 리뷰 `docs/superpowers/plans/2026-09-28-a4-review.md`(보고 `644ae660` · 케이스 `a30d92e3`).
이 문서는 발행 시점의 기록이다(`docs/guideline/base/04-citation.md` 「이력 문서는 연대기 금지의 예외다」).

| # | 리뷰 | 고침 커밋 | 리뷰 빨강 |
| --- | --- | --- | --- |
| H1 | 4a 토큰 초안이 말없이 사라진다(중간) | `26c90e19` | 둘 다 초록 |
| H2 | 2b 늦은 등록이 다음 번들의 정의가 된다(낮음) | `8814d7a4` | 초록 |
| H3 | 2c 번들 manifest ≠ 서버 manifest(낮음) | `0a2fe828` | 초록 |
| — | spec 반영 · 리뷰 케이스 머리말을 지금 참인 문장으로 | `1cd545f4` | — |

H4(«지침에 넣을 것»)는 브리프대로 손대지 않았다. 리뷰의 잠금 케이스(층 밖 `!important`)는 전 과정 초록이다.

**값의 출처.** «실브라우저» 는 `apps/web/build-test/*`(editor-stack — 일회용 DB · api · vite · headless Chrome), «jsdom» 은 `apps/web/test/*`,
«Node» 는 `packages/theme-sdk/test/*` 의 값이다. 변조는 전부 백업(경로 전체 이름 — `fx-a4/bak/apps__web__src__…`) → 한 곳만 맞는 치환 →
실행 → 복사 · `cmp` identical → `git status` 깨끗으로 돌렸다. 변조 판마다 그 변조가 겨누는 파일만 돌렸다.

## 재현(고치기 전 · HEAD `644ae660`)

`pnpm vitest run --project build apps/web/build-test/theme-review.test.ts` → **4 실패 · 1 통과**. 값은 리뷰가 적은 그대로다(실브라우저):

| 케이스 | 값 |
| --- | --- |
| 새 판으로 바꿔도 | `expected '#e11d48' to be '#ff5500'` |
| 409 로 다시 읽어도 | `expected '#000000' to be '#ff5500'` |
| 늦게 등록한 번들 | `{ alert: null, note: '늦은 카드' }` (기대 `{ alert: …silent@1.0.0…, note: null }`) |
| manifest 가 달라도 | `{ panel: 'huge', drawn: 'plain' }` (기대 `drawn: 'huge'`) |

## H1 — 토큰 초안(`apps/web/src/settings/token-editor.tsx`)

**고침.** 편집기가 초안을 얹어 둔 바인딩(`held`)을 쥔다. 바인딩이 바뀌면:

- **이 편집기가 바인딩을 넘긴 경우**(제 저장 · 409 의 «서버 값으로» — `resetting`)는 지금처럼 초안 = 새 서버 값.
- 그 밖(고르개의 저장 · 고르개의 409 다시 읽기 · 편집기 제 저장의 `onStale` 다시 읽기)은 **옛 바탕과 다른 칸**만 새 바탕 위에 얹는다.
  판이 같으면 그대로(반쯤 친 값도), 판이 다르면 `migrateTokens(옛 manifest, 새 manifest, 그 칸들)` 로 옮기고 옮기지 못한 수를 편집기
  머리(`h3` 밑 `role="status"`)에 한 줄로 말한다.

**브리프 문장과 달라진 것.**

- 문장: «바꾼 판에 없는 토큰 N 개의 초안을 버렸습니다» → **«바꾼 판으로 옮기지 못한 토큰 N 개의 초안을 버렸습니다»**. `migrateTokens` 는
  «새 판에 없음» 외에 «타입이 다름» · «새 선언의 검사에 걸림(반쯤 친 값)» 도 버린다 — «없는» 은 그 둘에서 틀린 말이 된다.
- **같은 판이면 `migrateTokens` 를 안 부른다** — 부르면 반쯤 친 값(`#12`)이 검사에 걸려 버려진다. 칸이 그대로라 옮길 것이 없다.
- 편집기 제 저장의 409-`onStale`(서버가 지금 값을 안 실은 409) 뒤에도 초안을 남긴다 — 저장이 실패한 것이라 친 값을 지우지 않는다.
  브리프의 «제 저장 · «서버 값으로» 뒤에는 초안 = 서버 값» 은 성공한 저장과 사람이 고른 «서버 값으로» 로 읽었다.
- **고르개 확인 상자에 «저장 안 한 초안 N 개» 는 더하지 않았다** — 초안이 이제 남고 못 옮긴 것은 편집기 머리가 말하므로 확인 상자는
  서버 토큰의 이어짐만 세는 지금 뜻을 지킨다. 더하려면 초안을 절(`theme-section.tsx`)로 올려야 해 두 자식의 경계가 바뀐다.
- 남는 성질(재지 않은 판단): 같은 판의 409 다시 읽기 뒤 초안이 남으므로, 남이 같은 칸에 저장한 값은 그 칸에서 안 보이고 다음
  «토큰 저장» 이 새 `rev` 로 덮는다. 고르개 쪽 문장(«다른 사람이 먼저 바꿨습니다 — 지금 값을 다시 읽었습니다»)은 선다. 리뷰 케이스가
  «초안이 남는다» 를 요구하므로 그쪽을 골랐다.

**새 케이스(jsdom, `apps/web/test/settings/theme-chooser.test.tsx` «고르개와 토큰 초안»).** ① 다른 테마로 바꾸면 이어지는 칸은 남고
(`주색 #123456`) 새 판의 칸은 기본값(`새것 #ffffff`), 옮기지 못한 둘(없는 칸 · 타입이 다른 칸)을 «… 2 개 …» 로 말한다. ② 고르개 409 다시
읽기 뒤 같은 판의 반쯤 친 값(`#12`)이 남고 초안 없는 칸은 서버 값(`위험 #00aa00`)으로 선다 · 한 줄 없음. 헬퍼 `chooseAcme` 를 모듈 수준으로
옮겼다(새 describe 가 쓴다).

**변조**(값으로 죽은 것만 적는다):

| 변조 | 죽은 케이스 · 값 |
| --- | --- |
| M1a 얹기 뗌(`setDraft(fresh)`) | jsdom ① `'#ff0000'≠'#123456'` · ② `'#ff0000'≠'#12'` · 실브라우저 리뷰 둘 `'#e11d48'≠'#ff5500'` · `'#000000'≠'#ff5500'` |
| M1b «서버 값으로» 의 `resetting` 뗌 | jsdom 기존 «409 — … «서버 값으로» 는 초안을 서버 값으로» `'#0000ff'≠'#00ff00'` |
| M1c 한 줄 뗌 | jsdom ① — 문장 없음(판이 선 뒤의 동기 조회) |
| M1d 같은 판도 `migrateTokens` | jsdom ② `'#ff0000'≠'#12'` |
| M1e **제 저장**의 `resetting` 뗌 | **아무것도 안 죽는다(25/25)** — 제 저장의 응답은 보낸 초안(기본값 뺀 것)이라 «얹기» 로도 같은 초안이 선다. 서버가 값을 바꿔 돌려주는 판이 없다. 브리프의 계약대로 남겼고 재는 케이스는 없다 |

기존 토큰 편집기 케이스: jsdom `test/settings/token-editor.test.tsx` 12/12 · 실브라우저 `build-test/theme-settings.test.ts` 2/2 그대로.

## H2 — 등록을 스크립트에 매단다(`packages/theme-sdk/src/runtime.ts` · `apps/web/src/theme/bundle-loader.ts`)

**고침.** `register` 가 부른 순간의 `target.document.currentScript`(적재 realm 의 문서)를 등록과 함께 적는다. `take(script)` 는 그
스크립트의 등록만 받고, 다른 것(스크립트 밖 · 다른 스크립트)은 버리며 `console.warn('테마 번들 스크립트 밖에서 온 등록을 버렸습니다')`
한 줄. `take()` 인자 없음은 옛 동작(스크립트를 가리지 않음) — `system-themes/admin/build-test/wbtheme.test.tsx` 의 `new Function` 판
(`currentScript` 가 없다)이 그대로 3/3. 로더는 `load` 에서 `take(script)`.

**브리프와 달라진 것.** `register` 의 «두 번 등록» 경고를 갈랐다 — 칸에 든 앞 등록이 **같은 스크립트**의 것이면 «두 번 등록됐습니다», 다른
스크립트(미룬 것)면 «스크립트 밖 등록을 버렸습니다». 안 가르면 미룬 등록 뒤에 제때 등록한 번들이 «두 번 등록» 이라는 거짓 경고를 낸다.

**jsdom 흉내.** `test/theme/bundle-loader.test.ts` 의 `runScript` 는 jsdom 이 `src` 스크립트를 안 돌리므로 realm 문서에 `currentScript`
getter 를 잠깐 얹고 `register` 를 부른다. 그 흉내가 실브라우저와 같은지는 리뷰 케이스(실브라우저)가 같은 변조에 함께 죽는 것으로 본다
(M2a · M2b).

**새 케이스.** Node `packages/theme-sdk/test/runtime.test.ts` 2: `take(script)` 가 그 스크립트의 등록만 받고 밖의 것은 버리고 경고한다 ·
밖의 등록이 든 칸에 스크립트가 등록하면 «두 번» 이 아니라 «밖» 경고. jsdom `test/theme/bundle-loader.test.ts` 2: 스크립트가 끝난 뒤 미룬
등록이 다음 적재의 정의가 안 된다(실패 문장 · 경고 1) · 미룬 등록이 있어도 다음 스크립트가 등록하면 그 정의를 받는다(성질 잠금 —
고치기 전에도 `ok`, 경고 문장만 갈린다).

| 변조 | 죽은 케이스 · 값 |
| --- | --- |
| M2a 로더 `take(script)` → `take()` | jsdom «미룬 등록은 … 되지 않는다» `{status:'ok',…}≠{status:'failed',…}` · 실브라우저 리뷰 `{ alert: null, note: '늦은 카드' }` |
| M2b 런타임 `take` 가 스크립트를 안 봄 | 위 둘 + Node «take(script) 는 …» `expected {manifest…} to be null` |
| M2c `register` 의 경고를 안 가름 | Node «밖의 등록이 칸에 있는데 …» · jsdom «미룬 등록이 칸에 있어도 …» — 둘 다 `['테마가 두 번 등록됐습니다 …']≠['테마 번들 스크립트 밖에서 …']` |

## H3 — 서버 manifest 한 벌(`apps/web/src/theme/bundle-loader.ts` 의 `withServerManifest`)

**고침.** 번들 결과가 `ok` 면 정의의 manifest 를 서버 manifest 로 바꿔 끼운다(`{ ...definition, manifest }`). 번들 manifest 의 `id` ·
`version` 이 서버 것과 다르면 `failed` — «테마 번들이 다른 테마를 등록했습니다(<서버 id@판> — 번들은 <번들 id@판>)» — 이고 공급자가
`bundle-failed`(기본 뷰 · 셸 머리 알림 · theme 시트 뺌)로 그린다. `components` 만 다르면 알림 없이 서버 것.

**브리프와 달라진 것.** 공급자(`theme/project-theme.tsx`)만이 아니라 **설정 미리보기(`settings/theme-preview.tsx`)도** 같은 함수를
거친다 — 미리보기의 갤러리는 정의의 manifest 로 variant 칸을 짓는다(`packages/theme-gallery/src/gallery.tsx`). 안 거치면 설정 페이지에서
같은 어긋남이 남는다. 로더의 캐시는 번들 결과를 그대로 두고 쓰는 자리에서 끼운다 — 같은 `id@판` 의 서버 manifest 는 판마다 하나라
캐시와 어긋날 일이 없다.

**새 케이스.** jsdom `test/theme/bundle-loader.test.ts` «withServerManifest» 4(components 만 다름 → 서버 manifest 를 그 객체 그대로 ·
id 가 다름 · 판이 다름 → 실패 문장 · 실패는 그대로). jsdom `test/theme/project-theme.test.tsx` 2(다른 테마를 등록 → `{ alert: …, marker:
null }` · 시트 base · tokens 만 / components 만 다름 → 캔버스 Button `data-wb-variant="huge"` · 알림 없음). jsdom
`test/settings/token-editor.test.tsx` 1(미리보기 갤러리의 Button variant 칸이 서버의 `['huge']`).

| 변조 | 죽은 케이스 · 값 |
| --- | --- |
| M3a 공급자의 끼움 뗌 | jsdom «다른 테마를 등록» `{ alert: null, marker: 'acme' }` · «components 만» `'default'≠'huge'` · 실브라우저 리뷰 `{ panel: 'huge', drawn: 'plain' }` |
| M3b 미리보기의 끼움 뗌 | jsdom 미리보기 `['default','primary',…(3)]≠['huge']` |
| M3c id · 판 검사 뗌 | jsdom `withServerManifest` id · 판 둘 `{status:'ok'}≠{status:'failed'}` · «다른 테마를 등록» |
| M3d 판 검사만 뗌 | jsdom `withServerManifest` «판이 다르면» |

«다른 테마를 등록» 케이스는 처음 `findByText` 로 짜서 M3a 에 «못 찾음»(대기 끝)으로 죽었다 — 판이 선 뒤(알림이 서거나 테마 뷰가 섬) 두
값을 함께 읽게 고쳐 값(`{ alert: null, marker: 'acme' }`)으로 죽게 했다.

## 게이트(HEAD `1cd545f4`)

| 명령 | 결과 |
| --- | --- |
| `pnpm typecheck` | 종료 0 |
| `pnpm build` | 종료 0 |
| `pnpm test`(DB 5444) | 361 파일 · **6237 통과 · 1 건너뜀 · 실패 0** — 구현 보고 6224 + 새 13(chooser 2 · bundle-loader 6 · runtime 2 · project-theme 2 · token-editor 1). 건너뜀은 `log-destination` «Linux /dev/full»(macOS) |
| `pnpm test:build` | 34 파일 · **192 통과 · 1 건너뜀 · 실패 0** · 327.6s — 구현 보고 187 + 리뷰 파일 5. 건너뜀은 `theme-kit` «저장소 밖에서 설치하고 빌드한다»(`WB_TEMPLATE_INSTALL=1` 일 때만) |
| `pnpm test:browser`(dev 번들) | 23 파일 · **84 통과 · 건너뜀 0 · 실패 0** · 278.8s — 리뷰 빨강 4 초록 · 잠금 1 초록 |
| `EDITOR_STACK_BUNDLE=build pnpm test:browser` | 23 파일 · **84 통과 · 건너뜀 0 · 실패 0** · 278.7s |

## 띄운 것

실브라우저 판은 전부 `editor-stack.ts` 가 띄우고 거뒀다. 워크트리 Postgres(5444)만 썼고 최상위(5433)는 건드리지 않았다. 끝에
`ps` 로 이 워크트리 경로의 프로세스 0. 변조 백업은 스크래치 `fx-a4/bak/` 에만 있다.
