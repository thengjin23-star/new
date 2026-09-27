/** 金額顯示：整數加千分位，有小數時保留兩位 */
export function formatMoney(n: number): string {
  return n.toLocaleString('zh-TW', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })
}
