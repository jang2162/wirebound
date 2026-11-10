/**
 * **내보내기의 CPU 몫을 이벤트 루프 밖에서 돈다** — 워커 스레드 풀. 라우트(`routes/export.ts`)가 부른다.
 *
 * ---
 *
 * # 왜 루프 밖인가
 *
 * 조립 · 렌더 · 압축은 순수 CPU 이고 크기에 비례한다. 메인에서 돌면 그동안 **이 프로세스의 다른 요청이 전부 선다** —
 * 트랜잭션 안에서 다음 문장을 기다리던 옆 사람의 편집은 그 멈춤을 «트랜잭션 안의 쉼»으로 겪고, 그 쉼이 서버의
 * `idle_in_transaction_session_timeout`을 넘으면 서버가 그 세션을 끝낸다(→ 503 «모름» · 커밋 0 — `db/client.ts`의
 * `createPool` 머리말 «이 값들이 정당한 일을 끊는 판» 표). 워커로 옮기면 메인이 쥐는 것은 **DB 읽기와 메시지 복제**뿐이다.
 *
 * 잰 값(api 스크립트 · 500KB 페이지 72 장(36MB) HTML 내보내기 · 같은 api 에 ops PATCH 를 잇달아 · `/health` 20ms 간격 ·
 * `taskpolicy -b`로 CPU 를 늦춘 api)은 `db/client.ts`의 그 표가 갖는다 — 여기 두 벌로 적지 않는다.
 *
 * **작업을 잘게 쪼개 `setImmediate`로 양보하는 길을 고르지 않은 이유:** 멈춤의 몸통은 페이지 한 장의 렌더와 번들 전체의
 * 압축이다(같은 프로젝트를 모듈 스크립트로 단계마다 잰 값 · 보통 CPU: 수집 0.5s · 렌더 2.1s · 압축 1.1s). 페이지 단위로 쪼개도 한 조각이 **가장 큰 페이지 한 장**
 * 만큼 멈추고 그 크기에 상한이 없다 — 압축은 `fflate`의 동기 API 라 파일 단위로 쪼개도 같다. 그리고 CPU 를 여전히 메인이
 * 쓰므로 그 사이 다른 요청의 지연이 늘어난다. 워커는 조각 크기와 무관하게 메인을 비운다.
 *
 * # 메인이 쥐는 것 — 메시지를 한 장씩 복제한다
 *
 * `postMessage`는 보내는 쪽 스레드에서 값을 **동기로** 복제한다(구조화 복제). 36MB 문서를 한 메시지에 실으면 그 복제만으로
 * 메인이 0.2–0.4s 선다(`taskpolicy -b`). 그래서 페이지를 **한 장씩** 보내고 사이마다 `setImmediate`로 양보한다 — 멈춤이
 * 가장 큰 페이지 한 장의 복제로 묶인다. 돌아오는 것도 같다: 그릴 요청과 그린 그림은 한 장씩, 압축 바이트는 **옮긴다**
 * (`transfer` — 복제하지 않는다).
 *
 * **대가:** 같은 36MB 내보내기의 소요가 보통 CPU 에서 같은 스레드 3.3s 대 워커 4.2s(복제와 워커 쪽 되살리기) · api 프로세스
 * RSS 최고 1.7GB 대 2.1GB(문서가 워커 힙에 한 벌 더 있다). 작은 프로젝트는 워커가 따뜻하면 같다(html 10–30ms).
 *
 * **트랜잭션은 없다.** 내보내기의 읽기는 트랜잭션 밖 단문이고(`readExportRows`) 워커에 넘길 때 쥔 연결이 없다. 워커는 풀도
 * 트랜잭션도 갖지 않는다 — DB 를 모르는 값만 받는다.
 *
 * # 정한 것
 *
 * | 무엇 | 값 | 왜 |
 * |---|---|---|
 * | CPU 칸 | `EXPORT_WORKER_LIMIT`(2 · 코어가 둘 이하면 1) | 내보내기는 드물고 하나가 크다 — 위 «대가»의 메모리가 일마다 붙는다. 칸을 못 얻은 일은 **줄을 선다** |
 * | 그리기 칸 | `EXPORT_RENDER_LIMIT`(2 · 같은 이름의 env 로 덮는다 — `ApiConfig.exportRenderLimit`) — **동시에 뜨는 브라우저 수**다 | 아래 «칸이 둘이다» |
 * | 워커 스레드 수 | CPU 칸 + 그리기 칸까지 | 아래 «칸이 둘이다» |
 * | 떠 있는 일 | `EXPORT_JOB_LIMIT`(8)까지(읽는 중 · 줄 선 · 도는) — 넘으면 `ExportBusyError`(→ 503 · `Retry-After: EXPORT_RETRY_AFTER_S`) | 아래 «줄은 길이로 묶는다» |
 * | 사람마다 떠 있는 일 | `EXPORT_PERSON_JOB_LIMIT`(2)까지 — 넘으면 같은 503 이되 문장이 «내 내보내기»다 | 아래 «한 사람이 줄을 다 쥐지 않는다» |
 * | 쉬는 워커 | `EXPORT_WORKER_IDLE_MS`(10s) 뒤 끝낸다 — **마지막 하나는 새 워커로 갈아 둔다** | 아래 «쉬는 워커는 오래 두지 않는다» |
 * | 요청이 끊기면 | 줄에서 빼거나 **워커를 끝낸다**(`terminate`) | 받을 사람이 없는 일을 끝까지 돌지 않는다. 그리던 브라우저 일은 메인에 남아 끝나고 버려진다 |
 * | 큰 입력의 메모리 | 워커 힙은 V8 기본 한도다(메인과 같은 규칙) | 넘으면 **그 워커만** 죽고(`ERR_WORKER_OUT_OF_MEMORY`) 메인은 산다 → 500 |
 * | 워커가 죽으면 | 그 일은 `ExportWorkerError`(→ 500 · 원인은 로그) · 워커는 버리고 다음 일은 새로 띄운다 | 결과를 모르는 게 아니라 **안 만들어졌다** — 읽기뿐이라 다시 눌러도 안전하다 |
 * | 쉬던 워커가 일을 받기 전에 죽어 있었으면 | **새 워커로 한 번 더** 한다 — 그 일의 탓이 아니다 | 아래 «쉬는 동안 죽은 워커» |
 * | 도메인 에러 | 워커가 갈래로 넘기고 여기서 같은 클래스로 되살린다 | 라우트의 `orFail`이 같은 스레드에서 던졌을 때와 같은 409 를 낸다 |
 *
 * # 칸이 둘이다 — CPU 와 그리기
 *
 * pptx 의 화면은 **메인이 브라우저로 그린다**(`renderFor`). 그동안 워커 스레드는 CPU 를 안 쓰고 답을 기다린다. 그 시간에
 * CPU 칸을 쥐고 있으면 pptx 둘이 그리는 동안(장마다 최대 10s — `screen-render-chromium.ts`의 `SCREEN_DEFAULTS`) 이 프로세스의
 * 다른 내보내기가 전부 줄을 선다 — 작은 html 미리보기까지. 그래서 칸을 가른다:
 *
 * 1. **그릴 일(그리는 자를 받은 pptx)은 그리기 칸을 먼저 얻고**, 그다음 **CPU 칸**을 얻어 시작한다. html 은 CPU 칸만
 *    얻는다. 워커 스레드는 일에 붙어 일 상태(받은 행 · 조립 중인 값)를 끝까지 쥔다.
 * 2. 워커가 그려 달라면 **CPU 칸을 내놓고** 그린다. 그리는 동안 그 CPU 칸으로 다른 일이 돈다.
 * 3. 다 그렸으면 그리기 칸을 내놓고 **CPU 칸을 줄 맨 앞에서** 다시 얻은 뒤 그림을 넘긴다(슬라이드 조립 · 압축은 CPU 다).
 *
 * **그리기 칸을 CPU 칸보다 먼저 얻는 이유:** 조립을 마친 뒤에 그리기 칸을 기다리면 그동안 무엇을 쥘지 둘 다 나쁘다.
 * CPU 칸을 쥐고 기다리면 pptx 가 그리기 칸 수보다 많을 때 넘은 것이 CPU 칸을 다 쥐고 서서 **html 까지 선다**. CPU 칸을
 * 내놓고 기다리면 그 칸으로 새 일이 들어와 워커가 또 뜨고, 그리기를 기다리는 일(각자 워커 하나와 문서 한 벌)이 끝없이
 * 쌓인다. 먼저 얻으면 그리기를 기다리는 일은 **워커도 CPU 칸도 없이** 줄에 서고, 떠 있는 워커는 CPU 칸 + 그리기 칸으로
 * 묶인다. 대가: 그리기 칸을 기다리는 pptx 는 앞 pptx 가 그리는 동안 조립을 미리 해 두지 못한다.
 *
 * 잰 값(api 스크립트 · 300 노드 페이지 24 장 pptx 미리보기 넷을 동시에 진짜 Chromium 으로 · 그동안 한 장짜리 html 미리보기를
 * 100ms 간격으로 · 같은 기계 · 세 번씩):
 *
 * | | html 최대 | 셋째 · 넷째 pptx | api RSS 최고 |
 * |---|---|---|---|
 * | 조립을 마친 뒤 CPU 칸을 쥐고 그리기 칸을 기다릴 때 | 7.3 · 8.4 · 10.3s(넷째가 칸을 내놓을 때까지) | 16.3–19.7s | 1.0–1.2GB |
 * | 그리기 칸을 먼저 얻을 때 | 0.19 · 0.22 · 0.62s | 17.1–22.1s | 0.8–0.9GB |
 *
 * **다시 얻을 때 줄 맨 앞인 것**은 뒤에 서면 그 사이 새 일이 칸을 얻어 떠 있는 일이 늘기 때문이다. 이미 자원을 쥔 일을
 * 먼저 끝낸다.
 *
 * 끊긴 일의 그리기는 메인에서 끝까지 돌고 버려지는데, **그동안 그리기 칸을 쥔다** — 브라우저가 떠 있는 동안이다. **그
 * 그리기는 자리(전체 · 사람)에 안 센다** — 자리는 일이 끝날 때(끊김 포함) 내놓고, 떠난 그리기는 그리기 칸만 쥔다. 그래서 한
 * 사람이 pptx 를 띄웠다 끊기를 되풀이하면 떠난 그리기가 그리기 칸 둘을 다 쥘 수 있다 — 그동안 남의 pptx 는 그리기 칸을
 * 기다린다(html 은 CPU 칸만 쓰므로 안 선다). 위를 묶는 것은 그리기 칸 수와 그리기 한 번의 길이다. 사람 몫에 세지 않은 까닭:
 * 세면 끊은 사람의 다음 미리보기가 떠난 그리기가 끝날 때까지 «내 내보내기» 503 이다 — 형식을 바꾸는 정상 사용이 막힌다.
 *
 * 잰 값(api 스크립트 · 500KB 페이지 72 장 프로젝트의 pptx 미리보기 둘을 진짜 Chromium 으로 돌리는 중에 페이지 한 장짜리 html
 * 미리보기 · 같은 기계 · 큰 둘은 각 9s 안팎):
 *
 * | 작은 것을 넣은 때 | 칸이 하나일 때 | 칸이 둘일 때 | 같은 스레드일 때 |
 * |---|---|---|---|
 * | 1.5s — 큰 둘이 아직 CPU 몫(72 장을 짓는 것)을 도는 중 | 7.4s(큰 둘이 끝날 때 같이 끝남) | 1.4–1.7s(큰 둘이 그리기로 넘어가 칸을 내놓을 때까지) | 2.0s(루프 멈춤) |
 * | 4.5s — 큰 둘이 그리는 중 | 4.9–5.1s | 54–665ms(첫 번은 셋째 워커를 띄우는 비용) | — |
 *
 * # 줄은 길이로 묶는다
 *
 * 줄에 선 일은 **라우트가 읽은 행을 쥐고** 선다 — 줄이 길어지는 만큼 메인의 힙이 자라고 뒤에 선 일의 기다림이 는다.
 * 잰 값(api 스크립트 · 500KB 페이지 72 장(36MB) 프로젝트의 HTML zip 을 동시에 N 개 · 같은 기계 · CPU 칸 2 · 한도 없이):
 *
 * | N | 마지막 답 | api RSS 최고 |
 * |---|---|---|
 * | 2 | 3.8s | 3.6GB |
 * | 8 | 16.4s | 4.4GB |
 * | 16 | 32.5s | 5.2GB |
 * | 32 | 65.3s | 6.8GB |
 *
 * 일 하나가 약 0.1GB(36MB 문서의 행)와 앞 일 수만큼의 기다림을 더한다. 그래서 **떠 있는 일(읽는 중 · 줄 선 · 도는)의 수를
 * 묶고 넘으면 곧바로 거절한다** — `EXPORT_JOB_LIMIT`(8)은 위 표의 N=8 줄이다. 작은 프로젝트는 일 하나가 수십 ms 라 8 에 닿을
 * 일이 진짜 몰림뿐이다. **자리는 읽기 전에 잡는다**(`admit`) — 거절할 요청이 36MB 를 읽지 않게. **도는 일까지 세는
 * 이유:** 줄 선 일만 세면 한꺼번에 들어온 요청들이 칸을 얻기 전(읽는 중)에 서로를 줄로 세어, 칸이 비어 있는데 거절된다.
 * 거절은 503 + `Retry-After`다(`http/error-handler.ts`) — 읽기뿐이라 다시 보내도 안전하다. pptx 는 일 하나가 그리기로
 * 9s 안팎이라 같은 8 이 더 긴 기다림이다(그리기 칸 2 · 뒤의 여섯이 세 차례 — 30s 안팎).
 *
 * **기한(줄에서 이만큼 기다리면 거절)은 두지 않는다.** 기다린 뒤의 거절은 이미 기다린 시간을 버리고, 수가 묶이면
 * 기다림도 «앞 일 수 × 일 하나»로 묶인다. 사람이 떠나면 웹이 요청을 끊고 끊긴 일은 줄에서 빠진다(«요청이 끊기면»).
 * 묶인 기다림의 값(api 스크립트 · 300 노드 페이지 24 장 pptx 미리보기 여덟을 한꺼번에 · 진짜 Chromium): 마지막이 39s 다.
 * 받는 쪽의 시한은 그보다 길다 — 웹은 내보내기 요청에 시간 제한을 걸지 않고(`apps/web`의 `api/http-client.ts`의
 * `getExportPreview` · `downloadExport`), `wireb`(Node `fetch`)는 응답 머리를 300s 기다린다. 기한이 쓸모 있어지는 것은 일 하나가 수십 초가 되는 판(수백 장 pptx)인데, 그때 거절하면 그 사람은 같은 줄에
 * 다시 서야 한다.
 *
 * # 한 사람이 줄을 다 쥐지 않는다
 *
 * 한도가 수 하나면 한 사람이 탭 여럿이나 스크립트로 여덟을 다 채워 **모든 프로젝트의 내보내기를** 그동안 막는다.
 * 잰 값(api 스크립트 · 두 사람 · A 가 300 노드 페이지 24 장 pptx 미리보기 여덟을 한꺼번에 · B 가 자기 한 장짜리 html 미리보기를
 * 200ms 간격으로): 사람마다 상한이 없으면 B 가 0.3–8.9s 동안 503 42 번, 상한이 2 면 B 가 503 0 번이고 A 의 셋째부터가
 * «내 내보내기» 503 이다. 그래서 **자리를 사람마다도 센다**(`admit(person)`) — 사람은 세션의 사용자이고 토큰이면 그 토큰의
 * 사용자다(`routes/export.ts`). 넘으면 전체가 찼을 때와 **같은 503 · `Retry-After`** 이되 문장을 가른다 — «밀려
 * 있다»를 읽은 사람은 기다리지만 이 거절은 자기 앞 일이 끝나야 풀린다. **끊긴 요청은 끊긴 순간 사람 몫을 돌려준다**
 * (`ExportAdmission`의 `leave`) — 전체 자리는 행 읽기가 끝날 때까지 쥔다.
 *
 * **왜 2 인가.** 사람 하나의 정상 사용이 동시에 띄우는 것은 탭 하나에 하나다 — 패널은 새로 부를 때 앞 미리보기를 끊고
 * 받는 동안 내려받기 버튼을 잠그며(`apps/web`의 `shell/export-panel.tsx`), 내려받기는 미리보기가 끝난 뒤에 선다. 탭 둘로
 * 미리보기와 내려받기를 겹치면 둘이다(실브라우저 — 한 탭이 pptx 미리보기를 도는 동안 둘째 · 셋째 탭이 작은 zip 을
 * 내려받아도 셋 다 됐다. 작은 일은 수십 ms 라 셋이 실제로 겹치지 않는다). 셋째부터는 같은 사람의 일끼리도 CPU 칸을 다퉈 빨라지지 않는다(CPU 칸 2). 2 면 전체 8 을 채우는 데 넷이 든다.
 *
 * 다시 재는 법: api 를 띄우고 그 프로젝트의 `GET /api/projects/:id/export`를 동시에 N 개 보내 마지막 답의 시간과 api 프로세스의
 * RSS(`ps -o rss=`)를 100ms 마다 본다(한도를 넘는 N 은 503 이 섞인다).
 *
 * # 쉬는 워커는 오래 두지 않는다
 *
 * 큰 일을 한 워커는 쉬는 동안 그 힙을 쥐고 V8 은 그 일부만 돌려준다(아래 60s 줄의 첫 차례: 30s 에 3.3 → 2.6GB) — 나머지는
 * 끝내야(`terminate`) 돌아온다. 그래서 쉬는 시간이 곧 **큰 부하 뒤 메모리를 쥐는 시간**이다. 마지막 하나는 새 워커로 갈아 두므로, 쉬는 시간을 짧게 해서 내는 대가는
 * **한꺼번에 둘 이상이 들어올 때 둘째부터 워커를 새로 띄우는 것**뿐이다 — 혼자 오는 다음 일은 갈아 둔 워커를 쓴다.
 *
 * 잰 값(api 스크립트 · 500KB 페이지 72 장(36MB) 프로젝트의 HTML zip 둘을 한꺼번에 · 끝난 뒤 api 프로세스 RSS 를 5s 마다 ·
 * 부하 두 차례):
 *
 * | 쉬는 시간 | 끝났을 때 | 쉬는 동안 | 내려간 때 · 값 |
 * |---|---|---|---|
 * | 60s | 3.4 · 4.6GB | 2.6–4.6GB | 75–90s 사이 · 1.25GB(둘째 차례. 첫 차례는 90s 까지 2.6GB) |
 * | 10s | 3.4 · 4.5GB | 3.3–4.5GB | 20–30s 사이 · 0.9 · 1.2GB |
 *
 * 워커를 끝낸 뒤 RSS 가 내려가기까지 10–15s 가 더 걸린다(운영체제가 늦게 거둔다). 대가(작은 html 미리보기 둘을 한꺼번에 ·
 * 다섯 · 세 번): 따뜻할 때 10–13ms, 쉬는 시간이 지난 뒤 29–67ms · 224–332ms(둘째가 워커를 새로 띄운다). 내보내기가 드물고
 * 하나가 초 단위라 그 0.2–0.3s 를 메모리 수 GB 를 쥐는 1 분과 바꾼다.
 *
 * 다시 재는 법: 위 부하를 보낸 뒤 `ps -o rss= -p <api pid>`를 5s 마다 본다. 대가는 쉬는 시간 + 5s 를 기다렸다가 작은 미리보기
 * 둘을 한꺼번에 보낸다.
 *
 * # 쉬는 동안 죽은 워커
 *
 * 쉬는 워커가 죽으면 `exit`이 그 자리를 비운다(`spawn`). 그런데 스레드가 죽은 뒤 메인이 `exit`을 처리하기 전에 일이
 * 그 워커를 꺼내면, 일은 죽은 워커에 행을 보내고 뒤늦은 `exit`을 받는다 — 꺼낼 때 살았는지 동기로 물을 길이 없다.
 * 그래서 워커는 일을 받으면 먼저 **받았다고 답하고**(`accepted`), 쉬던 워커가 그 답 전에 죽으면 그 일의 탓이 아니므로
 * 새 워커로 한 번 더 한다. 받은 뒤의 죽음(메모리 한도 등)은 그 일의 탓이라 다시 하지 않는다 — 같은 일은 또 죽는다.
 *
 * # 워커가 싣는 코드는 메인과 같다
 *
 * 워커의 `execArgv`는 메인의 `--conditions`만 이어받고 tsx 로더를 싣는다(`workerExecArgv`). 그래서 `tsx src/main.ts`로 도는
 * api 에서는 둘 다 `packages/*`의 `dist`를, vitest(포크가 `--conditions development`로 뜬다)에서는 둘 다 소스를 본다 —
 * 워커만 낡은 `dist`를 도는 일이 없다. 운영 판(api 스크립트 · 같은 프로젝트를 같은 스레드와 워커로 내보냄)에서 html · pptx
 * 의 엔트리가 이름 · 순서 · 바이트까지 같았다.
 *
 * **vitest 에서는 변환기가 다르다** — 메인은 vite 가, 워커는 tsx 가 소스를 옮긴다. 산출물의 글자는 변환기가 짓지 않으므로 갈리지
 * 않는다 — `assets/runtime.js` 도 빌드 산출물을 두 스레드가 각자 같은 파일에서 읽는다(`export-runtime.ts` · `test/export-worker.test.ts`
 * 가 전 엔트리를 바이트로 견준다). tsx 는 tsconfig 의 `include`에 든 파일에만 `jsx`를 걸어서 워커에
 * `apps/api/export-worker.tsconfig.json`을 준다(그 파일의 머리말).
 *
 * **워커는 모듈을 나눠 갖지 않는다** — 메인이 채운 레지스트리(컴포넌트 카탈로그)도 워커에서는 비어서 뜬다. 채우는 자리는
 * `export-worker-thread.ts`의 첫머리다.
 */
