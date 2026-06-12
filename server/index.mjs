import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

if (!process.env.ANTHROPIC_API_KEY) {
  console.warn(
    "⚠  ANTHROPIC_API_KEY is not set. Set it before starting:\n" +
      "   export ANTHROPIC_API_KEY=sk-ant-..."
  );
}

const anthropic = new Anthropic(); // reads ANTHROPIC_API_KEY from env

app.use(express.json({ limit: "1mb" }));

// Liveness/readiness probe. Reports whether the API key is configured.
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, keyConfigured: Boolean(process.env.ANTHROPIC_API_KEY) });
});

// POST /api/translate  { text: string, srcLang: "en" | "he" }
app.post("/api/translate", async (req, res) => {
  try {
    const { text, srcLang } = req.body || {};
    if (typeof text !== "string" || !text.trim() || !["en", "he"].includes(srcLang)) {
      return res.status(400).json({ error: "Provide { text, srcLang: 'en'|'he' }" });
    }
    if (!process.env.ANTHROPIC_API_KEY) {
      return res
        .status(503)
        .json({ error: "Server is missing ANTHROPIC_API_KEY. Set it and restart." });
    }
    const target = srcLang === "he" ? "English" : "Hebrew";
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      messages: [
        {
          role: "user",
          content: `Translate the following into natural, conversational ${target}. Respond with ONLY the translation, no preamble, no quotes, no explanation.\n\n${text}`,
        },
      ],
    });
    const translation = (msg.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join(" ")
      .trim();
    if (!translation) throw new Error("Empty translation from model");
    res.json({ translation });
  } catch (err) {
    console.error("Translation error:", err?.message || err);
    res.status(500).json({ error: "Translation failed" });
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
