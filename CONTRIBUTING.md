# 贡献指南：一件资产从 Tripo 到入库的完整流程

> 也适用于维护者本人日常入库。流程遵循 [tbg-3d](https://github.com/sdzdrccc/tbg-3d) 三工位纪律：Tripo 生成 → Blender 精修 → 入库登记。

## 流程总览

```
选品（generation-plan.md）
  → Tripo 生成（_raw/ 底片，不入 git）
  → Blender 精修（固定五道工序）
  → add-asset.js 登记入库
  → 挂共享材质 + 生成 preview.png
  → git 提交推送
```

## 1. 选品

从 `pipeline/generation-plan.md` 挑下一件要生成的资产，确认：

- `tripo balance` 额度充足（建议 ≥ 本波预算 × 1.2）
- 提示词从 `pipeline/prompts/cn-ancient.md` 对应分类模板复制，**只改主体和尺寸**

## 2. Tripo 生成

```bash
# 构件（无贴图，30 积分）
tripo make "【按模板填】，单体孤立物件，无底座无地面" --for game-pc -n 2 -o _raw/components

# 整栋/道具（标准贴图，40 积分）
tripo make "【按模板填】，完整单体建筑，带贴图" --for game-pc -n 2 -o _raw/buildings
```

纪律：`-n 2` 出候选择优；不满意 `tripo redo @last` 换 seed，**不改提示词重跑**。

## 3. 精修（两条路线）

### 路线 A：Blender 精修（标准，固定五道工序，不得跳步）

1. 导入 `_raw/` 的 glb
2. 清理：删废面、补洞、Merge by Distance
3. Apply Transform；**缩放归一 1 unit = 1m；轴心移到底部中心**
4. 构件/量产件到此完成；英雄件（全场景 ≤ 5）增加手动结构细化
5. 导出 glb 到工作区 `work/production/`，文件名小写连字符

### 路线 B：无 Blender 应急（gltf-transform + FBX2glTF 工具链）

机器上没有 Blender、或只需要减面/压贴图/转格式/修缩放时：

```bash
# FBX → GLB（FBX2glTF，Godot 维护分支）
FBX2glTF-windows-x86_64.exe --binary --input a.fbx --output a.glb

# 减面 + 贴图压缩 + 清理（gltf-transform）
gltf-transform simplify a.glb b.glb --ratio 0.012 --error 0.005   # 面数压到 ~1.2%
gltf-transform resize b.glb c.glb --width 1024 --height 1024      # 贴图压到 1024
gltf-transform prune c.glb d.glb                                  # 清理未引用数据

# 修正单位缩放（如混元3D FBX 转出的 100 倍缩水；同时把节点 scale 烘平）
NODE_PATH=<managed-node>/node_modules node pipeline/scripts/fix-scale.js --in d.glb --scale 100
```

注意：

- 混元3D 的坑：**无纹理只能导出 FBX/STL/USDZ，且 FBX 转出后顶点坐标小 100 倍**（单位 bug），必须跑 fix-scale.js
- FBX 路线的模型朝向未经目检前不要直接入库——在入库工具里预览确认屋顶是"立着"的
- 路线 B 不替代路线 A 的清理/补洞/轴心归一工序；英雄件仍须走 Blender

面数预算：primitive < 1万 / component < 2万 / mass < 5万 / hero < 10万。

## 4. 登记入库

### 方式一：可视化入库工具（推荐）

```bash
node tools/intake/server.js        # 启动后浏览器打开 http://localhost:8788
```

把精修好的 glb 放进 `inbox/`（或在网页里拖拽上传）→ 左侧选择文件 → 3D 预览自动读取**尺寸与面数**，同时**根据文件名自动识别分类**（tier/分类/积分/tags 全部预填好）→ 确认识别结果、填名称 → 点「入库」。自动完成建目录、复制 `model.glb`、生成 `asset.json` + `source.json`。

> **命名建议**：文件名带上类别词就能被自动识别，中英文、连字符分隔均可，如
> `xieshan-double-a.glb`、`roof-xuanshan-a.glb`、`丹炉-青铜-a.glb`、`lantern-red.glb`、`牌坊-三间四柱.glb`。
> 页面会显示识别依据与置信度；识别不对可展开「手动调整分类」改一下。
> 规则见 `pipeline/scripts/lib/classify.js`，遇到识别不到的词直接往里面加。

### 方式二：命令行

```bash
node pipeline/scripts/add-asset.js \
  --glb work/production/roof-xieshan-double-a.glb \
  --id cn-ancient.roof.xieshan-double-a \
  --name "歇山顶·重檐 A" \
  --tier component \
  --dims 8,4.5,6 \
  --polycount 4200 \
  --tags 歇山顶,重檐,殿宇 \
  --materials roof-tile/qingwa,wood/zhuqi \
  --credits 30 \
  --prompt "生成时用的完整提示词" \
  --seed 12345 --task-id xxxxx
```

脚本自动完成：按 id 定位分类目录 → 复制 `model.glb` → 生成 `asset.json` + `source.json` → 校验必填字段与面数预算。

## 5. 收尾（人工两步）

1. **无贴图件**：挂 `kits/<kit>/materials/` 共享材质，确认渲染效果；把用到的材质写回 `asset.json` 的 `materials`
2. **预览图**：生成 `preview.png`（300×300 白底，3/4 视角）放入资产目录——PR 必须含预览图

## 6. 提交

```bash
git add -A
git commit -m "asset: cn-ancient.roof.xieshan-double-a"
git push
```

在 `pipeline/generation-plan.md` 对应行尾打 ✅。

## 硬性规则

- `_raw/`、概念图、工作区文件**永不入库**（.gitignore 已排除）
- 构件必须符合模数：墙宽 2m、层高 3/4m、网格 0.5m（见 docs/DESIGN.md §5）
- 禁止提交任何 Tripo 凭证；`source.json` 只记 task id
- 新风格请新建 `kits/<新套件>/`，不要混进 cn-ancient
