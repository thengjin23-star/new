import type { Layer, Primitive, Pt } from './types'

/**
 * 把迴路符號的 SVG（renderToStaticMarkup 的輸出）轉成圖紙圖元。
 * 只支援符號用到的元素：g、line、polyline、polygon、rect、circle、ellipse、path（M L H V Q C A Z）、text；
 * 支援 transform（translate、rotate、scale、matrix）與 stroke／fill／stroke-width 的繼承。
 * 出圖一律用黑線、白底（彩色的模擬狀態不列印）。
 */

/** 仿射矩陣 [a, b, c, d, e, f]：x' = a·x + c·y + e，y' = b·x + d·y + f（與 SVG 相同） */
export type Affine = readonly [number, number, number, number, number, number]

export const IDENTITY: Affine = [1, 0, 0, 1, 0, 0]

export function multiply(m: Affine, n: Affine): Affine {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ]
}

export const translate = (x: number, y: number): Affine => [1, 0, 0, 1, x, y]
export const scale = (sx: number, sy = sx): Affine => [sx, 0, 0, sy, 0, 0]
export function rotate(deg: number, cx = 0, cy = 0): Affine {
  const r = (deg * Math.PI) / 180
  const c = Math.cos(r)
  const s = Math.sin(r)
  return multiply(translate(cx, cy), multiply([c, s, -s, c, 0, 0], translate(-cx, -cy)))
}

export const apply = (m: Affine, x: number, y: number): Pt => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]

/** 解析 transform 屬性 */
export function parseTransform(text: string | undefined): Affine {
  let m = IDENTITY
  if (!text) return m
  for (const [, name, args] of text.matchAll(/(\w+)\s*\(([^)]*)\)/g)) {
    const v = args
      .trim()
      .split(/[\s,]+/)
      .filter(Boolean)
      .map(Number)
    let t: Affine = IDENTITY
    if (name === 'translate') t = translate(v[0] ?? 0, v[1] ?? 0)
    else if (name === 'rotate') t = rotate(v[0] ?? 0, v[1] ?? 0, v[2] ?? 0)
    else if (name === 'scale') t = scale(v[0] ?? 1, v[1] ?? v[0] ?? 1)
    else if (name === 'matrix' && v.length === 6) t = v as unknown as Affine
    m = multiply(m, t)
  }
  return m
}

/** style 屬性中的 CSS transform（閥的閥位視窗以 translateX 移動）；SVG 元素的 transform-origin 為 0 0 */
export function parseCssTransform(style: string | undefined): Affine | undefined {
  const m = style && /(?:^|;)\s*transform\s*:\s*([^;]+)/.exec(style)
  if (!m || m[1].trim() === 'none') return undefined
  let t = IDENTITY
  for (const [, name, args] of m[1].matchAll(/([\w]+)\s*\(([^)]*)\)/g)) {
    const v = args.split(/[\s,]+/).filter(Boolean).map((a) => parseFloat(a))
    let f: Affine = IDENTITY
    if (name === 'translateX') f = translate(v[0] ?? 0, 0)
    else if (name === 'translateY') f = translate(0, v[0] ?? 0)
    else if (name === 'translate') f = translate(v[0] ?? 0, v[1] ?? 0)
    else if (name === 'rotate') f = rotate(v[0] ?? 0)
    else if (name === 'scale') f = scale(v[0] ?? 1, v[1] ?? v[0] ?? 1)
    else if (name === 'scaleX') f = scale(v[0] ?? 1, 1)
    else if (name === 'scaleY') f = scale(1, v[0] ?? 1)
    t = multiply(t, f)
  }
  return t
}

interface Element {
  tag: string
  attrs: Record<string, string>
  children: Element[]
  text: string
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
const unescape = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (all, e: string) =>
    e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : (ENTITIES[e] ?? all),
  )

