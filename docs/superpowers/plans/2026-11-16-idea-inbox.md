# 拾念 Implementation Plan

> **For agentic workers:** Use executing-plans to implement inline; user requested direct development. Steps use checkboxes.

**Goal:** Turn screenshots into editable, categorized ideas and hand them to Apple Notes on iPhone.
**Architecture:** Static mobile PWA + authenticated server-side AI gateway + Apple Shortcuts handoff. Shared pure validation and formatting logic.
**Tech Stack:** Node 22+, JavaScript modules, native fetch, IndexedDB, node:test, Playwright for browser checks.
**Spec:** docs/superpowers/specs/2026-11-16-idea-inbox-design.md

## Global Constraints
- API secret server-side only. No personal screenshots, notes or credentials in the repository.
- Chinese interface. 1–6 source screenshots, 20 MB per file, 16 processed slices, bounded request and response.
- Do not claim Apple Notes success without device confirmation. Existing workspace untouched.
- Zero runtime dependencies. Node 22+. HTTPS for phone install/clipboard.

## Review Focus
- Unauthorized/cross-origin requests must not consume AI credits.
- Malformed, truncated, refused and empty AI responses must not overwrite draft.
- Very long screenshots must preserve legible text and reject excessive slices.
- Reload, offline and storage failure must not silently lose the current note.
- Shortcut cancellation or missing shortcut must never be marked as successful Notes sync.

### Task 1: AI and note contracts
Files: public/lib/domain.js, server/analyze.js, tests/domain.test.mjs, tests/server.test.mjs.
Interfaces: normalizeResult(value), formatNote(note), buildShortcutUrl(name), buildProviderRequest(input, config), analyzeRequest(request, config, fetchImpl) -> Response.
- [x] Write and run failing tests for safe URLs, required images, output validation, Unicode note format and clipboard-only shortcut URL.
- [x] Implement pure functions and authenticated gateway with timeout, size limits and configurable provider.
- [x] Run node --test tests/*.test.mjs; expected all pass.

### Task 2: Mobile app and local persistence
Files: public/index.html, public/styles.css, public/app.js, public/lib/storage.js, public/lib/images.js, public/sw.js, public/manifest.webmanifest, icons.
Interfaces: store draft/history in IndexedDB; API gateway JSON contract from Task 1.
- [x] Browser tests for demo edit/save/reopen, validation, error preservation, backup export/import, offline reload and mobile overflow.
- [x] Build upload, optional context, focus mode, result editor, library, settings and install guidance.
- [x] Verify tests and review phone-width screenshots.

### Task 3: Distribution and Notes integration
Files: server/dev.mjs, api/analyze.mjs, vercel.json, .github/workflows/pages.yml, scripts/build-shortcut.py, README.md, public/guide.html.
- [x] Verify HTTP serving, path traversal prevention, server secret exclusion and unauthorized gateway behavior.
- [x] Create and validate shortcut artifact using installed macOS action metadata when possible; provide manual fallback guide.
- [x] Run full tests and boot preview; review independent security and usability findings.
- [x] Prepare clean Git repository and deployment files.
- [ ] Publish to Bme-coder/shinian after GitHub device authorization; configure hosting and a real model key.
