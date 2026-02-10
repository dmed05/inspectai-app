// src/proposalDraft.js
export const DRAFT_KEY = "inspectai_proposal_draft";

/** Default unit rates used when not specified */
export const DEFAULT_RATES = {
  baseRate: 723,
  additionalHoodRate: 203,
  additionalFanRate: 203,
  stdFilterRate: 8,
  nonStdFilterRate: 13.5,
  fuelSurcharge: 46,
};

export function safeNum(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

/** Normalize additional items (hoods/fans) to array of { description, qty, rate, frequency } */
export function normalizeAdditionalItems(draft) {
  const defaultFreq = draft?.cleaningFrequency || "";
  if (Array.isArray(draft.additionalItems) && draft.additionalItems.length > 0) {
    return draft.additionalItems.map((a) => ({
      description: String(a?.description ?? ""),
      qty: safeNum(a?.qty),
      rate: orDefault(a?.rate, DEFAULT_RATES.additionalHoodRate),
      frequency: String(a?.frequency ?? defaultFreq).trim() || defaultFreq,
    }));
  }
  const items = [];
  if (draft.additionalHoodQty != null || draft.additionalHoodRate != null) {
    items.push({
      description: "Additional Hood",
      qty: safeNum(draft.additionalHoodQty),
      rate: orDefault(draft.additionalHoodRate, DEFAULT_RATES.additionalHoodRate),
      frequency: draft.additionalFrequency || draft.cleaningFrequency || defaultFreq,
    });
  }
  if (draft.additionalFanQty != null || draft.additionalFanRate != null) {
    items.push({
      description: "Additional Fan",
      qty: safeNum(draft.additionalFanQty),
      rate: orDefault(draft.additionalFanRate, DEFAULT_RATES.additionalFanRate),
      frequency: draft.additionalFrequency || draft.cleaningFrequency || defaultFreq,
    });
  }
  if (items.length > 0) return items;
  return [{ description: "Additional Hood", qty: 0, rate: DEFAULT_RATES.additionalHoodRate, frequency: defaultFreq }];
}

function orDefault(val, def) {
  const n = Number(val);
  return Number.isFinite(n) ? n : def;
}

/** Normalize repairs to array of { description, amount } */
export function normalizeRepairs(draft) {
  if (Array.isArray(draft.repairs) && draft.repairs.length > 0) {
    return draft.repairs.map((r) => ({
      description: String(r?.description ?? ""),
      amount: safeNum(r?.amount),
    }));
  }
  if (draft.repairDescription != null || draft.repairRate != null) {
    return [
      {
        description: String(draft.repairDescription ?? ""),
        amount: safeNum(draft.repairRate),
      },
    ];
  }
  return [{ description: "", amount: 0 }];
}

/** Apply default rates to a draft when values are missing */
export function applyDefaults(draft) {
  if (!draft || typeof draft !== "object") return { ...DEFAULT_RATES };
  const d = { ...draft };
  if (d.baseRate == null || d.baseRate === "")
    d.baseRate = DEFAULT_RATES.baseRate;
  if (d.additionalHoodRate == null || d.additionalHoodRate === "")
    d.additionalHoodRate = DEFAULT_RATES.additionalHoodRate;
  if (d.additionalFanRate == null || d.additionalFanRate === "")
    d.additionalFanRate = DEFAULT_RATES.additionalFanRate;
  if (d.stdFilterRate == null || d.stdFilterRate === "")
    d.stdFilterRate = DEFAULT_RATES.stdFilterRate;
  if (d.nonStdFilterRate == null || d.nonStdFilterRate === "")
    d.nonStdFilterRate = DEFAULT_RATES.nonStdFilterRate;
  if (d.fuelSurcharge == null || d.fuelSurcharge === "")
    d.fuelSurcharge = DEFAULT_RATES.fuelSurcharge;
  d.repairs = normalizeRepairs(d);
  d.additionalItems = normalizeAdditionalItems(d);
  if (d.initialHoodQty == null || d.initialHoodQty < 1)
    d.initialHoodQty = 1;
  if (d.initialFanQty == null || d.initialFanQty < 1)
    d.initialFanQty = 1;
  return d;
}

export function readDraft() {
  try {
    const raw = JSON.parse(localStorage.getItem(DRAFT_KEY) || "{}");
    return applyDefaults(raw);
  } catch {
    return applyDefaults({});
  }
}

export function writeDraft(draft) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft || {}));
  } catch {
    // ignore
  }
}

/**
 * Merge only defined keys from incoming into prev.
 * Prevents wiping your state when incoming draft is partial.
 */
export function mergeDraft(prev, incoming) {
  const out = { ...(prev || {}) };
  if (!incoming || typeof incoming !== "object") return out;
  for (const [k, v] of Object.entries(incoming)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

export function computeTotals(draft) {
  const baseRate = orDefault(draft?.baseRate, DEFAULT_RATES.baseRate);
  const stdRate = orDefault(draft?.stdFilterRate, DEFAULT_RATES.stdFilterRate);
  const nonStdRate = orDefault(
    draft?.nonStdFilterRate,
    DEFAULT_RATES.nonStdFilterRate
  );
  const fuelRate = orDefault(
    draft?.fuelSurcharge,
    DEFAULT_RATES.fuelSurcharge
  );

  const additionalItems = Array.isArray(draft.additionalItems)
    ? draft.additionalItems
    : normalizeAdditionalItems(draft || {});
  const additionalSubtotal = additionalItems.reduce(
    (sum, a) => sum + safeNum(a.qty) * orDefault(a.rate, DEFAULT_RATES.additionalHoodRate),
    0
  );

  const mainServiceSubtotal = baseRate + additionalSubtotal;

  const repairs = Array.isArray(draft.repairs)
    ? draft.repairs
    : normalizeRepairs(draft || {});
  const repairsSubtotal = repairs.reduce((sum, r) => sum + safeNum(r.amount), 0);

  const filtersSubtotal =
    safeNum(draft.stdFilterQty) * stdRate +
    safeNum(draft.nonStdFilterQty) * nonStdRate;

  const fuelSubtotal = fuelRate;

  const totalPerService =
    mainServiceSubtotal + repairsSubtotal + filtersSubtotal + fuelSubtotal;

  return {
    baseRate,
    addHood: additionalSubtotal,
    addFan: 0,
    mainServiceSubtotal,
    repairsSubtotal,
    filtersSubtotal,
    fuelSubtotal,
    totalPerService,
  };
}
