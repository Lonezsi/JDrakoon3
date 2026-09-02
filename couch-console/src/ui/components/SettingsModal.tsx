import { useState, useEffect } from "react";
import { RotateCcw, X, Trash2, Pencil } from "lucide-react";
import React from "react";
import { useFocus, useFocusable } from "../../navigation/FocusContext";
import { MappingEditor } from "./MappingEditor";
import { defaultProfileFor, deviceKind } from "../../services/deviceSettings";
import { confirm } from "../../services/confirmService";
import { Dropdown } from "./Dropdown";

// ---------- helpers ----------

function flattenObject(obj: any, prefix = ""): Record<string, any> {
  const result: Record<string, any> = {};
  for (const key of Object.keys(obj)) {
    const value = obj[key];
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      Object.assign(result, flattenObject(value, path));
    } else {
      result[path] = value;
    }
  }
  return result;
}

function unflattenValue(path: string, value: any): any {
  const parts = path.split(".");
  const result: any = {};
  let current = result;
  for (let i = 0; i < parts.length - 1; i++) {
    current[parts[i]] = {};
    current = current[parts[i]];
  }
  current[parts[parts.length - 1]] = value;
  return result;
}

function isValueEqual(a: any, b: any) {
  if (Array.isArray(a) && Array.isArray(b)) {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return a === b;
}

function FieldLabel({
  path,
  description,
}: {
  path: string;
  description?: string;
}) {
  const leaf = (path.split(".").pop() || path)
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .trim();

  return (
    <div className="min-w-0">
      <span className="text-[11px] font-black uppercase tracking-widest text-white/70 leading-none">
        {leaf}
      </span>
      {description && (
        <p className="text-[10px] text-gray-600 mt-0.5 leading-tight">
          {description}
        </p>
      )}
    </div>
  );
}

// ---------- focusable header buttons ----------

// A button inside the modal focus layer. Renders a focus ring when targeted.
function ModalButton({
  id,
  onSelect,
  className,
  focusRing,
  disabled,
  initial,
  title,
  children,
}: {
  id: string;
  onSelect: () => void;
  className: string;
  focusRing: string;
  disabled?: boolean;
  initial?: boolean;
  title?: string;
  children: React.ReactNode;
}) {
  const { ref, focused } = useFocusable<HTMLButtonElement>(id, {
    layer: "modal",
    onSelect: () => {
      if (!disabled) onSelect();
    },
    initial,
  });
  return (
    <button
      ref={ref}
      onClick={onSelect}
      disabled={disabled}
      title={title}
      className={`${className} ${focused ? focusRing : ""}`}
    >
      {children}
    </button>
  );
}

// ---------- visual-only controls (operated via the focused row, or mouse) ----------

function ResetBtn({ onReset }: { onReset: () => void }) {
  return (
    <button
      onClick={onReset}
      data-tip="Reset to default"
      className="flex-shrink-0 text-yellow-400/50 hover:text-yellow-400 transition-colors p-2 -m-1"
    >
      <RotateCcw size={11} />
    </button>
  );
}

function ToggleVisual({
  value,
  isDefault,
  onToggle,
}: {
  value: boolean;
  isDefault: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className={`relative w-10 h-5 rounded-full transition-all duration-300 ${
        value ? "bg-indigo-500" : "bg-white/10"
      } ${!isDefault ? "ring-1 ring-yellow-400/40" : ""}`}
    >
      <span
        className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-lg transition-all duration-300 ${
          value ? "left-5" : "left-0.5"
        }`}
      />
    </button>
  );
}

function SliderVisual({
  value,
  max,
  step,
  isDefault,
  onCommit,
  onReset,
}: {
  value: number;
  max: number;
  step: number;
  isDefault: boolean;
  onCommit: (v: number) => void;
  onReset: () => void;
}) {
  const [localVal, setLocalVal] = useState<number | null>(null);
  const displayVal = localVal !== null ? localVal : value;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalVal(parseFloat(e.target.value));
  };
  const handleCommit = () => {
    if (localVal !== null) {
      onCommit(localVal);
      setLocalVal(null);
    }
  };

  const pct = Math.min(100, (displayVal / max) * 100);
  const accent = isDefault ? "bg-indigo-500" : "bg-yellow-400";
  const thumbBorder = isDefault
    ? "border-indigo-400/60 shadow-indigo-500/20"
    : "border-yellow-400/60 shadow-yellow-400/20";

  return (
    <div className="flex items-center gap-3">
      <div className="relative flex-1 py-2">
        <div className="relative h-1 bg-white/10 rounded-full">
          <div
            className={`absolute inset-y-0 left-0 rounded-full ${accent} transition-all`}
            style={{ width: `${pct}%` }}
          />
          <div
            className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-white border-2 shadow-lg cursor-pointer ${thumbBorder}`}
            style={{ left: `${pct}%` }}
          />
        </div>
        <input
          type="range"
          min={0}
          max={max}
          step={step}
          value={displayVal}
          onChange={handleChange}
          onMouseUp={handleCommit}
          onTouchEnd={handleCommit}
          className="absolute inset-0 w-full opacity-0 cursor-pointer"
        />
      </div>
      <span className="text-xs font-black w-10 text-right tabular-nums text-gray-500">
        {Number.isInteger(displayVal) ? displayVal : displayVal.toFixed(2)}
      </span>
      {!isDefault && <ResetBtn onReset={onReset} />}
    </div>
  );
}

