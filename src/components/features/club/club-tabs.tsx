"use client";

import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { cn } from "@/lib/utils";

export type ClubTab = {
  readonly value: string;
  readonly label: string;
  /** A small number next to the label (members, events…). Omitted when null. */
  readonly count?: number | null;
  readonly content: React.ReactNode;
};

/**
 * Builds the address for a tab without a page load. The first tab has a clean
 * URL; the others get `?tab=…`, so a link, a refresh or Back lands on the same tab.
 */
function hrefForTab(pathname: string, params: URLSearchParams, value: string, firstValue: string): string {
  const next = new URLSearchParams(params);
  if (value === firstValue) next.delete("tab");
  else next.set("tab", value);
  const query = next.toString();
  return query ? `${pathname}?${query}` : pathname;
}

/**
 * The club page's tabs: Overview · Events · Members · Openings · Invite links.
 *
 * The open tab lives in the address bar (`?tab=members`). Switching uses
 * `history.replaceState`, which Next.js keeps in sync with `useSearchParams`, so
 * there is no server round trip and Back still leaves the club page in one step.
 *
 * Every panel is rendered on the server and kept in the page (just hidden), so
 * switching is instant and nothing re-fetches.
 */
export function ClubTabs({ tabs, initial }: { tabs: readonly ClubTab[]; initial: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const firstValue = tabs[0]?.value ?? "overview";

  const fromUrl = searchParams.get("tab");
  const isTab = useCallback((value: unknown): value is string => tabs.some((tab) => tab.value === value), [tabs]);
  const [current, setCurrent] = useState(isTab(fromUrl) ? fromUrl : isTab(initial) ? initial : firstValue);

  // The address changed from elsewhere (an Overview tile, Back/Forward): follow it.
  useEffect(() => {
    setCurrent(isTab(fromUrl) ? fromUrl : firstValue);
  }, [fromUrl, isTab, firstValue]);

  const select = useCallback(
    (value: unknown) => {
      if (!isTab(value)) return;
      setCurrent(value);
      // `null` state on purpose: passing Next.js's own history entry makes it
      // treat the change as internal and skip syncing useSearchParams.
      window.history.replaceState(
        null,
        "",
        hrefForTab(pathname, new URLSearchParams(window.location.search), value, firstValue),
      );
    },
    [pathname, isTab, firstValue],
  );

  return (
    <TabsPrimitive.Root value={current} onValueChange={select} className="flex flex-col gap-6">
      {/* Scrolls sideways on narrow phones instead of squashing the labels. */}
      <div className="-mx-4 overflow-x-auto border-b border-border px-4 sm:mx-0 sm:px-0">
        <TabsPrimitive.List aria-label="Club sections" className="flex w-max min-w-full gap-1">
          {tabs.map((tab) => (
            <TabsPrimitive.Tab
              key={tab.value}
              value={tab.value}
              className={cn(
                "relative -mb-px inline-flex items-center gap-2 border-b-2 border-transparent px-3 py-2.5 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors outline-none",
                "hover:text-foreground focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ring",
                "data-active:border-primary data-active:text-foreground",
              )}
            >
              {tab.label}
              {tab.count !== undefined && tab.count !== null ? (
                <span className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[0.6875rem] text-muted-foreground tabular-nums">
                  {tab.count}
                </span>
              ) : null}
            </TabsPrimitive.Tab>
          ))}
        </TabsPrimitive.List>
      </div>

      {tabs.map((tab) => (
        <TabsPrimitive.Panel
          key={tab.value}
          value={tab.value}
          keepMounted
          className="flex flex-col gap-6 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background data-[hidden]:hidden"
        >
          {tab.content}
        </TabsPrimitive.Panel>
      ))}
    </TabsPrimitive.Root>
  );
}

/** A button that opens another tab — used by the Overview's "at a glance" tiles. */
export function ClubTabLink({
  tab,
  className,
  children,
}: {
  tab: string;
  className?: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        const params = new URLSearchParams(window.location.search);
        params.set("tab", tab);
        window.history.replaceState(null, "", `${pathname}?${params.toString()}`);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }}
    >
      {children}
    </button>
  );
}
