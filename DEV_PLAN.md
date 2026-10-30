# 国际物流报价助手 — 开发计划 v1（可直接执行）

> 依据：PRD.md v1.0 ｜ 状态：待"开工"执行
> 目标：纯本地、零构建、零依赖，Chrome/Edge 双击 `index.html` 即用

---

## 0. 技术选型与前提

- **栈**：HTML + CSS + 原生 JavaScript（**classic `<script>`，不用 ES module**，避免 `file://` 的 CORS 限制导致双击打不开）。
- **数据层**：File System Access API 直读写 `data.json`；特性检测失败 → 降级为"导出文件 / 导入文件"（数据同时缓存在 IndexedDB，保证降级后仍可正常用）。
- **句柄持久化**：用 IndexedDB 保存文件句柄，刷新/关闭/重启后自动重连，无需重复选文件。
- **无框架、无打包、无 npm**：最终产物就是一个目录，双击 `index.html` 运行。
- **前提**：使用 Chrome 或 Edge（Firefox/Safari 自动走降级模式）。

### 目录结构（待"开工"后创建）
```
/工作空间/1.02/
  index.html            # 入口：侧边栏 + 主内容容器 + 按序引入下列 js
  styles.css            # 全部样式（浅色、简洁、卡片化）
  js/
    util.js             # DOM 助手、toast、确认弹窗、日期/数字格式化
    db.js               # IndexedDB 句柄存储（persistHandle / getHandle）
    fsio.js             # File System Access API 封装 + 降级导入/导出
    store.js            # 数据模型：load/save、channels CRUD、records CRUD、settings
    calc.js             # 纯函数：calcFreight / calcProfit
    router.js           # 侧边栏导航切换
    pages/
      home.js           # 首页总览
      freight.js        # 运费测算
      channels.js       # 渠道价格库
      profit.js         # 利润测算
      records.js        # 查询记录
      settings.js       # 数据与设置
    app.js              # 初始化：确保数据文件 → 渲染外壳 → 挂载首页
```
> 加载顺序：util → db → fsio → store → calc → pages/* → router → app（index.html 中按顺序写 `<script>`）。

---

## 1. 执行顺序（里程碑）

| 里程碑 | 内容 | 产出 |
|---|---|---|
| M0 | 脚手架 + 数据层（fsio/store/db） | 能选/建 data.json 并读写、刷新不丢 |
| M1 | 计算引擎 calc.js（纯函数） | 运费/利润计算正确，可单元验证 |
| M2 | 渠道价格库 channels.js | 增删改查+筛选+有效期提示 |
| M3 | 运费测算 freight.js | 测算+比价+存记录 |
| M4 | 利润测算 profit.js | 成本+利润率→报价/利润，可带入 |
| M5 | 查询记录 records.js | 列表+筛选+详情+删除 |
| M6 | 首页总览 home.js | 摘要卡+快到期+最近动态+快捷测算 |
| M7 | 数据与设置 settings.js | 文件路径/更换/备份/恢复/参数/清空 |
| M8 | 收尾 | 空态、二次确认、toast、样式统一、逐项验收 |

---

## 2. 详细任务（每个含：做法 / 验收）

### M0 脚手架与数据层
- **index.html**：左侧固定侧边栏（6 项导航，当前项高亮）、右侧 `#content` 容器、顶部状态条（App 名 + 数据文件路径 + 绿点）。按序引入 js。
- **db.js**：封装 IndexedDB（库名 `logi-app`，表 `handles`），`persistHandle(handle)` / `getHandle()`。
- **fsio.js**：
  - `ensureDataFile()`：先 `getHandle()`；有则读；无则 `showSaveFilePicker` 让用户建 `data.json`（默认内容见下），存句柄；若不支持 API → 降级：从 IndexedDB 读缓存或提示"导入文件"。
  - `readData(handle)` / `writeData(handle, obj)`：读文本→`JSON.parse` / 序列化→`createWritable`→写→`close`。
  - 降级模式：`exportFile(obj)`（Blob 下载）、`importFile()`（`<input type=file>` 读入），并在状态条显示"降级模式"提示。
- **store.js**：持有内存 `state = {settings, channels, records}`；`load()`、`save()`（调用 fsio）、`addChannel/updateChannel/deleteChannel`、`addRecord/deleteRecord`、`getSettings/updateSettings`。任一写操作后 `save()` 即落盘。
- **data.json 初始结构**：
```json
{ "version": 1,
  "settings": { "profitRate": 30, "volRatio": 5000, "currency": "¥", "weightStep": 0.5, "firstWeight": 1 },
  "channels": [], "records": [] }
```
- **验收**：双击打开 → 首次弹窗选/建 data.json → 改一条数据后关闭浏览器、重启电脑、再打开，数据仍在；句柄失效时有"重新选择/恢复"提示。

### M1 计算引擎（calc.js，纯函数，先测）
- `calcFreight({actualWeight, length, width, height, volRatio, firstWeight, firstPrice, addPrice, weightStep})`：
  - `volWeight = (length*width*height)/volRatio`（kg，保留 2 位）
  - `chargeWeight = Math.max(actualWeight, volWeight)`
  - `addUnits = Math.max(0, Math.ceil((chargeWeight - firstWeight)/weightStep))`
  - `freight = firstPrice + addPrice*addUnits`
  - 返回 `{volWeight, chargeWeight, addUnits, freight}`
- `calcProfit({freightCost, otherCost, profitRate})`：
  - `totalCost = freightCost + otherCost`
  - `quote = totalCost * (1 + profitRate/100)`
  - `profit = quote - totalCost`，`margin = profit/quote*100`
  - 返回 `{totalCost, quote, profit, margin}`
- **验收**：用手算样例核对（如 实际 2kg、尺寸 30×20×20、系数5000、首重1kg首重价30、续重价8、续重单位0.5 → 体积重2.4、计费重2.4、续重段 ceil(1.4/0.5)=3、运费30+24=54）；利润样例核对一致。

### M2 渠道价格库（channels.js）
- 表格列：渠道名 | 承运商 | 目的国/区域 | 首重价 | 续重价 | 时效 | 有效期起 | 有效期止 | 操作。
- 工具栏：`+新增渠道`、搜索框（名称/承运商）、国家筛选、承运商筛选。
- 新增/编辑弹窗表单：字段同上，必填校验（名称、国家、首重价、续重价）；有效期可空。
- 行提示：有效期止在 7 天内 → 红底；15 天内 → 橙底。
- 删除：二次确认后 `deleteChannel` + `save()`。
- **验收**：增/改/删均持久化；空必填拦截；临近到期行颜色正确；筛选/搜索正确。

### M3 运费测算（freight.js）
- 表单：目的国/区域（下拉取已有国家+可手填）、实际重量(kg)、长/宽/高(cm,选填)、渠道（按国家过滤）。
- 实时区：调用 `calcFreight` 展示体积重、计费重、续重段、运费明细；字段缺时给出提示。
- 比价面板：同目的国其他渠道按运费升序，最便宜高亮。
- `保存为查询记录`：写 `records`（type=freight，含 country/weight/volWeight/chargeWeight/channelId/channelName/freight/note）。
- **验收**：计算与 M1 一致；比价排序正确；保存后 records 出现且持久化。

### M4 利润测算（profit.js）
- 表单：运费成本、其他成本、期望利润率(%)；`用此运费做利润测算`从运费测算带入成本。
- 结果：成本合计、建议报价、客户利润、利润率（调用 `calcProfit`）。
- 保存：写 `records`（type=profit）。
- **验收**：计算正确；带入生效；保存后可见且持久化。

### M5 查询记录（records.js）
- 列表列：时间 | 目的地 | 重量 | 渠道 | 运费 | 利润 | 操作。
- 筛选：日期范围、目的地、渠道。
- 详情弹窗：完整输入与结果；删除：二次确认。
- **验收**：筛选正确；详情完整；删除后消失且持久化。

### M6 首页总览（home.js）
- 4 摘要卡：价格库渠道数、近7天查询次数、本月利润估算(¥)、快到期渠道数（>0 橙红）。
- 快捷运费测算卡：目的国+重量+[测算] → 跳 freight 并带入。
- 快到期提醒：渠道名+到期日+剩余天数（<7红/<15橙），[去更新]跳 channels 编辑。
- 最近动态：最近3条查询记录 + 最近3条新增价格，可点击跳转。
- **验收**：数字与真实数据一致；颜色规则正确；带入正确。

### M7 数据与设置（settings.js）
- 数据文件区：当前路径显示、[更换数据文件]（重选 handle）、[导出备份]（时间戳副本）、[从备份恢复]（指向副本）。
- 参数：默认利润率、体积重系数、货币符号、续重单位、首重重量；修改即时存 settings。
- 危险区：[清空所有数据] 两步确认。
- **验收**：更换/导出/恢复均生效；参数改动被后续计算采用；清空两步确认后数据清空且持久。

### M8 收尾
- 空态：价格库/记录为空时引导文案（如"点击新增第一条渠道价格"）。
- 统一：删除/清空二次确认；操作成功 toast；样式统一（卡片、间距、配色）。
- 逐项跑 PRD 第 10 节验收标准。

---

## 3. 关键实现要点

- **直读写稳健性**：所有写操作走 `store.save()` → `fsio.writeData(handle, state)`。句柄丢失捕获异常 → 提示重新选择。
- **路由**：`router.js` 监听侧边栏点击，`showPage(name)` 清 `#content` 并调用对应 `pages.x.render()`；非 SPA 框架，简单重渲染即可。
- **渲染方式**：每个页面导出 `render(container)` 与 `init()`；数据变更后重调 `render`。保持纯函数化，便于维护。
- **降级模式**：`fsio` 暴露 `isFsSupported`；不支持时 store 用 IndexedDB 作工作副本，状态条显示"降级模式（导出/导入）"。

---

## 4. 验收检查表（来自 PRD §10，勾选执行）

- [ ] 数据持久化：关闭/重启浏览器与电脑后重开 data.json 数据原样存在
- [ ] 更换数据文件：指向另一 data.json 后读写落到新文件
- [ ] 运费测算：与手算一致；体积重取大值；比价升序+最便宜高亮；保存记录
- [ ] 渠道价格库：增改删持久化；必填拦截；临近到期颜色正确
- [ ] 利润测算：报价/利润正确；运费带入生效；保存可见
- [ ] 查询记录：筛选/详情/删除正确且持久
- [ ] 备份恢复：导出副本可被恢复且内容一致；文件失效有提示不崩溃
- [ ] 首页：摘要数字正确；告警色；快捷带入正确
- [ ] 边界：空态引导；删除/清空二次确认；非 Chrome/Edge 给出降级提示

---

## 5. 风险与对策

- **`file://` 下 FS Access API 兼容性**：若个别版本不可用，自动降级为导入/导出（数据缓存在 IndexedDB），并在状态条明示；可选 `python -m http.server` 起本地服务以获得完整体验（仅本机、不上网）。
- **大体积数据**：个人使用量级极小，IndexedDB + 单 JSON 文件足够，无需分页/索引。
- **格式损坏**：读 data.json 失败（解析异常）时提示"文件损坏，是否从备份恢复"，不静默丢失。

---

## 6. 如何运行与验证（交付后）

1. 用 **Chrome / Edge** 双击 `index.html`。
2. 首次弹窗选择 `data.json` 保存位置（如 `D:/我的物流数据/data.json`）。
3. 按 M2→M7 顺序录入与试用，逐项对照第 4 节验收表。
4. 备份：在"数据与设置"点 [导出备份]；换电脑时把 data.json 整体拷过去即可。
