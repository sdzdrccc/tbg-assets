# tbg-3d × tbg-assets 合并分割方案

> 状态：待评审（本地草稿，未提交远端）
> 日期：2026-09-02

## 1. 背景与目标

现状问题：生产逻辑（减面、缩放修正、程序化生成、分类识别、生成计划）沉淀在 tbg-assets 仓库里，而 tbg-3d skill 只有生成流程描述，两边职责错位——仓库不像仓库，管线不像管线。

目标：**合并两边功能后按「生产 / 仓储」重新一刀切**。

- **tbg-3d = 生产端**：造出合格资产。输入是 agent 对话（打字描述 / 传图片），输出是标准化资产包。
- **tbg-assets = 仓储端**：存放、展示、检索。交互是外部网页，不做任何加工。

## 2. 角色定位对比

| | tbg-3d（生产端） | tbg-assets（仓储端） |
|---|---|---|
| 形态 | Codex skill（`~/.codex/skills/tbg-3d`） | GitHub 仓库 + 本地网页站 |
| 用户交互 | agent 对话：`/tbg-3d` → 文本 / 图片 / 多视图 | 浏览器打开 localhost 站：浏览、3D 预览、上传 |
| 核心职责 | 生成 → 分类 → 精修 → 压缩 → 打包 | 校验 → 入库 → 索引 → 展示 |
| 输出物 | 资产包（自包含文件夹） | kits 目录树 + 索引 + 展示页 |
| 不含 | 存储、展示、检索 | 生成、减面、精修等一切加工 |

## 3. 唯一契约：资产包

两个项目之间只通过一个东西通信——**资产包**：

```
<asset-id>/
├── model.glb      # 成品模型（已精修、已压缩）
├── asset.json     # 元数据：id/分类/tier/尺寸/面数/材质引用/轴心朝向
├── source.json    # 溯源：生成器/prompt/积分成本/原文件哈希
└── preview.png    # 预览图（可选；validate.js 校验库内每件资产存在）
```

- **schema 权威方是 tbg-assets**（`pipeline/schemas/`），它定义"我收什么"。
- tbg-3d 的打包脚本必须通过该 schema 校验才能投递。
- schema 版本化，变更走 tbg-assets 侧 PR，tbg-3d 跟随适配。
- 将来 godot-mcp 场景拼装等第三方消费方也只认资产包。

## 4. 端到端流程

### 4.1 主流程：agent 对话生产（tbg-3d 主导）

```
用户在 agent 中打字描述或传入图片（/tbg-3d）
  → ① 生成：Tripo P1 / 混元（文本·图片·多视图）
  → ② 分类：agent 生成时已知语义（"悬山顶单檐"），直接写入 asset.json
        —— 不再靠文件名关键词猜测
  → ③ 精修：blender-mcp 固定脚本
        · 轴心归一（按《轴心规范》，如屋顶=下沿中心、柱=底面中心）
        · 统一朝向（面向 -Y）、单位归一（米）、法线重算
        · 材质映射（生成材质 → 库内 18 种共享 .tres，无匹配打"待人工"标）
  → ④ 压缩：gltf-transform（减面 + 贴图 ≤1024 + draco）
  → ⑤ 打包：pack 脚本按 schema 校验，产出资产包
  → ⑥ 投递：写入 tbg-assets/inbox/ 目录
  → ⑦ 用户在 tbg-assets 网页预览确认 → 入库
```

按 tier 分流：
- **primitive**（程序化几何体）：跳过 ①③，直接生成即打包
- **basic / standard**（AI 生成构件）：走完整 ①→⑦
- **hero**（城主府主殿等核心资产）：③ 改人工 Blender 精修，其余相同

### 4.2 补充流程：网页上传外部模型（tbg-assets 兜底）

```
用户在网页拖拽上传
  ├── 资产包（含 asset.json）→ 直接校验 → 预览确认 → 入库
  └── 裸模型（GLB/FBX，无元数据）
        → 3D 预览读取尺寸/面数
        → 文件名关键词兜底分类（classify 降级模式）
        → 打"待精修"标入库，或退回 tbg-3d 走 ③④ 精修后再入
```

要点：对话流是主通道（元数据在源头就是准的）；网页上传是兜底通道（接受外部来源，但承认元数据不全、需要后补）。

## 5. 文件迁移清单

### 5.1 tbg-assets → tbg-3d（生产逻辑迁出）

| 文件 | 说明 |
|---|---|
| `pipeline/scripts/gen-primitives.js` | 程序化生成，是生产 |
| `pipeline/scripts/gen-materials.js` | 材质 .tres 生成，是生产 |
| `pipeline/scripts/fix-scale.js` | FBX 缩放修正，是精修 |
| `pipeline/scripts/lib/classify.js` | 分类识别主体（已拍板归 tbg-3d） |
| `pipeline/prompts/cn-ancient.md` | 生成提示词 |
| `pipeline/generation-plan.md` | 分波次生成计划 |

