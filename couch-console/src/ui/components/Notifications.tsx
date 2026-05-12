import { useEffect, useState } from 'react'
import { notifService } from '../../services/notificationService'

export function Notifications() {
  const [notifs, setNotifs] = useState<any[]>([])

  useEffect(() => notifService.subscribe(setNotifs), [])

  return (
    <div className="fixed top-8 right-8 z-50 flex flex-col gap-2.5 pointer-events-none">
      {notifs.map(n => (
        <div key={n.id} className="bg-indigo-600 text-white px-5 py-3.5 rounded-2xl text-sm font-black notif shadow-2xl border border-indigo-400/40 flex items-center gap-3">
          <div className="w-1 h-5 bg-white/35 rounded-full flex-shrink-0" />
          {n.text}
        </div>
      ))}
    </div>
  )
}
