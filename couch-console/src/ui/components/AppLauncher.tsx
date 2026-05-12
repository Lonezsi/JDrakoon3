import { ChevronRight, Plus } from "lucide-react";
import { MOCK_APPS } from "../../shared/constants";
import { launchApp } from "../../services/launcherService";
import { notifService } from "../../services/notificationService";
import React from "react";

interface AppLauncherProps {
  activeIndex: number;
  setActiveIndex: (i: number | ((prev: number) => number)) => void;
}

export function AppLauncher({ activeIndex, setActiveIndex }: AppLauncherProps) {
  return (
    <div className="flex-1 flex flex-col justify-center gap-6">
      <div className="flex items-center gap-3 px-2">
        <span className="px-2.5 py-1 bg-indigo-500 rounded text-[10px] font-black uppercase tracking-wider">
          Featured
        </span>
        <span className="text-[10px] font-black text-gray-600 uppercase tracking-widest">
          Application Library
        </span>
      </div>

      <div className="flex gap-5 items-center h-64 overflow-visible px-2">
        {MOCK_APPS.map((app, idx) => {
          const sel = activeIndex === idx;
          return (
            <div
              key={app.id}
              className={`relative flex-shrink-0 transition-all duration-500 ${sel ? "w-60 h-60 scale-110 z-10" : "w-44 h-44 opacity-40 grayscale"}`}
            >
              {sel && (
                <div
                  className={`absolute inset-0 blur-3xl opacity-25 rounded-3xl ${app.color}`}
                />
              )}
              <div
                className={`w-full h-full rounded-3xl p-5 flex flex-col justify-between relative z-10 border cursor-pointer
                  ${sel ? "bg-white/10 backdrop-blur-2xl border-white/35 shadow-2xl" : "bg-white/5 border-white/8"}`}
                onClick={() => {
                  setActiveIndex(idx);
                  if (sel) launchApp(app);
                }}
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
                    {sel ? "Press Enter / Click" : "Local App"}
                  </p>
                </div>
                {sel && (
                  <div className="absolute -bottom-3 right-5 bg-indigo-500 p-1.5 rounded-full shadow-lg shadow-indigo-500/50">
                    <ChevronRight size={16} />
                  </div>
                )}
              </div>
            </div>
          );
        })}
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
