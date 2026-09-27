import { baselineOffset } from './text'
import type { Primitive, Sheet } from './types'

export const SHEET_FONT_FAMILY = "'Noto Sans TC', 'Microsoft JhengHei', 'PingFang TC', 'Heiti TC', sans-serif"

const n = (v: number) => {
  const r = Math.round(v * 1000) / 1000
  return Object.is(r, -0) ? '0' : String(r)
}

const escapeXml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!)

function primitiveToSvg(p: Primitive): string {
  switch (p.kind) {
    case 'polyline': {
      const pts = p.points.map(([x, y]) => `${n(x)},${n(y)}`).join(' ')
      const stroke = p.color ?? '#000'
      const dash = p.dash?.length ? ` stroke-dasharray="${p.dash.map(n).join(' ')}"` : ''
      const tag = p.closed ? 'polygon' : 'polyline'
      return `<${tag} points="${pts}" fill="${p.fill ?? 'none'}" stroke="${stroke}" stroke-width="${n(p.width)}"${dash}/>`
    }
    case 'circle':
      return `<circle cx="${n(p.center[0])}" cy="${n(p.center[1])}" r="${n(p.r)}" fill="${p.fill ?? 'none'}" stroke="${p.color ?? '#000'}" stroke-width="${n(p.width)}"/>`
    case 'text': {
      const anchor = p.align === 'center' ? 'middle' : p.align === 'right' ? 'end' : 'start'
      const [x, y] = p.at
      const baseY = y + baselineOffset(p.valign) * p.size
      const rotate = p.angle ? ` transform="rotate(${n(-p.angle)} ${n(x)} ${n(y)})"` : ''
      const fill = p.color ? ` fill="${p.color}"` : ''
      return `<text x="${n(x)}" y="${n(baseY)}" font-size="${n(p.size)}" text-anchor="${anchor}"${fill}${rotate}>${escapeXml(p.text)}</text>`
    }
    case 'image':
      return `<image href="${escapeXml(p.dataUrl)}" x="${n(p.at[0])}" y="${n(p.at[1])}" width="${n(p.width)}" height="${n(p.height)}" preserveAspectRatio="xMidYMid meet"/>`
  }
}

/** 圖紙 → SVG（單位 mm；寬高以 mm 標示，印表時是實際大小） */
export function sheetToSvg(sheet: Sheet): string {
  const body = sheet.primitives.map(primitiveToSvg).join('\n')
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${sheet.width}mm" height="${sheet.height}mm" viewBox="0 0 ${sheet.width} ${sheet.height}">`,
    `<title>${escapeXml(sheet.title)}</title>`,
    `<rect width="${sheet.width}" height="${sheet.height}" fill="#fff"/>`,
    `<g font-family="${escapeXml(SHEET_FONT_FAMILY)}" stroke-linecap="round" stroke-linejoin="round">`,
    body,
    `</g>`,
    `</svg>`,
  ].join('\n')
}
