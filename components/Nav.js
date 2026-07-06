"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BloomMark } from "./ui";

const LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/orders", label: "Orders" },
  { href: "/payments", label: "Payments" },
  { href: "/expenses", label: "Expenses" },
  { href: "/invoices", label: "Invoices" },
  { href: "/customers", label: "Customers" },
  { href: "/inventory", label: "Inventory" },
  { href: "/planner", label: "Planner" },
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
          <BloomMark size={26} light />
          <div>
            <span className="brand-name">Petalique Flora</span>{" "}
            <span className="brand-sub">studio ops</span>
          </div>
          <span className="brand-user">
            {user.name} · {user.role}
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
