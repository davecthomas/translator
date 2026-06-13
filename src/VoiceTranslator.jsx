import { useState, useRef, useEffect, useCallback, useMemo } from "react";

const UI_FONT = "var(--ui-font)";
const HEB_FONT = "var(--he-font)";

// ---------------------------------------------------------------------------
// Supported "other" languages. English is always one side of the pair, so the
// user only ever picks the non-English side. Keeping the table here means the
// picker, the speech-recognition locale, the SpeechSynthesis voice, and the
// rendered direction/font all stay in sync from one source of truth.
// ---------------------------------------------------------------------------

const LANGUAGES = {
  he: {
    nativeName: "עברית",
    englishName: "Hebrew",
    flag: "🇮🇱",
    speech: "he-IL",
    dir: "rtl",
    font: HEB_FONT,
    speakLabel: "דברו עברית",
    listeningLabel: "מקליט… הקש לסיום",
  },
  es: {
    nativeName: "Español",
    englishName: "Spanish",
    flag: "🇪🇸",
    speech: "es-ES",
    dir: "ltr",
    font: UI_FONT,
    speakLabel: "Habla en español",
    listeningLabel: "Escuchando… toca para parar",
  },
  fr: {
    nativeName: "Français",
    englishName: "French",
    flag: "🇫🇷",
    speech: "fr-FR",
    dir: "ltr",
    font: UI_FONT,
    speakLabel: "Parle en français",
    listeningLabel: "Écoute… appuie pour arrêter",
  },
  zh: {
    nativeName: "中文",
    englishName: "Mandarin",
    flag: "🇨🇳",
    speech: "zh-CN",
    dir: "ltr",
    font: UI_FONT,
    speakLabel: "说中文",
    listeningLabel: "聆听中… 点击停止",
  },
  de: {
    nativeName: "Deutsch",
    englishName: "German",
    flag: "🇩🇪",
    speech: "de-DE",
    dir: "ltr",
    font: UI_FONT,
    speakLabel: "Sprich Deutsch",
    listeningLabel: "Hört zu… tippen zum Stoppen",
  },
};

const LANG_CODES = Object.keys(LANGUAGES);
const STORAGE_KEY = "translator.otherLang";
const VOICE_STORAGE_KEY = "translator.voiceByLang";

// Curated list of known-good voices per language. Matched by name prefix
// so version suffixes like "(Enhanced)" or " - English (United States)" still
// hit. These names are stable across macOS/iOS and Chrome/Edge — any that
// don't exist on a given device are silently skipped during scoring.
const PREFERRED_VOICES = {
  en: [
    "Samantha", "Ava", "Allison", "Karen", "Tom", "Daniel",
    "Google US English", "Microsoft Aria", "Microsoft Jenny",
  ],
  he: ["Carmit", "Google עברית"],
  es: ["Mónica", "Paulina", "Jorge", "Google español"],
  fr: ["Amélie", "Audrey", "Thomas", "Aurélie", "Google français"],
  zh: ["Tingting", "Sin-Ji", "Mei-Jia", "Google 普通话（中国大陆）"],
  de: ["Anna", "Petra", "Markus", "Google Deutsch"],
};

// Apple "novelty" voices — sound-effect synthesizers (Bahh / Bells /
// Trinoids / Zarvox / etc.) that read text in special-effects style. They
// have a positive language match, but are objectively unsuitable for
// translation playback. Listed by display name (URI varies by macOS rev).
const NOVELTY_VOICE_NAMES = new Set([
  "Bahh", "Bells", "Boing", "Bubbles", "Cellos", "Deranged",
  "Good News", "Bad News", "Hysterical", "Pipe Organ",
  "Trinoids", "Whisper", "Zarvox", "Wobble",
]);

// Voice quality tier. Higher = better. The single biggest quality signal is
// Apple's voiceURI prefix: `.compact.` and `.super-compact.` are the small
// legacy synthesizers (robotic); `.enhanced.`, `.eloquence.` are the modern
// non-neural voices; `.premium.` are the high-quality downloaded voices.
// Microsoft "Online (Natural)" and Google's "Online" voices use name markers
// rather than URIs, so we also detect Premium/Natural/Neural in the name.
//
// -1 → novelty / sound-effect, hide entirely
//  0 → super-compact (smallest/worst), hide entirely
//  1 → compact (legacy, robotic) — hide if a higher tier exists for this lang
//  2 → standard OS voice
//  3 → enhanced / eloquence
//  4 → premium / neural / natural
function voiceTier(voice) {
  const uri = (voice.voiceURI || "").toLowerCase();
  const name = voice.name || "";
  if (NOVELTY_VOICE_NAMES.has(name)) return -1;
  if (uri.includes("super-compact") || uri.includes("super_compact")) return 0;
  if (uri.includes(".premium.") || /\b(Premium|Neural|Natural)\b/i.test(name)) return 4;
  if (uri.includes(".enhanced.") || uri.includes(".eloquence.") || /\bEnhanced\b/i.test(name)) return 3;
  if (uri.includes(".compact.") || /\bcompact\b/i.test(name)) return 1;
  return 2;
}

