import { SiteHeader } from "@/components/layout/site-header";

/**
 * Frame for every signed-in area (dashboard, events, tickets, clubs, door…):
 * the shared header with navigation, then the page. Before this existed those
 * pages had no header at all — the only way between them was a "back" link.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}
