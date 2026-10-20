import { describe, expect, it } from "vitest";

import {
  EVENT_TAG_LABELS,
  EVENT_TAGS,
  MAX_EVENT_TAGS,
  normalizeInstagramUrl,
  normalizePosterUrl,
  normalizeWhatsappUrl,
  tagFromParam,
  tagToParam,
} from "@/lib/domain/event-details";
import { createEventSchema, updateEventSchema } from "@/lib/validation/event";

const okUrl = (result: ReturnType<typeof normalizePosterUrl>) => (result.ok ? result.url : `ERROR: ${result.message}`);

describe("normalizePosterUrl", () => {
  it("turns a Google Drive share link into a direct image link", () => {
    const share = "https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUv/view?usp=sharing";
    expect(okUrl(normalizePosterUrl(share))).toBe(
      "https://drive.google.com/thumbnail?id=1AbCdEfGhIjKlMnOpQrStUv&sz=w1600",
    );
  });

  it("understands the other Drive link shapes", () => {
    for (const link of [
      "https://drive.google.com/open?id=1AbCdEfGhIjKlMnOpQrStUv",
      "https://drive.google.com/uc?export=view&id=1AbCdEfGhIjKlMnOpQrStUv",
      "drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUv",
    ]) {
      expect(okUrl(normalizePosterUrl(link))).toContain("thumbnail?id=1AbCdEfGhIjKlMnOpQrStUv");
    }
  });

  it("is idempotent, so the server can re-check what the form already tidied", () => {
    const once = okUrl(normalizePosterUrl("https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUv/view"));
    expect(okUrl(normalizePosterUrl(once))).toBe(once);
  });

  it("accepts any https image link and upgrades http", () => {
    expect(okUrl(normalizePosterUrl("https://i.imgur.com/abc123.png"))).toBe("https://i.imgur.com/abc123.png");
    expect(okUrl(normalizePosterUrl("http://example.org/poster.jpg"))).toBe("https://example.org/poster.jpg");
    expect(okUrl(normalizePosterUrl("example.org/poster.jpg"))).toBe("https://example.org/poster.jpg");
  });

  it("accepts the posters bundled with the app, and nothing else on our own site", () => {
    expect(okUrl(normalizePosterUrl("/posters/robowars-2026.jpg"))).toBe("/posters/robowars-2026.jpg");
    expect(normalizePosterUrl("/api/auth/signout").ok).toBe(false);
    expect(normalizePosterUrl("/posters/../api/health.png").ok).toBe(false);
    expect(normalizePosterUrl("//evil.example/x.png").ok).toBe(true); // becomes https://evil.example — just an image host
  });

  it("refuses links that are not pictures, with a reason a person can act on", () => {
    const insta = normalizePosterUrl("https://www.instagram.com/p/Cx123/");
    expect(insta.ok).toBe(false);
    if (!insta.ok) expect(insta.message).toMatch(/Google Drive/);

    const folder = normalizePosterUrl("https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOp");
    expect(folder.ok).toBe(false);
    if (!folder.ok) expect(folder.message).toMatch(/single file/);

    for (const bad of ["javascript:alert(1)", "data:image/png;base64,AAAA", "ftp://x.org/a.png", "https://user:pw@x.org/a.png", "localhost/a.png", "not a link"]) {
      expect(normalizePosterUrl(bad).ok, bad).toBe(false);
    }
  });
});

describe("normalizeInstagramUrl", () => {
  it("expands a handle", () => {
    expect(okUrl(normalizeInstagramUrl("@vit_robotics"))).toBe("https://www.instagram.com/vit_robotics/");
  });

  it("strips share tracking and keeps the page", () => {
    expect(okUrl(normalizeInstagramUrl("https://instagram.com/p/Cx123/?igsh=abc"))).toBe(
      "https://www.instagram.com/p/Cx123/",
    );
    expect(okUrl(normalizeInstagramUrl("www.instagram.com/vit_robotics"))).toBe("https://www.instagram.com/vit_robotics/");
  });

  it("refuses other sites and Instagram's home page", () => {
    expect(normalizeInstagramUrl("https://facebook.com/x").ok).toBe(false);
    expect(normalizeInstagramUrl("https://instagram.com.evil.example/x").ok).toBe(false);
    expect(normalizeInstagramUrl("https://www.instagram.com/").ok).toBe(false);
  });
});

