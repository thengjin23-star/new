import { useEffect, useMemo, useState } from 'react'
import { computeTransforms } from '../assembly/moduleOps'
import type { DrawingInfo, FrontSide } from '../assembly/types'
import { Button, Dialog } from '../components/ui'
import { layoutAssemblyDrawing } from '../drawing/assemblyLayout'
import { projectModuleViews } from '../drawing/drawingClient'
import { downloadDxf, downloadPdf, downloadSvg } from '../drawing/exportSheets'
import { assemblyInput, collectModuleDrawing, drawingOptions, FRONT_SIDES } from '../drawing/moduleDrawing'
import type { ProjectedView, StandardView } from '../drawing/projection'
import { scaleLabel } from '../drawing/sheet'
import { layoutSizingSheets, sizingSheetCount } from '../drawing/sizingSheet'
import { sheetToSvg } from '../drawing/svg'
import { useObjectUrl } from '../hooks/useObjectUrl'
import { useSettingsStore } from '../settings/settings'
import { moduleSizingInputs } from '../sizing/moduleSizing'
import { computeSizing } from '../sizing/sizing'
import { useModuleStore } from './moduleStore'

const selectClass = 'mt-0.5 h-8 w-full rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-800'
const inputClass = 'mt-0.5 h-8 w-full rounded-md border border-slate-300 px-2 text-sm text-slate-800'

type Views = Record<StandardView, ProjectedView>

/** 上次的投影結果：重新開啟對話框時，模組與正面方向沒變就直接使用 */
let lastProjection: { key: string; views: Views } | undefined

/**
 * 產生圖面：由 3D 模組自動產生三視圖＋等角圖、外形尺寸、件號、零件表、對外接口表與標題欄，
 * 可下載 PDF（列印、給客戶）、DXF（AutoCAD 等 CAD 軟體）、SVG。
 */
