# 끌기 진단 줄 — `?debugDrag=1`

컴포넌트 목록의 카드를 캔버스로 끌었는데 안 놓일 때, 브라우저 콘솔에 **단계마다 한 줄**(`[wb-drag] …`)을 내 어느 단계에서 멈췄는지 가르는 장치다. 끄면(기본) 아무 줄도 안 내고 동작 · 비용이 그대로다. 코드는 `apps/web/src/drag/drag-debug.ts` 가 갖는다.

## 켜는 법

둘 중 하나:

- **주소** — 에디터를 연 주소 끝에 `?debugDrag=1` 을 붙여 다시 연다(예: `…/projects/<id>/pages/<id>?debugDrag=1`). 질의가 이미 있으면 `&debugDrag=1`.
- **`localStorage`** — 개발자 도구 콘솔에서 `localStorage.setItem('wb-debug-drag', '1')` 을 친 뒤 새로고침한다. 그 브라우저 프로필에서 끌 때까지 켜진 채다.

켜지면 콘솔 첫 줄에 `[wb-drag] #0 +…ms on source=query dpr=… viewport=…x… ua=…` 가 선다 — 이 줄이 없으면 안 켜진 것이다. **앱이 뜰 때 한 번 읽는다** — 켠 뒤 페이지를 옮겨 주소의 질의가 빠져도 그 탭은 켜진 채이고, 켜고 끄는 것은 새로고침 뒤에 실린다.

줄은 `console.info` 다 — Chrome 콘솔의 기본 수준(Default levels)에서 보인다. 콘솔 위 거르개 칸에 `wb-drag` 를 치면 그 줄만 남는다.

## 사용자에게 받을 것

1. 위 «켜는 법» 으로 켠다.
2. 안 되는 그대로 카드를 한 번 끌어 놓는다(캔버스의 그 자리에서 뗀다).
3. 콘솔의 `[wb-drag]` 줄을 **전부** 복사해 붙인다(오른쪽 클릭 → «Save as…» 도 된다). 줄은 글 한 줄씩이라 복사해도 값이 남는다.

## 줄 모양

```
[wb-drag] #2 +0ms down pointer=mouse id=1 button=0 x=416 y=663 target=span.wb-shell-palette-window
[wb-drag] #2 +1ms press pointer=mouse id=1 button=0 x=416 y=663 el=div.wb-shell-palette-card[Divider] frames-held=1
[wb-drag] #2 +26ms start via=threshold dist=4.5 capture=set has=true
[wb-drag] #2 +27ms over result=none why=outside-canvas x=418 y=659
[wb-drag] #2 +29ms tag label=구분선 left=432 top=673 width=49.1 height=21
[wb-drag] #2 +42ms capture-got
[wb-drag] #2 +160ms over result=canvas parent=n_5bff78f7d069 index=2 placement=inside over=page-end x=617.1 y=516
[wb-drag] #2 +215ms release x=702 y=455.5 landed=true shown=true still=true
[wb-drag] #2 +215ms end why=release started=true
[wb-drag] #2 +216ms drop result=committed parent=n_5bff78f7d069 index=2 placing=new:Divider
```

(헤드리스 Chrome · 창 1440×900 에서 카드를 문서 아래 바탕에 놓은 판 — `apps/web/build-test/drag-debug.test.ts`.)

`#n` 은 누름마다 오르는 번호다 — 창의 **모든** `pointerdown` 이 올리므로 카드 밖을 누른 것도 센다. `+ms` 는 그 누름부터의 시간이다.

### 단계

| 단계 | 언제 | 값 |
| --- | --- | --- |
| `on` | 켜졌을 때 한 번 | `source`(query · storage) · `dpr` · `viewport` · `ua` — 확대 · 배율 판을 가른다 |
| `down` | 창의 모든 누름(붙잡는 단계) | 포인터 종류 · id · 단추 · 좌표 · **누름을 받은 요소**(`target`) |
| `press` | 끌기 장치가 그 누름을 받았다 | `el`(쥔 요소 — 카드면 `[타입]`) · `frames-held`(포인터를 막은 iframe 몫) · 터치면 `hold`(ms) |
| `press-ignored` | 받았지만 무시했다 | `why=button`(주 단추 아님) · `why=busy`(앞 누름이 안 끝났다 — `held` 가 그 포인터 id) |
| `start` | 끌기가 섰다 | `via`(threshold · touch-hold) · `dist` · `capture`(set · absent · threw) · `has`(`hasPointerCapture`) |
| `capture-got` · `capture-lost` | 포인터 캡처를 얻고 잃음 | `capture-lost` 의 `started` |
| `window-blur` | 끄는 중 창이 포커스를 잃음 | `started` |
| `over` | 놓을 자리의 답이 **바뀔 때만** | 자리가 있으면 `result=canvas`·`tree` · `parent` · `index` · `placement` · `over`(노드 id · `page-end`) · `band`, 없으면 `result=none why=<까닭>` |
| `tag` | 카드 이름표가 섰다(누름마다 한 번) | 글 · 상자(`width`·`height` 0 이면 섰는데 안 보인다) |
| `release` | 뗐다 | 좌표 · `landed`(뗀 자리의 답이 있나) · `shown`(보인 답이 있었나) · `still`(마지막 움직임과 같은 자리인가) |
| `drop-refused` | 뗀 자리의 답이 보인 답과 다른 부모 | `why=not-shown` |
| `end` | 누름이 끝났다 | `why`(click · touch-scroll · release · pointercancel · escape · unmount) · `started` |
| `drop` | 놓기의 결과 | `result=committed`(부모 · 차례 · 넣은 것) · `result=asked`(같은 값 — 첫 행 확인 상자를 띄웠고 아직 안 냈다) · `result=refused why=<까닭>` |
| `ask` | 첫 행 확인 상자가 닫혔다(`drop result=asked` 뒤) | `result=continued`(«계속» — 낸 편집의 부모 · 차례 · 넣은 것) · `result=cancelled`(«취소» · Escape · 닫기 — 낸 것 없음) · `result=stale`(«계속» 했지만 그 사이 문서가 바뀌어 안 냈다) |

