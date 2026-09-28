import {
  assembleWire,
  cast,
  exportSTEP,
  getOC,
  importSTEP,
  makeBSplineApproximation,
  makeCircle,
  makeFace,
  measureVolume,
  type AnyShape,
  type Shape3D,
  type Wire,
} from 'replicad'
import { bezierLength, bezierPoint } from '../assembly/tubes'
import { rotationAxisAngle } from '../geometry/mat4'
import { normalize, sub, type Vec3 } from '../geometry/vec3'

/**
 * STEP 組立檔：把每個零件的原始 STEP 檔讀進 OpenCascade（replicad），依模組中的位置轉換後，
 * 寫成一個 STEP 檔（每個零件是一個有名稱、顏色的實體，可在 SolidWorks、Inventor、Fusion 等開啟）。
 * PU 管沿與畫面相同的貝茲曲線掃出圓管實體。呼叫前須先用 setOC 載入 OpenCascade。
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

export interface StepTube {
  /** 例如「10_PU 管 Ø6_1」 */
  name: string
  /** 三次貝茲曲線的 4 個控制點（模組座標，mm）；起點與終點在兩端的埠口 */
  points: readonly Vec3[]
  /** 外徑、內徑（mm） */
  od: number
  id: number
  /** #rrggbb */
  color?: string
}

/**
 * 沿三次貝茲曲線掃出圓管（環形斷面，兩端斷面與曲線垂直）。
 * OpenCascade 直接以貝茲曲線掃出會退化成平面，所以先在曲線上取樣、近似成 B-spline；
 * 體積與「斷面積 × 曲線長」差太多時加密取樣再做一次。
 */
export function sweepTube(tube: Pick<StepTube, 'points' | 'od' | 'id'>): AnyShape {
  const [start, next] = tube.points
  const dir = normalize(sub(next, start))
  const expected = (Math.PI / 4) * (tube.od ** 2 - tube.id ** 2) * bezierLength(tube.points, 200)
  let best: { shape: AnyShape; error: number } | undefined
  for (const samples of [48, 96]) {
    const shape = sweepOnce(tube, start, dir, samples)
    const error = volumeError(shape, expected)
    if (!best || error < best.error) {
      best?.shape.delete()
      best = { shape, error }
    } else shape.delete()
    if (error < 0.02) break
  }
  return best!.shape
}

function volumeError(shape: AnyShape, expected: number): number {
  try {
    return Math.abs(measureVolume(shape as Shape3D) / expected - 1)
  } catch {
    return Infinity
  }
}

function sweepOnce(tube: Pick<StepTube, 'points' | 'od' | 'id'>, start: Vec3, dir: Vec3, samples: number): AnyShape {
  const oc = getOC()
  const points = Array.from({ length: samples + 1 }, (_, i) => bezierPoint(tube.points, i / samples))
  const spine = assembleWire([makeBSplineApproximation(points, { tolerance: 1e-4 })])
  // 環形斷面：內圓反向後作為孔
  const inner = assembleWire([makeCircle(tube.id / 2, start, dir)])
  const hole = cast(inner.wrapped.Reversed()) as Wire
  const ring = makeFace(assembleWire([makeCircle(tube.od / 2, start, dir)]), [hole])
  const pipe = new oc.BRepOffsetAPI_MakePipe(spine.wrapped, ring.wrapped)
  try {
    if (!pipe.IsDone()) throw new Error('PU 管掃出失敗')
    return cast(pipe.Shape())
  } finally {
    pipe.delete()
    ring.delete()
    hole.delete()
    inner.delete()
    spine.delete()
  }
}

export async function buildAssemblyStep(
  files: ReadonlyMap<string, Uint8Array>,
  parts: readonly StepPart[],
  onProgress?: (done: number, total: number) => void,
  tubes: readonly StepTube[] = [],
): Promise<Uint8Array> {
  const bases = new Map<string, AnyShape>()
  const placed: { shape: AnyShape; name: string; color?: string }[] = []
  const total = parts.length + tubes.length
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
      onProgress?.(i + 1, total)
    }
    for (const [i, tube] of tubes.entries()) {
      placed.push({ shape: sweepTube(tube), name: tube.name, color: tube.color })
      onProgress?.(parts.length + i + 1, total)
    }
    const blob = exportSTEP(placed, { unit: 'MM' })
    return new Uint8Array(await blob.arrayBuffer())
  } finally {
    for (const p of placed) p.shape.delete()
    for (const b of bases.values()) b.delete()
  }
}
