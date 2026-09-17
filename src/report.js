const fs = require("fs");
const path = require("path");

const escapeHtml = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

const writeReport = (report, outputDirectory) => {
  fs.mkdirSync(outputDirectory, { recursive: true });
  const jsonPath = path.join(outputDirectory, "review.json");
  const markdownPath = path.join(outputDirectory, "review.md");
  const htmlPath = path.join(outputDirectory, "index.html");

  const markdown = [
    "# Garbage Truck Review", "",
    `Generated: ${report.generatedAt}`,
    `Cutoff: ${report.cutoffAt}`,
    "Mode: review only", "",
    `- Candidates: ${report.summary.candidateCount}`,
    `- Potential space: ${report.summary.reclaimableDisplay}`,
    `- High / medium / low: ${report.summary.byConfidence.high} / ${report.summary.byConfidence.medium} / ${report.summary.byConfidence.low}`,
    "", "## Candidates", "",
    ...report.candidates.map(
      (item) => `- [ ] ${item.displayPath} | ${item.sizeDisplay} | ${item.ageDays} days | ${item.confidence} | ${item.reason}`
    ), ""
  ].join("\n");

  const embedded = JSON.stringify(report).replaceAll("<", "\\u003c");
  const rows = report.candidates.map((item) => `
    <article class="candidate" data-search="${escapeHtml(`${item.path} ${item.reason}`.toLowerCase())}">
      <div class="decisions">
        <label><input type="checkbox" class="cleanup" data-id="${item.id}"> Approve cleanup</label>
        <label><input type="checkbox" class="keep" data-id="${item.id}"> Keep forever</label>
      </div>
      <div>
        <div class="path"><span>${item.kind}</span><code>${escapeHtml(item.displayPath)}</code></div>
        <p>${escapeHtml(item.reason)}</p>
        <div class="meta"><b class="${item.confidence}">${item.confidence}</b><span>${item.sizeDisplay}</span><span>${item.ageDays} days old</span></div>
      </div>
    </article>`).join("");

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Garbage Truck Review</title>
<style>
:root{color-scheme:light dark;--bg:#f3f5f2;--surface:#fff;--text:#17201c;--muted:#65716b;--line:#d7ddd9;--green:#14734b;--red:#a43a32;--amber:#946410;--blue:#225f8f}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.45 ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;letter-spacing:0}.wrap{width:min(1120px,calc(100% - 32px));margin:auto}header{background:var(--surface);border-bottom:1px solid var(--line);padding:26px 0}h1{margin:0 0 6px;font-size:30px;letter-spacing:0}.safe{color:var(--green);font-weight:700}.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;padding:18px 0}.stat,.candidate{background:var(--surface);border:1px solid var(--line);border-radius:7px}.stat{padding:14px}.stat b{display:block;font-size:22px}.stat span,p,.meta{color:var(--muted)}.toolbar{position:sticky;top:0;display:flex;gap:8px;padding:12px 0;background:var(--bg);z-index:2}input[type=search]{flex:1;min-width:220px;padding:9px;border:1px solid var(--line);border-radius:6px;background:var(--surface);color:var(--text)}button{padding:9px 12px;border:1px solid var(--line);border-radius:6px;background:var(--surface);color:var(--text);font-weight:700;cursor:pointer}.primary{background:var(--text);color:var(--surface)}.candidate{display:grid;grid-template-columns:185px 1fr;gap:16px;padding:15px;margin-bottom:8px}.candidate.hidden{display:none}.decisions{display:flex;flex-direction:column;gap:10px;border-right:1px solid var(--line)}label{font-weight:650}.path{display:flex;gap:8px;align-items:start}.path span{font-size:11px;text-transform:uppercase;border:1px solid var(--line);border-radius:4px;padding:2px 6px}.path code{overflow-wrap:anywhere;font-size:13px}.candidate p{margin:8px 0}.meta{display:flex;gap:14px;font-size:13px}.meta b{text-transform:uppercase}.high{color:var(--red)}.medium{color:var(--amber)}.low{color:var(--blue)}@media(prefers-color-scheme:dark){:root{--bg:#161a18;--surface:#1e2421;--text:#edf2ef;--muted:#a3ada8;--line:#39413d;--green:#69ce99;--red:#ff948a;--amber:#e8b75f;--blue:#7db9e6}}@media(max-width:700px){.stats{grid-template-columns:1fr 1fr}.candidate{grid-template-columns:1fr}.decisions{border:0;border-bottom:1px solid var(--line);padding-bottom:12px}.toolbar{flex-wrap:wrap}}
</style></head><body><header><div class="wrap"><h1>Garbage Truck Review</h1><p>${escapeHtml(report.generatedAt)} · ${report.retentionDays}-day cutoff</p><div class="safe">Review only. Nothing has been deleted, moved, or opened.</div></div></header>
<main class="wrap"><section class="stats"><div class="stat"><b>${report.summary.candidateCount}</b><span>candidates</span></div><div class="stat"><b>${report.summary.reclaimableDisplay}</b><span>potential space</span></div><div class="stat"><b>${report.summary.byConfidence.high}</b><span>high confidence</span></div><div class="stat"><b>${report.scan.inaccessible.length}</b><span>access notes</span></div></section>
<div class="toolbar"><input id="search" type="search" placeholder="Filter paths or reasons"><button id="high">Select high</button><button id="clear">Clear</button><button id="copy">Copy</button><button id="download" class="primary">Export JSON</button></div>
<section>${rows || "<p>No candidates found.</p>"}</section></main>
<script>const report=${embedded};const key="garbage-truck-decisions-v1";const state=JSON.parse(localStorage.getItem(key)||"{}");const byId=Object.fromEntries(report.candidates.map(x=>[x.id,x]));const save=()=>localStorage.setItem(key,JSON.stringify(state));function sync(id){const a=document.querySelector('.cleanup[data-id="'+id+'"]'),b=document.querySelector('.keep[data-id="'+id+'"]');if(a){a.checked=state[id]==="cleanup";b.checked=state[id]==="keep_forever"}}Object.keys(state).forEach(sync);document.querySelectorAll(".cleanup,.keep").forEach(el=>el.onchange=()=>{if(!el.checked)delete state[el.dataset.id];else state[el.dataset.id]=el.classList.contains("cleanup")?"cleanup":"keep_forever";sync(el.dataset.id);save()});document.getElementById("search").oninput=e=>document.querySelectorAll(".candidate").forEach(row=>row.classList.toggle("hidden",!row.dataset.search.includes(e.target.value.toLowerCase())));document.getElementById("high").onclick=()=>{report.candidates.filter(x=>x.confidence==="high").forEach(x=>{state[x.id]="cleanup";sync(x.id)});save()};document.getElementById("clear").onclick=()=>{Object.keys(state).forEach(x=>delete state[x]);document.querySelectorAll("input[type=checkbox]").forEach(x=>x.checked=false);save()};function payload(){return{schemaVersion:1,sourceReportGeneratedAt:report.generatedAt,reviewedAt:new Date().toISOString(),cleanupApproved:Object.entries(state).filter(([,v])=>v==="cleanup").map(([id])=>byId[id]),keepForever:Object.entries(state).filter(([,v])=>v==="keep_forever").map(([id])=>byId[id]),permanentDeletionAuthorized:false}}document.getElementById("download").onclick=()=>{const blob=new Blob([JSON.stringify(payload(),null,2)],{type:"application/json"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="garbage-truck-decisions.json";a.click();URL.revokeObjectURL(a.href)};document.getElementById("copy").onclick=async()=>{const text=JSON.stringify(payload(),null,2);try{await navigator.clipboard.writeText(text)}catch{const t=document.createElement("textarea");t.value=text;document.body.appendChild(t);t.select();document.execCommand("copy");t.remove()}};</script></body></html>`;

  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(markdownPath, markdown);
  fs.writeFileSync(htmlPath, html);
  return { json: jsonPath, markdown: markdownPath, html: htmlPath };
};

module.exports = { writeReport };
