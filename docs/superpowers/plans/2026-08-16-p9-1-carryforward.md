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

**payload와 필드 이름이 그대로 맞는 곳과 안 맞는 곳을 갈라 적는다.** 앞 판은 여기를
*"payload의 `pages`에 `target`만 없다"*처럼 적었고 **거짓이었다**(리뷰가 잡았다) — 이름도
nullable도 다르다.

| 절 | lint가 받는 모양 | payload에서 |
|---|---|---|
| `project.menu` | `{ id, parentId, title }` | `SnapshotMenuNode`에 **그대로 있다**(`sortOrder`가 더 있고 lint는 안 읽는다) |
| `project.pages` | `{ id, menuNodeId, title, target, document }` | `SnapshotPage`는 문서를 **`schema`**로 든다 — `document`로 **이름을 바꿔** 넣어야 한다. `target`은 payload에 아예 없다(아래 §2) |
| `project.comments` | `{ pageId, nodeId }` | `SnapshotComment`에 그대로 있다 |
| `themes[]` | `{ id, document, base?, pages? }` | `SnapshotLayoutTheme = { layoutId, themeId: string \| null, theme: Theme \| null }` — **`id`도 `document`도 없다.** 아래 ⓐ |
| `config` | 안 주면 명명 규칙이 **안 돈다**(D5) | `.wirebound.json` — **P9-2가 정한다**, 아래 §5 |

**ⓐ 테마 절을 채우려면 판정이 둘 필요하다.**

1. `LintThemeEntry.id`는 **필수 `string`**인데 `themeId`가 `null`일 수 있다. `null`은
   *"레이아웃이 테마를 안 골랐다"*이고 그때 `theme`도 `null`이라 검사할 문서가 없다 —
   **그 항목은 넣지 않는 것이 옳다.** `themeId`는 있는데 `theme`이 `null`인 경우도 있다
   (상속이 끊긴 파생 — `snapshot-payload.ts`가 적어 뒀다). 그때 무엇을 lint에 넣을지 정하라.
2. `layoutId`를 버릴지 `id`에 실을지. ⑪의 짝짓기가 레이아웃 단위라(아래 §4) **`layoutId`를
   `id`에 싣는 편이 출력이 읽힌다** — `wireb lint`가 *"어느 테마"*를 사람에게 말해야 한다.