import { availableParallelism } from 'node:os'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Worker, type ResourceLimits } from 'node:worker_threads'
import { EmptyProjectError, UnsupportedDocumentError, type ExportRows } from './export-source'
import type {
  ExportJobFailure,
  ExportJobResult,
  ExportJobSpec,
  FromWorker,
  HtmlJobResult,
  PptxJobResult,
  ToWorker,
} from './export-worker-protocol'
import { errorLine, type ScreenBatch, type ScreenJob, type ScreenPage } from './screen-render'

/** CPU 칸 수 — 머리말의 표. 코어가 하나뿐인 기계에서는 하나다. */
export const EXPORT_WORKER_LIMIT = Math.max(1, Math.min(2, availableParallelism() - 1))

/** 그리기 칸 수의 기본값 — 동시에 뜨는 브라우저 수다(머리말 «칸이 둘이다»). env `EXPORT_RENDER_LIMIT` 가 덮는다(`config.ts`). */
export const EXPORT_RENDER_LIMIT = 2

/** 쉬는 워커를 끝내기까지(ms) — 머리말의 표. */
export const EXPORT_WORKER_IDLE_MS = 10_000

/** 떠 있을 수 있는 일(읽는 중 · 줄 선 · 도는)의 수 — 머리말 «줄은 길이로 묶는다». */
export const EXPORT_JOB_LIMIT = 8

