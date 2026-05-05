'use client'

interface HardDropButtonProps {
  translucent?: boolean
  size?: number
  accent?: string
  onHardDrop: () => void
}

export default function HardDropButton({
  translucent = false,
  size = 78,
  accent,
  onHardDrop,
}: HardDropButtonProps) {
  const bg = translucent ? 'bg-white/10 active:bg-white/30' : 'bg-cyan-700 active:bg-cyan-500'

  return (
    <button
      style={{ width: size, height: size }}
      className={`flex items-center justify-center rounded-full text-white/80 select-none touch-none
        border border-white/15 ${bg} transition-colors`}
      onPointerDown={(e) => { e.preventDefault(); onHardDrop() }}
    >
      <span className="text-xs font-bold tracking-widest">DROP</span>
    </button>
  )
}