describe("normalizeWhatsappUrl", () => {
  it("accepts group invites, channels and wa.me", () => {
    expect(okUrl(normalizeWhatsappUrl("https://chat.whatsapp.com/DemoInviteCodeClubHub0001"))).toBe(
      "https://chat.whatsapp.com/DemoInviteCodeClubHub0001",
    );
    expect(normalizeWhatsappUrl("https://whatsapp.com/channel/0029VaAbCdEfGh").ok).toBe(true);
    expect(normalizeWhatsappUrl("https://wa.me/919800000000").ok).toBe(true);
  });

  it("refuses anything else", () => {
    expect(normalizeWhatsappUrl("https://chat.whatsapp.com/").ok).toBe(false);
    expect(normalizeWhatsappUrl("https://example.org/chat").ok).toBe(false);
    expect(normalizeWhatsappUrl("https://chat.whatsapp.com.evil.example/abcdefgh").ok).toBe(false);
  });
});

describe("tags", () => {
  it("has a label for every tag and round-trips through the address bar", () => {
    for (const tag of EVENT_TAGS) {
      expect(EVENT_TAG_LABELS[tag]).toBeTruthy();
      expect(tagFromParam(tagToParam(tag))).toBe(tag);
    }
  });

  it("ignores unknown or repeated ?tag= values instead of failing", () => {
    expect(tagFromParam("Technical")).toBe("TECHNICAL");
    expect(tagFromParam("nonsense")).toBeNull();
    expect(tagFromParam(["technical", "music"])).toBeNull();
    expect(tagFromParam(undefined)).toBeNull();
  });
});

describe("event schemas — Phase 9 fields", () => {
  const base = {
    title: "RoboWars",
    start: "2030-01-10T10:00",
    end: "2030-01-10T12:00",
    isPublic: true,
    waitlistEnabled: false,
  };
  const create = createEventSchema("Asia/Kolkata");
  const update = updateEventSchema("Asia/Kolkata");

  it("tidies links and treats blanks as 'no link'", () => {
    const parsed = create.parse({
      ...base,
      posterUrl: "https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUv/view",
      instagramUrl: "@vit_robotics",
      whatsappUrl: "  ",
      tags: ["TECHNICAL"],
    });
    expect(parsed.posterUrl).toContain("/thumbnail?id=");
    expect(parsed.instagramUrl).toBe("https://www.instagram.com/vit_robotics/");
    expect(parsed.whatsappUrl).toBeNull();
  });

  it(`allows at most ${MAX_EVENT_TAGS} tags, from the list, without duplicates`, () => {
    expect(create.safeParse({ ...base, tags: ["TECHNICAL", "MUSIC", "ARTS", "TALK"] }).success).toBe(false);
    expect(create.safeParse({ ...base, tags: ["PARTY"] }).success).toBe(false);
    expect(create.parse({ ...base, tags: ["TALK", "TALK"] }).tags).toEqual(["TALK"]);
  });

  it("reports a bad link on its own field", () => {
    const result = create.safeParse({ ...base, whatsappUrl: "https://example.org" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.path).toEqual(["whatsappUrl"]);
  });

  it("lets an edit clear a link (null) or leave it alone (absent)", () => {
    expect(update.parse({ posterUrl: null }).posterUrl).toBeNull();
    expect("posterUrl" in update.parse({ title: "Renamed" })).toBe(false);
  });

  it("still refuses unknown fields on edit", () => {
    expect(update.safeParse({ posterURL: "https://x.org/a.png" }).success).toBe(false);
  });
});
