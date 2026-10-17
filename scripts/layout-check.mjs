#!/usr/bin/env node
/**
 * Layout and accessibility check at real viewport widths.
 *
 * "No layout breakage from 360 px to 1440 px" is not something a unit test can
 * prove — it needs a browser with a viewport. This script drives a headless
 * Chromium over the read-only demo pages (the ones that exist without a session)
 * and asserts, for each width:
 *
 *   • nothing makes the page scroll sideways (the single most common mobile bug),
 *   • every image has an alt attribute,
 *   • every button and link has an accessible name,
 *   • every form control has a label,
 *   • there is exactly one <h1> per page.
 *
 * Usage:  npm run test:layout        (expects the app on http://localhost:3000)
 * Env:    BASE_URL, CHROME_PATH
 */

import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { chromium } from "playwright-core";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const WIDTHS = [360, 390, 768, 1024, 1440];

const TENANT = "0f1d2c3b-4a59-4e6d-8b7c-100000000001";
void TENANT;
const CLUB = "0f1d2c3b-4a59-4e6d-8b7c-200000000001";
const OPEN_HOUSE = "0f1d2c3b-4a59-4e6d-8b7c-300000000005";

const ROUTES = [
  ["/", "front page"],
  ["/demo?as=aarav", "demo dashboard"],
  [`/demo/clubs/${CLUB}?as=aarav`, "club page"],
  [`/demo/events/${OPEN_HOUSE}?as=aarav`, "event page"],
  [`/demo/events/${OPEN_HOUSE}/door?as=aarav`, "door"],
  ["/sign-in", "sign-in"],
  ["/api/health", "health (JSON, layout-free)"],
];

let failures = 0;
let checks = 0;

function pass(message) {
  checks += 1;
  console.log(`  \u001b[32m✓\u001b[0m ${message}`);
}

function fail(message) {
  checks += 1;
  failures += 1;
  console.log(`  \u001b[31m✗\u001b[0m ${message}`);
}

/**
 * Find a browser: `CHROME_PATH` wins, otherwise look where Playwright keeps its
 * downloaded Chromium. `npx playwright install chromium` puts it there.
 */
function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;

  const root = join(homedir(), ".cache", "ms-playwright");
  if (!existsSync(root)) return null;

  const candidates = readdirSync(root)
    .filter((entry) => entry.startsWith("chromium-"))
    .sort()
    .reverse()
    .map((entry) => join(root, entry, "chrome-linux", "chrome"));

  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

const executablePath = findChrome();
if (!executablePath) {
  console.error(
    "No Chromium found. Run `npx playwright install chromium` once, or set CHROME_PATH.",
  );
  process.exit(2);
}

const browser = await chromium.launch({ executablePath, args: ["--no-sandbox"] });

try {
  for (const [path, label] of ROUTES) {
    console.log(`\n[${label}] ${path}`);

    for (const width of WIDTHS) {
      const page = await browser.newPage({
        viewport: { width, height: width < 500 ? 780 : 900 },
        deviceScaleFactor: 1,
      });

      const response = await page.goto(`${BASE}${path}`, {
        waitUntil: "networkidle",
        timeout: 30_000,
      });

      if (!response || !response.ok()) {
        fail(`${width}px — page did not load (${response?.status() ?? "no response"})`);
        await page.close();
        continue;
      }

      const overflow = await page.evaluate(() => {
        const doc = document.documentElement;
        return {
          scrollWidth: doc.scrollWidth,
          clientWidth: doc.clientWidth,
          // The widest offender, named, so a failure is actionable.
          offender: (() => {
            let worst = null;
            for (const element of document.querySelectorAll("body *")) {
              const rect = element.getBoundingClientRect();
              if (rect.right > doc.clientWidth + 1 && (!worst || rect.right > worst.right)) {
                worst = { right: Math.round(rect.right), tag: element.tagName.toLowerCase() };
              }
            }
            return worst;
          })(),
        };
      });

      if (overflow.scrollWidth <= overflow.clientWidth + 1) {
        pass(`${width}px — no horizontal overflow`);
      } else {
        const where = overflow.offender
          ? ` (widest: <${overflow.offender.tag}> ends at ${overflow.offender.right}px)`
          : "";
        fail(
          `${width}px — page is ${overflow.scrollWidth - overflow.clientWidth}px too wide${where}`,
        );
      }

      // Accessibility spot-checks. They are cheap and catch the common regressions.
      const a11y = await page.evaluate(() => {
        const visible = (element) => {
          const style = window.getComputedStyle(element);
          return style.display !== "none" && style.visibility !== "hidden";
        };

        const unnamedButtons = [...document.querySelectorAll("button, [role='button']")]
          .filter(visible)
          .filter((element) => {
            const text = (element.textContent ?? "").trim();
            const label = element.getAttribute("aria-label") ?? element.getAttribute("title");
            return text.length === 0 && !label;
          })
          .length;

        const unnamedLinks = [...document.querySelectorAll("a[href]")]
          .filter(visible)
          .filter((element) => {
            const text = (element.textContent ?? "").trim();
            const label = element.getAttribute("aria-label") ?? element.getAttribute("title");
            return text.length === 0 && !label;
          })
          .length;

        const imagesWithoutAlt = [...document.querySelectorAll("img")].filter(
          (image) => !image.hasAttribute("alt"),
        ).length;

        const unlabelledFields = [...document.querySelectorAll("input, select, textarea")]
          .filter(visible)
          .filter((field) => {
            if (field.getAttribute("type") === "hidden") return false;
            if (field.getAttribute("aria-label") || field.getAttribute("aria-labelledby")) {
              return false;
            }
            if (field.id && document.querySelector(`label[for="${CSS.escape(field.id)}"]`)) {
              return false;
            }
            return !field.closest("label");
          }).length;

        return {
          unnamedButtons,
          unnamedLinks,
          imagesWithoutAlt,
          unlabelledFields,
          h1Count: document.querySelectorAll("h1").length,
        };
      });

      const problems = [];
      if (a11y.unnamedButtons) problems.push(`${a11y.unnamedButtons} unnamed button(s)`);
      if (a11y.unnamedLinks) problems.push(`${a11y.unnamedLinks} unnamed link(s)`);
      if (a11y.imagesWithoutAlt) problems.push(`${a11y.imagesWithoutAlt} image(s) without alt`);
      if (a11y.unlabelledFields) problems.push(`${a11y.unlabelledFields} unlabelled field(s)`);

      if (problems.length === 0) {
        pass(`${width}px — names, labels and alts are all present`);
      } else {
        fail(`${width}px — ${problems.join(", ")}`);
      }

      if (path.startsWith("/api/")) {
        // JSON has no heading; skip the h1 rule for it.
      } else if (a11y.h1Count === 1) {
        pass(`${width}px — exactly one <h1>`);
      } else {
        fail(`${width}px — found ${a11y.h1Count} <h1> elements (want exactly 1)`);
      }

      await page.close();
    }
  }
} finally {
  await browser.close();
}

console.log("\n──────────────────────────────────────────────");
if (failures === 0) {
  console.log(`\u001b[32mAll ${checks} layout checks passed.\u001b[0m`);
} else {
  console.log(`\u001b[31m${failures} of ${checks} layout checks failed.\u001b[0m`);
  process.exit(1);
}
