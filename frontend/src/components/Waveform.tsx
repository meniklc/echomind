interface WaveformProps {
  active: boolean;
  label?: string;
}

export function Waveform({ active, label }: WaveformProps) {
  return (
    <div
      className="flex items-center gap-3"
      aria-live="polite"
      aria-label={label || (active ? "Audio activity" : "Idle")}
    >
      <div className={`waveform ${active ? "opacity-100" : "opacity-35"}`} aria-hidden="true">
        {Array.from({ length: 7 }).map((_, index) => (
          <span
            key={index}
            style={{
              height: active ? undefined : 8,
              animationPlayState: active ? "running" : "paused",
            }}
          />
        ))}
      </div>
      {label ? <span className="text-sm text-[var(--muted)]">{label}</span> : null}
    </div>
  );
}
