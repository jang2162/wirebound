/**
 * 도구 이름 → 구현. **`TOOLS`의 이름을 키로 쓴다** — 표와 구현이 갈리는 경로가 없게
 * `test/tools.test.ts`가 양쪽에서 분모를 만들어 맞댄다.
 *
 * **여기 조립이 없다**(D1). 구현은 전부 `packages/cli`의 읽기 층을 부르고, `wireb`의 세
 * 명령도 같은 층을 부른다 — `test/assembly-census.test.ts`가 그것을 지킨다.
 */
import type { Io } from '@wirebound/cli/embed'
import type { ToolOutcome } from './outcome'

export type ToolHandler = (io: Io, args: Record<string, string>) => Promise<ToolOutcome>

/** T3~T5가 채운다. **빈 채로도 서버는 선다** — 목록을 내는 것과 부르는 것은 다른 일이다. */
export const HANDLERS: Record<string, ToolHandler> = {}
