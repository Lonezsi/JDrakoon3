import { Tv } from "lucide-react";

export function BootScreen() {
  return (
    <div className="h-screen w-screen bg-black flex flex-col items-center justify-center text-white">
      <div className="relative mb-8">
        <div className="w-24 h-24 border-[5px] border-indigo-500 border-t-transparent rounded-full animate-spin" />
        <div className="absolute inset-0 flex items-center justify-center">
          <img src="dragon.svg" alt="Dragon" />
        </div>
      </div>
      <p className="text-[11px] font-black tracking-[0.55em] uppercase text-indigo-300/60 mb-1">
        JDrakoon v3.0
      </p>
      <p className="text-[10px] text-gray-700 font-bold uppercase tracking-widest">
        Lonezsi
      </p>
    </div>
  );
}