/** 사람 하나가 띄워 둘 수 있는 일의 수 — 머리말 «한 사람이 줄을 다 쥐지 않는다». */
export const EXPORT_PERSON_JOB_LIMIT = 2

/** 줄이 넘쳐 거절할 때 몇 초 뒤 다시 보내라고 하나(`Retry-After`). 36MB 프로젝트의 HTML 일 하나가 3.5s 안팎이다. */
export const EXPORT_RETRY_AFTER_S = 5

/** 코멘트를 한 메시지에 몇 개씩 싣나. 코멘트 하나는 작다 — 페이지처럼 한 개씩 보낼 까닭이 없다. */
const COMMENTS_PER_MESSAGE = 1_000

/** 워커 스레드가 죽었다(예외 · 메모리 한도 · 뜻밖의 종료). **일은 안 만들어졌다** — 머리말의 표. */
export class ExportWorkerError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'ExportWorkerError'
  }
}

/** 요청이 끊겨 일을 버렸다. 받을 사람이 없다 — 라우트는 답하지 않는다. */
export class ExportAbortedError extends Error {
  constructor() {
    super('요청이 끊겨 내보내기를 멈췄습니다')
    this.name = 'ExportAbortedError'
  }
}

/**
 * 줄이 넘쳤다 — 일을 받지 않았다. `http/error-handler.ts`가 503 + `Retry-After`로 옮긴다. `scope`가 누구의 한도인지
 * 가르고 문장도 그것을 따른다 — `server`는 머리말 «줄은 길이로 묶는다», `person`은 «한 사람이 줄을 다 쥐지 않는다».
 */
