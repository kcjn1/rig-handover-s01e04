---
name: plan-to-issues
description: Split this repo's plan.md into GitHub issues with gh, one per unit of work, after a human has reviewed the split. Use when a plan is ready and has no issues yet.
---

# plan-to-issues

Turns `plan.md` into GitHub issues that workers can pick up cold. Easiest with `gh`, authenticated,
in a shell this agent can run.

## Steps

1. Read `plan.md`, `AGENTS.md` and `docs/adr/`.
2. Draft the split as a table: title · plan section · scope · done when · blocked by.
   One issue per unit of work.
3. **Stop and show the table to the human.** Publish nothing until they approve it.
4. Ask the human what every issue here must carry (fields, labels, wording), unless it is
   already written down in this session or in the repo. It is written down: see "Issue shape"
   below. Ask only if the plan needs something that shape does not cover.
5. Create each issue in dependency order, so blocked-by can cite real numbers:

   ```sh
   gh issue create --title "<title>" --body-file <tmp.md>
   ```

6. Record every issue URL from gh's output (not from memory) and reply with the list.

## Issue shape

Decided by the human (kcjn1) on 2026-11-21 when splitting plan morning-digest. Every issue
split from a plan carries exactly this:

- **Label:** `plan:<plan name from the plan's frontmatter>`, e.g. `plan:morning-digest`.
  Create it once with `gh label create` if the repo does not have it.
- **Body**, in this order:

  ```md
  Source: plan.md § <section, e.g. 1 or 2a>

  ## Scope
  <what to build, in the plan's words; rules from AGENTS.md, the styleguide and ADRs that apply>

  ## Done when
  <the plan's done condition for that section, word for word>

  ## Blocked by
  <"Nothing", or real issue numbers; say "#1 to start, #2 to check Done when" when they differ>
  ```

  The first line is the `Source:` line, nothing above it: the reviewer sorts issues by it.

Split rules that came out of that review:

- A section whose first commit unblocks others (like "commit `types.ts` first") gets its own
  issue, so the parallel work can start against it.
- A step that waits on someone outside the repo (a reviewer's look) stays open until they
  confirm, and the clean-up after it is blocked by it. Never close the clean-up first.
- A choice the plan leaves open (what a count counts, for example) is asked of the human
  before publishing, and the answer goes into the Scope of the issues it touches.

Closing one, with the closing comment from AGENTS.md:

```sh
gh issue close <n> -c "<closing comment>"
```

A commit message with `closes #n` closes the issue on push, before any comment. Then post the
closing comment with `gh issue comment <n> -b "<closing comment>"` instead.

## No `gh`

Steps 1–4 hold either way. GitHub reachable another way (a connector, the REST API, the web UI):
the same issues, made that way. GitHub issues out of reach altogether: write them as files in
`docs/issues/`, format in ADR 0004, then commit and push.

## Don'ts

- Don't paste the whole plan into one issue, and don't keep issues only in chat.
- Don't invent sections the plan doesn't have. If the plan is unclear, ask.
