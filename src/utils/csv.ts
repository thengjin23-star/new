/** CSV 儲存格：含逗號、引號或換行時加上引號 */
export const csvCell = (v: string | number | undefined): string => {
  const s = v === undefined ? '' : String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** 組成 CSV 文字（開頭加 UTF-8 BOM，Excel 開啟時中文才不會變亂碼） */
export function toCsv(rows: readonly (readonly (string | number | undefined)[])[]): string {
  return '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n'
}
