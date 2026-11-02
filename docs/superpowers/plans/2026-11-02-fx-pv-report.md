# FX-PV · 테마 미리보기 리뷰 대응 + main 합치기 — 보고

브랜치 `feat/theme-preview` · 브리프 `.coord/brief-fx-pv.md` · 리뷰 보고 `2026-11-02-rv-pv-report.md`(«남은 것» 표의 H1 · M1 · M2 · M2b · L1 · L2).
L3(문턱 높이의 깜빡임)은 손대지 않았다(이월).

## 바꾼 것

### 1단계 — 리뷰 대응

| 결함 | 고친 자리 | 무엇 |
| --- | --- | --- |
| H1 | `apps/web/src/canvas/canvas-popups.tsx` 의 `usePopupArea` | 덮개 셈을 iframe 요소의 크기 바뀜(`ResizeObserver`)에도 다시 부른다. 에디터 캔버스와 함께 쓰는 훅이다 |
| M1 | `apps/web/src/settings/theme-preview.tsx` 의 `useTopOnPageChange` | 장(`page` 상태)이 바뀌면 상자 `scrollTop` 을 0 으로, 틀 위 끝이 바깥 스크롤 칸(없으면 창) 위로 나가 있으면 틀을 그 칸 안으로 내린다. 장 이름 줄 · 예제 안 이음이 같은 상태를 바꾸므로 둘 다 덮는다 |
| M2 · M2b | `apps/web/src/settings/token-editor.tsx` | 저장이 끝나면(성공 · 409 · 422 · 실패 모두) 그 커밋 뒤 답(표지 `data-wb-token-answer` — 409 나란히 보기 · «고칠 칸이 있습니다» · 알림 문장)을 감싼 구간의 아래 끝이 보이는 구간 밑이면 그만큼 굴린다(`revealBelow`) |
| L1 | `packages/theme-gallery/src/examples/theme-examples.tsx` | 예제 뿌리가 `auxclick` 도 막는다(`onAuxClick={keepInside}`) |
| L2 | `apps/web/src/settings/token-editor.tsx` | 무리가 0 이면 `role="tablist"` 를 안 그린다(«토큰 저장» · «전부 기본값으로» 는 그대로 — 늘 꺼짐) |

`scrollParent`(`canvas-popups.tsx`)를 내보내 M1 · M2 가 함께 쓴다.

케이스(`apps/web/build-test/rv-pv-preview.test.ts` · `rv-pv-themes.test.ts`): `it.fails` 여섯에서 `.fails` 를 떼고 머리말을 지금 참인 글로 고쳤다. 더한 것:

- M1 을 넓혔다 — 이음으로 옮긴 뒤 이어서 긴 대시보드를 끝까지 굴린 채 **장 이름 줄** «주문 상세» 로 옮긴 판도 잰다.
- **M1b**(새) — 390 에서 바깥 칸을 굴려 틀 위 끝이 창 밖(−200)일 때 이음으로 옮기면 틀 위 끝이 창 안(≥ 0)이다. 설정 화면은 틀이 맨 끝이고 높이가
  창에 묶여(`max-height: 60vh` · 넓으면 `100vh − 32px`) 끝까지 굴려도 틀 위 끝이 창 안에 남는다 — 틀 밑 내용은 바깥 칸의 아래 여백(2000px)으로
  흉내 냈다.
- **M2c**(새) — 390 에서 «토큰 저장» 이 성공하면 «토큰을 저장했습니다» 가 창 안이다(M2 의 «저장 문장» 갈래 — 리뷰 케이스에 없었다).

## 결정과 이유

- **M2 는 «답이 서면 그 자리를 창 안으로» 를 골랐다(답을 탭 줄 곁으로 옮기지 않았다).** 처음에 답 셋을 탭 줄 바로 밑으로 옮겨 봤는데, 그러면
  칸에 검사에 걸리는 값을 치는 동안 서는 «고칠 칸이 있습니다» 가 격자 위에 끼어 **치던 칸이 아래로 밀린다**(1280 에서도). 굴리기는 저장이 끝난
  그 한 번뿐이고(치는 동안의 문장은 안 굴린다) 이미 보이면 아무것도 안 하므로 1280 판은 안 굴린다(리뷰가 잰 1280×900 의 답 위 끝 611 · 627 은 창 안이다 — «다른 탭의 422» 의 1280 판이 그 자리를 창 안으로 단언한다).
- **`scrollIntoView` 를 안 쓴다**(M1 · M2) — 굴릴 수 있는 `overflow: hidden` 조상(미리보기 틀)까지 굴린다(리뷰 «혼자 죽는 변조» T4b 가 케이스에서
  겪은 것). 가장 가까운 세로 스크롤 칸의 `scrollTop` 을 직접 고친다.
