# 氣動迴路編輯與模擬器

瀏覽器中的氣動工具，有兩個工作區（上方分頁切換）：

- **迴路圖**：拖拉氣動元件、用管線連接，按下播放即可看到模擬結果：有壓管線變色、閥門切換、氣缸活塞實際伸出縮回。
  目標使用者為學校師生、工廠新進人員與業務展示。
- **模組組立（3D）**：匯入公司產品的 STEP 檔，在 3D 上點選孔定義埠與螺紋規格，把單一元件組成模組；
  系統自動檢查螺紋／管徑搭配、建議轉接頭、產生 BOM。產品與埠會被記住，越用越完整。

可安裝到手機主畫面（PWA），離線也能使用。

> 迴路圖目前支援：氣源、5/2 手動閥、雙動氣缸、排氣口／消音器。
> 模組組立為 M1 里程碑；圖面輸出（2D PDF／DXF、3D STEP）與 3D 氣動模擬在後續里程碑。

## 快速開始

需要 Node.js 20 以上。

```bash
npm install
npm run dev       # 開發伺服器 http://localhost:5173
npm test          # 模擬引擎與註冊表的單元測試（Vitest）
npm run build     # 型別檢查 + 正式建置（含 service worker 與 manifest）
npm run preview   # 預覽正式建置 http://localhost:4173
npm run lint      # oxlint
node scripts/make-sample-parts.mjs   # 重新產生範例零件（public/samples/）
```

## 迴路圖：操作方式

**五秒驗收**：按工具列「載入範例」→「播放」→ 點擊閥門。

| 模式 | 可以做的事 |
|---|---|
| **編輯中**（重置後） | 從左側面板拖拉元件到畫布（或**點一下**放到畫面中央，觸控裝置請用這個方式）；從一個埠拖到另一個埠建立管線；點選元件或管線後按「旋轉 90°」／`R`、「刪除」／`Delete` |
| **模擬中／已暫停** | 拓樸鎖定不可編輯；**點擊閥門切換閥位**；暫停時點擊閥門，管線顏色也會立即更新 |

- 管線顏色：**藍色＝有壓**、**淺灰＝排氣（通大氣）**、**深灰＝無壓（封閉）**；氣缸腔室有壓時填淺藍。
- 5/2 閥的 EA／EB **必須接到排氣口元件**才算通大氣（嚴格語意，符合實際接管）。模擬時未接的排氣埠會以琥珀色閃爍標示並顯示提示。
- 電路會自動存到瀏覽器（localStorage），重新整理或離線開啟都還在。「新電路」清空畫布。

### 在手機上使用

- 部署到任何 **HTTPS** 靜態主機（`dist/` 資料夾）後，用手機瀏覽器開啟 →「加入主畫面」。
- Service worker 只在 HTTPS 或 `localhost` 下啟用。用 `npm run preview -- --host` 從區網 IP 在手機上測試時，應用程式可以操作，但不會註冊離線快取。


## 模組組立（3D）：操作方式

**試用**：上方切到「模組組立」→ 左側「安裝範例零件」→ 點選清單中的零件加入 → 點選一個零件的埠（箭頭或標籤），
再點選另一個零件的埠 → 看檢查結果 → 「鎖合」。

### 邊用邊建檔

1. 把要組合的 **STEP／IGES** 檔拖進畫面（或按「匯入 3D 檔」），可一次多個。
2. 系統以檔案內容的 SHA-256 判斷：**已經記住的檔案**直接沿用之前定義的埠；**新檔案**建立新產品（型號預設取檔名）。
3. 選取零件 →「＋ 新增埠」→ 點選零件上的**孔、凸柱或平面**：系統自動抓出位置、方向、直徑與公母，並依直徑建議規格
   （例如 Ø8.6 的孔 → Rc1/8 母；Ø9.73 的凸柱 → R1/8 公）。點建議或自己輸入後「儲存埠」，就記進產品庫。
4. 依序點兩個零件的埠，出現**連接檢查**：✓ 正確、! 注意、✕ 不相容、? 未設定規格（仍可先組起來，之後補規格會自動重新檢查）。
   不相容時會從產品庫找轉接頭並可一鍵插入；找不到就說明需要什麼規格的轉接頭。
5. 鎖合後後點的零件（連同已經和它接在一起的零件）會自動對位；螺紋可在「檢查」頁旋轉角度（例如調整彎頭方向），安裝面固定。
6. 「BOM」頁列出型號與數量，可下載 CSV（Excel 直接開啟）。

