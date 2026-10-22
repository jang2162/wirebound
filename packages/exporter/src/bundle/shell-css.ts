/**
 * **뷰어 셸의 CSS.** 번들의 `assets/shell.css`가 되는 값이다.
 *
 * ---
 *
 * ## 왜 테마 CSS와 한 파일이 아닌가
 *
 * 테마 CSS는 설계서 「노드 속성」의 여섯 `data-wb-*` 어휘로만 적히고, 셸은 자기
 * 클래스(`.wb-export-*`)로만 적는다. **두 어휘가 겹치지 않는 것이 셸이 문서에 못 닿는다는
 * 뜻이다.** 한 파일에 섞으면 *"기본 뷰 CSS → 테마"*라는 순서 계약(`bundle/shell.tsx` 의 `shellHead` 가 거는 순서)에
 * 셸이 끼어들고, 그 순서가 곧 *"테마가 이긴다"*이다.
 *
 * 문서에는 셸이 **링크 둘**을 이 순서로 건다: 셸 → 테마. 셸이 먼저이므로 같은 특이도에서
 * 테마가 이긴다. 그런데 **애초에 같은 셀렉터가 없어서** 그 순서가 실제로 겨루는 자리는 없다 —
 * 아래 세 규칙이 그것을 지킨다.
 *
 * ## 소스가 지키는 셋 — `test/bundle-shell.test.ts`가 잰다
 *
 * 1. **`[style]` 셀렉터를 쓰지 않는다.** 빈 `style` 속성도 `[style]`에 매칭된다 — 지금 그런
 *    속성이 노출되지 않을 뿐 셀렉터에 안 잡히는 것이 아니다. 셸이 그 셀렉터를 하나 더하는
 *    순간 캔버스와 번들이 **화면으로** 갈린다.
 * 2. **`[data-wb-…]` 셀렉터를 쓰지 않는다.** 그것은 테마의 어휘다(「노드 속성」). 셸이 그 어휘로
 *    적으면 셸이 문서 노드를 직접 꾸미게 되고, *"번들이 캔버스와 같다"*가 셸의 존재만으로
 *    거짓이 된다.
 * 3. **문서를 감싸는 상자에는 상속되는 속성을 걸지 않는다.** 감싸개에 건 `color`·`font-*`는
 *    셀렉터가 문서 노드를 겨냥하지 않아도 **상속으로** 흘러 들어간다. `apps/web`이 자기
 *    셸에 같은 규율을 세워 뒀고(`test/shell-css-guard.ts`), 여기서는 그 **규율만** 옮긴다 —
 *    검사 코드는 옮기지 않는다(`apps/web`을 볼 수 없고, 두 벌을 두면 뜻이 둘이 된다).
 *
 * **그 결과 목업의 글자꼴은 셸이 정하지 않는다.** 테마와 구조 기본 CSS가 정하는 것만
 * 보인다 — 그것이 캔버스에서도 같다(`apps/web`의 감싸개 허용 목록에도 글자 속성이 없다).
 * 즉 이 규율은 *"셸을 못 꾸민다"*가 아니라 *"셸의 꾸밈이 목업을 안 바꾼다"*이다.
 *
 * ## 탭을 스크립트 없이
 *
 * 라디오 + `:checked ~` 조합이다. `<details>`도 후보였지만 그것은 **아코디언**이라 셋이
 * 동시에 열릴 수 있고 설계서 「설계서 화면 구조」의 그림은 **한 번에 하나**다. 라디오는 같은 `name`이 하나만 켜지는
 * 것을 브라우저가 보장한다.
 *
 * **라디오를 `display:none`으로 숨기지 않는다** — 그러면 키보드로 탭을 옮길 수 없다.
 * 잘라내기(clip)로 눈에서만 지운다.
 *
 * 스크립트를 안 쓰는 것은 `runtime.js`와 자리가 겹치지 않게 하려는 것이다 — 상호작용
 * 런타임이 돌지 않아도 번들은 **파일만으로** 3분할이 동작해야 한다.
 */

