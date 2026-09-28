import type { Vec3 } from '../geometry/vec3'

/**
 * 由三角網格產生正投影視圖的可見線與隱藏線（不需要 OpenCascade）：
 *
 * 1. 特徵邊：B-rep 面的交界且兩側夾角大於 featureAngle、開放邊界、非流形邊（與視角無關，每個產品算一次）
 * 2. 輪廓邊：同一曲面內（或平滑相接）的邊，兩側三角形一個朝向觀察者、一個背向
 * 3. 以 CPU 光柵化建立深度緩衝（同時記下每個像素屬於哪個 BOM 項次，供件號氣球定位）
 * 4. 沿每條邊取樣：3×3 鄰域中只要有一個像素不在它前面就算可見，分段成可見線與隱藏線
 *
 * 純函式、只用 typed array，可在 Web Worker 中執行，也能在 Node 測試。
 */

export interface ProjectionMesh {
  /** 同一個產品的網格共用同一個 key，邊的分析結果可重複使用 */
  key: string
  positions: Float32Array
  indices: Uint32Array
  /** 每個 B-rep 面的三角形範圍 [first0, last0, first1, last1, …]（含頭含尾） */
  faceRanges: Uint32Array
  /** 零件座標 → 世界座標（column-major 4×4） */
  matrix: ArrayLike<number>
  /** BOM 項次（件號氣球用）；0 表示不標 */
  item: number
}

/** 視角：forward 指向觀察者；right、up 為圖面上的 x、y 方向 */
export interface ViewBasis {
  forward: Vec3
  right: Vec3
  up: Vec3
}

export interface ProjectOptions {
  /** 深度緩衝最長邊的像素數（預設 2400） */
  maxPixels?: number
  /** 每 mm 最多幾個像素（預設 12） */
  maxScale?: number
  /** 特徵邊的最小夾角（度，預設 20） */
  featureAngle?: number
  /** 是否計算隱藏線（預設 true） */
  hidden?: boolean
  /** 要判斷是否看得到的點（世界座標，例如對外接口的位置） */
  points?: readonly Vec3[]
}

export interface ProjectedView {
  /** 線段 x1,y1,x2,y2（視圖座標 mm，x 向右、y 向上） */
  visible: Float32Array
  hidden: Float32Array
  bounds: { minX: number; maxX: number; minY: number; maxY: number }
  /** 每個 BOM 項次一個點（件號氣球的引線終點）：看得到的零件取可見像素的中心附近，完全被擋住的取外框中心 */
  anchors: { item: number; x: number; y: number; visible: boolean }[]
  /** options.points 投影後的位置與是否看得到 */
  points: { x: number; y: number; visible: boolean }[]
}

export interface EdgeData {
  welded: Float32Array
  /** 原始頂點 → 焊接後的頂點 */
  remap: Uint32Array
  triNormals: Float32Array
  /** 特徵邊：a,b（焊接後頂點） */
  feature: Uint32Array
  /** 可能成為輪廓的邊：a,b,t1,t2 */
  candidates: Uint32Array
}

const WELD = 1000 // 以 0.001 mm 為單位合併重合的頂點