### 規格寫法

| 種類 | 寫法範例 | 說明 |
|---|---|---|
| 錐管螺紋 | `PT1/4 公`、`PT1/4 母`、`R1/8`、`Rc1/8` | PT 依公母轉成 R（公）／Rc（母） |
| 平行管螺紋 | `PF1/8 公`、`G1/4 母`、`PS1/4` | PF = G；PS = Rp（平行母牙） |
| NPT | `NPT1/8 公`、`1/4NPT 母` | 牙角 60°，與 PT 不相容 |
| 公制／統一螺紋 | `M5`、`M6x0.75`、`10-32UNF` | 省略牙距時為粗牙 |
| 快插管徑 | `Ø6 快插`、`Ø6 插管`、`Ø1/4" 快插` | 快插口配插管端，管徑須相同 |
| 安裝面 | 在「安裝面」分頁輸入名稱，例如 `SY3000 閥座面` | 元件側配底座側、對接面配對接面；用於集裝座、三點組合 |

公／母也可寫成外牙／內牙或 male／female；沒寫時依模型判斷（孔 = 母、凸柱 = 公）。

### 搭配檢查（節錄）

| 組合 | 結果 |
|---|---|
| R 公 ↔ Rc 母、R 公 ↔ Rp 母、G ↔ G | ✓（附密封方式提醒） |
| R 公 ↔ G 母、G 公 ↔ Rc 母 | ! 可鎖入但密封不可靠 |
| NPT ↔ PT（R／Rc／G） | ✕ 說明牙角 55°／60° 與牙數差異 |
| M5 ↔ 10-32UNF | ✕ 外觀相近但不可混用 |
| 尺寸不同、公對公、母對母、公制與英制管徑 | ✕ 並描述需要的轉接頭 |

### 資料存放與分享

- 產品（含原始 STEP 檔與三角網格）與模組存在**這台電腦的瀏覽器**（IndexedDB），重新整理、離線都還在。
- 「匯出產品庫」產生 `.plib`、「匯出模組」產生 `.pmod`（含用到的產品）；同事匯入時會與他的產品庫合併：
  已有的產品保留本機設定、補上缺少的埠與規格，有差異的會列出來。**請定期匯出產品庫備份**（清除瀏覽器資料會刪除它）。
- 第一次匯入 STEP 時會下載約 7.6 MB 的 3D 解析元件（WebAssembly），之後離線也能使用。
- 3D 模組組立建議用電腦或平板操作；窄螢幕時左右面板改由工具列的「產品庫」「屬性」開啟。

### 限制

- 原廠 3D 檔通常沒有螺紋資訊，每個埠的規格需要人工確認一次（系統會依直徑建議）。
- SolidWorks 等原生檔需先匯出成 STEP；目前不支援 STL。
- 一個 STEP 檔視為一個產品。R 錐管螺紋實際旋入後肩面與孔口可能有 1～3 mm 間隙，畫面上以貼齊表示。

## 專案結構

```
src/
├── engine/                 模擬引擎：純 TypeScript，不依賴 React（由 purity.test.ts 把關）
│   ├── types.ts              PortState、Circuit、SimState 等核心型別
│   ├── definition.ts         ComponentDefinition 介面（新增元件要實作的東西）
│   ├── registry.ts           元件註冊表
│   ├── components/           各元件的行為定義
│   ├── solve.ts              圖走訪 → 每個埠／管線的壓力狀態
│   ├── step.ts               step()、interact()、createInitialState()
│   ├── diagnostics.ts        找出未接排氣口的排氣埠
│   └── __tests__/            Vitest 單元測試
├── components/
│   ├── symbols/              ISO 1219 風格 SVG 符號＋埠座標，以及外觀註冊表
│   ├── nodes/PneumaticNode   所有元件共用的 React Flow 節點（處理旋轉與埠）
│   ├── edges/TubeEdge        依壓力狀態上色的管線
│   └── CircuitCanvas / Palette / Toolbar / Legend
├── store/                  Zustand store（拓樸＋模擬狀態，拓樸自動存檔）
├── hooks/                  requestAnimationFrame 模擬迴圈、鍵盤快捷鍵
├── fixtures/demoCircuit.ts 「載入範例」的驗收電路
│
├── threads/                螺紋／管徑／安裝面規格：尺寸表、解析器（PT／PF／PS）、checkMate、依直徑建議（純 TS）
├── catalog/                產品庫：STEP 匯入（occt-import-js＋Web Worker）、IndexedDB、面分析（點選孔 → 埠）、.plib／.pmod
├── assembly/               模組：鎖合座標變換、群組移動、轉接頭搜尋、BOM
├── geometry/               向量、3×3 特徵分解、圓擬合
└── module-ui/              3D 工作區（React Three Fiber）：畫面、產品庫、屬性、埠編輯、連接檢查
scripts/make-sample-parts.mjs    以 replicad 產生範例零件 STEP 與 manifest
public/samples/                  範例零件（閥、接頭、消音器、速控閥、轉接頭、氣缸、集裝座、三點組合）
```

