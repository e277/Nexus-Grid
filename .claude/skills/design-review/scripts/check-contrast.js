#!/usr/bin/env node
/**
 * WCAG contrast audit for Nexus-Grid's ng-* design tokens.
 *
 * Reads the actual hex values straight out of src/index.css — both the dark
 * (bare :root) and light (:root[data-theme="light"]) blocks — so this never
 * drifts out of sync with the tokens the way a hardcoded copy would. Run it
 * any time a color in that file changes, not just when something looks off.
 *
 * Usage:
 *   node .claude/skills/design-review/scripts/check-contrast.js
 *
 * Exit code 0 if every pair passes its threshold, 1 if anything fails —
 * safe to wire into a pre-commit hook or CI if this project wants that later.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CSS_PATH = path.join(__dirname, "..", "..", "..", "..", "src", "index.css");

function hexToRgb(hex) {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

function relLuminance([r, g, b]) {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function contrast(hex1, hex2) {
  const L1 = relLuminance(hexToRgb(hex1));
  const L2 = relLuminance(hexToRgb(hex2));
  const [lighter, darker] = L1 > L2 ? [L1, L2] : [L2, L1];
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Pull `--token: #hex;` pairs out of one :root block's source text.
 *
 * Most tokens are `--color-<name>` but `--chart-*` and `--phase-*` aren't, so
 * this strips a leading `color-` where present — every PAIRS lookup below
 * then uses one bare naming style (`bg`, `text-primary`, `chart-1`) instead
 * of needing to know which prefix convention each token happened to use.
 */
function parseTokens(blockSrc) {
  const tokens = {};
  const re = /--([a-z0-9-]+):\s*(#[0-9A-Fa-f]{6});/g;
  let m;
  while ((m = re.exec(blockSrc))) {
    const name = m[1].replace(/^color-/, "");
    tokens[name] = m[2].toUpperCase();
  }
  return tokens;
}

function extractBlock(css, startMarker) {
  const start = css.indexOf(startMarker);
  if (start === -1) throw new Error(`Could not find block starting with: ${startMarker}`);
  const openBrace = css.indexOf("{", start);
  let depth = 1;
  let i = openBrace + 1;
  while (depth > 0 && i < css.length) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}") depth--;
    i++;
  }
  return css.slice(openBrace + 1, i - 1);
}

const css = fs.readFileSync(CSS_PATH, "utf8");
const darkBlock = extractBlock(css, "  :root {");
const lightBlock = extractBlock(css, ':root[data-theme="light"]');
const dark = parseTokens(darkBlock);
const light = parseTokens(lightBlock);

// [foreground token, background token, what it's used for, size class]
// Add a pair here whenever a new token combination goes into real UI —
// this list is the actual audit surface, not just the ones caught before.
const PAIRS = [
  ["text-primary", "bg", "primary body text on the page background", "normal"],
  ["text-primary", "surface", "primary body text on a card", "normal"],
  ["text-primary", "surface-raised", "primary body text on a raised panel", "normal"],
  ["text-secondary", "bg", "secondary/muted text on the page background", "normal"],
  ["text-secondary", "surface", "secondary/muted text on a card", "normal"],
  ["text-secondary", "surface-raised", "secondary/muted text on a raised panel", "normal"],
  ["text-disabled", "bg", "disabled/de-emphasized text on the page background", "normal"],
  ["text-disabled", "surface", "disabled/de-emphasized text on a card", "normal"],
  ["accent-fg", "accent", "button label on the accent-filled button", "normal"],
  ["accent", "surface", "accent-colored text/link on a card", "normal"],
  ["success-text", "success-bg", "status badge text (success)", "normal"],
  ["warning-text", "warning-bg", "status badge text (warning)", "normal"],
  ["danger-text", "danger-bg", "status badge text (danger)", "normal"],
  ["info-text", "info-bg", "status badge text (info)", "normal"],
  ["ai-text", "ai-bg", "status badge text (AI/model output)", "normal"],
  ["muted-text", "muted-bg", "muted badge/chip text", "normal"],
  ["phase-perceive-tx", "phase-perceive-bg", "pipeline phase label (perceive)", "large"],
  ["phase-reason-tx", "phase-reason-bg", "pipeline phase label (reason)", "large"],
  ["phase-plan-tx", "phase-plan-bg", "pipeline phase label (plan)", "large"],
  ["phase-execute-tx", "phase-execute-bg", "pipeline phase label (execute)", "large"],
  ["phase-recover-tx", "phase-recover-bg", "pipeline phase label (recover)", "large"],
  ["chart-1", "surface", "categorical chart color 1 vs card (graphical object)", "graphical"],
  ["chart-2", "surface", "categorical chart color 2 vs card (graphical object)", "graphical"],
  ["chart-3", "surface", "categorical chart color 3 vs card (graphical object)", "graphical"],
  ["chart-4", "surface", "categorical chart color 4 vs card (graphical object)", "graphical"],
  ["chart-5", "surface", "categorical chart color 5 vs card (graphical object)", "graphical"],
];

const THRESHOLD = { normal: 4.5, large: 3.0, graphical: 3.0 };

function run(mode, tokens) {
  console.log(`\n=== ${mode} ===`);
  let failed = 0;
  for (const [fg, bg, use, sizeClass] of PAIRS) {
    const fgHex = tokens[fg];
    const bgHex = tokens[bg];
    if (!fgHex || !bgHex) {
      console.log(`  [SKIP] missing token: ${fg} or ${bg}`);
      continue;
    }
    const ratio = contrast(fgHex, bgHex);
    const need = THRESHOLD[sizeClass];
    const pass = ratio >= need;
    if (!pass) failed++;
    console.log(
      `  [${pass ? "PASS" : "FAIL"}] ${ratio.toFixed(2)}:1 (need ${need}:1, ${sizeClass})  ` +
        `${fg} (${fgHex}) on ${bg} (${bgHex})  — ${use}`
    );
  }
  return failed;
}

const darkFailed = run("DARK", dark);
const lightFailed = run("LIGHT", light);

const total = darkFailed + lightFailed;
console.log(`\n${total === 0 ? "All pairs pass." : `${total} pair(s) failing.`}`);
process.exit(total === 0 ? 0 : 1);
