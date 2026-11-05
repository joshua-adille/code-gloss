# CLAUDE.md

Code Gloss is a VS Code extension that explains highlighted code in a panel
beside the editor, using the AI harness the user already has. See the spec
issue for the design.

## Agent skills

### Issue tracker

GitHub Issues on joshua-adille/code-gloss via the `gh` CLI; external PRs are
not a triage surface. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: needs-triage, needs-info, ready-for-agent, ready-for-human,
wontfix. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` at the root, ADRs in `docs/adr/`. See
`docs/agents/domain.md`.