/** 找出網格的特徵邊與輪廓候選邊（與視角無關） */
export function analyzeEdges(positions: Float32Array, indices: Uint32Array, faceRanges: Uint32Array, featureAngle = 20): EdgeData {
  // 1. 焊接頂點：各個 B-rep 面的三角網格在交界處頂點重複，合併後才找得到相鄰關係
  const vertexCount = positions.length / 3
  const remap = new Uint32Array(vertexCount)
  const lookup = new Map<string, number>()
  const weldedList: number[] = []
  for (let v = 0; v < vertexCount; v++) {
    const x = positions[v * 3]
    const y = positions[v * 3 + 1]
    const z = positions[v * 3 + 2]
    const key = `${Math.round(x * WELD)},${Math.round(y * WELD)},${Math.round(z * WELD)}`
    let id = lookup.get(key)
    if (id === undefined) {
      id = weldedList.length / 3
      lookup.set(key, id)
      weldedList.push(x, y, z)
    }
    remap[v] = id
  }
  const welded = Float32Array.from(weldedList)
  const weldedCount = welded.length / 3

  // 2. 每個三角形屬於哪個 B-rep 面、法向量
  const triCount = indices.length / 3
  const triFace = new Int32Array(triCount).fill(-1)
  for (let k = 0; k < faceRanges.length; k += 2) {
    for (let t = faceRanges[k]; t <= faceRanges[k + 1] && t < triCount; t++) triFace[t] = k / 2
  }
  const triNormals = new Float32Array(triCount * 3)
  const valid = new Uint8Array(triCount)
  for (let t = 0; t < triCount; t++) {
    const a = remap[indices[t * 3]] * 3
    const b = remap[indices[t * 3 + 1]] * 3
    const c = remap[indices[t * 3 + 2]] * 3
    const ux = welded[b] - welded[a]
    const uy = welded[b + 1] - welded[a + 1]
    const uz = welded[b + 2] - welded[a + 2]
    const vx = welded[c] - welded[a]
    const vy = welded[c + 1] - welded[a + 1]
    const vz = welded[c + 2] - welded[a + 2]
    const nx = uy * vz - uz * vy
    const ny = uz * vx - ux * vz
    const nz = ux * vy - uy * vx
    const len = Math.hypot(nx, ny, nz)
    if (len < 1e-12) continue // 退化三角形不參與
    valid[t] = 1
    triNormals[t * 3] = nx / len
    triNormals[t * 3 + 1] = ny / len
    triNormals[t * 3 + 2] = nz / len
  }

  // 3. 列出所有三角形的邊，依（小頂點, 大頂點）排序後分組
  const edgeA: number[] = []
  const edgeB: number[] = []
  const edgeT: number[] = []
  for (let t = 0; t < triCount; t++) {
    if (!valid[t]) continue
    for (let k = 0; k < 3; k++) {
      const p = remap[indices[t * 3 + k]]
      const q = remap[indices[t * 3 + ((k + 1) % 3)]]
      if (p === q) continue
      edgeA.push(Math.min(p, q))
      edgeB.push(Math.max(p, q))
      edgeT.push(t)
    }
  }
  const edgeCount = edgeA.length
  const keys = new Float64Array(edgeCount)
  for (let e = 0; e < edgeCount; e++) keys[e] = edgeA[e] * weldedCount + edgeB[e]
  const order = new Uint32Array(edgeCount)
  for (let e = 0; e < edgeCount; e++) order[e] = e
  order.sort((i, j) => keys[i] - keys[j])

  const cosFeature = Math.cos((featureAngle * Math.PI) / 180)
  const feature: number[] = []
  const candidates: number[] = []
  for (let start = 0; start < edgeCount; ) {
    let end = start + 1
    while (end < edgeCount && keys[order[end]] === keys[order[start]]) end++
    const e0 = order[start]
    const a = edgeA[e0]
    const b = edgeB[e0]
    const n = end - start
    if (n === 2) {
      const t1 = edgeT[e0]
      const t2 = edgeT[order[start + 1]]
      const dot =
        triNormals[t1 * 3] * triNormals[t2 * 3] +
        triNormals[t1 * 3 + 1] * triNormals[t2 * 3 + 1] +
        triNormals[t1 * 3 + 2] * triNormals[t2 * 3 + 2]
      if (triFace[t1] !== triFace[t2] && dot < cosFeature) feature.push(a, b)
      else candidates.push(a, b, t1, t2)
    } else {
      // 開放邊界或非流形邊
      feature.push(a, b)
    }
    start = end
  }
  return { welded, remap, triNormals, feature: Uint32Array.from(feature), candidates: Uint32Array.from(candidates) }
}

/** 邊的分析結果快取（key 為網格 key 與特徵角） */
export type EdgeCache = Map<string, EdgeData>

/** 視圖中的一個零件：頂點已轉到視圖座標 */
interface ViewInstance {
  data: EdgeData
  indices: Uint32Array
  vx: Float32Array
  vy: Float32Array
  vz: Float32Array
  /** 觀察方向在零件座標中的向量（判斷三角形朝向） */
  localForward: Vec3
  item: number
}

const dot3 = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

