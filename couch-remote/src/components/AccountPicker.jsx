import { useEffect, useState } from "react";
import { ChevronDown, UserRound, Check } from "lucide-react";

/** Phone-side account selector. Lets this device pick which account it's
 *  "playing as" — assigns `deviceMap[playerId]` on the backend, so queued media
 *  is attributed to the account's gamertag and the cube can carry its colour. */
export default function AccountPicker({ playerId }) {
  const [accounts, setAccounts] = useState([]);
  const [assignedId, setAssignedId] = useState("");
  const [open, setOpen] = useState(false);

  const load = () => {
    fetch("/api/accounts")
      .then((r) => r.json())
      .then((d) => {
        setAccounts(d.accounts || []);
        setAssignedId((playerId && d.deviceMap?.[playerId]) || "");
      })
      .catch(() => {});
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerId]);

  const assign = (id) => {
    setAssignedId(id);
    setOpen(false);
    if (!playerId) return;
    fetch("/api/accounts/assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId: playerId, accountId: id || null }),
    }).catch(() => {});
  };

  const current = accounts.find((a) => a.id === assignedId);

  return (
    <div className="relative flex-shrink-0">
      <button
        onClick={() => {
          if (!open) load();
          setOpen((o) => !o);
        }}
        className="flex items-center gap-1.5 rounded-full px-3 py-1.5 border max-w-[120px]"
        style={{
          background: current
            ? `${current.colorHex}1a`
            : "rgba(255,255,255,0.05)",
          borderColor: current ? `${current.colorHex}55` : "rgba(255,255,255,0.12)",
        }}
      >
        <UserRound
          size={11}
          style={{ color: current ? current.colorHex : "#94a3b8" }}
        />
        <span
          className="text-[10px] font-black uppercase tracking-wide truncate"
          style={{ color: current ? current.colorHex : "#94a3b8" }}
        >
          {current ? current.gamertag : "Account"}
        </span>
        <ChevronDown size={11} className="text-slate-500 flex-shrink-0" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className="absolute right-0 top-full mt-1 z-50 min-w-[150px] max-h-[50vh] overflow-y-auto rounded-xl py-1 shadow-2xl"
            style={{
              background: "#12121c",
              border: "1px solid rgba(255,255,255,0.1)",
            }}
          >
            <button
              onClick={() => assign("")}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-xs font-bold text-slate-400 hover:bg-white/5"
            >
              No account
              {!assignedId && <Check size={13} className="text-indigo-400" />}
            </button>
            {accounts.map((a) => (
              <button
                key={a.id}
                onClick={() => assign(a.id)}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-xs font-bold text-white hover:bg-white/5"
              >
                <span className="flex items-center gap-2 min-w-0">
                  <span
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ background: a.colorHex }}
                  />
                  <span className="truncate">{a.gamertag}</span>
                </span>
                {assignedId === a.id && (
                  <Check size={13} className="text-indigo-400 flex-shrink-0" />
                )}
              </button>
            ))}
            {accounts.length === 0 && (
              <p className="px-3 py-2 text-[10px] text-slate-600 italic">
                No accounts yet — add them on the TV.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
