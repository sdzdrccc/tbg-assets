/**
 * intake.js — 仓储端入库核心逻辑（CLI 与仓储站共用）
 *
 * 职责边界（2026-09 重构）：只做「校验 → 拷贝 → 登记」，不含任何加工
 * （减面/缩放/材质映射等生产逻辑在 tbg-3d skill 的 pipeline/scripts）。
 *
 * intakeAsset(root, opts)：裸 glb + 元数据字段入库（网页上传兜底通道）
 * intakePackage(root, pkgDir)：标准资产包入库（tbg-3d pack.js 投递的主通道）
 * scanKits(root)：扫描套件结构
 * 出错抛 Error；成功返回 { assetDir: 相对路径 }
 */

const fs = require("fs");
const path = require("path");
const { validateAssetJson } = require("./schema");

const TIERS = ["primitive", "component", "mass", "hero"];
const COLLISIONS = ["box", "convex", "none"];
const BUDGET = { primitive: 10000, component: 20000, mass: 50000, hero: 100000 };

/**
 * 读取套件 kit.json 的 budgets（权威）；缺失时回退内置 BUDGET，避免双轨漂移。
 * @param {string} root 仓库根目录
 * @param {string} kit  套件 id
 */
function kitBudget(root, kit) {
  try {
    const k = JSON.parse(fs.readFileSync(path.join(root, "kits", kit, "kit.json"), "utf8"));
    if (k && k.budgets) return k.budgets;
  } catch {}
  return BUDGET;
}

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

  const budget = kitBudget(root, kit);
  if (polycount > (budget[opts.tier] || BUDGET[opts.tier])) {
    warnings.push(`面数 ${polycount} 超出 ${opts.tier} 预算 ${budget[opts.tier] || BUDGET[opts.tier]}，建议减面`);
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
  const schemaErrs = validateAssetJson(asset);
  if (schemaErrs.length) throw new Error("asset.json 未通过 schema 校验:\n" + schemaErrs.join("\n"));
  fs.writeFileSync(path.join(assetDir, "asset.json"), JSON.stringify(asset, null, 2) + "\n");

  const source = {
    generator: opts.generator || "tripo-p1",
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

/**
 * 按 asset.id 解析目标目录 kits/<kit>/<top>/<sub>/<short-name>，返回 { assetDir, categoryRel }
 */
function resolveAssetDir(root, id) {
  const parts = String(id).split(".");
  if (parts.length !== 3) {
    throw new Error("id 格式应为 <kit>.<子分类>.<名称>，如 cn-ancient.roof.xieshan-double-a");
  }
  const [kit, sub, shortName] = parts;
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
  return { assetDir: path.join(kitDir, categoryRel, shortName), categoryRel };
}

/**
 * intakePackage(root, pkgDir) — 标准资产包入库（tbg-3d pack.js 投递的主通道）
 *
 * 资产包 = model.glb + asset.json + source.json。
 * 校验：asset.json 必填字段、category 与目录结构一致、面数预算、目录冲突。
 * 入库后删除 inbox 中的包目录（消费语义）。
 */
function intakePackage(root, pkgDir) {
  const warnings = [];
  const assetFile = path.join(pkgDir, "asset.json");
  const glbFile = path.join(pkgDir, "model.glb");
  const sourceFile = path.join(pkgDir, "source.json");
  if (!fs.existsSync(assetFile)) throw new Error("资产包缺少 asset.json");
  if (!fs.existsSync(glbFile)) throw new Error("资产包缺少 model.glb");

  const asset = JSON.parse(fs.readFileSync(assetFile, "utf8"));
  for (const k of ["id", "name", "category", "kit", "dimensions_m", "polycount", "tier"]) {
    if (asset[k] === undefined || asset[k] === null || asset[k] === "") {
      throw new Error(`asset.json 缺少必填字段 ${k}`);
    }
  }
  const schemaErrs = validateAssetJson(asset);
  if (schemaErrs.length) throw new Error("资产包 asset.json 未通过 schema 校验:\n" + schemaErrs.join("\n"));
  if (!TIERS.includes(asset.tier)) throw new Error(`tier 必须是 ${TIERS.join("/")}`);
  const polycount = Number(asset.polycount);
  if (isNaN(polycount) || polycount <= 0) throw new Error("polycount 必须为正整数");
  const budget = kitBudget(root, asset.kit);
  if (polycount > (budget[asset.tier] || BUDGET[asset.tier])) {
    warnings.push(`面数 ${polycount} 超出 ${asset.tier} 预算 ${budget[asset.tier] || BUDGET[asset.tier]}`);
  }

  const { assetDir, categoryRel } = resolveAssetDir(root, asset.id);
  if (asset.category !== categoryRel) {
    throw new Error(`asset.json 的 category(${asset.category}) 与 id 解析结果(${categoryRel}) 不一致`);
  }
  if (fs.existsSync(assetDir)) {
    throw new Error(`资产目录已存在：${path.relative(root, assetDir)}`);
  }

  fs.mkdirSync(assetDir, { recursive: true });
  fs.copyFileSync(glbFile, path.join(assetDir, "model.glb"));
  fs.writeFileSync(path.join(assetDir, "asset.json"), JSON.stringify(asset, null, 2) + "\n");
  if (fs.existsSync(sourceFile)) {
    fs.copyFileSync(sourceFile, path.join(assetDir, "source.json"));
  } else {
    warnings.push("资产包缺少 source.json，已跳过溯源文件");
  }

  // 消费语义：入库成功后清空 inbox 包目录
  fs.rmSync(pkgDir, { recursive: true, force: true });

  return { assetDir: path.relative(root, assetDir), warnings };
}

/** 扫描 inbox/ 下的资产包（含 asset.json + model.glb 的目录） */
function scanPackages(root) {
  const inboxDir = path.join(root, "inbox");
  const out = [];
  if (!fs.existsSync(inboxDir)) return out;
  for (const entry of fs.readdirSync(inboxDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const pkgDir = path.join(inboxDir, entry.name);
    const assetFile = path.join(pkgDir, "asset.json");
    if (!fs.existsSync(assetFile) || !fs.existsSync(path.join(pkgDir, "model.glb"))) continue;
    try {
      const asset = JSON.parse(fs.readFileSync(assetFile, "utf8"));
      out.push({
        dir: path.relative(root, pkgDir).replace(/\\/g, "/"),
        id: asset.id || null,
        name: asset.name || entry.name,
        category: asset.category || null,
        tier: asset.tier || null,
        polycount: asset.polycount || null,
        materials: asset.materials || [],
        hasSource: fs.existsSync(path.join(pkgDir, "source.json")),
      });
    } catch { /* asset.json 损坏的包不列出 */ }
  }
  return out;
}

module.exports = { intakeAsset, intakePackage, scanPackages, scanKits, TIERS, BUDGET };
