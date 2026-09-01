#!/usr/bin/env node
/**
 * add-asset.js — 把一件精修合格的 glb 登记进资产库
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
 *
 * 做的事：
 *   1. 按 id 解析出分类路径，创建 kits/<kit>/<category>/<short-name>/
 *   2. 复制 glb 为 model.glb
 *   3. 生成 asset.json（含 schema 必填字段）与 source.json
 *   4. 按 asset.schema.json 的必填规则做基本校验
 *
 * 之后还需人工完成：挂共享材质确认效果、生成 preview.png、git 提交。
 */

const fs = require("fs");
const path = require("path");

const TIERS = ["primitive", "component", "mass", "hero"];
const PIVOTS = ["bottom-center", "center", "origin"];
const COLLISIONS = ["box", "convex", "none"];

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 2) {
    const key = argv[i].replace(/^--/, "");
    args[key] = argv[i + 1];
  }
  return args;
}

function fail(msg) {
  console.error("错误：" + msg);
  process.exit(1);
}

const args = parseArgs(process.argv);
const root = path.resolve(__dirname, "..", "..");

// ---- 必填参数 ----
for (const k of ["glb", "id", "name", "tier", "dims", "polycount"]) {
  if (!args[k]) fail(`缺少必填参数 --${k}`);
}

// ---- id 解析：cn-ancient.roof.xieshan-double-a ----
const parts = args.id.split(".");
if (parts.length !== 3) fail("--id 格式应为 <kit>.<子分类>.<名称>，如 cn-ancient.roof.xieshan-double-a");
const [kit, sub, shortName] = parts;
if (!/^[a-z0-9-]+$/.test(shortName)) fail("资产名称必须为小写连字符格式");

const kitDir = path.join(root, "kits", kit);
if (!fs.existsSync(kitDir)) fail(`套件不存在：kits/${kit}`);

// 在所有一级分类下找子分类目录
let categoryRel = null;
for (const top of fs.readdirSync(kitDir)) {
  const topPath = path.join(kitDir, top);
  if (!fs.statSync(topPath).isDirectory()) continue;
  if (fs.existsSync(path.join(topPath, sub))) {
    categoryRel = `${top}/${sub}`;
    break;
  }
}
if (!categoryRel) fail(`kits/${kit} 下找不到子分类 "${sub}"`);

// ---- 字段校验 ----
if (!TIERS.includes(args.tier)) fail(`--tier 必须是 ${TIERS.join("/")}`);
const dims = args.dims.split(",").map(Number);
if (dims.length !== 3 || dims.some(isNaN)) fail("--dims 格式：宽,高,深（米），如 8,4.5,6");
const polycount = Number(args.polycount);
if (isNaN(polycount) || polycount <= 0) fail("--polycount 必须为正整数");
if (!fs.existsSync(args.glb)) fail(`找不到 glb 文件：${args.glb}`);

const budget = { primitive: 10000, component: 20000, mass: 50000, hero: 100000 };
if (polycount > budget[args.tier]) {
  console.warn(`警告：面数 ${polycount} 超出 ${args.tier} 预算 ${budget[args.tier]}，请先减面`);
}

// ---- 创建资产目录 ----
const assetDir = path.join(kitDir, categoryRel, shortName);
if (fs.existsSync(assetDir)) fail(`资产目录已存在：${path.relative(root, assetDir)}`);
fs.mkdirSync(assetDir, { recursive: true });

fs.copyFileSync(args.glb, path.join(assetDir, "model.glb"));

// ---- asset.json ----
const asset = {
  id: args.id,
  name: args.name,
  kit,
  category: categoryRel,
  tier: args.tier,
  tags: args.tags ? args.tags.split(",").map((t) => t.trim()) : [],
  dimensions_m: dims,
  polycount,
  pivot: "bottom-center",
  lods: { lod0: "model.glb" },
  collision: args.collision && COLLISIONS.includes(args.collision) ? args.collision : "box",
  sockets: [],
  materials: args.materials ? args.materials.split(",").map((m) => m.trim()) : [],
  variants: [],
  license: "CC0-1.0",
  author: args.author || "sdzdrccc",
};
fs.writeFileSync(path.join(assetDir, "asset.json"), JSON.stringify(asset, null, 2) + "\n");

// ---- source.json ----
const source = {
  generator: "tripo-p1",
  mode: args.mode || "text",
  prompt: args.prompt || "",
  seed: args.seed || null,
  task_id: args["task-id"] || null,
  credits: args.credits ? Number(args.credits) : null,
  generated_at: new Date().toISOString().slice(0, 10),
  raw_file: args.glb,
  refinement: "待填写：Blender 精修记录",
};
fs.writeFileSync(path.join(assetDir, "source.json"), JSON.stringify(source, null, 2) + "\n");

console.log("已入库：" + path.relative(root, assetDir));
console.log("  model.glb / asset.json / source.json 已生成");
console.log("");
console.log("接下来手动完成：");
console.log("  1. 无贴图件：在 Blender/Godot 挂共享材质并确认渲染效果");
console.log("  2. 生成 preview.png（300x300 白底）放入该目录");
console.log("  3. git add -A && git commit -m \"asset: " + args.id + "\" && git push");
