interface Props {
  sessions: number;
  target: number;
}

export function SessionDots({ sessions, target }: Props) {
  const cyclePosition = sessions % target;
  const completedCycle = sessions > 0 && cyclePosition === 0;

  return (
    <div className="session-dots">
      {Array.from({ length: target }, (_, i) => {
        const filled = completedCycle || i < cyclePosition;
        return <div key={i} className={`dot${filled ? " dot-filled" : ""}`} />;
      })}
    </div>
  );
}
