"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BloomMark } from "./ui";
import CommandPalette from "./CommandPalette";
import NotificationBell from "./NotificationBell";
import {
  IconDashboard, IconFlower, IconFile, IconBanknote, IconUsers, IconUser,
  IconLeaf, IconClipboard, IconReceipt, IconChart, IconSettings,
  IconExternal, IconLogout, IconPlus,
} from "./icons";

const GROUPS = [
  {
    label: null,
    links: [{ href: "/", label: "Dashboard", icon: IconDashboard }],
  },
  {
    label: "Sales",
    links: [
      { href: "/orders", label: "Orders", icon: IconFlower },
      { href: "/invoices", label: "Invoices & quotes", icon: IconFile },
      { href: "/payments", label: "Payments", icon: IconBanknote },
    ],
  },
  {
    label: "People",
    links: [
      { href: "/customers", label: "Customers", icon: IconUsers },
      { href: "/team", label: "Team", icon: IconUser, admin: true },
    ],
  },
  {
    label: "Studio",
    links: [
      { href: "/inventory", label: "Inventory", icon: IconLeaf },
      { href: "/planner", label: "Planner", icon: IconClipboard },
      { href: "/expenses", label: "Expenses", icon: IconReceipt },
    ],
  },
  {
    label: "Insights",
    links: [{ href: "/reports", label: "Reports", icon: IconChart }],
  },
  {
    label: "System",
    links: [{ href: "/settings", label: "Settings", icon: IconSettings, admin: true }],
  },
];

const QUICK_ADD = [
  { href: "/orders?new=1", label: "New order", icon: IconFlower },
  { href: "/invoices?new=1", label: "New invoice / quote", icon: IconFile },
  { href: "/payments?new=1", label: "Record payment", icon: IconBanknote },
  { href: "/customers?new=1", label: "Add customer", icon: IconUsers },
  { href: "/expenses?new=1", label: "Log expense", icon: IconReceipt },
];

export default function Nav({ user }) {
  const pathname = usePathname();
  const router = useRouter();
  const [drawer, setDrawer] = useState(false);
  const [palette, setPalette] = useState(false);
  const [quickAdd, setQuickAdd] = useState(false);

  useEffect(() => { setDrawer(false); setQuickAdd(false); }, [pathname]);

  useEffect(() => {
    function onKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((p) => !p);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  function isActive(href) {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(href + "/");
  }

  const sidebarBody = (
    <>
      <Link href="/" className="side-brand">
        <BloomMark size={28} light />
        <div>
          <div className="side-brand-name">Petalique Flora</div>
          <div className="side-brand-sub">Studio OS</div>
        </div>
      </Link>
      <nav className="side-nav">
        {GROUPS.map((g, gi) => {
          const links = g.links.filter((l) => !l.admin || user.role === "admin");
          if (links.length === 0) return null;
          return (
            <div className="side-group" key={gi}>
              {g.label && <div className="side-group-label">{g.label}</div>}
              {links.map((l) => {
                const Ic = l.icon;
                return (
                  <Link key={l.href} href={l.href}
                    className={"side-link" + (isActive(l.href) ? " active" : "")}>
                    <span className="side-icon"><Ic size={16} /></span>
                    {l.label}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>
      <div className="side-foot">
        <a href="/order" target="_blank" rel="noreferrer" className="side-link side-link-dim">
          <span className="side-icon"><IconExternal size={15} /></span>
          Customer order form
        </a>
        <div className="side-user">
          <div className="side-avatar">{(user.name || "?").slice(0, 1).toUpperCase()}</div>
          <div className="side-user-meta">
            <div className="side-user-name">{user.name}</div>
            <div className="side-user-role">{user.role}</div>
          </div>
          <button className="side-logout" onClick={logout} title="Log out">
            <IconLogout size={14} />
          </button>
        </div>
      </div>
    </>
  );

  return (
    <>
      <aside className="sidebar">{sidebarBody}</aside>

      {drawer && (
        <div className="drawer-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setDrawer(false); }}>
          <aside className="sidebar sidebar-drawer">{sidebarBody}</aside>
        </div>
      )}

      <header className="topbar">
        <button className="topbar-burger" onClick={() => setDrawer(true)} aria-label="Menu">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>
        <button className="topbar-search" onClick={() => setPalette(true)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
            <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" />
          </svg>
          <span>Search anything…</span>
          <kbd>⌘K</kbd>
        </button>
        <div className="topbar-spacer" />
        <div className="quickadd-wrap">
          <button className="btn btn-sm" onClick={() => setQuickAdd((q) => !q)}>
            <IconPlus size={14} /> New
          </button>
          {quickAdd && (
            <>
              <div className="menu-overlay" onMouseDown={() => setQuickAdd(false)} />
              <div className="menu-panel">
                {QUICK_ADD.map((q) => {
                  const Ic = q.icon;
                  return (
                    <Link key={q.href} href={q.href} className="menu-item" onClick={() => setQuickAdd(false)}>
                      <span className="menu-icon"><Ic size={15} /></span>
                      {q.label}
                    </Link>
                  );
                })}
              </div>
            </>
          )}
        </div>
        <NotificationBell />
      </header>

      {palette && <CommandPalette onClose={() => setPalette(false)} />}
    </>
  );
}