/** 很小的 XML 解析器（renderToStaticMarkup 的輸出格式固定、沒有 CDATA） */
export function parseMarkup(markup: string): Element {
  const root: Element = { tag: '#root', attrs: {}, children: [], text: '' }
  const stack = [root]
  const re = /<!--[\s\S]*?-->|<\/([\w:-]+)\s*>|<([\w:-]+)((?:\s+[\w:-]+(?:\s*=\s*"[^"]*")?)*)\s*(\/?)>|([^<]+)/g
  for (const m of markup.matchAll(re)) {
    const top = stack[stack.length - 1]
    if (m[1]) {
      if (stack.length > 1) stack.pop()
    } else if (m[2]) {
      const attrs: Record<string, string> = {}
      for (const a of m[3].matchAll(/([\w:-]+)(?:\s*=\s*"([^"]*)")?/g)) attrs[a[1]] = unescape(a[2] ?? '')
      const el: Element = { tag: m[2], attrs, children: [], text: '' }
      top.children.push(el)
      if (!m[4]) stack.push(el)
    } else if (m[5]) {
      top.text += unescape(m[5])
    }
  }
  return root
}

// ---------------------------------------------------------------------------------------------
// path

/** 把 SVG path 轉成數條折線（曲線、圓弧以短線段近似） */
export function pathToPolylines(d: string): { points: Pt[]; closed: boolean }[] {
  const tokens = d.match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g) ?? []
  const out: { points: Pt[]; closed: boolean }[] = []
  let current: Pt[] = []
  let x = 0
  let y = 0
  let startX = 0
  let startY = 0
  let cmd = ''
  let i = 0
  const num = () => Number(tokens[i++])
  const flush = (closed: boolean) => {
    if (current.length > 1) out.push({ points: current, closed })
    current = []
  }
  while (i < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[i])) cmd = tokens[i++]
    const rel = cmd === cmd.toLowerCase()
    const ox = rel ? x : 0
    const oy = rel ? y : 0
    switch (cmd.toUpperCase()) {
      case 'M': {
        flush(false)
        x = ox + num()
        y = oy + num()
        startX = x
        startY = y
        current = [[x, y]]
        cmd = rel ? 'l' : 'L' // 後續的座標對視為 L
        break
      }
      case 'L':
        x = ox + num()
        y = oy + num()
        current.push([x, y])
        break
      case 'H':
        x = ox + num()
        current.push([x, y])
        break
      case 'V':
        y = oy + num()
        current.push([x, y])
        break
      case 'Q': {
        const cx = ox + num()
        const cy = oy + num()
        const ex = ox + num()
        const ey = oy + num()
        for (let k = 1; k <= 12; k++) {
          const t = k / 12
          current.push([(1 - t) ** 2 * x + 2 * (1 - t) * t * cx + t * t * ex, (1 - t) ** 2 * y + 2 * (1 - t) * t * cy + t * t * ey])
        }
        x = ex
        y = ey
        break
      }
      case 'C': {
        const c1x = ox + num()
        const c1y = oy + num()
        const c2x = ox + num()
        const c2y = oy + num()
        const ex = ox + num()
        const ey = oy + num()
        for (let k = 1; k <= 16; k++) {
          const t = k / 16
          const u = 1 - t
          current.push([u ** 3 * x + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t ** 3 * ex, u ** 3 * y + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t ** 3 * ey])
        }
        x = ex
        y = ey
        break
      }
      case 'A': {
        const rx = Math.abs(num())
        const ry = Math.abs(num())
        const phi = num()
        const large = num() !== 0
        const sweep = num() !== 0
        const ex = ox + num()
        const ey = oy + num()
        current.push(...arcPoints(x, y, rx, ry, phi, large, sweep, ex, ey))
        x = ex
        y = ey
        break
      }
      case 'Z':
        if (current.length) current.push([startX, startY])
        x = startX
        y = startY
        flush(true)
        current = [[x, y]]
        break
      default:
        i++ // 不支援的指令：略過
    }
  }
  flush(false)
  return out
}

