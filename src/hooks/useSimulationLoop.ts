import { useEffect } from 'react'
import { MAX_FRAME_SECONDS } from '../engine'
import { useCircuitStore } from '../store/circuitStore'

/** 模擬執行中時，以 requestAnimationFrame 每幀呼叫引擎的 step */
export function useSimulationLoop() {
  const running = useCircuitStore((s) => s.status === 'running')

  useEffect(() => {
    if (!running) return
    let last = performance.now()
    let frame = 0
    const loop = (now: number) => {
      const dt = Math.min((now - last) / 1000, MAX_FRAME_SECONDS)
      last = now
      useCircuitStore.getState().tick(dt)
      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frame)
  }, [running])
}
