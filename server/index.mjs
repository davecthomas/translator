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

// Supported languages. English is always one side of the pair; the user picks
// the other. Keep the prompt-facing name natural (e.g. "Mandarin Chinese"
// rather than just "Mandarin") so the model produces idiomatic output.
const LANG_NAMES = {
  en: "English",
  he: "Hebrew",
  es: "Spanish",
  fr: "French",
  zh: "Mandarin Chinese",
  de: "German",
};
const SUPPORTED = Object.keys(LANG_NAMES);

app.use(express.json({ limit: "1mb" }));

// Liveness/readiness probe. Reports whether the API key is configured.
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, keyConfigured: Boolean(process.env.ANTHROPIC_API_KEY) });
});

// POST /api/translate  { text: string, srcLang: code, dstLang: code }
// srcLang/dstLang are any of the codes in SUPPORTED. One side must be 'en'.
app.post("/api/translate", async (req, res) => {
  try {
    const { text, srcLang, dstLang } = req.body || {};
    if (
      typeof text !== "string" ||
      !text.trim() ||
      !SUPPORTED.includes(srcLang) ||
      !SUPPORTED.includes(dstLang) ||
      srcLang === dstLang ||
      (srcLang !== "en" && dstLang !== "en")
    ) {
      return res.status(400).json({
        error: `Provide { text, srcLang, dstLang } where both are in [${SUPPORTED.join(
          ", "
        )}] and one side is 'en'.`,
      });
    }
    if (!process.env.ANTHROPIC_API_KEY) {
      return res
        .status(503)
        .json({ error: "Server is missing ANTHROPIC_API_KEY. Set it and restart." });
    }
    const targetName = LANG_NAMES[dstLang];
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      messages: [
        {
          role: "user",
          content: `Translate the following into natural, conversational ${targetName}. Respond with ONLY the translation, no preamble, no quotes, no explanation.\n\n${text}`,
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