/** SVG 圓弧（端點參數）→ 折線上的點（不含起點），依 SVG 規格 F.6.5 換算圓心 */
function arcPoints(x1: number, y1: number, rx: number, ry: number, phiDeg: number, large: boolean, sweep: boolean, x2: number, y2: number): Pt[] {
  if (rx < 1e-9 || ry < 1e-9) return [[x2, y2]]
  const phi = (phiDeg * Math.PI) / 180
  const cos = Math.cos(phi)
  const sin = Math.sin(phi)
  const dx = (x1 - x2) / 2
  const dy = (y1 - y2) / 2
  const x1p = cos * dx + sin * dy
  const y1p = -sin * dx + cos * dy
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry)
  if (lambda > 1) {
    rx *= Math.sqrt(lambda)
    ry *= Math.sqrt(lambda)
  }
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p
  const coef = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num / den))
  const cxp = (coef * rx * y1p) / ry
  const cyp = (-coef * ry * x1p) / rx
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2
  const cy = sin * cxp + cos * cyp + (y1 + y2) / 2
  const angle = (ux: number, uy: number, vx: number, vy: number) => {
    const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy)
    return a
  }
  const t1 = angle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry)
  let dt = angle((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry)
  if (!sweep && dt > 0) dt -= 2 * Math.PI
  else if (sweep && dt < 0) dt += 2 * Math.PI
  const n = Math.max(4, Math.ceil(Math.abs(dt) / (Math.PI / 16)))
  const pts: Pt[] = []
  for (let k = 1; k <= n; k++) {
    const t = t1 + (dt * k) / n
    const px = rx * Math.cos(t)
    const py = ry * Math.sin(t)
    pts.push([cos * px - sin * py + cx, sin * px + cos * py + cy])
  }
  return pts
}

// ---------------------------------------------------------------------------------------------

interface Style {
  stroke?: string
  fill?: string
  strokeWidth: number
  dash?: number[]
  fontSize: number
  textAnchor?: string
}

