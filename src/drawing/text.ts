/**
 * 文字寬度估計（Noto Sans TC 的字寬，單位 em）：排版時用來決定欄寬、縮小字或截斷。
 * 輸出 PDF 時用字型的實際字寬對齊，這裡只需要略為高估、避免超出格子。
 */
const NARROW = new Set([...' .,:;!|\'`'])
const MEDIUM = new Set([...'-()[]/\\{}"*^~ftijlrI'])

export function charWidth(ch: string): number {
  const code = ch.codePointAt(0) ?? 0
  // 中日韓文字、全形符號
  if (code >= 0x2e80 || (code >= 0x2000 && code < 0x2070 && code !== 0x2013 && code !== 0x2014)) return 1
  if (NARROW.has(ch)) return 0.26
  if (MEDIUM.has(ch)) return 0.36
  if (ch === 'M' || ch === 'W' || ch === 'm' || ch === 'w' || ch === '@') return 0.86
  if (ch >= 'A' && ch <= 'Z') return 0.64
  if (ch >= '0' && ch <= '9') return 0.56
  return 0.54
}

/** 文字寬度（mm） */
export function textWidth(text: string, size: number): number {
  let w = 0
  for (const ch of text) w += charWidth(ch)
  return w * size
}

/**
 * 讓文字放得進 maxWidth：先縮小字（最小到 minSize），還放不下就截斷並加上「…」。
 */
export function fitText(text: string, size: number, maxWidth: number, minSize = size * 0.75): { text: string; size: number } {
  const full = textWidth(text, 1)
  if (full * size <= maxWidth) return { text, size }
  if (full * minSize <= maxWidth) return { text, size: maxWidth / full }
  const chars = [...text]
  while (chars.length > 1 && textWidth(chars.join('') + '…', minSize) > maxWidth) chars.pop()
  return { text: chars.join('') + '…', size: minSize }
}

/** 依寬度自動換行（中文可在任何字之間斷開；英數字盡量不從單字中間斷開） */
export function wrapText(text: string, size: number, maxWidth: number): string[] {
  const lines: string[] = []
  for (const paragraph of text.split(/\r?\n/)) {
    let line = ''
    // 英數字連在一起當作一個單位
    const tokens = paragraph.match(/[A-Za-z0-9.,:;/_\-+()#Øø×%]+|\s+|./gu) ?? []
    for (const token of tokens) {
      const next = line + token
      if (textWidth(next, size) <= maxWidth) {
        line = next
        continue
      }
      if (line.trim()) lines.push(line.trimEnd())
      let rest = [...token.trimStart()]
      // 單一個比整行還長的英數字串：強制斷開
      while (rest.length > 1 && textWidth(rest.join(''), size) > maxWidth) {
        let cut = rest.length - 1
        while (cut > 1 && textWidth(rest.slice(0, cut).join(''), size) > maxWidth) cut--
        lines.push(rest.slice(0, cut).join(''))
        rest = rest.slice(cut)
      }
      line = rest.join('')
    }
    lines.push(line.trimEnd())
  }
  return lines
}

/**
 * 字的垂直位置：以 Noto Sans TC 的表意字框（em box：基線上 0.88 em、基線下 0.12 em）計算，
 * 回傳基線相對於指定位置的偏移（往下為正，單位 em）。
 */
export function baselineOffset(valign: 'baseline' | 'middle' | 'top' | 'bottom' | undefined): number {
  switch (valign) {
    case 'top':
      return 0.88
    case 'middle':
      return 0.38
    case 'bottom':
      return -0.12
    default:
      return 0
  }
}
