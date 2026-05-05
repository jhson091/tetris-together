'use client'

interface RotateButtonProps {
  translucent?: boolean
  size?: number
  direction?: 'cw' | 'ccw'
  onRotate: () => void
}

export default function RotateButton({
  translucent = false,
  size = 78,
  direction = 'cw',
  onRotate,
}: RotateButtonProps) {
  const bg = translucent ? 'bg-white/10 active:bg-white/30' : 'bg-cyan-700 active:bg-cyan-500'
  const iconSize = size * 0.48

  return (
    <button
      style={{ width: size, height: size }}
      className={`flex items-center justify-center rounded-full text-white/80 select-none touch-none
        border border-white/15 ${bg} transition-colors`}
      onPointerDown={(e) => { e.preventDefault(); onRotate() }}
    >
      <svg
        width={iconSize}
        height={iconSize}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={direction === 'ccw' ? { transform: 'scaleX(-1)' } : undefined}
      >
        <polyline points="23 4 23 10 17 10" />
        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
      </svg>
    </button>
  )
}