export class ExportBusyError extends Error {
  constructor(
    readonly retryAfterSeconds: number,
    readonly scope: 'server' | 'person' = 'server',
  ) {
    super(
      scope === 'person'
        ? '내 내보내기가 이미 돌고 있습니다 — 앞의 것이 끝난 뒤 다시 시도하세요'
        : '내보내기가 밀려 있습니다 — 잠시 뒤 다시 시도하세요',
    )
    this.name = 'ExportBusyError'
  }
}

/**
 * 잡은 자리(`ExportWorkerPool.admit`). 일이 끝나면 풀이 스스로 내놓는다. 일을 넘기기 전에 그만두면(읽기 실패 등) 잡은
 * 쪽이 `release`한다 — 두 번 불러도 한 번만 내놓는다. `start`는 풀이 부른다(CPU 칸을 처음 얻어 줄에서 나왔다).
 *
 * `leave`는 **사람 몫만** 먼저 돌려준다 — 요청이 끊긴 순간 잡은 쪽이 부른다(`routes/export.ts`의 `admitted`). 끊긴 일은 그 뒤
 * 행 읽기가 끝날 때까지 남는데, 그동안 사람 몫을 쥐면 형식을 빠르게 바꾼 사람의 다음 요청이 «내 내보내기» 503 이다. 전체 자리
 * (`jobs`)는 `release`까지 쥔다 — 읽는 동안의 메모리는 그대로 세야 한다(머리말 «줄은 길이로 묶는다»). 두 번 불러도 한 번만 돌려준다.
 */
