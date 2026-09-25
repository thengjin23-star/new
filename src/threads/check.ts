import {
  complement,
  FAMILY_LABEL,
  fmtNum,
  formatSpec,
  INTERFACE_ROLE_LABEL,
  normalizeInterfaceKey,
  THREAD_ANGLE,
  threadDesignation,
  threadFamily,
  threadMajor,
  threadPitch,
  threadTpi,
  tubeLabel,
} from './specs'
import type { InterfaceSpec, MateLevel, MateResult, PortSpec, ThreadSpec, TubeSpec } from './types'

const result = (level: MateLevel, summary: string, reasons: string[] = []): MateResult => ({ level, summary, reasons })

/**
 * 檢查兩個埠能否結合。順序無關（checkMate(a, b) 與 checkMate(b, a) 結果相同）。
 * 任一端尚未設定規格時回傳 unknown：允許先組起來，之後補上規格會自動重新檢查。
 */
export function checkMate(a: PortSpec | undefined, b: PortSpec | undefined): MateResult {
  if (!a || !b) return result('unknown', '尚未設定規格，無法檢查', ['在埠上設定螺紋、管徑或安裝面後就會自動檢查'])
  if (a.kind === 'thread' && b.kind === 'thread') return checkThreads(a, b)
  if (a.kind === 'tube' && b.kind === 'tube') return checkTubes(a, b)
  if (a.kind === 'interface' && b.kind === 'interface') return checkInterfaces(a, b)
  if (a.kind === 'interface' || b.kind === 'interface') return result('error', '安裝面只能與相同的安裝面結合')
  return result('error', '螺紋口不能直接接管子', ['螺紋口要先鎖上快插接頭才能插管；或改用插管式接頭'])
}

/** 讓 a、b 能結合所需的轉接頭規格（接 a 的一端、接 b 的一端） */
export function adapterNeed(a: PortSpec, b: PortSpec): { forA: PortSpec; forB: PortSpec; description: string } {
  const forA = complement(a)
  const forB = complement(b)
  return { forA, forB, description: `需要「${formatSpec(forA)} × ${formatSpec(forB)}」的轉接頭` }
}

// ---------------- 螺紋 ----------------

function describe(spec: ThreadSpec): string {
  const family = threadFamily(spec.standard)
  const pitch = family === 'metric' ? `牙距 ${fmtNum(threadPitch(spec), 2)} mm` : `${fmtNum(threadTpi(spec), 1)} 牙/吋`
  return `${threadDesignation(spec)}：外徑 ${fmtNum(threadMajor(spec), 2)} mm、${pitch}、牙角 ${THREAD_ANGLE[family]}°`
}

function checkThreads(a: ThreadSpec, b: ThreadSpec): MateResult {
  if (a.gender === b.gender) {
    const both = a.gender === 'male' ? '公牙' : '母牙'
    return result('error', `兩端都是${both}，無法直接鎖合`, [`需要${a.gender === 'male' ? '雙母' : '雙公'}轉接頭`])
  }
  const [m, f] = a.gender === 'male' ? [a, b] : [b, a]
  const family = threadFamily(m.standard)
  if (family !== threadFamily(f.standard)) return familyMismatch(m, f)
  switch (family) {
    case 'iso-pipe':
      return isoPipePair(m, f)
    case 'npt':
      return nptPair(m, f)
    case 'metric':
      return metricPair(m, f)
    case 'unified':
      return m.size === f.size
        ? result('ok', `${threadDesignation(m)}，正確搭配`, ['平行螺紋，需以墊圈或 O 形環密封'])
        : sizeMismatch(m, f)
  }
}

function familyMismatch(m: ThreadSpec, f: ThreadSpec): MateResult {
  const families = new Set([threadFamily(m.standard), threadFamily(f.standard)])
  const details = [describe(m), describe(f)]
  if (families.has('iso-pipe') && families.has('npt')) {
    return result('error', 'NPT 與 PT（R／Rc／G）螺紋不相容', [
      `牙角不同：${THREAD_ANGLE['iso-pipe']}° 與 ${THREAD_ANGLE.npt}°`,
      ...details,
      '可能勉強鎖入一兩牙，但牙型不合，會漏氣或損壞螺紋',
    ])
  }
  if (families.has('metric') && families.has('unified')) {
    return result('error', '公制螺紋與英制統一螺紋不可混用', [
      ...details,
      '外觀相近，但外徑與牙距都不同，鎖入會咬死或損壞螺紋',
    ])
  }
  return result('error', `螺紋種類不同：${FAMILY_LABEL[threadFamily(m.standard)]} 與 ${FAMILY_LABEL[threadFamily(f.standard)]}`, details)
}

function sizeMismatch(m: ThreadSpec, f: ThreadSpec): MateResult {
  return result('error', `尺寸不同：${threadDesignation(m)} 與 ${threadDesignation(f)}`, ['需要大小頭（縮徑）轉接頭'])
}

