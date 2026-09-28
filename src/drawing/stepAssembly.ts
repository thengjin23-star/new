import { exportSTEP, importSTEP, type AnyShape } from 'replicad'
import { rotationAxisAngle } from '../geometry/mat4'

/**
 * STEP 組立檔：把每個零件的原始 STEP 檔讀進 OpenCascade（replicad），依模組中的位置轉換後，
 * 寫成一個 STEP 檔（每個零件是一個有名稱、顏色的實體，可在 SolidWorks、Inventor、Fusion 等開啟）。
 * 呼叫前須先用 setOC 載入 OpenCascade。
 */
export interface StepPart {
  /** 例如「1_DEMO-VALVE-52-01」 */
  name: string
  /** 原始檔的 sha256（同一個產品只讀一次） */
  source: string
  /** 零件 → 模組座標（column-major 4×4） */
  matrix: ArrayLike<number>
  /** #rrggbb */
  color?: string
}

export async function buildAssemblyStep(
  files: ReadonlyMap<string, Uint8Array>,
  parts: readonly StepPart[],
  onProgress?: (done: number, total: number) => void,
): Promise<Uint8Array> {
  const bases = new Map<string, AnyShape>()
  const placed: { shape: AnyShape; name: string; color?: string }[] = []
  try {
    for (const [i, part] of parts.entries()) {
      let base = bases.get(part.source)
      if (!base) {
        const bytes = files.get(part.source)
        if (!bytes) throw new Error(`缺少「${part.name}」的 STEP 檔`)
        base = await importSTEP(new Blob([bytes as Uint8Array<ArrayBuffer>]))
        bases.set(part.source, base)
      }
      // replicad 的轉換會刪除原本的形狀：先複製
      let shape = base.clone()
      const { axis, angle } = rotationAxisAngle(part.matrix)
      if (angle > 1e-9) shape = shape.rotate((angle * 180) / Math.PI, [0, 0, 0], axis)
      const m = part.matrix
      if (Math.abs(m[12]) + Math.abs(m[13]) + Math.abs(m[14]) > 0) shape = shape.translate([m[12], m[13], m[14]])
      placed.push({ shape, name: part.name, color: part.color })
      onProgress?.(i + 1, parts.length)
    }
    const blob = exportSTEP(placed, { unit: 'MM' })
    return new Uint8Array(await blob.arrayBuffer())
  } finally {
    for (const p of placed) p.shape.delete()
    for (const b of bases.values()) b.delete()
  }
}
