import {
  LineCapStyle,
  LineJoinStyle,
  PDFDocument,
  appendBezierCurve,
  closePath,
  concatTransformationMatrix,
  degrees,
  fillAndStroke,
  lineTo,
  moveTo,
  popGraphicsState,
  pushGraphicsState,
  rgb,
  setDashPattern,
  setFillingColor,
  setLineCap,
  setLineJoin,
  setLineWidth,
  setStrokingColor,
  stroke,
  type PDFFont,
  type PDFOperator,
  type PDFPage,
  type RGB,
} from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { baselineOffset } from './text'
import type { Primitive, Sheet } from './types'

/** 1 mm = 72/25.4 pt */
const PT = 72 / 25.4
/** 圓的貝茲曲線近似常數 */
const KAPPA = 0.5522847498

function color(hex: string | undefined, fallback: RGB = rgb(0, 0, 0)): RGB {
  const m = hex && /^#([0-9a-f]{6})$/i.exec(hex)
  if (!m) return fallback
  const v = parseInt(m[1], 16)
  return rgb(((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255)
}

/** 圖紙上用到的所有字（縮減字型用） */
export function sheetText(sheets: readonly Sheet[]): string {
  return sheets.map((s) => s.title + s.primitives.map((p) => (p.kind === 'text' ? p.text : '')).join('')).join('')
}

/** 線條、圓：在「mm、y 向下」的座標系中產生 PDF 繪圖指令 */
function shapeOperators(p: Exclude<Primitive, { kind: 'text' | 'image' }>): PDFOperator[] {
  const ops: PDFOperator[] = [setLineWidth(p.width), setStrokingColor(color(p.color))]
  if (p.fill) ops.push(setFillingColor(color(p.fill)))
  if (p.kind === 'polyline') {
    ops.push(setDashPattern(p.dash ? [...p.dash] : [], 0))
    p.points.forEach(([x, y], i) => ops.push(i === 0 ? moveTo(x, y) : lineTo(x, y)))
    if (p.closed) ops.push(closePath())
  } else {
    ops.push(setDashPattern([], 0))
    const [cx, cy] = p.center
    const r = p.r
    const k = r * KAPPA
    ops.push(
      moveTo(cx + r, cy),
      appendBezierCurve(cx + r, cy + k, cx + k, cy + r, cx, cy + r),
      appendBezierCurve(cx - k, cy + r, cx - r, cy + k, cx - r, cy),
      appendBezierCurve(cx - r, cy - k, cx - k, cy - r, cx, cy - r),
      appendBezierCurve(cx + k, cy - r, cx + r, cy - k, cx + r, cy),
      closePath(),
    )
  }
  ops.push(p.fill ? fillAndStroke() : stroke())
  return ops
}

function dataUrlBytes(dataUrl: string): { bytes: Uint8Array; type: 'png' | 'jpg' } | undefined {
  const m = /^data:image\/(png|jpe?g);base64,(.*)$/i.exec(dataUrl)
  if (!m) return undefined
  const bin = atob(m[2])
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return { bytes, type: m[1].toLowerCase() === 'png' ? 'png' : 'jpg' }
}

async function drawSheet(doc: PDFDocument, page: PDFPage, sheet: Sheet, font: PDFFont) {
  const H = sheet.height
  let pending: PDFOperator[] = []
  const flush = () => {
    if (!pending.length) return
    // 圖紙座標（mm、原點在左上、y 向下）→ PDF（pt、原點在左下、y 向上）
    page.pushOperators(
      pushGraphicsState(),
      concatTransformationMatrix(PT, 0, 0, -PT, 0, H * PT),
      setLineCap(LineCapStyle.Round),
      setLineJoin(LineJoinStyle.Round),
    )
    // 分批加入：指令可能有數十萬個，一次展開成函式參數會超過呼叫堆疊上限
    for (let i = 0; i < pending.length; i += 2000) page.pushOperators(...pending.slice(i, i + 2000))
    page.pushOperators(popGraphicsState())
    pending = []
  }
  for (const p of sheet.primitives) {
    if (p.kind === 'polyline' || p.kind === 'circle') {
      for (const op of shapeOperators(p)) pending.push(op)
      continue
    }
    flush()
    if (p.kind === 'text') {
      const size = p.size * PT
      const width = font.widthOfTextAtSize(p.text, size)
      const dx = p.align === 'center' ? -width / 2 : p.align === 'right' ? -width : 0
      const dy = -baselineOffset(p.valign) * size
      const a = ((p.angle ?? 0) * Math.PI) / 180
      const ax = p.at[0] * PT
      const ay = (H - p.at[1]) * PT
      page.drawText(p.text, {
        x: ax + dx * Math.cos(a) - dy * Math.sin(a),
        y: ay + dx * Math.sin(a) + dy * Math.cos(a),
        size,
        font,
        color: color(p.color),
        rotate: degrees(p.angle ?? 0),
      })
    } else {
      const img = dataUrlBytes(p.dataUrl)
      if (!img) continue
      try {
        const embedded = img.type === 'png' ? await doc.embedPng(img.bytes) : await doc.embedJpg(img.bytes)
        const fit = Math.min(p.width / embedded.width, p.height / embedded.height)
        const w = embedded.width * fit
        const h = embedded.height * fit
        page.drawImage(embedded, {
          x: (p.at[0] + (p.width - w) / 2) * PT,
          y: (H - p.at[1] - (p.height + h) / 2) * PT,
          width: w * PT,
          height: h * PT,
        })
      } catch {
        // 圖片格式有問題：略過（不影響其他內容）
      }
    }
  }
  flush()
}

export interface PdfOptions {
  /** 已縮減的 TrueType 字型（用 subsetFont 產生） */
  font: Uint8Array
  author?: string
}

/** 圖紙 → PDF（每張圖紙一頁，頁面大小即圖紙大小） */
export async function sheetsToPdf(sheets: readonly Sheet[], options: PdfOptions): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)
  // 已經縮減過：不要再讓 pdf-lib 縮減（它的縮減會漏掉部分中文字）。
  // 關掉 locl：Noto Sans TC 在拉丁文字串中會把數字換成另一組字形（「KQ2H06」變成全形間距、也抽不出文字）
  const font = await doc.embedFont(options.font, { subset: false, features: { locl: false } })
  const title = sheets[0]?.title ?? '圖面'
  doc.setTitle(title)
  doc.setCreator('氣動迴路與模組設計')
  doc.setProducer('pdf-lib')
  if (options.author) doc.setAuthor(options.author)
  for (const sheet of sheets) {
    const page = doc.addPage([sheet.width * PT, sheet.height * PT])
    await drawSheet(doc, page, sheet, font)
  }
  return doc.save()
}
