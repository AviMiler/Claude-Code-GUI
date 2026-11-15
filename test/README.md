# Unit tests

Unit tests for the pure modules in `lib/`, written with Node's built-in test runner (`node:test` and `node:assert/strict`). No npm packages.

## Run

From the project root:

```
node --test test/*.test.js
```

On Node 22 the runner takes file names or glob patterns, not a directory, so `node --test test/` fails with "Cannot find module". The glob above works on Git Bash, cmd and PowerShell, because Node expands it itself. A bare `node --test` (no arguments) also finds these files.

Requirements: Node 18 or newer (`node:test` is stable from Node 20). The project targets Node 22.

## Rules for these tests

- One file per module: `<module>.test.js`.
- No test starts the server, reads the real `data/` folder or touches `~/.claude`.
- Files that touch the disk use `fs.mkdtempSync(path.join(os.tmpdir(), 'cg-'))` and remove it afterwards.
- `lib/session-store.js` writes its file on exit. Any test file that loads it (directly or through `session-options`, `cli-args`, `session-prompt`) sets `process.env.CLAUDE_GUI_DATA` to a temp folder before the first `require`, and removes that folder on exit.
- Network calls go only to a throwaway HTTP server on `127.0.0.1`.
- A test that documents a suspected bug is marked `{ todo: '...' }` and does not fail the run.
