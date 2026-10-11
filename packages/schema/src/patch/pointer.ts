import { PatchError } from './types'

/**
 * 프로토타입 오염으로 이어지는 토큰. 문서에는 이런 이름의 키가 없으므로 정상 경로는 막지 않는다.
 * 여기서 한 번 막으면 apply·inverse·getByPointer가 모두 보호된다.
 */
const BLOCKED_TOKENS = new Set(['__proto__', 'constructor', 'prototype'])

export function parsePointer(pointer: string): string[] {
  if (pointer === '') return []
  if (!pointer.startsWith('/')) {
    throw new PatchError(`잘못된 JSON Pointer: ${pointer}`, pointer)
  }

  const tokens = pointer
    .slice(1)
    .split('/')
    .map((token) => token.replace(/~1/g, '/').replace(/~0/g, '~'))

  for (const token of tokens) {
    if (BLOCKED_TOKENS.has(token)) {
      throw new PatchError(`쓸 수 없는 JSON Pointer 토큰입니다: ${token}`, pointer)
    }
  }

  return tokens
}

export function formatPointer(tokens: string[]): string {
  if (tokens.length === 0) return ''
  return `/${tokens.map((token) => String(token).replace(/~/g, '~0').replace(/\//g, '~1')).join('/')}`
}

/**
 * 컨테이너가 **직접 가진** 값만 읽는다. 프로토타입 체인은 타지 않는다.
 * `/toString`처럼 상속된 멤버를 가리키는 경로는 undefined다.
 */
export function readMember(container: unknown, token: string): unknown {
  if (Array.isArray(container)) return container[Number(token)]
  if (container === null || typeof container !== 'object') return undefined
  return Object.hasOwn(container, token) ? (container as Record<string, unknown>)[token] : undefined
}

export function getByPointer(doc: unknown, pointer: string): unknown {
  let current: unknown = doc
  for (const token of parsePointer(pointer)) {
    if (current === null || current === undefined) return undefined
    current = readMember(current, token)
  }
  return current
}
