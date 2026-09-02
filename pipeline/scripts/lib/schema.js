"use strict";
/**
 * schema.js — 轻量 draft-07 子集校验器（tbg-assets 契约权威）
 *
 * 用途：生产端（tbg-3d pack.js）与仓储端（intake.js / validate.js）共用，
 * 把 `asset.schema.json` 从"文档权威"变成"代码权威"。
 *
 * 覆盖 schema 用到的子集：type / enum / const / pattern / minimum /
 * required / properties / items / minItems / maxItems / additionalProperties。
 * 零依赖。
 */

const fs = require("fs");
const path = require("path");

function typeOf(v) {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v;
}

function matchesType(v, t) {
  switch (t) {
    case "object":  return v !== null && typeof v === "object" && !Array.isArray(v);
    case "array":   return Array.isArray(v);
    case "string":  return typeof v === "string";
    case "integer": return Number.isInteger(v);
    case "number":  return typeof v === "number" && Number.isFinite(v);
    case "boolean": return typeof v === "boolean";
    case "null":    return v === null;
    default:        return true;
  }
}

/**
 * 校验 value 是否符合 schema。返回错误字符串数组（空数组 = 通过）。
 * @param {*} value
 * @param {object} schema
 * @param {string} basePath 错误路径前缀
 */
function validateSchema(value, schema, basePath) {
  const errs = [];
  const base = basePath || "$";
  if (schema == null || typeof schema !== "object") return errs;

  if (schema.type && !matchesType(value, schema.type)) {
    errs.push(`${base}: 类型应为 ${schema.type}，收到 ${typeOf(value)}`);
    return errs;
  }

  if (Array.isArray(schema.enum) && !schema.enum.some((e) => e === value)) {
    errs.push(`${base}: 值 ${JSON.stringify(value)} 不在 enum [${schema.enum.join(", ")}] 内`);
  }

  if (schema.const !== undefined && schema.const !== value) {
    errs.push(`${base}: 值 ${JSON.stringify(value)} 必须等于 const ${JSON.stringify(schema.const)}`);
  }

  if (schema.pattern && typeof value === "string" && !new RegExp(schema.pattern).test(value)) {
    errs.push(`${base}: 字符串不匹配 pattern ${schema.pattern}`);
  }

  if (schema.minimum !== undefined && typeof value === "number" && value < schema.minimum) {
    errs.push(`${base}: 数值应 >= ${schema.minimum}，收到 ${value}`);
  }

  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errs.push(`${base}: 数组长度应 >= ${schema.minItems}，收到 ${value.length}`);
    }
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      errs.push(`${base}: 数组长度应 <= ${schema.maxItems}，收到 ${value.length}`);
    }
    if (schema.items) {
      value.forEach((item, i) => errs.push(...validateSchema(item, schema.items, `${base}[${i}]`)));
    }
  }

  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const req of schema.required || []) {
      const v = value[req];
      if (v === undefined || v === null || v === "") {
        errs.push(`${base}: 缺少必填字段 ${req}`);
      }
    }
    for (const [k, sub] of Object.entries(schema.properties || {})) {
      if (value[k] !== undefined && value[k] !== null) {
        errs.push(...validateSchema(value[k], sub, `${base}.${k}`));
      }
    }
    if (schema.additionalProperties === false) {
      for (const k of Object.keys(value)) {
        if (!(schema.properties && Object.prototype.hasOwnProperty.call(schema.properties, k))) {
          errs.push(`${base}: 不允许的字段 ${k}`);
        }
      }
    }
  }

  return errs;
}

/** 加载 asset.schema.json */
function loadAssetSchema() {
  const p = path.join(__dirname, "..", "..", "schemas", "asset.schema.json");
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

/** 校验单个 asset.json 对象。返回错误数组（空 = 通过）。 */
function validateAssetJson(asset) {
  return validateSchema(asset, loadAssetSchema(), "asset");
}

module.exports = { validateSchema, validateAssetJson, loadAssetSchema, matchesType };
