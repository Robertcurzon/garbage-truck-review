# Security

Garbage Truck Review is intentionally conservative:

- Scans file metadata only. It does not read candidate file contents.
- Does not follow symbolic links.
- Never removes files during `scan`.
- `apply` requires an exported decision file and the explicit `--confirm` flag.
- Approved items are moved to a quarantine directory, not permanently erased.
- Protected and excluded paths are checked again during `apply`.

Before sharing a report, remember that paths and filenames can contain private information. Reports are ignored by Git by default.

Please report security issues privately to the repository owner rather than opening a public issue.
