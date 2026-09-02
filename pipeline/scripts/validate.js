#!/usr/bin/env node
/**
 * validate.js — 资产库全量审计（仓储端权威校验，零依赖）
 *
 * 用法：node pipeline/scripts/validate.js [kit 过滤，可选]
 *
 * 检查项：
 *   1. 每个 kits 下资产的 asset.json 通过 asset.schema.json 校验
 *   2. source.json 溯源文件存在
 *   3. category 与资产 id / 目录路径一致
 *   4. 引用的共享材质 ref 存在于 kits/<kit>/materials/index.json
 *   5. polycount 不超过 kit.json budgets 对应 tier 预算
 *
 * 退出码：0 = 全部通过；1 = 存在错误；2 = 用法错误。
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { validateAssetJson } = require("./lib/schema");

const ROOT = path.resolve(__dirname, "..", "..");
const KITS = path.join(ROOT, "kits");

function walkAssetJsons(dir, list) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walkAssetJsons(p, list);
    else if (entry.name === "asset.json") list.push(p);
  }
}

function loadJson(p) {
  try { return JSON.parse(fs.readFileSync(p, "utf8")); }
  catch (e) { throw new Error(`无法解析 ${path.relative(ROOT, p)}: ${e.message}`); }
}

function loadKitConfig(kit) {
  const p = path.join(KITS, kit, "kit.json");
  if (!fs.existsSync(p)) return null;
  return loadJson(p);
}

function getMaterialRefs(kit) {
  const p = path.join(KITS, kit, "materials", "index.json");
  if (!fs.existsSync(p)) return [];
  try {
    const idx = loadJson(p);
    return (idx.materials || []).map((m) => m.ref);
  } catch { return []; }
}

function resolveCategory(kit, sub) {
  const kitDir = path.join(KITS, kit);
  if (!fs.existsSync(kitDir)) return null;
  for (const top of fs.readdirSync(kitDir)) {
    const topPath = path.join(kitDir, top);
    if (!fs.statSync(topPath).isDirectory()) continue;
    if (top === "materials" || top === "previews") continue;
    if (fs.existsSync(path.join(topPath, sub))) return `${top}/${sub}`;
  }
  return null;
}

function main() {
  const filter = process.argv[2];
  const assets = [];
  const kitDirs = fs.readdirSync(KITS).filter((k) => {
    if (filter && k !== filter) return false;
    return fs.statSync(path.join(KITS, k)).isDirectory();
  });

  for (const kit of kitDirs) walkAssetJsons(path.join(KITS, kit), assets);

  const errors = [];
  const warnings = [];
  let checked = 0;

  const kitConfigs = {};
  for (const kit of kitDirs) kitConfigs[kit] = loadKitConfig(kit);

  for (const assetFile of assets) {
    checked++;
    const rel = path.relative(ROOT, assetFile).replace(/\\/g, "/");
    const dir = path.dirname(assetFile);
    let asset;
    try { asset = loadJson(assetFile); }
    catch (e) { errors.push(e.message); continue; }

    // 1. schema 校验
    const schemaErrs = validateAssetJson(asset);
    for (const e of schemaErrs) errors.push(`${rel}: ${e}`);

    // 2. source.json 溯源
    const sourceFile = path.join(dir, "source.json");
    if (!fs.existsSync(sourceFile)) {
      warnings.push(`${rel}: 缺少 source.json（溯源文件）`);
    }

    // 3. id 解析 + category 一致 + 目录路径一致
    const parts = String(asset.id).split(".");
    if (parts.length === 3) {
      const [kit, sub, shortName] = parts;
      const expectedCategory = resolveCategory(kit, sub);
      if (expectedCategory && asset.category !== expectedCategory) {
        errors.push(`${rel}: category(${asset.category}) 与 id 解析(${expectedCategory}) 不一致`);
      }
      const expectedDir = path.join(KITS, kit, expectedCategory || sub, shortName);
      if (path.resolve(expectedDir).toLowerCase() !== path.resolve(dir).toLowerCase()) {
        errors.push(`${rel}: 目录与 id 不匹配，期望 ${path.relative(ROOT, expectedDir).replace(/\\/g, "/")}`);
      }
    } else {
      errors.push(`${rel}: id 格式应为 <kit>.<子类>.<名称>`);
    }

    // 4. 材质 ref 存在性
    const kitConfig = kitConfigs[asset.kit];
    const refs = getMaterialRefs(asset.kit);
    for (const m of asset.materials || []) {
      if (!refs.includes(m)) {
        errors.push(`${rel}: 材质 ref「${m}」不在 kits/${asset.kit}/materials/index.json 中`);
      }
    }

    // 5. polycount 预算
    const budget = (kitConfig && kitConfig.budgets) ? kitConfig.budgets[asset.tier] : undefined;
    if (budget && asset.polycount > budget) {
      warnings.push(`${rel}: polycount ${asset.polycount} 超出 ${asset.tier} 预算 ${budget}`);
    }
  }

  console.log(`\n=== tbg-assets 校验报告 ===`);
  console.log(`检查资产：${checked} 件，套件：${kitDirs.join(", ") || "(无)"}`);
  console.log(`错误：${errors.length}，警告：${warnings.length}`);
  if (warnings.length) {
    console.log("\n-- 警告 --");
    warnings.forEach((w) => console.log("  ⚠ " + w));
  }
  if (errors.length) {
    console.log("\n-- 错误 --");
    errors.forEach((e) => console.log("  ✗ " + e));
  }
  if (errors.length) { console.log("\n结果：未通过"); process.exit(1); }
  if (warnings.length) console.log("\n结果：通过（有警告）");
  else console.log("\n结果：全部通过");
  process.exit(0);
}

main();
