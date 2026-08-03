import type { z } from 'zod'
import { getKoreanErrorMap } from '@wirebound/schema'
import { badRequest, type ApiErrorIssue } from '../errors'

/**
 * 요청의 한 부위(body/params/query)를 스키마로 검증하는 공통 본문.
 * 실패하면 zod 이슈를 `{ path, message }` 형태로 옮겨 담아 `badRequest`로 던진다 —
 * zod 내부 이슈 객체를 그대로 응답에 싣지 않기 위해서다.
 */
function parseWith<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value, { error: getKoreanErrorMap() })
  if (parsed.success) return parsed.data

  const issues: ApiErrorIssue[] = parsed.error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }))
  throw badRequest('요청을 처리할 수 없습니다', issues)
}

/** 요청 본문을 검증한다. */
export function parseBody<T>(schema: z.ZodType<T>, value: unknown): T {
  return parseWith(schema, value)
}

/** 경로 파라미터를 검증한다. */
export function parseParams<T>(schema: z.ZodType<T>, value: unknown): T {
  return parseWith(schema, value)
}

/** 쿼리 스트링을 검증한다. */
export function parseQuery<T>(schema: z.ZodType<T>, value: unknown): T {
  return parseWith(schema, value)
}