/** 把網格投影成一個視圖 */
export function projectView(
  meshes: readonly ProjectionMesh[],
  view: ViewBasis,
  options: ProjectOptions = {},
  cache: EdgeCache = new Map(),
): ProjectedView {
  const featureAngle = options.featureAngle ?? 20
  const withHidden = options.hidden ?? true

  // ---- 轉到視圖座標並求範圍 ----
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  const instances: ViewInstance[] = []
  const itemBoxes = new Map<number, [number, number, number, number]>()
  for (const mesh of meshes) {
    const cacheKey = `${mesh.key}@${featureAngle}`
    let data = cache.get(cacheKey)
    if (!data) {
      data = analyzeEdges(mesh.positions, mesh.indices, mesh.faceRanges, featureAngle)
      cache.set(cacheKey, data)
    }
    const m = mesh.matrix
    // 視圖座標 = [right; up; forward] · M · p
    const row = (axis: Vec3) => [
      axis[0] * m[0] + axis[1] * m[1] + axis[2] * m[2],
      axis[0] * m[4] + axis[1] * m[5] + axis[2] * m[6],
      axis[0] * m[8] + axis[1] * m[9] + axis[2] * m[10],
      axis[0] * m[12] + axis[1] * m[13] + axis[2] * m[14],
    ]
    const rx = row(view.right)
    const ry = row(view.up)
    const rz = row(view.forward)
    const n = data.welded.length / 3
    const vx = new Float32Array(n)
    const vy = new Float32Array(n)
    const vz = new Float32Array(n)
    const w = data.welded
    for (let i = 0; i < n; i++) {
      const x = w[i * 3]
      const y = w[i * 3 + 1]
      const z = w[i * 3 + 2]
      vx[i] = rx[0] * x + rx[1] * y + rx[2] * z + rx[3]
      vy[i] = ry[0] * x + ry[1] * y + ry[2] * z + ry[3]
      vz[i] = rz[0] * x + rz[1] * y + rz[2] * z + rz[3]
      if (vx[i] < minX) minX = vx[i]
      if (vx[i] > maxX) maxX = vx[i]
      if (vy[i] < minY) minY = vy[i]
      if (vy[i] > maxY) maxY = vy[i]
    }
    // 旋轉部分的轉置乘上 forward = 觀察方向在零件座標中的向量
    const localForward: Vec3 = [rz[0], rz[1], rz[2]]
    instances.push({ data, indices: mesh.indices, vx, vy, vz, localForward, item: mesh.item })
    if (mesh.item > 0 && n > 0) {
      let x0 = Infinity
      let x1 = -Infinity
      let y0 = Infinity
      let y1 = -Infinity
      for (let i = 0; i < n; i++) {
        x0 = Math.min(x0, vx[i])
        x1 = Math.max(x1, vx[i])
        y0 = Math.min(y0, vy[i])
        y1 = Math.max(y1, vy[i])
      }
      const box = itemBoxes.get(mesh.item)
      if (box) itemBoxes.set(mesh.item, [Math.min(box[0], x0), Math.max(box[1], x1), Math.min(box[2], y0), Math.max(box[3], y1)])
      else itemBoxes.set(mesh.item, [x0, x1, y0, y1])
    }
  }
  if (!instances.length || !Number.isFinite(minX)) {
    return {
      visible: new Float32Array(),
      hidden: new Float32Array(),
      bounds: { minX: 0, maxX: 0, minY: 0, maxY: 0 },
      anchors: [],
      points: (options.points ?? []).map(() => ({ x: 0, y: 0, visible: false })),
    }
  }

  // ---- 深度緩衝 ----
  const extent = Math.max(maxX - minX, maxY - minY, 1e-3)
  const scale = Math.min(options.maxScale ?? 12, (options.maxPixels ?? 2400) / extent)
  const W = Math.ceil((maxX - minX) * scale) + 3
  const H = Math.ceil((maxY - minY) * scale) + 3
  const zbuf = new Float32Array(W * H).fill(-Infinity)
  const idbuf = new Int32Array(W * H)
  const toPx = (x: number) => (x - minX) * scale + 1
  const toPy = (y: number) => (maxY - y) * scale + 1

  for (const inst of instances) {
    const { indices, vx, vy, vz } = inst
    const remap = inst.data.remap
    for (let t = 0; t < indices.length; t += 3) {
      const a = remap[indices[t]]
      const b = remap[indices[t + 1]]
      const c = remap[indices[t + 2]]
      const x0 = toPx(vx[a])
      const y0 = toPy(vy[a])
      const x1 = toPx(vx[b])
      const y1 = toPy(vy[b])
      const x2 = toPx(vx[c])
      const y2 = toPy(vy[c])
      const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0)
      if (Math.abs(area) < 1e-9) continue
      const z0 = vz[a]
      const z1 = vz[b]
      const z2 = vz[c]
      const i0 = Math.max(0, Math.floor(Math.min(x0, x1, x2)))
      const i1 = Math.min(W - 1, Math.ceil(Math.max(x0, x1, x2)))
      const j0 = Math.max(0, Math.floor(Math.min(y0, y1, y2)))
      const j1 = Math.min(H - 1, Math.ceil(Math.max(y0, y1, y2)))
      for (let j = j0; j <= j1; j++) {
        const cy = j + 0.5
        for (let i = i0; i <= i1; i++) {
          const cx = i + 0.5
          const w0 = ((x1 - cx) * (y2 - cy) - (x2 - cx) * (y1 - cy)) / area
          if (w0 < -1e-6) continue
          const w1 = ((x2 - cx) * (y0 - cy) - (x0 - cx) * (y2 - cy)) / area
          if (w1 < -1e-6) continue
          const w2 = 1 - w0 - w1
          if (w2 < -1e-6) continue
          const z = w0 * z0 + w1 * z1 + w2 * z2
          const k = j * W + i
          if (z > zbuf[k]) {
            zbuf[k] = z
            idbuf[k] = inst.item
          }
        }
      }
    }
  }

  // ---- 沿邊取樣判斷可見性 ----
  const eps = 0.05 + 1.5 / scale
  const isVisible = (x: number, y: number, z: number) => {
    const i = Math.floor(toPx(x))
    const j = Math.floor(toPy(y))
    for (let dj = -1; dj <= 1; dj++) {
      const jj = j + dj
      if (jj < 0 || jj >= H) return true
      for (let di = -1; di <= 1; di++) {
        const ii = i + di
        if (ii < 0 || ii >= W) return true
        if (zbuf[jj * W + ii] <= z + eps) return true
      }
    }
    return false
  }

  const visible: number[] = []
  const hidden: number[] = []
  const states: boolean[] = []
  const emit = (inst: ViewInstance, a: number, b: number) => {
    const ax = inst.vx[a]
    const ay = inst.vy[a]
    const az = inst.vz[a]
    const bx = inst.vx[b]
    const by = inst.vy[b]
    const bz = inst.vz[b]
    const lengthPx = Math.hypot(bx - ax, by - ay) * scale
    if (lengthPx < 1e-6) return
    const n = Math.max(2, Math.ceil(lengthPx / 0.75))
    states.length = n
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n
      states[k] = isVisible(ax + (bx - ax) * t, ay + (by - ay) * t, az + (bz - az) * t)
    }
    // 去除單一取樣的雜訊（前後相同時跟著前後）
    for (let k = 1; k < n - 1; k++) if (states[k - 1] === states[k + 1] && states[k] !== states[k - 1]) states[k] = states[k - 1]
    let start = 0
    for (let k = 1; k <= n; k++) {
      if (k < n && states[k] === states[start]) continue
      const t0 = start / n
      const t1 = k / n
      const target = states[start] ? visible : hidden
      if (states[start] || withHidden) {
        target.push(ax + (bx - ax) * t0, ay + (by - ay) * t0, ax + (bx - ax) * t1, ay + (by - ay) * t1)
      }
      start = k
    }
  }

  for (const inst of instances) {
    const { feature, candidates, triNormals } = inst.data
    for (let e = 0; e < feature.length; e += 2) emit(inst, feature[e], feature[e + 1])
    const f = inst.localForward
    for (let e = 0; e < candidates.length; e += 4) {
      const t1 = candidates[e + 2]
      const t2 = candidates[e + 3]
      const s1 = triNormals[t1 * 3] * f[0] + triNormals[t1 * 3 + 1] * f[1] + triNormals[t1 * 3 + 2] * f[2]
      const s2 = triNormals[t2 * 3] * f[0] + triNormals[t2 * 3 + 1] * f[1] + triNormals[t2 * 3 + 2] * f[2]
      // 一邊朝向觀察者、另一邊不朝向（背向或剛好側向）：輪廓。
      // 不能用 s1·s2 < 0：圓柱的某個小平面剛好側向（s = 0）時，那條輪廓會整條消失
      if (s1 > 1e-7 !== s2 > 1e-7) emit(inst, candidates[e], candidates[e + 1])
    }
  }

  // ---- 每個 BOM 項次找一個看得到的點（該零件可見像素的重心附近） ----
  const sums = new Map<number, { x: number; y: number; n: number }>()
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const item = idbuf[j * W + i]
      if (item <= 0 || zbuf[j * W + i] === -Infinity) continue
      const s = sums.get(item) ?? { x: 0, y: 0, n: 0 }
      s.x += i
      s.y += j
      s.n++
      sums.set(item, s)
    }
  }
  const best = new Map<number, { i: number; j: number; d: number }>()
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const item = idbuf[j * W + i]
      const s = item > 0 ? sums.get(item) : undefined
      if (!s || zbuf[j * W + i] === -Infinity) continue
      const d = (i - s.x / s.n) ** 2 + (j - s.y / s.n) ** 2
      const cur = best.get(item)
      if (!cur || d < cur.d) best.set(item, { i, j, d })
    }
  }
  const anchors = [...itemBoxes.entries()]
    .map(([item, box]) => {
      const p = best.get(item)
      if (p) return { item, x: (p.i + 0.5 - 1) / scale + minX, y: maxY - (p.j + 0.5 - 1) / scale, visible: true }
      return { item, x: (box[0] + box[1]) / 2, y: (box[2] + box[3]) / 2, visible: false }
    })
    .sort((a, b) => a.item - b.item)

  // ---- 指定的點：投影後用同樣的 3×3 容差判斷是否被擋住 ----
  const points = (options.points ?? []).map((p) => {
    const x = dot3(view.right, p)
    const y = dot3(view.up, p)
    return { x, y, visible: isVisible(x, y, dot3(view.forward, p)) }
  })

  return {
    visible: Float32Array.from(visible),
    hidden: Float32Array.from(hidden),
    bounds: { minX, maxX, minY, maxY },
    anchors,
    points,
  }
}

