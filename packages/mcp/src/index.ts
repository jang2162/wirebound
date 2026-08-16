/**
 * `@wirebound/mcp`의 공개 면. **`bin.ts`는 여기 없다** — 그것은 실행 파일이지 모듈이 아니다
 * (`packages/cli`의 `index.ts`와 같은 규칙).
 */
export { createServer, callTool, SERVER_NAME, SERVER_VERSION } from './server'
export { TOOLS, findTool, type ToolSpec, type ToolInputSchema } from './tools'
export { toolResult, toolFailure, isToolFailure, type ToolOutcome } from './outcome'
export { HANDLERS, type ToolHandler } from './handlers'
