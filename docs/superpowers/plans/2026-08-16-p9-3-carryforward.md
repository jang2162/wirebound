# P9-3 이월 — 주 독자는 **P9-4(MCP 도구 다섯 + 스킬)**다

> 보고: `2026-08-16-p9-3-report.md` · 계획: `2026-08-16-p9-3-cli-read.md`

P9-3이 세운 것은 **순수 스택의 읽기 면**이다. `wireb page get`·`lint`·`export`가 그 위에서
글자만 만든다. **P9-4의 도구 다섯 중 셋이 같은 함수를 부른다** — 아래는 부르기 전에 알아야
하는 것과, 갚아야 하는 빚이다.

---

## 1. P9-4가 부를 이름 — **다시 짜지 마라**

이 슬라이스의 존재 이유가 그것이다. §12.2의 도구와 §12.3의 명령이 **같은 함수**를 부른다.

| 도구(§12.2) | 부를 이름 | 어디 |
|---|---|---|
| `list_pages` | `targetedPages({ menu, pages })` | `@wirebound/schema` |
| `get_page` | `pageView(input)` | `@wirebound/schema` |
| `validate` | `snapshotToLintInput` → `lintProject` → `filterLintIssues` | `@wirebound/themes` · `@wirebound/schema` |

`packages/cli/src/commands/page-get.ts`·`lint.ts`가 **그 조립을 이미 한 벌 갖고 있다.**
베끼지 말고 그 파일을 읽어라 — 무엇을 어느 순서로 부르는지가 거기 있다.

### 반드시 지켜야 하는 셋

1. **`installCatalog()`는 소비자가 부른다.** `snapshotToLintInput`도 `pageView`도 안 부른다
   (순수 변환 함수가 프로세스 전역을 만지면 부르는 쪽이 그것을 모른 채 지나간다).
   **안 부르면 결과가 통째로 거짓이 된다** — 실측: 모든 노드가
   `document-invalid:error 알 수 없는 컴포넌트 타입: Page`가 되고, 전부 `error`라 종료 코드까지
   뒤집힌다. 문장도 나빠진다(`로딩 상태` → `loading`).
2. **`snapshotToLintInput`의 `notes`를 버리지 마라.** 그것이 *"검사에서 빠진 것"*이다 —
   테마를 안 고른 레이아웃 · 상속이 끊긴 파생 테마 · 레이아웃이 둘이라 안 돈 ⑪ ·
   못 올린 문서 버전 · 메뉴를 잃은 페이지. **버리면 그 전부가 *"결함 0건"*으로 위장된다.**
   MCP 응답에 실을 자리를 만들어라.
3. **`LintIssue.themeId`에 담기는 것은 레이아웃의 id다** — 테마 행의 id가 아니다.
   `snapshotToLintInput`의 판정 ⓑ이고 근거는 그 파일 머리말에 있다. 사람이 읽는 자리에
   `테마 <id>`라고 쓰면 **없는 행을 찾으러 간다** — `wireb lint`는 `레이아웃 <id>`라고 쓴다.
   **더 읽히는 이름(테마 slug)을 넣고 싶으면 그때 판정하라.**

---

## 2. `revisions.actor_type` · `actor_label` — **여전히 열려 있다. 이번에도 안 닫았다**

**P9-2 이월 §4가 그 자리를 소유한다. 여기 다시 쓰지 않는다 — 거기로 가라.**

거기 있는 것을 이름으로만 가리킨다:

- `actor_type`이 `'user' | 'mcp' | 'cli'`를 담을 수 있는데 **채우는 경로가 없다**는 것과,
  가르려면 값이 하나 더 필요하다는 것(후보 둘과 각각의 대가가 그 문서의 표에 있다).
- `actorLabel`이 §10과 어긋나 있다는 것(설계서가 `actor_label='<토큰명>'`을 이미 정했는데
  오늘은 사람 이름이 적힌다).
- **그 둘을 한 커밋에서 닫으라는 근거** — 따로 하면 이력에 *"누가 고쳤나"*가 **두 규칙으로
  적힌 구간**이 남는다. 그 구간은 나중에 어느 쪽 규칙으로 읽어야 하는지 아무도 모른다.

**왜 P9-3이 안 닫았나:** 이 슬라이스는 **읽기뿐이다.** 세 명령 중 어느 것도 `revisions`에
행을 만들지 않으므로 `actorType`을 채울 자리 자체가 없었다.

**P9-4가 그 자리다.** `patch_page`와 `add_comment`가 편집을 쓰므로 그때 값이 필요해진다.
`request.authKind`가 `'token'`인 것은 이미 알지만 **토큰만으로는 `cli`인지 `mcp`인지 모른다.**

---

## 3. 정규식 원문의 신뢰 경계 — **경계가 바뀌는 날이 P9-4다**

P9-1 이월 §5.2가 물었고 P9-2 이월 §2가 *"MCP가 같은 설정을 받게 되는 날 다시 봐라"*로
넘겼다. **P9-3도 안 닫았다 — 그리고 그 이유가 그대로 P9-4의 조건이다.**

