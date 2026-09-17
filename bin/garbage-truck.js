#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { defaultConfig, loadConfig, writeInitialConfig } = require("../src/config");
const { scanWorkspace } = require("../src/scanner");
const { writeReport } = require("../src/report");
const { applyDecisions } = require("../src/apply");

const args = process.argv.slice(2);
const command = args[0] || "scan";
const option = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const has = (name) => args.includes(name);

const help = `Garbage Truck Review

Usage:
  garbage-truck init [--config path]
  garbage-truck scan [--config path] [--now-iso timestamp]
  garbage-truck apply --decisions path --confirm [--config path] [--quarantine path]
`;

try {
  if (["help", "--help", "-h"].includes(command)) {
    process.stdout.write(help);
    process.exit(0);
  }

  const configPath = path.resolve(option("--config") || "garbage-truck.config.json");
  if (command === "init") {
    writeInitialConfig(configPath, defaultConfig());
    console.log(`Created ${configPath}`);
    process.exit(0);
  }

  if (!fs.existsSync(configPath)) {
    throw new Error(`Config not found: ${configPath}. Run garbage-truck init first.`);
  }
  const config = loadConfig(configPath);

  if (command === "scan") {
    const now = option("--now-iso") ? new Date(option("--now-iso")) : new Date();
    if (Number.isNaN(now.getTime())) throw new Error("--now-iso must be a valid timestamp");
    const report = scanWorkspace(config, now);
    const outputs = writeReport(report, config.outputDirectory);
    console.log(
      JSON.stringify(
        {
          candidates: report.summary.candidateCount,
          potentialSpace: report.summary.reclaimableDisplay,
          byConfidence: report.summary.byConfidence,
          accessNotes: report.scan.inaccessible.length,
          entryLimitReached: report.scan.limitReached,
          review: outputs.html,
        },
        null,
        2
      )
    );
    process.exit(report.scan.limitReached ? 2 : 0);
  }

  if (command === "apply") {
    const decisionsPath = option("--decisions");
    if (!decisionsPath) throw new Error("--decisions is required");
    if (!has("--confirm")) throw new Error("--confirm is required for apply");
    const receipt = applyDecisions({
      config,
      decisionsPath: path.resolve(decisionsPath),
      quarantineRoot: option("--quarantine"),
    });
    console.log(JSON.stringify(receipt.summary, null, 2));
    process.exit(receipt.errors.length ? 2 : 0);
  }

  throw new Error(`Unknown command: ${command}\n\n${help}`);
} catch (error) {
  console.error(`Error: ${error.message}`);
  process.exit(1);
}
