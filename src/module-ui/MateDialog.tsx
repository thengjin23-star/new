import { findAdapters } from '../assembly/adapters'
import { getPort } from '../assembly/moduleOps'
import { adapterNeed, checkMate, formatSpec, type PortSpec } from '../threads'
import { portLabel } from './labels'
import { useModuleStore } from './moduleStore'
import { LEVEL_STYLE } from './levels'
import { Button, Dialog } from './ui'

/** 兩個埠都選好後：顯示搭配檢查結果、原因與可用的轉接頭 */
export function MateDialog() {
  const pending = useModuleStore((s) => s.pendingMate)
  const doc = useModuleStore((s) => s.doc)
  const products = useModuleStore((s) => s.products)
  const confirmMate = useModuleStore((s) => s.confirmMate)
  const cancel = useModuleStore((s) => s.cancelConnect)
  const insert = useModuleStore((s) => s.insertAdapterOption)
  if (!pending) return null

  const a = getPort(doc, products, pending.parent)
  const b = getPort(doc, products, pending.child)
  const result = checkMate(a?.spec, b?.spec)
  const style = LEVEL_STYLE[result.level]
  const needsHelp = result.level === 'error' || result.level === 'warn'
  const adapters = needsHelp && a?.spec && b?.spec ? findAdapters(Object.values(products), a.spec, b.spec) : []
  const need = result.level === 'error' && a?.spec && b?.spec ? adapterNeed(a.spec, b.spec).description : undefined

  const confirmLabel = { ok: '鎖合', unknown: '鎖合（未檢查）', warn: '仍要鎖合', error: '仍要鎖合（不建議）' }[result.level]
  return (
    <Dialog
      title="連接檢查"
      onClose={cancel}
      footer={
        <>
          <Button onClick={cancel}>取消</Button>
          <Button variant={result.level === 'error' ? 'danger' : result.level === 'warn' ? 'warn' : 'primary'} onClick={confirmMate} autoFocus>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-sm">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <PortCard title="固定端" label={portLabel(doc, products, pending.parent)} spec={a?.spec} />
          <span className="text-slate-400">↔</span>
          <PortCard title="移動端" label={portLabel(doc, products, pending.child)} spec={b?.spec} />
        </div>

        <div className={`rounded-md border p-3 ${style.box}`} role="status">
          <p className={`font-semibold ${style.text}`}>
            {style.icon} {result.summary}
          </p>
          {result.reasons.length > 0 && (
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-slate-600">
              {result.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          )}
        </div>

        {needsHelp && (
          <div>
            <h3 className="mb-1 text-xs font-semibold text-slate-600">產品庫中可用的轉接頭</h3>
            {adapters.length === 0 ? (
              <p className="text-xs text-slate-500">{need ?? '產品庫中沒有合適的轉接頭。'}{need && '（產品庫中尚無）'}</p>
            ) : (
              <ul className="space-y-1">
                {adapters.map((o) => (
                  <li key={o.product.id} className="flex items-center justify-between gap-2 rounded-md border border-slate-200 p-2">
                    <div className="text-xs">
                      <div className="font-medium text-slate-800">{o.product.modelCode}</div>
                      <div className="text-slate-500">
                        {o.portForA.spec && formatSpec(o.portForA.spec)} × {o.portForB.spec && formatSpec(o.portForB.spec)}
                      </div>
                    </div>
                    <Button size="sm" variant="primary" onClick={() => insert(o)}>
                      插入轉接頭
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <p className="text-[11px] text-slate-500">鎖合後，移動端（及與它相連的零件）會自動對位到固定端。</p>
      </div>
    </Dialog>
  )
}

function PortCard({ title, label, spec }: { title: string; label: string; spec?: PortSpec }) {
  return (
    <div className="rounded-md border border-slate-200 p-2">
      <div className="text-xs text-slate-500">{title}</div>
      <div className="font-medium text-slate-800">{label}</div>
      <div className="text-xs text-slate-600">{spec ? formatSpec(spec) : '未設定規格'}</div>
    </div>
  )
}
