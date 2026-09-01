/**
 * intake.js — 资产入库核心逻辑（CLI 与 Web 工具共用）
 *
 * intakeAsset(root, opts)：
 *   1. 按 id 解析分类路径，创建 kits/<kit>/<category>/<short-name>/
 *   2. 复制 glb 为 model.glb
 *   3. 生成 asset.json 与 source.json
 *   4. 基本校验（格式、面数预算、目录冲突）
 * 出错抛 Error；成功返回 { assetDir: 相对路径 }
 */

const fs = require("fs");
const path = require("path");

const TIERS = ["primitive", "component", "mass", "hero"];
const COLLISIONS = ["box", "convex", "none"];
const BUDGET = { primitive: 10000, component: 20000, mass: 50000, hero: 100000 };

/**
 * @param {string} root 仓库根目录
 * @param {object} opts
 *   glb: string       glb 文件路径（绝对，或相对 root）
 *   id: string        <kit>.<子分类>.<名称>，如 cn-ancient.roof.xieshan-double-a
 *   name: string      中文名
 *   tier: string      primitive/component/mass/hero
 *   dims: number[3]   宽,高,深（米）
 *   polycount: number
 *   tags/materials: string[]
 *   credits/seed/task_id/mode/prompt/author/collision: 可选
 */
function intakeAsset(root, opts) {
  const warnings = [];

  // ---- 必填 ----
  for (const k of ["glb", "id", "name", "tier", "dims", "polycount"]) {
    if (opts[k] === undefined || opts[k] === null || opts[k] === "") {
      throw new Error(`缺少必填字段 ${k}`);
    }
  }

  // ---- id 解析 ----
  const parts = String(opts.id).split(".");
  if (parts.length !== 3) {
    throw new Error("id 格式应为 <kit>.<子分类>.<名称>，如 cn-ancient.roof.xieshan-double-a");
  }
  const [kit, sub, shortName] = parts;
  if (!/^[a-z0-9-]+$/.test(shortName)) throw new Error("资产名称必须为小写连字符格式");

  const kitDir = path.join(root, "kits", kit);
  if (!fs.existsSync(kitDir)) throw new Error(`套件不存在：kits/${kit}`);

  let categoryRel = null;
  for (const top of fs.readdirSync(kitDir)) {
    const topPath = path.join(kitDir, top);
    if (!fs.statSync(topPath).isDirectory()) continue;
    if (fs.existsSync(path.join(topPath, sub))) {
      categoryRel = `${top}/${sub}`;
      break;
    }
  }
  if (!categoryRel) throw new Error(`kits/${kit} 下找不到子分类 "${sub}"`);

  // ---- 字段校验 ----
  if (!TIERS.includes(opts.tier)) throw new Error(`tier 必须是 ${TIERS.join("/")}`);
  const dims = (Array.isArray(opts.dims) ? opts.dims : String(opts.dims).split(",")).map(Number);
  if (dims.length !== 3 || dims.some(isNaN)) throw new Error("dims 格式：宽,高,深（米）");
  const polycount = Number(opts.polycount);
  if (isNaN(polycount) || polycount <= 0) throw new Error("polycount 必须为正整数");

  const glbAbs = path.isAbsolute(opts.glb) ? opts.glb : path.join(root, opts.glb);
  if (!fs.existsSync(glbAbs)) throw new Error(`找不到 glb 文件：${opts.glb}`);

  if (polycount > BUDGET[opts.tier]) {
    warnings.push(`面数 ${polycount} 超出 ${opts.tier} 预算 ${BUDGET[opts.tier]}，建议减面`);
  }

  // ---- 创建资产目录 ----
  const assetDir = path.join(kitDir, categoryRel, shortName);
  if (fs.existsSync(assetDir)) throw new Error(`资产目录已存在：${path.relative(root, assetDir)}`);
  fs.mkdirSync(assetDir, { recursive: true });
  fs.copyFileSync(glbAbs, path.join(assetDir, "model.glb"));

  const asset = {
    id: opts.id,
    name: opts.name,
    kit,
    category: categoryRel,
    tier: opts.tier,
    tags: opts.tags || [],
    dimensions_m: dims,
    polycount,
    pivot: "bottom-center",
    lods: { lod0: "model.glb" },
    collision: COLLISIONS.includes(opts.collision) ? opts.collision : "box",
    sockets: opts.sockets || [],
    materials: opts.materials || [],
    variants: opts.variants || [],
    license: "CC0-1.0",
    author: opts.author || "sdzdrccc",
  };
  fs.writeFileSync(path.join(assetDir, "asset.json"), JSON.stringify(asset, null, 2) + "\n");

  const source = {
    generator: "tripo-p1",
    mode: opts.mode || "text",
    prompt: opts.prompt || "",
    seed: opts.seed || null,
    task_id: opts.task_id || null,
    credits: opts.credits != null ? Number(opts.credits) : null,
    generated_at: new Date().toISOString().slice(0, 10),
    raw_file: path.basename(glbAbs),
    refinement: "待填写：Blender 精修记录",
  };
  fs.writeFileSync(path.join(assetDir, "source.json"), JSON.stringify(source, null, 2) + "\n");

  return { assetDir: path.relative(root, assetDir), warnings };
}

/** 扫描套件结构，供下拉框使用：{ kit: { top: [sub,...], materials: [...] } } */
function scanKits(root) {
  const kitsDir = path.join(root, "kits");
  const result = {};
  if (!fs.existsSync(kitsDir)) return result;
  for (const kit of fs.readdirSync(kitsDir)) {
    const kitPath = path.join(kitsDir, kit);
    if (!fs.statSync(kitPath).isDirectory()) continue;
    const tree = {};
    let materials = [];
    for (const top of fs.readdirSync(kitPath)) {
      const topPath = path.join(kitPath, top);
      if (!fs.statSync(topPath).isDirectory()) continue;
      if (top === "materials") {
        materials = fs.readdirSync(topPath).filter((f) => !f.startsWith("."));
        continue;
      }
      if (top === "previews") continue; // 预览图目录不是资产分类
      tree[top] = fs
        .readdirSync(topPath)
        .filter((f) => fs.statSync(path.join(topPath, f)).isDirectory());
    }
    result[kit] = { tree, materials };
  }
  return result;
}

module.exports = { intakeAsset, scanKits, TIERS, BUDGET };
