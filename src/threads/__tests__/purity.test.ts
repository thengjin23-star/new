/// <reference types="node" />
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const dir = fileURLToPath(new URL('..', import.meta.url))

describe('螺紋模組純度', () => {
  it('只 import 同資料夾內的模組（不依賴 React、three.js 或其他套件）', () => {
    const files = readdirSync(dir).filter((f) => f.endsWith('.ts'))
    const offenders = files.flatMap((f) =>
      [...readFileSync(join(dir, f), 'utf8').matchAll(/from\s+['"]([^'"]+)['"]/g)]
        .map((m) => m[1])
        .filter((source) => !source.startsWith('./'))
        .map((source) => `${f} → ${source}`),
    )
    expect(offenders).toEqual([])
  })
})
