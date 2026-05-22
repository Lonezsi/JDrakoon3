import { useEffect, useState } from "react";
import { Copy, Wifi, QrCode } from "lucide-react";
import { notifService } from "../../services/notificationService";

export function PhoneQR() {
  const [qrSvg, setQrSvg] = useState<string | null>(null);
  const [phoneUrl, setPhoneUrl] = useState("");

  useEffect(() => {
    fetch("/qr-code")
      .then((res) => res.json())
      .then((data) => {
        setQrSvg(data.svg);
        setPhoneUrl(data.url);
      })
      .catch(() => notifService.push("Could not load QR code"));
  }, []);

  const copyToClipboard = () => {
    if (!phoneUrl) return;
    navigator.clipboard.writeText(phoneUrl).then(
      () => notifService.push("Phone URL copied to clipboard!"),
      () => notifService.push("Failed to copy URL"),
    );
  };

  return (
    <div className="fixed bottom-30 right-10 z-50 transition-opacity duration-300 cursor-pointer group w-[106px]">
      <div className="bg-white p-1 rounded-2xl shadow-2xl flex flex-col items-center">
        {/* QR code container */}
        <div className="w-[80px] h-[80px] flex items-center justify-center bg-gray-100 rounded-xl overflow-hidden">
          {qrSvg ? (
            <div
              className="w-full h-full"
              dangerouslySetInnerHTML={{ __html: qrSvg }}
              style={{ lineHeight: 0 }}
            />
          ) : (
            <QrCode size={32} className="text-gray-400 animate-pulse" />
          )}
        </div>

        {/* URL (now exactly what the QR contains) */}
        <div className="flex items-center gap-1">
          <Wifi size={10} className="text-gray-500" />
          <p className="text-[8px] text-gray-500 font-bold truncate max-w-[60px]">
            {phoneUrl || "Loading..."}
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