- **오늘 그 값을 주는 것은 리포의 파일이다.** `.wirebound.json`의 `lint.naming.page`·
  `lint.naming.menu`를 `wireb lint`가 읽고 `lintDesign`이 `new RegExp(source)`로 컴파일한다.
  `wireb`는 **개발자가 자기 리포의 파일을 읽는 도구**라 그 값이 신뢰 경계를 넘지 않는다.
- **`readLintConfig`가 모양만 본다**(`packages/cli/src/binding.ts`). 문자열인지만 보고
  **컴파일하지 않는다** — 못 읽는 정규식은 `lintDesign`이 `naming` 이슈로 내고, CLI가 먼저
  죽이면 *"규칙 하나가 잘못 적혔다"*가 *"명령이 서지 못했다"*가 되어 **나머지 규칙의 결과까지
  사라진다.**
- **P9-4에서 무엇이 달라지나:** MCP는 **세션이 값을 준다.** 에이전트가 만든 문자열이
  `new RegExp`에 들어가면 그때 경계가 넘어간다. 재는 것은 **길이 상한 · 백트래킹 · 타임아웃**
  중 무엇을 걸지이고, **정하려면 `LintConfig`의 값을 누가 주는지부터 정해야 한다** —
  MCP가 `.wirebound.json`을 읽는가(그러면 오늘과 같다), 세션이 인자로 주는가.

---

## 4. §7.4의 *"MCP는 REST로 들어오고 잠금을 걸지 않는다"* — **P3-3 이월 §3.1이 다시 보라고 했다**

그 판정은 **P3-3 이월의 §3.1이 소유한다**(`2026-08-16-p3-3-carryforward.md`). 거기 제목이
*"MCP는 잠금을 걸지 않지만 **남의 잠금에는 막힌다** — 이 판정을 다시 보라"*이고, 무엇이
막히고 무엇이 안 막히는지가 값과 함께 그 절에 있다. **여기 베끼지 않는다.**

**P9-1 이월 §7이 *"lint는 읽기 전용이라 그 물음에 걸리지 않는다 — 그 판정은 `patch_page`에서
하라"*고 적었고, P9-3이 그것을 확인한다:** 이 슬라이스의 세 명령은 전부 읽기라 잠금과 만나는
자리가 없었다. **`patch_page`가 그 자리다.**

---

## 5. `wireb`를 늘릴 때 걸리는 자리 — P9-2 이월 §5의 표에 더한다

그 표(`2026-08-16-p9-2-carryforward.md` §5)가 여전히 유효하다. **세 번 다 `no-token-in-repo`가
먼저 죽었다**(명령마다 1건씩 — 보고서 §9). 새로 알게 된 것만 적는다.

| 무엇 | 어디 | 왜 걸리나 |
|---|---|---|
| **`Io`에 필드를 더하면 가짜도 함께 고쳐야 한다** | `test/fake-io.ts` | `HttpResponse.bytes()`를 더했더니 `pnpm typecheck`가 가짜에서 먼저 죽었다. **타입이 그 자리를 지킨다** — P9-2 리뷰 N2가 잰 것과 같은 부류이고, 이번엔 컴파일러가 잡았다 |
| **`text()`와 `bytes()`를 둘 다 부르면 진짜 `Response`에서 깨진다** | `src/client.ts` | 본문은 한 번만 읽힌다. `callApiBytes`가 **2xx면 `bytes()`, 아니면 `text()`**로 갈라 부른다 |
| **`export`의 census는 `-o`가 리포 안을 가리켜야 값이 있다** | `test/no-token-in-repo.test.ts` | 바깥으로 겨누면 훑기가 **아무것도 안 훑는다** |
| **`packages/cli`가 이제 워크스페이스 둘과 `fflate`를 의존한다** | `packages/cli/package.json` · `tsconfig.json` | `tsconfig.json`에 `references`가 없으면 `tsc --build`가 소스를 이 프로그램의 옵션으로 컴파일한다 |

---

## 6. 남긴 구멍 — 옮겨 적는다

