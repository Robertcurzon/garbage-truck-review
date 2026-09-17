# Garbage Truck Review

A review-first file retention tool for finding old installers, temporary files, screenshots, recordings, media-production artifacts, generated outputs, and rebuildable dependency folders.

It generates a local checkbox review page. Nothing is removed during a scan, and approved cleanup is moved to a recoverable quarantine directory rather than permanently erased.

## Why

File cleanup tools tend to be either too manual or too eager. Garbage Truck Review separates discovery from deletion:

1. Scan metadata using conservative rules.
2. Review candidates in a local HTML page.
3. Mark items as **Approve cleanup** or **Keep forever**.
4. Export decisions.
5. Apply the exact reviewed decision file to a quarantine batch.

## Requirements

- Node.js 20 or newer
- macOS, Linux, or Windows
- No runtime dependencies

## Quick Start

```bash
git clone https://github.com/Robertcurzon/garbage-truck-review.git
cd garbage-truck-review
npm link
garbage-truck init
garbage-truck scan
```

Open `garbage-truck-report/index.html`, review the candidates, and export `garbage-truck-decisions.json`.

Apply only those reviewed decisions:

```bash
garbage-truck apply --decisions ~/Downloads/garbage-truck-decisions.json --confirm
```

Approved items are moved to `~/.garbage-truck/quarantine/`. The receipt records every source and destination path.

## Commands

### `garbage-truck init`

Creates `garbage-truck.config.json` in the current directory. Existing files are never overwritten.

### `garbage-truck scan`

Scans configured roots and writes:

- `index.html` - checkbox approval queue
- `review.json` - structured scan evidence
- `review.md` - text summary

Options:

```bash
garbage-truck scan --config ./my-config.json
garbage-truck scan --now-iso 2026-09-17T12:00:00Z
```

### `garbage-truck apply`

Moves exported cleanup approvals into quarantine. It refuses changed reports, protected paths, excluded paths, and symbolic links.

```bash
garbage-truck apply \
  --decisions ./garbage-truck-decisions.json \
  --confirm
```

Use `--quarantine /path/to/folder` to choose another quarantine root.

## Confidence Levels

- **High:** stale installers, archives, partial downloads, and temporary files.
- **Medium:** old screenshots, recordings, clips, transcripts, generated outputs, and dated media-production folders.
- **Low:** rebuildable dependency folders such as `node_modules` and virtual environments.

Confidence is a review aid, not a guarantee that an item is useless.

## Configuration

See [`garbage-truck.config.example.json`](garbage-truck.config.example.json).

Important settings:

- `retentionDays`: minimum age before an item can become a candidate.
- `roots`: folders to scan.
- `keepForever`: permanent path exclusions with reasons.
- `neverScan`: boundaries the scanner must not enter.
- `generatedPathMarkers`: path fragments identifying generated workflow areas.
- `outputDirectory`: local report destination.

`~` and relative paths are supported. Relative paths resolve from the configuration file's directory.

## Safety Model

- Metadata only: names, paths, sizes, types, and timestamps.
- Symbolic links are skipped.
- Protected paths are excluded during scan and rechecked during apply.
- Reports are local and ignored by Git.
- `scan` never deletes, moves, or modifies candidates.
- `apply` requires both an exported decision file and `--confirm`.
- Quarantine preserves the original path structure and supports manual recovery.

## Development

```bash
npm test
npm run check
```

## License

MIT
