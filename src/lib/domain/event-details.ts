import { EventTag } from "@/generated/prisma/enums";

/**
 * Posters, tags and social links — the rules, as plain functions.
 *
 * Shared by the Zod schemas (server authority + instant form feedback) and the
 * UI, and unit-tested on their own. Nothing here fetches anything: the server
 * never downloads a pasted link (that would let anyone make it call arbitrary
 * addresses), it only checks the shape and tidies it up.
 */

export type LinkCheck = { ok: true; url: string } | { ok: false; message: string };

const MAX_URL_LENGTH = 2048;

function parseHttps(raw: string): URL | null {
  let value = raw.trim();
  if (value.length === 0 || value.length > MAX_URL_LENGTH) return null;
  // People paste "www.instagram.com/x" without a scheme; browsers would treat that as a relative path.
  if (!/^[a-z][a-z0-9+.-]*:/i.test(value)) value = `https://${value}`;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  // http is upgraded (every host we care about serves https); anything else is refused.
  if (url.protocol === "http:") url.protocol = "https:";
  if (url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  if (!url.hostname.includes(".")) return null;
  return url;
}

function hostIs(url: URL, ...hosts: string[]): boolean {
  const host = url.hostname.toLowerCase();
  return hosts.some((candidate) => host === candidate || host === `www.${candidate}`);
}

// ─── Posters ─────────────────────────────────────────────────────────────────

/**
 * A Google Drive "share" link opens a viewer page, not the picture. The
 * thumbnail endpoint returns the image itself for files shared as
 * "Anyone with the link".
 */
function driveFileId(url: URL): string | null {
  if (!hostIs(url, "drive.google.com")) return null;
  const fromPath = url.pathname.match(/^\/file\/d\/([\w-]{10,})/);
  if (fromPath?.[1]) return fromPath[1];
  if (url.pathname === "/open" || url.pathname === "/uc" || url.pathname === "/thumbnail") {
    const id = url.searchParams.get("id");
    if (id && /^[\w-]{10,}$/.test(id)) return id;
  }
  return null;
}

/**
 * The demo posters shipped with the app live in `public/posters/`. They are
 * accepted as-is so a seeded event can be edited and saved without its poster
 * being rejected — and only that folder and image extensions, so a poster can
 * never point the browser at one of the app's own pages or API routes.
 */
const BUNDLED_POSTER = /^\/posters\/[a-z0-9][a-z0-9._-]{0,100}\.(?:jpe?g|png|webp)$/i;

export function normalizePosterUrl(raw: string): LinkCheck {
  const trimmed = raw.trim();
  if (BUNDLED_POSTER.test(trimmed) && !trimmed.includes("..")) return { ok: true, url: trimmed };

  const url = parseHttps(raw);
  if (!url) {
    return { ok: false, message: "Paste a full web address starting with https://" };
  }

  const driveId = driveFileId(url);
  if (driveId) {
    return { ok: true, url: `https://drive.google.com/thumbnail?id=${driveId}&sz=w1600` };
  }
  if (hostIs(url, "drive.google.com", "docs.google.com")) {
    return {
      ok: false,
      message: "That Google link isn't a single file. Open the poster in Drive, choose Share → Copy link, and paste that.",
    };
  }
  if (hostIs(url, "instagram.com", "instagr.am", "facebook.com", "fb.com", "photos.app.goo.gl", "photos.google.com")) {
    return {
      ok: false,
      message:
        "That link opens a post page, not the picture itself. Upload the poster to Google Drive (Share → Anyone with the link) and paste that link instead.",
    };
  }
  return { ok: true, url: url.toString() };
}

// ─── Instagram ───────────────────────────────────────────────────────────────

const INSTAGRAM_HANDLE = /^@?([a-z0-9._]{1,30})$/i;

export function normalizeInstagramUrl(raw: string): LinkCheck {
  const trimmed = raw.trim();
  const handle = trimmed.startsWith("@") ? trimmed.match(INSTAGRAM_HANDLE) : null;
  if (handle?.[1]) return { ok: true, url: `https://www.instagram.com/${handle[1]}/` };

  const url = parseHttps(trimmed);
  if (!url || !hostIs(url, "instagram.com", "m.instagram.com", "instagr.am")) {
    return { ok: false, message: "Paste an Instagram link (instagram.com/…) or a handle like @roboticsclub." };
  }
  const path = url.pathname.replace(/\/+$/, "");
  if (path === "") {
    return { ok: false, message: "That's Instagram's home page — paste the link to the club's page or the post." };
  }
  // Share links carry tracking (?igsh=…); the page works without it.
  return { ok: true, url: `https://www.instagram.com${path}/` };
}

// ─── WhatsApp ────────────────────────────────────────────────────────────────

export function normalizeWhatsappUrl(raw: string): LinkCheck {
  const url = parseHttps(raw);
  const invalid: LinkCheck = {
    ok: false,
    message: "Paste a WhatsApp group invite (chat.whatsapp.com/…), a channel link, or a wa.me link.",
  };
  if (!url) return invalid;

  if (hostIs(url, "chat.whatsapp.com")) {
    const code = url.pathname.replace(/^\/+|\/+$/g, "");
    if (!/^[\w-]{8,}$/.test(code)) return invalid;
    return { ok: true, url: `https://chat.whatsapp.com/${code}` };
  }
  if (hostIs(url, "whatsapp.com") && /^\/channel\/[\w-]{8,}\/?$/.test(url.pathname)) {
    return { ok: true, url: `https://whatsapp.com${url.pathname.replace(/\/+$/, "")}` };
  }
  if (hostIs(url, "wa.me") && /^\/\+?\d{6,15}\/?$/.test(url.pathname)) {
    // wa.me keeps its ?text= prefill; nothing else is passed along.
    const text = url.searchParams.get("text");
    const base = `https://wa.me${url.pathname.replace(/\/+$/, "").replace("/+", "/")}`;
    return { ok: true, url: text ? `${base}?text=${encodeURIComponent(text)}` : base };
  }
  return invalid;
}

// ─── Tags ────────────────────────────────────────────────────────────────────

export const MAX_EVENT_TAGS = 3;

/** Display order on the form and the board. */
export const EVENT_TAGS = [
  EventTag.TECHNICAL,
  EventTag.CULTURAL,
  EventTag.WORKSHOP,
  EventTag.COMPETITION,
  EventTag.TALK,
  EventTag.SPORTS,
  EventTag.MUSIC,
  EventTag.ARTS,
  EventTag.SOCIAL,
  EventTag.CAREER,
] as const;

export const EVENT_TAG_LABELS: Record<EventTag, string> = {
  TECHNICAL: "Technical",
  CULTURAL: "Cultural",
  WORKSHOP: "Workshop",
  SPORTS: "Sports",
  COMPETITION: "Competition",
  TALK: "Talk",
  MUSIC: "Music",
  ARTS: "Arts",
  SOCIAL: "Social",
  CAREER: "Career",
};

/** `?tag=technical` in the address bar ↔ `TECHNICAL`. Unknown values are ignored, never an error. */
export function tagFromParam(value: unknown): EventTag | null {
  if (typeof value !== "string") return null;
  const upper = value.trim().toUpperCase();
  return (EVENT_TAGS as readonly string[]).includes(upper) ? (upper as EventTag) : null;
}

export function tagToParam(tag: EventTag): string {
  return tag.toLowerCase();
}
