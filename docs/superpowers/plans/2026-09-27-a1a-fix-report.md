# A1a 리뷰 대응 보고

리뷰 `docs/superpowers/plans/2026-09-27-a1a-review.md`(항목 1 · 4 · 7)에 대한 대응이다. 이 문서는 발행 시점의 기록이다(`docs/guideline/base/04-citation.md` 「이력 문서는 연대기 금지의 예외다」).

## 커밋

| 항목 | 커밋 |
|---|---|
| F1 호스트 리스너 | `95c9c99c` |
| F2 Root 누락 되돌림 | `15a560fc` |
| F3 submit 캡처 | `62d6effa` |
| 이 보고 | 이 문서를 싣는 커밋 |

## 재현(고치기 전 — HEAD `362dc0fe`)

리뷰어의 빨강 6 이 리뷰가 적은 값으로 죽었다.

- `apps/web/build-test/canvas-iframe-host-events.test.ts` — 5 실패 · 1 통과: 팝오버 둘의 «캔버스를 누르면 닫힌다» `afterCanvasClick: 1`(기대 0), «Escape 가 닫는다» `afterEscape: 1`(기대 0), 폭 손잡이 `dragged: 264`(기대 414, 놓은 자리 `wb-shell-canvas-iframe`).
- `packages/renderer/test/view-path.test.tsx` «Root 를 빠뜨렸던 뷰가 편집으로 Root 를 그리게 되면 테마 뷰로 돌아온다» — `fixed: { className: '', structure: 'solid' }`(기대 `mine` · `null`).

## F1 — 호스트 리스너가 iframe 안의 이벤트를 받는다

**팝오버**(`src/shell/use-popover-dismiss.ts`): 캔버스 iframe 문서에도 `mousedown` · `keydown` 을 건다. 셸이 그 문서를 아는 길은 **컨텍스트**(`src/canvas/canvas-document.tsx` — `CanvasDocumentProvider` 가 `routes/editor.tsx` 에서 셸을 감싸고, 캔버스가 `usePublishCanvasDocument(frame?.document)` 로 싣는다)다. 팝오버 훅은 그 문서를 이펙트의 의존으로 두어, 페이지를 옮겨 iframe 이 새로 서면 옛 문서의 리스너를 걷고 새 문서에 건다. 걷을 때는 «그 문서가 지금 값일 때만» 비워 새 iframe 이 먼저 섰을 때 지우지 않는다. iframe 문서의 이벤트 대상은 그 창의 `Node` 라 호스트의 `instanceof Node` 가 거짓이다 — 노드 판정을 `nodeType` 으로 바꿨다(안 바꾸면 캔버스 누름을 «판정할 수 없음» 으로 보고 안 닫는다).

**폭 손잡이**(`src/shell/shell-resizer.tsx`): **`setPointerCapture` 를 골랐다.** 누르는 순간 포인터를 손잡이에 붙잡으면 iframe 위의 포인터 이벤트도 손잡이로 와서 `window` 까지 버블링한다 — 기존 `window` 리스너가 그대로 받는다. `pointer-events: none` 을 고르지 않은 까닭: 손잡이가 캔버스 iframe 을 찾아야 해(클래스 이름이 배선이 된다) 셸의 다른 조각을 알게 되고, 캔버스 말고 iframe 이 생기면 그것도 세야 한다. 캡처는 손잡이 하나로 끝난다. jsdom 에는 `setPointerCapture` 가 없어 부르지 않고 넘어가고(`typeof … === 'function'`), `window` 리스너가 두 판에서 같이 돈다 — jsdom 손잡이 케이스는 그대로 초록이다.

**새 케이스:**
- `build-test/canvas-iframe-host-events.test.ts` «팝오버를 연 채 페이지를 옮겨 iframe 이 새로 서도, 캔버스를 누르면 닫힌다» — 둘째 페이지에서 팝오버를 열고 옛 iframe 에 표시를 단 뒤 뒤로 가기로 첫 페이지에 돌아와(iframe 이 새로 선다 — 판 카나리아 `swapped: { iframes: 1, old: 0 }`) 캔버스를 누른다.
- `test/shell/popover-dismiss.test.tsx` «캔버스 문서 안의 누름 · Escape 가 닫고, 문서가 갈리면 새 문서에서 닫는다»(jsdom — 창이 있는 iframe 문서 둘을 갈아 끼우고, 옛 문서의 등록 · 해제가 같은지도 센다).

**한 겹씩 뗀 변조**(백업 → 바이트 비교 복원 → `git status` · `git diff --stat`):

| 변조 | 죽은 케이스 | 실패 값 | 산 케이스 |
|---|---|---|---|
| A 팝오버의 iframe 리스너만 뗌(`[document]` 만) | 팝오버 «누르면 닫힌다» 둘 · «Escape» 둘 · «iframe 이 새로 서도» — 5 | `afterCanvasClick: 1` · `afterEscape: 1`(기대 0) · jsdom 새 케이스 `expected true to be false` | 손잡이 · 빈 자리 클릭 |
| B 손잡이의 캡처만 뗌 | 손잡이 1 | `dragged: 264`(기대 414) | 팝오버 5 · 빈 자리 클릭 |
| C(더함) 팝오버가 문서를 한 번만 읽음(의존에서 캔버스 문서를 뺌) | «iframe 이 새로 서도» 1 · jsdom 새 케이스 | `afterCanvasClick: 1`(기대 0) · `expected false to be true` | 나머지 |

## F2 — Root 누락 판정이 되돌아온다