/**
 * **이 파일에 자를 두지 않는다.**
 *
 * 접두어(`wb-export`)와 감싸개 목록을 여기서 수출해 케이스가 그것으로 시트를 검사하면
 * **자가 자기가 재는 것과 같은 곳에 살아 함께 움직인다** — 접두어를 `wb`로 느슨하게 해도
 * **아무것도 안 죽는다.** 구현을 고치는 손이 자까지 같이 고칠 수 있으면 그 자는 아무것도
 * 안 재는 것이다.
 *
 * 그래서 접두어와 감싸개 목록은 **`test/bundle-shell.test.ts`에 글자로** 산다. 아래
 * `SHELL_CSS_PATH`는 자가 아니라 **구현이 쓰는 값**이다(`bundle/index.ts`가 파일 경로로
 * 쓴다) — 그래서 여기 남는다.
 */

/** 번들 안에서 이 시트가 사는 자리. */
export const SHELL_CSS_PATH = 'assets/shell.css'

export const SHELL_CSS = `/* wirebound 뷰어 셸 — 좌 트리 · 중 목업 · 우 탭의 3분할. 이 파일은 문서를 꾸미지 않는다. */

html,
body {
  margin: 0;
  padding: 0;
  height: 100%;
}

.wb-export {
  display: grid;
  grid-template-columns: 16rem minmax(0, 1fr) 22rem;
  height: 100%;
  background: #eef0f4;
}

/* ---------------------------------------------------------------- 좌: 트리 */

.wb-export-nav {
  overflow: auto;
  padding: 1rem 0.75rem;
  background: #ffffff;
  border-right: 1px solid #d9dde5;
  font-family: system-ui, -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif;
  font-size: 0.875rem;
  color: #1f2430;
  line-height: 1.6;
}

.wb-export-nav-heading {
  margin: 0 0 0.75rem;
  padding: 0 0.5rem;
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: #6b7280;
}

.wb-export-nav-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.wb-export-nav-link {
  display: block;
  padding: 0.375rem 0.5rem;
  border-radius: 4px;
  color: inherit;
  text-decoration: none;
}

.wb-export-nav-link:hover {
  background: #f1f3f7;
}

.wb-export-nav-link[aria-current="page"] {
  background: #e5edff;
  font-weight: 600;
}

/* -------------------------------------------------------------- 중: 목업 */

.wb-export-mockup {
  overflow: auto;
  padding: 1.5rem;
  min-width: 0;
}

/* **\`position: relative\`는 겹layer의 자리다.** 번호 마커는 문서 **옆에** 절대
   좌표로 놓이고, 그 좌표의 기준이 이 상자다. 상속되는 속성이 아니므로 문서 안으로 흘러
   들어가지 않는다 — 위 규율의 허용 목록에 \`position\`이 있는 이유가 그것이다.
   **스크립트가 없으면 겹layer 자체가 없다**(런타임이 만든다) — 그때 이 줄은 아무것도 안 한다. */
.wb-export-canvas {
  position: relative;
  box-sizing: border-box;
  min-height: 100%;
  padding: 1.25rem;
  background: #ffffff;
  border-radius: 6px;
  box-shadow: 0 1px 3px rgba(16, 24, 40, 0.12);
}

/* 번호 마커 겹layer. 런타임이 만들고 자리를 잰다.
   **문서를 가리지 않는다** — \`pointer-events: none\`이라 누르는 것은 그대로 문서로 간다. */
.wb-export-markers {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.wb-export-marker {
  position: absolute;
  transform: translate(-50%, -50%);
  min-width: 1.25rem;
  padding: 0 0.25rem;
  border-radius: 999px;
  background: #2563eb;
  color: #ffffff;
  font-family: system-ui, -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif;
  font-size: 0.75rem;
  font-weight: 600;
  line-height: 1.25rem;
  text-align: center;
}

/* 못 한 것을 말하는 줄. **런타임이 없으면 비어 있고 \`hidden\`이라 안 보인다.** */
.wb-export-status {
  margin-top: 0.75rem;
  padding: 0.625rem 0.875rem;
  border-radius: 6px;
  background: #fff7ed;
  border: 1px solid #fdba74;
  font-family: system-ui, -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif;
  font-size: 0.8125rem;
  color: #7c2d12;
  line-height: 1.6;
}

.wb-export-status[hidden] {
  display: none;
}

.wb-export-status-line {
  margin: 0;
}

/* -------------------------------------------------------------- 화면 모드 */

/* \`#wb-screen\`으로 연 판(PPTX 의 그리는 자가 찍는다) — 런타임이 \`<html>\`에 \`wb-export-screen\`을 단다. 셸을 숨기고 목업만 남기며
   문서 폭이 뷰포트 그대로다 — 캔버스가 문서를 프리셋 폭 그대로 담는 것과 같다. 상속되는 속성은 걸지 않는다. */
.wb-export-screen .wb-export {
  display: block;
  height: auto;
  background: none;
}

.wb-export-screen .wb-export-nav,
.wb-export-screen .wb-export-panel,
.wb-export-screen .wb-export-status {
  display: none;
}

.wb-export-screen .wb-export-mockup {
  padding: 0;
  overflow: visible;
}

.wb-export-screen .wb-export-canvas {
  min-height: 0;
  padding: 0;
  border-radius: 0;
  box-shadow: none;
}

/* 스크립트가 꺼진 브라우저에서만 서는 줄 — 목업은 \`runtime.js\`가 그린다. */
.wb-export-noscript {
  margin: 0;
  color: #5b6270;
}

/* -------------------------------------------------------------- 우: 탭 */

.wb-export-panel {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #ffffff;
  border-left: 1px solid #d9dde5;
  font-family: system-ui, -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif;
  font-size: 0.875rem;
  color: #1f2430;
  line-height: 1.6;
}

.wb-export-tab-radio {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

.wb-export-tablist {
  display: flex;
  border-bottom: 1px solid #d9dde5;
}

.wb-export-tab {
  flex: 1;
  padding: 0.625rem 0.5rem;
  text-align: center;
  cursor: pointer;
  color: #6b7280;
  border-bottom: 2px solid transparent;
}

.wb-export-tabpanel {
  display: none;
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  padding: 0.875rem 1rem;
}

#wb-export-tab-description:checked ~ .wb-export-tablist .wb-export-tab-description,
#wb-export-tab-comments:checked ~ .wb-export-tablist .wb-export-tab-comments,
#wb-export-tab-interactions:checked ~ .wb-export-tablist .wb-export-tab-interactions {
  color: #1f2430;
  font-weight: 600;
  border-bottom-color: #2563eb;
}

#wb-export-tab-description:checked ~ #wb-export-panel-description,
#wb-export-tab-comments:checked ~ #wb-export-panel-comments,
#wb-export-tab-interactions:checked ~ #wb-export-panel-interactions {
  display: block;
}

.wb-export-tab-radio:focus-visible ~ .wb-export-tablist .wb-export-tab {
  outline: 2px solid #2563eb;
  outline-offset: -2px;
}

/* ------------------------------------------------------------- 탭의 줄들 */

.wb-export-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.wb-export-entry {
  padding: 0.5rem 0;
  border-bottom: 1px solid #eef0f4;
}

.wb-export-entry-label {
  font-weight: 600;
}

.wb-export-entry-body {
  margin: 0.25rem 0 0;
  white-space: pre-wrap;
}

.wb-export-entry-meta {
  margin: 0.25rem 0 0;
  font-size: 0.8125rem;
  color: #6b7280;
}

.wb-export-empty {
  margin: 0;
  color: #6b7280;
}

.wb-export-description {
  margin: 0;
  white-space: pre-wrap;
}

/* 첫 탭의 화면 상태 — 트리 차례, 하위 상태는 깊이마다 들여 쓴다(\`data-depth\` — 깊이는 3 까지). 설명은 이름 아래 옅은 글이다. */
.wb-export-state-info {
  margin: 1rem 0 0;
}

.wb-export-state-heading {
  margin: 0 0 0.25rem;
  font-weight: 600;
}

.wb-export-state-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.wb-export-state-item {
  margin: 0 0 0.375rem;
}

.wb-export-state-item[data-depth="1"] {
  padding-left: 0.75rem;
}

.wb-export-state-item[data-depth="2"] {
  padding-left: 1.5rem;
}

.wb-export-state-description {
  margin: 0.125rem 0 0;
  color: #6b7280;
  white-space: pre-wrap;
}

/* 전환기는 목업 위 셸의 줄이다 — 문서를 감싸지 않으므로 글자 속성을 건다(위 «상속되는 속성» 규율은 감싸개의 것). */
.wb-export-states {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0 0 0.75rem;
  font-family: system-ui, -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif;
  font-size: 0.875rem;
  color: #1f2937;
}

.wb-export-states-label {
  font-weight: 600;
}

.wb-export-state-select {
  font: inherit;
  padding: 0.25rem 0.5rem;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  background: #fff;
}

/* 화면 모드(\`#wb-screen\`)는 목업만 찍는다 — 전환기도 셸이다. */
.wb-export-screen .wb-export-states {
  display: none;
}
`
