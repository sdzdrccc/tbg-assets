# AGENTS.md — tbg-assets

本文件是 AI Agent 在本仓库工作的行为约定，必须严格遵守。本仓库是资产**库**，生产纪律继承 [tbg-3d](https://github.com/sdzdrccc/tbg-3d) skill 的三工位管线。

## 三工位纪律（继承 tbg-3d，不得跳步）

1. **Tripo 生成**：提示词必须取自 `pipeline/prompts/cn-ancient.md` 模板；`--for game-pc -n 2`；原始 glb 输出到工作区 `_raw/`（**不入 git**）；生成前 `tripo balance`
2. **Blender 精修**：清理 → Apply Transform → 缩放归一（1 unit = 1m）→ 轴心底部中心；无贴图构件挂 `kits/cn-ancient/materials/` 共享材质
3. **入库**：复制到 `kits/<kit>/<category>/<name>/`，补齐 `asset.json` + `source.json` + `preview.png`，过 schema 校验；提交前跑 `node pipeline/scripts/validate.js` 全量审计

## 费用纪律

- tier 与单价绑定：primitive=0（Blender 手工）、component=30（无贴图）、mass=40（标准贴图）、hero=50-60（图生高清）
- 几何简单件（台基/台阶/实墙/地面）**禁止用 Tripo 生成**，走 Blender
- 重 roll 用 `tripo redo @last`，不改提示词重跑
- 按 `pipeline/generation-plan.md` 波次执行，超预算先问人

## 模数纪律（components 强制）

- 墙/门窗/栏杆单元：宽 2m × 高 3m；柱高 3m（民居）/ 4m（殿宇）；网格吸附 0.5m
- 命名：文件夹小写连字符；asset id 格式 `<kit>.<子类>.<名称>`
- 面数：构件 < 20,000；量产 < 50,000；英雄 < 100,000

## 禁止事项

- 禁止读取/输出 `~/.tripo` 凭证文件内容
- 禁止提交 `_raw/`、工作区、任何凭证到 git
- 禁止跳过 schema 校验直接入库
