// InspectAI — single-file demo UI
// Next steps available:
// 1) Wire the Generate button to your OpenAI prompt IDs (via backend route)
// 2) Add report preview + edit mode
// 3) Add PDF export
// 4) Add auth + multi-user history
// 5) Optimize mobile UX

import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import iconRestaurant from "./assets/icon-restaurant.svg";
import iconTools from "./assets/icon-tools.svg";
import iconNotes from "./assets/icon-notes.svg";
import iconCamera from "./assets/icon-camera.svg";
import iconInspectAI from "./assets/icon-inspectai.svg";
import PhotoGallery from "./PhotoGallery.jsx";
import { openProposalPreview } from "./ProposalPreview.jsx";
import { DRAFT_KEY, DEFAULT_RATES, writeDraft, readDraft, mergeDraft, normalizeRepairs, normalizeAdditionalItems } from "./proposalDraft.js";

const Icon = ({ src, alt = "" }) => (
  <span className="inline-flex items-center justify-center" aria-hidden>
    <img src={src} alt={alt} className="h-5 w-5 object-contain" />
  </span>
);

function Section({ step, title, icon, children }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-sm font-semibold">
          {step}
        </div>
        <div className="text-lg font-semibold flex items-center gap-2">
          <span>{icon}</span>
          <span>{title}</span>
        </div>
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

const REPORT_ICONS = {
  summary: "📋",
  overview: "🧰",
  findings: "🔍",
  "why-it-matters": "⚠️",
  "next-steps": "🛠",
  other: "📄",
};

const REPORT_CARD_ACCENT = {
  summary: "border-l-white/20",
  overview: "border-l-white/15",
  findings: "border-l-amber-500/60",
  "why-it-matters": "border-l-red-400/60",
  "next-steps": "border-l-blue-400/60",
  other: "border-l-white/20",
};

function classifySection(heading) {
  const h = heading.toLowerCase().replace(/\*+/g, "").trim();
  if (/inspection\s*summary|^summary\s*$/.test(h))
    return { type: "summary", heading: "Inspection Summary" };
  if (/system\s*overview|^overview\s*$/.test(h))
    return { type: "overview", heading: "System Overview" };
  if (/key\s*findings|^findings\s*$/.test(h))
    return { type: "findings", heading: "Key Findings" };
  if (/why\s*it\s*matters/.test(h))
    return { type: "why-it-matters", heading: "Why It Matters" };
  if (/recommended|next\s*steps/.test(h))
    return { type: "next-steps", heading: "Recommended Next Steps" };
  return { type: "other", heading: heading.replace(/\*+/g, "").trim() };
}

function isSectionHeader(line) {
  const t = line.trim();
  if (!t) return null;
  let m = t.match(/^#{1,3}\s+(.+)$/);
  if (m) return classifySection(m[1]);
  m = t.match(/^\*\*(.+?)\*\*:?\s*$/);
  if (m) return classifySection(m[1]);
  m = t.match(/^\*\*(.+?)\*\*:?\s/);
  if (m) return classifySection(m[1]);
  if (
    /^(inspection\s*summary|summary|system\s*overview|overview|key\s*findings|findings|why\s*it\s*matters|recommended\s*next\s*steps|next\s*steps)$/i.test(
      t
    )
  )
    return classifySection(t);
  return null;
}

function extractReportSections(text) {
  if (!text?.trim()) return [];
  const parts = [];
  const lines = text.split("\n");
  let current = { type: "summary", heading: "Inspection Summary", content: "" };
  for (let i = 0; i < lines.length; i++) {
    const parsed = isSectionHeader(lines[i]);
    if (parsed) {
      if (current.content.trim()) parts.push(current);
      current = { type: parsed.type, heading: parsed.heading, content: "" };
    } else {
      current.content += (current.content ? "\n" : "") + lines[i];
    }
  }
  if (current.content.trim()) parts.push(current);
  if (parts.length === 0 && text.trim()) {
    parts.push({ type: "summary", heading: "Inspection Summary", content: text });
  }
  if (parts.length === 1 && text.includes("System Overview")) {
    const fallback = [];
    const regex =
      /(?:\n|^)\s*(System Overview|Key Findings|Why It Matters|Recommended Next Steps|Next Steps)\s*\n/gi;
    let lastIdx = 0;
    let lastType = "summary";
    let lastHeading = "Inspection Summary";
    let match;
    while ((match = regex.exec(text)) !== null) {
      const chunk = text.slice(lastIdx, match.index).trim();
      if (chunk) fallback.push({ type: lastType, heading: lastHeading, content: chunk });
      const h = match[1].toLowerCase();
      if (/system\s*overview/.test(h)) {
        lastType = "overview";
        lastHeading = "System Overview";
      } else if (/key\s*findings|findings/.test(h)) {
        lastType = "findings";
        lastHeading = "Key Findings";
      } else if (/why\s*it\s*matters/.test(h)) {
        lastType = "why-it-matters";
        lastHeading = "Why It Matters";
      } else if (/recommended|next\s*steps/.test(h)) {
        lastType = "next-steps";
        lastHeading = "Recommended Next Steps";
      }
      lastIdx = regex.lastIndex;
    }
    if (lastIdx < text.length) {
      const tail = text.slice(lastIdx).trim();
      if (tail) fallback.push({ type: lastType, heading: lastHeading, content: tail });
    }
    if (fallback.length > 1) return fallback;
  }
  return parts;
}

function ReportCard({ type, heading, content }) {
  const icon = REPORT_ICONS[type] || REPORT_ICONS.other;
  const accent = REPORT_CARD_ACCENT[type] || REPORT_CARD_ACCENT.other;
  return (
    <div
      className={`rounded-xl border border-white/12 bg-white/[0.08] p-4 shadow-[0_4px_20px_rgba(0,0,0,0.4)] border-l-4 ${accent}`}
    >
      <div className="flex items-center gap-2 font-semibold text-white/95 mb-3">
        <span>{icon}</span>
        <span>{heading}</span>
      </div>
      <div className="text-sm text-white/85 leading-relaxed [&_h1]:text-base [&_h1]:font-bold [&_h1]:mt-2 [&_h1]:mb-1 [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:mt-2 [&_h2]:mb-1 [&_p]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-2 [&_li]:mb-1 [&_strong]:font-semibold [&_strong]:text-white/90">
        <ReactMarkdown>{content || "_No content._"}</ReactMarkdown>
      </div>
    </div>
  );
}

function Input(props) {
  return (
    <input
      {...props}
      className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
    />
  );
}

function Textarea({ className, ...props }) {
  return (
    <textarea
      {...props}
      className={
        "w-full min-h-[160px] rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500/40 " +
        (className || "")
      }
    />
  );
}

export default function App() {
  const toInt = (v) => {
    const n = Number.parseInt(v, 10);
    return Number.isFinite(n) ? n : 0;
  };

  const [restaurantName, setRestaurantName] = useState("");
  const [address, setAddress] = useState("");
  const [hoods, setHoods] = useState(1);
  const [fans, setFans] = useState(1);
  const [filters, setFilters] = useState(0);
  const [notes, setNotes] = useState("");

  const [proposalDate, setProposalDate] = useState("");
  const [cleaningFrequency, setCleaningFrequency] = useState("");
  const [baseRate, setBaseRate] = useState(String(DEFAULT_RATES.baseRate));
  const [additionalItems, setAdditionalItems] = useState(() => [
    { description: "Additional Hood", qty: 0, rate: DEFAULT_RATES.additionalHoodRate, frequency: "" },
    { description: "Additional Fan", qty: 0, rate: DEFAULT_RATES.additionalFanRate, frequency: "" },
  ]);
  const [repairs, setRepairs] = useState(() => [{ description: "", amount: 0 }]);
  const [stdFilterQty, setStdFilterQty] = useState(0);
  const [stdFilterRate, setStdFilterRate] = useState(
    String(DEFAULT_RATES.stdFilterRate)
  );
  const [nonStdFilterQty, setNonStdFilterQty] = useState(0);
  const [nonStdFilterRate, setNonStdFilterRate] = useState(
    String(DEFAULT_RATES.nonStdFilterRate)
  );
  const [fuelSurcharge, setFuelSurcharge] = useState(
    String(DEFAULT_RATES.fuelSurcharge)
  );
  const [filterExchangeQty, setFilterExchangeQty] = useState(0);
  const [filterExchangeUnitRate, setFilterExchangeUnitRate] = useState("");
  const [filterExchangeFrequency, setFilterExchangeFrequency] = useState("");
  const [pricingTouched, setPricingTouched] = useState(false);
  const [photos, setPhotos] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(null);

  const [isGenerating, setIsGenerating] = useState(false);
  const [apiError, setApiError] = useState("");
  const [latestReport, setLatestReport] = useState(null);
  const [isReportEditing, setIsReportEditing] = useState(false);
  const [editedReportText, setEditedReportText] = useState("");
  const [analyzeAllPhotos, setAnalyzeAllPhotos] = useState(false);
  const [history, setHistory] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("inspectai_history") || "[]");
    } catch {
      return [];
    }
  });

  // Auto-update proposal quantities from equipment
  // Enforced rule: base rate includes 1 hood + 1 fan, so "additional" is always (total - 1).
  // Users can still edit rates/frequency/other line items; but these two quantities stay derived.
  useEffect(() => {
    setAdditionalItems((prev) => {
      const items = normalizeAdditionalItems({ additionalItems: prev, cleaningFrequency });

      const wantHood = Math.max(hoods - 1, 0);
      const wantFan = Math.max(fans - 1, 0);

      const idxHood = items.findIndex(
        (x) => String(x.description || "").trim().toLowerCase() === "additional hood"
      );
      const idxFan = items.findIndex(
        (x) => String(x.description || "").trim().toLowerCase() === "additional fan"
      );

      if (idxHood >= 0) items[idxHood] = { ...items[idxHood], qty: wantHood };
      if (idxFan >= 0) items[idxFan] = { ...items[idxFan], qty: wantFan };

      return items;
    });

    // Keep filter-related quantities in sync until the user customizes pricing.
    if (!pricingTouched) {
      setStdFilterQty(filters);
      setFilterExchangeQty(filters);
    }
  }, [hoods, fans, filters, pricingTouched, cleaningFrequency]);

  function buildDraftFromState() {
    const num = (v) => {
      const x = Number(v);
      return Number.isFinite(x) ? x : undefined;
    };
    return {
      restaurantName,
      address,
      proposalDate,
      cleaningFrequency,
      initialHoodQty: 1,
      initialFanQty: 1,
      filters,
      baseRate: num(baseRate) ?? DEFAULT_RATES.baseRate,
      additionalItems: Array.isArray(additionalItems) && additionalItems.length > 0
        ? additionalItems.map((a) => ({
            description: String(a?.description ?? ""),
            qty: num(a?.qty) ?? 0,
            rate: num(a?.rate) ?? DEFAULT_RATES.additionalHoodRate,
            frequency: String(a?.frequency ?? ""),
          }))
        : [
            { description: "Additional Hood", qty: 0, rate: DEFAULT_RATES.additionalHoodRate, frequency: "" },
            { description: "Additional Fan", qty: 0, rate: DEFAULT_RATES.additionalFanRate, frequency: "" },
          ],
      repairs: Array.isArray(repairs) && repairs.length > 0
        ? repairs.map((r) => ({
            description: String(r?.description ?? ""),
            amount: num(r?.amount) ?? 0,
          }))
        : [{ description: "", amount: 0 }],
      stdFilterQty,
      stdFilterRate: num(stdFilterRate) ?? DEFAULT_RATES.stdFilterRate,
      nonStdFilterQty,
      nonStdFilterRate: num(nonStdFilterRate) ?? DEFAULT_RATES.nonStdFilterRate,
      fuelSurcharge: num(fuelSurcharge) ?? DEFAULT_RATES.fuelSurcharge,
      filterExchangeQty,
      filterExchangeUnitRate: num(filterExchangeUnitRate) ?? DEFAULT_RATES.stdFilterRate,
      filterExchangeFrequency,
    };
  }

  useEffect(() => {
    writeDraft(mergeDraft(readDraft(), buildDraftFromState()));
  }, [
    restaurantName,
    address,
    proposalDate,
    cleaningFrequency,
    hoods,
    fans,
    filters,
    baseRate,
    additionalItems,
    repairs,
    stdFilterQty,
    stdFilterRate,
    nonStdFilterQty,
    nonStdFilterRate,
    fuelSurcharge,
    filterExchangeQty,
    filterExchangeUnitRate,
    filterExchangeFrequency,
  ]);

  useEffect(() => {
    function onStorage(e) {
      if (e.key !== DRAFT_KEY) return;
      let incoming = {};
      try {
        incoming = e.newValue ? JSON.parse(e.newValue) : {};
      } catch {
        incoming = {};
      }

      if (incoming.restaurantName !== undefined) setRestaurantName(incoming.restaurantName);
      if (incoming.address !== undefined) setAddress(incoming.address);
      if (incoming.proposalDate !== undefined) setProposalDate(incoming.proposalDate);
      if (incoming.cleaningFrequency !== undefined)
        setCleaningFrequency(incoming.cleaningFrequency);

      if (incoming.filters !== undefined)
        setFilters(Number(incoming.filters) || 0);

      if (incoming.baseRate !== undefined) setBaseRate(incoming.baseRate);
      if (incoming.additionalItems !== undefined && Array.isArray(incoming.additionalItems)) {
        const normalized = normalizeAdditionalItems({
          additionalItems: incoming.additionalItems,
          cleaningFrequency: incoming.cleaningFrequency,
        });
        setAdditionalItems(normalized);

        const hood = normalized.find(
          (x) => String(x.description || "").trim().toLowerCase() === "additional hood"
        );
        const fan = normalized.find(
          (x) => String(x.description || "").trim().toLowerCase() === "additional fan"
        );

        const addHood = Number(hood?.qty) || 0;
        const addFan = Number(fan?.qty) || 0;
        setHoods(1 + addHood);
        setFans(1 + addFan);
      } else if (
        incoming.additionalHoodQty != null ||
        incoming.additionalFanQty != null ||
        incoming.additionalHoodRate != null ||
        incoming.additionalFanRate != null
      ) {
        setAdditionalItems(normalizeAdditionalItems(incoming));
        const addH = Number(incoming.additionalHoodQty) || 0;
        const addF = Number(incoming.additionalFanQty) || 0;
        setHoods(1 + addH);
        setFans(1 + addF);
      }

      if (incoming.repairs !== undefined && Array.isArray(incoming.repairs)) {
        setRepairs(incoming.repairs);
      } else if (
        incoming.repairDescription !== undefined ||
        incoming.repairRate !== undefined
      ) {
        setRepairs(
          normalizeRepairs({
            repairDescription: incoming.repairDescription,
            repairRate: incoming.repairRate,
          })
        );
      }

      if (incoming.stdFilterQty !== undefined)
        setStdFilterQty(incoming.stdFilterQty);
      if (incoming.stdFilterRate !== undefined)
        setStdFilterRate(incoming.stdFilterRate);
      if (incoming.nonStdFilterQty !== undefined)
        setNonStdFilterQty(incoming.nonStdFilterQty);
      if (incoming.nonStdFilterRate !== undefined)
        setNonStdFilterRate(incoming.nonStdFilterRate);

      if (incoming.fuelSurcharge !== undefined)
        setFuelSurcharge(incoming.fuelSurcharge);

      if (incoming.filterExchangeQty !== undefined)
        setFilterExchangeQty(incoming.filterExchangeQty);
      if (incoming.filterExchangeUnitRate !== undefined)
        setFilterExchangeUnitRate(incoming.filterExchangeUnitRate);
      if (incoming.filterExchangeFrequency !== undefined)
        setFilterExchangeFrequency(incoming.filterExchangeFrequency);

      setPricingTouched(true);
    }

    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // Keep history persisted in localStorage (fallback)
  useEffect(() => {
    try {
      localStorage.setItem("inspectai_history", JSON.stringify(history));
    } catch {
      // ignore storage errors
    }
  }, [history]);

  // Fetch history from server (30-day retention) on mount
  useEffect(() => {
    fetch("/api/reports")
      .then((r) => r.ok ? r.json() : null)
      .then((body) => {
        if (body?.ok && Array.isArray(body.reports) && body.reports.length > 0) {
          const items = body.reports.map((r) => ({
            id: r.id,
            reportId: r.id,
            restaurantName: r.restaurantName || "",
            address: r.address || "",
            createdAt: r.createdAt || new Date().toISOString(),
            snapshot: {
              hoods: Number(r.hoods) || 0,
              fans: Number(r.fans) || 0,
              filters: Number(r.filters) || 0,
              notes: r.notes || "",
              photoCount: (r.photoAnalysis || []).length,
            },
            report: {
              reportText: r.reportText || r.summary,
              summary: r.summary,
              photos: r.photoAnalysis || [],
              reportId: r.id,
            },
          }));
          setHistory((prev) => {
            // Merge: prefer server items, add any local-only items not on server
            const byId = new Map(items.map((i) => [i.id, i]));
            prev.forEach((p) => {
              if (!byId.has(p.id) && !byId.has(p.reportId)) byId.set(p.id, p);
            });
            return Array.from(byId.values()).sort(
              (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
            );
          });
        }
      })
      .catch(() => {});
  }, []);

  // ESC to close upload thumbnails lightbox
  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape") setLightboxIndex(null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Create and revoke thumbnail blob URLs
  const [thumbUrls, setThumbUrls] = useState([]);
  useEffect(() => {
    const urls = photos.map((f) => URL.createObjectURL(f));
    setThumbUrls(urls);
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, [photos]);

  const canGenerate =
    restaurantName.trim().length > 0 &&
    (notes.trim().length > 0 || photos.length > 0);

  const galleryPhotos = useMemo(() => {
    const reportPhotos =
      latestReport?.photos ?? latestReport?.photoAnalysis ?? [];
    return reportPhotos.map((p, i) => ({
      ...p,
      localUrl: !p.publicUrl && thumbUrls[i] ? thumbUrls[i] : undefined,
    }));
  }, [latestReport?.photos, latestReport?.photoAnalysis, thumbUrls]);

  async function handleGenerate() {
    if (!canGenerate || isGenerating) return;

    try {
      setApiError("");
      setIsGenerating(true);

      // Send everything to the backend as multipart/form-data
      // Field name "photos" must match server upload.array("photos", 20)
      const form = new FormData();
      form.append("restaurantName", restaurantName.trim());
      form.append("address", address.trim());
      form.append("hoods", String(hoods));
      form.append("fans", String(fans));
      form.append("filters", String(filters));
      form.append("notes", notes.trim());
      form.append("analyzeAll", analyzeAllPhotos ? "true" : "false");
      photos.forEach((p) => form.append("photos", p));

      const res = await fetch("/api/generate", {
        method: "POST",
        body: form,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        try {
          const errBody = JSON.parse(text);
          if (errBody?.error) throw new Error(errBody.error);
        } catch (e) {
          if (e instanceof Error && e.message && !(e instanceof SyntaxError)) throw e;
          throw new Error(text || `Request failed (${res.status})`);
        }
      }

      const data = await res.json();
      const reportData = {
        ...data,
        reportText: data.reportText || data.summary,
        photos: data.photoAnalysis || [],
        reportId: data.reportId || null,
      };
      setLatestReport(reportData);

      // Save to Recent History (persisted server-side for 30 days when reportId present)
      const item = {
        id: data.reportId || crypto.randomUUID(),
        reportId: data.reportId || null,
        restaurantName: restaurantName.trim(),
        address: address.trim(),
        createdAt: new Date().toISOString(),
        snapshot: {
          hoods,
          fans,
          filters,
          notes: notes.trim(),
          photoCount: photos.length,
          analyzeAllPhotos,
          pricingTouched,
          proposalDraft: buildDraftFromState(),
        },
        report: {
          ...reportData,
          reportText: data.reportText || data.summary,
          photos: data.photoAnalysis || [],
        },
      };

      setHistory((prev) => [item, ...prev].slice(0, 50));

      alert("Report generated ✅\n(Next: we’ll replace this alert with an in-app preview.)");
    } catch (err) {
      setApiError(err?.message || "Something went wrong calling /api/generate");
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a1020] via-[#070b14] to-black text-white">
      {/* Header */}
      <header className="border-b border-white/10 bg-black/40 backdrop-blur">
        <div className="mx-auto max-w-6xl px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <img src={iconInspectAI} alt="" className="h-8 w-8 object-contain" aria-hidden />
            <div>
              <h1 className="text-xl font-bold">InspectAI</h1>
              <p className="text-xs text-white/50">Professional Report Generator</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => openProposalPreview(buildDraftFromState())}
            className="text-sm px-3 py-1.5 rounded-lg border border-white/20 bg-white/5 hover:bg-white/10 text-white/90 transition"
          >
            Proposal Preview ↗
          </button>
        </div>
      </header>

      {/* Main */}
      <main className="mx-auto max-w-6xl px-6 py-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left */}
        <div className="lg:col-span-2 space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-3xl font-bold">New Inspection</h2>
              <p className="text-white/60 mt-2">
                Enter the raw details and let AI write the professional summary.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setRestaurantName("");
                setAddress("");
                setHoods(1);
                setFans(1);
                setFilters(0);
                setNotes("");
                setPhotos([]);
                setLatestReport(null);
                setApiError("");
                setIsReportEditing(false);
                setEditedReportText("");
              }}
              className="shrink-0 px-4 py-2.5 rounded-xl border border-white/20 bg-white/5 hover:bg-white/10 text-white font-medium text-sm transition"
            >
              Create New
            </button>
          </div>

          <Section step="1" title="Restaurant Details" icon={<Icon src={iconRestaurant} />}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                placeholder="Restaurant name"
                value={restaurantName}
                onChange={(e) => setRestaurantName(e.target.value)}
              />
              <Input
                placeholder="Address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </div>
          </Section>

          <Section step="2" title="Equipment Inventory" icon={<Icon src={iconTools} />}>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <div className="text-sm font-medium text-white/80 mb-2">Hoods</div>
                <Input
                  type="number"
                  value={hoods}
                  min={1}
                  onChange={(e) => setHoods(Math.max(1, toInt(e.target.value)))}
                />
              </div>
              <div>
                <div className="text-sm font-medium text-white/80 mb-2">Fans</div>
                <Input
                  type="number"
                  value={fans}
                  min={1}
                  onChange={(e) => setFans(Math.max(1, toInt(e.target.value)))}
                />
              </div>
              <div>
                <div className="text-sm font-medium text-white/80 mb-2">Filters</div>
                <Input
                  type="number"
                  value={filters}
                  min={0}
                  onChange={(e) => setFilters(toInt(e.target.value))}
                />
              </div>
            </div>
          </Section>

          <Section step="3" title="Inspection Notes" icon={<Icon src={iconNotes} />}>
            <Textarea
              placeholder="Write what you SEE, not conclusions…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
            <p className="mt-2 text-xs text-white/50">
              AI will transform these notes into a polished summary.
            </p>
          </Section>

          <Section step="4" title="Photos" icon={<Icon src={iconCamera} />}>
            <label
              htmlFor="photo-upload"
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsDragging(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsDragging(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsDragging(false);
                const files = Array.from(e.dataTransfer.files).filter((f) =>
                  f.type.startsWith("image/")
                );
                if (files.length > 0) {
                  setPhotos((prev) => [...prev, ...files].slice(0, 20));
                }
              }}
              className={`flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-8 transition cursor-pointer focus-within:ring-2 focus-within:ring-blue-500/40 focus-within:border-blue-500/40 ${
                isDragging
                  ? "border-blue-500/60 bg-blue-500/10"
                  : "border-white/20 bg-black/30 hover:border-white/30 hover:bg-black/40"
              }`}
            >
              <img src={iconCamera} alt="" className="h-10 w-10 opacity-70" />
              <div className="text-center">
                <span className="text-white/80 font-medium">
                  Click to upload photos
                </span>
                <p className="text-xs text-white/50 mt-1">
                  or drag and drop • up to 20 images
                </p>
              </div>
              <input
                id="photo-upload"
                type="file"
                multiple
                accept="image/*"
                className="sr-only"
                onChange={(e) =>
                  setPhotos((prev) =>
                    [...prev, ...Array.from(e.target.files || [])].slice(0, 20)
                  )
                }
              />
            </label>

            {photos.length > 0 && (
              <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3">
                <p className="text-sm font-medium text-white/80 mb-3">
                  {photos.length} photo{photos.length !== 1 ? "s" : ""} selected
                </p>
                <div className="grid grid-cols-4 sm:grid-cols-5 gap-2 max-h-48 overflow-y-auto">
                  {photos.map((f, i) => (
                    <div
                      key={`${f.name}-${f.lastModified}`}
                      className="relative group aspect-square rounded-lg overflow-hidden bg-black/40 border border-white/10"
                    >
                      <button
                        type="button"
                        onClick={() => setLightboxIndex(i)}
                        className="absolute inset-0 w-full h-full cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:ring-inset rounded-lg"
                      >
                        {thumbUrls[i] && (
                          <img
                            src={thumbUrls[i]}
                            alt={f.name}
                            className="w-full h-full object-cover"
                          />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPhotos((prev) => prev.filter((_, idx) => idx !== i));
                          if (lightboxIndex === i) setLightboxIndex(null);
                          else if (lightboxIndex > i) setLightboxIndex(lightboxIndex - 1);
                        }}
                        className="absolute top-1 right-1 w-6 h-6 flex items-center justify-center rounded-full bg-red-500/90 text-white text-xs font-bold opacity-0 group-hover:opacity-100 transition hover:bg-red-500 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-white"
                        aria-label={`Remove ${f.name}`}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Section>

          {lightboxIndex !== null && thumbUrls[lightboxIndex] && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
              onClick={() => setLightboxIndex(null)}
              role="dialog"
              aria-modal="true"
              aria-label="Photo preview"
            >
              <button
                type="button"
                onClick={() => setLightboxIndex(null)}
                className="absolute top-4 right-4 text-white/80 hover:text-white text-2xl p-2 focus:outline-none focus:ring-2 focus:ring-white/50 rounded"
                aria-label="Close"
              >
                ✕
              </button>
              <img
                src={thumbUrls[lightboxIndex]}
                alt={photos[lightboxIndex]?.name || "Photo preview"}
                className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg"
                onClick={(e) => e.stopPropagation()}
              />
              <p className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/70 text-sm">
                {photos[lightboxIndex]?.name}
              </p>
            </div>
          )}

          {apiError && (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              <div className="font-semibold mb-1">Generate failed</div>
              <div className="text-red-200/90 break-words">{apiError}</div>
            </div>
          )}

          {photos.length > 8 && (
            <label className="flex items-center gap-2 text-sm text-white/70 cursor-pointer">
              <input
                type="checkbox"
                checked={analyzeAllPhotos}
                onChange={(e) => setAnalyzeAllPhotos(e.target.checked)}
                className="rounded border-white/30 bg-black/30 text-blue-500 focus:ring-blue-500/40"
              />
              <span>Analyze all {photos.length} photos (slower)</span>
            </label>
          )}

          <button
            disabled={!canGenerate || isGenerating}
            onClick={handleGenerate}
            className={`w-full rounded-2xl py-4 font-semibold transition ${
              canGenerate && !isGenerating
                ? "bg-blue-500 hover:bg-blue-400 text-black"
                : "bg-white/10 text-white/40 cursor-not-allowed"
            }`}
          >
            {isGenerating ? "Generating…" : "Generate Inspection Report"}
          </button>

        </div>

        {/* Right */}
        <aside className="space-y-5">
          {(latestReport?.reportText || latestReport?.summary) && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div className="font-semibold">Latest Report</div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsReportEditing(true);
                      setEditedReportText(
                        latestReport.reportText || latestReport.summary || ""
                      );
                    }}
                    className="text-sm px-3 py-1.5 rounded-lg border border-white/20 bg-white/5 hover:bg-white/10 text-white/90 transition"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const reportId = latestReport.reportId;
                      if (reportId) {
                        // Use persisted share link (saved for 30 days)
                        window.open(
                          `${window.location.origin}/report.html?id=${reportId}`,
                          "_blank",
                          "noopener,noreferrer"
                        );
                      } else {
                        // Fallback: embed data in URL hash (legacy)
                        const payload = {
                          reportText:
                            latestReport.reportText || latestReport.summary,
                          photos: galleryPhotos.map((p) => ({
                            filename: p.filename,
                            caption: p.caption || p.analysis,
                            publicUrl: p.publicUrl || undefined,
                            localUrl: p.localUrl || undefined,
                          })),
                        };
                        const b64 = btoa(
                          unescape(encodeURIComponent(JSON.stringify(payload)))
                        );
                        window.open(
                          `${window.location.origin}/report.html#${b64}`,
                          "_blank",
                          "noopener,noreferrer"
                        );
                      }
                    }}
                    className="text-sm px-3 py-1.5 rounded-lg border border-white/20 bg-white/5 hover:bg-white/10 text-white/90 transition"
                  >
                    Share ↗
                  </button>
                </div>
              </div>
              {isReportEditing ? (
                <div className="space-y-3">
                  <Textarea
                    value={editedReportText}
                    onChange={(e) => setEditedReportText(e.target.value)}
                    className="min-h-[300px] font-mono text-sm leading-relaxed"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={async () => {
                        const originalText =
                          latestReport.reportText || latestReport.summary;
                        setLatestReport((prev) => ({
                          ...prev,
                          reportText: editedReportText,
                          summary: editedReportText,
                        }));
                        setHistory((prev) =>
                          prev.map((h) =>
                            h.report &&
                            (h.report.reportText === originalText ||
                              h.report.summary === originalText)
                              ? {
                                  ...h,
                                  report: {
                                    ...h.report,
                                    reportText: editedReportText,
                                    summary: editedReportText,
                                  },
                                }
                              : h
                          )
                        );
                        setIsReportEditing(false);
                        // Persist edit so shared page (report.html?id=...) shows updated content
                        if (latestReport.reportId) {
                          try {
                            const r = await fetch(
                              `/api/reports/${encodeURIComponent(latestReport.reportId)}`,
                              {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                  reportText: editedReportText,
                                  summary: editedReportText,
                                }),
                              }
                            );
                            if (!r.ok) {
                              const err = await r.json().catch(() => ({}));
                              setApiError(err?.error || "Could not update shared report.");
                            } else {
                              setApiError("");
                            }
                          } catch (e) {
                            setApiError("Could not update shared report.");
                          }
                        }
                      }}
                      className="px-4 py-2 rounded-lg bg-blue-500 hover:bg-blue-400 text-black font-medium text-sm transition"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsReportEditing(false)}
                      className="px-4 py-2 rounded-lg border border-white/20 bg-white/5 hover:bg-white/10 text-white/90 text-sm transition"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3 max-h-[50vh] overflow-y-auto">
                  {extractReportSections(
                    latestReport.reportText || latestReport.summary
                  ).map((s, i) => (
                    <ReportCard
                      key={i}
                      type={s.type}
                      heading={s.heading}
                      content={s.content}
                    />
                  ))}
                </div>
              )}
              {!isReportEditing && galleryPhotos.length > 0 && (
                <PhotoGallery photos={galleryPhotos} />
              )}
            </div>
          )}

          <div>
            <h2 className="text-3xl font-bold">Recent History</h2>
            <p className="text-white/60 mt-2">
              Previously generated inspections.
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            {history.length === 0 ? (
              <div className="p-6 text-center text-white/50">
                No inspections yet
              </div>
            ) : (
              <div className="space-y-3">
                {history.map((h) => (
                  <button
                    key={h.id}
                    className="w-full text-left rounded-xl border border-white/10 bg-black/20 p-3 hover:bg-black/30 transition"
                    onClick={() => {
                      setRestaurantName(h.restaurantName || "");
                      setAddress(h.address || "");
                      setHoods(h.snapshot?.hoods ?? 0);
                      setFans(h.snapshot?.fans ?? 0);
                      setFilters(h.snapshot?.filters ?? 0);
                      setNotes(h.snapshot?.notes ?? "");
                      // Rehydrate proposal/pricing tab state when present
                      const draft = h.snapshot?.proposalDraft;
                      if (draft) {
                        setProposalDate(draft.proposalDate ?? "");
                        setCleaningFrequency(draft.cleaningFrequency ?? "");
                        setBaseRate(String(draft.baseRate ?? DEFAULT_RATES.baseRate));
                        setAdditionalItems(
                          normalizeAdditionalItems({
                            additionalItems: draft.additionalItems,
                            cleaningFrequency: draft.cleaningFrequency ?? "",
                          })
                        );
                        setRepairs(
                          Array.isArray(draft.repairs) && draft.repairs.length > 0
                            ? draft.repairs
                            : [{ description: "", amount: 0 }]
                        );
                        setStdFilterQty(draft.stdFilterQty ?? 0);
                        setStdFilterRate(String(draft.stdFilterRate ?? DEFAULT_RATES.stdFilterRate));
                        setNonStdFilterQty(draft.nonStdFilterQty ?? 0);
                        setNonStdFilterRate(String(draft.nonStdFilterRate ?? DEFAULT_RATES.nonStdFilterRate));
                        setFuelSurcharge(String(draft.fuelSurcharge ?? DEFAULT_RATES.fuelSurcharge));
                        setFilterExchangeQty(draft.filterExchangeQty ?? 0);
                        setFilterExchangeUnitRate(
                          String(draft.filterExchangeUnitRate ?? DEFAULT_RATES.stdFilterRate)
                        );
                        setFilterExchangeFrequency(draft.filterExchangeFrequency ?? "");
                        // keep localStorage draft in sync for Proposal Preview
                        writeDraft(mergeDraft(readDraft(), draft));
                      }
                      if (typeof h.snapshot?.pricingTouched === "boolean") {
                        setPricingTouched(h.snapshot.pricingTouched);
                      }
                      if (typeof h.snapshot?.analyzeAllPhotos === "boolean") {
                        setAnalyzeAllPhotos(h.snapshot.analyzeAllPhotos);
                      }
                      const r = h.report ?? null;
                      setLatestReport(
                        r
                          ? {
                              ...r,
                              reportText: r.reportText || r.summary,
                              photos: r.photos ?? r.photoAnalysis ?? [],
                              reportId: r.reportId ?? h.reportId ?? h.id,
                            }
                          : null
                      );
                    }}
                  >
                    <div className="font-semibold">
                      {h.restaurantName || "Untitled"}
                    </div>
                    <div className="text-xs text-white/60">
                      {h.address || ""}
                    </div>
                    <div className="mt-1 text-xs text-white/40">
                      {h.snapshot?.photoCount ?? 0} photos •{" "}
                      {new Date(h.createdAt).toLocaleString()}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </aside>
      </main>

      {/*
        Manual test checklist (quick field sanity):
        1) Enter restaurant name only → Generate stays disabled.
        2) Enter restaurant name + notes → Generate enables.
        3) Select photos (no notes) + restaurant name → Generate enables + photo filenames appear.
        4) Click Generate → button shows “Generating…” then Recent History shows newest entry.
        5) Refresh page → Recent History persists.
        6) Click a history item → form re-hydrates with saved counts/notes.
      */}
    </div>
  );
}
