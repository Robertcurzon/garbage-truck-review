const fs = require("fs");
const os = require("os");
const path = require("path");
const { isInside } = require("./scanner");

const applyDecisions = ({ config, decisionsPath, quarantineRoot }) => {
  const decisions = JSON.parse(fs.readFileSync(decisionsPath, "utf8"));
  const reportPath = path.join(config.outputDirectory, "review.json");
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  if (decisions.sourceReportGeneratedAt !== report.generatedAt) {
    throw new Error("The report changed after review; scan and approve again");
  }
  if (report.mode !== "review_only" || report.scan.limitReached) {
    throw new Error("The source report is incomplete or unsafe to apply");
  }

  const approved = decisions.cleanupApproved || [];
  const reportById = new Map(report.candidates.map((item) => [item.id, item]));
  const protectedPaths = config.keepForever.map((item) => path.resolve(item.path));
  const excludedPaths = config.neverScan.map((item) => path.resolve(item));
  const batchRoot = path.resolve(
    quarantineRoot || path.join(os.homedir(), ".garbage-truck", "quarantine"),
    report.generatedAt.replaceAll(":", "-")
  );
  const receipt = {
    schemaVersion: 1,
    sourceReportGeneratedAt: report.generatedAt,
    executedAt: new Date().toISOString(),
    action: "moved_to_quarantine",
    quarantineRoot: batchRoot,
    moved: [],
    skipped: [],
    errors: []
  };

  for (const decision of approved) {
    const candidate = reportById.get(decision.id);
    if (!candidate || candidate.path !== decision.path) {
      receipt.errors.push({ path: decision.path, reason: "Candidate does not match the reviewed report" });
      continue;
    }
    const source = path.resolve(candidate.path);
    if (
      protectedPaths.some((parent) => isInside(source, parent)) ||
      excludedPaths.some((parent) => isInside(source, parent))
    ) {
      receipt.errors.push({ path: source, reason: "Protected or excluded path" });
      continue;
    }
    let stat;
    try {
      stat = fs.lstatSync(source);
    } catch (error) {
      receipt.skipped.push({ path: source, reason: error.code || error.message });
      continue;
    }
    if (stat.isSymbolicLink() || (!stat.isFile() && !stat.isDirectory())) {
      receipt.errors.push({ path: source, reason: "Not a regular file or directory" });
      continue;
    }
    let destination = path.join(batchRoot, source.replace(/^([A-Za-z]:)?[\\/]+/, ""));
    if (fs.existsSync(destination)) destination = `${destination}.${candidate.id}`;
    try {
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.renameSync(source, destination);
      receipt.moved.push({ id: candidate.id, source, destination, sizeBytes: candidate.sizeBytes });
    } catch (error) {
      receipt.errors.push({ path: source, reason: error.code || error.message });
    }
  }

  receipt.summary = {
    moved: receipt.moved.length,
    skipped: receipt.skipped.length,
    errors: receipt.errors.length,
    movedBytes: receipt.moved.reduce((sum, item) => sum + (item.sizeBytes || 0), 0),
    quarantineRoot: batchRoot
  };
  fs.mkdirSync(config.outputDirectory, { recursive: true });
  fs.writeFileSync(path.join(config.outputDirectory, "cleanup-receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`);
  return receipt;
};

module.exports = { applyDecisions };
