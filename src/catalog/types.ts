import type { Vec3 } from '../geometry/vec3'
import type { PortSpec } from '../threads'

export type { Vec3 }

/**
 * 埠的座標系（零件座標，單位 mm）
 * - origin：母牙取孔口中心；公牙取螺紋根部（肩面）中心；安裝面取基準孔的孔口中心
 * - axis：朝外的單位向量（母牙朝孔外、公牙朝螺紋尖端）
 * - ref：與 axis 垂直的單位向量，作為繞軸旋轉的基準（安裝面靠它決定方向）
 */
export interface PortFrame {
  origin: Vec3
  axis: Vec3
  ref: Vec3
}

/** 鎖合後能否繞軸旋轉：螺紋可自由轉；安裝面固定，或只允許 steps 等分（例如 2 = 可轉 180°） */
export type PortRotation = 'free' | 'fixed' | { steps: number }

export interface ProductPort {
  /** 固定不變的識別碼（模組的鎖合以它引用） */
  id: string
  /** 顯示名稱，例如 P、A、IN、1 */
  name: string
  /** 可以暫時留空：漸進式建檔，之後再補 */
  spec?: PortSpec
  frame: PortFrame
  rotation: PortRotation
  /** 由 3D 模型自動量測到的資訊 */
  detected?: { shape: 'hole' | 'boss' | 'plane'; diameter?: number }
}

export type ProductCategory =
  | 'fitting'
  | 'silencer'
  | 'speedController'
  | 'valve'
  | 'cylinder'
  | 'frl'
  | 'manifold'
  | 'other'

export const CATEGORY_LABEL: Record<ProductCategory, string> = {
  fitting: '接頭',
  silencer: '消音器',
  speedController: '速度控制閥',
  valve: '閥',
  cylinder: '氣缸',
  frl: '三點組合',
  manifold: '集裝座',
  other: '其他',
}

export type CadFormat = 'step' | 'iges'

export interface ProductSource {
  fileName: string
  /** 原始檔案的 SHA-256：同一個檔案再次匯入時，用它認出已記住的產品 */
  sha256: string
  format: CadFormat
  bytes: number
}

export interface Product {
  id: string
  /** 型號（預設取檔名） */
  modelCode: string
  /** 名稱（可留空，顯示時改用型號） */
  name: string
  category: ProductCategory
  source: ProductSource
  ports: ProductPort[]
  notes?: string
  createdAt: number
  updatedAt: number
}

export const productLabel = (p: Pick<Product, 'modelCode' | 'name'>): string => p.name || p.modelCode
