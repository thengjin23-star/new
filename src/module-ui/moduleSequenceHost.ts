import { useMemo } from 'react'
import { deriveModuleCircuit } from '../assembly/moduleCircuit'
import type { SequenceHost } from '../components/sequence/host'
import { productLabel } from '../catalog/types'
import { planSequence, registry, type Signals } from '../engine'
import { signalNamesOf } from '../store/circuitSignals'
import { EMPTY_SEQUENCE } from '../store/circuitDoc'
import { useModuleStore } from './moduleStore'

const NO_SIGNALS: Signals = Object.freeze({})

/** 3D 模組的程序控制：步驟存在模組裡，於 3D 模擬中執行 */
export const moduleSequenceHost: SequenceHost = {
  useView: (selector) =>
    useModuleStore((s) =>
      selector({
        status: s.sim ? (s.sim.paused ? 'paused' : 'running') : 'idle',
        sequence: s.doc.sequence ?? EMPTY_SEQUENCE,
        seq: s.seq,
        signals: s.sim?.state.signals ?? NO_SIGNALS,
        trace: s.trace,
      }),
    ),
  useNames: () => {
    const doc = useModuleStore((s) => s.doc)
    const products = useModuleStore((s) => s.products)
    return useMemo(() => signalNamesOf(deriveModuleCircuit(doc, products).circuit.nodes), [doc, products])
  },
  auto: () => useModuleStore.getState().seqAuto(),
  step: () => useModuleStore.getState().seqStep(),
  stop: () => useModuleStore.getState().seqStop(),
  home: () => useModuleStore.getState().seqHome(),
  setContinuous: (on) => useModuleStore.getState().setContinuous(on),
  setSequence: (sequence) => useModuleStore.getState().setSequence(sequence),
  plan(notation) {
    // 新加入的氣缸、電磁閥也要有代號與輸出
    useModuleStore.getState().ensureSignals()
    const { doc, products, setSequence } = useModuleStore.getState()
    const mc = deriveModuleCircuit(doc, products)
    const describe = (id: string) => {
      const inst = doc.instances.find((i) => i.id === mc.nodeInstance[id])
      const product = inst && products[inst.productId]
      return product ? product.modelCode || productLabel(product) : id
    }
    const plan = planSequence(mc.circuit, notation, registry, describe)
    if (!plan.errors.length) setSequence({ steps: plan.steps, notation: notation.trim() })
    return plan
  },
  close: () => useModuleStore.getState().toggleSequencePanel(false),
  notify: (text) => useModuleStore.setState({ message: { kind: 'info', text } }),
  scope: '模組',
}
