import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validate, translate } from "./translate-core.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

if (!process.env.ANTHROPIC_API_KEY) {
  console.warn(
    "⚠  ANTHROPIC_API_KEY is not set. Set it before starting:\n" +
      "   export ANTHROPIC_API_KEY=sk-ant-..."
  );
}

app.use(express.json({ limit: "1mb" }));

// Liveness/readiness probe. Reports whether the API key is configured.
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, keyConfigured: Boolean(process.env.ANTHROPIC_API_KEY) });
});

// POST /api/translate  { text: string, srcLang: code, dstLang: code }
app.post("/api/translate", async (req, res) => {
  try {
    const body = req.body || {};
    const v = validate(body);
    if (!v.ok) return res.status(v.status).json({ error: v.error });
    const translation = await translate(body);
    res.json({ translation });
  } catch (err) {
    console.error("Translation error:", err?.message || err);
    res
      .status(err?.status || 500)
      .json({ error: err?.userMessage || "Translation failed" });
  }
});

// Serve the built frontend in production
if (process.env.NODE_ENV === "production") {
  const dist = path.join(__dirname, "..", "dist");
  app.use(express.static(dist));
  app.get("*", (_req, res) => res.sendFile(path.join(dist, "index.html")));
}

app.listen(PORT, () => {
  console.log(`Translator API listening on http://localhost:${PORT}`);
});