export function DrawingDialog({ onClose }: { onClose: () => void }) {
  const doc = useModuleStore((s) => s.doc)
  const products = useModuleStore((s) => s.products)
  const meshes = useModuleStore((s) => s.meshes)
  const settings = useSettingsStore((s) => s.settings)
  const { setDrawingInfo, loadDocMeshes } = useModuleStore.getState()
  const options = drawingOptions(doc.drawing, settings)

  // 只在零件、鎖合、位置改變時重新整理資料（改圖號、備註不必重新投影）
  const { instances, mates, placements } = doc
  const source = useMemo(() => {
    const geometryDoc = { ...useModuleStore.getState().doc, instances, mates, placements }
    const { transforms } = computeTransforms(geometryDoc, products)
    return collectModuleDrawing(geometryDoc, products, meshes, transforms)
  }, [instances, mates, placements, products, meshes])

  const [meshesReady, setMeshesReady] = useState(false)
  useEffect(() => {
    let alive = true
    void loadDocMeshes().finally(() => alive && setMeshesReady(true))
    return () => {
      alive = false
    }
  }, [loadDocMeshes])

  // ---- 投影（背景執行緒） ----
  const front = options.front
  const projectKey = useMemo(
    () => JSON.stringify([front, source.instances.map((i) => [i.key, i.item, i.matrix]), source.ports.map((p) => p.origin)]),
    [front, source],
  )
  const [projected, setProjected] = useState<{ key: string; views: Views } | undefined>(() =>
    lastProjection?.key === projectKey ? lastProjection : undefined,
  )
  const [error, setError] = useState<string | undefined>()
  useEffect(() => {
    if (!meshesReady || lastProjection?.key === projectKey) return
    let alive = true
    const side = FRONT_SIDES[front]
    projectModuleViews({
      instances: source.instances,
      geometry: source.geometry,
      front: side.front,
      up: side.up,
      points: source.ports.map((p) => p.origin),
    })
      .then((views) => {
        if (!alive) return
        lastProjection = { key: projectKey, views }
        setProjected(lastProjection)
        setError(undefined)
      })
      .catch((err) => alive && setError(err instanceof Error ? err.message : String(err)))
    return () => {
      alive = false
    }
  }, [meshesReady, projectKey, front, source])

  // ---- 文字欄位：停止輸入 0.4 秒後才更新圖面 ----
  const [text, setText] = useState({ number: options.number ?? '', revision: options.revision ?? '', notes: options.notes ?? '' })
  useEffect(() => {
    const timer = setTimeout(() => {
      const current = useModuleStore.getState().doc.drawing
      if ((current?.number ?? '') !== text.number || (current?.revision ?? '') !== text.revision || (current?.notes ?? '') !== text.notes)
        setDrawingInfo(text)
    }, 400)
    return () => clearTimeout(timer)
  }, [text, setDrawingInfo])

  // ---- 選型計算書（勾選時接在組立圖後面） ----
  const sizing = useMemo(() => computeSizing(moduleSizingInputs(doc, products, doc.sizing), doc.sequence, doc.sizing), [doc, products])
  const hasSizing = sizing.rows.length > 0

  // ---- 排版 ----
  const drawing = useMemo(() => {
    if (!projected) return undefined
    const input = assemblyInput(doc, source, projected.views, options, settings)
    const sizingPages = options.sizingSheet && hasSizing ? sizingSheetCount(sizing, options.paper) : 0
    const base = layoutAssemblyDrawing({ ...input, extraSheets: sizingPages })
    if (!sizingPages) return base
    const total = base.sheets.length + sizingPages
    const extra = layoutSizingSheets({ paper: options.paper, title: input.title, summary: sizing, sheetLabel: (page) => `${base.sheets.length + page + 1}/${total}` })
    return { ...base, sheets: [...base.sheets, ...extra] }
    // options 由 doc.drawing 與 settings 推導
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projected, doc, source, settings, sizing, hasSizing])
  const stale = !!projected && projected.key !== projectKey

  const [page, setPage] = useState(0)
  const sheets = drawing?.sheets ?? []
  const current = sheets[Math.min(page, sheets.length - 1)]
  const [zoom, setZoom] = useState(false)
  const svg = useMemo(() => (current ? sheetToSvg(current) : undefined), [current])
  const previewUrl = useObjectUrl(svg, 'image/svg+xml')

  const [busy, setBusy] = useState<string | undefined>()
  const fileBase = `${doc.name}${options.number ? `-${options.number}` : ''}${options.revision ? `-${options.revision}` : ''}`
  const run = async (label: string, task: () => Promise<void> | void) => {
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

  const set = (patch: Partial<DrawingInfo>) => setDrawingInfo(patch)
  const check = (key: 'hidden' | 'dimensions' | 'balloons' | 'portTags' | 'iso', label: string) => (
    <label className="flex items-center gap-2 text-sm text-slate-700">
      <input type="checkbox" checked={options[key]} onChange={(e) => set({ [key]: e.target.checked })} />
      {label}
    </label>
  )

  const status = !meshesReady || (!projected && !error) ? '產生中…' : stale ? '更新中…' : undefined

  return (
    <Dialog
      wide
      title="產生圖面"
      onClose={onClose}
      footer={
        <>
          <span className="mr-auto self-center text-xs text-slate-500" role="status">
            {busy ?? status ?? (drawing ? `比例 ${scaleLabel(drawing.scale)}${drawing.isoScale && drawing.isoScale !== drawing.scale ? `（等角圖 ${scaleLabel(drawing.isoScale)}）` : ''}．${sheets.length} 張` : '')}
          </span>
          <Button onClick={onClose}>關閉</Button>
          <Button disabled={!drawing || !!busy} onClick={() => void run('輸出 SVG…', () => downloadSvg(sheets, fileBase))}>
            下載 SVG
          </Button>
          <Button disabled={!drawing || !!busy} onClick={() => void run('輸出 DXF…', () => downloadDxf(sheets, fileBase, settings.dxfFont))}>
            下載 DXF
          </Button>
          <Button
            variant="primary"
            disabled={!drawing || !!busy}
            onClick={() => void run('輸出 PDF（第一次需下載中文字型，約 7 MB）…', () => downloadPdf(sheets, fileBase, settings.drawer || undefined))}
          >
            下載 PDF
          </Button>
        </>
      }
    >
      <div className="flex h-full min-h-0 flex-col gap-3 lg:flex-row">
        <form className="grid shrink-0 grid-cols-2 content-start gap-2 lg:w-64 lg:grid-cols-1" onSubmit={(e) => e.preventDefault()}>
          <label className="block text-xs text-slate-500">
            圖紙
            <select value={options.paper} onChange={(e) => set({ paper: e.target.value as 'A3' | 'A4' })} className={selectClass}>
              <option value="A3">A3 橫式（420 × 297）</option>
              <option value="A4">A4 橫式（297 × 210）</option>
            </select>
          </label>
          <label className="block text-xs text-slate-500">
            投影法
            <select value={options.projection} onChange={(e) => set({ projection: e.target.value as 'third' | 'first' })} className={selectClass}>
              <option value="third">第三角法</option>
              <option value="first">第一角法</option>
            </select>
          </label>
          <label className="block text-xs text-slate-500">
            前視圖方向（從模組的哪一側看）
            <select value={options.front} onChange={(e) => set({ front: e.target.value as FrontSide })} className={selectClass}>
              {(Object.keys(FRONT_SIDES) as FrontSide[]).map((k) => (
                <option key={k} value={k}>
                  {FRONT_SIDES[k].label}
                </option>
              ))}
            </select>
          </label>
          <div className="col-span-2 grid grid-cols-2 gap-1 py-1 lg:col-span-1 lg:grid-cols-1">
            {check('hidden', '隱藏線')}
            {check('dimensions', '外形尺寸')}
            {check('balloons', '件號氣球')}
            {check('portTags', '對外接口記號')}
            {check('iso', '等角圖')}
            <label className={`flex items-center gap-2 text-sm ${hasSizing ? 'text-slate-700' : 'text-slate-400'}`} title={hasSizing ? '缸徑檢核、耗氣量、建議的閥與管徑' : '模組中沒有氣缸'}>
              <input type="checkbox" checked={options.sizingSheet && hasSizing} disabled={!hasSizing} onChange={(e) => set({ sizingSheet: e.target.checked })} />
              附選型計算書
            </label>
          </div>
          <label className="block text-xs text-slate-500">
            圖號
            <input value={text.number} onChange={(e) => setText({ ...text, number: e.target.value })} className={inputClass} />
          </label>
          <label className="block text-xs text-slate-500">
            版次
            <input value={text.revision} onChange={(e) => setText({ ...text, revision: e.target.value })} className={inputClass} placeholder="A" />
          </label>
          <label className="col-span-2 block text-xs text-slate-500 lg:col-span-1">
            備註（技術要求）
            <textarea
              value={text.notes}
              onChange={(e) => setText({ ...text, notes: e.target.value })}
              rows={4}
              className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-800"
              placeholder={'例如：\n1. 使用壓力 0.15～0.7 MPa\n2. 流體：空氣'}
            />
          </label>
          <p className="col-span-2 text-[11px] leading-4 text-slate-400 lg:col-span-1">
            公司名稱、Logo、繪圖者在「設定」中修改；DXF 以 1:1 實際尺寸輸出，圖框依比例放大。
          </p>
        </form>

        <section className="flex min-h-[50vh] min-w-0 flex-1 flex-col gap-2 lg:min-h-0">
          {(error || drawing?.warnings.length || source.withoutModel.length > 0) && (
            <ul className="space-y-1 text-xs">
              {error && <li className="rounded bg-red-50 px-2 py-1 text-red-700">{error}</li>}
              {drawing?.warnings.map((w) => (
                <li key={w} className="rounded bg-amber-50 px-2 py-1 text-amber-800">
                  {w}
                </li>
              ))}
              {source.withoutModel.length > 0 && (
                <li className="rounded bg-slate-100 px-2 py-1 text-slate-600">沒有 3D 模型、只列在零件表：{source.withoutModel.join('、')}</li>
              )}
            </ul>
          )}
          <div className="flex items-center gap-2 text-xs text-slate-500">
            {sheets.length > 1 &&
              sheets.map((_, i) => (
                <Button key={i} size="sm" variant={i === page ? 'primary' : undefined} onClick={() => setPage(i)}>
                  第 {i + 1} 張
                </Button>
              ))}
            <Button size="sm" className="ml-auto" onClick={() => setZoom(!zoom)} aria-pressed={zoom}>
              {zoom ? '符合視窗' : '放大檢視'}
            </Button>
          </div>
          <div className="relative min-h-0 flex-1 overflow-auto rounded-md border border-slate-200 bg-slate-100 p-2" data-testid="drawing-preview">
            {previewUrl ? (
              <img
                src={previewUrl}
                alt="圖面預覽"
                className={`mx-auto bg-white shadow ${zoom ? 'max-w-none' : 'max-h-full max-w-full'}`}
                style={zoom ? { width: '250%' } : undefined}
              />
            ) : (
              <p className="p-6 text-center text-sm text-slate-500">{error ? '無法產生圖面' : '產生中…'}</p>
            )}
            {stale && <div className="absolute inset-0 bg-white/40" aria-hidden />}
          </div>
        </section>
      </div>
    </Dialog>
  )
}
