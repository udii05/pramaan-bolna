"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import {
  Activity,
  BarChart3,
  FileText,
  Megaphone,
  PhoneCall,
  ScrollText,
} from "lucide-react";
import { PramaanMark } from "@/components/mark";

const LINKS = [
  { href: "/", label: "Compliance feed", icon: Activity },
  { href: "/calls", label: "Calls", icon: PhoneCall },
  { href: "/campaigns", label: "Campaigns", icon: Megaphone },
  { href: "/reports/camp-q3", label: "Reports", icon: FileText },
  { href: "/rules", label: "Policy pack", icon: ScrollText },
  { href: "/metrics", label: "Calibration", icon: BarChart3 },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  if (href.startsWith("/reports") && pathname.startsWith("/reports")) return true;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function NavLinks() {
  const pathname = usePathname();
  return (
    <>
      {LINKS.map((link) => {
        const active = isActive(pathname, link.href);
        const Icon = link.icon;
        return (
          <Link
            key={link.href}
            href={link.href}
            className={clsx("nav-item", active && "active")}
            aria-current={active ? "page" : undefined}
          >
            <Icon />
            <span>{link.label}</span>
          </Link>
        );
      })}
    </>
  );
}

export function Brand() {
  return (
    <Link href="/" className="brand" aria-label="Pramaan home">
      <PramaanMark />
      <span>
        <span className="brand-word">
          Pra<em>maan</em>
        </span>
        <small>AI compliance evidence</small>
      </span>
    </Link>
  );
}