function isoPipePair(m: ThreadSpec, f: ThreadSpec): MateResult {
  if (m.size !== f.size) return sizeMismatch(m, f)
  switch (`${m.standard}-${f.standard}`) {
    case 'R-Rc':
      return result('ok', `錐管螺紋 R${m.size}／Rc${f.size}（PT），正確搭配`, ['靠錐度密封，需纏止洩帶或塗螺紋膠'])
    case 'R-Rp':
      return result('ok', `錐度公牙 R${m.size} 配平行母牙 Rp${f.size}，符合 ISO 7-1`, ['需纏止洩帶或塗螺紋膠'])
    case 'G-G':
      return result('ok', `平行管螺紋 G${m.size}（PF），正確搭配`, ['G 螺紋本身不密封，需以墊圈或 O 形環在端面密封'])
    case 'R-G':
      return result('warn', `錐度公牙 R${m.size} 鎖入平行母牙 G${f.size}：可以鎖入，但密封不可靠`, [
        'G 母牙不是為錐度密封設計',
        '建議母牙改用 Rc／Rp，或公牙改用 G 並加墊圈',
      ])
    case 'G-Rc':
      return result('warn', `平行公牙 G${m.size} 鎖入錐度母牙 Rc${f.size}：只能鎖入幾牙就會卡緊`, [
        '無法靠螺紋密封，需在端面加墊圈並確認旋入深度足夠',
        '建議公牙改用 R，或母牙改用 G',
      ])
    case 'G-Rp':
      return result('warn', `平行公牙 G${m.size} 鎖入 Rp${f.size} 母牙：可以鎖入`, [
        '需以端面墊圈或 O 形環密封（Rp 原本是設計搭配 R 公牙）',
      ])
    default:
      return result('warn', `${formatSpec(m)} 與 ${formatSpec(f)}：無法判斷的組合，請人工確認`)
  }
}

function nptPair(m: ThreadSpec, f: ThreadSpec): MateResult {
  if (m.size !== f.size) return sizeMismatch(m, f)
  if (m.standard === 'NPTF' || f.standard === 'NPTF') {
    return result('ok', `NPT${m.size} 錐管螺紋，可以互鎖`, ['NPTF 為乾封螺紋；與 NPT 混用時仍建議加止洩帶或螺紋膠'])
  }
  return result('ok', `NPT${m.size} 錐管螺紋，正確搭配`, ['靠錐度密封，需纏止洩帶或塗螺紋膠'])
}

function metricPair(m: ThreadSpec, f: ThreadSpec): MateResult {
  if (m.size !== f.size) return result('error', `外徑不同：${threadDesignation(m)} 與 ${threadDesignation(f)}`, ['需要轉接頭'])
  if (Math.abs(threadPitch(m) - threadPitch(f)) > 1e-6) {
    return result('error', `牙距不同：${threadDesignation(m)} 與 ${threadDesignation(f)}`, ['鎖入會咬死或損壞螺紋'])
  }
  return result('ok', `公制螺紋 ${threadDesignation(m)}，正確搭配`, ['平行螺紋，需以墊圈或 O 形環密封'])
}

// ---------------- 管徑 ----------------

function checkTubes(a: TubeSpec, b: TubeSpec): MateResult {
  if (a.role === b.role) {
    return a.role === 'socket'
      ? result('error', '兩端都是快插口，中間需要接一段管子')
      : result('error', '兩端都是插管端，需要快插接頭才能連接')
  }
  const [socket, stem] = a.role === 'socket' ? [a, b] : [b, a]
  const diff = Math.abs(socket.od - stem.od)
  if (diff > 0.01) {
    const reasons = [`相差 ${fmtNum(diff, 2)} mm，插不進去，或插得進去但會漏氣、脫管`]
    if (socket.system !== stem.system) reasons.push('公制與英制管徑不可混用')
    return result('error', `管徑不同：快插口 ${tubeLabel(socket)}、插管端 ${tubeLabel(stem)}`, reasons)
  }
  return result('ok', `管徑相同（${tubeLabel(a)}），正確搭配`)
}

// ---------------- 安裝面 ----------------

const ROLE_ORDER: Record<InterfaceSpec['role'], number> = { plug: 0, socket: 1, mutual: 2 }

function checkInterfaces(first: InterfaceSpec, second: InterfaceSpec): MateResult {
  // 固定順序，讓訊息與點選先後無關
  const order = ROLE_ORDER[first.role] - ROLE_ORDER[second.role] || first.key.localeCompare(second.key)
  const [a, b] = order <= 0 ? [first, second] : [second, first]
  if (normalizeInterfaceKey(a.key) !== normalizeInterfaceKey(b.key)) {
    return result('error', `安裝面不同：「${a.key}」與「${b.key}」`)
  }
  const valid = ['plug-socket', 'socket-plug', 'mutual-mutual'].includes(`${a.role}-${b.role}`)
  if (!valid) {
    return result('error', `安裝面方向不相配：${INTERFACE_ROLE_LABEL[a.role]} 與 ${INTERFACE_ROLE_LABEL[b.role]}`, [
      '元件側要裝在底座側上；對接面只能和對接面結合',
    ])
  }
  return result('ok', `安裝面「${a.key}」，可以結合`)
}
