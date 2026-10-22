import Link from "next/link";

/**
 * The header of a project's card on list pages (My Reviews, …): the project name (links to the project)
 * with its task count, the client name underneath, and anything passed as children on the right.
 */
export function ProjectCardHeader({
  projectId,
  name,
  client,
  count,
  unit = "task",
  children,
}: {
  projectId: string;
  name: string;
  client: string;
  count: number;
  unit?: string;
  children?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-gs-gray/10 px-4 py-3.5">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-[15px] font-semibold leading-snug">
            <Link href={`/projects/${projectId}`} title="Open this project" className="hover:text-gs-red hover:underline">
              {name}
            </Link>
          </h2>
          <span className="rounded-full bg-gs-light px-2 py-0.5 text-xs font-semibold tabular-nums text-gs-gray">
            {count} {unit}
            {count === 1 ? "" : "s"}
          </span>
        </div>
        <p className="mt-0.5 text-sm text-gs-gray">{client}</p>
      </div>
      {children}
    </header>
  );
}
