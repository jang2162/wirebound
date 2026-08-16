# P9-1 이월 — 주 독자는 **P9-2(CLI)**다

> 보고: `2026-08-16-p9-1-report.md` · 계획: `2026-08-16-p9-1-lint.md`

P9-1이 만든 것은 `lintProject` 하나다. **`wireb lint`는 그것을 부르면 된다** — 아래는 부르기
전에 정해야 하는 것과, 부르고 나서 갚아야 하는 빚이다.

---

## 1. `wireb lint`가 부를 이름과 채워야 할 입력

```
import { lintProject } from '@wirebound/themes'
```

`schema`가 아니다. **§12.4는 *"규칙은 `schema` 패키지에"*라고 적었지만 테마 규칙이 `themes`를
봐야 해서 합치는 자리가 `themes`가 됐다** — 근거는 보고서의 D2 절에 있다. `schema`가 내는
`lintDesign`도 있지만 그것은 절반이다.

**`installCatalog()`를 먼저 불러야 한다.** lint는 카탈로그를 스스로 설치하지 않는다
(`validatePage`·`checkThemeComponents`와 같은 자리다). 안 부르면 모든 노드가
`unknown-type`이 되어 나간다 — 조용히 통과하지는 않지만 결과가 통째로 거짓이 된다.

입력은 `ProjectLintInput` 셋이다.

| 절 | 무엇을 채우나 | 어디서 오나 |
|---|---|---|
| `project.menu` | `{ id, parentId, title }` | 스냅샷 payload의 `menu`가 **같은 모양**이다 |
| `project.pages` | `{ id, menuNodeId, title, target, document }` | payload의 `pages`에 **`target`만 없다** — 아래 §2 |
| `project.comments` | `{ pageId, nodeId }` | payload의 `comments`에서 두 필드만 |
| `themes[]` | `{ id, document, base?, pages? }` | payload의 `themes`. `base`·`pages`는 아래 §3·§4 |
| `config` | 안 주면 명명 규칙이 **안 돈다**(D5) | `.wirebound.json` — **P9-2가 정한다**, 아래 §5 |

---

## 2. **`pageTarget`을 공유 자리로 올려라** — 이 이월의 첫째 항목

`LintPage.target`은 *"이 페이지를 가리키는 §8.1의 타겟"*(`'page:관리자/회원/목록'`)이고
**필수**다. lint가 그것을 만들지 않고 받는다.

**이유:** 조립 규칙(`page:` + 조상 메뉴 이름들 + 페이지 제목을 `/`로 잇고 마디마다 공백을
걷는다)이 이미 있는데 **`apps/api/src/services/page-target.ts`에 산다.** 순수 함수인데
순수 패키지가 못 본다. P9-1이 그것을 `schema`에 다시 짜면 두 벌이 되고, **두 벌이 갈리는
날 lint가 멀쩡한 링크를 끊겼다고 말한다.**

**P9-2가 할 일:**

1. `pageTarget` · `pageBundleTitle` · `targetedPages` · `duplicateTargets`를
   `packages/schema`로 올린다(`PAGE_TARGET_PREFIX`도 함께 — `describePageTarget`이 이미
   그 접두를 안다).
2. `apps/api`의 `services/page-target.ts`를 **재수출로 바꾸거나 지우고** `routes/export.ts`·
   `services/`의 호출자를 새 자리로 돌린다. **두 벌로 남기지 마라.**
3. 옮길 때 `TreeMenuNode`(`services/menu-tree.ts`) 의존을 끊어야 한다 — `targetedPages`가
   받는 것을 lint 입력과 같은 평평한 모양(`{ id, parentId, title }` + `{ id, menuNodeId,
   title }`)으로 바꾸면 `wireb pull`이 받은 payload를 그대로 넣을 수 있다.

**올리기 전까지 `wireb lint`는 타겟을 스스로 조립해야 한다.** 그 임시 코드를 남기지 마라 —
이 슬라이스가 피한 두 벌이 거기서 생긴다.

**겹치는 타겟은 lint가 아직 안 본다.** `duplicateTargets`가 그 판정을 이미 갖고 있으므로,
올린 뒤에 규칙을 하나 더할지 판정하라(§12.4에 그 줄이 없다 — 더하면 표에 `spec: null`과
이유를 함께 적어야 한다).

---

## 3. `base`는 호출자가 준다 — `resolveThemeBase`도 같은 처지다

파생 테마(`meta.extends`)를 검사하려면 상속 대상 전문이 필요하다. **lint는 그것을 찾지
않는다** — `resolveTheme(document, base)`의 계약을 그대로 쓴다.

