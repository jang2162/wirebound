# P4c-1 이월 사항 — 저작 UI(P4c-2)가 먼저 읽을 것

> **값마다 누가 쟀는지를 적는다.** *내가 쟀다* / *리뷰가 쟀다* / *앞 판에서 옮겼다* /
> *재지 못했다* 넷 중 하나다. **귀속 없는 값은 아직 아무도 안 잰 것이다.**

---

## 맨 먼저 — **문서·주석에서 여섯 사이클 연속 깨졌다**

**P4b-1 · P4b-2 · P4b-3 · 그 앞 · P4c-1 구현 · P4c-1 수정 웨이브.** 이 판의 기록은 이렇다:

| 언제 | 무엇 |
|---|---|
| P4c-1 구현 보고 | **내가 스스로 거짓 일곱을 찾았다** |
| 리뷰 | **여섯을 더 찾았다.** 다섯이 문서·주석, **하나(F1)는 코드**였다 |
| 수정 웨이브 첫 판 | **거짓을 세는 F6 표가 스스로 거짓이었다** — 리뷰가 준 다섯 중 `font-face.test.ts` 하나를 빠뜨리고 내가 따로 찾은 자리를 그 번호에 얹어, **수는 맞고 항목이 빠졌다** |
| 수정 웨이브 전수 훑기 | **둘을 더 찾았다**(⑧ `use-theme-css.ts` 머리말 · ⑨ `structure-css.test.ts`의 없는 파일 참조) |

**부류가 반복된다. 셋으로 갈린다:**

1. **한 파일에서 함수 본문만 고치고 머리말을 안 고친다.** `resolve/style.ts`가 그랬고
   (`resolveStyleValue` 머리말은 고치고 `styleDeclarations` 머리말은 안 고쳤다),
   `use-theme-css.ts`가 **똑같이** 그랬다(`compile`의 분기는 고치고 파일 머리말은 안 고쳤다).
   **같은 커밋 안에서 나는 실수다.**
2. **단언은 통과하는데 이름·주석만 낡는다.** `resolve.test.ts`·`font-face.test.ts`·
   `emit.test.ts` 셋이 *"이슈가 있으면"* → *"`error`가 있으면"*의 같은 부류였고,
   **셋 다 케이스가 쓰는 값이 `error`라 초록이었다.** 회귀가 못 잡는 부류다.
3. **소스가 없는 파일을 가리킨다.** F4(`themes-warning-routes.test.ts`)와
   ⑨(`var-names.test.ts`) 둘. **후자는 P4c-1이 만든 것이 아니라 `05bfd1a`부터 있었다**
   (내가 이력으로 확인했다).

**3번은 자동으로 잡을 수 있고 이번에 그렇게 잡았다** — 소스에 적힌 `*.test.ts(x)` 이름을
전부 뽑아 실재를 대조하는 한 줄짜리 훑기다. **P4c-2는 이것을 케이스로 만들 자리를
생각해 볼 만하다**(오늘은 안 만들었다 — 범위 밖이었다).

---

## 1. **`primitives` 어휘가 열렸다 — 이름공간 드롭다운이 자리마다 다르다**

**저작 UI의 값 편집기가 이름공간 목록을 낼 때 자리마다 고를 수 있는 것이 다르다.**
이것이 P4c-2가 이 슬라이스에서 받는 가장 직접적인 입력이다.

| 자리 | 고를 수 있는 이름공간 | 어디서 오나 |
|---|---|---|
| **컴포넌트 스타일** (`components.*.base/parts/variants/states`) | **토큰 7 + primitives 3 = 열** | `TOKEN_NAMESPACES`(`resolve/tokens.ts`) + `STYLE_PRIMITIVE_NAMESPACES`(`resolve/style.ts`) |
| **`primitives` 값** (`primitives.container.maxWidth` 등) | **토큰 7만.** primitives를 고르면 `bad-style-value`(**error**) | `checkPrimitives`가 `resolveStyleValue`를 **primitives 인자 없이** 부른다 |
| **`breakpoints`** | **어느 자리에도 없다** | 아래 |

**오늘의 값(내가 쟀다):**

- `TOKEN_NAMESPACES` = `palette` · `semantic` · `space` · `radius` · `shadow` ·
  `typography` · `motion` — **일곱**
- `STYLE_PRIMITIVE_NAMESPACES` = `container` · `grid` · `section` — **셋**

