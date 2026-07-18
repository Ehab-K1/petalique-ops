"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "./client";

export default function SettingsClient({ business, catalog }) {
  const router = useRouter();
  const [tab, setTab] = useState("business");
  const [biz, setBiz] = useState(business);
  const [saving, setSaving] = useState(false);
  const [newItem, setNewItem] = useState({ kind: "product", name: "", price_label: "", price: "" });
  const [trash, setTrash] = useState(null);

  async function saveBusiness(e) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch("/api/settings", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ business: biz }),
    });
    setSaving(false);
    if (res.ok) { toast("Settings saved — invoices and the order form now use them"); router.refresh(); }
    else toast("Could not save settings", "err");
  }

  async function catalogApi(method, body, msg) {
    const res = await fetch("/api/catalog", {
      method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    if (res.ok) { router.refresh(); if (msg) toast(msg); }
    else {
      const d = await res.json().catch(() => ({}));
      toast(d.error || "Could not update catalog", "err");
    }
    return res;
  }

  async function addItem(e) {
    e.preventDefault();
    if (!newItem.name.trim()) return;
    const res = await catalogApi("POST", newItem, "Added to catalog");
    if (res.ok) setNewItem({ ...newItem, name: "", price_label: "", price: "" });
  }

  async function loadTrash() {
    const res = await fetch("/api/trash");
    if (res.ok) setTrash((await res.json()).items);
  }
  useEffect(() => { if (tab === "trash") loadTrash(); }, [tab]);

  async function trashAction(item, action) {
    const res = await fetch("/api/trash", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entity: item.entity, id: item.id, action }),
    });
    if (res.ok) {
      toast(action === "restore" ? "Restored — it's back where it was" : "Permanently deleted");
      loadTrash();
      router.refresh();
    }
  }

  const products = catalog.filter((c) => c.kind === "product");
  const addons = catalog.filter((c) => c.kind === "addon");

  function CatalogRows({ items }) {
    return items.map((it) => (
      <div className={"catalog-row" + (it.active ? "" : " inactive")} key={it.id}>
        <button
          className={"switch" + (it.active ? " on" : "")}
          title={it.active ? "Shown on the order form" : "Hidden from the order form"}
          onClick={() => catalogApi("PATCH", { id: it.id, active: !it.active })}
        />
        <input type="text" defaultValue={it.name}
          onBlur={(e) => {
            if (e.target.value.trim() && e.target.value !== it.name) {
              catalogApi("PATCH", { id: it.id, name: e.target.value, price_label: it.price_label, price: it.price }, "Renamed");
            }
          }} />
        <input type="text" className="price-in" defaultValue={it.price_label || ""} placeholder="e.g. +$5"
          onBlur={(e) => {
            if (e.target.value !== (it.price_label || "")) {
              catalogApi("PATCH", { id: it.id, name: it.name, price_label: e.target.value, price: it.price }, "Updated");
            }
          }} />
        <button className="btn-danger btn" onClick={() => catalogApi("DELETE", { id: it.id }, "Removed")}>✕</button>
      </div>
    ));
  }

  return (
    <>
      <div className="tabs">
        <button className={"tab" + (tab === "business" ? " on" : "")} onClick={() => setTab("business")}>Business</button>
        <button className={"tab" + (tab === "catalog" ? " on" : "")} onClick={() => setTab("catalog")}>Product catalog</button>
        <button className={"tab" + (tab === "trash" ? " on" : "")} onClick={() => setTab("trash")}>🗑 Trash</button>
      </div>

      {tab === "business" && (
        <div className="card" style={{ maxWidth: 640 }}>
          <div className="card-title">Business profile</div>
          <p className="muted" style={{ marginBottom: 12 }}>
            Used on invoices, quotations, and the public order form. Change it once here, it changes everywhere.
          </p>
          <form className="stack" onSubmit={saveBusiness}>
            <div className="form-grid-2">
              <label className="field">
                <span>Business name</span>
                <input value={biz.name} onChange={(e) => setBiz({ ...biz, name: e.target.value })} required />
              </label>
              <label className="field">
                <span>Tagline</span>
                <input value={biz.tagline} onChange={(e) => setBiz({ ...biz, tagline: e.target.value })} />
              </label>
            </div>
            <div className="form-grid-2">
              <label className="field">
                <span>Email</span>
                <input type="email" value={biz.email} onChange={(e) => setBiz({ ...biz, email: e.target.value })} />
              </label>
              <label className="field">
                <span>Phone</span>
                <input value={biz.phone} onChange={(e) => setBiz({ ...biz, phone: e.target.value })} />
              </label>
            </div>
            <label className="field">
              <span>Studio address, optional</span>
              <input value={biz.address} onChange={(e) => setBiz({ ...biz, address: e.target.value })} />
            </label>
            <div className="form-grid-2">
              <label className="field">
                <span>Default tax rate % (new invoices)</span>
                <input type="number" min="0" step="0.01" value={biz.tax_rate}
                  onChange={(e) => setBiz({ ...biz, tax_rate: e.target.value })} />
              </label>
              <label className="field">
                <span>Default deposit % (quotes)</span>
                <input type="number" min="0" max="100" step="1" value={biz.deposit_pct}
                  onChange={(e) => setBiz({ ...biz, deposit_pct: e.target.value })} />
              </label>
            </div>
            <label className="field">
              <span>Invoice footer message</span>
              <input value={biz.invoice_footer} onChange={(e) => setBiz({ ...biz, invoice_footer: e.target.value })} />
            </label>
            <button className="btn" type="submit" disabled={saving}>{saving ? "Saving…" : "Save settings"}</button>
          </form>
        </div>
      )}

      {tab === "catalog" && (
        <>
          <p className="muted" style={{ marginBottom: 12 }}>
            These products and add-ons appear on your public order form. Toggle the switch to show or hide one — no code, no redeploy.
          </p>
          <div className="grid grid-2" style={{ alignItems: "start" }}>
            <div className="card">
              <div className="card-title">Products</div>
              <CatalogRows items={products} />
            </div>
            <div className="card">
              <div className="card-title">Customization add-ons</div>
              <CatalogRows items={addons} />
            </div>
          </div>
          <div className="card" style={{ marginTop: 14 }}>
            <div className="card-title">Add to catalog</div>
            <form className="stack" onSubmit={addItem}>
              <div className="form-grid-2">
                <label className="field">
                  <span>Type</span>
                  <select value={newItem.kind} onChange={(e) => setNewItem({ ...newItem, kind: e.target.value })}>
                    <option value="product">Product</option>
                    <option value="addon">Add-on</option>
                  </select>
                </label>
                <label className="field">
                  <span>Name</span>
                  <input value={newItem.name} onChange={(e) => setNewItem({ ...newItem, name: e.target.value })} required
                    placeholder="e.g. Dried Flower Frame" />
                </label>
              </div>
              <div className="form-grid-2">
                <label className="field">
                  <span>Price label shown to customers, optional</span>
                  <input value={newItem.price_label} onChange={(e) => setNewItem({ ...newItem, price_label: e.target.value })}
                    placeholder="e.g. +$15 or From $60" />
                </label>
                <label className="field">
                  <span>Numeric price, optional (for future pricing features)</span>
                  <input type="number" min="0" step="0.01" value={newItem.price}
                    onChange={(e) => setNewItem({ ...newItem, price: e.target.value })} />
                </label>
              </div>
              <button className="btn" type="submit">Add item</button>
            </form>
          </div>
        </>
      )}

      {tab === "trash" && (
        <div className="card">
          <div className="card-title">Trash</div>
          <p className="muted" style={{ marginBottom: 12 }}>
            Everything deleted anywhere in the app lands here. Restore puts it back exactly where it was, with all its links intact.
          </p>
          {trash === null && <div className="empty">Loading…</div>}
          {trash && trash.length === 0 && <div className="empty">Trash is empty. Deleted orders, customers, invoices, payments and expenses will appear here.</div>}
          {trash && trash.map((item) => (
            <div className="row" key={`${item.entity}-${item.id}`}>
              <div className="row-main">
                <div className="row-title">{item.title}</div>
                <div className="row-sub" style={{ textTransform: "capitalize" }}>{item.entity} · {item.sub}</div>
              </div>
              <div className="row-side">
                <button className="btn btn-ghost btn-sm" onClick={() => trashAction(item, "restore")}>↩ Restore</button>
                <button className="btn-danger btn" onClick={() => trashAction(item, "purge")}>Delete forever</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