**ⓑ `schemaVersion`을 잊지 마라.** `SnapshotPage.schemaVersion`이 있고 payload는 **저장된
문서를 그대로 담는다**(`snapshot-payload.ts`의 D4: *"캡처에서 `migrateDocument`를 돌리지
않는다"*). 오래된 버전의 문서를 마이그레이션 없이 lint에 넣으면 `document-invalid`가 쏟아진다.
`@wirebound/schema`의 `migrateDocument`·`CURRENT_DOCUMENT_VERSION`을 먼저 지나게 하라.
**`wireb pull` 출력을 그대로 넣으라는 지시만 읽고 가면 여기서 걸린다**(리뷰가 잡았다).

**ⓒ 깨진 문서를 걸러 낼 필요는 없다.** `root`가 없거나 `null`이거나 문서 자체가 `null`이어도
lint는 **던지지 않고 `document-invalid`를 낸다**(케이스로 고정했다). `JSON.parse` 결과를
그대로 넣어도 된다 — 예외를 CLI가 다루지 않는다.

---

## 2. **`pageTarget`을 공유 자리로 올려라** — 이 이월의 첫째 항목

`LintPage.target`은 *"이 페이지를 가리키는 §8.1의 타겟"*(`'page:관리자/회원/목록'`)이고
**필수**다. lint가 그것을 만들지 않고 받는다.

**이유:** 조립 규칙(`page:` + 조상 메뉴 이름들 + 페이지 제목을 `/`로 잇고 마디마다 공백을
걷는다)이 이미 있는데 **`apps/api/src/services/page-target.ts`에 산다.** 순수 함수인데
순수 패키지가 못 본다. P9-1이 그것을 `schema`에 다시 짜면 두 벌이 되고, **두 벌이 갈리는
날 lint가 멀쩡한 링크를 끊겼다고 말한다.**

**P9-2가 할 일 — 순서가 있다.**

**먼저 옮기고 그 다음에 `wireb lint`를 짜라.** 앞 판은 *"올리기 전까지 `wireb lint`는 타겟을
스스로 조립해야 한다. 그 임시 코드를 남기지 마라"*고 적었는데 **그 문장이 D1과 정면으로
부딪친다**(리뷰가 잡았다) — *"임시로 두 벌을 만들되 지워라"*는 지켜지지 않으면 정확히 D1이
막으려던 상태다. 순서를 바꾸면 두 벌이 아예 안 생긴다.

1. `pageTarget` · `pageBundleTitle` · `targetedPages` · `duplicateTargets` · `PAGE_TARGET_PREFIX`를
   `packages/schema`로 올린다.

   **⚠ `describePageTarget`이 그 상수를 쓰지 않는다.** 앞 판은 *"이미 그 접두를 안다"*고
   적었고 거짓이었다 — `interaction/describe.ts`의 `pageName`이 `'page:'` 리터럴을 **한 줄에
   두 번** 인라인한다(`startsWith('page:')` · `.slice('page:'.length)`). 상수만 올리면
   **접두가 세 자리**가 된다. **그 함수를 함께 고쳐라.**

2. `apps/api`의 `services/page-target.ts`를 **재수출로 바꾸거나 지우고** 호출자를 새 자리로
   돌린다. 호출자는 `services/export-bundle.ts`(`targetedPages`·`duplicateTargets`)와
   `routes/export.ts`(`bundle.duplicateTargets`) 둘이다. **두 벌로 남기지 마라.**

3. **⚠ `targetedPages`의 입력에 lint 입력형을 재사용하지 마라 — `sortOrder`가 없다.**

   `LintMenuNode`·`LintPage`는 그것을 **일부러 뺐다**(`lint/input.ts`: *"어느 규칙도 보지
   않으므로 없다"*). 그런데 `targetedPages`는 *"어떤 `TreeMenuNode[]`를 받아도 같은 답을
   내야 한다"*며 **형제 메뉴와 페이지를 `sortOrder`로 다시 정렬한다**(그 파일의 `visit`
   두 줄). 그 정렬이 §11.3의 *"번들의 좌측 트리가 웹 앱과 동일하다"*를 지키는 자리다.

   **평평하게 바꾸면서 `sortOrder`를 빠뜨리면 그 보증이 깨진다** — 파일 이름은 그대로
   나오고 순서만 입력 배열 순서가 된다. 옮길 때 **`sortOrder`를 든 별도 입력형**을 두어라
   (예: `{ id, parentId, title, sortOrder }`).

   **다만 조용히 깨지지는 않는다 — 이미 그것을 잡는 자가 둘 있다.** 앞 판은 여기를
   *"그 순서를 고정하는 케이스가 이미 있는지 먼저 확인하라"*로 미뤄 뒀는데, 리뷰가
   확인했고 나도 확인했다:

   | 어디 | 케이스 이름 |
   |---|---|
   | `apps/api/test/page-target.test.ts:181` | *"형제 순서는 sortOrder다 — 입력 배열 순서가 아니다"* |
   | 〃`:191` | *"하위 메뉴 형제 순서도 sortOrder다"* |

   둘 다 `sortOrder`를 **입력 배열 순서와 어긋나게** 준 트리를 넣어 결과 순서를 단언한다.
   즉 입력형을 바꾸며 그 필드를 빠뜨리면 **그 둘이 먼저 말한다.**

   **그러므로 이 둘을 지우지 마라.** `targetedPages`를 옮기면 그 케이스도 따라 옮겨야 하고,
   *"이제 lint 입력형을 쓰니까 이 케이스는 낡았다"*고 지우는 순간 §11.3의 보증을 지키는
   자가 0이 된다. **P9-1이 코드를 안 고치고 이월만 고친 근거가 이 둘이다** — 지금 옮기면
   P9-2가 옮길 때 두 벌이 생기는데, 그 사이를 이 케이스들이 막아 준다.

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

**이것은 구멍이 아니라 위임이다.** P9-1이 판정을 못 해서 남긴 것이 아니라, **모델에 답이
없어서** 값으로 받기로 정한 것이다. 아래 선택지 둘과 대가가 그 위임의 내용이고,
**고르는 것은 P9-2다.**

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

### ⚠ 두 절의 페이지를 짝 맞춰라 — 테마 절에만 있는 페이지는 **문서 결함을 아무도 말하지 않는다**

`ProjectLintInput`은 페이지를 두 곳에서 받는다 — `project.pages`(설계서 규칙)와
`themes[].pages`(⑪). **둘은 서로를 보증하지 않는다.**

`nodeVariantIssues`는 봉투가 깨진 문서를 **건너뛰기만 하고 이슈로 내지 않는다.** 문서의
결함은 설계서 규칙(`document-invalid`)이 낼 일이고, 테마 쪽이 함께 내면 그 규칙이 `themes`
소유로 새기 때문이다. 그 판단의 근거를 `walkable`의 머리말이 *"`lintProject`에서
`lintDesign`이 같은 페이지를 보고 이미 말한다"*로 적었는데, **그것은 호출자에 대한 가정이지
보증이 아니다.** 쟀다:

| 무엇을 넣었나 | `lintProject`가 낸 것 |
|---|---|
| 봉투가 깨진 문서를 **`themes[].pages`에만** | **`[]`** — 아무도 말하지 않는다 |
| 멀쩡한 문서를 **`themes[].pages`에만** | `["theme-node-variant:warning"]` — ⑪은 정상으로 돈다 |

**둘째 줄이 요점이다.** 그 배치가 막혀 있으면 첫째 줄은 못 만드는 상태인데, ⑪이 정상으로
도므로 **모델이 그 배치를 허용한다.**

**P9-2가 할 일:** `themes[].pages`에 넣는 페이지는 **전부 `project.pages`에도 넣어라.**
이월 §1이 둘 다 payload에서 채우라고 하므로 그대로 따르면 갈리지 않지만, 페이지를 걸러
넣는 최적화(*"이 테마가 입는 것만"*)를 하는 순간 걸러 낸 페이지의 문서 결함이 조용해진다.

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

**⚠ *"`warning`이 있으면 1"*을 고르면 아무 결함이 없는 프로젝트가 1로 끝난다.** 시스템 테마
다섯을 그대로 `lintThemes`에 넣어 쟀다(리뷰가 먼저 쟀고 내가 다시 쟀다 — 값이 같다):

| 테마 | lint 이슈 |
|---|---|
| `admin` · `saas-marketing` · `commerce` | 없다 |
| `portal` · `docs` | `theme-other:warning` 하나씩 — `components.Tree.parts.node.paddingX` |

그 둘은 `node-handle-overwrite`(*"테마가 노드 손잡이를 덮어쓴다"*)이고 **`resolveTheme`이
원래 내던 경고를 그대로 나른 것**이다 — lint가 지어낸 과잉 경보가 아니다. 다만
`portal`·`docs`를 고른 프로젝트는 **문서를 아무리 잘 써도 경고 하나로 시작한다.**

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
| ⑧에 `unknown-component`·`unknown-variant`를 함께 넣었다 | §12.4의 줄은 `structure`·`part`·`state` 셋만 적었다. **같은 대조의 결과**라 같은 줄에 뒀다. 갈라야 한다고 보면 §12.4 밖 규칙으로 두어라 — **어느 코드가 어느 줄로 가는지는 `packages/themes/test/lint-mapping.test.ts`가 통째로 못박으므로** 옮기면 그 케이스가 먼저 말한다 |
| `theme-other`가 §12.4 여섯 줄 밖의 테마 코드를 받는다 | 그 여섯 줄이 `resolveTheme`의 코드 전부를 덮지 않는다. **버리지 않고 나르는 쪽**을 골랐다 — 버리면 테마가 서지 않는 이유를 lint가 말하지 못한다. 목록은 `lint-mapping.test.ts`에 있다 |
| lint가 **레이아웃 문서**를 안 본다 | `validateLayout`이 있고 스냅샷 payload가 레이아웃을 나르는데 §12.4에 그 줄이 없다. 더할지 판정하라 |
| ④가 **겹치는 타겟**을 안 본다 | 두 페이지가 같은 `target`을 들면 `targets`(Set)에서 접혀 그 링크가 *"있다"*로 통과한다. `duplicateTargets`가 그 판정을 이미 갖고 있으니 §2를 끝낸 뒤 규칙을 더할지 판정하라 |
| **`themes[].pages`에만 있는 페이지**의 문서 결함을 아무도 말하지 않는다 | §4 마지막 절에 값과 함께 있다. `nodeVariantIssues`는 봉투가 깨진 문서를 건너뛰기만 하고, 그 결함을 내는 것은 `lintDesign`이라 `project.pages`에 없으면 침묵한다. **두 절의 페이지를 짝 맞추면 안 걸린다** |
