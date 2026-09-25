declare module 'occt-import-js' {
  import type { OcctModule } from '../catalog/cad'

  const occtimportjs: (options?: { locateFile?: (path: string) => string }) => Promise<OcctModule>
  export default occtimportjs
}