export interface ExportAdmission {
  start(): void
  leave(): void
  release(): void
}

export interface ExportRunOptions {
  /** 끊기면 일을 버린다 — 머리말의 표. */
  signal?: AbortSignal
  /** pptx 의 화면을 그리는 자. 워커가 부르면 메인에서 돈다(브라우저를 메인이 쥔다). */
  render?: (job: ScreenJob) => Promise<ScreenBatch>
  /** 먼저 잡아 둔 자리(`admit`). 없으면 여기서 잡는다 — 넘치면 `ExportBusyError`. 일이 끝나면 풀이 내놓는다. */
  admission?: ExportAdmission
}

export interface ExportWorkerPoolOptions {
  /** CPU 칸 수. */
  limit?: number
  /** 그리기 칸 수. */
  renderLimit?: number
  /** 떠 있을 수 있는 일의 수. */
  jobLimit?: number
  /** 사람 하나가 띄워 둘 수 있는 일의 수. */
  personJobLimit?: number
  idleMs?: number
  /** 워커 하나의 힙 한도. 없으면 V8 기본이다 — 머리말의 표. 케이스가 한도를 좁혀 «워커만 죽는다»를 잰다. */
  resourceLimits?: ResourceLimits
}

/**
 * tsx 의 ESM 로더 — 워커가 `.ts`를 싣게 한다. 메인이 tsx 로 떠 있든(운영) vitest 로 떠 있든 같은 로더다. 처음 띄울 때
 * 찾는다 — 내보내기를 안 부르는 프로세스가 이것 때문에 못 뜨지 않게.
 */
function tsxEsmLoader(): string {
  return pathToFileURL(createRequire(import.meta.url).resolve('tsx/esm')).href
}

/**
 * 워커의 `execArgv` — 머리말 «워커가 싣는 코드는 메인과 같다». 메인의 `--conditions`(`-C`)만 이어받는다. 나머지 인자는
 * 워커가 거절하거나(`--inspect` 부류) 뜻이 없다(tsx 자신의 `--require`).
 */
export function workerExecArgv(parent: readonly string[] = process.execArgv): string[] {
  const out: string[] = []
  for (let i = 0; i < parent.length; i++) {
    const arg = parent[i]!
    if (arg === '--conditions' || arg === '-C') {
      const value = parent[i + 1]
      if (value !== undefined) out.push('--conditions', value)
      i++
    } else if (arg.startsWith('--conditions=')) {
      out.push(arg)
    }
  }
  return [...out, '--import', tsxEsmLoader()]
}

interface Slot {
  worker: Worker
  idleTimer: NodeJS.Timeout | null
}

/**
 * 일 하나가 지금 쥔 칸(머리말 «칸이 둘이다»). CPU 칸은 그리는 동안 내놓았다가 다시 얻는다. 그리기 칸은 `held`(쥐었다 —
 * 일이 끝날 때 `run`이 내놓는다) · `drawing`(그리는 중 — 그리기가 끝날 때 `renderFor`가 내놓는다. 그 사이 일이 끝나도
 * 브라우저가 떠 있는 동안은 쥔다) · `none`.
 */
interface Job {
  cpu: boolean
  draw: 'none' | 'held' | 'drawing'
}

/** 쉬던 워커가 일을 받기 전에 이미 죽어 있었다 — 그 일의 탓이 아니다(머리말 «쉬는 동안 죽은 워커»). 풀 밖으로 안 나간다. */
class StaleWorkerError extends Error {
  constructor(readonly failure: ExportWorkerError) {
    super(failure.message)
    this.name = 'StaleWorkerError'
  }
}

interface GateWaiter {
  first: boolean
  resolve(): void
  reject(error: unknown): void
  detach(): void
}

/**
 * 수가 정해진 칸 — CPU 칸과 그리기 칸이 이것이다(머리말 «칸이 둘이다»). 줄은 먼저 온 순서이고, `first`로 선 것은 앞선
 * `first`의 뒤 · 나머지의 앞에 선다. 내놓은 칸은 줄의 맨 앞에게 **그대로 넘긴다** — 사이에 새로 온 것이 끼어들지 않는다.
 */
class Gate {
  private held = 0
  private readonly waiters: GateWaiter[] = []
  private closedWith: Error | null = null

  constructor(private readonly limit: number) {}

  get queued(): number {
    return this.waiters.length
  }

  /** 지금 쥐인 칸의 수. */
  get inUse(): number {
    return this.held
  }

  /** 끊기면(`signal`) 줄에서 빠지고 `ExportAbortedError`다. */
  acquire(signal: AbortSignal | undefined, options?: { first?: boolean }): Promise<void> {
    if (this.closedWith !== null) return Promise.reject(this.closedWith)
    if (signal?.aborted) return Promise.reject(new ExportAbortedError())
    if (this.held < this.limit) {
      this.held++
      return Promise.resolve()
    }
    return new Promise<void>((resolve, reject) => {
      const waiter: GateWaiter = { first: options?.first === true, resolve, reject, detach: () => undefined }
      if (signal !== undefined) {
        const onAbort = (): void => {
          const at = this.waiters.indexOf(waiter)
          if (at >= 0) this.waiters.splice(at, 1)
          reject(new ExportAbortedError())
        }
        signal.addEventListener('abort', onAbort, { once: true })
        waiter.detach = () => signal.removeEventListener('abort', onAbort)
      }
      const at = waiter.first ? this.waiters.findIndex((other) => !other.first) : -1
      if (at >= 0) this.waiters.splice(at, 0, waiter)
      else this.waiters.push(waiter)
    })
  }

  release(): void {
    const next = this.waiters.shift()
    if (next === undefined) {
      this.held--
      return
    }
    next.detach()
    next.resolve()
  }

  close(error: Error): void {
    this.closedWith = error
    for (const waiter of this.waiters.splice(0)) {
      waiter.detach()
      waiter.reject(error)
    }
  }
}

