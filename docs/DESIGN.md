# tbg-assets 设计文档

> 基于 [tbg-3d](https://github.com/sdzdrccc/tbg-3d) 管线（Tripo → Blender → Godot）的可复用 3D 基础资产库。
> 目标：**把 Tripo 积分花在刀刃上——构件只生成一次，建筑靠拼装，风格靠材质，变化靠变体。**

---

## 1. 设计目标

| 目标 | 手段 |
|---|---|
| 降低 Tripo 费用 | 模块化构件库（kit-bashing），一件构件 N 栋建筑复用 |
| 自由自定义场景 | 统一网格与接口标准，构件任意拼装；整栋建筑用于远景铺量 |
| 风格统一 | 共享材质库 + 无贴图生成，全库视觉一致 |
| 可开源 | 元数据规范 + Git LFS + 预览图 + 许可证声明 |
| 可扩展 | 以"套件（kit）"为单位横向扩展新风格（如：日式、西域、现代） |

## 2. 省钱三板斧（核心策略）

### 2.1 模块化拼装（省 60%+）

不生成"一整栋民居"，而是生成屋顶、墙、柱、台基、门窗等**构件**，在 Godot/Blender 里拼出任意建筑：

```
传统方式：50 栋建筑 × 40 积分 = 2000 积分，且风格漂移
本库方式：30 件构件 ≈ 900 积分 → 拼出无限多建筑，风格天然统一
```

构件只占 Tripo 生成量的小头，大头由 **Wave 0（纯 Blender 手工件，0 积分）** 和拼装组合承担。

### 2.2 无贴图生成 + 共享材质（再省 25%，且风格统一）

Tripo P1 价格：文生 3D **无贴图 30 / 标准贴图 40 / 高清 50** 积分。

- **构件一律无贴图生成（30 积分）**，导入后挂 `kits/<kit>/materials/` 里的共享材质（青瓦、朱漆木、白墙、青石……）
- 好处一：每件省 10 积分，100 件省 1000 积分
- 好处二：全库材质统一，不会出现"这栋楼的瓦和那栋楼的瓦颜色不一样"
- 好处三：换材质 = 免费变体（青瓦 ↔ 琉璃瓦 ↔ 灰瓦，一分钱不花）
- 例外：英雄件、整栋远景建筑用标准贴图（玩家不会走近细看，贴图反而划算）

### 2.3 零成本变体

每件资产在 `asset.json` 声明 `variants`，在引擎内实现，不再花积分：

- **材质替换**：同一屋顶模型 × {青瓦, 黄琉璃, 绿琉璃} = 3 种建筑等级
- **镜像/缩放**：X 轴镜像得对称件；±10% 缩放打破重复感
- **色调偏移**：Godot shader 参数微调木色深浅
- **组合变体**：墙 + 不同门窗 = 不同立面

## 3. 仓库结构

```
tbg-assets/
├── README.md                    # 项目门面：简介、快速开始、效果展示
├── LICENSE                      # 资产 CC0-1.0，脚本 MIT
├── AGENTS.md                    # AI Agent 工作约定（沿用 tbg-3d 三工位纪律）
├── library.config.json          # 全库配置：单位、网格、面数预算
│
├── kits/                        # 风格套件（一个风格一个目录，可横向扩展）
│   └── cn-ancient/              # 首个套件：中式古风（修仙/武侠）
│       ├── kit.json             # 套件元数据与网格标准
│       ├── components/          # ★ 建筑构件（省钱核心，拼装用）
│       │   ├── roof/            #   屋顶
│       │   ├── wall/            #   墙体
│       │   ├── pillar/          #   柱与柱础
│       │   ├── base/            #   台基与台阶
│       │   ├── door-window/     #   门窗
│       │   ├── railing/         #   栏杆
│       │   └── bracket/         #   斗拱（英雄件才用）
│       ├── buildings/           # 整栋建筑（远景铺量/直接使用）
│       │   ├── residential/     #   民居
│       │   ├── commercial/      #   商铺/客栈/酒楼
│       │   ├── palace/          #   宫殿/大殿/山门
│       │   ├── garden/          #   亭/廊/阁/塔/榭
│       │   ├── religious/       #   宗门建筑（修仙题材）
│       │   └── infrastructure/  #   牌坊/城门/桥/箭楼
│       ├── props/               # 道具陈设
│       │   ├── lighting/        #   灯笼/火把
│       │   ├── street/          #   摊位/招牌/水井/货箱
│       │   ├── ritual/          #   香炉/鼎/石狮/碑
│       │   ├── furniture/       #   桌椅/屏风（室内）
│       │   └── cultivation/     #   丹炉/剑架（修仙特色）
│       ├── nature/              # 自然植被
│       │   ├── tree/            #   松/竹/柳/桃/银杏
│       │   ├── rock/            #   石头/假山
│       │   └── plant/           #   莲花/草丛
│       ├── terrain/             # 地形模块
│       │   ├── ground-tile/     #   地面铺装
│       │   ├── cliff/           #   崖壁
│       │   └── water/           #   码头/舟船
│       ├── materials/           # ★ 共享材质库（.tres / .blend）
│       └── previews/            # 预览图（Blender 无头渲染产出）
│
├── pipeline/                    # 生产管线（与 tbg-3d skill 配合）
│   ├── prompts/                 # 各类资产的标准提示词模板
│   ├── schemas/                 # asset.json 的 JSON Schema + 示例
│   ├── generation-plan.md       # ★ 分波次生成清单与积分预算
│   └── scripts/                 # 校验、索引、预览渲染脚本
│
├── godot/                       # Godot 侧集成
│   └── （由脚本生成：每件资产的 .tscn 包装，预挂碰撞 + LOD）
│
└── docs/
    └── DESIGN.md                # 本文档
```

### 单件资产的存放约定（folder-per-asset）

```
components/roof/roof-xieshan-double-a/
├── model.glb          # 成品（LOD0，Blender 精修后）
├── model-lod1.glb     # 可选，减面版
├── asset.json         # 元数据（见第 6 节）
├── preview.png        # 预览图（开源浏览体验的关键）
└── source.json        # 溯源：prompt / seed / task id / 花费积分
```

## 4. 资产分类体系（详细）

### 4.1 components/ 建筑构件 —— 拼装积木

| 子类 | 内容 | 标准尺寸（m） | 说明 |
|---|---|---|---|
| roof | 庑殿顶、歇山顶、悬山顶、硬山顶、攒尖顶、卷棚顶；单檐/重檐 | 宽 4 / 6 / 8 三档 | 屋顶决定建筑等级，每种形制 1-2 件即可 |
| roof（配件） | 正脊、垂脊、鸱吻、脊兽、飞檐角 | — | 挂在屋顶 socket 上，零积分改变华丽度 |
| wall | 实墙、花格墙、带门墙、带槛窗墙、半墙（美人靠） | 宽 2 × 高 3 | 严格模数，横向无限拼接 |
| pillar | 木圆柱、方柱、盘龙柱、石柱 + 柱础 | 高 3 / 4 | 间距 2m / 4m 两档 |
| base | 须弥座、石台基、正面踏跺、侧面踏跺、坡道 | 高 0.5 / 1 | 建筑"落地"的关键 |
| door-window | 隔扇门、板门、槛窗、月洞门、拱券门 | 宽 2 | 与 wall 同宽，可互换嵌入 |
| railing | 寻杖石栏杆、木栏杆 | 宽 2 | 台基/桥/廊通用 |
| bracket | 简易斗拱、华丽斗拱 | — | 只用于英雄件，量产生成不划算 |

### 4.2 buildings/ 整栋建筑 —— 远景铺量与直接可用

| 子类 | 资产举例 |
|---|---|
| residential | 小民居、合院民居、吊脚楼 |
| commercial | 临街店铺、摊位棚、客栈、酒楼、茶肆 |
| palace | 重檐大殿、配殿、山门、宫门 |
| garden | 四角亭、六角亭、游廊、阁、宝塔、水榭 |
| religious（修仙） | 宗门大殿、藏经阁、丹房、演武台 |
| infrastructure | 牌坊、城门楼、石拱桥、木桥、箭楼 |

> 定位：拼装的补充。远景、天际线、玩家不去的区域用整栋（标准贴图，40 积分）；玩家会走近的核心区用构件拼装。

### 4.3 props/ 道具陈设 —— 场景烟火气

| 子类 | 资产举例 |
|---|---|
| lighting | 宫灯、吊灯笼、石灯笼、火把架 |
| street | 货摊、幌子招牌、旗杆、水井、货箱、拴马桩 |
| ritual | 香炉、鼎、石狮、石碑、更鼓、铜钟 |
| furniture | 八仙桌、太师椅、屏风、书架 |
| cultivation | 丹炉、剑架、蒲团、灵石灯 |

### 4.4 nature/ 自然植被

| 子类 | 资产举例 |
|---|---|
| tree | 迎客松、竹丛、垂柳、桃树、银杏、梅树 |
| rock | 假山石、溪石、台阶石 |
| plant | 莲花、草丛、花境 |

### 4.5 terrain/ 地形模块

| 子类 | 资产举例 |
|---|---|
| ground-tile | 青石板、方砖、夯土（2m×2m 可平铺） |
| cliff | 崖壁模块、山体模块 |
| water | 码头、乌篷船、画舫 |

### 4.6 materials/ 共享材质库

| 材质组 | 变体 |
|---|---|
| 瓦 | 青瓦、灰瓦、黄琉璃、绿琉璃 |
| 木 | 朱漆、原木、黑漆、褪色旧木 |
| 墙 | 白墙、夯土黄墙、青砖、粉墙 |
| 石 | 青石、汉白玉、麻石 |
| 金属 | 铜、鎏金、铁 |

## 5. 模块化接口标准（拼装的前提）

**所有 components 必须遵守，否则无法拼装：**

| 项目 | 标准 |
|---|---|
| 单位 | 1 unit = 1 m，Apply Transform 后入库 |
| 轴心 | 底部中心（bottom-center），与 tbg-3d 精修工序一致 |
| 轴向 | +Y 向上，-Z 朝前（glTF 惯例） |
| 网格吸附 | 0.5 m 基础网格；墙类构件宽度必须为 2m 或其整数倍 |
| 层高 | 民居 3m，殿宇 4m 两档，柱高与之对应 |
| 面数预算 | 构件 < 20,000 面；量产整栋 < 50,000；英雄件 < 100,000 |
| 命名 | `小写-连字符`，如 `roof-xieshan-double-a`；资产 id 为 `cn-ancient.roof.xieshan-double-a` |
| socket | 需要拼接口的资产在 `asset.json` 声明 sockets（位置 + 朝向 + 对接类型），如屋顶底部的墙对接线、栏杆两端的续接点 |

## 6. 元数据规范（asset.json）

完整 Schema 见 `pipeline/schemas/asset.schema.json`，示例见 `pipeline/schemas/asset.example.json`。核心字段：

```jsonc
{
  "id": "cn-ancient.roof.xieshan-double-a",   // 全库唯一
  "name": "歇山顶·重檐 A",
  "category": "components/roof",
  "kit": "cn-ancient",
  "tags": ["歇山顶", "重檐", "殿宇"],
  "dimensions_m": [8, 4.5, 6],                // 宽×高×深
  "polycount": 4200,
  "pivot": "bottom-center",
  "lods": { "lod0": "model.glb", "lod1": "model-lod1.glb" },
  "collision": "box",                          // box / convex / none
  "sockets": [ /* 拼接口定义，可选 */ ],
  "materials": ["roof-tile/qingwa", "wood/zhuqi"],   // 引用共享材质
  "variants": [ /* 零成本变体声明 */ ],
  "tier": "component",                         // primitive / component / mass / hero
  "license": "CC0-1.0",
  "author": "sdzdrccc"
}
```

`tier` 分级与费用策略绑定：

| tier | 含义 | 来源 | 积分 |
|---|---|---|---|
| primitive | 几何简单件（台基、台阶、实墙、地面） | Blender 手工/程序化 | **0** |
| component | 拼装构件 | Tripo 文生，无贴图 | 30/件 |
| mass | 量产整栋/道具/植被 | Tripo 文生，标准贴图 | 40/件 |
| hero | 英雄建筑 | 概念图 → Tripo 图生，高清 | 50-60/件 |

## 7. 与 tbg-3d 管线的衔接

本库完全复用 tbg-3d 的三工位纪律，仅目录映射不同：

| tbg-3d 约定 | 本库位置 |
|---|---|
| `assets/concept/` | 生成工作区的 `concept/`（英雄件概念图） |
| `assets/_raw/`（只读底片） | 生成工作区的 `_raw/`，**不入库、不进 git** |
| `assets/production/` | 精修合格后复制进 `kits/<kit>/<category>/<name>/model.glb` |
| `assets/manifest.md` | 每件资产的 `source.json` + 全库 `index.json`（脚本生成） |
| Godot 集成 | `pipeline/scripts` 为每件资产生成预挂碰撞 + LOD 的 `.tscn` 包装，游戏项目整体引用或拷贝 |

入库验收（在 tbg-3d 验收标准上追加）：

1. 通过 `pipeline/schemas/asset.schema.json` 校验
2. 尺寸符合第 5 节模数（墙宽 2m、层高 3/4m）
3. 无贴图构件已挂共享材质并确认渲染效果
4. preview.png 已由无头渲染脚本生成

## 8. Godot 侧使用方式

- **作为子模块**：游戏项目 `git submodule add` 本库，`godot/` 下生成的 `.tscn` 直接实例化
- **拼装场景**：用构件 `.tscn` + Godot 网格吸附（0.5m）手工拼装；量产件按 tbg-3d 纪律用 MultiMeshInstance3D
- **场景模板**（后续）：街道模板、院落模板、山门模板，预拼好的 `.tscn`，改材质即换风格

## 9. 开源注意事项

| 事项 | 方案 |
|---|---|
| 许可证 | 资产 **CC0-1.0**（最大限度可被商用复用）；脚本 **MIT**；LICENSE 文件双许可声明 |
| Tripo 条款 | 发布前确认 Tripo 用户协议中生成模型的再分发权利（Tripo 付费额度生成的模型通常归用户所有，需在 README 注明资产由 Tripo AI 生成） |
| 大文件 | Git LFS 管理 `*.glb *.blend *.png`（见 .gitattributes），`_raw/` 与工作区不入库 |
| 预览体验 | 每件资产必须带 preview.png，README 用表格展示，方便不开引擎浏览 |
| 凭证安全 | 禁止提交 `~/.tripo` 任何凭证；`source.json` 只记 task id 不记账号信息 |
| 贡献规范 | CONTRIBUTING.md：新资产走"提示词模板 → 生成 → 精修 → schema 校验 → 预览图"流程，PR 必须含 preview.png |

## 10. 后续路线

1. **Wave 0**：Blender 手工 primitive 件 + 共享材质库（0 积分，先搭起骨架）
2. **Wave 1**：街景 MVP 构件（见 generation-plan.md，约 30 件）
3. **Wave 2**：商业/院落扩展 + 道具
4. **Wave 3**：英雄件 + 园林 + 修仙特色
5. 场景模板、Godot 拼装插件、更多风格套件（kits/tang、kits/xiyu…）
