# RV-VS 보고 — `setViewState` 브랜치 리뷰

브리프: 코디네이터 `brief-rv-vs.md` · 공통 `common-vs.md`. 워크트리 `feat-view-state-action`(브랜치 `feat/view-state-action` · HEAD `cd758393`) — 고치지 않았다. 기준 커밋 `git merge-base main HEAD` = `27dc636c`.

시작 때 잰 값: `node -v` v24.21.0 · `pnpm db port postgres 5432` → `0.0.0.0:5531` · load 5.31 · `orca terminal list` 에 이 워크트리 경로의 터미널 없음(자기 세션도 안 보임 — 목록이 이 런타임을 못 본 것) · 추적 파일 색인 md5(`git ls-files -s | md5`) 시작 `dd731cddb4be415c4c0ed8a995c0b9db` · `git status --short` 는 `.build/` 하나.

**요약** — 높음 0 · 중간 1 · 낮음 5 · 원래 있던 길 4(「판정 — 무게마다」). 중간 M1: 뷰 모드를 나가면 화면은 들어가기 전 고름으로 돌아가지만 주소 `?state=` 는 뷰 모드의 것이 남아, 새로고침 · 복사한 주소가 다른 화면을 연다 — 기준 판(`27dc636c`)은 같은 걸음에서 화면 = 주소다(이 브랜치가 연 길). 서버 · MCP 경계는 끊긴 대상을 모든 쓰기 길에서 경고로만 둔다(422 없음). 구현 보고의 변조 셋(S5 · A2 · W2)은 같은 수 · 같은 값으로 다시 죽었다.

## 1 · 뷰 모드를 나갈 때 되돌리기(결정 7) — 실브라우저 탐침

탐침은 스크래치의 `viewmode.probe.ts`(아래 「탐침 원문」)를 `editor-stack` 위에서 돌렸다(`pnpm vitest run -c <스크래치>/probe.config.ts viewmode` — 설정은 `vitest.browser.config.ts` 를 싣고 `root` = 체크아웃 · `test.dir` = 스크래치 · 워커 1). 값은 단언하지 않고 판마다 적었다: 경로 · `search` · 눌린 모드 단추 · 셸 전환기 `aria-label` · 캔버스에 선 노드(팝업 겹 밖 / 안) · 캔버스 알림 줄. 판마다 새 탭(`openTab`)이다. 실행 9 판(처음 9 중 6 이 값 · 이동 판 셋은 아래 «에디터 뷰 모드의 이동» 때문에 메뉴 트리 링크로 고쳐 3 판 다시 — 모두 값).

픽스처: 메뉴 «관리자» 아래 «목록»(상태 `s_detail` «상세 열림» · `s_other` «다른 상태» · [등록] = `setViewState s_detail` · 상세 카드(`only s_detail` — 안에 [취소] = `default`) · «다른 상태 글»(`only s_other`) · [이동] = `navigate page:관리자/다른` · [팝업 열기]) · «목록삭제» · «목록이름»(목록과 같은 문서) · «다른»(상태 `s_detail` «B 상세» — **같은 id 다른 이름** · [B 등록] · «B 상세 글»(`only s_detail`)) · «팝업»(팝업 · 상태 `s_more` · [더보기] · 추가 칸(`only s_more`) · [연 화면 상태] = `setViewState s_detail`(팝업에 없는 id · 연 화면에는 있는 id)).

**에디터 뷰 모드의 이동** — 뷰 모드의 [이동](`navigate`)은 페이지를 안 옮긴다(알림 «관리자/다른 페이지 이동 규칙입니다. 이 화면에서는 페이지를 옮기지 않습니다.»). 그래서 «뷰 모드 안에서 다른 페이지로» 는 메뉴 트리 링크(`getByRole('link', { name: '다른', exact: true })`)로 쟀다.

| 판 | 걸음 | 끝 화면(전환기) · 주소 `search` |
| --- | --- | --- |
| ①a | 편집(기본) → 뷰 → [등록] → 링크로 «다른» → 편집 → 브라우저 뒤로 | «다른» 뷰: 기본 · `''` / 나감: 기본 · `''` / 뒤로 «목록»(편집): **상세 열림** · `?state=s_detail` |
| ①b | 편집 «다른 상태» → 뷰 → [등록] → «다른» → [B 등록] → 뒤로 → 앞으로 → 뒤로 → 편집 → 새로고침 | «다른»: B 상세 · `?state=s_detail` / 뒤로 «목록»(뷰): 상세 열림 · `?state=s_detail` / 앞으로: B 상세 / 나감(«목록»): **다른 상태** · `?state=s_detail` / 새로고침: **상세 열림** · `?state=s_detail` |
| ② | 뷰 → [팝업 열기] → 팝업 [더보기] → 팝업 [연 화면 상태] → 편집 → 다시 뷰 | 더보기: 팝업에 추가 칸 · 연 화면 기본 · `''` / [연 화면 상태]: 알림 «setViewState의 대상 상태가 페이지의 상태 목록에 없습니다: s_detail» · 연 화면 그대로 / 나감: 팝업 층 없음 · 기본 / 다시 뷰: 팝업 없음 · 기본 |
| ②b | 편집 «상세 열림» → 뷰 → 팝업 → [더보기] → 링크로 «다른» → 링크로 «목록» → 편집 | «다른»: 기본 · 팝업 없음 / «목록»(뷰): 기본 · `''` / 나감: **상세 열림** · `''` |
| ③a | 편집 «상세 열림» → 뷰 → [취소] → [등록] → REST 로 `s_detail` 과 상세 카드를 지움(`test` + `remove` 둘) → [등록] → 편집 | 지우는 PATCH 200 · 경고 `view-state-missing:n_add` / 지운 뒤(뷰): 기본 · `''`(주소가 걷혔다) / [등록]: 알림 «…목록에 없습니다: s_detail» · 기본 / 나감: 기본 · `''` |
| ③b | 뷰 → [등록] → REST 로 `s_detail` 이름 «상세 열림 바뀜» → 편집 | 바꾼 뒤(뷰): «상세 열림 바뀜» · `?state=s_detail` / 나감: 기본 · **`?state=s_detail`** |
| ④ | 뷰 → [등록] → 새로고침 → `goto(?state=s_other)` → 뷰 → [등록] → 편집 | 새로고침: **편집 모드** · 상세 열림 · `?state=s_detail` / 주소 고침: 편집 · 다른 상태 / 뷰: 다른 상태 / 나감: **다른 상태** · **`?state=s_detail`** |
| ⑤a | 편집(기본) → 뷰 → [등록] → 편집 → 새로고침 | 나감: **기본** · **`?state=s_detail`** / 새로고침: **상세 열림** |
| ⑤b | 편집 «상세 열림» → 뷰 → 전환기 «다른 상태» → 편집 → 새로고침 | 나감: **상세 열림** · **`?state=s_other`** / 새로고침: **다른 상태** |

**기준 판과 견줌** — `apps/web/src/shell/use-view-state.ts` 하나를 `git show 27dc636c:…` 판으로 갈아 끼우고(스크래치 `mut.py` — 백업 이름 = 경로 전체 · 바이트 비교 복원 · 끝 `git status` 는 `.build/` 와 이 보고뿐) ①b · ⑤b 를 다시 돌렸다(전환기만 쓰는 ⑤b 는 기준 소스에서도 서는 판이다 · vite dev 가 소스를 읽어 빌드가 필요 없다). 실행 2 · 통과 2.

| 판 | 이 브랜치 — 나감 / 새로고침 | 기준 판 — 나감 / 새로고침 |
| --- | --- | --- |
| ⑤b | 상세 열림 · `?state=s_other` / 다른 상태 | 다른 상태 · `?state=s_other` / 다른 상태 |
| ①b | 다른 상태 · `?state=s_detail` / 상세 열림 | 상세 열림 · `?state=s_detail` / 상세 열림 |

기준 판에서는 나간 뒤 화면과 주소가 같다(뷰 모드에서 고른 것이 그대로 남는다 — 되돌림이 없으니). 이 브랜치는 화면만 되돌리고 주소는 뷰 모드의 것을 남긴다 — **화면 ≠ 주소가 이 브랜치가 연 길이다**(구현 보고 «남은 것» 의 «이 트랙이 새로 연 길은 아니어서» 는 틀렸다 — 기준 판은 주소와 화면이 함께 남는다).

## 3 · 번들(결정 8) — 실브라우저 탐침