// Display label for the badge in the picker. We intentionally don't label
// tier 2 ("Standard") — it's the implied baseline, so labeling it would just
// repeat "Standard" next to every voice in the dropdown when no Premium or
// Enhanced downloads are installed. Only tiers that *differ* from baseline
// get a badge.
const TIER_LABEL = {
  4: "Premium",
  3: "Enhanced",
  1: "Compact",
};

// Score a SpeechSynthesisVoice for a target language. Returns -1 if the voice
// is the wrong language or is a novelty / super-compact tier (always-hidden).
// Tier dominates score so a Premium voice always sorts above an Enhanced one
// of the same language, regardless of curated-name match.
function scoreVoice(voice, langCode) {
  const target = langCode === "en" ? "en-US" : LANGUAGES[langCode].speech;
  const baseTarget = target.split("-")[0];
  const voiceBase = (voice.lang || "").split("-")[0];
  if (voiceBase !== baseTarget) return -1;

  const tier = voiceTier(voice);
  if (tier < 1) return -1;

  let score = tier * 1000;
  if (voice.lang === target) score += 100;

  const curated = PREFERRED_VOICES[langCode] || [];
  if (curated.some((n) => voice.name === n || voice.name.startsWith(n + " ") || voice.name.startsWith(n + "("))) {
    score += 500;
  }
  return score;
}

function pickPreferredVoice(voices, langCode) {
  let best = null;
  let bestScore = 0;
  for (const v of voices) {
    const s = scoreVoice(v, langCode);
    if (s > bestScore) {
      best = v;
      bestScore = s;
    }
  }
  return best;
}

// English-side speech locale and visual treatment (so the same data shape
// works for both sides of the mic-button render).
const ENGLISH = {
  nativeName: "English",
  englishName: "English",
  flag: "🇺🇸",
  speech: "en-US",
  dir: "ltr",
  font: UI_FONT,
  speakLabel: "Speak English",
  listeningLabel: "Listening… tap to stop",
};

function langInfo(code) {
  return code === "en" ? ENGLISH : LANGUAGES[code];
}

// ---------------------------------------------------------------------------
// Small presentational helpers
// ---------------------------------------------------------------------------

function Equalizer({ color }) {
  const bars = [0, 1, 2, 3, 4];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 3, height: 18 }}>
      {bars.map((i) => (
        <span
          key={i}
          style={{
            display: "block",
            width: 3,
            height: "100%",
            borderRadius: 999,
            background: color,
            transformOrigin: "center",
            animation: `eq 900ms ease-in-out ${i * 120}ms infinite`,
          }}
        />
      ))}
    </div>
  );
}