export type StandardView = 'front' | 'top' | 'right' | 'left' | 'iso'

/**
 * 由「正面朝向」（觀察者在模組的哪一側）與「上方」產生前、上、右、左、等角五個視角。
 * 預設正面為 −Y、上方為 +Z（與 3D 畫面相同）。
 */
export function standardViews(front: Vec3 = [0, -1, 0], upAxis: Vec3 = [0, 0, 1]): Record<StandardView, ViewBasis> {
  const z = upAxis
  // + 0 把 -0 變成 0（輸出的 DXF/SVG 才不會出現「-0」）
  const norm = (v: Vec3): Vec3 => {
    const l = Math.hypot(v[0], v[1], v[2])
    return [v[0] / l + 0, v[1] / l + 0, v[2] / l + 0]
  }
  const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
  const basis = (forward: Vec3, upHint: Vec3): ViewBasis => {
    const f = norm(forward)
    const up = norm([upHint[0] - dot3(upHint, f) * f[0], upHint[1] - dot3(upHint, f) * f[1], upHint[2] - dot3(upHint, f) * f[2]])
    return { forward: f, up, right: norm(cross(up, f)) }
  }
  const f = norm(front)
  const right = norm(cross(z, f)) // 從正面看過去的右手邊
  return {
    front: basis(f, z),
    // 俯視：模組的正面朝下（朝向前視圖）
    top: basis(z, [-f[0], -f[1], -f[2]]),
    right: basis(right, z),
    left: basis([-right[0], -right[1], -right[2]], z),
    iso: basis([f[0] + right[0] + z[0], f[1] + right[1] + z[1], f[2] + right[2] + z[2]], z),
  }
}

