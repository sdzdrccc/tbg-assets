#!/usr/bin/env node
/**
 * tbg-assets 可视化入库工具（零依赖，Node ≥ 18）
 *
 * 用法：node tools/intake/server.js [端口，默认 8788]
 * 然后浏览器打开 http://localhost:8788
 *
 * 功能：
 *   - 扫描 inbox/（把 glb 拖进去即可）与 work/production/ 下的 glb 文件
 *   - 网页端 3D 预览，自动读取尺寸与面数
 *   - 填元数据 → 一键入库（复用 pipeline/scripts/lib/intake.js）
 *   - 支持网页拖拽上传 glb 到 inbox/
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const { intakeAsset, scanKits } = require("../../pipeline/scripts/lib/intake");
const { classifyFileName, LABELS } = require("../../pipeline/scripts/lib/classify");

const ROOT = path.resolve(__dirname, "..", "..");
const PUBLIC = path.join(__dirname, "public");
const INBOX = path.join(ROOT, "inbox");
const PORT = Number(process.argv[2]) || 8788;

fs.mkdirSync(INBOX, { recursive: true });

/** 只允许访问 ROOT 内的路径，防目录穿越 */
function safeResolve(rel) {
  const abs = path.resolve(ROOT, rel || ".");
  if (!abs.startsWith(ROOT)) return null;
  return abs;
}

function findGlb(dir, base) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...findGlb(p, base));
    else if (/\.(glb|fbx|stl|usdz)$/i.test(entry.name)) {
      const stat = statSyncSafe(p);
      if (!stat) continue;
      const isGlb = /\.glb$/i.test(entry.name);
      out.push({
        path: path.relative(ROOT, p).replace(/\\/g, "/"),
        name: entry.name,
        size: stat.size,
        mtime: stat.mtime.toISOString().slice(0, 16).replace("T", " "),
        from: base,
        // fbx/stl/usdz 需先过 Blender 精修导出 glb，不能直接入库
        needsRefine: !isGlb,
      });
    }
  }
  return out;
}

function statSyncSafe(p) {
  try { return fs.statSync(p); } catch { return null; }
}

function json(res, code, data) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  const route = url.pathname;

  try {
    // ---- 页面 ----
    if (route === "/" ) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(fs.readFileSync(path.join(PUBLIC, "index.html")));
    }

    // ---- 扫描 glb：inbox/ + work/production/ ----
    if (route === "/api/scan") {
      const files = [
        ...findGlb(INBOX, "inbox"),
        ...findGlb(path.join(ROOT, "work", "production"), "work/production"),
      ].sort((a, b) => (a.mtime < b.mtime ? 1 : -1));
      return json(res, 200, { files });
    }

    // ---- 套件结构（下拉框） ----
    if (route === "/api/kits") {
      return json(res, 200, { kits: scanKits(ROOT), labels: LABELS });
    }

    // ---- 文件名自动识别分类 ----
    if (route === "/api/classify") {
      const name = url.searchParams.get("name") || "";
      return json(res, 200, classifyFileName(name));
    }

    // ---- 模型文件（预览用，glb/fbx/stl） ----
    if (route === "/api/file") {
      const abs = safeResolve(url.searchParams.get("path"));
      if (!abs || !fs.existsSync(abs) || !/\.(glb|fbx|stl)$/i.test(abs)) {
        return json(res, 404, { error: "file not found" });
      }
      res.writeHead(200, { "Content-Type": "application/octet-stream" });
      return fs.createReadStream(abs).pipe(res);
    }

    // ---- 上传模型文件到 inbox/（glb 可直接入库；fbx/stl/usdz 需先过 Blender 精修） ----
    if (route === "/api/upload" && req.method === "POST") {
      const name = path.basename(url.searchParams.get("name") || "upload.glb");
      if (!/\.(glb|fbx|stl|usdz)$/i.test(name)) return json(res, 400, { error: "仅接受 .glb/.fbx/.stl/.usdz" });
      const body = await readBody(req);
      fs.writeFileSync(path.join(INBOX, name), body);
      return json(res, 200, { ok: true, name });
    }

    // ---- 入库 ----
    if (route === "/api/intake" && req.method === "POST") {
      const body = JSON.parse((await readBody(req)).toString("utf8"));
      const abs = safeResolve(body.glb);
      if (!abs) return json(res, 400, { error: "非法路径" });
      const result = intakeAsset(ROOT, { ...body, glb: abs });
      return json(res, 200, result);
    }

    json(res, 404, { error: "unknown route" });
  } catch (e) {
    json(res, 400, { error: e.message });
  }
});

server.listen(PORT, () => {
  console.log(`tbg-assets 入库工具已启动: http://localhost:${PORT}`);
  console.log(`把 glb 文件放进 ${path.relative(process.cwd(), INBOX) || "inbox"}/ 即可在网页中选择`);
});
