"use client";
/**
 * The designer (PRD §06). Owns the document state and wires together the
 * canvas, the properties panel, the upload and CSV tabs, autosave, the
 * preflight list, the live price and checkout.
 *
 * Data flow: doc (mm JSON) -> layoutDesign() -> canvas + warnings.
 * Nothing here is trusted by the server: every save re-validates the
 * document and checkout recomputes the price from the database.
 */
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { layoutDesign } from "@/lib/design/layout";
import { clientMeasure, usePrintFonts } from "@/lib/design/measure.client";
import { blankDesign } from "@/lib/design/template";
import { PT_TO_MM } from "@/lib/design/fonts";
import { printArea } from "@/lib/layout/constrain";
import { calculatePrice, formatMoney, validateConfig, VAT_RATE } from "@/lib/pricing/calculate";
import { imageSize, uploadToDesign, extOf } from "@/lib/upload.client";
import type { Product } from "@/lib/catalog/types";
import type { DesignDoc, DesignElement } from "@/lib/design/types";
import type { DesignConfig } from "@/lib/orders/service";
import { attachUpload, checkout, clearUpload, saveDesign, type UploadKind } from "./actions";
import { DesignCanvas, patchElement, placeBox } from "./canvas";
import { Inspector } from "./inspector";
import { UploadPanel } from "./upload-panel";
import { CsvPanel } from "./csv-panel";
import { useHistory } from "./use-history";

type Tab = "design" | "upload" | "csv";
type Upload = { path: string; kind: UploadKind; url: string | null } | null;

export interface EditorProps {
  designId: string;
  uid: string;
  name: string;
  product: Product;
  divisionSlug: string;
  initialDoc: DesignDoc | null;
  initialConfig: DesignConfig;
  initialUpload: Upload;
  imageUrls: Record<string, string>;
  startTab: Tab;
  cancelled: boolean;
}

const newId = () => crypto.randomUUID().slice(0, 8);

