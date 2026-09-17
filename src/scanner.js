const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const DAY_MS = 24 * 60 * 60 * 1000;
const MEDIA_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".webp", ".gif", ".tif", ".tiff",
  ".mp4", ".mov", ".m4v", ".avi", ".mkv", ".webm",
  ".mp3", ".wav", ".m4a", ".aac"
]);
const TRANSCRIPT_EXTENSIONS = new Set([".vtt", ".srt"]);
const ARCHIVE_EXTENSIONS = new Set([
  ".zip", ".tar", ".gz", ".tgz", ".7z", ".rar", ".dmg", ".pkg", ".iso"
]);
const TEMPORARY_EXTENSIONS = new Set([".tmp", ".temp", ".part", ".download", ".crdownload"]);

const isInside = (candidate, parent) =>
  candidate === parent || candidate.startsWith(`${parent}${path.sep}`);
const stableId = (value) => crypto.createHash("sha256").update(value).digest("hex").slice(0, 16);
const formatBytes = (bytes) => {
  if (!Number.isFinite(bytes)) return "Unknown";
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  return `${value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
};

const scanWorkspace = (config, now = new Date()) => {
  const cutoff = new Date(now.getTime() - config.retentionDays * DAY_MS);
  const ignoredNames = new Set(config.ignoredDirectoryNames);
  const regenerableNames = new Set(config.regenerableDirectoryNames);
  const generatedNames = new Set(config.generatedDirectoryNames);
  const protectedPaths = config.keepForever.map((item) => path.resolve(item.path));
  const neverScan = config.neverScan.map((item) => path.resolve(item));
  const candidates = [];
  const scan = {
    entriesSeen: 0,
    filesSeen: 0,
    directoriesSeen: 0,
    symlinksSkipped: 0,
    protectedSkipped: 0,
    excludedSkipped: 0,
    inaccessible: [],
    limitReached: false
  };

  const isOld = (date) => date.getTime() < cutoff.getTime();
  const ageDays = (date) => Math.max(0, Math.floor((now.getTime() - date.getTime()) / DAY_MS));
  const isProtected = (value) => protectedPaths.some((parent) => isInside(value, parent));
  const isExcluded = (value) => neverScan.some((parent) => isInside(value, parent));
  const isGeneratedContext = (value) => {
    const comparable = value.split(path.sep).join("/");
    return config.generatedPathMarkers.some((marker) => comparable.includes(marker));
  };
  const looksLikeEpisode = (value) =>
    path.basename(path.dirname(value)) === "episodes" && /^\d{4}-\d{2}-\d{2}(?:-|$)/.test(path.basename(value));

  const addCandidate = ({ absolutePath, kind, category, confidence, reason, stat, sizeBytes, fileCount }) => {
    candidates.push({
      id: stableId(absolutePath),
      path: absolutePath,
      displayPath: absolutePath.replace(process.env.HOME || "", "~"),
      kind,
      category,
      confidence,
      reason,
      modifiedAt: stat.mtime.toISOString(),
      ageDays: ageDays(stat.mtime),
      sizeBytes: Number.isFinite(sizeBytes) ? sizeBytes : null,
      sizeDisplay: formatBytes(sizeBytes),
      fileCount: Number.isFinite(fileCount) ? fileCount : null
    });
  };

  const classifyFile = (absolutePath, stat) => {
    if (!isOld(stat.mtime)) return;
    const extension = path.extname(absolutePath).toLowerCase();
    const basename = path.basename(absolutePath).toLowerCase();
    const root = config.roots.find((item) => isInside(absolutePath, item));
    const inDownloads = root && path.basename(root).toLowerCase() === "downloads";

    if (TEMPORARY_EXTENSIONS.has(extension)) {
      addCandidate({
        absolutePath, kind: "file", category: "temporary_file", confidence: "high",
        reason: "Incomplete or temporary file older than the retention window", stat,
        sizeBytes: stat.size, fileCount: 1
      });
      return;
    }
    if (inDownloads && path.dirname(absolutePath) === root && ARCHIVE_EXTENSIONS.has(extension)) {
      addCandidate({
        absolutePath, kind: "file", category: "old_download", confidence: "high",
        reason: "Installer or archive in Downloads older than the retention window", stat,
        sizeBytes: stat.size, fileCount: 1
      });
      return;
    }
    if (
      (MEDIA_EXTENSIONS.has(extension) || TRANSCRIPT_EXTENSIONS.has(extension)) &&
      /(screenshot|screen recording|screenrecording|clipboard|clip|transcript)/i.test(basename)
    ) {
      addCandidate({
        absolutePath, kind: "file", category: "old_capture", confidence: "medium",
        reason: "Old screen capture, clip, or transcript", stat,
        sizeBytes: stat.size, fileCount: 1
      });
      return;
    }
    if (
      isGeneratedContext(absolutePath) &&
      (MEDIA_EXTENSIONS.has(extension) || TRANSCRIPT_EXTENSIONS.has(extension) || /transcript/i.test(basename))
    ) {
      addCandidate({
        absolutePath, kind: "file", category: "generated_artifact", confidence: "medium",
        reason: "Generated media or transcript older than the retention window", stat,
        sizeBytes: stat.size, fileCount: 1
      });
    }
  };

  const walk = (absolutePath) => {
    if (scan.entriesSeen >= config.maxEntries) {
      scan.limitReached = true;
      return { sizeBytes: 0, fileCount: 0, newestMtime: new Date(0) };
    }
    scan.entriesSeen += 1;
    if (isExcluded(absolutePath)) {
      scan.excludedSkipped += 1;
      return { sizeBytes: 0, fileCount: 0, newestMtime: new Date(0) };
    }
    if (isProtected(absolutePath)) {
      scan.protectedSkipped += 1;
      return { sizeBytes: 0, fileCount: 0, newestMtime: new Date(0) };
    }

    let stat;
    try {
      stat = fs.lstatSync(absolutePath);
    } catch (error) {
      scan.inaccessible.push({ path: absolutePath, error: error.code || error.message });
      return { sizeBytes: 0, fileCount: 0, newestMtime: new Date(0) };
    }
    if (stat.isSymbolicLink()) {
      scan.symlinksSkipped += 1;
      return { sizeBytes: 0, fileCount: 0, newestMtime: stat.mtime };
    }
    if (stat.isFile()) {
      scan.filesSeen += 1;
      classifyFile(absolutePath, stat);
      return { sizeBytes: stat.size, fileCount: 1, newestMtime: stat.mtime };
    }
    if (!stat.isDirectory()) return { sizeBytes: 0, fileCount: 0, newestMtime: stat.mtime };

    scan.directoriesSeen += 1;
    const base = path.basename(absolutePath);
    if (ignoredNames.has(base)) {
      scan.excludedSkipped += 1;
      return { sizeBytes: 0, fileCount: 0, newestMtime: stat.mtime };
    }
    if (regenerableNames.has(base)) {
      if (isOld(stat.mtime)) {
        addCandidate({
          absolutePath, kind: "folder", category: "regenerable_folder", confidence: "low",
          reason: "Regenerable dependency folder older than the retention window", stat,
          sizeBytes: Number.NaN, fileCount: Number.NaN
        });
      }
      scan.excludedSkipped += 1;
      return { sizeBytes: 0, fileCount: 0, newestMtime: stat.mtime };
    }

    let entries;
    try {
      entries = fs.readdirSync(absolutePath);
    } catch (error) {
      scan.inaccessible.push({ path: absolutePath, error: error.code || error.message });
      return { sizeBytes: 0, fileCount: 0, newestMtime: stat.mtime };
    }
    let sizeBytes = 0;
    let fileCount = 0;
    let newestMtime = stat.mtime;
    for (const entry of entries) {
      if (scan.limitReached) break;
      const child = walk(path.join(absolutePath, entry));
      sizeBytes += child.sizeBytes;
      fileCount += child.fileCount;
      if (child.newestMtime > newestMtime) newestMtime = child.newestMtime;
    }
    if (fileCount > 0 && isOld(newestMtime) && (generatedNames.has(base) || looksLikeEpisode(absolutePath))) {
      addCandidate({
        absolutePath, kind: "folder",
        category: looksLikeEpisode(absolutePath) ? "media_episode" : "generated_folder",
        confidence: "medium",
        reason: looksLikeEpisode(absolutePath)
          ? "Dated media folder with no recent changes"
          : "Generated folder with no recent changes",
        stat: { mtime: newestMtime }, sizeBytes, fileCount
      });
    }
    return { sizeBytes, fileCount, newestMtime };
  };

  for (const root of config.roots) {
    if (!fs.existsSync(root)) {
      scan.inaccessible.push({ path: root, error: "ENOENT" });
      continue;
    }
    walk(root);
  }

  const folders = candidates
    .filter((item) => item.kind === "folder")
    .sort((left, right) => left.path.length - right.path.length)
    .filter((item, index, items) => !items.slice(0, index).some((parent) => isInside(item.path, parent.path)));
  const finalCandidates = [
    ...folders,
    ...candidates.filter(
      (item) => item.kind === "file" && !folders.some((folder) => isInside(item.path, folder.path))
    )
  ].sort((left, right) => {
    const rank = { high: 0, medium: 1, low: 2 };
    return rank[left.confidence] - rank[right.confidence] ||
      (right.sizeBytes || 0) - (left.sizeBytes || 0) || left.path.localeCompare(right.path);
  });
  const reclaimableBytes = finalCandidates.reduce((sum, item) => sum + (item.sizeBytes || 0), 0);

  return {
    schemaVersion: 1,
    generatedAt: now.toISOString(),
    cutoffAt: cutoff.toISOString(),
    retentionDays: config.retentionDays,
    mode: "review_only",
    safety: { contentRead: false, symlinksFollowed: false, filesDeleted: false, filesMoved: false },
    roots: config.roots,
    keepForever: config.keepForever,
    neverScan: config.neverScan,
    summary: {
      candidateCount: finalCandidates.length,
      reclaimableBytes,
      reclaimableDisplay: formatBytes(reclaimableBytes),
      byConfidence: Object.fromEntries(
        ["high", "medium", "low"].map((value) => [value, finalCandidates.filter((item) => item.confidence === value).length])
      )
    },
    scan,
    candidates: finalCandidates
  };
};

module.exports = { formatBytes, isInside, scanWorkspace };