- **굴리는 양은 «아래 끝을 보이는 구간 안으로, 위 끝이 위로 나가지 않는 데까지»** — 409 나란히 보기가 창보다 길면 위 끝(제목)을 맞춘다.
- **L2 에서 단추 둘은 남겼다** — 브리프가 짚은 것은 빈 `tablist` 뿐이고, 단추를 걷으면 owner 화면의 꼴이 토큰 수에 따라 갈린다.

## 잰 값

실브라우저(`pnpm vitest run -c vitest.browser.config.ts <파일>`) · node v24.21.0 · 고친 소스 · 갤러리 `dist` 는 고친 소스로 다시 지은 판.

| 파일 | 실행 · 결과 | 시각 · load |
| --- | --- | --- |
| `rv-pv-preview.test.ts` | 9 통과(H1 · M1 · M1b · L1 · 기록 · 다른 탭의 422 · M2b · M2c · M2) · 건너뜀 0 | 15:15 – 15:19 |
| `rv-pv-themes.test.ts` | 6 통과(L2 포함) · 건너뜀 0 | 15:18 – 15:19 · 28 → 43 |
| `rv-pv-canvas-popup.test.ts` | 7 통과 — 덮개 = «칸 ∩ iframe ∩ 창» 을 1px 안에서 단언하므로 리뷰 표와 같은 값 | 같은 실행 |
| `popup-layer.test.ts`(에디터 팝업 판 — `git grep -ln "data-wb-popup-layer" -- apps/web/build-test` 의 나머지 하나) | 20 통과 | 같은 실행 |
| `theme-preview.test.ts` | 5 통과 | 같은 실행 |

**고치기 전 소스로 같은 케이스**(Z0 — 고친 파일 넷을 고치기 전 판으로 끼우고 갤러리를 다시 지어 `rv-pv-preview` · `rv-pv-themes`): 15 가운데 8 이
값으로 죽는다 — H1 `expected 'MAIN' to be 'IFRAME'` · M1 `{ byLink: false, byRow: false }` · M1b `expected -200 to be greater than or equal to 0` ·
L1 `got 2`(탭) · M2b `expected 863 to be less than 844` · M2c `expected 879 to be less than 844` · M2 `expected 863 to be less than 844` · L2
`expected true to be false`. 나머지 7 은 고치기 전에도 서는 성질(기록 · 다른 탭의 422 · 탭 꼴 · 판 옮김 · 던지는 뷰 · 좁은 창 · 폭 따라가기)이다.
리뷰가 적은 값(H1 `MAIN` · M2 · M2b 863)과 같다.

## 혼자 죽는 변조

스크래치 `mutate.py` — 변조마다 파일을 경로 전체 이름으로 첫 바꿈 전에 한 번 백업 · 맞은 수 1 확인 · 그 케이스 파일 하나만 · `filecmp` 로 복원(아홉 판
모두 «같음») · 갤러리를 건드린 판은 복원 뒤 `dist` 를 다시 지었다. node v24.21.0 · load 57 → 50.

| 변조 | 파일 | 죽은 케이스(실행) | 실패 값 |
| --- | --- | --- | --- |
| X1 iframe 요소 관찰(`observer?.observe(element)`)을 뗌 | `canvas-popups.tsx` | H1 하나(9) | `expected 'MAIN' to be 'IFRAME'` |
| X2 장이 바뀔 때 상자 `scrollTop = 0` 을 뗌 | `theme-preview.tsx` | M1 하나(9) | `{ byLink: false, byRow: false }` — 이음 · 장 이름 줄 둘 다 |
| X3 틀을 바깥 칸 안으로 내리는 갈래를 뗌 | `theme-preview.tsx` | M1b 하나(9) | `-200 ≥ 0` 이 거짓 |
| X4 예제 뿌리의 `onAuxClick` 을 뗌(갤러리 재빌드) | `theme-examples.tsx` | L1 하나(9) | 탭 수 2 |
| X5 409 나란히 보기의 답 표지를 뗌 | `token-editor.tsx` | M2 하나(9) | `863 < 844` 가 거짓 |
| X6 «고칠 칸이 있습니다» 의 답 표지를 뗌 | `token-editor.tsx` | M2b 하나(9) | `863 < 844` 가 거짓 |
| X7 알림 문장의 답 표지를 뗌 | `token-editor.tsx` | M2c 하나(9) | `879 < 844` 가 거짓 |
| X8 빈 무리 거름을 `>= 0` 으로 | `token-editor.tsx` | L2 하나(6 — `rv-pv-themes`) | `expected true to be false` |

X6 첫 판은 찾는 글이 포매터가 접은 꼴과 달라 «안 돎: 맞은 수 0» 이었다 — 찾는 글을 접힌 꼴로 고쳐 혼자 다시 돌렸다.
«다른 탭의 422» 는 390 의 문장 자리를 M2b 에 맡긴다(그 축의 주인 — 케이스 안 주석). 그 케이스를 혼자 죽이는 변조는 리뷰의 P2(사유 탭 `aria-label` 뗌)다 — 이번에 다시 돌리지 않았다(그 케이스의 단언은 1280 · 390 에서 그대로다).
