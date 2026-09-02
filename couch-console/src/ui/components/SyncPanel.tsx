import { useEffect, useState } from "react";
import { Link2, Link2Off, X, Lock, Check, Loader2 } from "lucide-react";
import { subscribe, getSocket } from "../../services/socket";
import { useModalLayer, Focusable } from "../../navigation/Focusable";
import { FocusInput } from "./FocusInput";

interface SyncApp {
  id: string;
  name: string;
  launcher: string;
  shared: boolean;
}
interface SyncStatus {
  status: "disconnected" | "connecting" | "connected" | "error";
  role: "host" | "peer" | null;
  code: string;
  remoteUrl: string;
  error: string;
  peerAccount: { gamertag: string; colorHex: string } | null;
  apps: SyncApp[];
}

const EMPTY: SyncStatus = {
  status: "disconnected",
  role: null,
  code: "",
  remoteUrl: "",
  error: "",
  peerAccount: null,
  apps: [],
};

/** Link two consoles over the network ("sync"). Both enter the same sync code
 *  (our stand-in for an online account — no central server); one enters the
 *  other's address and connects. Once linked, apps both own are selectable; the
 *  rest are greyed out, and lobby players are mirrored across both. */
export function SyncPanel() {
  const [open, setOpen] = useState(false);
  const [st, setSt] = useState<SyncStatus>(EMPTY);
  const [url, setUrl] = useState("");
  const [code, setCode] = useState("");
  const [myAddr, setMyAddr] = useState<string | null>(null);

  useModalLayer("sync", open, () => setOpen(false));
  const L = "sync";

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener("open-sync", onOpen);
    return () => window.removeEventListener("open-sync", onOpen);
  }, []);

  useEffect(() => {
    if (!open) return;
    fetch("/api/status")
      .then((r) => r.json())
      .then((s) => setMyAddr(s?.lanIp ? `http://${s.lanIp}:3001` : null))
      .catch(() => {});
    getSocket()?.emit("sync_status", (s: SyncStatus) => {
      if (s) {
        setSt(s);
        setUrl(s.remoteUrl || "");
        setCode(s.code || "");
      }
    });
    return subscribe((msg) => {
      if (msg.type === "sync_status") setSt({ ...EMPTY, ...msg });
    });
  }, [open]);

  if (!open) return null;

  const connected = st.status === "connected";
  const sock = () => getSocket();
  const saveCode = (c: string) => {
    setCode(c);
    sock()?.emit("sync_set_code", { code: c });
  };
  const connect = () => sock()?.emit("sync_connect", { url, code });
  const disconnect = () => sock()?.emit("sync_disconnect");

  const statusColor =
    st.status === "connected"
      ? "#4ade80"
      : st.status === "connecting"
        ? "#facc15"
        : st.status === "error"
          ? "#f87171"
          : "#64748b";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "#00000088", backdropFilter: "blur(8px)" }}
      onClick={() => setOpen(false)}
    >
      <div
        className="relative w-full max-w-lg max-h-[82vh] flex flex-col rounded-3xl overflow-hidden"
        style={{
          background: "rgba(12,12,18,0.98)",
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 30px 70px rgba(0,0,0,0.7)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-6 pt-6 pb-4 border-b border-white/5">
          <Link2 size={18} className="text-indigo-400" />
          <h2 className="text-xl font-black italic uppercase tracking-tight text-white">
            Sync with a friend
          </h2>
          <span
            className="ml-auto flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest"
            style={{ color: statusColor }}
          >
            <span
              className="w-2 h-2 rounded-full"
              style={{ background: statusColor }}
            />
            {st.status}
          </span>
          <Focusable
            id="sync-close"
            layer={L}
            title="Close"
            onSelect={() => setOpen(false)}
            className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/5 border border-white/10 text-gray-400 hover:text-white"
          >
            <X size={14} />
          </Focusable>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 custom-scroll">
          {/* Connect form */}
          <div className="space-y-2">
            <label className="block text-[10px] font-black uppercase tracking-widest text-gray-500">
              Sync code (both consoles set the same)
            </label>
            <FocusInput
              id="sync-code"
              layer={L}
              initial
              value={code}
              onChange={saveCode}
              placeholder="e.g. couch-night-42"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-indigo-500/40"
            />
            <label className="block text-[10px] font-black uppercase tracking-widest text-gray-500 pt-1">
              Friend's address (the host — leave blank if you're the host)
            </label>
            <div className="flex gap-2">
              <div className="flex-1">
                <FocusInput
                  id="sync-url"
                  layer={L}
                  value={url}
                  onChange={setUrl}
                  onEnter={connect}
                  placeholder="http://their-ip:3001"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm font-mono text-white outline-none focus:border-indigo-500/40"
                />
              </div>
              {connected ? (
                <Focusable
                  id="sync-disconnect"
                  layer={L}
                  onSelect={disconnect}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-600/80 hover:bg-red-600 text-[11px] font-black uppercase tracking-widest text-white cursor-pointer"
                >
                  <Link2Off size={13} /> Unlink
                </Focusable>
              ) : (
                <Focusable
                  id="sync-connect"
                  layer={L}
                  onSelect={connect}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-[11px] font-black uppercase tracking-widest text-white cursor-pointer"
                >
                  {st.status === "connecting" ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <Link2 size={13} />
                  )}
                  Connect
                </Focusable>
              )}
            </div>
            {st.error && st.status === "error" && (
              <p className="text-[11px] text-red-400 font-bold">{st.error}</p>
            )}
            {myAddr && (
              <p className="text-[10px] text-gray-500 leading-tight">
                Your address (give this to a friend on your network):{" "}
                <span className="font-mono text-indigo-300">{myAddr}</span>
              </p>
            )}
            <p className="text-[10px] text-gray-600 leading-tight">
              Direct link over your network (or the internet if the host's
              address is reachable). No accounts server — the sync code is the
              shared room.
            </p>
          </div>

          {/* Peer + shared apps */}
          {connected && (
            <>
              <div className="flex items-center gap-2 rounded-xl border border-white/8 bg-white/[0.02] px-3 py-2">
                <span
                  className="w-3 h-3 rounded-full"
                  style={{ background: st.peerAccount?.colorHex || "#4ade80" }}
                />
                <span className="text-sm font-black text-white">
                  Linked{st.peerAccount ? ` with ${st.peerAccount.gamertag}` : ""}
                </span>
              </div>

              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-2">
                  Shared library — playable together
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {st.apps.map((a) => (
                    <div
                      key={a.id}
                      className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${
                        a.shared
                          ? "border-emerald-400/30 bg-emerald-500/5"
                          : "border-white/8 bg-white/[0.02] opacity-40"
                      }`}
                    >
                      {a.shared ? (
                        <Check
                          size={13}
                          className="text-emerald-400 flex-shrink-0"
                        />
                      ) : (
                        <Lock size={12} className="text-gray-500 flex-shrink-0" />
                      )}
                      <span className="text-xs font-bold text-white truncate">
                        {a.name}
                      </span>
                    </div>
                  ))}
                  {st.apps.length === 0 && (
                    <p className="col-span-2 text-[11px] text-gray-600 italic py-2">
                      No apps to compare yet.
                    </p>
                  )}
                </div>
                <p className="text-[10px] text-gray-600 mt-2 leading-tight">
                  Greyed-out apps aren't installed on both consoles.
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