- `base`를 **안 주면** `bad-extends`(*"상속을 선언한 문서를 해석하려면 상속 대상 테마가
  필요합니다"*)가 난다. 그래서 ⑬의 *"대상이 없다"*는 그것 없이도 잡힌다.
- **다만 그것은 *"못 찾았다"*와 *"안 줬다"*를 가르지 못한다.** 그 둘을 가르는 문장
  (*"상속 대상 시스템 테마를 찾을 수 없습니다: …"*)은 `apps/api/src/services/project-theme.ts`의
  `resolveThemeBase`에 있고, **그것 역시 순수한데 `apps/api`에 산다.**

**P9-2가 할 일:** `resolveThemeBase`를 `packages/themes`로 올릴지 판정하라. 올리면
`wireb lint`가 `systemTheme`을 직접 뒤지지 않아도 되고, `apps/api`의 호출자(`assertResolvable`·
`currentProjectTheme`)가 같은 자리를 쓰게 된다. **§2와 같은 부류의 빚이고 §2보다 작다.**

---

## 4. ⑪이 도는 조건 — 테마와 페이지의 짝은 입력이 든다

규칙 ⑪(*"노드가 쓰는 `variant`를 테마가 정의하지 않음"*)은 `LintThemeEntry.pages`가 있어야
돈다. **비면 안 돈다** — 0건으로 위장하지 않는다.

**모델에 그 연결이 없다.** 페이지는 레이아웃을 가리키지 않고(§4.3) 테마를 드는 것은
레이아웃이다(§4.4). 스냅샷 payload도 같은 모양이라 거기서도 못 푼다.

**"프로젝트에 레이아웃이 하나뿐"에 기대지 마라.** P6-1 재라 #2가 그 가정을 실측으로 거짓임을
확인했다 — `layouts`에 `project_id` 유니크가 없고 두 번째 레이아웃이 **실제로 들어간다.**
오늘 그것을 만드는 코드 경로가 없을 뿐이다.

**P9-2의 선택지 둘:**

| 길 | 대가 |
|---|---|
| 레이아웃이 하나면 그 테마에 전 페이지를 매단다 | 둘 이상이면 **거짓 경고가 쏟아진다.** 그때 무엇을 할지 미리 정해 두어라 |
| 레이아웃이 하나일 때만 ⑪을 돌리고 아니면 안 돈다고 **말한다** | 조용히 0건이 되지 않는다. **이 슬라이스가 고른 태도와 같다** |

`wireb lint`가 어느 쪽을 골랐는지는 **출력에 드러나야 한다.**

---

## 5. `.wirebound.json`의 lint 설정 — 모양은 P9-2가 정한다

P9-1이 만든 것은 **자리**뿐이다(D5).

```
LintConfig = { naming?: { page?: string; menu?: string } }
```

값은 **정규식의 원문 문자열**이고 **기본값이 없다.** 안 주면 그 축이 안 돈다. 케이스가 그것을
고정한다(*"설정을 안 주면 돌지 않는다"* · *"빈 설정을 줘도 돌지 않는다"*).

**P9-2가 정해야 하는 것:**

1. `.wirebound.json`의 어느 키가 이것으로 오는가. §12.1의 예시는 `server`·`projectId`
   둘뿐이라 **lint 절이 아직 없다.** 설계서를 고치지 말고 판정해 보고하라.
2. **정규식 원문을 그대로 받는 것이 옳은가.** `new RegExp(source)`가 사용자 입력을 컴파일한다.
   `wireb`는 개발자가 자기 리포의 파일을 읽는 도구라 오늘 그것이 신뢰 경계를 넘지 않지만,
   **MCP(P9-3)가 같은 설정을 받게 되면 경계가 달라진다.** 그때 다시 보라.
3. 축을 늘릴지(노드 id? 컴포넌트 이름?). §12.4는 *"프로젝트 명명 규칙"*이라고만 적었다.
   **늘리면 규칙 표에 줄이 느는 것이 아니라 `LintConfig`에 필드가 는다** — ⑦은 한 줄이다.

---

## 6. 종료 코드를 무엇으로 가를지는 P9-2가 정한다

**lint는 저장 게이트가 아니다**(D4). `partitionIssues`를 부르지 않고, `LintIssue[]`를 그대로
낸다.

- `severity`의 뜻은 *"이 결함이 문서·테마를 무효로 만드는가"*이지 *"고쳐야 하는가"*가 아니다.
- **P9-1이 새로 더한 규칙은 전부 `warning`이다.** `error`는 전부 나른 것이다 — `validatePage`나
  `resolveTheme`이 원래 그렇게 부른 것.
- 그래서 *"`error`가 있으면 1"*은 **저장이 거부할 문서에서만** 1이 된다. §12.5의 흐름
  (*"`validate`로 설계서 자체의 결함을 보고한다"*)이 원하는 것이 그것인지 판정하라.

`--rule`·`--severity` 같은 거르개를 둔다면 **거르는 코드를 CLI에 두지 말고 판정하라** —
MCP(P9-3)의 `validate`도 같은 거르개를 원할 것이다.

---

## 7. P9-3(MCP)에게 미리 넘기는 것

- `validate` 도구가 부를 이름도 `lintProject`다. **CLI와 같은 함수를 부르는 것이 이 슬라이스의
  존재 이유다**(계획서 첫 문단).
- `LintIssue`는 **평평하다**(`rule`·`severity`·`pageId`·`themeId`·`nodeId`·`path`·`message`).
  JSON으로 그대로 나간다 — 중첩 유니온이 없어 MCP 응답 스키마를 따로 접을 필요가 없다.
- **§7.4의 *"MCP는 REST로 들어오고 잠금을 걸지 않는다"*를 P3-3 이월 §3.1이 다시 보라고 했다.**
  lint는 읽기 전용이라 그 물음에 걸리지 않는다 — 그 판정은 `patch_page`에서 하라.

---

## 8. 규칙을 더할 때 지켜야 하는 것

규칙 표는 `packages/schema/src/lint/rules.ts`의 `LINT_RULES` **하나**다.

1. **§12.4에 있는 규칙**이면 `spec`에 그 줄을 **글자 그대로** 적는다. 문구가 다르면
   `test/lint-rules.test.ts`가 죽는다(설계 문서를 읽어 대조한다).
2. **§12.4 밖**이면 `spec: null`과 `beyondSpec`(왜 그래도 내는가)을 함께 적는다.
3. `owner`는 `group`을 따른다 — 테마 규칙은 `themes`, 설계서 규칙은 `schema`. 케이스가 든다.
4. **이미 있는 판정을 나르는 규칙이면 `severity: null`.** 그러면 `lintIssue`의 인자 타입에서
   빠져 severity를 지어 넣는 코드가 **컴파일되지 않는다**(D4).
5. 구현을 잊으면 *"표를 덮는다"* 케이스가 죽는다 — 표에 줄만 더하고 지나가는 경로가 없다.

**새 패키지(`@wirebound/lint`)가 필요해지는 조건:** `renderer`를 봐야 하는 규칙이 생기는 날.
`themes`는 `renderer`를 볼 수 없으므로(§3.3) 그날 합치는 자리가 후보에서 빠진다.
**가장 가까운 후보가 §9의 파생 변형(`variantFrom`)이다** — 그 파생 규칙의 구현이
`packages/renderer/src/attrs.ts`에 있다.

---

## 9. 남긴 구멍 — 옮겨 적는다

| 무엇 | 다음 사람이 알아야 할 것 |
|---|---|
| ⑪이 **파생 변형**(`variantFrom` — `Text`·`Divider`·`Field`)을 안 본다 | 파생 규칙이 `renderer/src/attrs.ts`의 `variantOf`에 있고 `themes`가 그것을 볼 수 없다. 메우려면 그 규칙이 순수 스택에 **한 자리로** 서야 한다. **케이스가 *"안 본다"*를 고정해 두었으니** 메울 때 그 케이스를 뒤집어라 |
| ⑥의 표(`STRUCTURAL_GAPS`)가 둘뿐이다 | §12.4가 *"…등"*으로 열어 뒀다. 셋째를 더하려면 같은 근거가 서야 한다 — *"카탈로그가 자식 0을 허용하는데 그것 없이는 빈 상자다"* |
| ⑧에 `unknown-component`·`unknown-variant`를 함께 넣었다 | §12.4의 줄은 `structure`·`part`·`state` 셋만 적었다. **같은 대조의 결과**라 같은 줄에 뒀다는 판단이 `THEME_RULE` 표의 주석에 있다. 갈라야 한다고 보면 §12.4 밖 규칙으로 두어라 |
| `theme-other`가 `resolveTheme`의 코드 여덟을 받는다 | §12.4의 여섯 줄이 그 함수의 코드 전부를 덮지 않는다. **버리지 않고 나르는 쪽**을 골랐다 — 버리면 테마가 서지 않는 이유를 lint가 말하지 못한다 |
| lint가 **레이아웃 문서**를 안 본다 | `validateLayout`이 있고 스냅샷 payload가 레이아웃을 나르는데 §12.4에 그 줄이 없다. 더할지 판정하라 |
