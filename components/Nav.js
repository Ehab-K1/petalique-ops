"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/inventory", label: "Inventory" },
  { href: "/orders", label: "Deliveries" },
  { href: "/customers", label: "Customers" },
  { href: "/planner", label: "Order Planner" },
  { href: "/team", label: "Team" },
];

export default function Nav({ user }) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="topnav">
      <div className="topnav-inner">
        <div className="brand">
          <span className="brand-name">Petalique Flora</span>
          <span className="brand-sub">studio operations</span>
          <span className="brand-user">
            {user.name} ({user.role})
            <button className="logout-btn" onClick={logout}>Log out</button>
          </span>
        </div>
        <div className="nav-links">
          {LINKS.filter((l) => l.href !== "/team" || user.role === "admin").map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={"nav-link" + (pathname === l.href ? " active" : "")}
            >
              {l.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
