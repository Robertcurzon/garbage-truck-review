const fs = require("fs");
const os = require("os");
const path = require("path");

const defaultConfig = () => ({
  retentionDays: 30,
  roots: ["~/Downloads", "~/Desktop", "~/Documents", "~/Movies", "~/Pictures"],
  keepForever: [],
  neverScan: [],
  generatedPathMarkers: ["/tmp/", "/output/", "/outputs/"],
  outputDirectory: "./garbage-truck-report",
  maxEntries: 250000,
  ignoredDirectoryNames: [
    ".git",
    ".svn",
    ".hg",
    ".Trash",
    ".Spotlight-V100",
    ".fseventsd",
    ".DocumentRevisions-V100",
    "Library",
    "Photos Library.photoslibrary"
  ],
  regenerableDirectoryNames: ["node_modules", ".venv", "venv", "coverage"],
  generatedDirectoryNames: [
    "raw",
    "prepared",
    "renders",
    "contact-sheets",
    "clips",
    "transcripts",
    "tmp",
    "temp",
    ".tmp",
    "output",
    "outputs"
  ]
});

const expandPath = (value, baseDirectory) => {
  if (value === "~") return os.homedir();
  if (value.startsWith(`~${path.sep}`) || value.startsWith("~/")) {
    return path.resolve(os.homedir(), value.slice(2));
  }
  return path.resolve(baseDirectory, value);
};

const loadConfig = (configPath) => {
  const absoluteConfigPath = path.resolve(configPath);
  const baseDirectory = path.dirname(absoluteConfigPath);
  const provided = JSON.parse(fs.readFileSync(absoluteConfigPath, "utf8"));
  const config = { ...defaultConfig(), ...provided };
  config.configPath = absoluteConfigPath;
  config.roots = config.roots.map((value) => expandPath(value, baseDirectory));
  config.keepForever = config.keepForever.map((item) => ({
    ...item,
    path: expandPath(item.path, baseDirectory)
  }));
  config.neverScan = config.neverScan.map((value) => expandPath(value, baseDirectory));
  config.outputDirectory = expandPath(config.outputDirectory, baseDirectory);
  return config;
};

const writeInitialConfig = (configPath, config) => {
  if (fs.existsSync(configPath)) throw new Error(`Refusing to overwrite ${configPath}`);
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
};

module.exports = { defaultConfig, expandPath, loadConfig, writeInitialConfig };
