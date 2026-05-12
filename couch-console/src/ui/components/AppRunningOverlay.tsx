export function AppRunningOverlay() {
  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center">
      <div className="text-center">
        <div className="w-12 h-12 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-xs font-black tracking-[0.4em] uppercase text-indigo-300/60">Launching…</p>
      </div>
    </div>
  )
}
