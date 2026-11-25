# skt — 기본테마(system-admin)를 lms-skala 관리자 화면에 맞추기 · 보고

기준 main `f3acecc0` · 브랜치 `feat/skala-theme` · 테마 `system-admin` 2.0.0 → 2.1.0. 기준 값은 lms-skala `src/main/resources/static/public/mng/scss/`(`_tokens` · `_card` · `_search` · `_form` · `_popup`).

## 잰 판

`apps/web/build-test/admin-list-skala.test.ts` — 새 프로젝트(시딩된 기본테마 최신판)의 «목록»(페이지 뿌리에 조회 폼 · 그리드 · 등록 폼) · «팝업»(일괄등록)을 내보낸 번들에서 창 1280 · 화면 모드로 잰다. 시안의 ① 목록 · ② 일괄등록 팝업을 옮긴 픽스처다(사용자 DB 의 SKALA 프로젝트는 읽지 않았다). 그림은 `docs/superpowers/plans/2026-11-25-skt-shots/`(`before/` · `after/` — `list-1280.png` · `popup-1280.png`).

고치기 전 값(2.0.0 · Chrome · `pnpm build` 뒤):

```
뿌리 사이            g_list 0 · e_form 0
그리드              테두리 0 · 머리 38px · 머리 여백 0 0 · 머리 아래 선 0 · 표 위 선 1px · 쪽 넘김 여백 8px 0 · 쪽 넘김 위 선 0 · 범위 글 오른끝 = 그리드 오른끝(0)
그리드 머리 글       13px 400
등록 폼 제목         높이 30 · 14px 700 · 아래 선 1px · 몸통(row) 여백 0(폼 상자 여백 12 · 조각 틈 12)
조회 폼 단추줄       여백 8/12 · 위 선 1px · 검색 단추 오른끝이 폼 오른끝에서 13px — 이미 lms `.adp-search__foot` 꼴
셀렉트(짧은 · 78px) «제목+내용» 49px 2줄 · «- 전체 -»(안내) 49px 2줄 · 긴 값 88px 4줄 · 보통 칸 30px 1줄 · 화살표 글자 «▾»
숫자칸              안내 «예) 2026» 왼끝에서 97px(오른쪽에 붙음) · 값 오른끝 9px
팝업               제목줄 #F3F4F6 · 12/16 · 제목 15px 700 · 닫기 19.25×13 · 13px · 몸통 12 · 바닥 #F3F4F6 10/16 위 선
팝업 가로 배치       글 «<p>» 위아래 여백 13px · 링크 여백 0 · Flex align-items stretch → 링크 기준선이 글보다 13px 위
그리드 머리 캡션 글   12px #666 (Text 역할 caption 의 제 규칙)
```

## 항목

### 03. 영역 사이 여백 (뿌리)

- 바꾼 것: `theme.css` 「골격」 의 «세로로 쌓인 노드» 묶음에 `[data-wb-component="Page"] > :not([data-wb-component="Section"])` 를 더했다 — 자기 아래 8px · 위 0.
- 결정: 페이지 뿌리의 구역(`Section`)은 뺐다 — 구역은 바탕을 칠하는 띠(히어로 · 옅게)라 띠 사이에 8px 흰 틈이 서면 안 된다. 끝 노드의 8px 은 남긴다(lms 는 `:last-child` 로 걷지만 이 테마는 «형제 구조로 가르지 않는다»). 팝업 몸통은 이미 그 묶음에 들어 있어 그대로다.
- 잰 값: 뿌리 사이 0 · 0 → 8 · 8.