## 模組組立的設計

- **埠的座標系**（零件座標，mm）：母牙原點在孔口、公牙原點在螺紋根部（肩面），`axis` 朝外，`ref` 為旋轉基準。
- **點選定義埠**：取點選三角形所屬的 B-rep 面；法向量共變異矩陣的最小特徵向量即圓柱軸，圓擬合求直徑，
  法向量朝向軸線為孔、背向為凸柱；在靠近孔壁處沿軸向發射射線（BVH 加速）判斷哪一端是開口。
- **鎖合**：`W子 = W父 · F父埠 · Rz(θ) · Rx(π) · F子埠⁻¹`（兩埠原點重合、軸線相反）。鎖合關係構成樹；
  後點的零件若已在另一個群組中，會把該群組的根換成它（位置不變）再整組移過來。
- 模組只引用產品，修改產品的埠規格後，所有用到它的模組會自動重新計算位置與重新檢查。

授權：STEP 解析使用 occt-import-js（OpenCascade，LGPL-2.1），以獨立的 WebAssembly 檔載入。

## 模擬引擎

不做流體力學計算，採「邏輯走訪＋簡化物理」：

1. 每個元件定義自己的埠，以及依目前狀態決定的**內部通路**（例如 5/2 閥位置 0：P→A、B→EB）。
2. `solve()`：以「埠」為節點、「管線＋內部通路」為邊建圖，分別從所有氣源埠與所有排氣埠做廣度優先走訪。
   每個埠的狀態為 `pressure`（連到氣源）、`exhaust`（未連到氣源但連到排氣口）或 `blocked`。
3. `step(circuit, state, dt)`：純函式。先 solve，依結果呼叫各元件的 `update`（氣缸：A 有壓且 B 排氣 → 伸出；
   反之縮回；其餘停止；以固定速度移動並夾在 0~1），再 solve 一次讓回傳的壓力與回傳的元件狀態一致。
4. 畫面以 `requestAnimationFrame` 驅動，單幀 `dt` 上限 0.05 秒，避免切換分頁回來時活塞瞬移。

效能上，React Flow 只持有拓樸；每個節點／管線以 Zustand selector 只訂閱自己的那一小片模擬狀態
（壓力狀態刻意設計為字串 primitive），因此每幀只有真正變化的元件會重繪。

## 如何新增元件

以 3/2 手動閥為例：

1. **行為**：在 `src/engine/components/` 新增 `valve32Manual.ts`

   ```ts
   export const valve32Manual = defineComponent<{ open: boolean }>({
     type: 'valve32Manual',
     label: '3/2 手動閥',
     category: 'valve',
     ports: [
       { id: 'P', role: 'supply' },
       { id: 'A', role: 'working' },
       { id: 'R', role: 'exhaust' },
     ],
     createState: () => ({ open: false }),
     getInternalPaths: (s) => (s.open ? [['P', 'A']] : [['A', 'R']]),
     onInteract: (s) => ({ open: !s.open }),
   })
   ```

   並加入 `src/engine/components/index.ts` 的 `builtinComponents`。需要逐幀物理（如單動氣缸的彈簧回位）就實作 `update`。
2. **外觀**：在 `src/components/symbols/` 新增 `Valve32Symbol.tsx`，匯出 `{ width, height, ports, Symbol }`，
   並加入 `symbolRegistry.ts`。埠座標以未旋轉的符號為準，旋轉由節點統一處理。
3. `npm test`：`symbolRegistry.test.ts` 會檢查兩份註冊表的 type 與埠是否一致。

引擎本身（solve／step）不需要修改；`registry.test.ts` 內有一個以 3/2 閥＋單動氣缸示範擴充的測試。
