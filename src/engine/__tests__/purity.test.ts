/// <reference types="node" />
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const engineDir = fileURLToPath(new URL('..', import.meta.url))

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sourceFiles(path)
    return [path]
  })
}

describe('引擎純度', () => {
  const files = sourceFiles(engineDir)

  it('只有 .ts 檔（沒有 JSX）', () => {
    expect(files.filter((f) => !f.endsWith('.ts')).map((f) => relative(engineDir, f))).toEqual([])
  })

  it('不 import React、React Flow、Zustand 或任何 UI 程式碼', () => {
    const forbidden = /from\s+['"](react|react-dom|@xyflow\/[^'"]*|zustand[^'"]*|\.\.\/(\.\.\/)*(components|store|hooks)[^'"]*)['"]/
    const offenders = files.filter((f) => forbidden.test(readFileSync(f, 'utf8')))
    expect(offenders.map((f) => relative(engineDir, f))).toEqual([])
  })
})