function EditableArrayInput({
  value,
  isDefault,
  onCommit,
  onReset,
}: {
  value: string[];
  isDefault: boolean;
  onCommit: (v: string[]) => void;
  onReset: () => void;
}) {
  const [text, setText] = useState(value.join("\n"));

  const handleBlur = () => {
    const folders = text
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    onCommit(folders);
  };

  return (
    <div className="flex flex-col gap-2">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={handleBlur}
        rows={4}
        className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-white outline-none resize-y"
        placeholder="One folder path per line"
      />
      {!isDefault && <ResetBtn onReset={onReset} />}
    </div>
  );
}

// Editable text field for string settings (app names, launcher paths, …).
// Values that look like hex colors additionally get a native color picker.
function EditableStringInput({
  value,
  isDefault,
  onCommit,
  onReset,
}: {
  value: string;
  isDefault: boolean;
  onCommit: (v: string) => void;
  onReset: () => void;
}) {
  const [text, setText] = useState(value);

  // Keep in sync when the value changes from elsewhere (reset, other client)
  useEffect(() => setText(value), [value]);

  const commit = () => {
    if (text !== value) onCommit(text);
  };

  const isHexColor = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(text.trim());

  return (
    <div className="flex items-center gap-2">
      {isHexColor && (
        <input
          type="color"
          value={text.trim()}
          onChange={(e) => {
            setText(e.target.value);
            onCommit(e.target.value);
          }}
          className="w-8 h-8 rounded-lg border border-white/10 bg-transparent cursor-pointer flex-shrink-0"
          style={{ padding: 0 }}
        />
      )}
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.stopPropagation();
            commit();
            (e.target as HTMLInputElement).blur();
          }
        }}
        className="flex-1 min-w-0 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-white outline-none focus:border-indigo-500/40"
      />
      {!isDefault && <ResetBtn onReset={onReset} />}
    </div>
  );
}

// ---------- one whole setting = one focus target ----------

