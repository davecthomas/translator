// Vercel serverless function — POST /api/translate.
// Routes through the shared core in server/translate-core.mjs so this
// endpoint and the local Express dev route can't drift.

import { validate, translate } from "../server/translate-core.mjs";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    const body = req.body || {};
    const v = validate(body);
    if (!v.ok) return res.status(v.status).json({ error: v.error });
    const translation = await translate(body);
    return res.status(200).json({ translation });
  } catch (err) {
    console.error("Translation error:", err?.message || err);
    return res
      .status(err?.status || 500)
      .json({ error: err?.userMessage || "Translation failed" });
  }
}
