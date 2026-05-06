import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const THRESHOLDS = {
  target: 250,
  watch: 400,
  split: 600
};

const INCLUDED_EXTENSIONS = new Set([
  ".bat",
  ".css",
  ".html",
  ".js",
  ".json",
  ".md",
  ".mjs",
  ".ps1",
  ".py",
  ".txt",
  ".yml",
  ".yaml"
]);

const EXCLUDED_PREFIXES = [
  ".claude/",
  ".git/",
  "agents/chat-history/",
  "legacy/",
  "node_modules/",
  "nirx-local/",
  "references/",
  "screenshots/",
  "vendor/"
];

const EXCLUDED_FILES = new Set([
  "mat4js.read.min.js",
  "package-lock.json"
]);

function walk(dir, rootDir, out) {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(rootDir, fullPath).replace(/\\/g, "/");

    if (entry.isDirectory()) {
      const normalizedDir = relativePath + "/";
      if (EXCLUDED_PREFIXES.some(prefix => normalizedDir.startsWith(prefix))) continue;
      walk(fullPath, rootDir, out);
      continue;
    }

    out.push(relativePath);
  }
}

function getRepoFiles() {
  const files = [];
  walk(process.cwd(), process.cwd(), files);
  return files;
}

function shouldInclude(file) {
  const normalized = file.replace(/\\/g, "/");
  if (EXCLUDED_FILES.has(normalized)) return false;
  if (EXCLUDED_PREFIXES.some(prefix => normalized.startsWith(prefix))) return false;
  return INCLUDED_EXTENSIONS.has(path.extname(normalized).toLowerCase());
}

function countLines(file) {
  const text = readFileSync(file, "utf8");
  if (text.length === 0) return 0;
  return text.split(/\r?\n/).length;
}

function getStatus(lines) {
  if (lines > THRESHOLDS.split) return "exception-review";
  if (lines > THRESHOLDS.watch) return "split";
  if (lines > THRESHOLDS.target) return "watch";
  return "target";
}

function pad(text, width) {
  return String(text).padEnd(width, " ");
}

function renderSummary(rows) {
  const top = rows.slice(0, 5);
  console.log("File Length Report");
  console.log("==================");
  console.log(`Thresholds: target <= ${THRESHOLDS.target}, watch <= ${THRESHOLDS.watch}, split <= ${THRESHOLDS.split}, exception-review > ${THRESHOLDS.split}`);
  console.log(`Tracked authored files scanned: ${rows.length}`);
  console.log("");
  console.log("Largest files:");
  top.forEach((row, index) => {
    console.log(`${index + 1}. ${row.file} (${row.lines} lines, ${row.status})`);
  });
  console.log("");
}

function renderTable(rows) {
  const lineWidth = Math.max("Lines".length, ...rows.map(row => String(row.lines).length));
  const statusWidth = Math.max("Status".length, ...rows.map(row => row.status.length));

  console.log(`${pad("Lines", lineWidth)}  ${pad("Status", statusWidth)}  File`);
  console.log(`${"-".repeat(lineWidth)}  ${"-".repeat(statusWidth)}  ${"-".repeat(4)}`);
  rows.forEach(row => {
    console.log(`${pad(row.lines, lineWidth)}  ${pad(row.status, statusWidth)}  ${row.file}`);
  });
}

const rows = getRepoFiles()
  .filter(shouldInclude)
  .map(file => ({
    file,
    lines: countLines(file)
  }))
  .sort((a, b) => b.lines - a.lines || a.file.localeCompare(b.file))
  .map(row => ({
    ...row,
    status: getStatus(row.lines)
  }));

renderSummary(rows);
renderTable(rows);
