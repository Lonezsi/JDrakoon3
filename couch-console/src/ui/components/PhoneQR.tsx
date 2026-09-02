import { useEffect, useState } from "react";
import { Copy, Wifi, QrCode, Repeat, WifiOff } from "lucide-react";
import { notifService } from "../../services/notificationService";
import { subscribeStatus } from "../../services/systemStatus";

export function PhoneQR() {
  const [data, setData] = useState<{
    svg: string;
    url: string;
    hostSvg: string | null;
    hostUrl: string;
  } | null>(null);
  // false = current-network IP link (always connects on this LAN);
  // true  = stable machine-name link (bookmark once, survives Wi-Fi changes).
  const [stable, setStable] = useState(false);
  // Phone pairing needs a LAN; without one the QR is a useless loopback URL.
  const [lan, setLan] = useState(true);

  const loadQr = () =>
    fetch("/qr-code")
      .then((res) => res.json())
      .then((d) =>
        setData({
          svg: d.svg,
          url: d.url,
          hostSvg: d.hostSvg ?? null,
          hostUrl: d.hostUrl ?? "",
        }),
      )
      .catch(() => {});

  // Track LAN via the shared status poller; (re)load the QR when the LAN
  // appears or its address changes, so it recovers automatically.
  useEffect(() => {
    let prevIp: string | null = null;
    let prevLan = false;
    return subscribeStatus((s) => {
      setLan(s.lan);
      if (s.lan && (!prevLan || s.lanIp !== prevIp)) loadQr();
      prevLan = s.lan;
      prevIp = s.lanIp;
    });
  }, []);

  const canStable = !!data?.hostSvg && !!data?.hostUrl;
  const showStable = stable && canStable;
  const svg = showStable ? data?.hostSvg : data?.svg;
  const url = showStable ? data?.hostUrl : data?.url;

  const copyToClipboard = () => {
    if (!url) return;
    navigator.clipboard.writeText(url).then(
      () => notifService.push("Phone URL copied to clipboard!"),
      () => notifService.push("Failed to copy URL"),
    );
  };

  // No LAN → no phone pairing possible. Show an offline chip instead of a QR
  // that points at a loopback address. The poller keeps checking every second,
  // so this swaps back to the QR automatically when the network returns.
  if (!lan) {
    return (
      <div className="fixed bottom-30 right-10 z-50 w-[106px]">
        <div className="bg-[#12121c] border border-white/10 p-2.5 rounded-2xl shadow-2xl flex flex-col items-center gap-1.5">
          <WifiOff size={26} className="text-amber-400/80" />
          <p className="text-[9px] font-black uppercase tracking-widest text-amber-300/90 text-center leading-tight">
            Offline
          </p>
          <p className="text-[8px] text-gray-500 text-center leading-tight">
            No network — phone pairing unavailable
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed bottom-30 right-10 z-50 transition-opacity duration-300 group w-[106px]">
      <div className="bg-white p-1 rounded-2xl shadow-2xl flex flex-col items-center">
        {/* QR code container */}
        <div className="w-[80px] h-[80px] flex items-center justify-center bg-gray-100 rounded-xl overflow-hidden">
          {svg ? (
            <div
              className="w-full h-full"
              dangerouslySetInnerHTML={{ __html: svg }}
              style={{ lineHeight: 0 }}
            />
          ) : (
            <QrCode size={32} className="text-gray-400 animate-pulse" />
          )}
        </div>

        {/* mode label + toggle (only when a stable name link is available) */}
        {canStable && (
          <button
            onClick={() => setStable((s) => !s)}
            className="mt-0.5 flex items-center gap-1 text-[7px] font-black uppercase tracking-wide text-gray-500 hover:text-indigo-500"
            data-tip="Switch between the current-network IP link and a stable machine-name link"
          >
            <Repeat size={8} />
            {showStable ? "Any network" : "This network"}
          </button>
        )}

        {/* URL (exactly what the QR contains) */}
        <div className="flex items-center gap-1">
          <Wifi size={10} className="text-gray-500" />
          <p className="text-[8px] text-gray-500 font-bold truncate max-w-[60px]">
            {url || "Loading..."}
          </p>
          <button
            onClick={(e) => {
              e.stopPropagation();
              copyToClipboard();
            }}
            className="p-0.5 text-gray-500 hover:text-indigo-500"
          >
            <Copy size={10} />
          </button>
        </div>
      </div>
    </div>
  );
}
