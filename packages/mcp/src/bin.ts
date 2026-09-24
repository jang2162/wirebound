#!/usr/bin/env node
/**
 * `wireb-mcp` — 호스트가 띄우는 실행 파일. **stdio로 붙는다**.
 *
 * ---
 *
 * # 왜 stdio인가 — 전송을 고르는 것이 아니라 리포 바인딩이 정한다
 *
 * 설계서 「리포 바인딩」이 *"이 리포가 어느 설계 프로젝트에 대응하는가"*를
 * `.wirebound.json`에 담았고 MCP 서버도 그 파일을 읽는다(`session.ts`의 머리말). **그 파일을
 * 찾으려면 서버가 에이전트의 cwd에서 도는 로컬 프로세스여야 한다** — 남의 기계에 있는
 * 서버에게 `io.cwd`는 아무 뜻도 없다.
 *
 * # 여기가 `node:*`를 부르는 유일한 자리다
 *
 * `createNodeIo`가 그것을 감싸고 있으므로 이 파일은 그것을 부르기만 한다. `process`를
 * 만지는 자리도 여기뿐이다 — `test/io-boundary.test.ts`가 목록을 이 파일 하나로 고정한다.
 *
 * # 표준출력에 아무것도 쓰지 않는다
 *
 * stdio 전송에서 **표준출력은 JSON-RPC 프레임의 통로다.** `createNodeIo`의 `out`이
 * `process.stdout.write`이므로(`node-io.ts`) **`io`를 갈아 끼워 그것을 표준오류로 돌린다** —
 * `wireb`가 `--json`을 파이프로 받는 쪽을 위해 경고를 `err`로 보낸 것과 같은 부류의
 * 판정이다(`project.ts`의 머리말).
 *
 * **무엇이 일어나는지는 호스트에 달렸다.** SDK 1.30.0의 `StdioClientTransport`는 **개행으로
 * 끝나는 이물 한 줄**을 만나도 연결을 안 끊는다. 그러나 **개행 없는 조각**이 섞이면 다음 프레임 앞에 붙어 그 프레임이 깨지고, 그 관대함은
 * 이 클라이언트의 것이지 계약이 아니다. 그래서 술어를 관대함에 안 맞춘다 —
 * `build-test/dist-smoke.test.ts`가 **날 표준출력을 직접 읽어** 모든 줄이 프레임인지 잰다.
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createNodeIo } from '@wirebound/cli/embed'
import { createServer } from './server'

const base = createNodeIo()
// **`out`을 `err`로 돌리고 자기 종류를 말한다**(위 머리말). 그 밖은 그대로다.
// `client`가 `callApi`의 `x-wb-client` 헤더가 되고, 서버가 그 값으로
// `revisions.actor_type`을 채운다(설계서 「LLM 편집 경로」) — **이 한 줄이 없으면 도구가 낸
// 편집이 `cli`로 기록된다.** 이 파일의 `io`를 볼 수 있는 자는 스모크뿐이므로
// `build-test/dist-smoke.test.ts`의 `자기를 mcp 라고 말한다`가 그것을 든다.
const io = { ...base, out: base.err, client: 'mcp' as const }

const server = createServer(io)
await server.connect(new StdioServerTransport())
