#!/usr/bin/env node
/**
 * add-asset.js — 把一件精修合格的 glb 登记进资产库（CLI 版）
 * 核心逻辑在 lib/intake.js；可视化入库请用 tools/intake/server.js
 *
 * 用法（在仓库根目录执行）：
 *   node pipeline/scripts/add-asset.js \
 *     --glb work/production/roof-xieshan-double-a.glb \
 *     --id cn-ancient.roof.xieshan-double-a \
 *     --name "歇山顶·重檐 A" \
 *     --tier component \
 *     --dims 8,4.5,6 \
 *     --polycount 4200 \
 *     --tags 歇山顶,重檐,殿宇 \
 *     --materials roof-tile/qingwa,wood/zhuqi \
 *     --credits 30 \
 *     --prompt "中式歇山顶重檐，宽8米..." \
 *     --seed 12345 --task-id abcdef
 */

const path = require("path");
const { intakeAsset } = require("./lib/intake");

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 2) {
    args[argv[i].replace(/^--/, "")] = argv[i + 1];
  }
  return args;
}

const args = parseArgs(process.argv);
const root = path.resolve(__dirname, "..", "..");

try {
  const { assetDir, warnings } = intakeAsset(root, {
    glb: args.glb,
    id: args.id,
    name: args.name,
    tier: args.tier,
    dims: args.dims,
    polycount: args.polycount,
    tags: args.tags ? args.tags.split(",").map((t) => t.trim()) : [],
    materials: args.materials ? args.materials.split(",").map((m) => m.trim()) : [],
    credits: args.credits,
    prompt: args.prompt,
    seed: args.seed,
    task_id: args["task-id"],
    mode: args.mode,
    generator: args.generator,
    collision: args.collision,
    author: args.author,
  });

  warnings.forEach((w) => console.warn("警告：" + w));
  console.log("已入库：" + assetDir);
  console.log("  model.glb / asset.json / source.json 已生成\n");
  console.log("接下来手动完成：");
  console.log("  1. 无贴图件：在 Blender/Godot 挂共享材质并确认渲染效果");
  console.log("  2. 生成 preview.png（300x300 白底）放入该目录");
  console.log(`  3. git add -A && git commit -m "asset: ${args.id}" && git push`);
} catch (e) {
  console.error("错误：" + e.message);
  process.exit(1);
}
