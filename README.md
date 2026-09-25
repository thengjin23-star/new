# 氣動迴路編輯與模擬器

在瀏覽器中拖拉氣動元件、用管線連接，按下播放即可看到模擬結果：有壓管線變色、閥門切換、氣缸活塞實際伸出縮回。
目標使用者為學校師生、工廠新進人員與業務展示。可安裝到手機主畫面（PWA），離線也能使用。

> 目前為**第一階段原型**：氣源、5/2 手動閥、雙動氣缸、排氣口／消音器。

## 快速開始

需要 Node.js 20 以上。

```bash
npm install
npm run dev       # 開發伺服器 http://localhost:5173
npm test          # 模擬引擎與註冊表的單元測試（Vitest）
npm run build     # 型別檢查 + 正式建置（含 service worker 與 manifest）
npm run preview   # 預覽正式建置 http://localhost:4173
npm run lint      # oxlint
```

## 操作方式

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
└── fixtures/demoCircuit.ts 「載入範例」的驗收電路
```

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
