# tbg-assets

> 基于 [tbg-3d](https://github.com/sdzdrccc/tbg-3d) 管线（Tripo → Blender → Godot）的**可复用 3D 基础资产库**。
> 构件只生成一次，建筑靠拼装，风格靠材质，变化靠变体——把 Tripo 积分花在刀刃上。

## 为什么

直接让 AI 一栋一栋生成建筑：贵（每栋 40-60 积分）、风格漂移、不可定制。
本库换一个思路：

1. **模块化构件**——屋顶/墙/柱/台基/门窗生成一套，拼出无限建筑
2. **无贴图生成 + 共享材质**——构件每件省 25% 积分，全库风格天然统一，换材质 = 免费变体
3. **零积分 primitive**——台基、台阶、实墙等简单件用 Blender 手工/程序化，不花一分钱

详见 [docs/DESIGN.md](docs/DESIGN.md)。

## 项目结构

```text
tbg-assets/
├── library.config.json              # 全库配置：单位米、默认套件、目标引擎 godot-4.x、资产 CC0 / 脚本 MIT 双许可
├── AGENTS.md                        # AI Agent 工作约定：三工位纪律与 inbox 交接流程
├── CONTRIBUTING.md                  # 贡献流程：模板生成 → 精修 → schema 校验 → PR 必附 preview.png
├── LICENSE                          # 双许可：资产 CC0-1.0 + 脚本 MIT
├── .gitattributes                   # Git LFS 管理 *.glb / *.blend / *.png 大文件
├── .gitignore                       # 忽略 _raw/、concept/、work/ 生成工作区与 inbox/、.tripo* 凭证
│
├── kits/                            # ★ 风格套件（一个风格一个目录，可横向扩展）
│   └── cn-ancient/                  # 首个套件：中式古风（修仙/武侠）
│       ├── kit.json                 # 套件元数据：网格模数（墙 2m/层高 3·4m）、轴心标准、四档面数预算、分类树
│       ├── components/              # ★ 建筑构件（省钱核心，拼装积木；已入库 13 件）
│       │   ├── base/                #   台基台阶 ×6：石台基 a/b、须弥座、踏跺 3/5、坡道
│       │   ├── pillar/              #   柱 ×2：木圆柱（含柱础）、方柱
│       │   ├── roof/                #   屋顶 ×3：悬山 / 歇山 / 庑殿 单檐
│       │   ├── wall/                #   墙 ×2：实墙、半墙
│       │   ├── door-window/         #   门窗（空，Wave 1 计划中）
│       │   ├── railing/             #   栏杆（空）
│       │   └── bracket/             #   斗拱（空，仅 hero 件使用）
│       ├── buildings/               # 整栋建筑（residential / commercial / palace / garden / religious / infrastructure，均空）
│       ├── props/                   # 道具陈设（lighting / street / ritual / furniture / cultivation，均空）
│       ├── nature/                  # 植被石景（tree / rock / plant，均空）
│       ├── terrain/                 # 地形模块：ground-tile ×3（青石板 a/b、夯土）；cliff、water 空
│       ├── materials/               # ★ 共享材质库：18 种 .tres（瓦4+木4+墙4+石3+金属3）+ index.json（参数真源）
│       └── previews/                # 预留：套件级预览拼图
│
├── pipeline/                        # ★ 仓储侧规范与入库脚本
│   ├── schemas/                     # 资产包契约（两项目的 schema 权威方）
│   │   ├── asset.schema.json        #   asset.json 的 JSON Schema：分类枚举、必填字段、面数约束
│   │   ├── asset.example.json       #   asset.json 示例
│   │   └── source.example.json      #   source.json 溯源示例（prompt / seed / task id / 积分）
│   └── scripts/
│       ├── validate.js              # 全库审计：schema 校验 + 材质 ref 存在性 + 目录一致性 + 面数预算 + preview.png
│       ├── add-asset.js             # CLI 登记入库（可视化走 tools/hub；核心逻辑在 lib/intake.js）
│       └── lib/
│           ├── intake.js            #   入库核心：intakePackage（资产包主通道）/ intakeAsset（裸模型兜底）
│           ├── schema.js            #   零依赖 draft-07 子集校验器（tbg-3d 的 pack.js 也复用此文件）
│           └── classify.js          #   文件名关键词分类降级副本（权威版在 tbg-3d/pipeline/scripts）
│
├── tools/hub/                       # 仓储站网页（浏览 / 预览 / 入库）
│   ├── server.js                    # 零依赖 Node 服务（:8788）：扫描 inbox → 预览确认 → 一键入库；库内资产浏览
│   └── public/
│       ├── index.html               #   仓储站主界面：三栏布局（分类树 / 3D 预览 / 元数据）
│       └── preview.html             #   独立 3D 预览页（three.js 渲染 GLB）
│
├── inbox/                           # ★ 两项目交接目录：tbg-3d pack.js 投递资产包，仓储站确认后清空（gitignore 不入库）
├── godot/                           # Godot 侧集成（预留：每件资产的 .tscn 包装，预挂碰撞 + LOD）
│
├── docs/
│   ├── DESIGN.md                    # ★ 完整设计文档：省钱三板斧、分类体系、模数接口、元数据规范
│   ├── RESTRUCTURE-PLAN.md          # 生产 / 仓储分离重构方案（2026-09）
│   └── OPTIMIZATION.md              # 仓储端优化记录（schema 校验落地、CI、材质命名修复等）
│
└── .github/
    └── workflows/validate.yml       # CI：push/PR 命中 kits/** 或 pipeline/** 时自动跑 validate.js（不拉 LFS，快且省流量）
```

> 提示词模板（`prompts/cn-ancient.md`）与生成计划（`generation-plan.md`、`building-assets.md`）在生产端 **tbg-3d** 仓库的 `pipeline/` 下，2026-09 重构后已从本库迁出。

## 单件资产结构

```
components/roof/roof-xieshan-single-a/
├── model.glb       # 成品（LOD0）
├── model-lod1.glb  # 可选减面版
├── asset.json      # 元数据（schema 校验）
├── preview.png     # 预览图
└── source.json     # 溯源：prompt/seed/task id/积分
```

## 使用（Godot）

```bash
git submodule add https://github.com/sdzdrccc/tbg-assets assets/tbg-assets
```

- 构件 `.tscn`（预挂碰撞 + LOD）直接实例化，网格吸附 0.5m 拼装
- 量产件按 tbg-3d 纪律用 MultiMeshInstance3D 实例化

## 校验

全库审计（零依赖）：

```bash
node pipeline/scripts/validate.js       # 校验全部套件资产
node pipeline/scripts/validate.js cn-ancient   # 只校验指定套件
```

通过 `pipeline/schemas/asset.schema.json` 校验每个 `asset.json`，并核对材质 ref、目录路径、面数预算。push / PR 命中 `kits/` 或 `pipeline/` 时由 GitHub Actions 自动执行。
## 贡献

1. 按 `pipeline/prompts/` 模板生成（禁止自由发挥提示词，保证风格统一）
2. 走 tbg-3d 三工位精修：缩放归一（1 unit = 1m）、轴心底部中心
3. `asset.json` 通过 `pipeline/schemas/asset.schema.json` 校验
4. PR 必须附 preview.png

## 许可

- 资产（`kits/` 下模型与贴图）：**CC0-1.0**，可自由商用
- 脚本与工具（`pipeline/scripts/`）：**MIT**
- 资产由 [Tripo AI](https://www.tripo3d.ai/) 生成并经 Blender 人工精修；仓库不含任何 API 凭证

