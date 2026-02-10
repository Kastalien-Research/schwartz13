# Round 3 Briefing: Tighten Queries to Behavioral Signals

## What is Thoughtbox?

Thoughtbox is a **reasoning ledger and collaboration hub for AI agents** — an MCP server that makes agent reasoning durable, auditable, and collaborative.

**Single-agent**: "10x Sequential Thinking" — step-by-step reasoning with numbered thoughts, branching, revision, and persistence. Unlike ephemeral chain-of-thought prompting, every thought is stored as a node in a graph that can be visualized, exported, and analyzed.

**Multi-agent**: A "git-inspired reasoning workspace" — agents register, claim problems, propose solutions, review each other's work, and reach consensus through a Hub with 27 operations.

**The "aha moment"**: Realizing you can audit ALL the actions AND reasoning of your agent teams. Not just what they did, but WHY they did it — visible, replayable, analyzable.

### Key Features
- **Reasoning Ledger**: Every thought is numbered, timestamped, linked, persistent, exportable
- **Thinking Patterns**: Forward, backward, branching, revision, interleaved
- **Observatory**: Real-time web UI showing reasoning graphs as they unfold
- **Hub**: 27 operations for multi-agent coordination (workspaces, problems, proposals, reviews, consensus, channels)
- **Knowledge Graph**: Persistent memory across sessions (entities, relations, observations)
- **Mental Models**: 15 structured frameworks (five-whys, pre-mortem, steelmanning, etc.)
- **Autonomous Critique**: MCP sampling API requests external LLM analysis of thoughts
- **Progressive Disclosure**: 4-stage tool availability system

### Technical Profile
- **MCP server** — runs via `npx -y @kastalien-research/thoughtbox`
- **Optimized for Claude Code** (working on other MCP client support)
- **Local-first**: All data at `~/.thoughtbox/`, nothing sent externally
- **Docker required** for full deployment (observability stack: Prometheus, Grafana, OpenTelemetry)
- **Node.js >=20**, TypeScript, ESM

### Barrier to Entry
Docker + local machine. This filters for technically sophisticated users comfortable with containers.

## Round 2 Output (14 queries)

See `.agent-team/final-queries-v2.json` for the full set. Summary:

| # | Label | Entity Type | Count | Priority |
|---|-------|-------------|-------|----------|
| Q1 | MCP Server Developers | github_repo | 100 | high |
| Q2 | AI Agent Framework Companies | company | 50 | high |
| Q3 | Claude Code Power Users | tweet | 50 | high |
| Q4 | Multi-Agent System Repos | github_repo | 50 | high |
| Q5 | AI Safety & Alignment Researchers | person | 50 | medium |
| Q6 | AI-Native Startups | company | 100 | medium |
| Q7 | Dev Tool Companies with AI | company | 50 | medium |
| Q8 | CoT Reasoning Researchers | research_paper | 50 | medium |
| Q9 | Open Source Maintainers Using AI | person | 50 | medium |
| Q10 | OSINT & Threat Intelligence | company | 50 | low |
| Q11 | Technical Educators & AI Content Creators | person | 50 | medium |
| Q12 | AI Consultants & ML Freelancers | linkedin_profile | 50 | medium |
| Q13 | AI/ML Engineers & Prompt Engineers | linkedin_profile | 100 | high |
| Q14 | Enterprise AI/ML Platform Teams | company | 50 | medium |

## Round 3 Objective

**Transform these from demographic categories into behavioral-signal queries.**

A "behavioral signal" means the person/repo/company has **demonstrated** one of these:
1. **Pain with agent opacity** — complained about not knowing what their AI agents did or why
2. **Multi-agent coordination experience** — built or struggled with multi-agent systems
3. **Reasoning chain interest** — discussed chain-of-thought, structured reasoning, or thought auditability
4. **MCP ecosystem involvement** — building/using MCP servers, especially with Claude Code
5. **Docker-comfortable technical depth** — builds tools that require container deployment

### Strategy: What to Change

**Tighten query strings**: From broad categories ("AI engineers") to specific behaviors ("engineers who have discussed debugging AI agent behavior" or "repos implementing agent observability")

**Tighten criteria**: From demographic filters ("is a startup") to behavioral filters ("company's blog discusses agent coordination challenges" or "person has published about AI reasoning transparency")

**Drop weak-fit queries**: If a query can't be tightened to behavioral signals, drop it. Better to have 8 razor-sharp queries than 14 broad ones.

**Candidates to drop or merge**:
- Q5 (AI Safety Researchers) — too academic, unlikely Docker users
- Q8 (CoT Research Papers) — academics publish papers, not run Docker containers
- Q10 (OSINT) — too indirect
- Q6 + Q7 + Q14 could merge — all are "companies doing AI" at different scales

**Candidates to sharpen significantly**:
- Q1: MCP repos → MCP repos that specifically involve reasoning, planning, or agent coordination
- Q3: Claude Code tweets → tweets about multi-agent Claude Code workflows or agent auditability
- Q4: Multi-agent repos → repos where coordination failure or opacity is a documented pain point
- Q13: AI/ML engineers → engineers specifically working on agent orchestration or reasoning tooling

### Quality Bar for Round 3

Each query must pass ALL of these:
1. **Behavioral signal**: The query string and criteria target a specific demonstrated behavior, not a job title or company category
2. **Thoughtbox relevance**: A clear, specific connection to Thoughtbox's value (auditability, structured reasoning, multi-agent coordination)
3. **Web-observable**: Exa can verify the criteria from publicly crawlable data
4. **Docker-ready audience**: The target demographic is technically sophisticated enough to run Docker locally
5. **Contact path**: The enrichments extract actionable contact information

## Websets Query Format Reference

```json
{
  "query": "specific search string targeting behavioral signals",
  "entity": { "type": "github_repo|company|person|tweet|linkedin_profile|research_paper" },
  "criteria": [
    { "description": "Yes/no evaluable statement about the entity — must be web-observable" }
  ],
  "count": 50,
  "enrichments": [
    { "description": "What contact info to extract", "format": "text" },
    { "description": "What relevance assessment to make", "format": "text" }
  ]
}
```

## File Paths
- Round 2 queries: `.agent-team/final-queries-v2.json`
- Round 2 critique: `.agent-team/critiques/batch-final.md`
- Output target: `.agent-team/final-queries-v3.json`