export class ExportWorkerPool {
  private readonly cpu: Gate
  private readonly draw: Gate
  private readonly jobLimit: number
  private readonly personJobLimit: number
  private readonly idleMs: number
  private readonly resourceLimits: ResourceLimits | undefined
  private readonly idle: Slot[] = []
  private readonly busy = new Set<Slot>()
  /** 자리를 잡고 아직 안 끝난 일 — 읽는 중 · 줄 선 · 도는(머리말 «줄은 길이로 묶는다»). */
  private jobs = 0
  /** 그중 CPU 칸을 아직 처음 얻지 못한 일 — 읽는 중이거나 칸을 기다린다. */
  private queued = 0
  /** 사람마다 떠 있는 일의 수(머리말 «한 사람이 줄을 다 쥐지 않는다»). 0 이 되면 키를 지운다. */
  private readonly perPerson = new Map<string, number>()
  private closed = false

  constructor(options?: ExportWorkerPoolOptions) {
    this.cpu = new Gate(Math.max(1, options?.limit ?? EXPORT_WORKER_LIMIT))
    this.draw = new Gate(Math.max(1, options?.renderLimit ?? EXPORT_RENDER_LIMIT))
    this.jobLimit = Math.max(1, options?.jobLimit ?? EXPORT_JOB_LIMIT)
    this.personJobLimit = Math.max(1, options?.personJobLimit ?? EXPORT_PERSON_JOB_LIMIT)
    this.idleMs = options?.idleMs ?? EXPORT_WORKER_IDLE_MS
    this.resourceLimits = options?.resourceLimits
  }

  /**
   * 떠 있는 워커 · 일에 붙은 워커(그리는 중인 일 포함) · 줄에 선 일(자리를 잡고 CPU 칸을 처음 얻기 전 — 그리기 칸을
   * 기다리는 일 포함) · 쥔 그리기 칸(그리는 중이거나, 얻고 CPU 칸을 기다리는 중 — 끊긴 일의 브라우저가 떠 있는 동안도).
   * 케이스가 «끊기면 워커를 끝낸다»를 이것으로 잰다.
   */
  get stats(): { threads: number; busy: number; queued: number; drawSlots: number } {
    return { threads: this.idle.length + this.busy.size, busy: this.busy.size, queued: this.queued, drawSlots: this.draw.inUse }
  }

  /**
   * **자리를 잡는다** — 떠 있는 일이 `jobLimit`이거나 그 사람(`person`)의 일이 `personJobLimit`이면 `ExportBusyError`다.
   * 라우트는 행을 **읽기 전에** 부른다(머리말 «줄은 길이로 묶는다» · «한 사람이 줄을 다 쥐지 않는다»). `person`이 없으면
   * 사람마다는 세지 않는다.
   */
  admit(person?: string): ExportAdmission {
    if (this.closed) throw new ExportWorkerError('내보내기 워커 풀이 닫혔습니다')
    const mine = person === undefined ? 0 : (this.perPerson.get(person) ?? 0)
    if (person !== undefined && mine >= this.personJobLimit) throw new ExportBusyError(EXPORT_RETRY_AFTER_S, 'person')
    if (this.jobs >= this.jobLimit) throw new ExportBusyError(EXPORT_RETRY_AFTER_S)
    this.jobs++
    this.queued++
    if (person !== undefined) this.perPerson.set(person, mine + 1)
    let waiting = true
    let held = true
    let counted = person !== undefined
    const admission: ExportAdmission = {
      start: () => {
        if (!waiting) return
        waiting = false
        this.queued--
      },
      leave: () => {
        if (!counted || person === undefined) return
        counted = false
        const left = (this.perPerson.get(person) ?? 1) - 1
        if (left === 0) this.perPerson.delete(person)
        else this.perPerson.set(person, left)
      },
      release: () => {
        admission.start()
        admission.leave()
        if (!held) return
        held = false
        this.jobs--
      },
    }
    return admission
  }

  async runHtml(rows: ExportRows, spec: Extract<ExportJobSpec, { kind: 'html' }>, options?: ExportRunOptions): Promise<HtmlJobResult> {
    return (await this.run(rows, spec, options)) as HtmlJobResult
  }

  async runPptx(rows: ExportRows, spec: Extract<ExportJobSpec, { kind: 'pptx' }>, options?: ExportRunOptions): Promise<PptxJobResult> {
    return (await this.run(rows, spec, options)) as PptxJobResult
  }

  /** 떠 있는 워커를 전부 끝낸다. 줄 선 일은 거절된다. */
  async close(): Promise<void> {
    this.closed = true
    const error = new ExportWorkerError('내보내기 워커 풀이 닫혔습니다')
    this.cpu.close(error)
    this.draw.close(error)
    const slots = [...this.idle.splice(0), ...this.busy]
    this.busy.clear()
    await Promise.all(slots.map((slot) => this.retire(slot)))
  }

  private async run(rows: ExportRows, spec: ExportJobSpec, options?: ExportRunOptions): Promise<ExportJobResult> {
    const signal = options?.signal
    const admission = options?.admission ?? this.admit()
    const job: Job = { cpu: false, draw: 'none' }
    let healthy = false
    let slot: Slot | undefined
    try {
      // 그릴 일은 그리기 칸이 먼저다 — 머리말 «칸이 둘이다»의 1.
      if (spec.kind === 'pptx' && options?.render !== undefined) {
        await this.draw.acquire(signal)
        job.draw = 'held'
      }
      await this.cpu.acquire(signal)
      job.cpu = true
      admission.start()

      const taken = this.take()
      slot = taken.slot
      let result: ExportJobResult
      try {
        result = await this.converse(slot.worker, taken.reused, job, rows, spec, options)
      } catch (error) {
        if (!(error instanceof StaleWorkerError)) throw error
        // 쉬는 동안 죽어 있던 워커다 — 새 워커로 한 번 더(머리말 «쉬는 동안 죽은 워커»).
        this.putBack(slot, false)
        slot = undefined
        slot = this.take({ fresh: true }).slot
        result = await this.converse(slot.worker, false, job, rows, spec, options)
      }
      healthy = true
      return result
    } catch (error) {
      // 도메인 에러는 워커가 멀쩡히 답한 것이다 — 그 워커를 다시 쓴다.
      healthy = error instanceof EmptyProjectError || error instanceof UnsupportedDocumentError || isFailedJob(error)
      throw error
    } finally {
      if (slot !== undefined) this.putBack(slot, healthy)
      this.releaseSlots(job)
      admission.release()
    }
  }