function TextButton({ onClick, children, tone = "neutral", title }) {
  const tones = {
    neutral: { fg: "var(--text-dim)", bg: "var(--surface)", bd: "var(--border)" },
    active: { fg: "var(--text)", bg: "var(--surface-strong)", bd: "var(--border-strong)" },
  };
  const c = tones[tone] || tones.neutral;
  return (
    <button
      title={title}
      aria-label={title}
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 7,
        minHeight: 44,
        padding: "0 16px",
        borderRadius: 12,
        border: `1px solid ${c.bd}`,
        background: c.bg,
        color: c.fg,
        fontSize: 14,
        fontWeight: 600,
        fontFamily: UI_FONT,
        cursor: "pointer",
        transition: "all 160ms ease",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Voice list hook — Chrome populates voices asynchronously via the
// `voiceschanged` event, so we subscribe to it and re-render when the list
// changes. Safari returns voices synchronously on first call.
// ---------------------------------------------------------------------------

function useAvailableVoices() {
  const [voices, setVoices] = useState(() => {
    try {
      return window.speechSynthesis?.getVoices() || [];
    } catch (e) {
      return [];
    }
  });
  useEffect(() => {
    const synth = window.speechSynthesis;
    if (!synth) return;
    const update = () => setVoices(synth.getVoices() || []);
    update();
    if (typeof synth.addEventListener === "function") {
      synth.addEventListener("voiceschanged", update);
      return () => synth.removeEventListener("voiceschanged", update);
    }
    // Older Safari uses the property form.
    const prev = synth.onvoiceschanged;
    synth.onvoiceschanged = update;
    return () => {
      synth.onvoiceschanged = prev;
    };
  }, []);
  return voices;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function VoiceTranslator() {
  const [supported, setSupported] = useState(true);
  const [listening, setListening] = useState(null); // 'en' | other code | null
  const [interim, setInterim] = useState("");
  const [busy, setBusy] = useState(false);
  const [speakAloud, setSpeakAloud] = useState(true);
  const [error, setError] = useState("");
  const [turns, setTurns] = useState([]); // {id, srcLang, dstLang, srcText, dstText, failed}
  const [showManual, setShowManual] = useState(false);
  const [manualText, setManualText] = useState("");
  const [copiedId, setCopiedId] = useState(null);

  const [otherLang, setOtherLang] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && LANG_CODES.includes(saved)) return saved;
    } catch (e) {}
    return "he";
  });

  // Voice selection: user picks a voice name per language; missing entries
  // fall back to the auto-picked preferred voice. We store the voice *name*
  // (not the object) because the live voice list can be re-fetched any time
  // and object identity isn't stable across `getVoices()` calls in Safari.
  const [voiceByLang, setVoiceByLang] = useState(() => {
    try {
      const saved = localStorage.getItem(VOICE_STORAGE_KEY);
      return saved ? JSON.parse(saved) : {};
    } catch (e) {
      return {};
    }
  });
  const [showVoices, setShowVoices] = useState(false);

  const voices = useAvailableVoices();

  const recogRef = useRef(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) setSupported(false);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, otherLang);
    } catch (e) {}
  }, [otherLang]);

  useEffect(() => {
    try {
      localStorage.setItem(VOICE_STORAGE_KEY, JSON.stringify(voiceByLang));
    } catch (e) {}
  }, [voiceByLang]);

  // Voices grouped by language code, for rendering selectors. Filtering rules:
  //   - Wrong-language voices: hidden.
  //   - Novelty / super-compact: hidden always (objectively unsuitable).
  //   - Compact (tier 1): hidden ONLY when a higher-tier voice exists for the
  //     same language — so a Mac that only has compact Carmit installed for
  //     Hebrew still gets to pick something, but if Premium Samantha is also
  //     installed for English we hide the legacy Compact Samantha.
  const voicesByLang = useMemo(() => {
    const out = {};
    for (const code of ["en", ...LANG_CODES]) {
      const target = code === "en" ? "en-US" : LANGUAGES[code].speech;
      const base = target.split("-")[0];
      const inLang = voices.filter(
        (v) => (v.lang || "").split("-")[0] === base && voiceTier(v) >= 1
      );
      if (inLang.length === 0) {
        out[code] = [];
        continue;
      }
      const maxTier = Math.max(...inLang.map(voiceTier));
      const minShow = maxTier >= 2 ? 2 : 1;
      out[code] = inLang
        .filter((v) => voiceTier(v) >= minShow)
        .sort((a, b) => scoreVoice(b, code) - scoreVoice(a, code));
    }
    return out;
  }, [voices]);

  // The voice name actually used for each language: user's pick if it is
  // still in the shown list (i.e. installed AND not filtered out as a low-
  // quality tier), otherwise auto-picked from PREFERRED_VOICES + the quality
  // heuristic. The shown-list check silently upgrades old saved Compact picks
  // to the new auto-picked Premium when better voices become available.
  const effectiveVoiceByLang = useMemo(() => {
    const out = {};
    for (const code of ["en", ...LANG_CODES]) {
      const pick = voiceByLang[code];
      const shown = voicesByLang[code] || [];
      const userVoice = pick && shown.find((v) => v.name === pick);
      out[code] = userVoice ? userVoice.name : pickPreferredVoice(voices, code)?.name || null;
    }
    return out;
  }, [voices, voiceByLang, voicesByLang]);

  // Auto-scroll to bottom on new content — but only if the user is already
  // near the bottom. Otherwise they're reading history and we'd yank them
  // back every time `interim` updates mid-speech, which is jarring.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distanceFromBottom < 80) el.scrollTop = el.scrollHeight;
  }, [turns, interim, busy]);

  const other = useMemo(() => LANGUAGES[otherLang], [otherLang]);

  const translate = useCallback(async (text, srcLang, dstLang) => {
    const res = await fetch("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, srcLang, dstLang }),
    });
    if (!res.ok) {
      // Surface the server's error body when it's JSON; otherwise the user
      // sees only the generic "Translation failed" and can't tell why
      // (auth wall, key missing, validation reject, model 5xx, etc.).
      let detail = `API ${res.status}`;
      try {
        const body = await res.json();
        if (body?.error) detail = body.error;
      } catch (_) {
        /* non-JSON (e.g. an SSO HTML page) — leave the status-code detail */
      }
      throw new Error(detail);
    }
    const data = await res.json();
    if (!data.translation) throw new Error("Empty translation");
    return data.translation;
  }, []);

  const speak = useCallback(
    (text, langCode) => {
      try {
        const info = langInfo(langCode);
        const u = new SpeechSynthesisUtterance(text);
        u.lang = info.speech;
        u.rate = 0.95;
        const name = effectiveVoiceByLang[langCode];
        if (name) {
          const v = voices.find((x) => x.name === name);
          if (v) u.voice = v;
        }
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(u);
      } catch (e) {
        /* speech synthesis unavailable; text is still shown */
      }
    },
    [voices, effectiveVoiceByLang]
  );

  const handleFinal = useCallback(
    async (text, srcLang, dstLang) => {
      const id = Date.now();
      setTurns((t) => [...t, { id, srcLang, dstLang, srcText: text, dstText: null }]);
      setBusy(true);
      setError("");
      try {
        const dst = await translate(text, srcLang, dstLang);
        setTurns((t) => t.map((x) => (x.id === id ? { ...x, dstText: dst } : x)));
        if (speakAloud) speak(dst, dstLang);
      } catch (e) {
        const reason = (e?.message || "").trim();
        const label = reason
          ? `Translation failed: ${reason} — tap to retry`
          : "Translation failed — tap to retry";
        setTurns((t) =>
          t.map((x) =>
            x.id === id ? { ...x, dstText: label, failed: true } : x
          )
        );
      } finally {
        setBusy(false);
      }
    },
    [translate, speak, speakAloud]
  );

  const retry = useCallback(
    async (turn) => {
      if (!turn.failed) return;
      setBusy(true);
      try {
        const dst = await translate(turn.srcText, turn.srcLang, turn.dstLang);
        setTurns((t) =>
          t.map((x) => (x.id === turn.id ? { ...x, dstText: dst, failed: false } : x))
        );
        if (speakAloud) speak(dst, turn.dstLang);
      } catch (e) {
        /* keep failed state for another retry */
      } finally {
        setBusy(false);
      }
    },
    [translate, speak, speakAloud]
  );

  const stopListening = useCallback(() => {
    if (recogRef.current) {
      try {
        recogRef.current.stop();
      } catch (e) {}
      recogRef.current = null;
    }
    setListening(null);
    setInterim("");
  }, []);

  const startListening = useCallback(
    (srcLang) => {
      setError("");
      if (listening) {
        stopListening();
        return;
      }
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SR) {
        setSupported(false);
        return;
      }
      const r = new SR();
      r.lang = langInfo(srcLang).speech;
      r.interimResults = true;
      r.continuous = false;
      let finalText = "";

      const dstLang = srcLang === "en" ? otherLang : "en";

      r.onresult = (ev) => {
        let interimStr = "";
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          const t = ev.results[i][0].transcript;
          if (ev.results[i].isFinal) finalText += t;
          else interimStr += t;
        }
        setInterim(interimStr || finalText);
      };
      r.onerror = (ev) => {
        if (ev.error === "not-allowed" || ev.error === "service-not-allowed") {
          setError(
            "Microphone access was blocked. Allow mic permission in the browser, then try again."
          );
        } else if (ev.error === "no-speech") {
          setError("Didn't catch any speech — tap the button and try again.");
        } else {
          setError(`Speech recognition error: ${ev.error}`);
        }
        setListening(null);
        setInterim("");
      };
      r.onend = () => {
        setListening(null);
        setInterim("");
        const cleaned = finalText.trim();
        if (cleaned) handleFinal(cleaned, srcLang, dstLang);
      };
      try {
        r.start();
        recogRef.current = r;
        setListening(srcLang);
      } catch (e) {
        setError("Couldn't start the microphone. Try again.");
      }
    },
    [listening, stopListening, handleFinal, otherLang]
  );

  const submitManual = (srcLang) => {
    const t = manualText.trim();
    if (!t) return;
    setManualText("");
    const dstLang = srcLang === "en" ? otherLang : "en";
    handleFinal(t, srcLang, dstLang);
  };

  const copyTurn = useCallback((turn) => {
    if (!turn.dstText || turn.failed) return;
    try {
      navigator.clipboard.writeText(turn.dstText);
      setCopiedId(turn.id);
      setTimeout(() => setCopiedId((c) => (c === turn.id ? null : c)), 1400);
    } catch (e) {}
  }, []);

  const exportConversation = useCallback(() => {
    if (turns.length === 0) return;
    const lines = turns
      .filter((t) => t.dstText && !t.failed)
      .map((t) => {
        const srcLabel = langInfo(t.srcLang).nativeName;
        const dstLabel = langInfo(t.dstLang).nativeName;
        return `${srcLabel}: ${t.srcText}\n${dstLabel}: ${t.dstText}\n`;
      });
    const blob = new Blob(
      [`Live Translator — conversation\n\n${lines.join("\n")}`],
      { type: "text/plain;charset=utf-8" }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "conversation.txt";
    a.click();
    URL.revokeObjectURL(url);
  }, [turns]);

  const clearAll = useCallback(() => {
    setTurns([]);
    setInterim("");
    setError("");
    try {
      window.speechSynthesis.cancel();
    } catch (e) {}
  }, []);

  const changeOtherLang = useCallback(
    (code) => {
      if (code === otherLang) return;
      if (listening) stopListening();
      setOtherLang(code);
    },
    [otherLang, listening, stopListening]
  );

  // -------------------------------------------------------------------------
  // Language picker — the headline mobile control. Horizontally scrollable row
  // of large flag+name chips with snap, so on a phone you swipe and tap.
  // -------------------------------------------------------------------------

  const LanguagePicker = () => (
    <div
      role="radiogroup"
      aria-label="Choose language to translate with English"
      style={{
        display: "flex",
        gap: 10,
        overflowX: "auto",
        padding: "12px 18px 4px",
        scrollSnapType: "x mandatory",
        WebkitOverflowScrolling: "touch",
        scrollbarWidth: "none",
      }}
      className="lang-strip"
    >
      {LANG_CODES.map((code) => {
        const info = LANGUAGES[code];
        const active = code === otherLang;
        return (
          <button
            key={code}
            role="radio"
            aria-checked={active}
            onClick={() => changeOtherLang(code)}
            style={{
              flex: "0 0 auto",
              scrollSnapAlign: "start",
              minHeight: 56,
              minWidth: 108,
              padding: "8px 14px",
              borderRadius: 16,
              border: `1.5px solid ${active ? "var(--alt)" : "var(--border-strong)"}`,
              background: active
                ? "linear-gradient(135deg, var(--alt-deep), var(--alt))"
                : "var(--surface)",
              color: active ? "#06121f" : "var(--text)",
              cursor: "pointer",
              transition: "all 160ms ease",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 2,
              boxShadow: active ? "0 6px 20px var(--alt-glow)" : "none",
            }}
          >
            <div style={{ fontSize: 22, lineHeight: 1 }} aria-hidden="true">
              {info.flag}
            </div>
            <div
              style={{
                fontSize: 14,
                fontWeight: 700,
                letterSpacing: -0.1,
                fontFamily: info.font,
              }}
            >
              {info.englishName}
            </div>
          </button>
        );
      })}
    </div>
  );

  // -------------------------------------------------------------------------
  // Voice selector — collapsible panel under the language picker. Lets the
  // user override the auto-picked voice per language (with a Sample button to
  // hear the choice). Uses a native <select> so iOS/Android render their
  // big tap-friendly wheel pickers for free.
  // -------------------------------------------------------------------------

  const VoiceRow = ({ langCode }) => {
    const info = langInfo(langCode);
    const list = voicesByLang[langCode] || [];
    const current = effectiveVoiceByLang[langCode] || "";
    const hasAny = list.length > 0;
    const sampleText = info.speakLabel;

    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 0",
        }}
      >
        <div
          style={{
            flex: "0 0 auto",
            minWidth: 96,
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 13,
            color: "var(--text-dim)",
            fontFamily: info.font,
          }}
        >
          <span aria-hidden="true">{info.flag}</span>
          <span>{info.englishName}</span>
        </div>
        <select
          value={current}
          disabled={!hasAny}
          onChange={(e) => setVoiceByLang((prev) => ({ ...prev, [langCode]: e.target.value }))}
          aria-label={`${info.englishName} voice`}
          style={{
            flex: 1,
            minHeight: 40,
            padding: "0 12px",
            borderRadius: 10,
            border: "1px solid var(--border-strong)",
            background: "var(--surface)",
            color: "var(--text)",
            fontSize: 14,
            fontFamily: UI_FONT,
            cursor: hasAny ? "pointer" : "not-allowed",
          }}
        >
          {hasAny ? (
            list.map((v) => {
              const tier = voiceTier(v);
              const tierLabel = TIER_LABEL[tier];
              const cloudLabel = v.localService ? "" : " · cloud";
              return (
                <option key={v.name} value={v.name}>
                  {v.name}
                  {tierLabel ? ` · ${tierLabel}` : ""}
                  {cloudLabel}
                </option>
              );
            })
          ) : (
            <option value="">No voices installed for {info.englishName}</option>
          )}
        </select>
        <button
          onClick={() => speak(sampleText, langCode)}
          disabled={!hasAny}
          aria-label={`Play sample in ${info.englishName}`}
          title={`Play sample in ${info.englishName}`}
          style={{
            flex: "0 0 auto",
            minHeight: 40,
            padding: "0 12px",
            borderRadius: 10,
            border: "1px solid var(--border-strong)",
            background: "var(--surface)",
            color: hasAny ? "var(--text)" : "var(--text-faint)",
            fontSize: 13,
            fontWeight: 600,
            fontFamily: UI_FONT,
            cursor: hasAny ? "pointer" : "not-allowed",
          }}
        >
          ▶ Sample
        </button>
      </div>
    );
  };

  const VoiceSelector = () => {
    const tierBadge = (voiceName) => {
      if (!voiceName) return "";
      const v = voices.find((x) => x.name === voiceName);
      const t = v ? voiceTier(v) : 0;
      const label = TIER_LABEL[t];
      return label ? ` (${label})` : "";
    };
    const enName = effectiveVoiceByLang.en;
    const altName = effectiveVoiceByLang[otherLang];
    const enSummary = enName ? `${enName}${tierBadge(enName)}` : "";
    const altSummary = altName ? `${altName}${tierBadge(altName)}` : "";
    const summary =
      enSummary && altSummary
        ? `${enSummary} · ${altSummary}`
        : enSummary || altSummary || "No voices available";

    return (
      <div style={{ padding: "0 18px 4px" }}>
        <button
          onClick={() => setShowVoices((s) => !s)}
          aria-expanded={showVoices}
          aria-controls="voice-selector-panel"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            width: "100%",
            minHeight: 40,
            padding: "0 14px",
            borderRadius: 12,
            border: "1px solid var(--border)",
            background: showVoices ? "var(--surface-strong)" : "var(--surface)",
            color: "var(--text-dim)",
            fontSize: 13,
            fontWeight: 600,
            fontFamily: UI_FONT,
            cursor: "pointer",
            transition: "all 160ms ease",
          }}
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <span aria-hidden="true">🎙</span>
            <span>Voices</span>
            <span
              style={{
                color: "var(--text-faint)",
                fontWeight: 500,
                marginLeft: 4,
              }}
            >
              {summary}
            </span>
          </span>
          <span aria-hidden="true" style={{ fontSize: 11 }}>
            {showVoices ? "▴" : "▾"}
          </span>
        </button>
        {showVoices && (
          <div
            id="voice-selector-panel"
            style={{
              marginTop: 6,
              padding: "4px 12px 8px",
              borderRadius: 12,
              border: "1px solid var(--border)",
              background: "var(--surface)",
            }}
          >
            <VoiceRow langCode="en" />
            <VoiceRow langCode={otherLang} />
            {voices.length === 0 && (
              <div
                style={{
                  fontSize: 12,
                  color: "var(--text-faint)",
                  padding: "6px 0 2px",
                }}
              >
                Loading voices…
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // -------------------------------------------------------------------------
  // Mic button — the primary control. `lang` is the source language code.
  // -------------------------------------------------------------------------

  const MicButton = ({ lang }) => {
    const active = listening === lang;
    const isEn = lang === "en";
    const info = langInfo(lang);
    const accent = isEn ? "var(--en)" : "var(--alt)";
    const accentDeep = isEn ? "var(--en-deep)" : "var(--alt-deep)";
    const glow = isEn ? "var(--en-glow)" : "var(--alt-glow)";
    const disabled = busy && !active;

    const dstInfo = langInfo(isEn ? otherLang : "en");
    const directionLabel = `${info.englishName} → ${dstInfo.englishName}`;

    const activeLabel = info.listeningLabel;
    const idleLabel = info.speakLabel;

    return (
      <button
        onClick={() => startListening(lang)}
        disabled={disabled}
        style={{
          flex: 1,
          position: "relative",
          border: "1px solid",
          borderColor: active ? "var(--rec)" : "var(--border-strong)",
          borderRadius: "var(--radius)",
          padding: "20px 14px",
          background: active
            ? "linear-gradient(135deg, var(--rec-deep), var(--rec))"
            : `linear-gradient(135deg, ${accentDeep}, ${accent})`,
          color: "#06121f",
          cursor: disabled ? "not-allowed" : "pointer",
          transition: "transform 140ms ease, box-shadow 200ms ease, opacity 160ms ease",
          boxShadow: active ? "0 8px 30px var(--rec-glow)" : `0 8px 28px ${glow}`,
          opacity: disabled ? 0.4 : 1,
          animation: active ? "pulse-ring 1.8s ease-out infinite" : "none",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 8,
          }}
        >
          <div style={{ height: 28, display: "flex", alignItems: "center", gap: 8 }}>
            {active ? (
              <Equalizer color="#06121f" />
            ) : (
              <>
                <span style={{ fontSize: 20, lineHeight: 1 }} aria-hidden="true">
                  {info.flag}
                </span>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                  <rect x="9" y="2" width="6" height="12" rx="3" fill="#06121f" />
                  <path
                    d="M5 11a7 7 0 0 0 14 0M12 18v3"
                    stroke="#06121f"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </>
            )}
          </div>
          <div
            style={{
              fontSize: 17,
              fontWeight: 700,
              fontFamily: info.font,
              letterSpacing: -0.2,
            }}
          >
            {active ? activeLabel : idleLabel}
          </div>
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              opacity: 0.7,
              fontFamily: UI_FONT,
              letterSpacing: 0.2,
            }}
          >
            {directionLabel}
          </div>
        </div>
      </button>
    );
  };

  const hasContent = turns.some((t) => t.dstText && !t.failed);

  // -------------------------------------------------------------------------
  // Layout
  // -------------------------------------------------------------------------

  return (
    <div
      style={{
        position: "relative",
        zIndex: 1,
        minHeight: "100vh",
        maxWidth: 680,
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header — title + a single, clearly labeled audio toggle */}
      <header
        style={{
          padding: "18px 18px 16px",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          backdropFilter: "blur(12px)",
          position: "sticky",
          top: 0,
          zIndex: 5,
          background: "rgba(10, 14, 26, 0.72)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          <div
            style={{
              width: 40,
              height: 40,
              flexShrink: 0,
              borderRadius: 12,
              display: "grid",
              placeItems: "center",
              background: "linear-gradient(135deg, var(--en-deep), var(--alt-deep))",
              boxShadow: "0 6px 18px rgba(56,189,248,0.3)",
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path
                d="M6 9v6M12 5v14M18 9v6"
                stroke="#06121f"
                strokeWidth="2.4"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: 17,
                fontWeight: 800,
                letterSpacing: -0.3,
                lineHeight: 1.15,
                whiteSpace: "nowrap",
              }}
            >
              Live Translator
            </div>
            <div
              style={{
                fontSize: 13,
                color: "var(--text-dim)",
                fontFamily: other.font,
                direction: other.dir,
              }}
            >
              English ⇄ {other.nativeName}
            </div>
          </div>
        </div>

        <TextButton
          onClick={() => setSpeakAloud((s) => !s)}
          tone={speakAloud ? "active" : "neutral"}
          title={speakAloud ? "Spoken translations are on" : "Spoken translations are off"}
        >
          <span style={{ fontSize: 15 }}>{speakAloud ? "🔊" : "🔇"}</span>
          {speakAloud ? "Voice on" : "Voice off"}
        </TextButton>
      </header>

      {/* Language picker — prominent, horizontally swipeable on mobile */}
      <LanguagePicker />

      {/* Voice selector — collapsible, default off so it doesn't dominate */}
      <VoiceSelector />

      {/* Contextual toolbar — only when there's a conversation to act on */}
      {turns.length > 0 && (
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            padding: "8px 18px 0",
          }}
        >
          {hasContent && (
            <TextButton onClick={exportConversation} title="Download the conversation as text">
              <span style={{ fontSize: 15 }}>⤓</span> Export
            </TextButton>
          )}
          <TextButton onClick={clearAll} title="Clear the conversation">
            <span style={{ fontSize: 15 }}>🗑</span> Clear
          </TextButton>
        </div>
      )}

      {/* Conversation */}
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "16px 18px 8px",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        {turns.length === 0 && !interim && (
          <div
            style={{
              margin: "auto",
              textAlign: "center",
              maxWidth: 360,
              padding: "24px 16px",
            }}
          >
            <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 10, letterSpacing: -0.3 }}>
              Speak in either language
            </div>
            <div style={{ color: "var(--text-dim)", fontSize: 15.5, lineHeight: 1.6 }}>
              Tap the blue button to talk in{" "}
              <span style={{ color: "var(--en)", fontWeight: 600 }}>English</span> and hear it in{" "}
              <span style={{ color: "var(--alt)", fontWeight: 600 }}>{other.englishName}</span>. Tap
              the green button to talk in{" "}
              <span style={{ color: "var(--alt)", fontWeight: 600 }}>{other.englishName}</span> and
              hear it in English.
            </div>
            <div
              style={{
                marginTop: 28,
                fontSize: 26,
                color: "var(--text-faint)",
                animation: "nudge 1.6s ease-in-out infinite",
              }}
              aria-hidden="true"
            >
              ↓
            </div>
          </div>
        )}

        {turns.map((turn) => {
          const srcInfo = langInfo(turn.srcLang);
          const dstInfo = langInfo(turn.dstLang);
          const srcAccent = turn.srcLang === "en" ? "var(--en)" : "var(--alt)";
          return (
            <div
              key={turn.id}
              onClick={() => retry(turn)}
              style={{
                background: "var(--surface)",
                borderRadius: "var(--radius)",
                border: "1px solid var(--border)",
                overflow: "hidden",
                cursor: turn.failed ? "pointer" : "default",
                animation: "rise 280ms ease both",
                backdropFilter: "blur(8px)",
              }}
            >
              {/* Source line */}
              <div
                style={{
                  padding: "14px 16px",
                  fontSize: 15,
                  lineHeight: 1.5,
                  color: "var(--text-dim)",
                  direction: srcInfo.dir,
                  fontFamily: srcInfo.font,
                  borderInlineStart: `3px solid ${srcAccent}`,
                }}
              >
                {turn.srcText}
              </div>

              {/* Translation line */}
              <div
                style={{
                  padding: "14px 16px",
                  background: "var(--surface-strong)",
                  borderTop: "1px solid var(--border)",
                  fontSize: 18,
                  lineHeight: 1.55,
                  fontWeight: 600,
                  direction: dstInfo.dir,
                  fontFamily: dstInfo.font,
                  color: turn.failed ? "var(--rec)" : "var(--text)",
                }}
              >
                {turn.dstText ?? (
                  <span
                    style={{
                      color: "var(--text-faint)",
                      fontWeight: 500,
                      background:
                        "linear-gradient(90deg, var(--text-faint) 25%, var(--text) 50%, var(--text-faint) 75%)",
                      backgroundSize: "200% 100%",
                      WebkitBackgroundClip: "text",
                      backgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                      animation: "shimmer 1.4s linear infinite",
                    }}
                  >
                    Translating…
                  </span>
                )}
              </div>

              {/* Per-card actions */}
              {turn.dstText && !turn.failed && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    display: "flex",
                    gap: 8,
                    padding: "0 12px 12px",
                    justifyContent: "flex-end",
                  }}
                >
                  <TextButton
                    onClick={() => speak(turn.dstText, turn.dstLang)}
                    title="Play the translation aloud"
                  >
                    <span style={{ fontSize: 13 }}>▶</span> Play
                  </TextButton>
                  <TextButton onClick={() => copyTurn(turn)} title="Copy the translation">
                    {copiedId === turn.id ? "✓ Copied" : "⧉ Copy"}
                  </TextButton>
                </div>
              )}
            </div>
          );
        })}

        {interim && (
          <div
            style={{
              alignSelf: listening === "en" ? "flex-start" : "flex-end",
              maxWidth: "85%",
              background: "var(--surface-strong)",
              border: "1px solid var(--border-strong)",
              borderRadius: 16,
              padding: "12px 16px",
              fontSize: 16,
              color: "var(--text)",
              direction: listening ? langInfo(listening).dir : "ltr",
              fontFamily: listening ? langInfo(listening).font : UI_FONT,
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <Equalizer color={listening === "en" ? "var(--en)" : "var(--alt)"} />
            <span style={{ opacity: 0.85 }}>{interim}</span>
          </div>
        )}
      </div>

      {/* Errors / unsupported notice */}
      {(error || !supported) && (
        <div
          style={{
            margin: "0 18px 10px",
            padding: "12px 16px",
            background: "rgba(251, 113, 133, 0.12)",
            border: "1px solid rgba(251, 113, 133, 0.3)",
            borderRadius: 14,
            fontSize: 13.5,
            color: "#fecdd3",
            lineHeight: 1.5,
          }}
        >
          {supported
            ? error
            : "This browser doesn't support live speech recognition. Chrome and Edge work best — use Type instead below."}
        </div>
      )}

      {/* Manual entry */}
      {showManual && (
        <div style={{ padding: "0 18px 12px" }}>
          <textarea
            value={manualText}
            onChange={(e) => setManualText(e.target.value)}
            placeholder={`Type or paste text in English or ${other.englishName}…`}
            rows={2}
            autoFocus
            style={{
              width: "100%",
              boxSizing: "border-box",
              borderRadius: 14,
              border: "1px solid var(--border-strong)",
              padding: "12px 14px",
              fontSize: 16,
              fontFamily: UI_FONT,
              resize: "vertical",
              background: "var(--surface)",
              color: "var(--text)",
              outline: "none",
            }}
          />
          <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
            <button
              onClick={() => submitManual("en")}
              style={{
                flex: 1,
                minHeight: 48,
                borderRadius: 12,
                border: "none",
                background: "linear-gradient(135deg, var(--en-deep), var(--en))",
                color: "#06121f",
                fontWeight: 700,
                fontSize: 14.5,
                cursor: "pointer",
              }}
            >
              English → {other.nativeName}
            </button>
            <button
              onClick={() => submitManual(otherLang)}
              style={{
                flex: 1,
                minHeight: 48,
                borderRadius: 12,
                border: "none",
                background: "linear-gradient(135deg, var(--alt-deep), var(--alt))",
                color: "#06121f",
                fontWeight: 700,
                fontSize: 14.5,
                cursor: "pointer",
                fontFamily: other.font,
              }}
            >
              {other.nativeName} → English
            </button>
          </div>
        </div>
      )}

      {/* Bottom controls — two mic buttons (English + selected language) */}
      <div
        style={{
          padding: "12px 18px calc(14px + env(safe-area-inset-bottom))",
          borderTop: "1px solid var(--border)",
          background: "rgba(10, 14, 26, 0.6)",
          backdropFilter: "blur(12px)",
          position: "sticky",
          bottom: 0,
        }}
      >
        <div style={{ display: "flex", gap: 12 }}>
          <MicButton lang="en" />
          <MicButton lang={otherLang} />
        </div>
        <button
          onClick={() => setShowManual((s) => !s)}
          style={{
            display: "block",
            width: "100%",
            marginTop: 10,
            minHeight: 44,
            borderRadius: 12,
            border: "1px solid var(--border)",
            background: showManual ? "var(--surface-strong)" : "transparent",
            color: "var(--text-dim)",
            fontSize: 14,
            fontWeight: 600,
            fontFamily: UI_FONT,
            cursor: "pointer",
            transition: "all 160ms ease",
          }}
        >
          ⌨ {showManual ? "Hide typing" : "Type instead"}
        </button>
      </div>
    </div>
  );
}
