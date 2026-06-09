import { ChevronRight, Plus } from "lucide-react";
import { APPS } from "../../shared/constants";
import { launchApp } from "../../services/launcherService";
import { notifService } from "../../services/notificationService";
import { useFocusable } from "../../navigation/FocusContext";
import type { AppDefinition } from "../../shared/types";
import React from "react";

function AppCard({ app, initial }: { app: AppDefinition; initial: boolean }) {
  const { ref, focused } = useFocusable<HTMLDivElement>(`app-${app.id}`, {
    onSelect: () => launchApp(app),
    initial,
  });

  return (
    <div
      ref={ref}
      className={`relative flex-shrink-0 transition-all duration-500 ${
        focused ? "w-60 h-60 scale-110 z-10" : "w-44 h-44"
      }`}
    >
      {/* Layer 1: Colored glow */}
      <div
        className={`absolute inset-0 blur-3xl rounded-3xl transition-opacity duration-700 ease-in-out ${
          focused ? "opacity-25" : "opacity-0"
        } ${app.color}`}
      />

      {/* Layer 2: Frosted glass */}
      <div
        className={`absolute inset-0 rounded-3xl backdrop-blur-sm transition-opacity duration-700 ease-in-out ${
          focused ? "opacity-100" : "opacity-0"
        }`}
      />

      {/* Card */}
      <div
        className={`relative z-10 w-full h-full rounded-3xl p-5 flex flex-col justify-between border cursor-pointer
            ${
              focused
                ? "bg-white/10 border-white/35 shadow-2xl"
                : "bg-white/5 border-white/8 grayscale hover:border-white/20 hover:grayscale-0 transition-all duration-300"
            }`}
        onClick={() => launchApp(app)}
      >
        <div
          className={`w-12 h-12 rounded-2xl flex items-center justify-center ${app.color} shadow-lg`}
        >
          {React.cloneElement(app.icon as React.ReactElement<any>, {
            size: 26,
          })}
        </div>
        <div>
          <h3 className="text-xl font-black tracking-tight italic uppercase leading-none">
            {app.name}
          </h3>
          <p className="text-[10px] text-gray-500 mt-1 uppercase font-black">
            {focused ? "Press Enter / Click / A" : "Local App"}
          </p>
        </div>
        {focused && (
          <div className="absolute -bottom-3 right-5 bg-indigo-500 p-1.5 rounded-full shadow-lg shadow-indigo-500/50">
            <ChevronRight size={16} />
          </div>
        )}
      </div>
    </div>
  );
}

export function AppLauncher() {
  return (
    <div className="flex-1 flex flex-col mt-10 gap-6">
      <div className="flex items-center gap-3 px-2">
        <span className="px-2.5 py-1 bg-indigo-500 rounded text-[10px] font-black uppercase tracking-wider">
          Library
        </span>
        <span className="text-[10px] font-black text-gray-600 uppercase tracking-widest">
          {APPS.length} Apps
        </span>
      </div>

      <div className="flex gap-5 items-center h-64 overflow-visible px-2">
        {APPS.map((app, idx) => (
          <AppCard key={app.id} app={app} initial={idx === 0} />
        ))}
        <div
          className="flex-shrink-0 w-44 h-44 rounded-3xl border-2 border-dashed border-white/10 flex flex-col items-center justify-center text-gray-700 cursor-pointer hover:text-gray-500 hover:border-white/20 transition-colors"
          onClick={() =>
            notifService.push("Add new app: drag an .exe or enter a Steam URI.")
          }
        >
          <Plus size={20} />
          <span className="text-[10px] font-bold mt-2 uppercase tracking-widest">
            Add System
          </span>
        </div>
      </div>
    </div>
  );
}
