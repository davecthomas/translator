// Shared translation core — used by both the local Express dev server
// (server/index.mjs) and the Vercel serverless function (api/translate.mjs).
// Keep all request-validation and Anthropic-call logic here so the two
// transports can't drift in contract (cf. ADR-0003).

import Anthropic from "@anthropic-ai/sdk";

// Map of supported language codes to their natural-language names used in the
// prompt. The prompt-facing name is intentionally idiomatic (e.g. "Mandarin
// Chinese" rather than just "Mandarin") so the model produces natural output.
const LANG_NAMES = {
  en: "English",
  he: "Hebrew",
  es: "Spanish",
  fr: "French",
  zh: "Mandarin Chinese",
  de: "German",
};
export const SUPPORTED = Object.keys(LANG_NAMES);

// Lazy-init the Anthropic client so importing this module from a request
// handler doesn't crash at module-load time when ANTHROPIC_API_KEY is absent.
// Missing key surfaces as a 503 in `translate()` instead.
let _anthropic = null;
function getAnthropic() {
  if (!_anthropic) _anthropic = new Anthropic();
  return _anthropic;
}

// Validate a translation request payload. Returns `{ ok: true }` on success,
// or `{ ok: false, status, error }` on a known client-side error.
export function validate({ text, srcLang, dstLang }) {
  if (
    typeof text !== "string" ||
    !text.trim() ||
    !SUPPORTED.includes(srcLang) ||
    !SUPPORTED.includes(dstLang) ||
    srcLang === dstLang ||
    (srcLang !== "en" && dstLang !== "en")
  ) {
    return {
      ok: false,
      status: 400,
      error: `Provide { text, srcLang, dstLang } where both are in [${SUPPORTED.join(
        ", "
      )}] and one side is 'en'.`,
    };
  }
  return { ok: true };
}

// Call Anthropic and return the translation text. Throws on server-side
// failures; the thrown error may carry `status` + `userMessage` for the
// caller to surface verbatim.
export async function translate({ text, dstLang }) {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw Object.assign(new Error("ANTHROPIC_API_KEY missing"), {
      status: 503,
      userMessage:
        "Server is missing ANTHROPIC_API_KEY. Set it in the deploy environment and retry.",
    });
  }
  const msg = await getAnthropic().messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1000,
    messages: [
      {
        role: "user",
        content: `Translate the following into natural, conversational ${LANG_NAMES[dstLang]}. Respond with ONLY the translation, no preamble, no quotes, no explanation.\n\n${text}`,
      },
    ],
  });
  const translation = (msg.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join(" ")
    .trim();
  if (!translation) throw new Error("Empty translation from model");
  return translation;
}
