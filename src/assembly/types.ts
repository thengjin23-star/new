/** 指向某個零件實例上的某個埠 */
export interface PortRef {
  instance: string
  port: string
}

/** 模組中的一個零件（同一個產品可以出現多次） */
export interface ModuleInstance {
  id: string
  productId: string
}

/**
 * 埠對埠鎖合：子零件的埠與父零件的埠原點重合、軸線相反，並繞軸旋轉 angle 度。
 * 鎖合關係構成樹（森林），子零件的位置由父零件推導。
 */
export interface Mate {
  id: string
  parent: PortRef
  child: PortRef
  angle: number
}

/** 4×4 矩陣，行優先（column-major，與 three.js Matrix4.elements 相同） */
export type Mat4 = number[]

/** 圖面的正面：觀察者位在模組的哪一側（以模組的座標軸表示） */
export type FrontSide = '-y' | '+y' | '+x' | '-x' | '+z' | '-z'

/** 圖面設定：記在模組裡，下次產生圖面時沿用 */
export interface DrawingInfo {
  number?: string
  revision?: string
  notes?: string
  front?: FrontSide
  paper?: 'A3' | 'A4'
  projection?: 'third' | 'first'
  hidden?: boolean
  dimensions?: boolean
  balloons?: boolean
  portTags?: boolean
  iso?: boolean
}

export interface ModuleDoc {
  id: string
  name: string
  customer?: string
  notes?: string
  drawing?: DrawingInfo
  instances: ModuleInstance[]
  mates: Mate[]
  /** 根零件（沒有父零件）的位置；鎖合的零件由 mates 推導，不存在這裡 */
  placements: Record<string, Mat4>
  createdAt: number
  updatedAt: number
}