스크래치 `bundle.probe.ts` — 같은 꼴로 api 에 픽스처를 세우고 `exportBundle` 로 내려받아 `file://` 로 열었다(`pnpm build` 산출물 — `packages/renderer/dist` · `packages/exporter/dist` 는 11:27 판이고 `setViewState` 가 든다). 실행 5 · 값 5(탭 머리 누름 판 하나는 아래 까닭으로 다시 1).

픽스처: «목록»(상태 `s_detail` · [등록] · 상세 카드(`only s_detail`) 안에 `Tabs`(첫 탭 · 둘째 탭) · [상세 안 이동] = `navigate page:관리자/다른` · [취소] = `default` · 카드 밖 [팝업 열기] · [둘째 탭 미리] = `switchTab n_tp2`(상태가 숨긴 탭)) · «다른»(상태 `s_detail` «B 상세») · «팝업»(`s_more` · [더보기] · [연 화면 상태] = `s_detail` · [팝업 기본] = `default`) · «상태없음»(목록 없음 · [기본으로] = `default`).

| 판 | 걸음 | 값 |
| --- | --- | --- |
| B1 | 열기 → [등록] → [상세 안 이동] → 뒤로 → 앞으로 → 뒤로 → [취소] → 뒤로 | 열기: 해시 `''` · `history.length` 2 / [등록]: `#state=s_detail` · 고르개 `s_detail` · 상세 섬 · 길이 2(쌓지 않는다) / 이동: `관리자-다른.html` · 해시 `''` · 고르개 `default` / 뒤로: `관리자-목록.html#state=s_detail` · 상세 섬 / 앞으로: «다른» 기본 / [취소]: 해시 `''` · 상세 없음 / 뒤로: `about:blank`(열기 앞 판) |
| B1b | [둘째 탭 미리] → [등록] | 미리: 상세 없음 / [등록]: 상세 섬 · **둘째 탭 글이 보임**(겹layer 에 얹힌 숨은 노드 값이 상태를 연 뒤 쓰인다 — 설계 «무엇» 그대로) |
| B2 | `#wb-screen`(화면 모드)으로 열기 → [등록] → 새로고침 → [취소] | 열기: `wb-export-screen` 클래스 · 해시 `#wb-screen` / [등록]: 해시 **`#state=s_detail`**(화면 모드 해시를 덮음) · 클래스는 남음 / 새로고침: **클래스 없음**(셸이 다시 선다) · 상세 섬 / [취소]: 해시 `''` |
| B3 | [등록] → [팝업 열기] → 팝업 [더보기] → [연 화면 상태] → [팝업 기본] | 팝업 [더보기]: 팝업 추가 칸 섬 · 연 화면 해시 · 고르개 그대로(`s_detail`) / [연 화면 상태]: 상태 줄 «setViewState의 대상 상태가 페이지의 상태 목록에 없습니다: s_detail» · 연 화면 그대로 / [팝업 기본]: 팝업 추가 칸 사라짐 · 연 화면 그대로 |
| B4 | «상태없음» `#foo` 로 열기 → [기본으로] / «목록» `#foo` → [등록] | 상태없음: 해시 `#foo` 그대로(고르개가 없어 `reflect` 가 안 돈다) / 목록: 해시 `#state=s_detail`(`#foo` 를 덮는다 — 전환기로 고른 것과 같은 꼴) |

- **탭 머리 누름은 잴 표면이 없다** — 번들의 와이어프레임 `Tabs` 안에 `role="tab"` · `button` 이 0 개다(`getByRole('tab', { name: '둘째 탭' })` 이 3s 에 못 찾음). 탭은 `switchTab` 상호작용으로만 바뀐다 — B1b 가 그 판이다.
- B2 의 해시 덮기는 **이 브랜치가 연 길**이다 — 화면 모드에서는 셸(전환기)이 숨어(`shell-css.ts` «화면 모드는 목업만 찍는다 — 전환기도 셸이다») 기준 판에서는 그 모드에서 해시를 쓰는 길이 없었다. 무게는 아래 «낮음».

## 2 · 붙이기 · 모듈 · id 재발급(결정 3)

**상태 id 는 어떻게 지어지나** — 에디터의 상태 추가는 노드 id 와 같은 생성기다(`apps/web/src/panels/page-states.tsx` 의 `addViewStateOps(…, () => (id = createNodeId()))` — 무작위 `n_…`). 봉투는 글자만 본다 — api · MCP 는 아무 글자나 짓는다(실브라우저 케이스의 픽스처가 `s_detail` 처럼 뜻 있는 id 를 쓴다). 스킬 예는 `s_login` 이다. 그래서 **페이지마다 같은 id 가 다른 뜻으로 설 수 있는 것은 api · MCP 로 지은 상태와 페이지 JSON 가져오기(상태 id 를 그대로 싣는다 — `page-json/import.ts` 머리말)뿐**이다(웹 · api 에 페이지 복제 길은 없다 — `git grep -i 'duplicatePage|페이지 복제|copyPage'` 0).

탐침은 스크래치 `paste.probe.ts`(node 환경 · `installCatalog()` 뒤) — 에디터의 붙이기(`shell/editor-keys.tsx` 의 `finishPaste`)가 부르는 차례 그대로 `renameStatesByName` → `renameVisibilityStates` → `prepareNodesForPaste({ state: 붙일 페이지의 id 집합 })` 를 불렀다. 출처 상태 `s_a` «에이» · 노드 둘(버튼: `setViewState s_a` · `setViewState default` · `setVisible n_txt` / 글: `only s_a`). 실행 3 · 통과 3.

| 붙일 페이지의 상태 | 액션 대상 | 글의 보임 | 뺀 수 |
| --- | --- | --- | --- |
| 같은 페이지(`s_a` «에이») | `s_a` · `default` · 새 노드 id | `only s_a` | 0 |
| 같은 id 다른 이름(`s_a` «비 페이지의 다른 뜻») | `s_a`(**그 페이지의 다른 뜻을 가리킨다**) | `only s_a` | 0 |
| 같은 이름 다른 id(`s_b` «에이») | `s_b`(이름으로 옮김) | `only s_b` | 0 |
| 둘 다(`s_a` «엑스» · `s_b` «에이») | `s_a`(같은 id 가 이긴다) | `only s_a` | 0 |
| 상태 없음(다른 프로젝트 · 새 페이지) | `s_a` 액션 빠짐 · `default` 남음 | 걷힘(`clearedOnly` 1) | 동작 1 · 상태 `s_a` 1 |

- «같은 id 다른 뜻» 에서 대상이 엉뚱한 상태를 가리키는 것은 **원래 있던 길**이다 — 보임(`visibility.states`)이 같은 규칙(같은 id 는 그대로 · 이름 맞춤은 id 가 없을 때만 — `renameStatesByName`)으로 이미 그렇게 옮겨지고, 액션은 그 규칙을 따라갔을 뿐이다. 이월 후보(«같은 id · 다른 이름이면 이름으로 견줘 묻는다» 는 보임과 함께 고칠 일).
- **모듈** — 저장(`moduleNodesForSave`)은 `s_a` 대상을 빼고(`droppedActions` 1) `default` 를 남긴다. 저장한 노드를 넣으면(`moduleInsertOps`) `default` 와 새 노드 id 로 선다. **넣기는 상태 대상을 거르지 않는다** — 저장을 안 거친 노드(`s_a` 대상)를 상태 `s_zz` 뿐인 페이지에 넣으면 `s_a` 가 그대로 남고 `droppedActions` 0(`module-insert.ts` 가 `keep.state` 를 안 넘겨 `prepareNodesForPaste` 의 기본값 «다 남긴다» 가 선다). 모듈 행을 쓰는 길 넷(프로젝트 · 개인 모듈 저장 라우트 · 저장 상자 · 이름 바꾸기는 노드를 안 받음)이 모두 저장 함수를 지나 지금 닿는 길은 없다 — 한 겹짜리 막음이라 «낮음».
- **id 재발급** — `remapNodeIds` 에 노드 대상 여섯 꼴(`setProp`(깊은 값) · `setVisible` · `switchTab` · `navigate` · `openModal` · `closeModal`) + 문서에 없는 대상 + 빈 대상을 넣은 결과를 `packages/schema/src/tree.ts` 만 기준 판으로 갈아 끼운 판과 견줬다 — **같다**(액션 8 · 표 5 · JSON 일치). 가져오기 판(아래 P3)에서 상태 대상 `n_text`(노드 id 와 같은 글자)는 그대로 남고 노드 `n_text` 는 다시 지어졌다 — 상태 대상이 노드 id 표로 안 옮겨진다.
- **그리드 행 떼어 내기의 «바깥에서 가리킴»**(`apps/web/src/edit/grid-row-actions.ts` 의 `targetedFromOutside`)은 액션의 `target` 글자를 다 노드 id 로 읽는다 — `setViewState` 대상이 행 안 노드 id 와 같은 글자면 떼어 내기를 거절한다(거짓 «가리킨다»). 코드로만 봤다(안 잼) — api 로 지은 상태 id 가 노드 id 와 같을 때만 서는 판이라 «낮음».

