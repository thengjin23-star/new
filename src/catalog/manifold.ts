import type { Product, ProductPort } from './types'

/**
 * 集裝座的通路：共用的供氣（P）與排氣（EA／EB 或單一 R），以及每一站的安裝面與 A、B 出口。
 * 底板式閥裝在某一站時，閥的 P／EA／EB 接到共用通路、A／B 接到該站的出口。
 */
export interface ManifoldLayout {
  common: { P?: string; EA?: string; EB?: string; R?: string }
  stations: { mount: string; number: number; A?: string; B?: string }[]
}

const norm = (s: string) => s.normalize('NFKC').trim().toUpperCase().replace(/[\s_\-．.]/g, '')

const COMMON: Record<keyof ManifoldLayout['common'], readonly string[]> = {
  P: ['P', '1', 'IN', 'SUP', 'P1', '供氣', '進氣'],
  EA: ['EA', 'R1', '5', 'E1', 'EXA'],
  EB: ['EB', 'R2', '3', 'E2', 'EXB'],
  R: ['R', 'E', 'EXH', 'EX', '排氣'],
}

/** 名稱中的站號：「站1」「ST2」「STATION 3」「1」 */
function stationNumber(name: string, index: number): number {
  const m = /(\d+)\s*$/.exec(name)
  return m ? Number(m[1]) : index + 1
}

/** 某一站的出口：A1、1A、A-1、A 1（比對時忽略空白與連字號） */
function outletOf(ports: readonly ProductPort[], letter: 'A' | 'B', n: number): string | undefined {
  const names = [`${letter}${n}`, `${n}${letter}`]
  return ports.find((p) => names.includes(norm(p.name)))?.id
}

/** 依埠的名稱與規格推斷集裝座的通路；沒有安裝面時回傳 undefined */
export function manifoldLayout(product: Pick<Product, 'ports'>): ManifoldLayout | undefined {
  const mounts = product.ports.filter((p) => p.spec?.kind === 'interface')
  if (!mounts.length) return undefined
  const piping = product.ports.filter((p) => p.spec?.kind !== 'interface')
  const common: ManifoldLayout['common'] = {}
  for (const key of Object.keys(COMMON) as (keyof ManifoldLayout['common'])[]) {
    const hit = piping.find((p) => COMMON[key].map(norm).includes(norm(p.name)))
    if (hit) common[key] = hit.id
  }
  const stations = mounts.map((mount, i) => {
    const number = stationNumber(mount.name, i)
    return { mount: mount.id, number, A: outletOf(piping, 'A', number), B: outletOf(piping, 'B', number) }
  })
  return { common, stations }
}
