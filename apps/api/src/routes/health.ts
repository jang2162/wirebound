import type { FastifyInstance } from 'fastify'

/** 헬스체크 — DB 등 외부 자원 없이 프로세스가 살아 있는지만 답한다. */
export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async () => {
    return { status: 'ok' }
  })
}