const NONE = new Set(['none', 'transparent'])
const isWhite = (c: string | undefined) => !!c && /^(white|#fff|#ffffff)$/i.test(c.trim())

export interface MarkupOptions {
  layer?: Layer
  /** 線寬換算：輸入為轉換後的線寬（單位同輸出），回傳要用的線寬 */
  lineWidth?: (w: number) => number
  textColor?: string
}

/**
 * SVG 標記 → 圖元（座標經過 matrix 轉換）。
 * 顏色：有描邊的一律黑色；填色為白色的保留白色（遮住下層），其他填色改為黑色。
 */
export function markupToPrimitives(markup: string, matrix: Affine, options: MarkupOptions = {}): Primitive[] {
  const layer = options.layer ?? 'SYMBOL'
  const out: Primitive[] = []
  const unit = (m: Affine) => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]))
  const width = (w: number, m: Affine) => (options.lineWidth ? options.lineWidth(w * unit(m)) : w * unit(m))
  const fillOf = (s: Style) => (s.fill === undefined || NONE.has(s.fill) ? undefined : isWhite(s.fill) ? '#ffffff' : '#000000')
  const strokeOf = (s: Style) => s.stroke !== undefined && !NONE.has(s.stroke)

  const shape = (points: Pt[], closed: boolean, s: Style, m: Affine) => {
    const fill = closed ? fillOf(s) : undefined
    const stroked = strokeOf(s)
    if (!fill && !stroked) return
    out.push({
      kind: 'polyline',
      layer,
      points: points.map(([x, y]) => apply(m, x, y)),
      closed,
      width: stroked ? width(s.strokeWidth, m) : 0.01,
      dash: s.dash?.map((v) => v * unit(m)),
      fill,
    })
  }

  const visit = (el: Element, parent: Style, pm: Affine) => {
    const a = el.attrs
    // CSS 的 transform 優先於 transform 屬性
    const local = parseCssTransform(a.style) ?? (a.transform ? parseTransform(a.transform) : undefined)
    const m = local ? multiply(pm, local) : pm
    const s: Style = {
      stroke: a.stroke ?? parent.stroke,
      fill: a.fill ?? parent.fill,
      strokeWidth: a['stroke-width'] !== undefined ? Number(a['stroke-width']) : parent.strokeWidth,
      dash: a['stroke-dasharray'] ? a['stroke-dasharray'].split(/[\s,]+/).map(Number) : parent.dash,
      fontSize: a['font-size'] !== undefined ? Number(a['font-size']) : parent.fontSize,
      textAnchor: a['text-anchor'] ?? parent.textAnchor,
    }
    const n = (k: string) => Number(a[k] ?? 0)
    switch (el.tag) {
      case 'title':
      case 'desc':
      case 'defs':
        return
      case 'line':
        shape(
          [
            [n('x1'), n('y1')],
            [n('x2'), n('y2')],
          ],
          false,
          s,
          m,
        )
        return
      case 'polyline':
      case 'polygon': {
        const v = (a.points ?? '').trim().split(/[\s,]+/).map(Number)
        const pts: Pt[] = []
        for (let i = 0; i + 1 < v.length; i += 2) pts.push([v[i], v[i + 1]])
        if (pts.length > 1) shape(pts, el.tag === 'polygon', s, m)
        return
      }
      case 'rect': {
        const [x, y, w, h] = [n('x'), n('y'), n('width'), n('height')]
        shape(
          [
            [x, y],
            [x + w, y],
            [x + w, y + h],
            [x, y + h],
          ],
          true,
          s,
          m,
        )
        return
      }
      case 'circle':
      case 'ellipse': {
        const rx = el.tag === 'circle' ? n('r') : n('rx')
        const ry = el.tag === 'circle' ? n('r') : n('ry')
        const [cx, cy] = [n('cx'), n('cy')]
        const k = unit(m)
        const uniform = Math.abs(rx - ry) < 1e-9 && Math.abs(Math.abs(m[0] * m[3] - m[1] * m[2]) - k * k) < 1e-9 && Math.abs(m[0] * m[2] + m[1] * m[3]) < 1e-9
        if (uniform && (strokeOf(s) || fillOf(s))) {
          out.push({ kind: 'circle', layer, center: apply(m, cx, cy), r: rx * k, width: strokeOf(s) ? width(s.strokeWidth, m) : 0.01, fill: fillOf(s) })
          return
        }
        const pts: Pt[] = []
        for (let i = 0; i < 48; i++) pts.push([cx + rx * Math.cos((i / 48) * 2 * Math.PI), cy + ry * Math.sin((i / 48) * 2 * Math.PI)])
        shape(pts, true, s, m)
        return
      }
      case 'path':
        for (const p of pathToPolylines(a.d ?? '')) shape(p.points, p.closed, s, m)
        return
      case 'text': {
        const text = (el.text + el.children.map((c) => c.text).join('')).replace(/\s+/g, ' ').trim()
        if (!text) return
        const [x, y] = [n('x'), n('y')]
        const baseline = a['dominant-baseline']
        const angle = (Math.atan2(-m[1], m[0]) * 180) / Math.PI
        out.push({
          kind: 'text',
          layer: 'TEXT',
          at: apply(m, x, y),
          text,
          size: s.fontSize * unit(m),
          align: s.textAnchor === 'middle' ? 'center' : s.textAnchor === 'end' ? 'right' : 'left',
          valign: baseline === 'central' || baseline === 'middle' ? 'middle' : baseline === 'hanging' ? 'top' : 'baseline',
          angle: Math.abs(angle) < 1e-6 ? undefined : Math.round(angle * 1000) / 1000,
          color: options.textColor,
        })
        return
      }
      default:
        for (const c of el.children) visit(c, s, m)
    }
  }
  const root = parseMarkup(markup)
  const base: Style = { strokeWidth: 1, fontSize: 16, fill: 'black' }
  for (const c of root.children) visit(c, base, matrix)
  return out
}
