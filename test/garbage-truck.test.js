const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const test = require("node:test");
const { defaultConfig } = require("../src/config");
const { scanWorkspace } = require("../src/scanner");
const { writeReport } = require("../src/report");
const { applyDecisions } = require("../src/apply");

const touchOld = (file, now) => {
  const old = new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000);
  fs.utimesSync(file, old, old);
};

test("scan protects keep-forever paths and classifies stale files", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "garbage-truck-test-"));
  const downloads = path.join(temp, "Downloads");
  const protectedDir = path.join(temp, "brand");
  fs.mkdirSync(downloads);
  fs.mkdirSync(protectedDir);
  const installer = path.join(downloads, "old-installer.dmg");
  const screenshot = path.join(downloads, "Screenshot old.png");
  const recent = path.join(downloads, "recent.zip");
  const protectedTemp = path.join(protectedDir, "brand.part");
  for (const file of [installer, screenshot, recent, protectedTemp]) fs.writeFileSync(file, "data");
  const now = new Date("2026-09-17T12:00:00Z");
  touchOld(installer, now);
  touchOld(screenshot, now);
  touchOld(protectedTemp, now);

  const config = {
    ...defaultConfig(),
    roots: [downloads, protectedDir],
    keepForever: [{ path: protectedDir, reason: "brand" }],
    neverScan: [],
    outputDirectory: path.join(temp, "report")
  };
  const report = scanWorkspace(config, now);
  assert.equal(report.candidates.find((item) => item.path === installer).confidence, "high");
  assert.equal(report.candidates.find((item) => item.path === screenshot).confidence, "medium");
  assert.equal(report.candidates.some((item) => item.path === recent), false);
  assert.equal(report.candidates.some((item) => item.path === protectedTemp), false);
  assert.equal(report.scan.protectedSkipped, 1);
});

test("report exports and apply moves only reviewed candidates", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "garbage-truck-apply-"));
  const downloads = path.join(temp, "Downloads");
  const outputDirectory = path.join(temp, "report");
  const quarantine = path.join(temp, "quarantine");
  fs.mkdirSync(downloads);
  const installer = path.join(downloads, "old.zip");
  fs.writeFileSync(installer, "data");
  const now = new Date("2026-09-17T12:00:00Z");
  touchOld(installer, now);
  const config = {
    ...defaultConfig(), roots: [downloads], keepForever: [], neverScan: [], outputDirectory
  };
  const report = scanWorkspace(config, now);
  const outputs = writeReport(report, outputDirectory);
  assert.equal(fs.existsSync(outputs.html), true);

  const decisionsPath = path.join(temp, "decisions.json");
  fs.writeFileSync(decisionsPath, JSON.stringify({
    sourceReportGeneratedAt: report.generatedAt,
    cleanupApproved: [report.candidates[0]]
  }));
  const receipt = applyDecisions({ config, decisionsPath, quarantineRoot: quarantine });
  assert.equal(receipt.summary.moved, 1);
  assert.equal(fs.existsSync(installer), false);
  assert.equal(fs.existsSync(receipt.moved[0].destination), true);
});