## 4 · 서버 · MCP 경계

스크래치 `server.probe.ts` — `editor-stack` 의 api 에 API 토큰 + `x-wb-client: mcp` 로 보냈다(P4 · P3 은 세션). 실행 5 · 값 5.

| 판 | 답 |
| --- | --- |
| P1 `PUT …/schema` 대상 `s_a`(있음) · `default` | 200 · 경고 없음 |
| P1 `s_gone` · `''` · `'   '` · `'default '` · `'DEFAULT'` · U+202E 든 글 · 200 000 자 | 모두 **200** + 경고 `view-state-missing`(노드 `n_btn`) — 빈 · 공백은 «아직 고르지 않았습니다», 나머지는 «…상태 목록에 없습니다: <대상 글 그대로>»(200 000 자 · U+202E 도 그대로 실린다) |
| P1 대상이 수 · 대상 없음 · 밖 키(`value`) | 400 `bad-request`(봉투) |
| P2 `PATCH ops` 상태를 지움(`remove /viewStates/0`) | 200 + 경고 `view-state-missing` |
| P2 지운 상태를 새로 가리키는 액션을 더함 | 200 + 경고 둘(앞 것 · 새 것) — **새로 만든 끊김도 경고다**(보임은 편집이 목록 밖 상태를 새로 가리키게 하면 `state-cases-left`(오류)로 막지만 액션은 막지 않는다 — 설계 「판정」 그대로) |
| P2 밖 키(`extra`)를 든 액션을 더함 | 422 `validation-failed`(`bad-document` · `인식할 수 없는 키: "extra"`) |
| P3 페이지 JSON 가져오기(대상 `s_a` · `s_gone` · `n_text` + `setVisible n_text`) | 201 · 경고 둘(`s_gone` · `n_text`) · 상태 대상 셋 그대로 · `setVisible` 대상만 새 id · `viewStates` 그대로 |
| P4 스냅샷 → 상태 지움(200 + 경고) → 복원 | 복원 200 · 경고 없음 · `viewStates` 와 대상 `s_a` 가 돌아옴 |

- **422 가 나는 판은 없다**(모양이 틀린 액션 말고는). 끊긴 대상은 저장 · 편집 · 가져오기 · 복원 모두 경고로 지난다.
- 경고 문장은 대상 글자를 그대로 싣는다(200 000 자 · 방향 제어). 노드 대상의 같은 문장(«타겟 노드가 문서에 없습니다: <대상>», `check.ts`)과 같은 꼴이라 **원래 있던 길**이다. 캔버스 알림 줄(`canvas.tsx` 의 `wb-shell-canvas-runtime-item`)은 문장 하나가 한 줄이고 대상이 끝에 서서 뒤 글을 안 뒤집는다. 문장 · 고르개의 상태 **이름**은 `isolateBidi` 로 싸여 있다(Focus 5).
- lint 는 api 엔드포인트가 없다(`GET /projects/:id/lint` · `…/pages/:id/lint` 둘 다 404) — 웹 · CLI 가 스키마 함수로 돈다. 그 대조는 구현 케이스(`lint-design.test.ts` · `lint-mapping.test.ts`)가 잠근다.

## 5 · Review Focus 의 잠금 — 변조 셋 다시

구현 보고 «혼자 죽는 변조» 표에서 셋을 골라 같은 자리를 다시 바꿨다(스크래치 `mut.py replace` — 찾는 글이 한 곳에만 맞는지 세고 · 백업 이름 = 경로 전체 · 바이트 비교 복원). 그 케이스 파일만 돌렸고 실패 값을 열었다.

| 변조 | 자리 · 바꾼 글 | 돌린 파일 | 실행 · 실패 | 죽은 케이스 · 실패 값 | 보고 표와 |
| --- | --- | --- | --- | --- | --- |
| S5 재발급이 상태 대상도 옮김 | `packages/schema/src/tree.ts` — `'target' in action && action.type !== 'setViewState' ?` → `'target' in action ?` | `packages/schema/test/set-view-state.test.ts` | 15 · 1 | «id 재발급 — 노드 id 와 같은 글자의 상태 대상도 옮기지 않는다» — `target` 기대 `n_000000000001` · 받음 `n_0000000000ff`(`AssertionError`) | 같다 |
| A2 `view-state-missing` 을 오류로 | `packages/schema/src/validate.ts` 의 `ISSUE_SEVERITY` — `'view-state-missing': 'warning',` → `'error',` | `apps/api/test/set-view-state.test.ts` | 2 · 1 | «새 액션을 받아 저장하고, 대상 상태를 지우는 편집은 …» — 줄 80 `expect(removed.status).toBe(200)` 에서 **422**(지우는 편집 — 첫 쓰기는 지났다) | 같다 |
| W2 뷰 모드를 나가도 안 되돌림 | `apps/web/src/shell/use-view-state.ts` — `const back = beforeView !== null && beforeView.pageId === props.pageId ? beforeView : null` → `const back = current` | `apps/web/build-test/set-view-state.test.ts`(`-c vitest.browser.config.ts` · vite dev 가 소스를 읽어 빌드 없음) | 6 · 1 | «Focus 3 — …» — `back` 기대 `{ detail: true, switcher: '화면 상태: 상세 열림' }` · 받음 `{ detail: false, switcher: '화면 상태: 기본' }`(`AssertionError` · 10.2s) | 같다 |

셋 다 재려던 값(대상 글 · 상태 코드 · 끝 화면)으로 죽었다 — 시간 초과 · 판 카나리아로 죽은 것이 없다. 끝의 `git status --short` 는 `.build/` 와 이 보고뿐.

**잠금이 못 재는 것** — Focus 3 케이스는 «같은 페이지에서 들어가고 나감» 하나라, 위 1 의 «나간 뒤 주소» 와 «떠났다 돌아옴»(②b)은 어느 케이스도 안 잰다.

## 판정 — 무게마다

### 높음

없다(인가 우회 · 남의 화면 · 데이터를 잃음 · 겹친 잠금 — 어느 판에서도 안 섰다).

### 중간

**M1 · 뷰 모드를 나간 뒤 화면 ≠ 주소 `?state=` — 새로고침 · 복사한 주소가 뷰 모드의 상태로 연다** (이 브랜치가 연 길)

- 재현: 편집 모드 «상세 열림»(또는 기본) → [뷰 모드] → [등록] 이나 전환기로 다른 상태 → [편집 모드] → 새로고침.
- 잰 값(위 1 의 ⑤a · ⑤b · ③b · ④ · ①b): 나간 직후 화면은 들어가기 전 고름(«기본» · «상세 열림»)인데 주소는 뷰 모드의 것(`?state=s_detail` · `?state=s_other`) — 새로고침하면 뷰 모드의 상태로 선다. 기준 판(`use-view-state.ts` 만 `27dc636c` 판)은 같은 걸음에서 나간 뒤 화면 = 주소 = «다른 상태».
- 까닭: 되돌림(결정 7)은 셸의 고름만 바꾸고, 주소 쓰기(`shell/view-state-address.ts`)는 편집 모드에서 안 돈다(`writes` = 뷰 모드 · viewer). 뷰 모드가 쓴 주소가 그대로 남는다. viewer 는 늘 쓰므로 안 갈린다 — editor 이상만이다.
- 구현 보고 «남은 것» 둘째 줄의 «원래도 … 같은 꼴로 남는다 — 이 트랙이 새로 연 길은 아니어서» 는 틀렸다 — 기준 판은 화면이 주소와 함께 남는다.
- 고칠 자리 제안: 뷰 모드를 나가는 전환에서 주소를 한 번 되돌린 고름으로 맞춘다 — `useViewStateAddress` 가 `writes` 의 참 → 거짓 전환을 보고 그 렌더의 `state` 로 `setParams(…, { replace: true })` 한 번(기본이면 질의를 걷는다). 또는 들어갈 때의 주소 질의를 적어 두었다 나갈 때 되돌린다. 실브라우저 케이스는 Focus 3 파일에 «나간 뒤 `location.search`» 를 더하고, 고치기 전 소스에서 `?state=s_other` 로 빨강을 보인다.

### 낮음

