import { useEffect, useState, useCallback } from "react";
import {
  X,
  Plus,
  Pencil,
  Trash2,
  Check,
  Gamepad2,
  ListVideo,
  ArrowUp,
  icons as lucideIcons,
} from "lucide-react";
import { subscribe } from "../../services/socket";
import { IconPicker } from "./IconPicker";
import { MappingEditor } from "./MappingEditor";
import {
  defaultProfileFor,
  deviceKind,
  playerToDeviceId,
  type InputMapping,
} from "../../services/deviceSettings";
import type { Player } from "../../shared/types";

interface Account {
  id: string;
  gamertag: string;
  colorHex: string;
  icon: string;
  createdAt: number;
  stats: { appsLaunched: number; videosQueued: number; jumps: number };
  history: { type: string; label: string; at: number }[];
}
interface AccountsState {
  accounts: Account[];
  activeId: string | null;
  deviceMap: Record<string, string>;
}

const PALETTE = [
  "#6366f1",
  "#ec4899",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#3b82f6",
  "#8b5cf6",
  "#f97316",
];

function Avatar({ acc, size = 44 }: { acc: { icon: string; colorHex: string; gamertag: string }; size?: number }) {
  const Ico = lucideIcons[acc.icon as keyof typeof lucideIcons] as any;
  return (
    <div
      className="rounded-2xl flex items-center justify-center text-white font-black flex-shrink-0"
      style={{ width: size, height: size, background: acc.colorHex }}
    >
      {Ico ? <Ico size={size * 0.5} /> : acc.gamertag[0]?.toUpperCase() || "?"}
    </div>
  );
}