  /** 일이 끝났다 — 쥔 칸을 내놓는다. **그리는 중인 그리기 칸은 두고 간다** — `renderFor`가 그리기가 끝날 때 내놓는다. */
  private releaseSlots(job: Job): void {
    if (job.cpu) {
      job.cpu = false
      this.cpu.release()
    }
    if (job.draw === 'held') {
      job.draw = 'none'
      this.draw.release()
    }
  }

  /**
   * 일에 붙일 워커 — 쉬는 것이 있으면 그것, 없으면(또는 `fresh`면) 새로 띄운다. 일하는 동안은 프로세스를 붙잡는다.
   * `reused`는 쉬던 워커를 꺼냈다는 뜻이다(머리말 «쉬는 동안 죽은 워커»).
   */
  private take(options?: { fresh?: boolean }): { slot: Slot; reused: boolean } {
    if (this.closed) throw new ExportWorkerError('내보내기 워커 풀이 닫혔습니다')
    const reusable = options?.fresh === true ? undefined : this.idle.pop()
    const slot = reusable ?? this.spawn()
    if (slot.idleTimer !== null) clearTimeout(slot.idleTimer)
    slot.idleTimer = null
    slot.worker.ref()
    this.busy.add(slot)
    return { slot, reused: reusable !== undefined }
  }

  private putBack(slot: Slot, healthy: boolean): void {
    this.busy.delete(slot)
    if (!healthy || this.closed) {
      void this.retire(slot)
      return
    }
    slot.worker.unref()
    slot.idleTimer = setTimeout(() => {
      const at = this.idle.indexOf(slot)
      if (at >= 0) this.idle.splice(at, 1)
      void this.retire(slot)
      // **마지막 하나는 새 것으로 갈아 둔다** — 머리말의 표 «쉬는 워커».
      if (!this.closed && this.idle.length + this.busy.size === 0) this.idle.push(this.spawn())
    }, this.idleMs)
    slot.idleTimer.unref()
    this.idle.push(slot)
  }

  private spawn(): Slot {
    const worker = new Worker(new URL('./export-worker-thread.ts', import.meta.url), {
      execArgv: workerExecArgv(),
      env: { ...process.env, TSX_TSCONFIG_PATH: fileURLToPath(new URL('../../export-worker.tsconfig.json', import.meta.url)) },
      ...(this.resourceLimits === undefined ? {} : { resourceLimits: this.resourceLimits }),
    })
    // 쉬는 워커는 프로세스를 붙잡지 않는다 — 일하는 동안만 붙잡는다(`take` · `putBack`). 약속은 프로세스를 붙잡지 않는다.
    worker.unref()
    // **쉬는 동안 죽으면 그 자리를 비운다** — 안 비우면 다음 일이 죽은 워커를 꺼내고, 그 `exit`은 이미 지나가 `converse`가
    // 못 들어 그 일이 끝없이 기다린다. `exit`이 처리되기 전에 꺼낸 일은 `converse`가 뒤늦은 `exit`을 받고 풀이 새 워커로 한 번
    // 더 한다(머리말 «쉬는 동안 죽은 워커»). 일하는 동안의 죽음은 `converse`가 받는다.
    const slot: Slot = { worker, idleTimer: null }
    worker.on('error', () => undefined)
    worker.once('exit', () => {
      const at = this.idle.indexOf(slot)
      if (at >= 0) {
        this.idle.splice(at, 1)
        if (slot.idleTimer !== null) clearTimeout(slot.idleTimer)
      }
    })
    return slot
  }

  private async retire(slot: Slot): Promise<void> {
    if (slot.idleTimer !== null) clearTimeout(slot.idleTimer)
    slot.idleTimer = null
    await slot.worker.terminate()
  }

  /** 일 하나를 주고받는다 — 행을 한 장씩 보내고, 그려 달라면 그려 주고, 답을 받는다. */
  private converse(
    worker: Worker,
    reused: boolean,
    job: Job,
    rows: ExportRows,
    spec: ExportJobSpec,
    options: ExportRunOptions | undefined,
  ): Promise<ExportJobResult> {
    const signal = options?.signal
    // 이 일이 끝났다(답 · 실패 · 끊김 · 죽음) — 칸을 기다리던 그리기 뒤처리도 이것으로 멈춘다.
    const ended = new AbortController()
    return new Promise<ExportJobResult>((resolve, reject) => {
      const files = new Map<string, string | Uint8Array>()
      const pages: ScreenPage[] = []
      /** 워커가 이 일을 받았다고 답했다 — 그 전의 죽음은 쉬는 동안의 죽음이다(머리말 «쉬는 동안 죽은 워커»). */
      let accepted = false
      /** 워커가 이미 그려 달라고 했다 — 그리기는 일마다 한 번이다(`renderFor`). */
      let asked = false

      const finish = (outcome: () => void): void => {
        if (ended.signal.aborted) return
        ended.abort()
        worker.off('message', onMessage)
        worker.off('error', onError)
        worker.off('exit', onExit)
        signal?.removeEventListener('abort', onAbort)
        outcome()
      }
      /** 워커가 죽었다 — 쉬던 워커가 이 일을 받기 전이면 풀이 새 워커로 한 번 더 한다(`run`). */
      const died = (error: ExportWorkerError): void => {
        finish(() => reject(reused && !accepted ? new StaleWorkerError(error) : error))
      }
      const onError = (error: unknown): void => {
        died(new ExportWorkerError(`내보내기 워커가 죽었습니다: ${errorLine(error)}`, { cause: error }))
      }
      const onExit = (code: number): void => {
        died(new ExportWorkerError(`내보내기 워커가 일하는 중에 끝났습니다(종료 코드 ${code})`))
      }
      const onAbort = (): void => {
        // `putBack`이 이 워커를 버린다(healthy 가 아니다) — 받을 사람이 없는 일을 끝까지 돌지 않는다.
        finish(() => reject(new ExportAbortedError()))
      }
      const onMessage = (message: FromWorker): void => {
        switch (message.t) {
          case 'accepted':
            accepted = true
            return
          case 'screen-file':
            files.set(message.path, message.content)
            return
          case 'screen-page':
            pages.push(message.page)
            return
          case 'render':
            // **둘째 부탁은 받지 않는다** — 칸은 한 번 그릴 몫만 얻어 두었다(`run`). 받으면 그리기 칸을 하나 더 얻고, 이미
            // 내놓은 CPU 칸을 한 번 더 내놓아 CPU 칸이 하나 는 것처럼 돈다. 그리는 자를 받았는데 그리기 칸을 얻어 두지 않은
            // 일의 부탁도 같다. 워커가 틀린 것이라 그 워커째 버린다. **그리는 자가 없는 일**(html · 그리는 자 없는 pptx —
            // 라우트가 `render`를 안 넘긴다)의 부탁은 여기서 끝내지 않는다 — `renderFor`가 칸을 건드리지 않고 «그리지 못함»
            // (`screens-failed`)으로 답한다.
            if (options?.render !== undefined && (asked || job.draw !== 'held')) {
              died(new ExportWorkerError('내보내기 워커가 화면을 두 번 그려 달라고 했습니다'))
              return
            }
            asked = true
            void this.renderFor(worker, job, { files, pages }, options?.render, ended.signal)
            return
          case 'done':
            finish(() => resolve(message.result))
            return
          case 'failed':
            finish(() => reject(reviveFailure(message.failure)))
            return
        }
      }

      worker.on('message', onMessage)
      worker.on('error', onError)
      worker.on('exit', onExit)
      signal?.addEventListener('abort', onAbort, { once: true })
      if (signal?.aborted) {
        onAbort()
        return
      }

      void this.feed(worker, rows, spec, () => ended.signal.aborted).catch((error: unknown) => {
        died(new ExportWorkerError(`내보내기 워커에 입력을 넘기지 못했습니다: ${errorLine(error)}`, { cause: error }))
      })
    })
  }

