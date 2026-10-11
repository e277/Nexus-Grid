import Link from "next/link";

/** The mark and wordmark, as the console's rail draws them. */
export function Brand({ href = "/" }: { href?: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2.5 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ng-accent"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[7px] bg-ng-accent text-ng-xs font-extrabold tracking-tight text-ng-accent-fg">
        NG
      </span>
      <span className="text-ng-lg font-bold tracking-tight text-ng-primary">Nexus-Grid</span>
    </Link>
  );
}
