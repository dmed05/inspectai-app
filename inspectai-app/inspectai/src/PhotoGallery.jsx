import { useEffect, useMemo, useState } from "react";

export default function PhotoGallery({ photos = [] }) {
  const usable = (photos || []).filter(
    (p) => p?.publicUrl || p?.localUrl
  );

  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);

  const active = useMemo(() => usable[idx], [usable, idx]);

  const openAt = (i) => {
    setIdx(i);
    setOpen(true);
  };

  const close = () => setOpen(false);

  const prev = () => setIdx((i) => (i - 1 + usable.length) % usable.length);
  const next = () => setIdx((i) => (i + 1) % usable.length);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight") next();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, usable.length]);

  if (usable.length === 0) {
    return (
      <div className="mt-6 text-sm text-white/60">
        No photos available to display. If Firebase isn't configured, stored
        photo URLs may be missing.
      </div>
    );
  }

  return (
    <div className="mt-6">
      <h3 className="text-lg font-semibold">Attached Photos</h3>
      <p className="text-sm text-white/60 mb-3">Click any photo to expand.</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
        {usable.map((p, i) => (
          <button
            key={`${p.filename || "photo"}-${i}`}
            type="button"
            onClick={() => openAt(i)}
            className="group overflow-hidden rounded-xl border border-white/10 bg-white/5 text-left"
            title="Click to expand"
          >
            <img
              src={p.publicUrl || p.localUrl}
              alt={p.caption || p.filename || `Photo ${i + 1}`}
              className="h-40 w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
              loading="lazy"
            />
            <div className="px-3 py-2">
              <div className="text-xs text-white/80 truncate">
                {p.caption || p.filename || `Photo ${i + 1}`}
              </div>
            </div>
          </button>
        ))}
      </div>

      {open && active ? (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={close}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="relative w-full max-w-5xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={close}
              type="button"
              className="absolute -top-10 right-0 text-sm text-white/80 hover:text-white"
            >
              ✕ Close
            </button>

            <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-black">
              <img
                src={active.publicUrl || active.localUrl}
                alt={active.caption || active.filename || "Expanded photo"}
                className="w-full max-h-[80vh] object-contain"
              />
            </div>

            <div className="mt-3 flex items-center justify-between text-sm text-white/70">
              <button
                onClick={prev}
                type="button"
                className="px-3 py-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10"
              >
                ← Prev
              </button>

              <div className="truncate px-3">
                {idx + 1} / {usable.length}
                {active.caption
                  ? ` • ${active.caption}`
                  : active.filename
                    ? ` • ${active.filename}`
                    : ""}
              </div>

              <button
                onClick={next}
                type="button"
                className="px-3 py-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10"
              >
                Next →
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
