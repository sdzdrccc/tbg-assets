#!/usr/bin/env node
/**
 * tbg-assets 仓储站（零依赖，Node ≥ 18）
 *
 * 用法：node tools/hub/server.js [端口，默认 8788]
 * 然后浏览器打开 http://localhost:8788
 *
 * 定位（2026-09 重构）：仓储端 —— 校验 → 入库 → 索引 → 展示，零加工。
 *
 * 功能：
 *   - 资产包入库（主通道）：扫描 inbox/ 下 tbg-3d pack.js 投递的资产包
 *     （model.glb + asset.json + source.json），预览确认后一键入库
 *   - 裸模型兜底：inbox/ 里的散文件（glb/fbx/stl/usdz）网页上传/选择，
 *     文件名关键词降级分类（classify 副本），glb 可入库，其余标"待精修"
 *   - 库内资产浏览：kits 分类树 + 3D 预览 + 元数据查看
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const { intakeAsset, intakePackage, scanPackages, scanKits } = require("../../pipeline/scripts/lib/intake");
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
        // fbx/stl/usdz 需先回 tbg-3d 精修导出 glb，不能直接入库
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
    if (route === "/preview.html") {
      // 资产预览渲染页（300×300 白底 3/4 视角，供截图生成 preview.png）
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(fs.readFileSync(path.join(PUBLIC, "preview.html")));
    }

    // ---- 资产包扫描（主通道：tbg-3d 投递） ----
    if (route === "/api/packages") {
      return json(res, 200, { packages: scanPackages(ROOT) });
    }

    // ---- 资产包入库 ----
    if (route === "/api/intake-package" && req.method === "POST") {
      const body = JSON.parse((await readBody(req)).toString("utf8"));
      const abs = safeResolve(body.dir);
      if (!abs || !abs.startsWith(INBOX)) {
        return json(res, 400, { error: "只允许入库 inbox/ 下的资产包" });
      }
      const result = intakePackage(ROOT, abs);
      return json(res, 200, result);
    }

    // ---- 扫描裸模型文件：inbox/ + work/production/（兜底通道） ----
    if (route === "/api/scan") {
      const files = [
        ...findGlb(INBOX, "inbox"),
        ...findGlb(path.join(ROOT, "work", "production"), "work/production"),
      ].sort((a, b) => (a.mtime < b.mtime ? 1 : -1));
      return json(res, 200, { files });
    }

    // ---- 删除裸模型文件（仅限 inbox/ 与 work/production/ 下的散模型文件） ----
    if (route === "/api/scan-delete" && req.method === "POST") {
      const body = JSON.parse((await readBody(req)).toString("utf8"));
      const abs = safeResolve(body.path);
      const allowedRoots = [INBOX, path.join(ROOT, "work", "production")];
      const insideAllowed = allowedRoots.some(r => abs && abs.startsWith(r));
      if (!abs || !insideAllowed || !/.(glb|fbx|stl|usdz)$/i.test(abs) || !fs.existsSync(abs)) {
        return json(res, 400, { error: "非法删除目标（只允许 inbox/ 或 work/production/ 下的 .glb/.fbx/.stl/.usdz）" });
      }
      fs.unlinkSync(abs);
      return json(res, 200, { ok: true, path: body.path });
    }

    // ---- 套件结构（下拉框/浏览树） ----
    if (route === "/api/kits") {
      return json(res, 200, { kits: scanKits(ROOT), labels: LABELS });
    }

    // ---- 文件名自动识别分类（兜底降级） ----
    if (route === "/api/classify") {
      const name = url.searchParams.get("name") || "";
      return json(res, 200, classifyFileName(name));
    }

    // ---- 列出库内全部资产（浏览/批量生成 preview.png 用） ----
    if (route === "/api/assets") {
      const out = [];
      const walk = (dir) => {
        if (!fs.existsSync(dir)) return;
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const p = path.join(dir, entry.name);
          if (entry.isDirectory()) walk(p);
          else if (entry.name === "asset.json") {
            try {
              const meta = JSON.parse(fs.readFileSync(p, "utf8"));
              const glb = path.join(path.dirname(p), "model.glb");
              if (fs.existsSync(glb)) {
                out.push({
                  id: meta.id,
                  name: meta.name,
                  category: meta.category,
                  tier: meta.tier,
                  polycount: meta.polycount,
                  materials: meta.materials || [],
                  path: path.relative(ROOT, glb).replace(/\\/g, "/"),
                  hasPreview: fs.existsSync(path.join(path.dirname(p), "preview.png")),
                });
              }
            } catch { /* 跳过损坏的 asset.json */ }
          }
        }
      };
      walk(path.join(ROOT, "kits"));
      return json(res, 200, { assets: out.sort((a, b) => (a.id < b.id ? -1 : 1)) });
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

    // ---- 上传模型文件到 inbox/（glb 可直接入库；fbx/stl/usdz 需回 tbg-3d 精修） ----
    if (route === "/api/upload" && req.method === "POST") {
      const name = path.basename(url.searchParams.get("name") || "upload.glb");
      if (!/\.(glb|fbx|stl|usdz)$/i.test(name)) return json(res, 400, { error: "仅接受 .glb/.fbx/.stl/.usdz" });
      const body = await readBody(req);
      fs.writeFileSync(path.join(INBOX, name), body);
      return json(res, 200, { ok: true, name });
    }

    // ---- 裸模型入库（兜底通道） ----
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
  console.log(`tbg-assets 仓储站已启动: http://localhost:${PORT}`);
  console.log(`主通道：tbg-3d pack.js 投递的资产包在 inbox/ 自动识别，网页确认入库`);
});