### 5.2 留在 tbg-assets（仓储逻辑）

| 文件 | 说明 |
|---|---|
| `pipeline/schemas/*` | 契约权威，不动 |
| `pipeline/scripts/lib/intake.js` | 只保留"校验 + 拷贝 + 更新索引"，加工逻辑剔除 |
| `pipeline/scripts/add-asset.js` | 入库 CLI，保留 |
| `tools/intake/*` | 改造为仓储展示站（见 §6.2） |
| `kits/*`、`docs/DESIGN.md` | 资产本体与设计规范，不动 |

### 5.3 例外：classify 降级副本

tbg-assets 网页兜底流程需要文件名关键词分类，保留一份 classify 的**降级副本**在展示站侧，标注 "fallback only, 权威分类在生产端"。两处逻辑同源，以 tbg-3d 为准。

## 6. 两侧改造内容

### 6.1 tbg-3d 新增/改造

```
~/.codex/skills/tbg-3d/
├── SKILL.md                    # 改：管线终点从"导入Godot"扩展为"产出资产包"
├── pipeline/
│   ├── prompts/                # 迁入
│   ├── generation-plan.md      # 迁入
│   ├── material-map.json       # 新增：生成材质 → 共享 .tres 映射表
│   ├── origin-rules.md         # 新增：轴心规范（每类构件轴心位置）
│   └── scripts/
│       ├── refine/             # 新增：blender-mcp 固定精修脚本
│       ├── pack.js             # 新增：校验 + 打包资产包
│       ├── classify.js         # 迁入
│       ├── gen-primitives.js   # 迁入
│       ├── gen-materials.js    # 迁入
│       └── fix-scale.js        # 迁入
└── config.json                 # 增：tbg-assets 本地路径 + inbox 投递目录
```

SKILL.md 管线改为：
`生成 → 分类填元数据 → 精修 → 压缩 → 打包校验 → 投递 inbox → 提示用户去网页确认入库`

### 6.2 tbg-assets 改造

- `tools/intake/` 重新定位为 **仓储站**（建议改名 `tools/hub/`）：
  - **展示**：kits 分类树浏览、3D 预览、元数据/溯源查看、搜索筛选
  - **入库**：扫描 inbox 资产包 → schema 校验 → 预览确认 → 落库更新索引
  - **上传**：保留网页拖拽（资产包直收；裸模型走兜底分类 + 待精修标）
- `inbox/` 目录约定为两项目交接点：tbg-3d 只写，仓储站只读+消费（入库后清空对应文件）
- `docs/DESIGN.md` 更新：补轴心规范引用、材质映射约定、资产包契约说明

## 7. 分阶段实施

| 阶段 | 内容 | 产出 |
|---|---|---|
| P1 规范先行 | 写《轴心规范》《材质映射表》；更新 DESIGN.md 与 schemas | 文档，不动代码 |
| P2 脚本迁移 | 5 个脚本/prompts 迁入 tbg-3d；intake.js 剔除加工逻辑 | 两边仓库各自提交 |
| P3 tbg-3d 改造 | refine 脚本、pack.js、SKILL.md 更新、config 加投递路径 | 生产端闭环 |
| P4 仓储站改造 | intake → hub：展示/扫描入库/上传三模块 | 网页端闭环 |
| P5 清理验证 | 全链路跑 1 件新资产验收；清理 inbox 冗余文件（117MB 原始文件先确认备份） | 端到端验收 |

顺序约束：P1 是 P3 的前置（精修脚本依赖轴心规范和映射表）；P2 无依赖可先做。

## 8. 风险与注意

1. **半拆状态最危险**：迁移必须按阶段完整提交，中途停下会比现在更乱。
2. **schema 版本同步**：两仓库靠契约解耦，schema 变更必须 tbg-assets 先发版、tbg-3d 跟随，禁止反向。
3. **classify 双副本腐化**：网页降级副本只做兜底，长期看应在资产包普及时退役。
4. **blender-mcp 依赖**：主流程精修依赖本地 Blender 4.4 + blender-mcp；无 Blender 环境时退化为"gltf-transform 直达 + 待精修标"。
5. **inbox 交接目录路径**：两边 config 写绝对路径，换机器需同步改。

## 9. 已拍板决策记录

- 分类识别归 tbg-3d（生产端填元数据，网页侧仅保留兜底副本）—— 2026-09-02
- 交互分工：tbg-3d 走 agent 对话流，tbg-assets 走网页流 —— 2026-09-02
