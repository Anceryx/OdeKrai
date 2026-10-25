# Security

## Agent security status

The current HEAD has no agent loop, model-initiated tool calls, router, or failover. Therefore, automatic ToolResult execution, tool repetition, duplicate execution after failover, and runaway cost do not yet have product mitigations. Planned requirements are: delimit untrusted results as data and propagate `ExternalContent`, use conservative limits per run, signal truncation, set a daily token budget, and allow failover only before tool execution. These protections will be considered implemented only when associated Rust code and mock tests exist. See [`TRACEABILITY.md`](TRACEABILITY.md).

Content read from the workspace may contain malicious instructions, even when the file is local. Path validation, `.history`, and `.trash` do not remove this injection risk. In the future design, this content must be marked `Untrusted`, and any subsequent side effect must pass through the policy engine as external-origin content.

- Provider keys are saved by the Tauri backend through `keyring` in Windows Credential Manager. The frontend holds typed text only while configuring the provider and cannot retrieve saved secrets.
- Chat calls Tauri commands; it does not send keys directly from the WebView. The web preview does not provide provider connectivity.
- The backend limits requests to known providers, HTTPS, provider-specific hosts, URLs without credentials or query parameters, no redirects, bounded message sizes, and bounded response times. Transport errors do not include key contents.
- The Rust backend validates the endpoint and path for the selected provider before storing or sending the credential. The catalog documents which providers offer model listing without generation. Errors shown to users are mapped by status; raw provider response bodies are neither displayed nor logged.
- The avatar is decoded in Rust only after validating PNG/JPEG/WebP magic bytes, a file size of at most 5 MiB, and bounded dimensions/pixel count. It is centered, reduced to 256 × 256, and re-encoded as PNG to remove metadata. The main window CSP allows `data:` in `img-src` to display the processed avatar.
- Sending prompts makes a real request to the selected provider and may incur costs. Check the provider's permissions, pricing, and retention policies.
- Vertex ADC/OAuth and AWS IAM/SigV4 are unavailable. Bedrock accepts only the API-key flow supported by AWS and described in the app.
- `keyring` still needs validation by running the updated app on Windows; unit tests do not prove persistence in the real Credential Manager.
- The production CSP does not allow the WebView to make network connections beyond local IPC; HTTPS provider requests run in Rust. Separate capabilities restrict auxiliary windows to events, while window, provider, and history commands check the caller window label in Rust.
- Local SQLite history contains plain-text messages. Disk and backup protection depend on Windows configuration; do not assume the app encrypts them.
- `ODEKRAI.md` is limited to 16 KiB, saved through an explicit user action, and included in the prompt only when its SHA-256 matches the approved version. Rust sends fixed rules first and rejects `system` messages from the frontend.
- Files in `memory/` are limited to 8 KiB, use simple names, and are edited manually. Up to 1,024 characters from `estilo.md` are included in the prompt. Do not store secrets: identity and memory are plain text. The agent has no command to write to `ODEKRAI.md` or `logs/`.
- Home path validation rejects UNC paths, drive roots, protected folders, `..`, reserved names, and links/junctions. OneDrive triggers a warning. Resistance to concurrent path replacement still needs native evaluation before future write tools.

## Phase 3 — policy, approval, audit, and halt

- `src-tauri/src/policy.rs` is a pure function implementing the mode × risk × origin × workspace matrix. The effective mode and per-tool exceptions come from `permissions.sqlite3`; the mode described in `ODEKRAI.md` is informational and does not control decisions.
- `src-tauri/src/security.rs` validates typed Rust parameters, calculates risk from the tool, rejects unknown fields, limits each tool to five executions per minute, and blocks payments, secret paths, file contents with known secret markers, `ODEKRAI.md`, `logs/`, configuration/database directories, and local database extensions. These blocks apply to reads, writes, and removals in the workspace. Tools available in this phase are simulated; no messages are sent and no payments are made.
- `workspace.read_file` reads workspace files only (64 KiB limit). `workspace.write_file` limits files to 1 MiB and stores the previous version in `.history`. `workspace.delete_file` moves files to `.trash` and never permanently deletes them. Absolute paths, traversal, links/junctions, hard links, reserved names, and internal folders are rejected; the destination is validated again for every execution.
- Approval requests open the `approval` window with a separate capability. Only that window can respond. The queue is FIFO, shows one action at a time, accepts up to three pending requests, uses a SHA-256 hash of the parameters, expires after 120 seconds by default (configurable from 30 to 600), and accepts a one-time approval. Closing the window denies the current action.
- Changing the global mode and enabling more permissive per-tool exceptions require confirmation in a native Windows dialog. `MessageBoxW` runs on a blocking worker (`spawn_blocking`); the async call awaits its result without occupying the UI thread. The default global shortcut is `Ctrl+Shift+F12`; conflicts are reported in settings. The kill switch persists the halted state, cancels registered requests/streams, denies pending approvals, and blocks new provider requests until explicitly resumed.
- Each decision and result is written to a daily JSONL file in `logs/`, with SHA-256 chaining and a confirmed write before execution. Audit verification or write failures block actions. Logs have no automatic retention or delete controls in the UI in this phase.

### Threats and limitations

- **Prompt injection and external content:** the policy keeps origin as Rust-side data; tainted actions above read risk require approval in every mode. There is no agent loop to assign origin to provider content yet; tools in this phase can only be triggered manually by the user in development builds.
- **Approval forgery and parameter changes:** the response command validates the `approval` label, pending action ID, and hash; Rust recalculates the hash and revalidates paths immediately before execution. The UI never supplies the risk decision.
- **WebView XSS:** the approval window has a minimal capability and a local CSP without remote connections, and React renders the preview as plain text. A vulnerability executing code inside the approval window could still induce a click; approvals are never transferred to the main window.
- **TOCTOU:** canonicalization, reparse-point/hard-link detection, and validation immediately before the operation reduce destination replacement risks. A local process with the same privileges can still race changes during the operation; the implementation does not use immutable directory handles for the entire path walk.
- **Log tampering:** the chain detects changes and accidental breaks. It does not prevent edits and cannot resist malware or a local process able to rewrite files and recalculate hashes; it is not a signature protected by a key.
- **Approval flooding:** the queue is limited to three requests with one visible window at a time; excess requests are denied and audited.
- **General residual risk:** SQLite settings and logs are local files. A process running with the same user privileges can change them. This engine reduces agent mistakes/abuse and injection risks; it does not protect against local malware.

The `npm run tauri:build` command checks assets and the `cfg(debug_assertions)` guard before packaging. See [`TRACEABILITY.md`](TRACEABILITY.md) for detailed requirements, implementation, tests, and status.
