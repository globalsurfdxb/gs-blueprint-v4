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
          <div className="flex items-center gap-3">
            <span
              aria-hidden
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-gs-red to-[#ff7a59] shadow-[0_6px_16px_-4px_rgba(230,62,49,0.6)]"
            >
              <span className="h-3 w-3 rounded-[3px] bg-white" />
            </span>
            <h1 className="font-heading text-xl font-semibold tracking-tight">GS Blueprint</h1>
          </div>
          <p className="mt-3 font-body text-sm text-gs-gray">Where your projects, tasks, and time live.</p>
        </div>
        <LoginForm redirectTo={redirectTo} />
      </div>
    </div>
  );
}