**L1 · 뷰 모드 안에서 떠났다 돌아온 뒤 나가면 들어가기 전 고름이 되살아난다** (이 브랜치가 연 길 · 머리말과 다르다)

- 재현(②b): 편집 «상세 열림» → 뷰 → 메뉴 트리로 «다른» → 다시 «목록»(뷰 · 기본) → 편집 → **«상세 열림»**.
- `use-view-state.ts` 머리말은 «같은 페이지일 때만 — 그 사이 페이지를 옮겼으면 기본» 이라 하고, 같은 파일의 편집 모드 규칙은 «옮겼다가 돌아와도 기본이다» 다. 판정이 `beforeView.pageId === props.pageId`(id 견줌)라 떠났다 돌아온 판을 «안 떠났다» 로 읽는다.
- 고칠 자리: 뷰 모드 동안 페이지가 바뀐 렌더(`seenPage !== props.pageId`)에서 `beforeView` 를 비운다 — 또는 지금 동작이 뜻한 것이면 머리말을 «나갈 때의 페이지가 들어간 페이지면» 으로 고친다. 결정은 코디네이터 몫(시연 뒤 편집 화면이 돌아오는 쪽이 더 나을 수도 있다).

**L2 · 번들 화면 모드(`#wb-screen`)에서 누르면 해시를 덮어 새로고침 때 화면 모드가 풀린다** (이 브랜치가 연 길)

- 재현(B2): `관리자-목록.html#wb-screen` → [등록] → 해시 `#state=s_detail`(클래스 `wb-export-screen` 은 남음) → 새로고침 → 클래스 없음 · 셸이 선다. [취소](`default`)는 해시를 통째로 걷는다.
- 화면 모드는 PPTX 그리는 자가 찍는 판이고 누르지 않는다 — 사람이 그 주소로 열어 누를 때만 선다. 기준 판은 화면 모드에서 전환기가 숨어 해시를 쓰는 길이 없었다.
- 고칠 자리: `packages/exporter/src/browser/boot.tsx` 의 `reflect` 가 화면 모드(지금 해시가 `SCREEN_HASH` · 또는 `wb-export-screen` 클래스)면 해시를 안 쓴다(고르개 값만 싣는다).

**L3 · 모듈 넣기가 상태 대상을 거르지 않는다 — 저장 한 겹뿐** (이 브랜치가 연 길 · 지금 닿는 길 없음)

- 잰 값(위 2): 저장을 안 거친 노드(`setViewState s_a`)를 상태 `s_zz` 뿐인 페이지에 `moduleInsertOps` 로 넣으면 대상이 그대로 남고 `droppedActions` 0. 모듈 행을 쓰는 길은 모두 `moduleNodesForSave` 를 지나 지금은 비기본 대상을 든 모듈이 없다.
- 고칠 자리: `apps/web/src/palette/module-insert.ts` 가 `prepareNodesForPaste` 에 `state: () => false`(넣은 노드의 보임을 걷는 것과 같은 까닭 — 모듈에는 상태가 없다)를 넘긴다. 그러면 기본 대상만 남는다.

**L4 · 상태 삭제 확인 상자가 끊길 «화면 상태 바꾸기» 를 말하지 않는다** (이 브랜치가 연 길 · 설계대로 지우지는 않음)

- `apps/web/src/panels/remove-state-dialog.tsx` 는 이 브랜치에서 안 바뀌었고 상자의 표(지워지는 상태 · 노드 · 걷는 보임 · 줄이는 보임)에 상호작용이 없다 — 지우기 **전에는** 그 상태를 가리키던 단추가 끊긴다는 말이 없고, 지운 **뒤에** 하단 바(`shell/edit-warnings.tsx` — 편집 답의 `warnings`)가 «저장했지만 문서에 경고 N개가 있습니다» 와 «…상태 목록에 없습니다: <상태 id>» 를 띄운다(에디터가 지은 상태 id 는 무작위 `n_…` 라 그 줄이 어느 상태인지 말하지 못한다). 코드로만 봤다(실브라우저로 상자를 안 열었다).
- 고칠 자리: `removeViewStateOps` 결과에 «대상이 지우는 상태인 액션을 든 노드» 집합을 더하고 상자가 «상호작용 N곳이 끊깁니다» 한 줄을 보인다.

**L5 · 그리드 행 떼어 내기의 «바깥에서 가리킴» 이 상태 대상을 노드 id 로 읽는다** (이 브랜치가 연 길 · 안 잼)

- `apps/web/src/edit/grid-row-actions.ts` 의 `targetedFromOutside` 가 모든 액션의 `target` 을 행 안 노드 id 와 견준다 — 대상 상태 id 가 행 안 노드 id 와 같은 글자면 떼어 내기를 거짓으로 거절한다. 상태 id 를 노드 id 와 같은 글자로 지을 수 있는 것은 api · MCP 뿐이다.
- 고칠 자리: `isViewStateAction(action)` 이면 건너뛴다(붙이기 · 모듈 · 재발급과 같은 가름).

### 원래 있던 길(이월 후보 — 병합을 막지 않는다)

- **붙이기의 «같은 id · 다른 뜻»** — 붙일 페이지에 같은 id 의 다른 상태가 있으면 대상이 그 상태를 가리킨다(위 2). 보임이 같은 규칙으로 이미 그렇다.
- **편집 모드의 뒤로 가기가 뷰 모드가 쓴 주소를 읽는다**(①a — 뒤로 «목록» 이 편집 모드에서 «상세 열림») — 기준 판도 뷰 모드에서 전환기로 고른 주소가 같은 꼴로 남는다.
- **번들의 다른 해시(`#foo` · 번호 닻)를 덮는다**(B4) — 전환기로 골라도 같다.
- **경고 문장에 대상 글자가 그대로 실린다**(200 000 자 · 방향 제어 — 위 4) — 노드 대상 문장과 같은 꼴. 대상 글자 길이 상한도 노드 대상과 같이 없다.

## 게이트

브리프대로 전량은 안 돌았다(구현이 전량 넷을 돌았다 — `2026-11-17-vs-report.md` 「게이트」). 소스를 바꾼 것은 변조 · 기준 판 갈아 끼우기뿐이고 모두 바이트 비교로 복원했다. node v24.21.0(`mise env` 뒤 · 모든 판). load 는 시작 5.31 · 탐침 중 4.05 – 7.53 · 끝 3.30. 잠듦: `pmset -g log` 의 마지막 ` Sleep ` 줄이 2026-11-16 02:48 — 이 차수의 실행(2026-11-17 11:53 – 12:10)과 안 겹친다. 남은 vitest · vite · Chrome 없음(끝에 이 워크트리 경로로 `ps` 를 셌다 — 0). 실브라우저 판은 매 실행 `editor-stack` 이 제 DB · 포트를 띄우고 거뒀다(자기 Postgres 5531 은 남긴다).

| 실행 | 파일 | 실행 · 통과 · 실패 | 비고 |
| --- | --- | --- | --- |
| 뷰 모드 탐침 1 | 스크래치 `viewmode.probe.ts` | 9 · 6 · 3 | 셋은 탐침 결함(에디터 뷰 모드의 `navigate` 는 안 옮긴다 — 30s 기다림 시간 초과) |
| 뷰 모드 탐침 — 이동 진단 | 같은 파일 `-t ①a` | 1 · 0 · 1 | 이동 직후 판을 적고 같은 기다림에서 시간 초과(알림 문장을 얻으려던 판) |
| 뷰 모드 탐침 2(링크로 이동) | 같은 파일 `-t '①\|②b'` | 3 · 3 · 0 | |
| 기준 판 견줌 | 같은 파일 `-t '⑤b\|①b'` · `use-view-state.ts` = `27dc636c` | 2 · 2 · 0 | 복원 · 바이트 같음 |
| 번들 탐침 | 스크래치 `bundle.probe.ts` | 5 · 5 · 0 | |
| 번들 탭 머리 | 같은 파일 `-t 'B1 '` 두 번 | 1 · 0 · 1 → 1 · 1 · 0 | 처음은 `role="tab"` 이 없어 30s 시간 초과 · 둘째는 3s 한도로 적고 지남 |
| 서버 탐침 | 스크래치 `server.probe.ts` | 5 · 5 · 0 | |
| 붙이기 탐침 | 스크래치 `paste.probe.ts`(세 판 — 문서 버전 · `installCatalog` 를 고친 뒤 셋째가 값) | 3 · 3 · 0 | |
| 재발급 기준 판 | 같은 파일 `-t 'id 재발급'` · `tree.ts` = `27dc636c` | 1 · 1 · 0 | 복원 · 바이트 같음 |
| 변조 S5 | `packages/schema/test/set-view-state.test.ts` | 15 · 14 · 1 | |
| 변조 A2 | `apps/api/test/set-view-state.test.ts` | 2 · 1 · 1 | |
| 변조 W2 | `apps/web/build-test/set-view-state.test.ts` | 6 · 5 · 1 | |

