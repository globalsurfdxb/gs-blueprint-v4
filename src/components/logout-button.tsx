"use client";

import { useRouter } from "next/navigation";

const DEFAULT_CLASS = "btn btn-secondary";

export function LogoutButton({ className }: { className?: string }) {
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <button onClick={handleLogout} className={className ?? DEFAULT_CLASS}>
      Sign out
    </button>
  );
}
