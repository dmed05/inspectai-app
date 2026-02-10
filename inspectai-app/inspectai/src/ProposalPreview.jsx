// src/ProposalPreview.jsx
import { useEffect, useMemo, useState } from "react";
import iconInspectAI from "./assets/icon-inspectai.svg";
import {
  DRAFT_KEY,
  DEFAULT_RATES,
  computeTotals,
  readDraft,
  writeDraft,
  safeNum,
  applyDefaults,
  normalizeRepairs,
  normalizeAdditionalItems,
} from "./proposalDraft";

// Open preview in a new tab
export function openProposalPreview(draft) {
  writeDraft(draft || {});
  window.open("/proposal-preview", "_blank", "noopener,noreferrer");
}

function money(v) {
  const x = Number(v);
  if (!Number.isFinite(x)) return "$";
  return x.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function formatDateMMDDYY(d = new Date()) {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  return `${mm}/${dd}/${yy}`;
}

const FREQUENCY_OPTIONS = ["Monthly", "Quarterly", "Semi-annually", "Annually"];

// Theme-matching frequency dropdown
function FrequencySelect({ value, onChange, className = "", ...props }) {
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      className={
        "w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40 [&>option]:bg-gray-900 " +
        className
      }
      {...props}
    >
      <option value="">Select frequency</option>
      {FREQUENCY_OPTIONS.map((opt) => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
    </select>
  );
}

// Theme-matching input (same as App.jsx)
function ThemedInput({ className = "", ...props }) {
  return (
    <input
      {...props}
      className={
        "w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500/40 " +
        className
      }
    />
  );
}

// Theme-matching editable box (dark scheme like App)
function EditablePaperBox({
  isEditing,
  value,
  onChange,
  type = "text",
  alignRight = false,
  placeholder = "",
  step,
}) {
  return (
    <div
      className={
        "rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white " +
        (alignRight ? "text-right" : "")
      }
    >
      {isEditing ? (
        <input
          type={type}
          step={step}
          value={value ?? ""}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={
            "w-full bg-transparent outline-none text-white placeholder:text-white/40 " +
            (alignRight ? "text-right" : "")
          }
        />
      ) : (
        <span className="text-white/90">
          {String(value ?? "").trim() ? value : placeholder || "—"}
        </span>
      )}
    </div>
  );
}

function Divider() {
  return <div className="h-[1px] w-full bg-white/10" />;
}

function FieldGroup({ label, helper, children }) {
  return (
    <div>
      <div className="mb-2 text-sm font-semibold text-white/90">{label}</div>
      {children}
      {helper ? (
        <div className="mt-2 text-xs text-white/50">{helper}</div>
      ) : null}
    </div>
  );
}

function DisplayField({ value, align = "right" }) {
  return (
    <div
      className={
        "rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white/90 " +
        (align === "left" ? "text-left" : "text-right")
      }
    >
      {value}
    </div>
  );
}

function Paper({ children }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-white shadow-[0_4px_20px_rgba(0,0,0,0.4)]">
      <div className="rounded-xl border border-white/10 p-5">{children}</div>
    </div>
  );
}

function HeaderCell({ children, className = "" }) {
  return (
    <div className={`px-3 py-2 text-xs font-semibold text-white/90 ${className}`}>
      {children}
    </div>
  );
}

function BodyCell({ children, className = "" }) {
  return (
    <div className={`px-3 py-3 text-sm text-white/85 ${className}`}>
      {children}
    </div>
  );
}

export default function ProposalPreviewPage() {
  const [draft, setDraft] = useState(() => {
    const d = readDraft();
    return { ...d, proposalDate: d.proposalDate || formatDateMMDDYY() };
  });

  const [isEditing, setIsEditing] = useState(false);
  const [editDraft, setEditDraft] = useState(draft);
  const [activeTab, setActiveTab] = useState("config");

  useEffect(() => {
    if (!isEditing) setEditDraft(draft);
  }, [draft, isEditing]);

  useEffect(() => {
    function onStorage(e) {
      if (e.key !== DRAFT_KEY) return;
      try {
        const incoming = e.newValue ? JSON.parse(e.newValue) : {};
        const inc = applyDefaults(incoming || {});
        setDraft({
          ...inc,
          proposalDate: inc.proposalDate || formatDateMMDDYY(),
        });
      } catch {
        setDraft((prev) => ({
          ...prev,
          proposalDate: formatDateMMDDYY(),
        }));
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const active = isEditing ? editDraft : draft;
  const totals = useMemo(() => computeTotals(active), [active]);

  function startEdit() {
    setEditDraft(active);
    setIsEditing(true);
  }
  function cancelEdit() {
    setEditDraft(readDraft());
    setIsEditing(false);
  }
  function saveEdit() {
    writeDraft(editDraft);
    setDraft(editDraft);
    setIsEditing(false);
  }

  const set = (key) => (val) => setEditDraft((p) => ({ ...p, [key]: val }));

  const repairs = normalizeRepairs(active);
  const addRepair = () => {
    setEditDraft((p) => ({
      ...p,
      repairs: [...normalizeRepairs(p), { description: "", amount: 0 }],
    }));
  };
  const updateRepair = (idx, field, value) => {
    setEditDraft((p) => {
      const list = [...normalizeRepairs(p)];
      list[idx] = { ...list[idx], [field]: field === "amount" ? value : String(value) };
      return { ...p, repairs: list };
    });
  };
  const removeRepair = (idx) => {
    setEditDraft((p) => {
      const list = normalizeRepairs(p).filter((_, i) => i !== idx);
      return { ...p, repairs: list.length ? list : [{ description: "", amount: 0 }] };
    });
  };

  const additionalItems = normalizeAdditionalItems(active);
  const addAdditionalItem = () => {
    setEditDraft((p) => ({
      ...p,
      additionalItems: [
        ...normalizeAdditionalItems(p),
        { description: "Additional Hood", qty: 0, rate: DEFAULT_RATES.additionalHoodRate, frequency: active.cleaningFrequency ?? "" },
      ],
    }));
  };
  const updateAdditionalItem = (idx, field, value) => {
    setEditDraft((p) => {
      const list = [...normalizeAdditionalItems(p)];
      const v = field === "qty" || field === "rate" ? (Number(value) || 0) : String(value);
      list[idx] = { ...list[idx], [field]: v };
      return { ...p, additionalItems: list };
    });
  };
  const removeAdditionalItem = (idx) => {
    setEditDraft((p) => {
      const list = normalizeAdditionalItems(p).filter((_, i) => i !== idx);
      return { ...p, additionalItems: list.length ? list : [{ description: "Additional Hood", qty: 0, rate: DEFAULT_RATES.additionalHoodRate, frequency: active.cleaningFrequency ?? "" }] };
    });
  };

  const allFrequencies = useMemo(() => {
    const set = new Set();
    const add = (f) => f && String(f).trim() && set.add(String(f).trim());
    add(active.cleaningFrequency);
    additionalItems.forEach((a) => add(a.frequency));
    add(active.filterExchangeFrequency);
    add(active.fuelFrequency || active.cleaningFrequency);
    return [...set].filter(Boolean).join(" & ") || "—";
  }, [active, additionalItems]);

  function copyProposalToClipboard() {
    const row = (desc, amt) => `${desc}\t${amt}`;
    const lines = [
      "PROPOSAL",
      "",
      `Restaurant: ${active.restaurantName || "—"}`,
      `Proposal Date: ${active.proposalDate || "—"}`,
      `Cleaning Frequency: ${allFrequencies}`,
      "",
      row("Description", "Amount"),
      "—".repeat(40),
    ];
    const baseDesc = `Base rate — Initial hood: 1, Initial fan: 1${active.cleaningFrequency ? ` (${active.cleaningFrequency})` : ""}`;
    lines.push(row(baseDesc, money(active.baseRate)));
    additionalItems
      .filter((item) => (item.qty || 0) * (item.rate || 0) > 0)
      .forEach((item) => {
        const lineTotal = (item.qty || 0) * (item.rate || 0);
        const desc = item.description || "—";
        const detail = `${item.qty ?? 0} × ${money(item.rate)}${item.frequency ? ` (${item.frequency})` : ""}`;
        lines.push(row(`${desc} — ${detail}`, money(lineTotal)));
      });
    const stdFilterTotal = safeNum(active.stdFilterQty) * safeNum(active.stdFilterRate);
    if (stdFilterTotal > 0) {
      lines.push(row(`Standard Filters — ${active.stdFilterQty ?? 0} × ${money(active.stdFilterRate)}${active.filterExchangeFrequency ? ` (${active.filterExchangeFrequency})` : ""}`, money(stdFilterTotal)));
    }
    const nonStdFilterTotal = safeNum(active.nonStdFilterQty) * safeNum(active.nonStdFilterRate);
    if (nonStdFilterTotal > 0) {
      lines.push(row(`Non-Standard Filters — ${active.nonStdFilterQty ?? 0} × ${money(active.nonStdFilterRate)}`, money(nonStdFilterTotal)));
    }
    repairs.filter((r) => (r.description || r.amount) && Number(r.amount) > 0).forEach((r) => {
      lines.push(row(r.description || "—", money(r.amount)));
    });
    if (totals.fuelSubtotal > 0) {
      lines.push(row(`Fuel surcharge${active.fuelFrequency || active.cleaningFrequency ? ` (${active.fuelFrequency || active.cleaningFrequency})` : ""}`, money(totals.fuelSubtotal)));
    }
    lines.push("", "—".repeat(40));
    lines.push(row("Total Per Service", money(totals.totalPerService)));
    const text = lines.join("\r\n");
    navigator.clipboard.writeText(text).catch(() => {});
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a1020] via-[#070b14] to-black text-white">
      <header className="border-b border-white/10 bg-black/40 backdrop-blur">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img
              src={iconInspectAI}
              alt=""
              className="h-8 w-8 object-contain"
              aria-hidden
            />
            <div>
              <h1 className="text-xl font-bold">InspectAI</h1>
              <p className="text-xs text-white/50">Proposal Draft Preview</p>
            </div>
          </div>

          {isEditing && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={cancelEdit}
                className="text-sm px-3 py-1.5 rounded-lg border border-white/20 bg-white/5 hover:bg-white/10 text-white/90 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveEdit}
                className="text-sm px-3 py-1.5 rounded-lg bg-blue-500 hover:bg-blue-400 text-black font-semibold transition"
              >
                Save
              </button>
            </div>
          )}
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 pt-6">
        {/* Tabs - match App ghost button style */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("config")}
            className={`text-sm px-4 py-2 rounded-lg transition ${
              activeTab === "config"
                ? "border border-white/20 bg-white/10 text-white"
                : "border border-white/20 bg-white/5 hover:bg-white/10 text-white/90"
            }`}
          >
            Pricing & Services
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("preview")}
            className={`text-sm px-4 py-2 rounded-lg transition ${
              activeTab === "preview"
                ? "border border-white/20 bg-white/10 text-white"
                : "border border-white/20 bg-white/5 hover:bg-white/10 text-white/90"
            }`}
          >
            Proposal Preview
          </button>
          {activeTab === "preview" && (
            <button
              type="button"
              onClick={copyProposalToClipboard}
              className="text-sm px-4 py-2 rounded-lg border border-white/20 bg-white/5 hover:bg-white/10 text-white/90 transition"
            >
              Copy
            </button>
          )}
          {activeTab === "config" && !isEditing && (
            <button
              type="button"
              onClick={startEdit}
              className="text-sm px-4 py-2 rounded-lg border border-white/20 bg-white/5 hover:bg-white/10 text-white/90 transition"
            >
              Edit
            </button>
          )}
        </div>
      </div>

      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="space-y-6">
          {activeTab === "config" && (
          <Paper>
            <div className="space-y-6">
              {/* Top: Restaurant Name | Proposal Date */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FieldGroup label="Restaurant Name">
                  <EditablePaperBox
                    isEditing={isEditing}
                    value={active.restaurantName}
                    onChange={set("restaurantName")}
                    placeholder="—"
                  />
                </FieldGroup>
                <FieldGroup label="Proposal Date">
                  <EditablePaperBox
                    isEditing={isEditing}
                    value={active.proposalDate}
                    onChange={set("proposalDate")}
                    placeholder="MM/DD/YY"
                    alignRight
                  />
                </FieldGroup>
              </div>

              <Divider />

              {/* Cleaning Frequency */}
              <FieldGroup label="Cleaning Frequency">
                {isEditing ? (
                  <FrequencySelect
                    value={active.cleaningFrequency ?? ""}
                    onChange={set("cleaningFrequency")}
                  />
                ) : (
                  <DisplayField value={active.cleaningFrequency || "—"} />
                )}
              </FieldGroup>

              <Divider />

              {/* Initial Service & Base Rate */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <FieldGroup label="Initial Hood" helper="Base rate included (first hood)">
                  <DisplayField value={1} />
                </FieldGroup>
                <FieldGroup label="Initial Fan" helper="Base rate included (first fan)">
                  <DisplayField value={1} />
                </FieldGroup>
                <FieldGroup label="Base Rate" helper="Per service">
                  {isEditing ? (
                    <SmallPaperBox
                      value={editDraft.baseRate ?? ""}
                      isEditing
                      onChange={set("baseRate")}
                      type="number"
                      step="0.01"
                    />
                  ) : (
                    <DisplayField value={money(active.baseRate)} />
                  )}
                </FieldGroup>
              </div>

              {/* Additional Hoods & Fans */}
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div className="text-sm font-semibold text-white/95">
                  Additional Hoods & Fans
                </div>
                {isEditing && (
                  <button
                    type="button"
                    onClick={addAdditionalItem}
                    className="text-sm px-3 py-1.5 rounded-lg border border-white/20 bg-white/5 hover:bg-white/10 text-white/90 shrink-0"
                  >
                    + Add Item
                  </button>
                )}
              </div>
              <div className="space-y-4">
                {additionalItems.map((item, idx) => {
                  const lineTotal = (item.qty || 0) * (item.rate || 0);
                  return (
                    <div key={idx} className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                      <FieldGroup label="Description" helper="Each per service">
                        {isEditing ? (
                          <input
                            type="text"
                            value={item.description}
                            onChange={(e) => updateAdditionalItem(idx, "description", e.target.value)}
                            placeholder="e.g. Additional Hood"
                            autoComplete="off"
                            className="w-full min-h-[44px] rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-left text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500/40 leading-relaxed"
                          />
                        ) : (
                          <DisplayField value={item.description || "—"} align="left" />
                        )}
                      </FieldGroup>
                      <FieldGroup label="Qty">
                        {isEditing ? (
                          <div className="flex gap-2 items-stretch">
                            <SmallPaperBox
                              value={item.qty === 0 ? "" : String(item.qty)}
                              isEditing
                              onChange={(v) => updateAdditionalItem(idx, "qty", Number(v) || 0)}
                              type="number"
                              className="flex-1 min-w-0"
                            />
                            <button
                              type="button"
                              onClick={() => removeAdditionalItem(idx)}
                              className="px-3 rounded-lg border border-white/20 bg-white/5 hover:bg-red-500/20 text-white/90 shrink-0"
                              title="Remove item"
                            >
                              ×
                            </button>
                          </div>
                        ) : (
                          <DisplayField value={item.qty} align="left" />
                        )}
                      </FieldGroup>
                      <FieldGroup label="Rate">
                        {isEditing ? (
                          <SmallPaperBox
                            value={item.rate === 0 ? "" : String(item.rate)}
                            isEditing
                            onChange={(v) => updateAdditionalItem(idx, "rate", Number(v) || 0)}
                            type="number"
                            step="0.01"
                            className="flex-1 min-w-0"
                          />
                        ) : (
                          <DisplayField value={money(item.rate)} />
                        )}
                      </FieldGroup>
                      <FieldGroup label="Total">
                        <DisplayField value={money(lineTotal)} />
                        <div className="mt-2">
                          {isEditing ? (
                            <FrequencySelect
                              value={item.frequency ?? active.cleaningFrequency ?? ""}
                              onChange={(v) => updateAdditionalItem(idx, "frequency", v)}
                            />
                          ) : (
                            <DisplayField
                              value={item.frequency ?? active.cleaningFrequency ?? "—"}
                              align="left"
                            />
                          )}
                        </div>
                      </FieldGroup>
                    </div>
                  );
                })}
              </div>

              <Divider />

              {/* Filter Exchange Service */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <FieldGroup label="Standard Filters" helper="Each per service">
                  <div className="flex gap-2">
                    <SmallPaperBox
                      value={active.stdFilterQty ?? ""}
                      isEditing={isEditing}
                      onChange={set("stdFilterQty")}
                      type="number"
                      className="flex-1 min-w-0"
                    />
                    <SmallPaperBox
                      value={
                        isEditing
                          ? editDraft.stdFilterRate ?? ""
                          : money(active.stdFilterRate)
                      }
                      isEditing={isEditing}
                      onChange={set("stdFilterRate")}
                      type="number"
                      step="0.01"
                      displayMoney={!isEditing}
                      className="flex-1 min-w-0"
                    />
                  </div>
                </FieldGroup>
                <FieldGroup label="Non-Standard Filters" helper="Each per service">
                  <div className="flex gap-2">
                    <SmallPaperBox
                      value={active.nonStdFilterQty ?? ""}
                      isEditing={isEditing}
                      onChange={set("nonStdFilterQty")}
                      type="number"
                      className="flex-1 min-w-0"
                    />
                    <SmallPaperBox
                      value={
                        isEditing
                          ? editDraft.nonStdFilterRate ?? ""
                          : money(active.nonStdFilterRate)
                      }
                      isEditing={isEditing}
                      onChange={set("nonStdFilterRate")}
                      type="number"
                      step="0.01"
                      displayMoney={!isEditing}
                      className="flex-1 min-w-0"
                    />
                  </div>
                </FieldGroup>
                <FieldGroup label="Filter Total">
                  <DisplayField value={money(totals.filtersSubtotal)} />
                  <div className="mt-2">
                    {isEditing ? (
                      <FrequencySelect
                        value={active.filterExchangeFrequency ?? ""}
                        onChange={set("filterExchangeFrequency")}
                      />
                    ) : (
                      <DisplayField
                        value={active.filterExchangeFrequency ?? "—"}
                        align="left"
                      />
                    )}
                  </div>
                </FieldGroup>
              </div>

              <FieldGroup label="Filter details notes">
                {isEditing ? (
                  <textarea
                    value={active.filterDetailsNotes ?? ""}
                    onChange={(e) => set("filterDetailsNotes")(e.target.value)}
                    placeholder="Enter notes for filter details…"
                    rows={3}
                    className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500/40 leading-relaxed resize-y min-h-[80px]"
                  />
                ) : (
                  <DisplayField
                    value={active.filterDetailsNotes?.trim() || "—"}
                    align="left"
                  />
                )}
              </FieldGroup>

              <Divider />

              {/* Custom Repairs (One-time charge) */}
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div className="text-sm font-semibold text-white/95">
                  Custom Repairs (One-time charge)
                </div>
                {isEditing && (
                  <button
                    type="button"
                    onClick={addRepair}
                    className="text-sm px-3 py-1.5 rounded-lg border border-white/20 bg-white/5 hover:bg-white/10 text-white/90 shrink-0"
                  >
                    + Add Repair
                  </button>
                )}
              </div>
              <div className="space-y-4">
                {repairs.map((repair, idx) => (
                  <div key={idx} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FieldGroup label="Description">
                      {isEditing ? (
                        <input
                          type="text"
                          value={repair.description}
                          onChange={(e) => updateRepair(idx, "description", e.target.value)}
                          placeholder="—"
                          autoComplete="off"
                          spellCheck="true"
                          className="w-full min-h-[44px] rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-left text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500/40 leading-relaxed"
                        />
                      ) : (
                        <DisplayField value={repair.description || "—"} align="left" />
                      )}
                    </FieldGroup>
                    <FieldGroup label="Amount">
                      {isEditing ? (
                        <div className="flex gap-2 items-stretch">
                          <SmallPaperBox
                            value={repair.amount === 0 ? "" : String(repair.amount)}
                            isEditing
                            onChange={(v) => updateRepair(idx, "amount", Number(v) || 0)}
                            type="number"
                            step="0.01"
                            className="flex-1 min-w-0"
                          />
                          <button
                            type="button"
                            onClick={() => removeRepair(idx)}
                            className="px-3 rounded-lg border border-white/20 bg-white/5 hover:bg-red-500/20 text-white/90 shrink-0"
                            title="Remove repair"
                          >
                            ×
                          </button>
                        </div>
                      ) : (
                        <DisplayField value={money(repair.amount)} />
                      )}
                    </FieldGroup>
                  </div>
                ))}
                <div className="pt-2 flex justify-end">
                  <div className="w-full sm:w-1/2">
                    <FieldGroup label="Repairs Total">
                      <DisplayField value={money(totals.repairsSubtotal)} />
                    </FieldGroup>
                  </div>
                </div>
              </div>

              <Divider />

              {/* Fuel Surcharge */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <FieldGroup label="Fuel Surcharge" helper="$ each per service">
                  <SmallPaperBox
                    value={
                      isEditing ? editDraft.fuelSurcharge ?? "" : money(active.fuelSurcharge)
                    }
                    isEditing={isEditing}
                    onChange={set("fuelSurcharge")}
                    type="number"
                    step="0.01"
                    displayMoney={!isEditing}
                  />
                </FieldGroup>
                <FieldGroup label="Frequency" helper="Matches main service">
                  {isEditing ? (
                    <FrequencySelect
                      value={active.fuelFrequency ?? active.cleaningFrequency ?? ""}
                      onChange={set("fuelFrequency")}
                    />
                  ) : (
                    <DisplayField value={active.fuelFrequency ?? active.cleaningFrequency ?? "—"} />
                  )}
                </FieldGroup>
                <FieldGroup label="Fuel Total">
                  <DisplayField value={money(totals.fuelSubtotal)} />
                </FieldGroup>
              </div>
            </div>
          </Paper>
          )}

          {activeTab === "preview" && (
          <Paper>
            <div className="space-y-6">
              {/* Proposal Header */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pb-4 border-b border-white/10">
                <div>
                  <div className="text-xs text-white/50 mb-1">Restaurant</div>
                  <div className="text-lg font-semibold text-white/95">
                    {active.restaurantName || "—"}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-white/50 mb-1">Proposal Date</div>
                  <div className="text-lg font-semibold text-white/95">
                    {active.proposalDate || "—"}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-white/50 mb-1">Cleaning Frequency</div>
                  <div className="text-lg font-semibold text-white/95">
                    {allFrequencies}
                  </div>
                </div>
              </div>

              {/* Single table: Description | Amount (matches Custom Repairs layout) */}
              <div className="overflow-x-auto rounded-xl border border-white/10">
                <table className="w-full min-w-[360px] text-sm">
                  <thead>
                    <tr className="border-b border-white/10 bg-black/20">
                      <th className="text-left px-4 py-3 text-white/90 font-semibold">Description</th>
                      <th className="text-right px-4 py-3 text-white/90 font-semibold w-32">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-white/10">
                      <td className="px-4 py-3 text-white/85">
                        Base rate — Initial hood: 1, Initial fan: 1
                        {active.cleaningFrequency ? ` (${active.cleaningFrequency})` : ""}
                      </td>
                      <td className="px-4 py-3 text-right text-white/90 font-medium">{money(active.baseRate)}</td>
                    </tr>
                    {additionalItems
                      .map((item) => ({
                        item,
                        lineTotal: (item.qty || 0) * (item.rate || 0),
                      }))
                      .filter(({ lineTotal }) => lineTotal > 0)
                      .map(({ item, lineTotal }, idx) => {
                        const desc = item.description || "—";
                        const detail = `${item.qty ?? 0} × ${money(item.rate)}${item.frequency ? ` (${item.frequency})` : ""}`;
                        return (
                          <tr key={idx} className="border-b border-white/10">
                            <td className="px-4 py-3 text-white/85">{desc} — {detail}</td>
                            <td className="px-4 py-3 text-right text-white/90 font-medium">{money(lineTotal)}</td>
                          </tr>
                        );
                      })}
                    {safeNum(active.stdFilterQty) * safeNum(active.stdFilterRate) > 0 && (
                      <tr className="border-b border-white/10">
                        <td className="px-4 py-3 text-white/85">
                          Standard Filters — {active.stdFilterQty ?? 0} × {money(active.stdFilterRate)}
                          {active.filterExchangeFrequency ? ` (${active.filterExchangeFrequency})` : ""}
                        </td>
                        <td className="px-4 py-3 text-right text-white/90 font-medium">
                          {money(safeNum(active.stdFilterQty) * safeNum(active.stdFilterRate))}
                        </td>
                      </tr>
                    )}
                    {safeNum(active.nonStdFilterQty) * safeNum(active.nonStdFilterRate) > 0 && (
                      <tr className="border-b border-white/10">
                        <td className="px-4 py-3 text-white/85">
                          Non-Standard Filters — {active.nonStdFilterQty ?? 0} × {money(active.nonStdFilterRate)}
                        </td>
                        <td className="px-4 py-3 text-right text-white/90 font-medium">
                          {money(safeNum(active.nonStdFilterQty) * safeNum(active.nonStdFilterRate))}
                        </td>
                      </tr>
                    )}
                    {repairs.filter((r) => (r.description || r.amount) && Number(r.amount) > 0).map((repair, idx) => (
                      <tr key={idx} className="border-b border-white/10">
                        <td className="px-4 py-3 text-white/85">{repair.description || "—"}</td>
                        <td className="px-4 py-3 text-right text-white/90 font-medium">{money(repair.amount)}</td>
                      </tr>
                    ))}
                    {totals.fuelSubtotal > 0 && (
                      <tr>
                        <td className="px-4 py-3 text-white/85">
                          Fuel surcharge{active.fuelFrequency || active.cleaningFrequency ? ` (${active.fuelFrequency || active.cleaningFrequency})` : ""}
                        </td>
                        <td className="px-4 py-3 text-right text-white/90 font-medium">{money(totals.fuelSubtotal)}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Total Per Service */}
              <div className="pt-4 border-t border-white/10">
                <div className="flex justify-between items-center">
                  <div className="text-base font-semibold text-white/95">
                    Total Per Service
                  </div>
                  <div className="text-xl font-bold text-white">
                    {money(totals.totalPerService)}
                  </div>
                </div>
              </div>
            </div>
          </Paper>
          )}
        </div>
      </main>

      <style>{`
        @media print {
          body { background: white !important; }
          header { display: none !important; }
        }
      `}</style>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div>
      <div className="text-sm font-semibold text-white/95">{title}</div>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function SmallPaperBox({
  label,
  value,
  isEditing,
  onChange,
  type = "text",
  step,
  min,
  note,
  displayMoney = false,
  className = "",
}) {
  return (
    <div className={className}>
      {label ? (
        <div className="mb-2 text-xs font-semibold text-white/70">{label}</div>
      ) : null}
      <div className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white">
        {isEditing ? (
          <input
            type={type}
            step={step}
            min={min}
            value={value ?? ""}
            onChange={(e) => onChange?.(e.target.value)}
            className="w-full bg-transparent outline-none text-white placeholder:text-white/40"
          />
        ) : (
          <span className="text-white/90">
            {displayMoney ? value : String(value ?? "").trim() ? value : "—"}
          </span>
        )}
      </div>
      {note ? (
        <div className="mt-1 text-[11px] text-white/50">{note}</div>
      ) : null}
    </div>
  );
}

function MiniPaperBox({
  label,
  value,
  isEditing,
  onChange,
  type = "text",
  step,
  displayMoney = false,
}) {
  return (
    <div>
      <div className="mb-2 text-xs font-semibold text-white/70">{label}</div>
      <div className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white">
        {isEditing ? (
          <input
            type={type}
            step={step}
            value={value ?? ""}
            onChange={(e) => onChange?.(e.target.value)}
            className="w-full bg-transparent outline-none text-white placeholder:text-white/40"
          />
        ) : (
          <span className="text-white/90">
            {displayMoney ? value : String(value ?? "").trim() ? value : "—"}
          </span>
        )}
      </div>
    </div>
  );
}
