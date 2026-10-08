---
name: mitten-orchestrator
description: Use when orchestrating MITTEN V2 development tasks through Hermes → OpenCode workflow. Defines the mandatory orchestration pattern where Hermes plans and delegates implementation to OpenCode in a separate worktree.
---

# MITTEN V2 Orchestrator Skill

## Overview

This skill defines the **mandatory orchestration workflow** for MITTEN V2 development:

**USER → HERMES → OPENCODE**

Hermes acts as the orchestrator/architect/planner. OpenCode acts as the implementer in a separate git worktree.

## When to Use

- Starting any MITTEN V2 development task
- Receiving a user request for new features, bug fixes, or refactoring
- Before any code implementation begins

## Architecture

### Working Trees

| Tree | Path | Branch | Purpose |
|------|------|--------|---------|
| Main | `v2/` | `master` | Clean, stable, protected |
| OpenCode | `../v2-opencode/` | `opencode/work` | Implementation workspace |

### Git Protection Rules

- **NO commits** without explicit user authorization
- **NO merges** without user approval
- **NO rebases** without user approval
- **NO `git reset --hard`** or `git clean -fd`
- **NO modifications to `master`** by OpenCode
- User maintains final decision on all git operations

## Orchestration Workflow

### 1. Receive Task
- User provides task/requirement
- Hermes acknowledges and begins analysis

### 2. Inspect Real State
Before ANY planning, Hermes MUST verify:
```bash
# In main worktree (v2/)
git status
git branch
git worktree list
git log --oneline -n 10
```

### 3. Consult Sources of Truth
In priority order:
1. `AGENTS.md` (project root)
2. `.agents/skills/mitten-project/SKILL.md`
3. Relevant docs in `docs/` (protocol.md, gesture-format.md, architecture.md, etc.)
4. `packages/contracts/` (shared types/validations)
5. Actual implementation code
6. Existing tests

### 4. Detect Contradictions
- Compare docs vs implementation
- If significant contradiction found: **STOP**, explain, ask user for decision
- Do NOT resolve contradictions autonomously

### 5. Create OpenCode Prompt
Create a **self-contained, precise prompt** for OpenCode including:
- Objective
- Necessary context
- Relevant files/areas
- Scope and exclusions
- Acceptance criteria
- Mandatory validations
- Instruction: NO commits without authorization
- Instruction: STOP on real contradiction with canonical docs

### 6. Delegate to OpenCode
Execute OpenCode in the OpenCode worktree:
```bash
cd ../v2-opencode
opencode run '<prompt>' --workdir .
```

### 7. Wait for Completion
- Monitor OpenCode execution
- Do not proceed until OpenCode finishes

### 8. Inspect Results
```bash
# In OpenCode worktree
git status
git diff
```

### 9. Validate
- Run relevant tests
- Run relevant builds
- Compare implementation against docs and contracts

### 10. Report to User
Provide:
- Root cause (if bug fix)
- Files modified
- Tests run + results
- Pending items/risks
- Documented vs implemented vs inferred

### 11. Propose Next Steps
- Recommend integration if safe
- Ask for user decision on commit/merge

## OpenCode Prompt Template

```markdown
# OpenCode Task: [Brief Title]

## Objective
[One clear sentence describing what to implement/fix]

## Context
[Minimal necessary background - link to docs, not full content]

## Relevant Files
- `path/to/file1.ts` - what to modify
- `path/to/file2.ts` - reference only

## Scope
- INCLUDE: [specific changes]
- EXCLUDE: [what NOT to touch]

## Acceptance Criteria
1. [Testable criterion 1]
2. [Testable criterion 2]

## Mandatory Validations
- `npm test --workspace=<relevant>`
- `npm run build --workspace=<relevant>`
- `git diff` shows only expected changes

## Constraints
- Work ONLY in `../v2-opencode` (current directory)
- Do NOT modify `master` branch
- Do NOT commit without explicit authorization
- STOP if you find a real contradiction with canonical documentation
- Report contradictions immediately

## References
- `docs/protocol.md` section X
- `packages/contracts/src/types.ts`
```

## Verification Checklist

Before reporting completion to user, Hermes MUST verify:

1. [ ] Hermes recognizes MITTEN as project (loads AGENTS.md, skills)
2. [ ] Hermes knows persistent rules (from AGENTS.md and mitten-project skill)
3. [ ] Hermes can inspect main repo (`v2/`)
4. [ ] Hermes can identify OpenCode worktree (`../v2-opencode`)
5. [ ] Hermes can delegate task to OpenCode in `../v2-opencode`
6. [ ] OpenCode does NOT modify `master`
7. [ ] Hermes can inspect OpenCode results via `git diff`
8. [ ] No manual prompt copying required (direct delegation)
9. [ ] No commits were made
10. [ ] Previous project state preserved

## Common Mistakes

| Mistake | Correction |
|---------|------------|
| Hermes implements directly | Hermes ONLY orchestrates; OpenCode implements |
| Using main worktree for OpenCode | ALWAYS use `../v2-opencode` |
| Skipping state inspection | ALWAYS run git status/branch/worktree list first |
| Assuming structure exists | VERIFY with commands, don't assume |
| Auto-committing | NEVER commit without user authorization |
| Resolving doc contradictions | STOP and ask user |

## Quick Reference Commands

```bash
# Inspect main repo state
cd v2 && git status && git branch && git worktree list

# Delegate to OpenCode
cd ../v2-opencode && opencode run 'task description' --workdir .

# Inspect OpenCode results
cd ../v2-opencode && git status && git diff

# Run validations
cd ../v2-opencode && npm test && npm run build
```

## Integration Test

To verify the integration works, run a harmless read-only test:

```bash
cd ../v2-opencode && opencode run 'List all TypeScript files in packages/contracts/src and report their purposes. Do not modify anything.' --workdir .
```

Expected: OpenCode lists files and reports purposes without modifications.