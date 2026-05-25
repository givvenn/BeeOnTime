import { Phase } from "../hooks/useTimer";

interface Props {
  phase: Phase;
  progress: number;
  minutes: number;
  seconds: number;
}

const SIZE = 200;
const STROKE = 8;
const R = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * R;

const PHASE_LABELS: Record<Phase, string> = {
  idle: "READY",
  work: "WORK",
  break: "BREAK",
  longBreak: "LONG BREAK",
};

export function TimerDisplay({ phase, progress, minutes, seconds }: Props) {
  const offset = CIRCUMFERENCE * (1 - Math.max(0, Math.min(1, progress)));
  const isBreak = phase === "break" || phase === "longBreak";
  // Drive SVG colors from CSS vars so they swap with the theme.
  const accentVar = isBreak ? "var(--accent-break)" : "var(--accent)";

  return (
    <div className="timer-display">
      {/* Single SVG holds ring + text so everything scales together */}
      <svg
        className="timer-svg"
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        aria-label={`${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`}
      >
        <circle
          className="timer-ring-track"
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
        />
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          fill="none"
          stroke={accentVar}
          strokeWidth={STROKE}
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
          style={{
            transition:
              "stroke-dashoffset 0.8s cubic-bezier(0.4,0,0.2,1), stroke 0.5s ease",
          }}
        />
        <text
          x={SIZE / 2}
          y={SIZE / 2 - 10}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="var(--text)"
          fontSize="44"
          fontWeight="700"
          fontFamily="'SF Mono','JetBrains Mono','Fira Code','Courier New',monospace"
          letterSpacing="2"
        >
          {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
        </text>
        <text
          x={SIZE / 2}
          y={SIZE / 2 + 24}
          textAnchor="middle"
          dominantBaseline="middle"
          fill={accentVar}
          fontSize="10"
          fontWeight="700"
          letterSpacing="3"
          fontFamily="system-ui,sans-serif"
          style={{ transition: "fill 0.5s ease" }}
        >
          {PHASE_LABELS[phase]}
        </text>
      </svg>
    </div>
  );
}
