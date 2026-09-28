import { fillSignalNames } from '../engine'
import { deriveModuleCircuit, type ModuleCircuit } from './moduleCircuit'
import { moduleColumns, signalOrder, type ModuleColumns } from './moduleColumns'
import type { ProductMap } from './moduleOps'
import type { ModuleDoc } from './types'

/**
 * 模組的訊號名稱：程序控制需要氣缸代號（A → a0／a1）與電磁線圈的輸出（Y1…）。
 * 名稱記在零件的模組參數（ModuleInstance.params）；缺少的依欄的順序補上，已經寫明的（包括刻意留空）不改。
 */
export function moduleSignalPatches(
  mc: ModuleCircuit,
  doc: Pick<ModuleDoc, 'instances'>,
  layout: Pick<ModuleColumns, 'columns' | 'rank'> = moduleColumns(mc, doc),
): Map<string, Record<string, string>> {
  return fillSignalNames(signalOrder(mc, layout))
}

/** 補上缺少的訊號名稱；沒有要補的時回傳原來的 doc */
export function ensureModuleSignals(doc: ModuleDoc, products: ProductMap): ModuleDoc {
  const mc = deriveModuleCircuit(doc, products)
  const patches = moduleSignalPatches(mc, doc)
  if (!patches.size) return doc
  return {
    ...doc,
    instances: doc.instances.map((inst) => {
      const patch = patches.get(inst.id)
      return patch ? { ...inst, params: { ...inst.params, ...patch } } : inst
    }),
  }
}