추적 파일 색인 md5 끝값(커밋 전) `dd731cddb4be415c4c0ed8a995c0b9db` — 시작값과 같다(작업 트리에 이 보고 말고 남은 것이 없다 · 다른 쓰는 자를 본 적 없음 · `orca terminal list` 는 이 워크트리를 못 봤다).

## 남은 것

- **M1 을 고칠지 · 어떻게(주소를 나갈 때 맞춤 / 들어갈 때의 주소로 되돌림)** — 코디네이터 판단. 병합 전에 고치는 쪽을 권한다(새로고침 · 주소 복사가 화면과 다른 판을 여는 것은 사용자 눈에 바로 보인다).
- **L1 은 동작을 정하는 일**(떠났다 돌아오면 되돌릴지) — 정하면 머리말 · 정본 「8.3 실행」 의 «뷰 모드를 나가면 …» 문장을 그 뜻으로 맞춘다.
- L2 – L5 · «원래 있던 길» 넷은 이월 후보.
- 못 잰 것: L4 의 상자 화면 · L5 의 떼어 내기 거절(코드로만 봤다). 다른 사람의 **다른 탭(실시간 WS)** 으로 상태를 지운 판은 REST 로만 세웠다 — 지운 결과가 WS 로 화면에 닿는 것은 같은 길이라 따로 안 쟀다.
- 이 브랜치의 «남은 것» 둘째 줄(`2026-11-17-vs-report.md` — 뷰 모드를 나간 뒤의 주소)은 위 M1 의 값으로 바뀌어야 한다 — 이력 문서라 안 고쳤다.

## 지침

1. **무엇이 틀렸나(비어 있나):** 에디터 뷰 모드의 `navigate` 상호작용은 페이지를 옮기지 않는다(알림 «… 페이지 이동 규칙입니다. 이 화면에서는 페이지를 옮기지 않습니다.»). 브리프의 «뷰 모드 안에서 다른 페이지로 옮긴 뒤» 를 그 단추로 세운 판이 30s 시간 초과로 셋 죽었다.
   - **어느 문서 어느 절:** `.ruler/30-delegation.md` — «실브라우저 판은 `apps/web/build-test/` 에 케이스로 잠근다» 절(같은 문단의 판 세우기 함정들 곁).
   - **넣을 문장:** «**에디터 뷰 모드의 «페이지 이동»(`navigate`)은 페이지를 안 옮긴다** — 알림 한 줄(«… 이 화면에서는 페이지를 옮기지 않습니다.»)만 선다. 뷰 모드 안에서 다른 페이지로 가는 판은 메뉴 트리 링크(`getByRole('link', { name, exact: true })`)로 세운다 — 번들은 그 단추가 다른 장 파일로 옮긴다(`docs/superpowers/plans/2026-11-17-rv-vs-report.md` 「1」).»
2. **무엇이 비어 있나:** `.ruler/20-verification.md` 의 «카탈로그 타입 목록은 `CATALOG_TYPES` 로 읽는다 — … `installCatalog` 를 부르기 전이라 빈 배열» 은 목록 함수만 말한다. Node 탐침에서 카탈로그를 안 깔면 편집 함수(`insertMany` — 모듈 넣기 · 붙이기)가 `Page` 뿌리에 «자식을 담을 수 있는 타입이어야 하고, children이 배열이어야 합니다» 를 내 넣기 판이 통째로 안 선다 — 오류 없이 «거절» 값으로 끝난다.
   - **어느 문서 어느 절:** `.ruler/20-verification.md` — «수를 셀 때는 두 번 세고 표본을 열어 본다 — 덧붙임» 의 «카탈로그 타입 목록은 `CATALOG_TYPES` 로 읽는다» 항목.
   - **넣을 문장(그 항목 끝):** «편집 함수도 같다 — 카탈로그를 안 깐 Node 탐침에서 `insertMany`(모듈 넣기 · 붙이기)는 «자식을 담을 수 있는 타입이어야 하고, children이 배열이어야 합니다» 로 거절한다. 탐침 머리에서 `installCatalog()` 를 부른다.»
3. **무엇이 더 쉬운가:** 같은 파일 «목 · 계측은 …» 절의 «실브라우저 탐침(`editor-stack`)도 같다 — 스크래치 설정의 `root` 를 체크아웃으로 두고 루트 설정의 `build` 프로젝트에서 `esbuild` · `resolve` 를 실으며(`vitest.browser.config.ts` 와 같은 꼴)» 는 그 꼴을 손으로 짓게 읽힌다. `vitest.browser.config.ts` 를 통째로 싣고 `root` · `test.dir` · `test.include` 만 덮으면 그대로 선다(이 차수의 `probe.config.ts` — 아래 원문).
   - **넣을 문장(그 문장 뒤):** «가장 짧은 꼴은 `import base from '<체크아웃>/vitest.browser.config.ts'` 뒤 `defineConfig({ ...base, root: '<체크아웃>', test: { ...base.test, dir: '<스크래치>', include: ['**/*.probe.ts'], exclude: ['**/node_modules/**'], maxWorkers: 1 } })` 다(`docs/superpowers/plans/2026-11-17-rv-vs-report.md` 「탐침 원문」).»

## 탐침 원문

스크래치 디렉터리에 `node_modules` → 체크아웃의 `node_modules` 심링크를 두고 돌렸다. 아래는 실브라우저 탐침 둘과 설정의 원문(서버 · 붙이기 탐침의 입력은 위 표에 다 적었다).

### `probe.config.ts`

```ts
import { defineConfig } from 'vitest/config'
import base from '<체크아웃>/vitest.browser.config.ts'

export default defineConfig({
  ...base,
  root: '<체크아웃>',
  test: { ...base.test, dir: '<스크래치>', include: ['**/*.probe.ts'], exclude: ['**/node_modules/**'], maxWorkers: 1 },
})
```

### `viewmode.probe.ts` — 위 1