function SettingRow({
  path,
  value,
  defaultValue,
  description,
  initial,
  onUpdate,
  onReset,
}: {
  path: string;
  value: any;
  defaultValue: any;
  description?: string;
  initial?: boolean;
  onUpdate: (v: any) => void;
  onReset: () => void;
}) {
  // Runtime-added entries (e.g. dropped-in apps) have no default — treat
  // them as "default" so they don't show as modified and can't be reset.
  const isDefault =
    defaultValue === undefined ? true : isValueEqual(value, defaultValue);
  const isBoolean = typeof value === "boolean";
  const isNumber = typeof value === "number";
  const isString = typeof value === "string";

  const isVolume = path.toLowerCase().includes("volume");
  const isDeadzone = path.toLowerCase().includes("deadzone");
  const isIntensity = path.toLowerCase().includes("intensity");
  const isPercent = isVolume || isIntensity; // 0–100 sliders, whole steps
  const max = isPercent ? 100 : isDeadzone ? 1 : 1000;
  const step = isPercent ? 1 : 0.01;

  // A / Enter toggles a boolean setting.
  const onSelect = isBoolean ? () => onUpdate(!value) : undefined;

  // Left / right nudges a numeric setting (~5% of range, snapped to step).
  const onMove = isNumber
    ? (dir: "left" | "right" | "up" | "down") => {
        if (dir !== "left" && dir !== "right") return false;
        const delta = (dir === "right" ? 1 : -1) * Math.max(step, max / 20);
        let next = Math.min(max, Math.max(0, value + delta));
        next = step < 1 ? Math.round(next * 100) / 100 : Math.round(next);
        onUpdate(next);
        return true;
      }
    : undefined;

  const { ref, focused } = useFocusable<HTMLDivElement>(path, {
    layer: "modal",
    onSelect,
    onMove,
    initial,
  });

  const rowClass = `rounded-2xl px-4 py-3 border transition-all duration-200 ${
    focused
      ? "ring-2 ring-indigo-400 bg-white/[0.07] border-indigo-400/40 shadow-[0_0_24px_rgba(99,102,241,0.2)]"
      : !isDefault
        ? "bg-yellow-400/[0.04] border-yellow-400/15"
        : "bg-white/[0.02] border-transparent"
  }`;

  return (
    <div ref={ref} className={rowClass}>
      {isBoolean ? (
        <div className="flex items-center justify-between gap-4">
          <FieldLabel path={path} description={description} />
          <div className="flex items-center gap-2">
            <ToggleVisual
              value={value}
              isDefault={isDefault}
              onToggle={() => onUpdate(!value)}
            />
            {!isDefault && <ResetBtn onReset={onReset} />}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <FieldLabel path={path} description={description} />
          {isNumber ? (
            <SliderVisual
              value={value}
              max={max}
              step={step}
              isDefault={isDefault}
              onCommit={onUpdate}
              onReset={onReset}
            />
          ) : Array.isArray(value) ? (
            <EditableArrayInput
              value={value}
              isDefault={isDefault}
              onCommit={onUpdate}
              onReset={onReset}
            />
          ) : isString ? (
            <EditableStringInput
              value={value}
              isDefault={isDefault}
              onCommit={onUpdate}
              onReset={onReset}
            />
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-gray-500 break-all">
                {String(value)}
              </span>
              {!isDefault && <ResetBtn onReset={onReset} />}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------- component ----------

export const SettingsModal = React.memo(function SettingsModal({
  onClose,
  initialSearch,
}: {
  onClose: () => void;
  initialSearch?: string;
}) {
  const [settings, setSettings] = useState<Record<string, any> | null>(null);
  const [defaults, setDefaults] = useState<Record<string, any> | null>(null);
  const [descriptions, setDescriptions] = useState<Record<string, string>>({});
  const [search, setSearch] = useState(initialSearch || "");
  const [mappingFor, setMappingFor] = useState<{
    deviceId: string;
    label: string;
  } | null>(null);

  const { pushLayer, popLayer } = useFocus();

  // Trap navigation inside the modal; `back` triggers onClose. Runs
  // unconditionally so it stays above the early return below.
  useEffect(() => {
    pushLayer("modal", onClose);
    return () => popLayer("modal");
  }, [pushLayer, popLayer, onClose]);

  // Sync search term if parent changes it while modal is open
  useEffect(() => {
    if (initialSearch) setSearch(initialSearch);
  }, [initialSearch]);

  useEffect(() => {
    fetch("/api/settings")
      .then((res) => res.json())
      .then((data) => {
        setSettings(data);
        setDescriptions(data._descriptions || {});
      });
    fetch("/api/settings/defaults")
      .then((res) => res.json())
      .then((data) => setDefaults(data));
  }, []);

  if (!settings || !defaults) return null;

  const cleanSettings = { ...settings };
  delete cleanSettings._descriptions;
  delete cleanSettings.players;
  const flatCurrent = flattenObject(cleanSettings);
  const flatDefaults = flattenObject(defaults);

  // Union of default + current paths so runtime-added entries (apps dropped
  // onto the dashboard) show up here even though they have no default.
  // input.mappings.* are full control-mapping profiles — edited in the
  // MappingEditor (per-device Edit button), far too noisy as flat rows.
  const allPaths = Array.from(
    new Set([...Object.keys(flatDefaults), ...Object.keys(flatCurrent)]),
  ).filter(
    (path) => !path.startsWith("players") && !path.startsWith("input.mappings"),
  );

  const filteredPaths = allPaths.filter(
    (path) =>
      flatCurrent[path] !== undefined &&
      (path.toLowerCase().includes(search.toLowerCase()) ||
        (descriptions[path] || "")
          .toLowerCase()
          .includes(search.toLowerCase())),
  );

  const grouped: Record<string, string[]> = {};
  for (const path of filteredPaths) {
    const group = path.split(".")[0];
    if (!grouped[group]) grouped[group] = [];
    grouped[group].push(path);
  }

  const modifiedCount = allPaths.filter(
    (p) =>
      flatDefaults[p] !== undefined &&
      !isValueEqual(flatCurrent[p], flatDefaults[p]),
  ).length;

  // ---------- update / reset ----------

  const updateField = (path: string, value: any) => {
    const parts = path.split(".");
    const newSettings = JSON.parse(JSON.stringify(settings));
    let current = newSettings;
    for (let i = 0; i < parts.length - 1; i++) current = current[parts[i]];
    current[parts[parts.length - 1]] = value;
    setSettings(newSettings);

    fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(unflattenValue(path, value)),
    });
  };

  const resetField = (path: string) => updateField(path, flatDefaults[path]);

  // Delete an app entry (deep-merge PATCH can't remove keys → dedicated route).
  const deleteApp = (id: string) => {
    const label = settings?.apps?.[id]?.name || id;
    confirm({
      title: `Remove "${label}"?`,
      message: "This removes it from your library.",
      confirmText: "Remove",
      danger: true,
    }).then((ok) => {
      if (!ok) return;
      fetch(`/api/apps/${encodeURIComponent(id)}`, { method: "DELETE" })
        .then((r) => r.json())
        .then(() =>
          fetch("/api/settings")
            .then((r) => r.json())
            .then((data) => setSettings(data)),
        )
        .catch(() => {});
    });
  };

  const resetAll = () => {
    const payload: any = {};
    for (const path of allPaths) {
      if (!isValueEqual(flatCurrent[path], flatDefaults[path])) {
        const parts = path.split(".");
        let cur = payload;
        for (let i = 0; i < parts.length - 1; i++) {
          if (!cur[parts[i]]) cur[parts[i]] = {};
          cur = cur[parts[i]];
        }
        cur[parts[parts.length - 1]] = flatDefaults[path];
      }
    }
    fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then(() =>
      fetch("/api/settings")
        .then((r) => r.json())
        .then((data) => setSettings(data)),
    );
  };

  // ---------- UI ----------

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{
        background: "#00000072",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
      }}
    >
      <div
        className="relative w-full max-w-lg max-h-[82vh] flex flex-col rounded-3xl overflow-hidden"
        style={{
          background: "rgba(10, 10, 16, 0.97)",
          border: "1px solid rgba(255,255,255,0.07)",
          boxShadow:
            "0 0 90px rgba(99,102,241,0.14), 0 30px 60px rgba(0,0,0,0.7)",
        }}
      >
        <div
          className="absolute -top-20 left-1/2 -translate-x-1/2 w-72 h-40 rounded-full blur-3xl opacity-25 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse, rgba(99,102,241,1) 0%, transparent 70%)",
          }}
        />

        <div className="relative z-10 flex items-start justify-between px-6 pt-6 pb-4 border-b border-white/5">
          <div>
            <h2 className="text-2xl font-black italic uppercase tracking-tight text-white leading-none">
              Settings
            </h2>
            <p className="text-[10px] font-black uppercase tracking-widest mt-1">
              {modifiedCount > 0 ? (
                <span className="text-yellow-400/80">
                  {modifiedCount} modified
                </span>
              ) : (
                <span className="text-gray-600">All defaults</span>
              )}
            </p>
          </div>

          <div className="flex items-center gap-2 mt-0.5">
            <ModalButton
              id="modal-reset"
              onSelect={resetAll}
              disabled={modifiedCount === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all
    disabled:opacity-30 disabled:cursor-not-allowed
    bg-yellow-400/10 text-yellow-400 border-yellow-400/20 hover:bg-yellow-400/20"
              focusRing="ring-2 ring-yellow-400 scale-105"
            >
              <RotateCcw size={11} />
              Reset All
            </ModalButton>
            <ModalButton
              id="modal-close"
              onSelect={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-2xl bg-white/5 border border-white/8 text-gray-500 hover:text-white hover:bg-white/10 transition-all"
              focusRing="ring-2 ring-indigo-400 text-white bg-white/10 scale-105"
            >
              <X size={14} />
            </ModalButton>
          </div>
        </div>

        <div className="relative z-10 px-6 py-3 border-b border-white/5">
          <div className="relative">
            <input
              type="text"
              placeholder="Search settings..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-white/5 border border-white/8 rounded-2xl px-4 py-2.5 pr-10 text-sm text-white placeholder-gray-700 outline-none focus:border-indigo-500/40 focus:bg-white/[0.07] transition-all"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        <div className="relative z-10 flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {Object.entries(grouped).length === 0 && (
            <p className="text-[11px] font-black uppercase tracking-widest text-gray-600 text-center py-10">
              No settings match.
            </p>
          )}

          {Object.entries(grouped).map(([group, paths]) => {
            const header = (
              <div className="flex items-center gap-2.5 mb-3">
                <span className="px-2.5 py-0.5 bg-indigo-500/15 rounded-md text-[9px] font-black uppercase tracking-widest text-indigo-400">
                  {group}
                </span>
                <div className="flex-1 h-px bg-white/5" />
              </div>
            );

            // Apps get one card per app (name/launcher/color/icon grouped),
            // each with its own delete button.
            if (group === "apps") {
              const byApp: Record<string, string[]> = {};
              for (const p of paths) {
                const id = p.split(".")[1];
                (byApp[id] ||= []).push(p);
              }
              return (
                <div key={group}>
                  {header}
                  <div className="space-y-3">
                    {Object.entries(byApp).map(([id, appPaths]) => (
                      <div
                        key={id}
                        className="rounded-2xl border border-white/8 bg-white/[0.02] p-3"
                      >
                        <div className="flex items-center justify-between mb-1.5 px-1">
                          <span className="text-[11px] font-black uppercase tracking-widest text-white/80">
                            {settings.apps?.[id]?.name || id}
                          </span>
                          <button
                            onClick={() => deleteApp(id)}
                            data-tip="Delete app"
                            className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-red-400/70 hover:text-red-300 transition-colors"
                          >
                            <Trash2 size={12} /> Delete
                          </button>
                        </div>
                        <div className="space-y-1">
                          {appPaths.map((path) => (
                            <SettingRow
                              key={path}
                              path={path}
                              value={flatCurrent[path]}
                              defaultValue={flatDefaults[path]}
                              description={descriptions[path]}
                              initial={path === filteredPaths[0]}
                              onUpdate={(v) => updateField(path, v)}
                              onReset={() => resetField(path)}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                    {Object.keys(byApp).length === 0 && (
                      <p className="text-[10px] text-gray-600 italic px-1">
                        No apps yet — add them from the dashboard.
                      </p>
                    )}
                  </div>
                </div>
              );
            }

            // Input gets a Devices block: one card per detected device with a
            // mapping-profile dropdown + Edit (opens the MappingEditor), plus
            // its generic rows (enabled / deadzone).
            if (group === "input") {
              const generic = paths.filter(
                (p) => !p.startsWith("input.devices."),
              );
              const byDevice: Record<string, string[]> = {};
              for (const p of paths) {
                if (!p.startsWith("input.devices.")) continue;
                const id = p.split(".")[2];
                // .mapping is rendered as the dropdown below, not a text row.
                if (p.endsWith(".mapping")) continue;
                (byDevice[id] ||= []).push(p);
              }
              const mappingNames = Object.keys(settings.input?.mappings || {});
              const deviceLabel = (id: string) =>
                id === "keyboard1"
                  ? "Keyboard 1"
                  : id === "keyboard2"
                    ? "Keyboard 2"
                    : id.startsWith("gamepad-")
                      ? `Controller ${(parseInt(id.split("-")[1], 10) || 0) + 1}`
                      : id;
              return (
                <div key={group}>
                  {header}
                  <div className="space-y-1">
                    {generic.map((path) => (
                      <SettingRow
                        key={path}
                        path={path}
                        value={flatCurrent[path]}
                        defaultValue={flatDefaults[path]}
                        description={descriptions[path]}
                        initial={path === filteredPaths[0]}
                        onUpdate={(v) => updateField(path, v)}
                        onReset={() => resetField(path)}
                      />
                    ))}
                  </div>
                  {Object.keys(byDevice).length > 0 && (
                    <div className="mt-3 space-y-3">
                      {Object.entries(byDevice).map(([id, devPaths]) => {
                        const kind = deviceKind(id);
                        const assigned =
                          settings.input?.devices?.[id]?.mapping ||
                          defaultProfileFor(id);
                        const options = mappingNames.filter(
                          (n) => settings.input?.mappings?.[n]?.type === kind,
                        );
                        return (
                          <div
                            key={id}
                            className="rounded-2xl border border-white/8 bg-white/[0.02] p-3"
                          >
                            <div className="flex items-center justify-between gap-2 mb-1.5 px-1">
                              <span className="text-[11px] font-black uppercase tracking-widest text-white/80">
                                {deviceLabel(id)}
                                <span className="ml-2 text-gray-600">
                                  {kind}
                                </span>
                              </span>
                              <div className="flex items-center gap-1.5">
                                <Dropdown
                                  title="Control mapping"
                                  value={assigned}
                                  onChange={(v) =>
                                    updateField(
                                      `input.devices.${id}.mapping`,
                                      v,
                                    )
                                  }
                                  options={(options.includes(assigned)
                                    ? options
                                    : [assigned, ...options]
                                  ).map((n) => ({ value: n, label: n }))}
                                  className="inline-flex items-center justify-between gap-1.5 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-[11px] font-bold text-indigo-200 hover:bg-white/10 max-w-[130px]"
                                />
                                <button
                                  onClick={() =>
                                    setMappingFor({
                                      deviceId: id,
                                      label: deviceLabel(id),
                                    })
                                  }
                                  data-tip="Edit this device's controls"
                                  className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-gray-400 hover:text-white transition-colors"
                                >
                                  <Pencil size={11} /> Edit
                                </button>
                              </div>
                            </div>
                            <div className="space-y-1">
                              {devPaths.map((path) => (
                                <SettingRow
                                  key={path}
                                  path={path}
                                  value={flatCurrent[path]}
                                  defaultValue={flatDefaults[path]}
                                  description={descriptions[path]}
                                  initial={path === filteredPaths[0]}
                                  onUpdate={(v) => updateField(path, v)}
                                  onReset={() => resetField(path)}
                                />
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }

            return (
              <div key={group}>
                {header}
                <div className="space-y-1">
                  {paths.map((path) => (
                    <SettingRow
                      key={path}
                      path={path}
                      value={flatCurrent[path]}
                      defaultValue={flatDefaults[path]}
                      description={descriptions[path]}
                      initial={path === filteredPaths[0]}
                      onUpdate={(v) => updateField(path, v)}
                      onReset={() => resetField(path)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {mappingFor && (
        <MappingEditor
          deviceId={mappingFor.deviceId}
          label={mappingFor.label}
          onClose={() => {
            setMappingFor(null);
            // The editor saved new mappings/assignments — refresh our copy.
            fetch("/api/settings")
              .then((r) => r.json())
              .then((data) => setSettings(data))
              .catch(() => {});
          }}
        />
      )}
    </div>
  );
});
