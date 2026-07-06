"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const BLANK = { name: "", email: "", password: "", role: "staff" };

export default function TeamClient({ users, me }) {
  const router = useRouter();
  const [form, setForm] = useState(BLANK);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmId, setConfirmId] = useState(null);

  async function api(method, body) {
    const res = await fetch("/api/users", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) router.refresh();
    return res;
  }

  async function addUser(e) {
    e.preventDefault();
    setError("");
    setSaving(true);
    const res = await api("POST", form);
    setSaving(false);
    if (res.ok) {
      setForm(BLANK);
    } else {
      const d = await res.json().catch(() => ({}));
      setError(d.error || "Could not create user.");
    }
  }

  return (
    <>
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-title">Add a team member</div>
        <form className="stack" onSubmit={addUser}>
          <div className="form-grid-2">
            <label className="field">
              <span>Name</span>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </label>
            <label className="field">
              <span>Email</span>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            </label>
          </div>
          <div className="form-grid-2">
            <label className="field">
              <span>Password (at least 8 characters)</span>
              <input type="text" value={form.password} minLength={8}
                onChange={(e) => setForm({ ...form, password: e.target.value })} required />
            </label>
            <label className="field">
              <span>Role</span>
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                <option value="staff">Staff</option>
                <option value="admin">Admin</option>
              </select>
            </label>
          </div>
          {error && <div className="error-text">{error}</div>}
          <button className="btn" type="submit" disabled={saving}>
            {saving ? "Creating..." : "Create login"}
          </button>
        </form>
        <p className="muted" style={{ marginTop: 10 }}>
          Share the email and password with your partner privately, then ask them to sign in.
        </p>
      </div>

      <div className="card">
        <div className="card-title">Current team</div>
        {users.map((u) => (
          <div className="row" key={u.id}>
            <div className="row-main">
              <div className="row-title">{u.name}</div>
              <div className="row-sub">{u.email}</div>
            </div>
            <div className="row-side">
              <span className={"pill " + (u.role === "admin" ? "pill-green" : "pill-gray")}>{u.role}</span>
              {u.id !== me && (
                confirmId === u.id ? (
                  <>
                    <span className="error-text">Remove?</span>
                    <button className="btn btn-sm" style={{ background: "#a8462b" }}
                      onClick={() => { api("DELETE", { id: u.id }); setConfirmId(null); }}>
                      Yes
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setConfirmId(null)}>No</button>
                  </>
                ) : (
                  <button className="btn-danger btn" onClick={() => setConfirmId(u.id)}>Remove</button>
                )
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
