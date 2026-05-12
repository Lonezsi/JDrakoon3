import { TopBar } from '../components/TopBar'
import { AppLauncher } from '../components/AppLauncher'
import { Footer } from '../components/Footer'
import type { Player } from '../../shared/types'

interface DashboardLayoutProps {
  clock: Date
  players: Player[]
  activeIndex: number
  setActiveIndex: React.Dispatch<React.SetStateAction<number>>
}

export function DashboardLayout({ clock, players, activeIndex, setActiveIndex }: DashboardLayoutProps) {
  return (
    <div className="relative z-10 h-full w-full flex flex-col p-10">
      <TopBar clock={clock} players={players} />
      <AppLauncher activeIndex={activeIndex} setActiveIndex={setActiveIndex} />
      <Footer players={players} />
    </div>
  )
}