**드롭다운을 하드코딩하지 마라.** 둘 다 `@wirebound/themes`가 내보내는 상수이고, 늘어나면
UI가 따라가야 한다. `primitives`의 그룹 이름은 `primitiveGroups()`로도 읽을 수 있다
(`apps/web/test/theme/system-theme.test.ts`가 그렇게 쓴다).

**`breakpoints`가 빠진 이유는 방출이다**(재라 #1). `compileTheme`의 `:root`는 `tokens` +
`primitives.values` 둘만 돌고, `checkPrimitives`는 브레이크포인트를 `values`가 아니라
**수로 따로** 낸다 — **`--wb-breakpoints-md`라는 변수가 존재하지 않는다.** 열면 `var()`가
빈 값으로 풀려 선언이 조용히 죽는다. **UI가 그 이름을 제안하면 사용자를 함정에 빠뜨린다.**

**`gridColumns`는 여전히 참조를 안 받는다** — `primitives.grid.columns`(사이트의 12칼럼)와
컴포넌트의 열 수는 다른 축이라는 P4a-2의 판정이 그대로다.

### 1-①. **primitives 값의 오타는 이제 경고를 낸다** (리뷰가 낸 항목 — **고쳤다**)

리뷰가 넘긴 원문은 *"F1을 고치기 전에는 primitives 값의 오타가 아무 경고도 안 낸다"*였다.
**F1이 그 고침이고 이 웨이브에서 닫혔다.**

| | 고치기 전 | 지금 |
|---|---|---|
| `checkPrimitives({container:{maxWidth:'spce.4'}})` | **이슈 0건** | **1건** `suspicious-literal` / `warning` / `primitives.container.maxWidth` |
| `resolveTheme` | 이슈 0건, `theme` 非-null | **1건**, `theme` 非-null(경고라서) |
| 저장 | 201 | **201 그대로** — 경고는 막지 않는다. 응답 `warnings`에 실린다 |
| `:root` | `--wb-container-maxWidth: spce.4;` 조용히 | 같은 CSS + **경고** |

**전부 내가 쟀다.** 구분력은 아래 §6.

**그러므로 값 편집기의 primitives 패널과 컴포넌트 스타일 패널은 이제 같은 검증을 받는다** —
단 **어휘는 다르다**(위 표). 그리고 **severity는 갈라 두지 않았다**: primitives의
`suspicious-literal`도 `warning`이다. **판정과 근거 셋은 `spec/primitives.ts`의 머리말에
있다** — 요지는 ㉠ 한 코드는 한 severity라는 것이 이 패키지의 불변식이고, ㉡ `error`로
올릴 실측(이 층의 값 전수 거짓 양성 0건)을 **아직 아무도 재지 않았고**, ㉢ 시스템 테마에는
`system-unresolved-literals.test.ts`의 0-가드가 둘째 그물로 이미 있기 때문이다.

> **P4c-2가 이 판정을 뒤집을 수 있다.** 저작 UI가 primitives 값 편집기를 만들면 **그 자리의
> 값 전수**가 생긴다. 거짓 양성 0건을 **측정**하면 전용 `error` 코드가 정당해진다.

---

## 2. **`warning` 채널이 열렸다 — 저작 UI가 그것을 보여 줄 자리다**

**P4a-2 재라 #12(*"이슈는 콘솔에만"*)는 저작 UI에서는 성립하지 않는다.** 그 판정은
*"캔버스에 뿌리면 근원 하나를 나머지가 가린다"*를 근거로 했고(토큰 하나를 어긋내면 이슈
6건이 나는 것을 그때 쟀다), **그 근거는 캔버스에 대한 것이다.** 저작 UI는 이슈를 보여 주는
것이 자기 일인 화면이다.

### 첫 둘

| 코드 | 언제 | 무엇이 일어나는가 | 사용자가 무엇을 해야 하나 |
|---|---|---|---|
| **`suspicious-literal`** | 값이 참조처럼 생겼는데 이름공간이 목록 밖 (`"spce.4"`) | 값이 **적힌 그대로** CSS에 실린다. 테마는 선다 | **오타면 고친다. 리터럴로 의도했으면 그대로 둔다** — 이 코드는 판정이 확실하지 않다는 것 자체가 성질이다 |
| **`node-handle-overwrite`** | 테마 스타일이 같은 셀렉터에서 **노드 손잡이**가 내는 CSS 프로퍼티를 낸다 | §6.5대로 **테마가 이긴다.** 결함은 그것이 조용하다는 것뿐이다 | *"이 노드에서 고른 값이 안 먹는다"*의 원인을 여기서 본다 |

**둘의 차이가 UI 설계를 가른다.** 첫째는 *"고칠 것일 수 있다"*이고, 둘째는 ***"의도된
동작이고 알림일 뿐이다"*** — 둘을 같은 빨간 배지로 내면 둘째가 소음이 된다.

### 어디서 받는가 — **두 채널이고 모양이 다르다**

| 채널 | 무엇 | 계약 |
|---|---|---|
| **저장 응답** | `POST /:projectId/themes` · `PUT /:projectId/themes/:themeId` | 저장된 테마에 경고가 있으면 응답에 **`warnings: ThemeIssue[]`**가 붙는다. **없으면 키 자체가 없다.** 페이지 쪽 `PUT .../schema`와 같은 형식이고 만드는 함수도 하나다(`apps/api/src/http/warnings.ts`) |
| **클라이언트 계산** | 캔버스 | `GET /:projectId/theme`은 `warnings`를 **안 싣는다.** 소비자가 `resolveTheme`을 직접 돌린다 |

**읽기(`GET`)와 목록이 `warnings`를 안 내는 것은 판정이다**(재라 #4) — 그 라우트들은 테마를
해석하지 않고, 서버가 두 번째로 계산해 실으면 두 결과가 갈릴 자리가 생긴다. **경고를
알아야 하는 클라이언트는 받은 `theme`(파생이면 `base`와 함께)에 `resolveTheme`을 직접
돌린다.** `@wirebound/themes`는 브라우저에서 돈다.

**계약 문서는 `apps/api/README.md`다** — 이 웨이브에서 F5로 고쳤다(그 전까지 *"응답은 네
키"*라고 적혀 있었고 거짓이었다). 지금은 **바탕 네 키 + 조건부 둘(`base`·`warnings`)**로
적혀 있고, 경고인 테마 이슈 둘의 표도 거기 있다.

### 캔버스가 경고를 보는 사슬 — **오늘 살아 있다**

```
canvas.tsx:84 → useProjectTheme → GET /:projectId/theme
                                  (병합 끝, extends 빠진 홀로 서는 테마)
              → use-theme-css.ts 의 compile 이 base 없이 resolveTheme
              → error 면 CSS 비움 + console.error
              → warning 만이면 CSS 그대로 + console.warn   ← P4c-1이 연 자리
```

**리뷰가 이 사슬을 짚었다(그쪽이 쟀다).** **여기가 P4c-2가 경고 UI를 붙일 지점이다.**
오늘은 콘솔뿐이고 화면에 아무것도 없다 — **그것이 재라 #12의 판정이었고, 저작 UI가
그 판정의 유효 범위 밖이다.**

> **F3에서 그 `console.warn`에 케이스를 붙였다.** 리뷰가 *"지워도 2442/2442 초록"*이라고
> 쟀고(**그쪽이 쟀다**), 지금은 케이스 둘이 지킨다 — 경고 있는 테마 + **대조군**(경고
> 없으면 콘솔에 아무것도 안 남는다). `warn`과 `error`를 함께 감시해 *"경고가 오류로 새지
> 않았다"*까지 본다. **콘솔 감시는 이 저장소의 형식이다**(`use-project-theme.test.tsx`·
> `theme-picker.test.tsx`가 같은 방식).

---

## 3. **`display`를 덮으면 `Flex`의 손잡이 넷이 조용히 죽는다** — 경고가 안 난다

**리뷰가 냈다(그쪽이 쟀다). 내 보고서에 없던 항목이다.**

테마가 `Flex`의 `display`를 덮으면 `flex-direction`·`align-items`·`justify-content`·
`flex-wrap` 넷이 **값은 남은 채 무력화되고 경고가 안 난다.**

**T4의 손잡이 모델이 이 부류를 못 잡는다** — 그 모델은 *"같은 프로퍼티를 덮어썼다"*를
보는데, 이것은 **다른 프로퍼티가 그 넷의 효력을 없애는** 것이다.

**그리고 §6.0이 의도한 동작이다** — `cascade.test.tsx`가 일부러 그렇게 한다. 즉 막을 것이
아니다.

> ***"노드에서 direction을 골랐는데 안 먹는다"* 문의가 여기서 온다.** 저작 UI가 그 물음을
> 받을 화면이므로 적어 둔다.

---

## 4. **다섯 테마에 아직 남은 "손으로 맞춘 값"** — 저작 UI가 사람에게 물을 자리

**내가 쟀다**(구현 보고 §재지 못한 것 7). `container.maxWidth`만 참조로 고쳤다.

| 손으로 맞춘 자리 | 같은 값을 가진 primitives 경로 | 몇 테마 |
|---|---|---|
| `Section.base.paddingY` | `section.paddingY` | **5/5** |
| `Section.parts.inner.paddingX` | `container.gutter` | **5/5** |

**이것들은 오늘 닫은 결함이 아니다** — 양쪽이 **토큰 참조**라 무효 선언이 아니고 CSS는
정상으로 나간다. **값이 우연히 같을 뿐**이다.

**primitives로 라우팅할지는 테마마다의 디자인 판단이다.** *"섹션 여백이 사이트의 세로
리듬을 따라야 하는가, 아니면 이 컴포넌트만의 값인가"*는 도구가 정할 수 없다. **P4c-2의
저작 UI가 그 선택을 사람에게 물을 자리다** — *"이 값이 `section.paddingY`와 같습니다.
연결할까요?"*가 그 모양이다.

---

## 5. **컨테이너 폭 5종 중 둘은 어느 케이스도 못박지 않는다**

**리뷰가 냈고(그쪽이 쟀다) 내가 다시 쟀다 — 재현됐고 하나를 더 봤다.**

| 테마 | `primitives.container.maxWidth` | 못박는 케이스 |
|---|---|---|
| `admin` | 1440px | **있다** — `system-unresolved-literals.test.ts:123` · `saas-marketing.test.tsx:506` (리뷰의 목록에 없던 것. **내가 쟀다**) |
| `saas-marketing` | 1200px | **있다** — `saas-marketing.test.tsx:507,539` |
| `docs` | 720px | **있다** — `docs-theme.test.tsx:179` |
| **`portal`** | **1280px** | **없다** |
| **`commerce`** | **1200px** | **없다** |

**값 편집기가 그 둘을 바꿔도 아무것도 안 죽는다.** *(주의: `1200px`·`1280px`을 grep하면
케이스가 걸리지만 전부 픽스처(`fixtures/minimal.ts`·`emit.test.ts`)이거나 캔버스 프레임
폭이다 — **그 테마의 값을 못박는 것이 아니다.** 내가 하나씩 열어 확인했다.)*

**기준(`45771e9`)에서도 그랬으므로 이 슬라이스의 회귀는 아니다.** 그래도 남긴다 — 저작
UI가 테마 값을 편집하게 되는 순간 이것이 *"고쳤는데 아무도 안 막아 준다"*가 된다.

---

## 6. **F1의 구분력 — 재현 가능한 형태로**

리뷰어의 재검증을 위해 절차를 그대로 적는다. **내가 쟀다.**

**변조 대상:** `packages/themes/src/spec/primitives.ts`의 `checkPrimitives` 안 `put`.

```ts
// 지금 (고친 것)
issues.push(...resolved.issues)
if (resolved.value === null) return

// 변조 (P4c-1 커밋이 만든 침묵으로 되돌린다)
if (resolved.value === null) {
  issues.push(...resolved.issues)
  return
}
```

**절차:** python 치환으로 심고 → `git diff --stat`과 grep으로 **심어졌는지 먼저 확인** →
`pnpm test` 전체 → 같은 방식으로 복구 → 다시 확인. **`git checkout --`은 쓰지 않았다.**

**결과 — 전체 스위트(136파일 / 2449케이스) 기준:**

```
Test Files  1 failed | 135 passed (136)
     Tests  2 failed | 2447 passed (2449)

FAIL packages/themes/test/primitives-reference.test.ts
  > F1 — primitives 값의 경고가 버려지지 않는다
      AssertionError: expected [] to deeply equal [['suspicious-literal','warning',…]]
  > F1 — 그 경고가 resolveTheme까지 올라온다
      AssertionError: expected [] to deeply equal [['warning','suspicious-literal',…]]
```

**관측값이 `[]`인 것이 요점이다** — 실패의 모양이 *"값이 틀렸다"*가 아니라 **침묵 그
자체**다. **2 케이스 / 1 파일.**

> **범위 표기가 이 웨이브의 수정 하나다.** 첫 보고의 구분력 다섯은 변조마다 잰 범위가
> 달라(`--project unit --project web`이거나 파일 하나) 수를 나란히 읽을 수 없었고, 리뷰가
> *"보고서는 3/1인데 전체로는 6/2"*라고 짚었다(**그쪽이 쟀다**). **지금 보고서의 여덟은
> 전부 `pnpm test` 전체 범위다.**

---

## 7. **P4b-3 이월이 넘긴 것 중 아직 안 닫힌 것** — 전부 **범위 밖이었다**

사용자가 P4c-1의 범위를 셋(primitives 어휘 · warning 채널 · 손잡이 경고)으로 정했다.
아래는 **그 셋에 안 들어가서 안 닫힌 것**이지 판단이 바뀐 것이 아니다.

| # | 무엇 | 상태 | 왜 아직 |
|---|---|---|---|
| **1** | **벽 2 — `parts` 중첩 누수** (P4b-3 이월 §D 벽 2. **우선순위 1위**) | **그대로.** 오늘 실제로 새고 있다(P4b-3의 Chromium 실측 — **그쪽이 쟀다**) | 범위 밖. 후보 `data-wb-owner`가 **특이도를 안 바꾸고** 결합자를 없앤다는 판정도 그대로다 |
| **2** | **`placeholder.style`** (§E.6) | **그대로.** 다섯 중 둘(`saas-marketing`·`commerce`)이 `'photo'`를 선언했고 **아무 일도 안 일어난다** | 범위 밖. **미구현이지 설계 공백이 아니다**(§6.7이 명시했다). 비용은 `theme-structures.ts`에 값 하나를 더 얹는 것 |
| **3** | **벽 1 — 구조 선택이 컴포넌트 타입 단위** | **그대로.** §16의 입력을 오염시키고 있다 | 범위 밖이고 **P4c보다 크다** — `structure`(표현)/`kind`(내용) 분리는 §5.1과 §6.11을 함께 건드린다 |

**벽 3(손잡이)은 이 슬라이스가 닫았다** — P4b-3 이월이 *"warning 채널이 생기는 날 함께
붙인다"*고 적어 둔 그 날이 오늘이었고, `node-handle-overwrite`가 그것이다.

> **벽 2와 warning 채널의 관계:** P4b-2 이월 §5의 셋째 후보(*"테마 이슈로 알리기"*)가
> **이제 성립한다** — 채널이 생겼기 때문이다. 벽 2를 닫을 때 그 후보의 비용이 채널 신설을
> 포함하지 않는다.

---

## 8. 재지 못한 것 — 정직하게

이 웨이브가 **새로 재지 못한 것**만 적는다(구현 보고 §재지 못한 것이 그대로 유효하다).

1. **⑧·⑨ 두 수정의 구분력.** 둘 다 **주석뿐**이라 변조해도 아무 케이스가 안 죽는다 —
   그것이 이 부류가 다섯 사이클 연속 새는 이유다. **회귀가 지키지 않는다.**
2. **F2의 소스 훑기 가드가 `packages/themes/src` 밖은 안 본다.** `apps/api`·`apps/web`에서
   누가 `severity !== 'warning'`을 손으로 쓰면 그 케이스는 안 죽는다. **오늘 그 밖에서
   `severity ===`를 쓰는 자리는 둘이고 둘 다 정당하다**(내가 grep으로 확인했다):
   `packages/schema/src/validate.ts:127`은 **`partitionIssues` 자신**이고,
   `apps/api/src/services/edit-pipeline.ts:107`은 **주석**이다.
   **전자가 가드를 한 패키지로 좁힌 이유이기도 하다** — 글롭을 넓히면 규칙의 유일한
   구현자 자신이 위반자로 걸린다. 넓히려면 그 파일을 예외로 이름 지어 빼야 하고,
   그러면 예외 목록이 썩는 자리가 새로 생긴다. **판단이 필요한 확장이지 한 줄이 아니다.**
3. **`suspicious-literal`이 못 잡는 두 형태는 그대로다** — ㉠ 좁은 문자 집합 밖의 이름
   (`layout.최대폭`), ㉡ 값 **안쪽**에 섞인 오타(`'10px spce.4'`). primitives 층에서도 같다.
4. **api 서버를 프로세스로 띄운 스모크.** 케이스가 `withApi`로 진짜 Fastify 앱을 세우므로
   라우트·플러그인은 덮이지만 `pnpm --filter @wirebound/api dev`는 안 돌렸다.
5. **"없는 테스트 파일 참조"를 지키는 케이스.** 이번에 손으로 훑어 ⑨를 찾았고 **자동화할
   수 있다는 것까지 확인했지만 케이스로 만들지는 않았다** — 범위 밖이었다.
