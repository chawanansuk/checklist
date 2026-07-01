import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { ROLE_LABEL_TH } from "@/lib/format";
import { signOut } from "./actions";

const NAV = [
  { href: "/", label: "แดชบอร์ด" },
  { href: "/tasks", label: "งาน" },
  { href: "/templates", label: "แม่แบบงาน" },
  { href: "/properties", label: "อาคาร" },
  { href: "/staff", label: "พนักงาน" },
];

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold">PropOps</span>
            <span className="hidden text-xs text-gray-400 sm:inline">
              เช็คลิสต์งานอสังหาฯ
            </span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-gray-500 sm:inline">
              {profile.full_name} · {ROLE_LABEL_TH[profile.role]}
            </span>
            <form action={signOut}>
              <button className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50">
                ออกจากระบบ
              </button>
            </form>
          </div>
        </div>
        <nav className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-2 pb-2">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="whitespace-nowrap rounded-md px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
