// Vercel serverless function — GET /api/health.
// Mirrors the local Express health probe so the same deploy-check works on
// both transports.

export default function handler(_req, res) {
  res
    .status(200)
    .json({ ok: true, keyConfigured: Boolean(process.env.ANTHROPIC_API_KEY) });
}