`packages/renderer/src/view-host.tsx` 의 `Guarded` 가 누락을 판정할 때 **노드 자신의 입력**(`type` · `variant` · `states` · `props` 의 JSON)을 함께 적고, 렌더 중에 그 값이 달라졌으면 판정을 거둬 테마 뷰를 다시 불러 본다(렌더 중 상태 조정 — 이펙트로 되돌리면 입력이 바뀐 첫 커밋이 기본 뷰로 한 번 그려진다).

**«바뀌었다» 의 기준 — 값이다. 참조도 얕은 비교도 아니다.** `viewProps` 는 문서를 그릴 때마다 새 객체이고 `props` 도 매번 새로 파싱돼, 참조로 가르면 형제만 고친 편집에서도 누락인 뷰를 다시 불러 경고를 되풀이한다(아래 변조 b). `children` · `slot` 은 넣지 않는다 — 자손 편집마다 새 엘리먼트라 같은 까닭이다. 값은 **누락인 동안에만** 만든다(멀쩡한 노드는 렌더마다 직렬화하지 않는다).

**뷰 계약(코디네이터 판정)** — `view-host.tsx` 머리말에 «뷰는 첫 렌더에 `Root` 를 반환한다. 마운트 뒤에 가서야 `Root` 를 그리는 뷰는 누락으로 판정되어 기본 뷰로 그려지고 `console.error` 로 경고가 난다» 를 적었다. 코드는 바꾸지 않았다.

**새 케이스**(`packages/renderer/test/view-path.test.tsx`):
- «누락 판정이 선 노드의 형제만 고치면 경고가 되풀이되지 않는다 — 판정도 그대로다» — 형제 편집 두 번 뒤 경고 1 · 기본 뷰 그대로. **고치기 전에도 초록**이다(그때는 판정이 아예 안 되돌아와 경고도 안 되풀이됐다) — 되돌림을 넣으며 생길 수 있는 되풀이를 잠그는 케이스다.
- «누락 판정이 선 노드를 고쳤는데도 Root 가 없으면 다시 말한다» — 고치기 전 빨강 `warnings: 1`(기대 2).

**변조:**

| 변조 | 죽은 케이스 | 실패 값 |
|---|---|---|
| a 되돌림을 뗌 | 리뷰어 케이스 · «다시 말한다» | `fixed.className ''` · `warnings: 1`(기대 2) |
| b «바뀌었다» 를 참조로 가름(`viewProps` 객체마다 새 값) | «형제만 고치면 되풀이되지 않는다» | `afterSiblingEdits: 3`(기대 1) |

실행: renderer + theme-sdk 23 파일 · 398 통과(리뷰어가 임시로 짠 판의 406 은 그 판의 케이스 수라 갈린다).

## F3 — 규칙 없는 submit 이 캔버스 iframe 을 비우지 않는다

`src/canvas/canvas-iframe.tsx` 가 iframe 문서의 `submit` 을 **캡처 단계에서 모드와 무관하게** `preventDefault` 한다. 전파는 두므로 React 의 `submit` 핸들러(규칙)가 그대로 불린다.

**새 케이스** `apps/web/build-test/canvas-iframe-submit.test.ts`(폼 노드에 진짜 `<button type="submit">` 을 심어 누른다):

| 케이스 | 고치기 전 | 고친 뒤 |
|---|---|---|
| 편집 모드 — 핸들러가 없는 폼 | **빨강** — `frameUrl: 'about:blank?'` · `nodes: 0` · `targetShown: false`(기대 `about:blank` · 4 · true) | 초록 |
| 뷰 모드 — 규칙 없는 폼 | **빨강** — 같은 값 | 초록 |
| 뷰 모드 — 규칙 있는 폼(`setVisible` false) | 초록(렌더러의 핸들러가 막는다) | 초록 — 규칙이 돌아 대상 글이 빠지고(`nodes` 3) 문서는 그대로 |

**변조:**

| 변조 | 죽은 케이스 | 실패 값 |
|---|---|---|
| a 캡처 가드를 뗌 | 규칙 없는 둘 | 위 «고치기 전» 값 |
| b 캡처에서 전파까지 끊음(`stopPropagation`) | 규칙 있는 폼 | `nodes: 4` · `targetShown: true`(기대 3 · false) — 규칙이 안 돈다 |

## 게이트

| 명령 | 결과 |
|---|---|
| `pnpm typecheck` | 오류 0 |
| `pnpm test` | 385 파일 · **7002 통과 · 1 건너뜀 · 실패 0**(건너뜀은 api `log-destination.test.ts` 의 기존 것). 워크트리 DB 5440 |
| `pnpm test:browser`(dev) | 19 파일 · **70 통과 · 건너뜀 0** |
| `EDITOR_STACK_BUNDLE=build pnpm test:browser` | 19 파일 · **70 통과 · 건너뜀 0** |

리뷰어가 세운 빨강 6 은 전부 초록이다. 수의 흐름: `pnpm test` 6998(구현 보고) + 리뷰어 1 + F1 jsdom 1 + F2 2 = 7002. 실브라우저 60 + 리뷰어 파일 6 + F1 1 + F3 3 = 70.

## 한계

- 팝오버 · 손잡이는 Chrome(CDP 입력)으로만 쟀다. `setPointerCapture` 의 iframe 경계 라우팅을 Firefox · Safari 에서 재지 않았다.
- 배분 손잡이(`wb-shell-region-resizer`)는 같은 컴포넌트라 같은 고침을 받지만 따로 재지 않았다.
- 코드 테마 뷰가 폼 안에 `<input>` 을 그려 Enter 로 암묵 제출하는 판은 재지 않았다 — 같은 `submit` 이벤트라 같은 가드를 지난다고 봤다.
