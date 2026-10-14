# Review guide

How Claude reviews its own changes in this repository, locally, before opening a pull request.
The build already enforces the mechanical limits: lint, type checks, complexity and size limits,
package boundaries, unused code, duplication and test coverage. This review covers what a tool
cannot measure: whether a person new to the code would understand it and could change it safely.

Only review code the change adds or modifies. Give each finding a severity:

- **Blocking**: a defect, or a design problem that will be expensive to undo later.
- **Should fix**: makes the code noticeably harder to understand or change.
- **Nit**: a small improvement; take it or leave it.

Skip anything the linters already catch, and skip pure formatting.

## What to look for

**Readability**

- Names say what a thing is or does in the language of the domain: tables, components,
  stacks, decks, hands, players. No `data`, `info`, `handle2`, `tmp`.
- A function reads top to bottom at one level of abstraction. Details live in well-named helpers.
- Comments explain why, not what. A comment that restates the code is noise; a missing
  comment on a surprising decision is a finding.
- No clever code where plain code would do.

**Responsibilities (SOLID, pragmatically)**

- Each module and function has one reason to change. Flag functions that parse, decide and
  render at once, or files that mix unrelated concerns.
- New behaviour extends existing seams (a new command, a new component kind, a new MCP tool)
  rather than adding special cases to shared code with `if kind === ...` chains.
- Dependencies point downwards: formats, then core, then server and app, then cli.
  Core stays pure: no I/O, no clocks, no randomness outside the seeded RNG.
- Interfaces are small; callers do not depend on fields they never use.

**Consistency with the codebase**

- UI and MCP changes go through the shared command layer, so undo and multiplayer keep working.
- File format changes come with schema, generated reference docs and an updated example.
- Errors that reach a person (UI, CLI, MCP) say what went wrong and what to do about it.

**Tests**

- New behaviour has a test at the lowest level that can show it: core logic in unit tests,
  user flows in the e2e suite.
- Tests describe behaviour, not implementation details, and their names read as sentences.
