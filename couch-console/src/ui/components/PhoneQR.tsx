import { Wifi } from "lucide-react";
import { notifService } from "../../services/notificationService";

export function PhoneQR() {
  return (
    <div
      className="fixed bottom-30 right-10 z-50 opacity-15 hover:opacity-95 transition-opacity duration-300 cursor-pointer"
      onClick={() =>
        notifService.push("Phone pairing: open 192.168.1.x:3000 on your phone.")
      }
    >
      <div className="bg-white p-2.5 rounded-2xl shadow-2xl">
        <div className="w-[72px] h-[72px] bg-gray-900 rounded-lg grid grid-cols-3 gap-[2px] p-1.5">
          {Array.from({ length: 9 }).map((_, i) => (
            <div
              key={i}
              className={`rounded-[2px] ${[0, 2, 6, 8, 4].includes(i) ? "bg-white" : "bg-gray-700"}`}
            />
          ))}
        </div>
        <div className="flex items-center gap-1 mt-1.5 px-0.5">
          <Wifi size={9} className="text-gray-500" />
          <p className="text-[8px] text-gray-500 font-bold">:3000</p>
        </div>
      </div>
    </div>
  );
}
