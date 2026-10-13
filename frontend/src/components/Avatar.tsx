import React, { useEffect, useRef, useState } from "react";
import type { InteractionState } from "../types";

interface AvatarProps {
  state: InteractionState;
  isListening: boolean;
  audioRef: React.RefObject<HTMLAudioElement | null>;
  onToggleMic: () => void;
  onStopSpeaking: () => void;
  onReplay: () => void;
  canReplay: boolean;
  micSupported: boolean;
  busy: boolean;
  error?: string | null;
}

export function Avatar({
  state,
  isListening,
  audioRef,
  onToggleMic,
  onStopSpeaking,
  onReplay,
  canReplay,
  micSupported,
  busy,
  error,
}: AvatarProps) {
  const [mouthOpen, setMouthOpen] = useState(0); // 0 (closed) to 1 (wide open)
  const [isBlinking, setIsBlinking] = useState(false);
  const [eyeShift, setEyeShift] = useState({ x: 0, y: 0 });
  const [breathingY, setBreathingY] = useState(0);

  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioSourceConnected = useRef(false);
  const animFrameRef = useRef<number | null>(null);

  // Natural blinking effect with realistic double-blinks
  useEffect(() => {
    let blinkTimeout: ReturnType<typeof setTimeout>;

    const scheduleBlink = () => {
      const delay = Math.random() * 3200 + 2200; // 2.2s - 5.4s
      blinkTimeout = setTimeout(() => {
        setIsBlinking(true);
        setTimeout(() => {
          setIsBlinking(false);
          // 18% chance of a realistic quick double-blink
          if (Math.random() < 0.18) {
            setTimeout(() => {
              setIsBlinking(true);
              setTimeout(() => {
                setIsBlinking(false);
                scheduleBlink();
              }, 120);
            }, 100);
          } else {
            scheduleBlink();
          }
        }, 140);
      }, delay);
    };

    scheduleBlink();
    return () => clearTimeout(blinkTimeout);
  }, []);

  // Micro eye-movements (saccades) so the eyes feel naturally observant
  useEffect(() => {
    let eyeInterval: ReturnType<typeof setInterval>;

    const shiftGaze = () => {
      if (state === "thinking") {
        // Gaze slightly upward to reflect reflection/thought
        setEyeShift({ x: 0.8, y: -1.2 });
      } else {
        const x = (Math.random() - 0.5) * 1.6;
        const y = (Math.random() - 0.5) * 1.2;
        setEyeShift({ x, y });
      }
    };

    eyeInterval = setInterval(shiftGaze, 2800);
    return () => clearInterval(eyeInterval);
  }, [state]);

  // Web Audio API Synchronization with HTMLAudioElement
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const setupAudioContext = () => {
      if (audioSourceConnected.current) return;
      try {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!AudioCtx) return;

        const ctx = new AudioCtx();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 64;
        analyser.smoothingTimeConstant = 0.35;

        const source = ctx.createMediaElementSource(audio);
        source.connect(analyser);
        analyser.connect(ctx.destination);

        analyserRef.current = analyser;
        audioSourceConnected.current = true;
      } catch {
        // In case audio source was already connected or restricted
      }
    };

    const handlePlay = () => {
      setupAudioContext();
    };

    audio.addEventListener("play", handlePlay);
    return () => {
      audio.removeEventListener("play", handlePlay);
    };
  }, [audioRef]);

  // Animation frame loop: Audio amplitude tracking + idle breathing
  useEffect(() => {
    let fallbackAngle = 0;
    let clock = 0;

    const tick = () => {
      clock += 0.04;
      // Subtle idle breathing displacement (0 to 1.6px)
      setBreathingY(Math.sin(clock) * 1.4);

      if (state === "speaking") {
        const analyser = analyserRef.current;
        if (analyser) {
          const buffer = new Uint8Array(analyser.frequencyBinCount);
          analyser.getByteFrequencyData(buffer);
          let sum = 0;
          for (let i = 0; i < buffer.length; i += 1) sum += buffer[i];
          const avg = sum / buffer.length;
          // Normalize volume [0..255] to smooth mouth openness
          const level = Math.min(1.0, avg / 60);
          setMouthOpen((prev) => prev * 0.3 + level * 0.7); // Smooth interpolation
        } else {
          // Fallback animated speech rhythm
          fallbackAngle += 0.28;
          const level = (Math.sin(fallbackAngle) + 1) / 2 * 0.75 + 0.15;
          setMouthOpen(level);
        }
      } else {
        setMouthOpen(0);
      }

      animFrameRef.current = requestAnimationFrame(tick);
    };

    animFrameRef.current = requestAnimationFrame(tick);

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [state]);

  // Dynamic mouth SVG path calculation
  const openPx = mouthOpen * 16;
  const mouthPath =
    mouthOpen > 0.08
      ? `M 86 137 Q 100 ${137 + openPx * 1.25} 114 137 Q 100 ${135 - openPx * 0.2} 86 137 Z`
      : "M 88 137 Q 100 141 112 137";

  // Head tilt and posture based on interaction state
  const headTransform =
    state === "thinking"
      ? `translateY(${breathingY - 1}px) rotate(-2deg)`
      : state === "speaking"
      ? `translateY(${breathingY + mouthOpen * 1.5}px) scale(1.015)`
      : isListening
      ? `translateY(${breathingY}px) scale(1.01)`
      : `translateY(${breathingY}px)`;

  // State styling tokens
  const auraGlow = isListening
    ? "shadow-[0_0_40px_rgba(52,211,153,0.45)] border-emerald-400"
    : state === "speaking"
    ? "shadow-[0_0_45px_rgba(45,212,191,0.5)] border-teal-400"
    : state === "thinking"
    ? "shadow-[0_0_35px_rgba(168,85,247,0.45)] border-purple-400 animate-pulse"
    : state === "error"
    ? "shadow-[0_0_35px_rgba(251,113,133,0.4)] border-rose-400"
    : "shadow-[0_0_25px_rgba(56,189,248,0.2)] border-slate-700";

  const stateBadge = isListening
    ? { text: "Listening", bg: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40" }
    : state === "speaking"
    ? { text: "Speaking", bg: "bg-teal-500/20 text-teal-300 border-teal-500/40" }
    : state === "thinking"
    ? { text: "Thinking", bg: "bg-purple-500/20 text-purple-300 border-purple-500/40" }
    : state === "error"
    ? { text: "Notice", bg: "bg-rose-500/20 text-rose-300 border-rose-500/40" }
    : { text: "Ready", bg: "bg-slate-800 text-slate-300 border-slate-700" };

  return (
    <div className="flex flex-col items-center">
      {/* Avatar Container with Animated Aura */}
      <div className="relative">
        <div
          className={`relative h-48 w-48 overflow-hidden rounded-full border-2 bg-gradient-to-b from-[#0e172a] via-[#09101f] to-[#040813] transition-all duration-300 sm:h-56 sm:w-56 md:h-60 md:w-60 ${auraGlow}`}
        >
          {/* Ambient Lighting Rays */}
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(45,212,191,0.18),transparent_65%)]" />

          {/* SVG Character Illustration */}
          <svg
            viewBox="0 0 200 200"
            className="h-full w-full select-none"
            style={{
              transform: headTransform,
              transition: "transform 0.18s ease-out",
            }}
          >
            <defs>
              <linearGradient id="skin" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#f5cfb3" />
                <stop offset="100%" stopColor="#e0b090" />
              </linearGradient>
              <linearGradient id="hair" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#1e293b" />
                <stop offset="100%" stopColor="#0f172a" />
              </linearGradient>
              <linearGradient id="glassesFrame" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#2dd4bf" />
                <stop offset="100%" stopColor="#38bdf8" />
              </linearGradient>
            </defs>

            {/* Neck & Shoulders / Suit */}
            <path
              d="M 50 200 L 75 160 Q 100 168 125 160 L 150 200 Z"
              fill="#1e293b"
            />
            {/* Shirt Collar */}
            <polygon points="90,165 100,180 110,165 100,162" fill="#38bdf8" opacity="0.85" />
            <polygon points="100,165 92,185 100,195 108,185" fill="#f8fafc" />

            {/* Neck */}
            <rect x="88" y="142" width="24" height="24" rx="4" fill="url(#skin)" />

            {/* Ears */}
            <ellipse cx="64" cy="112" rx="7" ry="12" fill="url(#skin)" />
            <ellipse cx="136" cy="112" rx="7" ry="12" fill="url(#skin)" />

            {/* Face Base */}
            <path
              d="M 68 100 C 68 65, 132 65, 132 100 C 132 135, 120 152, 100 152 C 80 152, 68 135, 68 100 Z"
              fill="url(#skin)"
            />

            {/* Professional Hair */}
            <path
              d="M 64 96 C 62 65, 80 48, 100 48 C 122 48, 138 64, 136 96 C 132 76, 120 62, 100 62 C 80 62, 68 76, 64 96 Z"
              fill="url(#hair)"
            />
            <path
              d="M 65 92 Q 85 58 125 68 Q 138 72 136 86 Q 120 66 98 70 Q 78 74 65 92 Z"
              fill="#334155"
              opacity="0.9"
            />

            {/* Eyebrows */}
            <path
              d={state === "thinking" ? "M 74 92 Q 84 89 92 92" : `M 74 ${94 - mouthOpen * 2} Q 84 91 92 93`}
              stroke="#0f172a"
              strokeWidth="2.5"
              strokeLinecap="round"
              fill="none"
            />
            <path
              d={state === "thinking" ? "M 108 91 Q 116 86 126 89" : `M 108 93 Q 116 91 126 ${94 - mouthOpen * 2}`}
              stroke="#0f172a"
              strokeWidth="2.5"
              strokeLinecap="round"
              fill="none"
            />

            {/* Eyes & Blinking */}
            {isBlinking ? (
              <>
                <line x1="77" y1="104" x2="89" y2="104" stroke="#0f172a" strokeWidth="2.5" strokeLinecap="round" />
                <line x1="111" y1="104" x2="123" y2="104" stroke="#0f172a" strokeWidth="2.5" strokeLinecap="round" />
              </>
            ) : (
              <>
                {/* Left Eye */}
                <ellipse cx="83" cy="104" rx="6" ry="6" fill="#ffffff" />
                <circle cx={83.5 + eyeShift.x} cy={104 + eyeShift.y} r="3.2" fill="#1e293b" />
                <circle cx={85 + eyeShift.x * 0.7} cy={102.5 + eyeShift.y * 0.7} r="1.2" fill="#ffffff" />

                {/* Right Eye */}
                <ellipse cx="117" cy="104" rx="6" ry="6" fill="#ffffff" />
                <circle cx={117.5 + eyeShift.x} cy={104 + eyeShift.y} r="3.2" fill="#1e293b" />
                <circle cx={119 + eyeShift.x * 0.7} cy={102.5 + eyeShift.y * 0.7} r="1.2" fill="#ffffff" />
              </>
            )}

            {/* Modern Slim Glasses */}
            <rect
              x="72"
              y="96"
              width="23"
              height="16"
              rx="4"
              fill="none"
              stroke="url(#glassesFrame)"
              strokeWidth="1.8"
            />
            <rect
              x="105"
              y="96"
              width="23"
              height="16"
              rx="4"
              fill="none"
              stroke="url(#glassesFrame)"
              strokeWidth="1.8"
            />
            <line x1="95" y1="103" x2="105" y2="103" stroke="url(#glassesFrame)" strokeWidth="1.8" />
            <line x1="68" y1="102" x2="72" y2="102" stroke="url(#glassesFrame)" strokeWidth="1.5" />
            <line x1="128" y1="102" x2="132" y2="102" stroke="url(#glassesFrame)" strokeWidth="1.5" />

            {/* Nose */}
            <path d="M 100 108 L 98 122 Q 100 124 103 122" stroke="#d49a78" strokeWidth="1.8" fill="none" strokeLinecap="round" />

            {/* Dynamic Animated Mouth */}
            <path
              d={mouthPath}
              stroke="#991b1b"
              strokeWidth={mouthOpen > 0.08 ? "1" : "2"}
              fill={mouthOpen > 0.08 ? "#450a0a" : "none"}
              strokeLinecap="round"
            />
            {mouthOpen > 0.25 ? (
              /* Teeth highlight */
              <path
                d={`M 91 137 Q 100 ${137 + openPx * 0.4} 109 137 Z`}
                fill="#f8fafc"
                opacity="0.95"
              />
            ) : null}
          </svg>
        </div>

        {/* State Badge */}
        <div className="absolute -bottom-2 left-1/2 -translate-x-1/2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-0.5 text-xs font-semibold backdrop-blur-md ${stateBadge.bg}`}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                isListening
                  ? "bg-emerald-400 animate-ping"
                  : state === "speaking"
                  ? "bg-teal-400 animate-pulse"
                  : state === "thinking"
                  ? "bg-purple-400 animate-bounce"
                  : state === "error"
                  ? "bg-rose-400"
                  : "bg-slate-400"
              }`}
            />
            {stateBadge.text}
          </span>
        </div>
      </div>

      {/* Voice & Playback Controls */}
      <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
        <button
          type="button"
          onClick={onToggleMic}
          disabled={busy || !micSupported}
          aria-pressed={isListening}
          title={
            micSupported
              ? isListening
                ? "Stop microphone"
                : "Talk via microphone"
              : "Speech recognition not supported in this browser"
          }
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold transition disabled:opacity-40 ${
            isListening
              ? "bg-rose-600 text-white shadow-lg shadow-rose-600/30"
              : "border border-[var(--line)] bg-[var(--bg-panel)] text-slate-100 hover:border-teal-400/40"
          }`}
        >
          <span
            className={`h-2.5 w-2.5 rounded-full ${
              isListening ? "bg-white animate-pulse" : "bg-emerald-400"
            }`}
          />
          {isListening ? "Stop Listening" : "Microphone"}
        </button>

        <button
          type="button"
          onClick={onStopSpeaking}
          disabled={state !== "speaking"}
          className="rounded-xl border border-[var(--line)] bg-[var(--bg-panel)] px-3.5 py-2.5 text-xs font-medium text-slate-200 transition hover:border-teal-400/40 disabled:opacity-30"
          title="Stop speech playback"
        >
          Stop Speaking
        </button>

        <button
          type="button"
          onClick={onReplay}
          disabled={!canReplay || busy}
          className="rounded-xl border border-[var(--line)] bg-[var(--bg-panel)] px-3.5 py-2.5 text-xs font-medium text-slate-200 transition hover:border-teal-400/40 disabled:opacity-30"
          title="Replay latest answer audio"
        >
          Replay Voice
        </button>
      </div>

      {error ? (
        <p className="mt-2.5 max-w-sm text-center text-xs text-[var(--danger)]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
