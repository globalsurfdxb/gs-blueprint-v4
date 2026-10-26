import Image from "next/image";
import { LoginForm } from "./login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;
  const redirectTo = from && from.startsWith("/") ? from : "/";

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-[#1d1e24] via-[#15161a] to-[#0e0f12] px-4">
      {/* Brand glow + faint grid — decorative only. */}
      <div aria-hidden className="pointer-events-none absolute -right-32 -top-40 h-[28rem] w-[28rem] rounded-full bg-gs-red/30 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-48 -left-24 h-96 w-96 rounded-full bg-[#ff7a59]/10 blur-3xl" />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.06] [background-image:linear-gradient(to_right,white_1px,transparent_1px),linear-gradient(to_bottom,white_1px,transparent_1px)] [background-size:40px_40px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]"
      />

      <div className="relative w-full max-w-sm rounded-2xl bg-white p-8 shadow-lg ring-1 ring-white/10">
        <div className="mb-7">
          <h1 className="sr-only">GS Blueprint</h1>
          <Image src="/gs-blueprint-logo.svg" alt="GS Blueprint" width={208} height={34} priority unoptimized className="h-[34px] w-auto" />
          <p className="mt-3 font-body text-sm text-gs-gray">Where your projects, tasks, and time live.</p>
        </div>
        <LoginForm redirectTo={redirectTo} />
      </div>
    </div>
  );
}
