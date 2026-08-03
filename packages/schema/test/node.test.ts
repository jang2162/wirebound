import { describe, expect, it } from 'vitest'
import { createNodeId } from '../src/node'

describe('createNodeId', () => {
  it('n_ 접두어와 소문자 hex 12자로 만든다', () => {
    expect(createNodeId()).toMatch(/^n_[0-9a-f]{12}$/)
  })

  it('호출할 때마다 다른 값을 만든다', () => {
    const ids = new Set(Array.from({ length: 500 }, () => createNodeId()))
    expect(ids.size).toBe(500)
  })
})
