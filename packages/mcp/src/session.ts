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
  callApi,
  fetchSnapshot,
  parseJson,
  requireProject,
  type ApiRequest,
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

/**
 * 열린 프로젝트에 요청 하나. **쓰기 둘이 서버를 부르는 자리다**(P9-5 D6).
 *
 * ---
 *
 * # `wireb`에 명령을 만들지 않는다
 *
 * §12.3의 표에 `wireb patch`도 `wireb comment`도 없다. **§12.2와 §12.3은 서로 다른 표이고**
 * 도구가 CLI 명령을 흉내 내면 종료 코드를 도구 결과로 옮기는 층이 하나 더 생긴다
 * (`embed.ts`의 *"`bin`은 안 내준다"* 절과 같은 근거). 그래서 `callApi`를 직접 부른다 —
 * `packages/cli`가 **HTTP 클라이언트를 내준다**는 것이 P9-4 D3의 요지이고, 도구가 자기
 * 클라이언트를 갖지 않는 한 자격·헤더·오류 갈래가 한 벌로 남는다.
 *
 * # 서버 주소와 토큰을 부르는 쪽이 조립하지 않는다
 *
 * 두 값을 자리마다 꺼내 쓰면 한 자리가 토큰을 빠뜨렸을 때 **401이 *"권한이 없다"*로 나가고**
 * 원인이 안 보인다. 여기 한 줄로 묶는다.
 */
export async function callProject(io: Io, open: OpenProject, request: Omit<ApiRequest, 'token'>): Promise<unknown> {
  const response = await callApi(io, open.access.binding.server, { ...request, token: open.access.token })
  return parseJson(response, `${request.method} ${request.path}`)
}

/**
 * 그 페이지가 지금 선 revision 번호를 **다시** 읽는다. 없으면 `null`.
 *
 * **409를 받은 뒤에만 부른다**(D4). §7.4의 *"재조회 후 재시도"*를 도구가 지원하는 방법이
 * 이것이다 — 새 번호를 산문이 아니라 **값으로** 실어야 에이전트가 그것으로 다음 걸음을
 * 정한다. **성공 갈래에서는 안 부른다:** 그때는 응답의 `seq`가 곧 새 `headSeq`다.
 */
export async function rereadHeadSeq(io: Io, open: OpenProject, pageId: string): Promise<number | null> {
  const payload = await fetchSnapshot(io, open.access)
  return payload.pages.find((page) => page.id === pageId)?.headSeq ?? null
}
