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

## 目录速览

```
kits/cn-ancient/        首个风格套件：中式古风（修仙/武侠）
  components/           ★ 建筑构件（roof/wall/pillar/base/door-window/railing/bracket）
  buildings/            整栋建筑（民居/商业/宫殿/园林/宗门/基础设施）
  props/                道具陈设（灯/街道/礼器/家具/修仙）
  nature/               植被石景（树/石/花草）
  terrain/              地形模块（铺装/崖壁/水岸）
  materials/            ★ 共享材质库
pipeline/
  prompts/              各类资产标准提示词模板
  generation-plan.md    ★ 分波次生成清单与积分预算（总计约 2460 积分）
  schemas/              asset.json 元数据规范
docs/DESIGN.md          ★ 完整设计文档
```

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

