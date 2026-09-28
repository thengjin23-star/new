import { useEffect, useMemo, useState } from 'react'
import { useLibraryStore } from '../catalog/library'
import { downloadDxf, downloadPdf, downloadSvg } from '../drawing/exportSheets'
import { sheetToSvg } from '../drawing/svg'
import type { Sheet } from '../drawing/types'
import { useSettingsStore } from '../settings/settings'
import { useObjectUrl } from '../hooks/useObjectUrl'
import { useCircuitStore } from '../store/circuitStore'
import { lastCycle } from '../store/trace'
import { today } from '../utils/date'
import { Button, Dialog } from './ui'

const selectClass = 'mt-0.5 h-8 w-full rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-800'
const inputClass = 'mt-0.5 h-8 w-full rounded-md border border-slate-300 px-2 text-sm text-slate-800'

/** 迴路圖出圖：符號與管線、標號、零件表、標題欄；下載 PDF／DXF／SVG */
export function CircuitDrawingDialog({ onClose }: { onClose: () => void }) {
  const nodes = useCircuitStore((s) => s.nodes)
  const edges = useCircuitStore((s) => s.edges)
  const info = useCircuitStore((s) => s.info)
  const view = useCircuitStore((s) => s.view)
  const setInfo = useCircuitStore((s) => s.setInfo)
  const settings = useSettingsStore((s) => s.settings)
  const products = useLibraryStore((s) => s.products)
  const paper = info.paper ?? settings.paper
  const [text, setText] = useState({ drawingNo: info.drawingNo ?? '', revision: info.revision ?? '' })
  const [showTags, setShowTags] = useState(view.showTags)
  const trace = useCircuitStore((s) => s.trace)
  const sequence = useCircuitStore((s) => s.sequence)
  // 有模擬記錄時可以附上位移－步驟圖（執行過程序用步驟圖，否則用時間圖）
  const lastT = trace?.samples[trace.samples.length - 1]?.t ?? 0
  const diagramMode = trace && lastCycle(trace, lastT) ? 'step' : 'time'
  const hasDiagram = !!trace && trace.rows.length > 0 && trace.samples.length > 1
  const [withDiagram, setWithDiagram] = useState(hasDiagram && diagramMode === 'step')
  const [sheets, setSheets] = useState<Sheet[] | undefined>()
  const sheet = sheets?.[0]
  const [error, setError] = useState<string | undefined>()
  const [busy, setBusy] = useState<string | undefined>()

  // 圖號、版次：停止輸入後才記到電路資訊
  useEffect(() => {
    const timer = setTimeout(() => {
      const cur = useCircuitStore.getState().info
      if ((cur.drawingNo ?? '') !== text.drawingNo || (cur.revision ?? '') !== text.revision) setInfo(text)
    }, 400)
    return () => clearTimeout(timer)
  }, [text, setInfo])

  // 產生圖紙（出圖模組較大，第一次使用時才載入）
  useEffect(() => {
    let alive = true
    Promise.all([
      import('../drawing/circuitExport'),
      import('../drawing/circuitSheet'),
      import('../drawing/diagramSheet'),
      import('../store/traceDiagram'),
    ])
      .then(([{ circuitSheetInput }, { layoutCircuitSheet }, { layoutDiagramSheet }, { diagramGeometry }]) => {
        if (!alive) return
        const two = withDiagram && hasDiagram
        const title = {
          company: settings.company,
          title: info.name,
          customer: info.customer,
          drawingNo: info.drawingNo,
          revision: info.revision,
          date: today(),
          drawer: settings.drawer,
        }
        const input = circuitSheetInput(nodes, edges, {
          paper,
          title: { ...title, ...(two && { sheet: '1/2' }) },
          portLabels: view.portLabels,
          showTags,
          remarks: info.notes,
          products,
        })
        const result: Sheet[] = [layoutCircuitSheet(input)]
        if (two && trace) {
          const geometry = diagramGeometry(trace, diagramMode, 1100, lastT, { preferComplete: true, cylinderHeight: 90, outputHeight: 26 })
          result.push(
            layoutDiagramSheet({
              paper,
              title: { ...title, sheet: '2/2' },
              geometry,
              steps: diagramMode === 'step' ? sequence.steps : undefined,
            }),
          )
        }
        setSheets(result)
        setError(undefined)
      })
      .catch((err) => alive && setError(err instanceof Error ? err.message : String(err)))
    return () => {
      alive = false
    }
  }, [nodes, edges, info, paper, view.portLabels, showTags, settings, products, withDiagram, hasDiagram, trace, diagramMode, lastT, sequence])

  const svg = useMemo(() => (sheet ? sheetToSvg(sheet) : undefined), [sheet])
  const previewUrl = useObjectUrl(svg, 'image/svg+xml')
  const svg2 = useMemo(() => (sheets?.[1] ? sheetToSvg(sheets[1]) : undefined), [sheets])
  const previewUrl2 = useObjectUrl(svg2, 'image/svg+xml')

  const fileBase = `${info.name}${info.drawingNo ? `-${info.drawingNo}` : ''}${info.revision ? `-${info.revision}` : ''}`
  const run = async (label: string, task: () => Promise<void> | void) => {
    if (!sheet) return
    setBusy(label)
    setError(undefined)
    try {
      await task()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(undefined)
    }
  }

  return (
    <Dialog
      wide
      title="迴路圖出圖"
      onClose={onClose}
      footer={
        <>
          <span className="mr-auto self-center text-xs text-slate-500" role="status">
            {busy ?? (sheet ? `${paper} 橫式．${nodes.length} 個元件${sheets && sheets.length > 1 ? '．共 2 張' : ''}` : '產生中…')}
          </span>
          <Button onClick={onClose}>關閉</Button>
          <Button disabled={!sheet || !!busy} onClick={() => void run('輸出 SVG…', () => downloadSvg(sheets!, fileBase))}>
            下載 SVG
          </Button>
          <Button disabled={!sheet || !!busy} onClick={() => void run('輸出 DXF…', () => downloadDxf(sheets!, fileBase, settings.dxfFont))}>
            下載 DXF
          </Button>
          <Button
            variant="primary"
            disabled={!sheet || !!busy}
            onClick={() => void run('輸出 PDF（第一次需下載中文字型，約 7 MB）…', () => downloadPdf(sheets!, fileBase, settings.drawer || undefined))}
          >
            下載 PDF
          </Button>
        </>
      }
    >
      <div className="flex h-full min-h-0 flex-col gap-3 lg:flex-row">
        <form className="grid shrink-0 grid-cols-2 content-start gap-2 lg:w-60 lg:grid-cols-1" onSubmit={(e) => e.preventDefault()}>
          <label className="block text-xs text-slate-500">
            圖紙
            <select value={paper} onChange={(e) => setInfo({ paper: e.target.value as 'A3' | 'A4' })} className={selectClass}>
              <option value="A3">A3 橫式（420 × 297）</option>
              <option value="A4">A4 橫式（297 × 210）</option>
            </select>
          </label>
          <label className="flex items-center gap-2 self-end pb-1.5 text-sm text-slate-700">
            <input type="checkbox" checked={showTags} onChange={(e) => setShowTags(e.target.checked)} />
            標號與型號
          </label>
          <label
            className={`col-span-2 flex items-center gap-2 text-sm lg:col-span-1 ${hasDiagram ? 'text-slate-700' : 'text-slate-400'}`}
            title={hasDiagram ? undefined : '先播放模擬（或執行程序）才有記錄可以畫'}
          >
            <input type="checkbox" checked={withDiagram && hasDiagram} disabled={!hasDiagram} onChange={(e) => setWithDiagram(e.target.checked)} />
            附{diagramMode === 'step' ? '位移－步驟圖' : '位移－時間圖'}（第 2 張）
          </label>
          <label className="block text-xs text-slate-500">
            圖號
            <input value={text.drawingNo} onChange={(e) => setText({ ...text, drawingNo: e.target.value })} className={inputClass} />
          </label>
          <label className="block text-xs text-slate-500">
            版次
            <input value={text.revision} onChange={(e) => setText({ ...text, revision: e.target.value })} className={inputClass} placeholder="A" />
          </label>
          <p className="col-span-2 text-[11px] leading-4 text-slate-400 lg:col-span-1">
            圖名、客戶、備註取自電路資訊；公司與繪圖者在「設定」中修改。埠號依畫面的顯示方式（字母或 ISO 數字）。
          </p>
        </form>
        <section className="flex min-h-[50vh] min-w-0 flex-1 flex-col gap-2 lg:min-h-0">
          {error && <p className="rounded bg-red-50 px-2 py-1 text-xs text-red-700">{error}</p>}
          <div className="min-h-0 flex-1 overflow-auto rounded-md border border-slate-200 bg-slate-100 p-2" data-testid="drawing-preview">
            {previewUrl ? (
              <img src={previewUrl} alt="迴路圖預覽" className="mx-auto max-h-full max-w-full bg-white shadow" />
            ) : (
              <p className="p-6 text-center text-sm text-slate-500">產生中…</p>
            )}
            {previewUrl2 && <img src={previewUrl2} alt="位移－步驟圖預覽" className="mx-auto mt-3 max-h-full max-w-full bg-white shadow" />}
          </div>
        </section>
      </div>
    </Dialog>
  )
}
