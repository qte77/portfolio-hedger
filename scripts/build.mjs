// Build dist/ for Cloudflare Pages from public/.
// public/index.html is the claude.ai artifact source: a fragment without <html>/<head>, which the
// artifact host wraps at publish time. Here we wrap it ourselves and write a strict CSP that allows
// the one inline script (the theme guard) by hash.
import { createHash } from "node:crypto";
import { cpSync, readFileSync, rmSync, writeFileSync } from "node:fs";

const SRC = "public";
const OUT = "dist";

rmSync(OUT, { recursive: true, force: true });
cpSync(SRC, OUT, { recursive: true });

// Inline the favicon: Chrome re-requests the icon on every hash navigation, so a data: URI keeps the
// logo from being fetched again on each tab switch (img-src allows data:).
const LOGO = "vendor/images/logo-mark.svg";
const icon = `data:image/svg+xml;base64,${readFileSync(`${SRC}/${LOGO}`).toString("base64")}`;
const page = readFileSync(`${SRC}/index.html`, "utf8").replace(`rel="icon" type="image/svg+xml" href="${LOGO}"`, `rel="icon" type="image/svg+xml" href="${icon}"`);
if (!page.includes(icon)) throw new Error("index.html: favicon link not found to inline");
const split = page.indexOf("<header");
if (split < 0) throw new Error("index.html: no <header> to split head from body");
const head = page.slice(0, split).trim();
const body = page.slice(split).trim();

const inline = [...head.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
if (inline.length !== 1) throw new Error(`expected exactly one inline script, found ${inline.length}`);
const hash = createHash("sha256").update(inline[0]).digest("base64");

writeFileSync(
  `${OUT}/index.html`,
  `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
${head}
</head>
<body>
${body}
</body>
</html>
`,
);

const csp = [
  "default-src 'self'",
  `script-src 'self' 'sha256-${hash}'`,
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join("; ");

writeFileSync(
  `${OUT}/_headers`,
  `/*
  Content-Security-Policy: ${csp}
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
  Cross-Origin-Opener-Policy: same-origin

/vendor/*
  Cache-Control: public, max-age=86400
`,
);

console.log(`built ${OUT}/ (inline script sha256-${hash})`);