```ts
/**
 * RV-VS 탐침 — 뷰 모드를 나갈 때 되돌리기(결정 7)의 판들. 단언하지 않고 값을 적는다(`out/viewmode.json`).
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import type { Frame, Page } from 'playwright-core'
import { afterAll, beforeAll, describe, it } from 'vitest'
import {
  canvasFrame,
  editorStackPrerequisite,
  startEditorStack,
  type EditorStack,
  type Session,
} from '<체크아웃>/apps/web/build-test/editor-stack'

const OUT = '<스크래치>/out'
const TAG = process.env.PROBE_TAG ?? 'branch'
const 전제 = await editorStackPrerequisite()
const results: Record<string, unknown> = {}

const button = (id: string, label: string, actions: unknown[]) => ({ id, type: 'Button', props: { label }, interactions: [{ on: 'click', actions }] })

describe.skipIf(!전제.ok)('rv-vs 뷰 모드 탐침', () => {
  let stack: EditorStack
  let alice: Session
  let projectId: string
  const pages: Record<string, string> = {}
  const call = (method: string, path: string, body?: unknown) => stack.request(alice, method, path, body)

  beforeAll(async () => {
    if (!전제.ok) return
    stack = await startEditorStack(전제)
    alice = await stack.login(stack.users.alice)
    const ok = (r: { status: number; body: any }, what: string) => {
      if (r.status >= 300) throw new Error(`픽스처 ${what} ${r.status} ${JSON.stringify(r.body)}`)
      return r.body
    }
    const project = ok(await call('POST', '/projects', { name: '탐침', slug: `rvvs-${Date.now().toString(36)}` }), '프로젝트')
    projectId = project.id
    const menu = ok(await call('POST', `/projects/${projectId}/menu`, { parentId: null, title: '관리자' }), '메뉴')
    const mk = async (title: string, kind: 'page' | 'popup', ops: unknown[]) => {
      const page = ok(await call('POST', `/projects/${projectId}/pages`, { menuNodeId: menu.id, title, kind }), title)
      ok(await call('PATCH', `/projects/${projectId}/pages/${page.id}/ops`, { baseSeq: 0, ops }), `ops ${title}`)
      pages[title] = page.id
    }
    const aOps = [
      { op: 'add', path: '/viewStates', value: [{ id: 's_detail', name: '상세 열림' }, { id: 's_other', name: '다른 상태' }] },
      { op: 'add', path: '/root/children/0', value: button('n_add', '등록', [{ type: 'setViewState', target: 's_detail' }]) },
      {
        op: 'add',
        path: '/root/children/1',
        value: {
          id: 'n_detail',
          type: 'Card',
          props: { title: '상세' },
          visibility: { mode: 'only', states: ['s_detail'] },
          children: [button('n_cancel', '취소', [{ type: 'setViewState', target: 'default' }])],
        },
      },
      { op: 'add', path: '/root/children/2', value: { id: 'n_other_text', type: 'Text', props: { content: '다른 상태 글' }, visibility: { mode: 'only', states: ['s_other'] } } },
      { op: 'add', path: '/root/children/3', value: button('n_go', '이동', [{ type: 'navigate', target: 'page:관리자/다른' }]) },
      { op: 'add', path: '/root/children/4', value: button('n_open', '팝업 열기', [{ type: 'openModal', target: 'page:관리자/팝업' }]) },
    ]
    for (const title of ['목록', '목록삭제', '목록이름']) await mk(title, 'page', aOps)
    await mk('다른', 'page', [
      { op: 'add', path: '/viewStates', value: [{ id: 's_detail', name: 'B 상세' }] },
      { op: 'add', path: '/root/children/0', value: { id: 'n_b_text', type: 'Text', props: { content: '다른 페이지' } } },
      { op: 'add', path: '/root/children/1', value: button('n_b_add', 'B 등록', [{ type: 'setViewState', target: 's_detail' }]) },
      { op: 'add', path: '/root/children/2', value: { id: 'n_b_detail', type: 'Text', props: { content: 'B 상세 글' }, visibility: { mode: 'only', states: ['s_detail'] } } },
    ])
    await mk('팝업', 'popup', [
      { op: 'add', path: '/viewStates', value: [{ id: 's_more', name: '더보기' }] },
      { op: 'add', path: '/root/children/0', value: button('n_more', '더보기', [{ type: 'setViewState', target: 's_more' }]) },
      { op: 'add', path: '/root/children/1', value: { id: 'n_extra', type: 'Text', props: { content: '추가 칸' }, visibility: { mode: 'only', states: ['s_more'] } } },
      { op: 'add', path: '/root/children/2', value: button('n_pop_bad', '연 화면 상태', [{ type: 'setViewState', target: 's_detail' }]) },
      { op: 'add', path: '/root/children/3', value: button('n_pop_go', '팝업에서 이동', [{ type: 'navigate', target: 'page:관리자/다른' }]) },
    ])
  }, 180_000)

  afterAll(async () => {
    mkdirSync(OUT, { recursive: true })
    writeFileSync(`${OUT}/viewmode-${TAG}.json`, JSON.stringify(results, null, 2))
    // eslint-disable-next-line no-console
    console.log('RESULTS', JSON.stringify(results))
    if (stack !== undefined) {
      const { after } = await stack.close()
      // eslint-disable-next-line no-console
      console.log('TEARDOWN', JSON.stringify(after))
    }
  })

  const path = (title: string) => `/projects/${projectId}/pages/${pages[title]}`

  async function tab(run: (page: Page) => Promise<void>): Promise<void> {
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1440, height: 900 } })
    try {
      await run(page)
    } finally {
      await context.close()
    }
  }

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
  const toView = async (page: Page) => {
    await page.getByRole('button', { name: '뷰 모드', exact: true }).click()
    await page.locator('.wb-shell-mode[aria-pressed="true"]', { hasText: '뷰 모드' }).waitFor()
  }
  const toEdit = async (page: Page) => {
    await page.getByRole('button', { name: '편집 모드', exact: true }).click()
    await page.locator('.wb-shell-mode[aria-pressed="true"]', { hasText: '편집 모드' }).waitFor()
  }
  const pick = async (page: Page, name: string) => {
    await page.locator('button[aria-label^="화면 상태: "]').click()
    await page.getByRole('menuitemradio', { name }).click()
  }
  const click = async (page: Page, id: string) => {
    await canvasFrame(page).locator(`[data-wb-id="${id}"]`).first().click()
    await sleep(700)
  }
  async function shot(page: Page) {
    await sleep(500)
    const handle = await page.$('iframe.wb-shell-canvas-iframe')
    const frame: Frame | null | undefined = await handle?.contentFrame()
    const ids = ['n_add', 'n_detail', 'n_other_text', 'n_b_text', 'n_b_detail', 'n_more', 'n_extra']
    const dom = frame
      ? await frame.evaluate((list) => {
          const outside = list.filter((id) => {
            const el = document.querySelector(`[data-wb-id="${id}"]`)
            return el !== null && el.closest('[data-wb-popup-layer]') === null
          })
          const inPopup = list.filter((id) => document.querySelector(`[data-wb-popup-layer] [data-wb-id="${id}"]`) !== null)
          return { outside, inPopup, popupLayer: document.querySelector('[data-wb-popup-layer]') !== null }
        }, ids)
      : null
    const url = new URL(page.url())
    return {
      path: url.pathname.endsWith(pages['목록']!) ? '목록' : (Object.entries(pages).find(([, id]) => url.pathname.endsWith(id))?.[0] ?? url.pathname),
      search: url.search,
      mode: (await page.locator('.wb-shell-mode[aria-pressed="true"]').textContent())?.trim(),
      switcher: await page.locator('button[aria-label^="화면 상태: "]').getAttribute('aria-label').catch(() => null),
      ...dom,
      notices: await page.locator('.wb-shell-canvas-runtime-item').allTextContents(),
    }
  }
  const open = async (page: Page, title: string, first = 'n_add') => {
    await page.goto(path(title))
    await canvasFrame(page).locator(`[data-wb-id="${first}"]`).waitFor()
  }

  it('①a 기본에서 들어가 상태를 바꾸고 다른 페이지로 옮긴 뒤 나감 · 그 뒤 뒤로', async () => {
    await tab(async (page) => {
      const r: Record<string, unknown> = {}
      await open(page, '목록')
      await toView(page)
      await click(page, 'n_add')
      r.afterAdd = await shot(page)
      await page.getByRole('link', { name: '다른', exact: true }).click()
      await canvasFrame(page).locator('[data-wb-id="n_b_text"]').waitFor()
      r.onB = await shot(page)
      await toEdit(page)
      r.exitOnB = await shot(page)
      await page.goBack()
      await canvasFrame(page).locator('[data-wb-id="n_add"]').waitFor()
      r.backToA = await shot(page)
      results['①a'] = r
    })
  })

  it('①b 상태에서 들어가 · 바꾸고 · B 로 가서 B 상태 · 뒤로 A · 나감 · 새로고침', async () => {
    await tab(async (page) => {
      const r: Record<string, unknown> = {}
      await open(page, '목록')
      await pick(page, '다른 상태')
      r.before = await shot(page)
      await toView(page)
      await click(page, 'n_add')
      await page.getByRole('link', { name: '다른', exact: true }).click()
      await canvasFrame(page).locator('[data-wb-id="n_b_text"]').waitFor()
      await click(page, 'n_b_add')
      r.onB = await shot(page)
      await page.goBack()
      await canvasFrame(page).locator('[data-wb-id="n_add"]').waitFor()
      r.backToA = await shot(page)
      await page.goForward()
      await canvasFrame(page).locator('[data-wb-id="n_b_text"]').waitFor()
      r.forwardB = await shot(page)
      await page.goBack()
      await canvasFrame(page).locator('[data-wb-id="n_add"]').waitFor()
      await toEdit(page)
      r.exitOnA = await shot(page)
      await page.reload()
      await canvasFrame(page).locator('[data-wb-id="n_add"]').waitFor()
      r.reload = await shot(page)
      results['①b'] = r
    })
  })

  it('② 팝업이 열린 채 나감 · 다시 들어감', async () => {
    await tab(async (page) => {
      const r: Record<string, unknown> = {}
      await open(page, '목록')
      await toView(page)
      await click(page, 'n_open')
      await canvasFrame(page).locator('[data-wb-popup-frame] [data-wb-id="n_more"]').waitFor()
      await click(page, 'n_more')
      r.popupMore = await shot(page)
      await click(page, 'n_pop_bad')
      r.popupBad = await shot(page)
      await toEdit(page)
      r.exit = await shot(page)
      await toView(page)
      r.reenter = await shot(page)
      results['②'] = r
    })
  })

  it('②b 팝업이 열린 채 메뉴 트리로 다른 페이지', async () => {
    await tab(async (page) => {
      const r: Record<string, unknown> = {}
      await open(page, '목록')
      await pick(page, '상세 열림')
      await toView(page)
      await click(page, 'n_open')
      await canvasFrame(page).locator('[data-wb-popup-frame] [data-wb-id="n_pop_go"]').waitFor()
      await click(page, 'n_more')
      await page.getByRole('link', { name: '다른', exact: true }).click()
      await canvasFrame(page).locator('[data-wb-id="n_b_text"]').waitFor()
      r.onB = await shot(page)
      await page.getByRole('link', { name: '목록', exact: true }).click()
      await canvasFrame(page).locator('[data-wb-id="n_add"]').waitFor()
      r.backToAInView = await shot(page)
      await toEdit(page)
      r.exit = await shot(page)
      results['②b'] = r
    })
  })

  it('③a 뷰 모드 동안 남이(REST) 그 상태를 지움', async () => {
    await tab(async (page) => {
      const r: Record<string, unknown> = {}
      await open(page, '목록삭제')
      await pick(page, '상세 열림')
      await toView(page)
      await click(page, 'n_cancel')
      await click(page, 'n_add')
      r.before = await shot(page)
      const got = await call('GET', `/projects/${projectId}/pages/${pages['목록삭제']}`)
      const del = await call('PATCH', `/projects/${projectId}/pages/${pages['목록삭제']}/ops`, {
        baseSeq: got.body.headSeq,
        ops: [
          { op: 'test', path: '/viewStates/0/id', value: 's_detail' },
          { op: 'remove', path: '/root/children/1' },
          { op: 'remove', path: '/viewStates/0' },
        ],
      })
      r.deleteStatus = { status: del.status, warnings: (del.body?.warnings ?? []).map((w: { code: string; nodeId?: string }) => `${w.code}:${w.nodeId}`) }
      await sleep(1500)
      r.afterDelete = await shot(page)
      await click(page, 'n_add')
      r.clickAfterDelete = await shot(page)
      await toEdit(page)
      r.exit = await shot(page)
      results['③a'] = r
    })
  })

  it('③b 뷰 모드 동안 남이(REST) 그 상태 이름을 바꿈', async () => {
    await tab(async (page) => {
      const r: Record<string, unknown> = {}
      await open(page, '목록이름')
      await toView(page)
      await click(page, 'n_add')
      const got = await call('GET', `/projects/${projectId}/pages/${pages['목록이름']}`)
      const ren = await call('PATCH', `/projects/${projectId}/pages/${pages['목록이름']}/ops`, {
        baseSeq: got.body.headSeq,
        ops: [
          { op: 'test', path: '/viewStates/0/id', value: 's_detail' },
          { op: 'replace', path: '/viewStates/0/name', value: '상세 열림 바뀜' },
        ],
      })
      r.renameStatus = ren.status
      await sleep(1500)
      r.afterRename = await shot(page)
      await toEdit(page)
      r.exit = await shot(page)
      results['③b'] = r
    })
  })

  it('④ 뷰 모드 동안 새로고침 · 주소 ?state= 를 직접 고침', async () => {
    await tab(async (page) => {
      const r: Record<string, unknown> = {}
      await open(page, '목록')
      await toView(page)
      await click(page, 'n_add')
      r.afterAdd = await shot(page)
      await page.reload()
      await canvasFrame(page).locator('[data-wb-id="n_add"]').waitFor()
      r.reload = await shot(page)
      await page.goto(`${path('목록')}?state=s_other`)
      await canvasFrame(page).locator('[data-wb-id="n_add"]').waitFor()
      r.typedUrl = await shot(page)
      await toView(page)
      r.typedUrlView = await shot(page)
      await click(page, 'n_add')
      await toEdit(page)
      r.typedUrlExit = await shot(page)
      results['④'] = r
    })
  })

  it('⑤a 기본에서 들어감 → 상호작용 · 전환기 → 나감 → 새로고침', async () => {
    await tab(async (page) => {
      const r: Record<string, unknown> = {}
      await open(page, '목록')
      r.before = await shot(page)
      await toView(page)
      await click(page, 'n_add')
      await toEdit(page)
      r.exitAfterInteraction = await shot(page)
      await page.reload()
      await canvasFrame(page).locator('[data-wb-id="n_add"]').waitFor()
      r.reloadAfterInteraction = await shot(page)
      results['⑤a'] = r
    })
  })

  it('⑤b 상태에서 들어감 → 전환기로 다른 상태 → 나감 → 새로고침 (main 과 견줄 판 — 상호작용 없이 전환기만)', async () => {
    await tab(async (page) => {
      const r: Record<string, unknown> = {}
      await open(page, '목록')
      await pick(page, '상세 열림')
      r.before = await shot(page)
      await toView(page)
      r.enter = await shot(page)
      await pick(page, '다른 상태')
      r.inView = await shot(page)
      await toEdit(page)
      r.exit = await shot(page)
      await page.reload()
      await canvasFrame(page).locator('[data-wb-id="n_add"]').waitFor()
      r.reload = await shot(page)
      results['⑤b'] = r
    })
  })
})
```

