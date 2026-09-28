import { deriveModuleCircuit, SUPPLY_NODE } from '../assembly/moduleCircuit'
import { createCircuitInfo, EMPTY_SEQUENCE } from '../store/circuitDoc'
import { useCircuitStore } from '../store/circuitStore'
import { useCircuitUi } from '../store/circuitUi'
import { circuitFromModule } from '../store/fromModule'
import { useModuleStore } from './moduleStore'

/**
 * 由目前的 3D 模組產生迴路圖，開在「迴路圖」分頁（目前的迴路圖有未儲存的變更時先確認）。
 * 回傳錯誤訊息；成功或使用者取消時回傳 undefined。
 */
export function generateCircuitFromModule(): string | undefined {
  const { doc, products } = useModuleStore.getState()
  const mc = deriveModuleCircuit(doc, products)
  const components = mc.circuit.nodes.filter((n) => n.id !== SUPPLY_NODE && n.type !== 'exhaust')
  if (!components.length) return '模組中沒有設定氣動功能的閥、氣缸等元件，無法產生迴路圖'
  const circuit = useCircuitStore.getState()
  if (circuit.nodes.length && (circuit.dirty || !circuit.stored) && !window.confirm('迴路圖分頁有未儲存的電路，要以模組產生的迴路圖取代嗎？')) return undefined
  const { nodes, edges } = circuitFromModule(mc, doc, products)
  if (circuit.status !== 'idle') circuit.reset()
  // 程序以訊號名稱（Y1、a1…）描述，迴路圖沿用模組的名稱，所以可以直接帶過去
  const sequence = doc.sequence ?? EMPTY_SEQUENCE
  circuit.replaceCircuit(nodes, edges, { ...createCircuitInfo(`${doc.name}（迴路圖）`), customer: doc.customer }, false, sequence)
  window.location.hash = '#/'
  const missingSupply = mc.warnings.some((w) => w.kind === 'no-supply')
  const ui = useCircuitUi.getState()
  if (sequence.steps.length) ui.toggleSequence(true)
  ui.notify(
    missingSupply
      ? `已由模組「${doc.name}」產生迴路圖。模組沒有指定供氣口，請加入氣源後再模擬。`
      : sequence.steps.length
        ? `已由模組「${doc.name}」產生迴路圖，並帶入 ${sequence.steps.length} 個程序步驟：按「自動」就能執行。`
        : `已由模組「${doc.name}」產生迴路圖，可以直接按「播放」模擬。`,
  )
  return undefined
}
