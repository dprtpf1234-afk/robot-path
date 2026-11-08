export function Stars({ n, size = 32, max = 3 }: { n: number; size?: number; max?: number }) {
  return (
    <span className="inline-flex gap-1" role="img" aria-label={`별 ${n}개`}>
      {Array.from({ length: max }, (_, i) => (
        <svg key={i} width={size} height={size} viewBox="0 0 24 24" className="pop" style={{ animationDelay: `${i * 0.15}s` }}>
          <path
            d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z"
            fill={i < n ? "#facc15" : "#e5e7eb"}
            stroke={i < n ? "#a16207" : "#9ca3af"}
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
        </svg>
      ))}
    </span>
  );
}