### `bundle.probe.ts` — 위 3

```ts
/**
 * RV-VS 탐침 — HTML 번들의 `setViewState`(결정 8): 해시 · 뒤로/앞으로 · 다른 장 갔다 옴 · 화면 모드 · 팝업 겹 · 숨은 노드 안의 탭 · 링크.
 * 단언하지 않고 값을 적는다(`out/bundle-<TAG>.json`).
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import type { Page } from 'playwright-core'
import { afterAll, beforeAll, describe, it } from 'vitest'
import {
  editorStackPrerequisite,
  startEditorStack,
  type EditorStack,
  type Session,
} from '<체크아웃>/apps/web/build-test/editor-stack'
import {
  exportBundle,
  openBundlePage,
  type UnpackedBundle,
} from '<체크아웃>/apps/web/build-test/layout-bundle'

const OUT = '<스크래치>/out'
const TAG = process.env.PROBE_TAG ?? 'branch'
const 전제 = await editorStackPrerequisite()
const results: Record<string, unknown> = {}
const button = (id: string, label: string, actions: unknown[]) => ({ id, type: 'Button', props: { label }, interactions: [{ on: 'click', actions }] })
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe.skipIf(!전제.ok)('rv-vs 번들 탐침', () => {
  let stack: EditorStack
  let alice: Session
  let bundle: UnpackedBundle

  beforeAll(async () => {
    if (!전제.ok) return
    stack = await startEditorStack(전제)
    alice = await stack.login(stack.users.alice)
    const call = (method: string, path: string, body?: unknown) => stack.request(alice, method, path, body)
    const ok = (r: { status: number; body: any }, what: string) => {
      if (r.status >= 300) throw new Error(`픽스처 ${what} ${r.status} ${JSON.stringify(r.body)}`)
      return r.body
    }
    const project = ok(await call('POST', '/projects', { name: '번들 탐침', slug: `rvvsb-${Date.now().toString(36)}` }), '프로젝트')
    const menu = ok(await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '관리자' }), '메뉴')
    const mk = async (title: string, kind: 'page' | 'popup', ops: unknown[]) => {
      const page = ok(await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title, kind }), title)
      ok(await call('PATCH', `/projects/${project.id}/pages/${page.id}/ops`, { baseSeq: 0, ops }), `ops ${title}`)
    }
    await mk('목록', 'page', [
      { op: 'add', path: '/viewStates', value: [{ id: 's_detail', name: '상세 열림' }] },
      { op: 'add', path: '/root/children/0', value: button('n_add', '등록', [{ type: 'setViewState', target: 's_detail' }]) },
      {
        op: 'add',
        path: '/root/children/1',
        value: {
          id: 'n_detail',
          type: 'Card',
          props: { title: '상세' },
          visibility: { mode: 'only', states: ['s_detail'] },
          children: [
            {
              id: 'n_tabs',
              type: 'Tabs',
              props: { active: 0 },
              children: [
                { id: 'n_tp1', type: 'TabPanel', props: { label: '첫 탭' }, children: [{ id: 'n_tp1_text', type: 'Text', props: { content: '첫 탭 글' } }] },
                { id: 'n_tp2', type: 'TabPanel', props: { label: '둘째 탭' }, children: [{ id: 'n_tp2_text', type: 'Text', props: { content: '둘째 탭 글' } }] },
              ],
            },
            button('n_in_go', '상세 안 이동', [{ type: 'navigate', target: 'page:관리자/다른' }]),
            button('n_cancel', '취소', [{ type: 'setViewState', target: 'default' }]),
          ],
        },
      },
      { op: 'add', path: '/root/children/2', value: button('n_open', '팝업 열기', [{ type: 'openModal', target: 'page:관리자/팝업' }]) },
      // 숨은 탭을 미리 고르는 단추 — 상태가 숨긴 노드를 겨눈 겹layer 값이 보일 때 쓰이나.
      { op: 'add', path: '/root/children/3', value: button('n_pre_tab', '둘째 탭 미리', [{ type: 'switchTab', target: 'n_tp2' }]) },
    ])
    await mk('다른', 'page', [
      { op: 'add', path: '/viewStates', value: [{ id: 's_detail', name: 'B 상세' }] },
      { op: 'add', path: '/root/children/0', value: { id: 'n_b_text', type: 'Text', props: { content: '다른 페이지' } } },
    ])
    await mk('팝업', 'popup', [
      { op: 'add', path: '/viewStates', value: [{ id: 's_more', name: '더보기' }] },
      { op: 'add', path: '/root/children/0', value: button('n_more', '더보기', [{ type: 'setViewState', target: 's_more' }]) },
      { op: 'add', path: '/root/children/1', value: { id: 'n_extra', type: 'Text', props: { content: '추가 칸' }, visibility: { mode: 'only', states: ['s_more'] } } },
      { op: 'add', path: '/root/children/2', value: button('n_pop_bad', '연 화면 상태', [{ type: 'setViewState', target: 's_detail' }]) },
      { op: 'add', path: '/root/children/3', value: button('n_pop_default', '팝업 기본', [{ type: 'setViewState', target: 'default' }]) },
    ])
    await mk('상태없음', 'page', [
      { op: 'add', path: '/root/children/0', value: button('n_none', '기본으로', [{ type: 'setViewState', target: 'default' }]) },
    ])
    bundle = await exportBundle(stack, alice, project.id)
    results.pages = Object.keys(bundle.pages)
  }, 240_000)

  afterAll(async () => {
    mkdirSync(OUT, { recursive: true })
    writeFileSync(`${OUT}/bundle-${TAG}.json`, JSON.stringify(results, null, 2))
    // eslint-disable-next-line no-console
    console.log('RESULTS', JSON.stringify(results))
    bundle?.dispose()
    if (stack !== undefined) {
      const { after } = await stack.close()
      // eslint-disable-next-line no-console
      console.log('TEARDOWN', JSON.stringify(after))
    }
  })

  const file = (stem: string) => bundle.pages[stem] ?? bundle.pages[Object.keys(bundle.pages).find((key) => key.endsWith(stem))!]!
  async function look(page: Page) {
    await sleep(400)
    return page.evaluate(() => {
      const inCanvas = (id: string) => {
        const el = document.querySelector(`.wb-export-canvas [data-wb-id="${id}"]`)
        return el !== null && el.closest('[data-wb-popup-layer]') === null
      }
      const visible = (id: string) => {
        const el = document.querySelector(`[data-wb-id="${id}"]`) as HTMLElement | null
        if (el === null) return false
        const box = el.getBoundingClientRect()
        return box.width > 0 && box.height > 0
      }
      return {
        file: decodeURIComponent(location.pathname.split('/').pop() ?? ''),
        hash: location.hash,
        historyLength: history.length,
        select: (document.querySelector('.wb-export-state-select') as HTMLSelectElement | null)?.value ?? null,
        screenClass: document.documentElement.classList.contains('wb-export-screen'),
        detail: inCanvas('n_detail'),
        tab2Visible: visible('n_tp2_text'),
        tab1Visible: visible('n_tp1_text'),
        popupExtra: document.querySelector('[data-wb-popup-layer] [data-wb-id="n_extra"]') !== null,
        popupLayer: document.querySelector('[data-wb-popup-layer]') !== null,
        status: [...document.querySelectorAll('.wb-export-status-line')].map((p) => p.textContent),
      }
    })
  }
  const ready = (page: Page) => page.waitForSelector('html[data-wb-ready]', { state: 'attached', timeout: 15_000 })

  it('B1 숨은 상세 안의 탭 · 링크 → 다른 장 → 뒤로 · 앞으로', async () => {
    const { context, page } = await openBundlePage(stack, file('목록'), { viewport: { width: 1280, height: 800 } })
    try {
      const r: Record<string, unknown> = {}
      results.B1 = r
      r.open = await look(page)
      await page.locator('.wb-export-canvas [data-wb-id="n_add"]').click()
      r.added = await look(page)
      r.tabRoles = await page.locator('.wb-export-canvas [data-wb-id="n_tabs"]').evaluate((el) => [...el.querySelectorAll('[role="tab"], button')].map((b) => `${b.getAttribute('role')}:${b.textContent}`))
      await page.locator('.wb-export-canvas [data-wb-id="n_tabs"]').getByRole('tab', { name: '둘째 탭' }).click({ timeout: 3000 }).catch((e) => { r.tabClickError = String(e).slice(0, 300) })
      r.tab2 = await look(page)
      await page.locator('.wb-export-canvas [data-wb-id="n_in_go"]').click()
      await page.waitForURL((url) => decodeURIComponent(url.pathname).includes('다른'), { timeout: 10_000 }).catch(() => undefined)
      await ready(page)
      r.other = await look(page)
      await page.goBack()
      await ready(page)
      r.back = await look(page)
      await page.goForward()
      await ready(page)
      r.forward = await look(page)
      await page.goBack()
      await ready(page)
      await page.locator('.wb-export-canvas [data-wb-id="n_cancel"]').click()
      r.cancelled = await look(page)
      await page.goBack().catch(() => undefined)
      await sleep(800)
      r.backAfterCancel = { url: decodeURIComponent(page.url().split('/').pop() ?? '') }
      results.B1 = r
    } finally {
      await context.close()
    }
  })

  it('B1b 상태가 숨긴 탭을 미리 고름 → 상태를 바꿈', async () => {
    const { context, page } = await openBundlePage(stack, file('목록'), { viewport: { width: 1280, height: 800 } })
    try {
      const r: Record<string, unknown> = {}
      await page.locator('.wb-export-canvas [data-wb-id="n_pre_tab"]').click()
      r.pre = await look(page)
      await page.locator('.wb-export-canvas [data-wb-id="n_add"]').click()
      r.added = await look(page)
      results.B1b = r
    } finally {
      await context.close()
    }
  })

  it('B2 화면 모드(#wb-screen)에서 누름 · 새로고침', async () => {
    const { context, page } = await openBundlePage(stack, file('목록'), { viewport: { width: 1280, height: 800 }, screen: true })
    try {
      const r: Record<string, unknown> = {}
      r.open = await look(page)
      await page.locator('.wb-export-canvas [data-wb-id="n_add"]').click()
      r.added = await look(page)
      await page.reload()
      await ready(page)
      r.reload = await look(page)
      await page.locator('.wb-export-canvas [data-wb-id="n_cancel"]').click()
      r.cancelled = await look(page)
      results.B2 = r
    } finally {
      await context.close()
    }
  })

  it('B3 팝업 겹 안의 상태 바꾸기 · 연 화면 id · 기본', async () => {
    const { context, page } = await openBundlePage(stack, file('목록'), { viewport: { width: 1280, height: 800 } })
    try {
      const r: Record<string, unknown> = {}
      await page.locator('.wb-export-canvas [data-wb-id="n_add"]').click()
      await page.locator('.wb-export-canvas [data-wb-id="n_open"]').click()
      await page.locator('[data-wb-popup-frame] [data-wb-id="n_more"]').waitFor()
      r.opened = await look(page)
      await page.locator('[data-wb-popup-frame] [data-wb-id="n_more"]').click()
      r.more = await look(page)
      await page.locator('[data-wb-popup-frame] [data-wb-id="n_pop_bad"]').click()
      r.bad = await look(page)
      await page.locator('[data-wb-popup-frame] [data-wb-id="n_pop_default"]').click()
      r.popDefault = await look(page)
      results.B3 = r
    } finally {
      await context.close()
    }
  })

  it('B4 다른 해시(#foo)가 있는 판 — 상태 없는 장 · 상태 있는 장', async () => {
    const context = await stack.browser.newContext({ viewport: { width: 1280, height: 800 } })
    try {
      const r: Record<string, unknown> = {}
      const page = await context.newPage()
      await page.goto(pathToFileURL(file('상태없음')).href + '#foo')
      await ready(page)
      await page.locator('.wb-export-canvas [data-wb-id="n_none"]').click()
      r.noStates = await look(page)
      await page.goto(pathToFileURL(file('목록')).href + '#foo')
      await ready(page)
      await page.locator('.wb-export-canvas [data-wb-id="n_add"]').click()
      r.withStates = await look(page)
      results.B4 = r
    } finally {
      await context.close()
    }
  })
})
```
