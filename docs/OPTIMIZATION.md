# tbg-assets 优化记录（2026-09-02）

> 基于「生产 / 仓储分离」重构后的评审与落地。本文件把**排查到的问题**与**已实施的优化**都记录下来。
> 对应生产端改动见 tbg-3d 的 `docs/OPTIMIZATION.md`。

## 一、排查到的问题

### 1. schema 权威没有落地（最核心）
`asset.schema.json` 只在 README / 注释里被提到，**没有任何代码真正用它做校验**：
- `pipeline/scripts/lib/intake.js` 手写必填字段 / tier / 面数校验；
- tbg-3d 的 `pack.js` 手写校验 + 硬编码 `CATEGORIES` 白名单（并注明“schema 变更时需同步”）。

后果：分类枚举、必填字段、面数预算在各脚本里各写一份，schema 一改就漂移，“仓储端是 schema 权威方”只是纸面说法。

### 2. 材质命名不一致（会解析失败的 bug）
`kits/cn-ancient/kit.json` 把木头材质写成 `"jiu-mu"`，而 `material-map.json`、`gen-materials.js`、以及实际生成的 `.tres` 都是 `"jiumu"`（`props/street`、`byKeyword["旧木"]` 也引 `wood/jiumu`）。
→ 一旦按 kit.json 生成/校验材质 ref，会解析落空。

### 3. 面数预算双轨
`kit.json` 里 `primitive: 5000`，而 `intake.js` 与 tbg-3d `pack.js` 里硬编码 `primitive: 10000`。已入库的 `original` 屋顶 `xuanshan-single-a` 面数 40608，超过 `component` 预算 20000（波次计划里已标注待减面）。

### 4. 陈旧路径引用
`pipeline/scripts/add-asset.js` 的注释仍写“可视化入库请用 `tools/intake/server.js`”，实际目录已改名为 `tools/hub/`（`docs/RESTRUCTURE-PLAN.md` 里也残留 `tools/intake/*`）。

### 5. 无自动化校验 / 无 CI
仓库没有对全部 `asset.json` 做批量校验的工具，也没有 PR/push 时的自动检查。

### 6. 预算 / 分类 / 材质映射分散
tier→面数、分类枚举、材质映射分散在 pack.js、intake.js、kit.json、material-map.json 多处，改一处容易漏。

---

## 二、已实施的优化

### A. 新增轻量 schema 校验器 `pipeline/scripts/lib/schema.js`
零依赖，实现 draft-07 子集：`type / enum / const / pattern / minimum / required / properties / items / minItems / maxItems / additionalProperties`。
- `validateSchema(value, schema, basePath)` 递归校验；
- `validateAssetJson(asset)` 加载 `asset.schema.json` 并校验单个资产元数据；
- 供仓储端 `intake.js`、`validate.js` 与生产端 tbg-3d `pack.js` 共用（单一真源）。

### B. 新增全量审计脚本 `pipeline/scripts/validate.js`
`node pipeline/scripts/validate.js [kit?]`
检查：
1. 每个 `kits/**/asset.json` 通过 `asset.schema.json` 校验；
2. `source.json` 溯源存在；
3. `category` 与资产 id / 目录路径一致；
4. 引用的共享材质 ref 存在于 `kits/<kit>/materials/index.json`；
5. `polycount` 不超过 `kit.json` budgets 对应 tier 预算。

退出码：0 通过、1 有错误、2 用法错误。当前 14 件资产：0 错误、1 警告（`xuanshan-single-a` 超预算）。

### C. 入库强制 schema 校验 `pipeline/scripts/lib/intake.js`
- `intakePackage()`：资产包 `asset.json` 先过 `validateAssetJson`，不通过直接抛错；
- `intakeAsset()`：构造出的 `asset.json` 同样先过校验再落盘。
（原来的手写字段校验保留作为快速失败，schema 校验作为权威闸门。）

### D. 修复材质命名 bug `kits/cn-ancient/kit.json`
`wood` 材质 `"jiu-mu"` → `"jiumu"`，与 `material-map.json` / `gen-materials.js` / `.tres` 一致。

### E. 修正陈旧路径 `pipeline/scripts/add-asset.js`
`tools/intake/server.js` → `tools/hub/server.js`。

### F. 新增 CI `.github/workflows/validate.yml`
push / PR 命中 `kits/**`、`pipeline/schemas/**`、`pipeline/scripts/**` 时自动跑 `node pipeline/scripts/validate.js`。
- `checkout` 设 `lfs: false`：校验只需要 `asset.json / source.json / kit.json / materials/index.json`，LFS 指针文件即可，快且省流量。

---

## 三、待办 / 下一步

- [x] 超预算资产（`xuanshan-single-a`）已完成：减面至 15000、缩放归一为 6m 宽、轴心底部中心，并生成了 preview.png。
- [x] 全库 14 件资产均已生成 preview.png（`validate.js` 0 错误 0 警告）。
- [x] 把 `intake.js` / `pack.js` 里的面数预算、分类枚举改为统一从 `kit.json` / schema 派生：`pack.js` 早前已完成（`buildCtx`），本轮把 `intake.js` 也改为读 `kit.json` 的 `budgets`（回退内置 `BUDGET`）。
- [ ] 新风格套件（`kits/tang` 等）化：把材质参数表、分类映射收进每个 kit，脚本按 kit 读取。
- [ ] 网页兜底通道 `intakeAsset` 长期应退役，回归“生产端只造元数据，仓储端只收包”。
- [ ] `classify` 双副本（仓储端降级副本 vs 生产端权威）加一致性 fixture 测试。


---

## 四、轮次 2（预算单一真源 + 生产端协作）

### 1. 排查到的问题

- **预算双轨仍未消除**：`validate.js` 读 `kits/<kit>/kit.json` 的 `budgets`（`primitive: 5000`），但 `intake.js` 用硬编码 `BUDGET`（`primitive: 10000`）。同一资产在入库校验（intake.js）与全量审计（validate.js）里看到的预算阈值不一致。
- **生产端有 `/tbg-set` 缺失斜杠命令的变更**（见 tbg-3d `docs/OPTIMIZATION.md` 轮次 2）：新增独立 `tbg-set` 技能、tbg-3d CI、`verify.js` 增强。仓储端本轮无功能变化，仅同步此说明。

### 2. 已实施的优化

- **`intake.js` 改为从 `kit.json` 读取预算（单一真源）**
  - 新增 `kitBudget(root, kit)`：读 `kits/<kit>/kit.json` 的 `budgets`，缺失回退内置 `BUDGET`。
  - `intakeAsset` / `intakePackage` 的面数警告改为使用 `kitBudget(root, kit)`。
  - 好处：入库与 `validate.js` 对齐；后续新增套件只需在 `kit.json` 写预算，无需改代码。

> 本地 `validate.js` 复跑：14 件资产 0 错误 0 警告。