| 무엇 | 다음 사람이 알아야 할 것 |
|---|---|
| **`lint`가 겹치는 타겟을 안 본다** | P9-1 이월 §9가 적었고 **스모크가 실재를 보였다**(보고서 §7 ⓒ): 같은 메뉴에 같은 제목의 페이지 둘을 만들면 `wireb page get`은 *"2개입니다"*라고 말하는데 `wireb lint`는 침묵한다. **이제 `duplicateTargets`가 순수 스택에 있어 규칙을 더할 수 있다.** 더하면 §12.4 밖 규칙이므로 `spec: null`과 `beyondSpec`을 함께 적어야 한다(P9-1 이월 §8) |
| **`사라진 노드` 문자열이 세 자리에 있다** | `packages/schema/src/interaction/describe.ts`(이제 `MISSING_NODE_NAME`으로 나간다) · `packages/exporter/src/bundle/comments.ts`의 `MISSING_NODE_LABEL` · `apps/web/src/panels/comment-panel.tsx`의 `MISSING_NODE`. **P9-3은 넷째를 안 만들었다** — `page-view.ts`가 첫째를 import한다. 남은 둘을 그리로 돌리는 것은 이 슬라이스 밖이었다(`apps/web`을 안 건드린다) |
| **`wireb lint`에 `--json`이 없다** | §12.3에 그 줄이 없어 안 만들었다. **P9-4는 그 값을 CLI가 아니라 함수에서 직접 받으므로 급하지 않다** — 만들려면 §12.3에 줄을 더하는 판정이 선다. `LintIssue`는 평평해서 그대로 JSON이 된다(P9-1 이월 §7) |
| **`filterLintIssues`가 `pageIds`만 받는다** | P9-1 이월 §6이 `--rule`·`--severity` 거르개를 예고했는데 **쓸 자리가 없어 안 만들었다**(죽은 코드가 된다). 더할 자리는 `packages/schema/src/lint/filter.ts` 하나이고, **CLI에 두지 마라** |
| **경로를 골랐을 때 `pageId: null` 이슈가 빠진다** | 테마 이슈와 메뉴 이름 이슈가 그렇다. **빠진 개수를 부르는 쪽이 말해야 한다** — `wireb lint`가 *"전체 N건 중 M건"*을 내는 것이 그 자리다. MCP도 같은 것을 해야 한다 |
| **`ApiRequest.method`에 `PATCH`가 없다** | `packages/cli/src/client.ts`의 유니온이 `GET`·`POST`·`DELETE`뿐이다(P9-2 이월 §1이 예고했다). `patch_page`가 그 줄을 더할 자리다 |
| **`payloadVersion`이 높으면 막지 않고 말한다** | `fetchSnapshot`이 stderr로 경고만 하고 계속한다. 막으면 **새 서버에 붙은 옛 CLI가 아무것도 못 읽는다**(`snapshot/payload.ts`의 D3). MCP도 같은 태도를 쓸지 정하라 |
| **Windows 경로** | P9-2 이월 §6 그대로. `packages/cli/src/paths.ts`가 POSIX 문자열 조작만 한다. **`export`가 그 표면을 넓혔다** — 이제 CLI가 디렉터리 트리를 만든다. 압축 안의 역슬래시·드라이브 경로는 **거부한다**(그쪽으로 새지 않게 막은 것이지 다루는 것이 아니다) |
| **`export`가 zip을 통째로 메모리에 올린다** | `unzipSync`가 그렇다. 오늘 번들이 작아서 안 걸린다(스모크에서 6파일). 페이지가 수백 개인 프로젝트에서 재 본 적이 없다 — P9-2 이월 §4의 *"비용을 안 쟀다"*와 같은 부류다 |

---

## 7. 값이 있는 관측 하나 — **받는 쪽의 `unzip`이 한글 이름을 깬다**

보고서 §7 ⓑ에 값이 있다. 요지: `fflate`가 비-ASCII 이름 항목에만 UTF-8 플래그(general
purpose bit 11)를 세우는데, **macOS 기본 `unzip`(Info-ZIP 6.00)이 그 플래그를 안 본다** —
`pages/관리자-회원-목록.html`이 깨진 이름으로 나오고 파일 생성이 실패했다. `wireb export`는
`fflate`로 풀므로 그대로 나온다.

**P9-4에게 걸리는 자리:** MCP가 번들을 내주는 도구를 만들게 되면(§12.2에 오늘 그 줄이 없다)
**바이트를 그대로 넘기는 것과 푼 파일을 넘기는 것이 사용자에게 다른 결과를 준다.**

---

## 8. 안 다룬 것 — 근거와 함께

| 무엇 | 왜 |
|---|---|
| **MCP 도구 다섯과 스킬** | P9-4. §12.2·§12.5 |
| **`wireb lint`가 `pull`의 출력 파일을 읽는 길** | D7이 **안 열었다.** 열려면 *"언제 뜬 것인가"*(`capturedAt`)를 출력이 말해야 한다. `.gitignore`에 `wirebound-snapshot.json`을 넣을지도 그때 다시 본다(P9-2 이월 §6) |
| **`resolveThemeBase` 승격** | P9-1 이월 §3이 P9-2에게 물었고 P9-2도 P9-3도 안 했다. **`lint`가 그것 없이 돈다** — `base`를 안 주면 `resolveTheme`이 `bad-extends`를 낸다. 다만 *"못 찾았다"*와 *"안 줬다"*를 가르지 못한다. **스냅샷 payload는 병합된 결과를 담으므로 `wireb lint`에는 그 물음이 아예 안 생겼다**(파생이 안 풀린 것은 `theme: null`로 오고 `notes`가 그렇다고 말한다) |
| **토큰 수명·회전** | §10에 줄이 없다. P9-2 이월 §4 그대로 |
| **`wireb logout` · `token ls`** | §12.3에 줄이 없다. P9-2 이월 §6 그대로 |
| **P3-3 이월 §5의 열두 자리** | P3의 뒷정리다 |