### 까닭(`why=`)

| 값 | 어디서 | 뜻 |
| --- | --- | --- |
| `outside-canvas` | 캔버스 판정 | 포인터가 캔버스 칸 밖(판 · 트리 · 머리 위) |
| `beside-or-above-document` | 캔버스 판정 | 칸 안이지만 문서 옆 · 위의 바탕 — 못 놓는 자리다(아래 바탕은 페이지 끝으로 놓인다) |
| `over-copy` | 경로 층 | 그리드 되풀이 줄의 사본 위 — 못 놓는 자리다(포인터 곁에 «첫 행의 칸에 놓으세요») |
| `no-frame-element` | 캔버스 판정 | 캔버스 iframe 요소가 없다 |
| `no-canvas` | 경로 층 | 캔버스가 아직 안 섰다(창을 안 실었다) |
| `no-document` | 경로 층 | 열린 문서가 없다 |
| `stage-changed` | 경로 층 | 끄는 사이 페이지가 바뀌었거나 캔버스 iframe 이 새로 섰다 |
| `collapsed` | 경로 층 | 보인 자리가 무너졌다(남의 편집 · 잠금) — 문턱(4px) 밖으로 움직일 때까지 |
| `preview-gone` | 경로 층 | 미리보기 위인데 보인 자리가 더는 안 선다 |
| `tree-miss` | 경로 층 | 트리 영역 안이지만 놓을 줄이 없다 |
| `not-container` | 놓을 자리 판정 | «안» 에 놓으려는 노드가 자식을 안 받는다 |
| `parent-not-container` | 놓을 자리 판정 | 앞 · 뒤에 놓으려는 노드의 부모가 자식을 안 받는다 |
| `not-accepted` | 놓을 자리 판정 | 그 구역이 그 타입을 안 받는다(탭 몸통에 `TabPanel` 밖) · 그 타입의 설 자리가 아니다(탭 몸통 밖의 `TabPanel`) |
| `root-has-no-siblings` | 놓을 자리 판정 | 뿌리의 앞 · 뒤 |
| `locked` | 놓을 자리 판정 | 낼 편집이 남이 잡은 자리에 부딪친다 |
| `unknown-type` | 놓을 자리 판정 | 카드의 타입으로 노드를 못 짓는다 |
| `ops-unbuildable` | 놓을 자리 판정 | 편집을 못 짓는다(차례 · 부모 경로) |
| `target-not-in-document` · `no-root` | 놓을 자리 판정 | 대상 · 뿌리가 문서에 없다 |
| `self` · `into-own-subtree` · `same-place` | 놓을 자리 판정 | 노드를 옮길 때만(캔버스 손잡이) — 자기 자신 · 자기 자손 · 제자리 |
| `commit-refused` | 놓기 | 편집 전송 길이 받지 않았다 |
| `unknown` | — | 까닭을 알리지 않은 `null`(이 표에 없는 길 — 그 자체가 단서다) |

## 줄로 판을 가르는 법

- **`down` 은 있는데 `press` 가 없다** — 누름이 카드에 안 닿았다(`target` 이 그 위의 요소다).
- **`press-ignored why=busy`** — 앞 끌기가 안 끝난 채 남았다(그 포인터의 `end` 가 없다).
- **`press` 는 있는데 `start` 가 없다** — 문턱(4px)을 못 넘었거나 터치에서 길게 누르기 전에 움직였다(`end why=touch-scroll`) · `pointercancel` 로 끊겼다(`end why=pointercancel`).
- **`start` 뒤 `tag` 가 없거나 크기 0** — «이름표조차 안 선다» 판.
- **`over` 가 끝까지 `result=none`** — 그 `why` 가 판을 가른다. **«이름표는 따라오는데 놓아도 아무 일 없음»** 이면 대개 이 줄이다.
- **`release landed=true` 인데 `drop` 이 없거나 `drop-refused`** — 뗀 순간 자리가 바뀌었다.
- **`drop result=asked` 뒤 `ask` 가 없다** — 상자가 아직 열려 있거나, 페이지를 옮겨 물음이 상자 없이 걷혔다. 커스텀 행을 그리드의 첫 자리로 데려오는 놓기는 늘 묻는다(`apps/web/src/edit/first-row-ask.ts`) — 거절이 아니다.

## 끄는 법

주소로 켰으면 `?debugDrag=1` 없이 다시 연다. `localStorage` 로 켰으면 `localStorage.removeItem('wb-debug-drag')` 뒤 새로고침한다.

## 걷는 법

장치를 걷으려면 `git grep -nE 'wb-drag|drag-debug|dragDebug|DropMiss|onAskSettled|FirstRowOutcome'` 로 센 자리를 지운다 — 줄 함수(`apps/web/src/drag/drag-debug.ts`) · 끌기 장치 · 경로 층 · `canvasHitAt` · `structureDropTarget` 의 `why` 인자 · 첫 행 확인의 결말 콜백(`CommitOptions.onAskSettled` · `FirstRowAsk.settled` · `FirstRowOutcome`) · 카드의 이름표 ref · 케이스 둘(`apps/web/test/drag/drag-debug.test.tsx` · `apps/web/build-test/drag-debug.test.ts`) · 이 문서와 README 의 가리킴. `why` 인자는 끝에 붙은 선택 인자라 지워도 다른 부르는 쪽이 안 바뀐다.
