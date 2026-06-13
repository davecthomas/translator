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
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [turns, interim, busy]);

  const other = useMemo(() => LANGUAGES[otherLang], [otherLang]);

  const translate = useCallback(async (text, srcLang, dstLang) => {
    const res = await fetch("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, srcLang, dstLang }),
    });
    if (!res.ok) throw new Error(`API ${res.status}`);
    const data = await res.json();
    if (!data.translation) throw new Error("Empty translation");
    return data.translation;
  }, []);

  const speak = useCallback((text, langCode) => {
    try {
      const info = langInfo(langCode);
      const u = new SpeechSynthesisUtterance(text);
      u.lang = info.speech;
      u.rate = 0.95;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    } catch (e) {
      /* speech synthesis unavailable; text is still shown */
    }
  }, []);

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
        setTurns((t) =>
          t.map((x) =>
            x.id === id
              ? { ...x, dstText: "Translation failed — tap to retry", failed: true }
              : x
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
