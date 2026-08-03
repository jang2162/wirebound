export function parsePointer(pointer: string): string[] {
  if (pointer === '') return []
  if (!pointer.startsWith('/')) {
    throw new Error(`잘못된 JSON Pointer: ${pointer}`)
  }
  return pointer
    .slice(1)
    .split('/')
    .map((token) => token.replace(/~1/g, '/').replace(/~0/g, '~'))
}

export function formatPointer(tokens: string[]): string {
  if (tokens.length === 0) return ''
  return `/${tokens
    .map((token) => String(token).replace(/~/g, '~0').replace(/\//g, '~1'))
    .join('/')}`
}

export function getByPointer(doc: unknown, pointer: string): unknown {
  let current: unknown = doc
  for (const token of parsePointer(pointer)) {
    if (current === null || current === undefined) return undefined
    current = Array.isArray(current)
      ? current[Number(token)]
      : (current as Record<string, unknown>)[token]
  }
  return current
}
