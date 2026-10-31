"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavLink = { href: string; label: string; exact?: boolean };

// The dashboard's sections, with the current one highlighted: the home link only on the dashboard page
// itself, the others on their page and everything under it (/brands, /brands/new, /brands/<id>).
// The URL is only known when the page is opened (e.g. /brands/<id>), so the layout wraps this in
// <Suspense> with <NavBar> (the same links, nothing highlighted) as the fallback.
export function NavLinks({ links }: { links: NavLink[] }) {
  return <NavBar links={links} pathname={usePathname()} />;
}

export function NavBar({ links, pathname }: { links: NavLink[]; pathname?: string }) {
  return (
    <nav className="mx-auto flex w-full max-w-6xl gap-1 overflow-x-auto overflow-y-hidden px-4">
      {links.map(({ href, label, exact }) => {
        const active =
          pathname !== undefined && (exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`));
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={
              "border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors " +
              (active ? "border-brand text-ink" : "border-transparent text-muted hover:text-ink")
            }
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
