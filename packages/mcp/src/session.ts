/**
 * **프로젝트를 여는 두 걸음** — 바인딩·자격을 찾는 것과 스냅샷을 받는 것.
 *
 * ---
 *
 * # 다시 짜지 않는다 (D3)
 *
 * 넷(`.wirebound.json` · 자격 · `callApi` · `io`)이 `packages/cli`에 이미 순수하게 갈라져
 * 있다. **여기서 다시 짜면 자격을 읽고 쓰는 자리가 두 벌이 되고**, 한쪽만 고쳐지는 날
 * 토큰이 안 읽히거나 엉뚱한 자리에 쓰인다. 이 파일은 `requireProject`·`fetchSnapshot`을
 * 부르는 몇 줄이다 — `wireb page get`·`wireb lint`가 부르는 것과 **같은 함수**다.
 *
 * # 프로젝트를 세션이 정하지 않는다 (D4)
 *
 * §12.1이 *"이 리포가 어느 설계 프로젝트에 대응하는가"*를 `.wirebound.json`에 담았고
 * 그것이 리포 바인딩의 존재 이유다. 도구는 `projectId`를 **인자로 안 받는다**
 * (`tools.ts`의 머리말). 어디서부터 찾는지도 CLI가 이미 정했다 — `io.cwd`에서 위로.
 *
 * # 도구마다 스냅샷을 다시 받는다 — **캐시하지 않는다**
 *
 * 에이전트는 `get_page`로 읽고 구현하고 한참 뒤에 `validate`를 부른다. 그 사이에 사람이
 * 설계서를 고치면 **캐시한 판은 없는 결함을 말하거나 있는 결함을 놓친다** — `wireb lint`가
 * `pull`의 출력 파일을 안 읽기로 한 것과 **같은 근거**다(P9-3 D7).
 *
 * **대가는 쟀다고 말할 수 없다.** P9-2 이월 §4가 *"페이지가 수백 개인 프로젝트에서
 * `GET .../snapshot`이 얼마나 도는지 안 쟀다"*를 열어 뒀고 여기서도 안 쟀다 — 다만
 * **에이전트가 사람보다 자주 부른다**는 것이 새로 생긴 사정이므로 이월에 적는다.
 */
import {
  fetchSnapshot,
  requireProject,
  type Io,
  type ProjectAccess,
  type SnapshotPayload,
} from '@wirebound/cli/embed'

export interface OpenProject {
  access: ProjectAccess
  payload: SnapshotPayload
}

/**
 * 바인딩·자격을 찾고 스냅샷을 받는다.
 *
 * **던지는 것은 전부 `CliError`다** — 바인딩이 없다(2) · 자격이 없다(2) · 서버가 거절했다(3) ·
 * 서버에 못 닿았다(4). `server.ts`가 그것을 `isError: true` 결과로 접는다(D8).
 */
export async function openProject(io: Io): Promise<OpenProject> {
  const access = await requireProject(io)
  const payload = await fetchSnapshot(io, access)
  return { access, payload }
}

/**
 * 응답 머리에 붙는 것. **어느 프로젝트를 언제 뜬 것으로 답했는지**를 에이전트가 알아야
 * 한다 — 사람이라면 자기가 친 명령을 기억하지만 에이전트는 여러 리포를 오간다.
 *
 * **토큰은 여기 없다.** `test/no-token-in-response.test.ts`가 응답 전문을 훑어 그것을 잰다.
 */
export function projectHead(open: OpenProject): { server: string; projectId: string; capturedAt: string } {
  return {
    server: open.access.binding.server,
    projectId: open.access.binding.projectId,
    capturedAt: open.payload.capturedAt,
  }
}
