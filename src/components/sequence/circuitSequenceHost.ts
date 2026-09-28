import { useMemo } from 'react'
import { planSequence, registry } from '../../engine'
import { circuitSignalNames } from '../../store/circuitSignals'
import { useCircuitStore } from '../../store/circuitStore'
import { useCircuitUi } from '../../store/circuitUi'
import { isPneumaticNode, toCircuit } from '../../store/flow'
import type { SequenceHost } from './host'

/** 迴路圖的程序控制：資料來自 circuitStore */
export const circuitSequenceHost: SequenceHost = {
  useView: (selector) =>
    useCircuitStore((st) => selector({ status: st.status, sequence: st.sequence, seq: st.seq, signals: st.sim.signals, trace: st.trace })),
  useNames: () => {
    const nodes = useCircuitStore((st) => st.nodes)
    return useMemo(() => circuitSignalNames(nodes), [nodes])
  },
  auto: () => useCircuitStore.getState().seqAuto(),
  step: () => useCircuitStore.getState().seqStep(),
  stop: () => useCircuitStore.getState().seqStop(),
  home: () => useCircuitStore.getState().seqHome(),
  setContinuous: (on) => useCircuitStore.getState().setContinuous(on),
  setSequence: (sequence) => useCircuitStore.getState().setSequence(sequence),
  plan(notation) {
    const { nodes, edges, setSequence } = useCircuitStore.getState()
    const tags = new Map(nodes.filter(isPneumaticNode).map((n) => [n.id, n.data.tag || registry.get(n.data.componentType).label]))
    const plan = planSequence(toCircuit(nodes, edges), notation, registry, (id) => tags.get(id) ?? id)
    if (!plan.errors.length) setSequence({ steps: plan.steps, notation: notation.trim() })
    return plan
  },
  close: () => useCircuitUi.getState().toggleSequence(false),
  notify: (text) => useCircuitUi.getState().notify(text),
  scope: '迴路',
}
