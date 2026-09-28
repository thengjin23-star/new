import { Html } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { useEffect, useState, type ComponentProps } from 'react'

/**
 * 3D 畫面上的 HTML 標籤（drei Html），等 3D 畫面的事件目標連接好、並在下一個畫面才掛上。
 *
 * Html 會替標籤建立自己的 React root。開啟頁面時就要顯示的標籤（例如供氣口）若在 3D 畫面第一次渲染時掛上，
 * 那次渲染還在 React DOM 的提交過程中，標籤 root 的卸載會被延後（掛載目標改變、開發模式重跑 effect 時），
 * 結果標籤消失、離開分頁時報錯。延到下一個畫面、目標確定後再掛上即可避免。
 */
export function OverlayHtml(props: ComponentProps<typeof Html>) {
  const connected = useThree((s) => !!s.events.connected)
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => setArmed(true))
    return () => cancelAnimationFrame(id)
  }, [])
  return connected && armed ? <Html {...props} /> : null
}
