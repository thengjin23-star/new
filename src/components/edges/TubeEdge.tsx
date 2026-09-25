import { BaseEdge, getSmoothStepPath, type EdgeProps } from '@xyflow/react'
import { memo } from 'react'
import { useCircuitStore } from '../../store/circuitStore'
import type { TubeFlowEdge } from '../../store/flow'
import { PORT_STATE_COLOR } from '../../theme'

/** 管線：以直角折線繪製（貼近氣動迴路圖的畫法），依壓力狀態上色 */
function TubeEdgeImpl({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
}: EdgeProps<TubeFlowEdge>) {
  // 編輯模式下沒有壓力資訊，以「無壓」顏色顯示
  const state = useCircuitStore((s) => (s.status === 'idle' ? 'blocked' : (s.sim.tubeStates[id] ?? 'blocked')))
  const [path] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 6,
    offset: 16,
  })

  return (
    <>
      {selected && <path d={path} fill="none" stroke="#93c5fd" strokeWidth={10} strokeLinecap="round" />}
      <BaseEdge
        id={id}
        path={path}
        interactionWidth={18}
        style={{ stroke: PORT_STATE_COLOR[state], strokeWidth: 3.5, transition: 'stroke 120ms' }}
      />
    </>
  )
}

export const TubeEdge = memo(TubeEdgeImpl)