/** 把線段串成折線（端點相接、而且每個接點只有兩條線段時才串），減少輸出的檔案大小 */
export function chainSegments(segs: Float32Array, tolerance = 1e-3): number[][] {
  const count = segs.length / 4
  const q = (v: number) => Math.round(v / tolerance)
  const keyOf = (x: number, y: number) => `${q(x)},${q(y)}`
  const at = new Map<string, number[]>()
  for (let s = 0; s < count; s++) {
    for (const end of [0, 1]) {
      const k = keyOf(segs[s * 4 + end * 2], segs[s * 4 + end * 2 + 1])
      const list = at.get(k)
      if (list) list.push(s)
      else at.set(k, [s])
    }
  }
  const used = new Uint8Array(count)
  const chains: number[][] = []
  /** 從 (x, y) 沿著唯一的下一條線段一直走下去，回傳經過的點（不含起點） */
  const walk = (x: number, y: number): number[] => {
    const pts: number[] = []
    for (;;) {
      const list = at.get(keyOf(x, y))!
      if (list.length !== 2) return pts
      const next = list.find((s) => !used[s])
      if (next === undefined) return pts
      used[next] = 1
      const same = q(segs[next * 4]) === q(x) && q(segs[next * 4 + 1]) === q(y)
      x = same ? segs[next * 4 + 2] : segs[next * 4]
      y = same ? segs[next * 4 + 3] : segs[next * 4 + 1]
      pts.push(x, y)
    }
  }
  for (let s = 0; s < count; s++) {
    if (used[s]) continue
    used[s] = 1
    const forward = walk(segs[s * 4 + 2], segs[s * 4 + 3])
    const backward = walk(segs[s * 4], segs[s * 4 + 1])
    // 往回走的點反過來接在前面（每次 unshift 會很慢）
    const points: number[] = []
    for (let i = backward.length - 2; i >= 0; i -= 2) points.push(backward[i], backward[i + 1])
    points.push(segs[s * 4], segs[s * 4 + 1], segs[s * 4 + 2], segs[s * 4 + 3])
    for (const v of forward) points.push(v)
    chains.push(points)
  }
  return chains
}
