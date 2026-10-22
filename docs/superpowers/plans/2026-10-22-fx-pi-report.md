# FX-PI 보고 — 상태 설명 상자 대응 (RV-PI H1 – H3 · L1 · L3) (2026-10-22)

대상: 브랜치 `feat/page-info`(기준 HEAD `916e4245` — RV-PI 보고). 리뷰 보고 `2026-10-22-rv-pi-report.md` 의 H1 – H3 · L1 · L3 을 고친다.

## 재현 — 고치기 전 소스의 빨강

`apps/web/build-test/state-tree.test.ts` 에 실브라우저 케이스 넷을 더하고 고치기 전 소스(`916e4245` 의 `apps/web/src` · `packages/schema`)로 돌렸다
(`pnpm vitest run -c vitest.browser.config.ts apps/web/build-test/state-tree.test.ts -t …` · node v24.21.0).

| 케이스 | 고치기 전 | 실패 값 |
|---|---|---|
| «상태 설명 초안은 탭 왕복 · 모드 왕복을 넘고 …, 다른 상태의 상자를 열어도 앞 초안이 남는다»(H1 · L1) | 빨강 | 탭 왕복 뒤 `li[data-state-id="s_guest"]` 의 «상태 설명» 상자가 없다(`inputValue` 30s 시간 초과 — 상자 0) |
| «설명을 치는 중 남이 그 상태를 지우면 «지워졌습니다» 와 친 글이 남고, 버리기로 걷는다 — 편집 0»(H2) | 빨강 | «지워진 상태의 설명» 무리가 안 선다(`waitFor` 30s — 친 글이 탭 어디에도 없다) |
| «상자를 연 뒤 남이 같은 상태의 설명을 쓰면 저장이 덮지 않고 충돌을 세운다 …»(H3 — 화면에 남의 글이 와 있는 판) | 빨강 | 저장 뒤 그 줄의 `role=alert` 가 안 선다(30s) |
| «남의 설명이 내 화면에 닿기 전에 저장하면 서버가 묶음째 거절하고 같은 충돌이 선다 …»(H3 — 서버 거절 판 · 서버 → 브라우저 WS 2.5s 지연) | 빨강 | 판 카나리아(보낸 `patch` 프레임 1 · 앨리스 글)는 서고, `role=alert` 가 안 선다(15s) |

마지막 케이스의 첫 판은 판 카나리아(«보낸 편집 0»)에서 죽었다 — 늦춘 WS 가 `joined` 를 받기 전에 저장해 편집이 REST 로 나갔다. 케이스가 `joined` 프레임을
기다린 뒤 치게 고쳐 다시 돌린 값이 위 표다.

고친 판: 같은 파일 13 케이스 — 통과 13 · 실패 0(새 넷 포함). 고치는 중 한 번 «상자를 연 뒤 …» 둘째 판이 «설명 쓰기» 를 다시 누르는 자리에서 죽었다 —
첫 판의 같은 자리 누름에서 500ms 안이라 행동 메뉴가 더블클릭의 둘째로 삼켰다(스크린숏: 메뉴가 열린 채). 케이스가 600ms 를 넘긴 뒤 누르게 했다.

## L3 — 번들 첫 탭 이름 · PPTX 노트 절

번들 첫 탭(`packages/exporter/src/labels.ts` 의 `PANEL_TABS[0]`)을 «페이지 정보»로 바꾸고, PPTX 노트의 페이지 설명 절은 따로 둔 `NOTE_DESCRIPTION_SECTION`
(«페이지 설명»)으로 낸다 — 그 절은 페이지 설명만 싣는다. `labels.ts` 머리말의 «탭 이름을 PPTX가 절 제목으로 쓴다»를 «같은 것을 싣는 탭만»으로 좁혔다.
노트 절 이름을 재는 케이스를 `packages/exporter/test/pptx.test.ts` 에 세웠다(«노트의 절 이름은 «페이지 설명» · «코멘트» · «상호작용» 차례다 …» — 앞의
`toContain(panelLabel('description'))` 는 이름이 무엇으로 바뀌든 따라가 아무것도 안 쟀다).

바이트 잠금(`bundle-stateless-bytes.test.ts`)은 `WB_PRINT_DIGEST=1` 로 새로 지었다. **바뀐 바이트가 탭 이름뿐인지** 쟀다: 새 판의 페이지 HTML 마다
«페이지 정보» 를 «페이지 설명» 으로 되돌려 해시했다.

| 파일 | «페이지 정보» 수 | 되돌린 해시 | 앞 해시(`916e4245`) | 새 해시 |
|---|---|---|---|---|
| 테마 없음 `index.html` | 1 | `257df31e66529a96` | `257df31e66529a96` | `00325ded8443628c` |
| 〃 `pages/넓은-표본.html` | 1 | `4a6cec2bef49de7c` | 같음 | `cfd49460874d47d4` |
| 〃 `pages/슬롯.html` | 1 | `681f803bd957006e` | 같음 | `aa3ab81956adac75` |
| 〃 `pages/글.html` | 1 | `84b26fe335a70579` | 같음 | `471e3d78fd9d66df` |
| 〃 `pages/깨진-문서.html` | 1 | `887683844a0a5cb9` | 같음 | `9ab11048c5f61199` |
| 테마 있음 `index.html` | 1 | `e61f7db03415ae1f` | 같음 | `ad20498e2f5f4a0e` |
| 〃 `pages/넓은-표본.html` | 1 | `7eb7c94ccaa43c10` | 같음 | `4adaced61f6f0c87` |
| 〃 `pages/슬롯.html` | 1 | `27f2f0b80889417c` | 같음 | `f6f459c1f23e816b` |
| 〃 `pages/글.html` | 1 | `8a1e77b21772c0f0` | 같음 | `e191ae0229f91004` |
| 〃 `pages/깨진-문서.html` | 1 | `0579d7f72b4430c0` | 같음 | `0cf1fd266dd8dd82` |

CSS · 테마 · 토큰 파일의 해시는 그대로다. `packages/exporter` 전부 + `system-themes/admin/build-test/bundle-views.test.tsx`: 26 파일 · 통과 482 · 실패 0.
