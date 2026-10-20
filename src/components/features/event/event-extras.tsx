"use client";

import Link from "next/link";
import { useState } from "react";
import { ImageOff, Lock } from "lucide-react";

import type { EventTag } from "@/generated/prisma/enums";
import { EVENT_TAG_LABELS, tagToParam } from "@/lib/domain/event-details";
import { cn } from "@/lib/utils";

/**
 * Small pieces shared by every place an event is shown: the poster, the tag
 * chips and the social links. Presentational only — callers decide what a
 * viewer may see (the WhatsApp link in particular never reaches a browser
 * that isn't allowed it; see `whatsappLinkFor`).
 */

// ─── Poster ──────────────────────────────────────────────────────────────────

/**
 * A pasted poster link, rendered by the browser (the server never downloads
 * it). Links break — a Drive file gets unshared, a host goes down — so a
 * failed load turns into a quiet placeholder instead of a broken-image icon.
 */
export function EventPoster({
  src,
  title,
  variant,
  className,
}: {
  src: string;
  title: string;
  variant: "card" | "hero" | "thumb";
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    if (variant === "card") return null;
    return (
      <div
        className={cn(
          "flex items-center justify-center gap-2 rounded-lg border border-dashed border-foreground/20 bg-secondary/50 text-sm text-muted-foreground",
          variant === "hero" ? "aspect-[4/5] w-full" : "size-14 shrink-0",
          className,
        )}
      >
        <ImageOff className="size-4" />
        {variant === "hero" ? "Poster couldn't be loaded" : null}
      </div>
    );
  }

  return (
    // A plain <img>: posters come from any host the organiser pastes, which
    // next/image would need listed in advance. No referrer is sent, so the
    // host doesn't learn which event page the viewer was on.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={variant === "thumb" ? "" : `Poster for ${title}`}
      loading={variant === "hero" ? "eager" : "lazy"}
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={cn(
        "bg-secondary object-cover",
        // Posters are portrait and put the title at the top — keep the top.
        variant === "card" && "aspect-[3/2] w-full border-b border-border object-top",
        variant === "hero" && "w-full rounded-lg border border-foreground/80 shadow-print dark:border-foreground/25",
        variant === "thumb" && "size-14 shrink-0 rounded-md border border-border",
        className,
      )}
    />
  );
}

// ─── Tags ────────────────────────────────────────────────────────────────────

export function TagChips({
  tags,
  linkTo,
  className,
}: {
  tags: readonly EventTag[];
  /** When set, each chip links to the public board filtered by that tag. */
  linkTo?: "board";
  className?: string;
}) {
  if (tags.length === 0) return null;

  const chip =
    "inline-flex items-center rounded-full border border-foreground/20 px-2 py-0.5 text-xs font-medium text-foreground/80";

  return (
    <ul className={cn("flex flex-wrap gap-1.5", className)} aria-label="Tags">
      {tags.map((tag) => (
        <li key={tag}>
          {linkTo === "board" ? (
            <Link
              href={`/dashboard?tag=${tagToParam(tag)}`}
              className={cn(chip, "transition-colors hover:border-primary hover:text-primary")}
            >
              {EVENT_TAG_LABELS[tag]}
            </Link>
          ) : (
            <span className={chip}>{EVENT_TAG_LABELS[tag]}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

// ─── Social links ────────────────────────────────────────────────────────────

function InstagramGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.6" fill="currentColor" />
    </svg>
  );
}

function WhatsappGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M20 11.5a8.5 8.5 0 0 1-12.6 7.4L3.5 20l1.2-3.8A8.5 8.5 0 1 1 20 11.5Z" strokeLinejoin="round" />
      <path d="M9 8.5c0 3.5 3 6.5 6.5 6.5l1-1.6-2-1-1 .9c-1-.4-2.1-1.5-2.5-2.5l.9-1-1-2Z" fill="currentColor" stroke="none" />
    </svg>
  );
}

const linkRow =
  "flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2.5 text-sm transition-colors";

/**
 * Instagram (public) and WhatsApp (seat holders only).
 *
 * `whatsapp.url` is only ever non-null for organisers and people holding a
 * seat — the server decides; here we just show either the link or the reason
 * it's hidden.
 */
export function EventLinks({
  instagramUrl,
  whatsapp,
  className,
}: {
  instagramUrl: string | null;
  whatsapp: { readonly exists: boolean; readonly url: string | null };
  className?: string;
}) {
  if (!instagramUrl && !whatsapp.exists) return null;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <span className="eyebrow">Follow along</span>
      {instagramUrl ? (
        <a
          href={instagramUrl}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className={cn(linkRow, "hover:border-foreground/40")}
        >
          <InstagramGlyph className="size-4 shrink-0 text-primary" />
          <span className="flex-1 font-medium">Instagram</span>
          <span className="text-xs text-muted-foreground">Opens in a new tab</span>
        </a>
      ) : null}
      {whatsapp.exists ? (
        whatsapp.url ? (
          <a
            href={whatsapp.url}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className={cn(linkRow, "hover:border-foreground/40")}
          >
            <WhatsappGlyph className="size-4 shrink-0 text-success" />
            <span className="flex-1 font-medium">Join the WhatsApp group</span>
            <span className="text-xs text-muted-foreground">For ticket holders</span>
          </a>
        ) : (
          <div className={cn(linkRow, "text-muted-foreground")}>
            <Lock className="size-4 shrink-0" />
            <span className="flex-1">Get a ticket to join the WhatsApp group</span>
          </div>
        )
      ) : null}
    </div>
  );
}