  /** 행을 **한 장씩** 보낸다 — 머리말 «메인이 쥐는 것». 끝났으면(끊김 · 죽음) 그만 보낸다. */
  private async feed(worker: Worker, rows: ExportRows, spec: ExportJobSpec, done: () => boolean): Promise<void> {
    const post = (message: ToWorker): void => worker.postMessage(message)
    post({ t: 'job', spec })
    post({ t: 'rows', part: 'menu', items: rows.menu })
    for (const page of rows.pages) {
      await yieldToLoop()
      if (done()) return
      post({ t: 'rows', part: 'pages', items: [page] })
    }
    for (let at = 0; at < rows.comments.length; at += COMMENTS_PER_MESSAGE) {
      await yieldToLoop()
      if (done()) return
      post({ t: 'rows', part: 'comments', items: rows.comments.slice(at, at + COMMENTS_PER_MESSAGE) })
    }
    for (const image of rows.images) {
      await yieldToLoop()
      if (done()) return
      post({ t: 'rows', part: 'images', items: [image] })
    }
    await yieldToLoop()
    if (done()) return
    post({ t: 'rows', part: 'codes', items: rows.codes })
    post({ t: 'rows', part: 'theme', theme: rows.theme, warning: rows.themeWarning })
    if (done()) return
    post({ t: 'run' })
  }

  /**
   * 워커가 그려 달란 것을 메인에서 그리고 **한 장씩** 돌려준다. 그리는 동안은 CPU 칸을 내놓는다 — 머리말 «칸이 둘이다».
   * 그리는 자가 없으면 워커는 애초에 부르지 않는다.
   *
   * 그리기 칸은 일이 시작할 때 얻어 두었다(`run`). **일마다 한 번만 여기 온다** — 조립은 한 번만 그려 달라고 하고
   * (`buildProjectPptx`), 둘째 부탁은 `converse`가 그 일을 끝내 여기 닿지 않는다.
   *
   * 칸을 얻고 난 뒤에는 늘 `ended`를 다시 본다 — 칸이 넘어온 뒤 이어서 돌기 전에 일이 끝났을 수 있고, 그때 `run`의
   * `finally`는 이미 지나갔다(`job.cpu`로 무엇을 돌려줄지 가른다).
   */
  private async renderFor(
    worker: Worker,
    job: Job,
    screenJob: ScreenJob,
    render: ExportRunOptions['render'],
    ended: AbortSignal,
  ): Promise<void> {
    if (render === undefined) {
      if (ended.aborted) return
      worker.postMessage({
        t: 'screens-failed',
        error: plainError(new Error('그리는 자가 없는데 워커가 그려 달라고 했습니다')),
      } satisfies ToWorker)
      return
    }
    if (ended.aborted) return
    job.draw = 'drawing'
    job.cpu = false
    this.cpu.release()

    let batch: ScreenBatch | null = null
    let failure: unknown = null
    try {
      batch = await render(screenJob)
    } catch (error) {
      failure = error
    } finally {
      job.draw = 'none'
      this.draw.release()
    }

    try {
      await this.cpu.acquire(ended, { first: true })
    } catch {
      return
    }
    if (ended.aborted) {
      this.cpu.release()
      return
    }
    job.cpu = true

    if (batch === null) {
      worker.postMessage({ t: 'screens-failed', error: plainError(failure) } satisfies ToWorker)
      return
    }
    for (const [index, result] of batch.results.entries()) {
      await yieldToLoop()
      if (ended.aborted) return
      worker.postMessage({ t: 'screen', index, result } satisfies ToWorker)
    }
    if (!ended.aborted) worker.postMessage({ t: 'screens-done', fontWarning: batch.fontWarning } satisfies ToWorker)
  }
}

/**
 * **던져진 것을 워커로 넘길 수 있는 값으로** — 이름과 글만 남긴다. 받는 쪽(`drawScreens`)이 읽는 것은 글의 첫 줄뿐이고
 * (`errorLine`), 던져진 것이 복제 못 할 것(연결 · 함수)을 `cause`로 달고 있으면 `postMessage`가 통째로 거절한다.
 */
function plainError(error: unknown): Error {
  const plain = new Error(error instanceof Error ? error.message : String(error))
  if (error instanceof Error) plain.name = error.name
  return plain
}

/** 워커가 넘긴 실패를 메인의 에러로 되살린다 — 도메인 에러는 **같은 클래스**다(`routes/export.ts`의 `orFail`). */
function reviveFailure(failure: ExportJobFailure): Error {
  switch (failure.kind) {
    case 'empty':
      return new EmptyProjectError()
    case 'unsupported-document':
      return new UnsupportedDocumentError(failure.pageTitle, failure.reason)
    case 'error': {
      const error = new Error(failure.message)
      error.name = failure.name
      FAILED_JOBS.add(error)
      return error
    }
  }
}

/** 워커가 멀쩡히 «던졌다»고 답한 에러 — 워커를 버릴 까닭이 없다. */
const FAILED_JOBS = new WeakSet<Error>()

function isFailedJob(error: unknown): boolean {
  return error instanceof Error && FAILED_JOBS.has(error)
}

function yieldToLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve))
}
