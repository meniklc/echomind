# Knowledge base

Edit these JSON files to update what EchoMind can say. No code changes required.

- `profile.json` — identity, education, skills, experience, links
- `projects.json` — projects with summaries, tech, contributions, URLs

Replace every `PLACEHOLDER` value with verified facts only. Restart the backend (or clear the process) after edits so caches reload — the current loader caches on first read per process.

## Project listing visibility

`projects.json` entries may set `"public_listing": false`. Such entries are
excluded from broad overview answers (for example "what projects have you
built?") because they are still unconfirmed candidates, but they remain in the
knowledge base and can still be retrieved when asked about directly. Omitting
the field (or setting it to `true`) includes the project in overview answers.
