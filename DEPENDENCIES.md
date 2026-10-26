# Dependencies

| Package | Version | Why |
|---|---|---|
| Node.js (runtime) | >= 18 | Built-in `http`, `child_process`, `fetch`; no npm packages are used |
| `claude` CLI | 2.1.246 (target) … 2.1.310 | The thing being wrapped. Tested with real turns on 2.1.246, 2.1.308, 2.1.310; optional flags are detected from `--help`, missing control requests degrade |
| `git` (optional) | any | Only for the /diff panel |