export function Editor(p: EditorProps) {
  const { product, designId, uid } = p;
  const schema = product.config_schema;
  const fontsReady = usePrintFonts();

  const h = useHistory<DesignDoc>(p.initialDoc ?? blankDesign(p.initialConfig, product));
  const doc = h.doc;
  const [cfg, setCfg] = useState<DesignConfig>(p.initialConfig);
  const [upload, setUpload] = useState<Upload>(p.initialUpload);
  const [urls, setUrls] = useState(p.imageUrls);
  const [tab, setTab] = useState<Tab>(p.startTab);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ doc: DesignDoc; cfg: DesignConfig; at: Date | null }>({ doc, cfg, at: null });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "error" | "info"; text: string } | null>(p.cancelled ? { kind: "info", text: "Payment was cancelled. Your design is saved; check out whenever you are ready." } : null);
  const [paying, setPaying] = useState(false);
  const imgInput = useRef<HTMLInputElement>(null);

  // A PDF/AI upload has no editable document: the file itself is the artwork.
  const fileOnly = upload && (upload.kind === "pdf" || upload.kind === "ai");
  const docForSave = fileOnly ? null : doc;

  const layout = useMemo(() => (fontsReady ? layoutDesign(doc, clientMeasure) : null), [doc, fontsReady]);
  const cfgErrors = validateConfig(schema, cfg);
  const price = cfgErrors.length ? null : calculatePrice(schema, product.pricing, cfg, VAT_RATE);
  const selected = doc.elements.find((e) => e.id === selectedId) ?? null;

  // Preflight: what still blocks checkout.
  const blocking: string[] = [];
  if (!fileOnly && doc.elements.length === 0 && /^#f{6}$/i.test(doc.background)) blocking.push("The design is empty. Add text or an image, or upload a file.");
  if (!fileOnly) for (const w of layout?.warnings ?? []) if (w.level === "error") blocking.push(w.message);
  if (cfg.csvRows && cfg.csvRows > cfg.quantity) blocking.push(`Your CSV has ${cfg.csvRows} rows; raise the quantity to at least ${cfg.csvRows}.`);
  blocking.push(...cfgErrors);
  const notes = fileOnly ? [] : (layout?.warnings ?? []).filter((w) => w.level === "warning");

  const dirty = saved.doc !== doc || saved.cfg !== cfg;

  async function save(): Promise<boolean> {
    const snapshot = { doc, cfg };
    setSaving(true);
    const r = await saveDesign(designId, docForSave, cfg);
    setSaving(false);
    if (r.ok) setSaved({ ...snapshot, at: new Date() });
    else setMessage({ kind: "error", text: r.error ?? "Could not save." });
    return r.ok;
  }

  // Autosave 1.5 s after the last change.
  const saveRef = useRef(save);
  useEffect(() => { saveRef.current = save; });
  useEffect(() => {
    if (!dirty || saving) return;
    const t = setTimeout(() => saveRef.current(), 1500);
    return () => clearTimeout(t);
  }, [dirty, saving, doc, cfg]);

  // Warn before closing the tab with unsaved work.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  /* ---------------- element operations ---------------- */

  const update = (patch: Partial<DesignElement> | { background: string }, key: string) => {
    if ("background" in patch && !selected) return h.set({ ...doc, background: patch.background as string }, key);
    if (selected) h.set(patchElement(doc, selected.id, patch as Partial<DesignElement>), key);
  };

  function add(el: DesignElement) {
    h.set({ ...doc, elements: [...doc.elements, el] });
    setSelectedId(el.id);
    setTab("design");
  }

  const area = printArea(doc);
  function centred(w: number, hh: number) {
    return placeBox(doc, { x: area.x + (area.w - w) / 2, y: area.y + (area.h - hh) / 2, w, h: hh, rotation: 0 });
  }

  function addText() {
    const boxH = Math.max(area.h * 0.22, 6);
    const pt = Math.round((boxH * 0.7) / PT_TO_MM);
    add({ id: newId(), type: "text", text: "Your text", font: "lato", bold: true, size: pt, color: "#1b1f24", align: "center", fit: { shrinkToFit: true, minPt: Math.min(6, pt), maxPt: pt }, ...centred(area.w * 0.8, boxH) });
  }

  function addShape(type: "rect" | "ellipse") {
    const s = Math.min(area.w, area.h) * 0.4;
    add({ id: newId(), type, fill: "#c4105f", ...centred(s, s) } as DesignElement);
  }

  async function addImage(file: File | undefined) {
    if (!file) return;
    if (!["png", "jpg", "jpeg", "svg"].includes(extOf(file.name))) return setMessage({ kind: "error", text: "Images can be PNG, JPG or SVG." });
    try {
      setMessage({ kind: "info", text: "Uploading image…" });
      const path = await uploadToDesign(file, uid, designId, "img");
      const local = URL.createObjectURL(file);
      const px = await imageSize(local);
      setUrls((u) => ({ ...u, [path]: local }));
      const ratio = px.w && px.h ? px.h / px.w : 1;
      let w = area.w * 0.5, hh = w * ratio;
      if (hh > area.h * 0.6) { hh = area.h * 0.6; w = hh / ratio; }
      const vector = extOf(file.name) === "svg";
      add({ id: newId(), type: "image", src: path, ...(vector || !px.w ? {} : { pxW: px.w, pxH: px.h }), ...centred(w, hh) });
      setMessage(null);
    } catch (e) {
      setMessage({ kind: "error", text: e instanceof Error ? e.message : "Upload failed." });
    }
  }

  function remove() {
    if (!selected || selected.locked) return;
    h.set({ ...doc, elements: doc.elements.filter((e) => e.id !== selected.id) });
    setSelectedId(null);
  }

  function duplicate() {
    if (!selected || selected.locked) return;
    const copy = { ...selected, id: newId(), ...placeBox(doc, { x: selected.x + 3, y: selected.y + 3, w: selected.w, h: selected.h, rotation: selected.rotation }) };
    add(copy as DesignElement);
  }

  function layer(dir: 1 | -1) {
    if (!selected) return;
    const els = [...doc.elements];
    const i = els.findIndex((e) => e.id === selected.id), j = i + dir;
    if (j < 0 || j >= els.length) return;
    [els[i], els[j]] = [els[j], els[i]];
    h.set({ ...doc, elements: els });
  }

  // Keyboard: arrows nudge (Shift = 5 mm, Alt = 0.1 mm), Delete, undo/redo, duplicate.
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  useEffect(() => {
    keyRef.current = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [contenteditable]")) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); if (e.shiftKey) h.redo(); else h.undo(); return; }
      if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); h.redo(); return; }
      if (!selected || tab !== "design") return;
      if (mod && e.key.toLowerCase() === "d") { e.preventDefault(); duplicate(); return; }
      if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); remove(); return; }
      if (e.key === "Escape") { setSelectedId(null); return; }
      const step = e.shiftKey ? 5 : e.altKey ? 0.1 : 1;
      const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
      if (d && !selected.locked) {
        e.preventDefault();
        h.set(patchElement(doc, selected.id, placeBox(doc, { x: selected.x + d[0], y: selected.y + d[1], w: selected.w, h: selected.h, rotation: selected.rotation })), `nudge-${selected.id}`);
      }
    };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keyRef.current(e);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /* ---------------- uploads, CSV, checkout ---------------- */

  async function onUploaded(path: string, kind: UploadKind, file: File): Promise<string | null> {
    const r = await attachUpload(designId, path, kind);
    if (!r.ok) return r.error ?? "Upload failed.";
    const local = URL.createObjectURL(file);
    setUrls((u) => ({ ...u, [path]: local }));
    setUpload({ path, kind, url: local });
    if (r.doc) { h.set(r.doc); setSaved((s) => ({ ...s, doc: r.doc! })); setTab("design"); }
    else setSaved((s) => ({ ...s, doc }));
    setSelectedId(null);
    return null;
  }

  async function onRemoveUpload() {
    const blank = blankDesign(cfg, product);
    const r = await clearUpload(designId, blank);
    if (!r.ok || !r.doc) return setMessage({ kind: "error", text: r.error ?? "Could not remove the file." });
    setUpload(null);
    h.set(r.doc);
    setSaved((s) => ({ ...s, doc: r.doc! }));
  }

  async function pay() {
    setPaying(true);
    setMessage(null);
    const r = await checkout(designId, docForSave, cfg);
    if (r.ok && r.url) { setSaved({ doc, cfg, at: new Date() }); window.location.assign(r.url); return; }
    setPaying(false);
    setMessage({ kind: "error", text: r.error ?? "Checkout could not start." });
  }

  const material = schema.materials.find((m) => m.id === cfg.materialId);
  const tabs: Array<{ id: Tab; label: string }> = [
    { id: "design", label: "Design" },
    { id: "upload", label: "Upload file" },
    ...(product.supports_csv && !fileOnly ? [{ id: "csv" as Tab, label: "Names & numbers" }] : []),
  ];

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-hairline pb-4">
        <div>
          <Link href={`/products/${p.divisionSlug}/${product.slug}`} className="text-sm text-steel hover:text-ink">← {product.name}</Link>
          <h1 className="mt-1 text-2xl font-extrabold">{p.name}</h1>
          <p className="text-sm tabular-nums text-steel">{cfg.widthMm} × {cfg.heightMm} mm, {product.bleed_mm} mm bleed, {product.dpi} dpi output</p>
        </div>
        <p className="text-sm text-steel" aria-live="polite">
          {saving ? "Saving…" : dirty ? "Unsaved changes" : saved.at ? `Saved at ${saved.at.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}` : "All changes saved"}
        </p>
      </div>

      <div role="tablist" aria-label="Artwork source" className="mt-4 flex gap-1 overflow-x-auto">
        {tabs.map((t) => (
          <button key={t.id} role="tab" type="button" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
            className={`whitespace-nowrap rounded-t-md border-b-2 px-4 py-2 text-sm font-semibold ${tab === t.id ? "border-accent text-ink" : "border-transparent text-steel hover:text-ink"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {message && (
        <p role={message.kind === "error" ? "alert" : "status"} className={`mt-3 rounded-md px-3 py-2 text-sm ${message.kind === "error" ? "bg-danger/10 text-danger" : "bg-mist"}`}>
          {message.text}
        </p>
      )}

      <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section aria-label="Workspace" className="min-w-0">
          {tab === "design" && (fileOnly ? (
            <div className="panel p-6">
              <p className="font-semibold">Your {upload!.kind.toUpperCase()} file is the artwork</p>
              <p className="mt-1 text-sm text-steel">PDF and AI files go to our prepress team, who check them and send you a proof to approve. Nothing prints before you approve it.</p>
              <button type="button" className="btn-secondary mt-4" onClick={() => setTab("upload")}>Manage the file</button>
            </div>
          ) : (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <button type="button" className="btn-secondary px-3 py-1.5 text-sm" onClick={addText}>Add text</button>
                <button type="button" className="btn-secondary px-3 py-1.5 text-sm" onClick={() => addShape("rect")}>Rectangle</button>
                <button type="button" className="btn-secondary px-3 py-1.5 text-sm" onClick={() => addShape("ellipse")}>Ellipse</button>
                <button type="button" className="btn-secondary px-3 py-1.5 text-sm" onClick={() => imgInput.current?.click()}>Image or logo</button>
                <input ref={imgInput} type="file" accept=".png,.jpg,.jpeg,.svg,image/png,image/jpeg,image/svg+xml" className="sr-only" tabIndex={-1} onChange={(e) => { addImage(e.target.files?.[0]); e.target.value = ""; }} />
                <span className="mx-1 h-6 w-px bg-hairline" aria-hidden />
                <button type="button" className="btn-quiet text-sm" onClick={h.undo} disabled={!h.canUndo} aria-keyshortcuts="Control+Z">Undo</button>
                <button type="button" className="btn-quiet text-sm" onClick={h.redo} disabled={!h.canRedo} aria-keyshortcuts="Control+Shift+Z">Redo</button>
              </div>
              {/* The artboard lies on the cutting mat; the grid uses the artboard's own px-per-mm, so one square is 10 mm of the real piece. */}
              <div className="@container">
              <div className="mat flex min-h-72 items-center justify-center rounded-lg p-4 sm:p-8"
                style={{ "--k": `min(6px, calc((100cqi - 4rem) / ${doc.widthMm + 2 * doc.bleedMm}), calc(36rem / ${doc.heightMm + 2 * doc.bleedMm}))` } as CSSProperties}>
                {layout ? (
                  <div className="bg-sheet shadow-[4px_4px_0_0_color-mix(in_oklab,var(--color-ink)_35%,transparent)]" style={{ width: `calc(${doc.widthMm + 2 * doc.bleedMm} * var(--k))` }}>
                    <DesignCanvas
                      layout={layout}
                      imageUrls={urls}
                      selectedId={selectedId}
                      onSelect={setSelectedId}
                      onLive={h.live}
                      onCommit={h.commit}
                      onEditText={(id) => { setSelectedId(id); requestAnimationFrame(() => document.getElementById("prop-text")?.focus()); }}
                      label={`${product.name} artwork, ${doc.widthMm} by ${doc.heightMm} mm`}
                    />
                  </div>
                ) : (
                  <div className="aspect-[4/3] w-full max-w-xl animate-pulse rounded bg-sheet" aria-label="Loading fonts" />
                )}
              </div>
              </div>
              <p className="mt-2 text-sm text-steel">
                One square on the mat is 10 mm. Drag to move, corners to resize, the dot to rotate (Shift snaps to 15°). Arrow keys nudge by 1 mm. Black dashes: trim. Magenta dashes: safe area. The faded edge is bleed and is cut off.
              </p>
            </>
          ))}

          {tab === "upload" && (
            <UploadPanel uid={uid} designId={designId} size={cfg} bleed={product.bleed_mm} dpi={product.dpi} current={upload} onUploaded={onUploaded} onRemove={onRemoveUpload} />
          )}

          {tab === "csv" && (
            <CsvPanel
              doc={doc} uid={uid} designId={designId} imageUrls={urls}
              attached={cfg.csvPath && cfg.csvRows ? { path: cfg.csvPath, rows: cfg.csvRows } : null}
              // One CSV row = one printed item, so the quantity follows the row count.
              onAttach={(path, rows) => setCfg((c) => ({ ...c, csvPath: path, csvRows: rows, quantity: Math.max(schema.quantity.min, rows) }))}
              onDetach={() => setCfg((c) => ({ ...c, csvPath: null, csvRows: null }))}
            />
          )}
        </section>

        <aside className="space-y-5" aria-label="Properties and order">
          {/* Print check leads the column: it decides whether Pay is enabled. */}
          <section className={`rounded-lg border-[1.5px] bg-sheet p-4 ${blocking.length ? "border-danger" : "border-ink"}`} aria-labelledby="pre-h">
            <h2 id="pre-h" className="mb-2 text-lg font-bold">{blocking.length ? "Fix before printing" : "Print check"}</h2>
            {blocking.length === 0 && notes.length === 0 && <p className="flex items-start gap-2 text-[15px] text-success"><span aria-hidden className="mt-1.5 size-2.5 shrink-0 rounded-full bg-success" />Ready to print: everything sits inside the safe area and all text fits.</p>}
            <ul className="space-y-1.5 text-[15px]">
              {blocking.map((m) => <li key={m} className="flex items-start gap-2 text-danger"><span aria-hidden className="mt-1.5 size-2.5 shrink-0 rounded-full bg-danger" />{m}</li>)}
              {notes.map((w) => <li key={w.elementId + w.message} className="flex items-start gap-2 text-warning"><span aria-hidden className="mt-1.5 size-2.5 shrink-0 rounded-full bg-warning" />{w.message}</li>)}
            </ul>
          </section>

          {tab === "design" && !fileOnly && (
            <section className="panel p-4" aria-labelledby="props-h">
              <h2 id="props-h" className="mb-3 text-lg font-bold">{selected ? (selected.type === "text" ? "Text" : selected.type === "image" ? "Image" : "Shape") : "Page"}</h2>
              <Inspector doc={doc} el={selected} csv={product.supports_csv} onChange={update} onDelete={remove} onDuplicate={duplicate} onLayer={layer} />
              {doc.elements.length > 0 && (
                <details className="mt-4 border-t border-hairline pt-3">
                  <summary className="cursor-pointer text-sm font-medium">Layers ({doc.elements.length})</summary>
                  <ul className="mt-2 space-y-1">
                    {[...doc.elements].reverse().map((el) => (
                      <li key={el.id}>
                        <button type="button" onClick={() => setSelectedId(el.id)} className={`w-full truncate rounded px-2 py-1 text-left text-sm ${el.id === selectedId ? "bg-accent/10 text-ink" : "text-steel hover:bg-mist"}`}>
                          {el.type === "text" ? `Text: ${el.text || "(empty)"}` : el.type === "image" ? "Image" : el.type === "rect" ? "Rectangle" : "Ellipse"}{el.locked ? " (fixed)" : ""}
                        </button>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </section>
          )}

          <section className="panel space-y-4 p-4" aria-labelledby="order-h">
            <h2 id="order-h" className="text-lg font-bold">Order</h2>
            <div>
              <label className="label" htmlFor="ed-material">Material</label>
              <select id="ed-material" className="field" value={cfg.materialId} onChange={(e) => setCfg((c) => ({ ...c, materialId: e.target.value }))}>
                {schema.materials.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="ed-qty">Quantity</label>
              <input id="ed-qty" type="number" className="field" min={Math.max(schema.quantity.min, cfg.csvRows ?? 0)} max={schema.quantity.max} value={Number.isFinite(cfg.quantity) ? cfg.quantity : ""} onChange={(e) => setCfg((c) => ({ ...c, quantity: e.target.valueAsNumber }))} />
              <p className="mt-1 text-xs text-steel">{schema.quantity.min.toLocaleString("en-GB")} to {schema.quantity.max.toLocaleString("en-GB")}{cfg.csvRows ? `; at least ${cfg.csvRows} for your CSV` : ""}</p>
            </div>
            <div aria-live="polite" className="rounded-md border-2 border-ink p-3">
              {price ? (
                <>
                  <div className="flex items-baseline justify-between">
                    <span className="text-sm tabular-nums text-steel">{cfg.quantity.toLocaleString("en-GB")} × {formatMoney(price.unitPence, "GBP", true)}</span>
                    <span className="font-display text-3xl font-extrabold tracking-tight">{formatMoney(price.totalPence)}</span>
                  </div>
                  <p className="mt-1 text-right text-sm tabular-nums text-steel">{material?.name}. Includes {formatMoney(price.vatPence)} VAT{price.setupPence ? ` and ${formatMoney(price.setupPence)} setup` : ""}.</p>
                </>
              ) : <p className="text-sm text-danger">Fix the order details to see a price.</p>}
            </div>
            <button type="button" className="btn-primary w-full" disabled={blocking.length > 0 || paying || !price} onClick={pay}>
              {paying ? "Opening secure checkout…" : price ? `Pay ${formatMoney(price.totalPence)} securely` : "Pay securely"}
            </button>
            <button type="button" className="btn-secondary w-full" onClick={save} disabled={saving || !dirty}>{saving ? "Saving…" : dirty ? "Save design" : "Design saved"}</button>
            <p className="text-sm text-steel">After payment you get a proof to approve. Nothing is printed until you approve it.</p>
            <p className="rounded-md bg-mist px-3 py-2 text-sm text-steel">Stripe test mode. Pay with card 4242 4242 4242 4242, any future date and any CVC.</p>
          </section>
        </aside>
      </div>
    </div>
  );
}