function timeAgo(at: number) {
  const s = Math.floor((Date.now() - at) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function deviceLabel(p: Player) {
  if (p.id === "AWSD") return "Keyboard 1";
  if (p.id === "UHJK") return "Keyboard 2";
  if (p.id.startsWith("gp"))
    return `Controller ${(parseInt(p.id.slice(2), 10) || 0) + 1}`;
  return p.name || p.id;
}

export function AccountsPanel({
  open,
  onClose,
  players = [],
}: {
  open: boolean;
  onClose: () => void;
  players?: Player[];
}) {
  const [data, setData] = useState<AccountsState>({
    accounts: [],
    activeId: null,
    deviceMap: {},
  });
  // Input config (#11): per-device mapping assignment + available profiles.
  const [inputCfg, setInputCfg] = useState<{
    devices: Record<string, { mapping?: string }>;
    mappings: Record<string, InputMapping>;
  }>({ devices: {}, mappings: {} });
  const [mappingFor, setMappingFor] = useState<{
    deviceId: string;
    label: string;
  } | null>(null);

  const loadInput = useCallback(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((s) =>
        setInputCfg({
          devices: s?.input?.devices || {},
          mappings: s?.input?.mappings || {},
        }),
      )
      .catch(() => {});
  }, []);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ gamertag: "", colorHex: PALETTE[0], icon: "User" });
  const [pickingIcon, setPickingIcon] = useState(false);

  const load = useCallback(() => {
    fetch("/api/accounts")
      .then((r) => r.json())
      .then((d) =>
        setData({
          accounts: d.accounts || [],
          activeId: d.activeId ?? null,
          deviceMap: d.deviceMap || {},
        }),
      )
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    loadInput();
    const unsub = subscribe((msg) => {
      if (msg.type === "accounts_updated")
        setData({
          accounts: msg.accounts || [],
          activeId: msg.activeId ?? null,
          deviceMap: msg.deviceMap || {},
        });
      if (msg.type === "settings_updated") loadInput();
    });
    return unsub;
  }, [open, load, loadInput]);

  const api = (url: string, method: string, body?: any) =>
    fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    })
      .then((r) => r.json())
      .then((res) => {
        if (res?.state) setData(res.state);
        else load();
      })
      .catch(() => {});

  const startCreate = () => {
    setEditingId(null);
    setForm({
      gamertag: "",
      colorHex: PALETTE[Math.floor(Math.random() * PALETTE.length)],
      icon: "User",
    });
    setCreating(true);
  };
  const startEdit = (a: Account) => {
    setCreating(false);
    setForm({ gamertag: a.gamertag, colorHex: a.colorHex, icon: a.icon });
    setEditingId(a.id);
  };
  const submitForm = () => {
    const body = {
      gamertag: form.gamertag.trim() || "Player",
      colorHex: form.colorHex,
      icon: form.icon,
    };
    if (creating) api("/api/accounts", "POST", body);
    else if (editingId) api(`/api/accounts/${editingId}`, "PATCH", body);
    setCreating(false);
    setEditingId(null);
  };
  const editorOpen = creating || editingId !== null;

  return (
    <>
      {/* backdrop */}
      <div
        className={`fixed inset-0 z-40 transition-opacity duration-300 ${
          open ? "bg-black/40 opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
      />
      {/* full-height right panel */}
      <div
        className="fixed top-0 right-0 z-50 h-full w-[380px] max-w-[90vw] flex flex-col transition-transform duration-300 ease-out"
        style={{
          transform: open ? "translateX(0)" : "translateX(100%)",
          background: "rgba(10,10,16,0.98)",
          borderLeft: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "-20px 0 60px rgba(0,0,0,0.6)",
        }}
      >
        <div className="flex items-center justify-between px-5 pt-6 pb-4 border-b border-white/5">
          <h2 className="text-2xl font-black italic uppercase tracking-tight text-white">
            Accounts
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/5 border border-white/10 text-gray-400 hover:text-white hover:bg-white/10"
          >
            <X size={14} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 custom-scroll">
          {data.accounts.length === 0 && !editorOpen && (
            <p className="text-center text-[11px] font-black uppercase tracking-widest text-gray-600 py-10">
              No accounts yet
            </p>
          )}

          {data.accounts.map((a) => {
            const active = a.id === data.activeId;
            return (
              <div
                key={a.id}
                onClick={() => api("/api/accounts/active", "POST", { id: a.id })}
                className={`group rounded-2xl border p-3 cursor-pointer transition-all ${
                  active
                    ? "border-indigo-400/50 bg-indigo-500/10"
                    : "border-white/8 bg-white/[0.02] hover:bg-white/[0.05]"
                }`}
              >
                <div className="flex items-center gap-3">
                  <Avatar acc={a} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-black text-white truncate">
                        {a.gamertag}
                      </p>
                      {active && (
                        <span className="px-1.5 py-0.5 rounded bg-indigo-500 text-[8px] font-black uppercase tracking-widest">
                          Active
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-[10px] text-gray-500 font-bold">
                      <span className="inline-flex items-center gap-1">
                        <Gamepad2 size={11} /> {a.stats.appsLaunched}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <ListVideo size={11} /> {a.stats.videosQueued}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <ArrowUp size={11} /> {a.stats.jumps}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      title="Edit"
                      onClick={(e) => {
                        e.stopPropagation();
                        startEdit(a);
                      }}
                      className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/5 border border-white/10 text-gray-300 hover:text-white"
                    >
                      <Pencil size={12} />
                    </button>
                    <button
                      title="Delete"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (window.confirm(`Delete "${a.gamertag}"?`))
                          api(`/api/accounts/${a.id}`, "DELETE");
                      }}
                      className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/5 border border-white/10 text-red-400 hover:text-red-300"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>

                {a.history.length > 0 && (
                  <div className="mt-3 pt-2 border-t border-white/5 space-y-1">
                    {a.history.slice(0, 4).map((h, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between text-[10px]"
                      >
                        <span className="text-gray-400 truncate mr-2">
                          <span className="text-gray-600 uppercase font-black mr-1.5">
                            {h.type === "queue" ? "Queued" : "Launched"}
                          </span>
                          {h.label}
                        </span>
                        <span className="text-gray-700 flex-shrink-0">
                          {timeAgo(h.at)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {/* Devices in the lobby → pick which account each one plays as */}
          {players.length > 0 && (
            <div className="pt-2">
              <p className="px-1 pb-2 text-[10px] font-black uppercase tracking-widest text-gray-600">
                Devices in lobby
              </p>
              <div className="space-y-2">
                {players.map((p) => {
                  const assignedId = data.deviceMap[p.id] || "";
                  const acc = data.accounts.find((a) => a.id === assignedId);
                  const dot = acc?.colorHex || p.color || "#444";
                  // OS-level input devices (keyboards/gamepads) get a mapping
                  // dropdown + editor; phones have virtual input — no mapping.
                  const devId = playerToDeviceId(p.id);
                  const kind = devId ? deviceKind(devId) : null;
                  const profileNames = devId
                    ? Object.entries(inputCfg.mappings)
                        .filter(([, m]) => m.type === kind)
                        .map(([n]) => n)
                    : [];
                  const assignedMapping = devId
                    ? inputCfg.devices[devId]?.mapping ||
                      defaultProfileFor(devId)
                    : "";
                  return (
                    <div
                      key={p.id}
                      className="rounded-xl border border-white/8 bg-white/[0.02] px-3 py-2 space-y-1.5"
                    >
                      <div className="flex items-center gap-2.5">
                        <span
                          className="w-3 h-3 rounded-full flex-shrink-0 ring-1 ring-white/20"
                          style={{ background: dot }}
                        />
                        <span className="text-xs font-bold text-gray-300 flex-1 min-w-0 truncate">
                          {deviceLabel(p)}
                        </span>
                        <span className="text-[9px] font-black uppercase tracking-widest text-gray-600">
                          {kind || p.deviceType || "phone"}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <select
                          value={assignedId}
                          onChange={(e) =>
                            api("/api/accounts/assign", "POST", {
                              deviceId: p.id,
                              accountId: e.target.value || null,
                            })
                          }
                          title="Playing as"
                          className="flex-1 min-w-0 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-[11px] font-bold text-white outline-none focus:border-indigo-500/40"
                        >
                          <option value="">— No account —</option>
                          {data.accounts.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.gamertag}
                            </option>
                          ))}
                        </select>
                        {devId && (
                          <>
                            <select
                              value={assignedMapping}
                              onChange={(e) =>
                                fetch("/api/settings", {
                                  method: "PATCH",
                                  headers: {
                                    "Content-Type": "application/json",
                                  },
                                  body: JSON.stringify({
                                    input: {
                                      devices: {
                                        [devId]: { mapping: e.target.value },
                                      },
                                    },
                                  }),
                                }).then(() => loadInput())
                              }
                              title="Control mapping"
                              className="flex-1 min-w-0 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-[11px] font-bold text-indigo-200 outline-none focus:border-indigo-500/40"
                            >
                              {!profileNames.includes(assignedMapping) && (
                                <option value={assignedMapping}>
                                  {assignedMapping}
                                </option>
                              )}
                              {profileNames.map((n) => (
                                <option key={n} value={n}>
                                  {n}
                                </option>
                              ))}
                            </select>
                            <button
                              title="Edit mapping"
                              onClick={() =>
                                setMappingFor({
                                  deviceId: devId,
                                  label: deviceLabel(p),
                                })
                              }
                              className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/5 border border-white/10 text-gray-300 hover:text-white flex-shrink-0"
                            >
                              <Pencil size={11} />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* inline create / edit form */}
          {editorOpen && (
            <div className="rounded-2xl border border-indigo-400/30 bg-indigo-500/5 p-3 space-y-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-indigo-300">
                {creating ? "New account" : "Edit account"}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPickingIcon(true)}
                  title="Choose icon"
                  className="flex-shrink-0"
                >
                  <Avatar acc={form} />
                </button>
                <input
                  autoFocus
                  value={form.gamertag}
                  onChange={(e) => setForm({ ...form, gamertag: e.target.value })}
                  onKeyDown={(e) => e.key === "Enter" && submitForm()}
                  placeholder="Gamertag"
                  maxLength={24}
                  className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-indigo-500/40"
                />
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {PALETTE.map((c) => (
                  <button
                    key={c}
                    onClick={() => setForm({ ...form, colorHex: c })}
                    className="w-6 h-6 rounded-full transition-transform"
                    style={{
                      background: c,
                      outline: form.colorHex === c ? "2px solid white" : "none",
                      outlineOffset: 2,
                      transform: form.colorHex === c ? "scale(1.1)" : "none",
                    }}
                  />
                ))}
                <input
                  type="color"
                  value={form.colorHex}
                  onChange={(e) => setForm({ ...form, colorHex: e.target.value })}
                  className="w-6 h-6 rounded-full border border-white/10 bg-transparent cursor-pointer"
                  style={{ padding: 0 }}
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => {
                    setCreating(false);
                    setEditingId(null);
                  }}
                  className="px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest text-gray-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  onClick={submitForm}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-[10px] font-black uppercase tracking-widest text-white"
                >
                  <Check size={12} /> {creating ? "Create" : "Save"}
                </button>
              </div>
            </div>
          )}
        </div>

        {!editorOpen && (
          <div className="px-4 py-4 border-t border-white/5">
            <button
              onClick={startCreate}
              className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-[11px] font-black uppercase tracking-widest text-white"
            >
              <Plus size={14} /> New account
            </button>
          </div>
        )}
      </div>

      {pickingIcon && (
        <IconPicker
          current={form.icon}
          onPick={(n) => setForm((f) => ({ ...f, icon: n }))}
          onClose={() => setPickingIcon(false)}
        />
      )}

      {mappingFor && (
        <MappingEditor
          deviceId={mappingFor.deviceId}
          label={mappingFor.label}
          onClose={() => {
            setMappingFor(null);
            loadInput();
          }}
        />
      )}
    </>
  );
}
