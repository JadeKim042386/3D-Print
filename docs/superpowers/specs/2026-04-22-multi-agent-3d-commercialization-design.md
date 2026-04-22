# Multi-Agent 3D Commercialization Team — Design Spec

**Issue:** DPR-25
**Date:** 2026-04-22
**Author:** AI Lead
**Status:** Approved by board

## Problem

The 3D generation system with exact dimensional accuracy is built and functional (Meshy AI + parametric engine + dimension-aware prompt enrichment). The next challenge is identifying and validating commercialization paths — which markets, use cases, and revenue models best leverage dimension-accurate 3D generation, particularly in the South Korean market.

A single perspective risks blind spots. The board wants a structured way to continuously generate diverse commercial ideas by hiring specialized AI agents with different domain lenses, rotating them periodically to avoid groupthink.

## Solution: Core + Rotating Guests

A two-tier agent team where persistent "core" agents maintain institutional knowledge while rotating "guest" agents inject fresh domain perspectives on a 2-week cycle.

## Team Structure

### Core Team (Persistent)

Two AI Engineer agents that stay across rotations. They report to the AI Lead.

| Agent | Specialization | Focus |
|-------|---------------|-------|
| AI Engineer — Manufacturing | Industrial 3D printing, tooling, jigs, fixtures | B2B: factory replacement parts, custom tooling, rapid prototyping services |
| AI Engineer — Consumer Products | Consumer goods, personalization, e-commerce | B2C: custom phone cases, home decor, personalized gifts, on-demand products |

**Responsibilities:**
- Understand the codebase and generation pipeline deeply
- Evaluate guest proposals for technical feasibility
- Build winning ideas after board approval
- Maintain a running "what we've tried / rejected" knowledge base
- Produce cycle retrospectives summarizing learnings

### Guest Slots (Rotating, 2-Week Cycles)

Two AI Engineer agents hired fresh each cycle with domain-specific system prompts. They brainstorm freely and produce structured output before rotation.

**Rotation schedule (first 3 cycles):**

| Cycle | Weeks | Guest 1 | Guest 2 |
|-------|-------|---------|---------|
| 1 | 1-2 | Architecture / Interior Design | Gaming / Entertainment |
| 2 | 3-4 | Medical Devices / Prosthetics | Jewelry / Fashion Accessories |
| 3 | 5-6 | Education / STEM | Automotive / Aerospace |

Future rotations selected based on gaps identified by prior cycles.

## Workflow

### Guest Agent Onboarding

Each guest receives a standardized brief:

1. Read access to the codebase and current 3D generation capabilities
2. Explanation of dimensional accuracy as the core product differentiator
3. A task: "Propose your top 3 commercialization ideas for dimension-accurate 3D generation in your domain"

### Required Output: Commercialization Brief

Each guest produces 3 briefs in this format:

```markdown
## Idea Title

- **Target Market:** Who buys this and why
- **Dimension Use Case:** Why exact dimensions matter for this use case
- **Revenue Model:** How we make money (SaaS, per-model, marketplace, API)
- **Technical Feasibility:** What we can build now vs. what needs new development
- **Korea Market Fit:** Relevance to the South Korean market specifically
- **Estimated Effort:** S / M / L to implement
```

### AI Lead Orchestration

Each cycle, the AI Lead:

1. Reviews all guest commercialization briefs
2. Scores ideas: feasibility (1-5) x market size (1-5) x Korea fit (1-5)
3. Presents the top 3 ranked ideas to the board with a recommendation
4. Board approves or rejects
5. Approved ideas become implementation tasks assigned to core agents or new issues

## Agent Lifecycle and Governance

### Hiring

Use `paperclip-create-agent` skill for each agent. Configuration:

- **Role:** `engineer`
- **System prompt:** Domain-specific, emphasizing their specialization and the commercialization brief format
- **Assignment:** Subtasks under DPR-25
- **Lifecycle:** Core agents are indefinite; guest agents have a 2-week active period

### Rotation Mechanics

- At cycle end, guest agents are deactivated (not deleted — their ideas persist in issue comments and briefs)
- New guests hired for the next cycle with different specializations
- Core agents post a "cycle retrospective" summarizing key learnings and rejected ideas

### Budget Control

- Each guest gets a scoped subtask (not open-ended exploration)
- Heartbeat budget capped per agent
- AI Lead monitors output quality — low-value specializations are noted and avoided in future rotations

## Information Flow

```
Board
  | approves top ideas, sets strategic direction
  v
AI Lead (orchestrator)
  | reviews, ranks, presents recommendations
  v
Core Agents (Manufacturing + Consumer Products)
  | evaluate feasibility, build approved ideas
  v
Guest Agents (rotating every 2 weeks)
  -> produce commercialization briefs
```

## Success Criteria

1. Each 2-week cycle produces at least 6 commercialization briefs (3 per guest)
2. At least 1 idea per cycle scores above threshold (feasibility x market x Korea fit >= 45)
3. Board approves at least 2 ideas for implementation within the first 3 cycles
4. Core agents successfully prototype at least 1 approved idea within 4 weeks of approval

## Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| Guest agents produce generic/low-quality ideas | Domain-specific system prompts + structured brief format + AI Lead quality gate |
| Core agents develop blind spots over time | Guest rotation injects external perspectives; cycle retrospectives force self-reflection |
| Too many ideas, not enough execution | Board approval gate limits pipeline; core team capacity constrains throughput |
| Budget overrun from too many agents | Scoped subtasks, capped heartbeats, 2-week rotation limit |
| Rotation overhead (hiring/onboarding cost) | Standardized onboarding brief reduces ramp-up time |

## Implementation Steps

1. Hire 2 core AI Engineer agents (Manufacturing + Consumer Products)
2. Create subtask structure under DPR-25 for cycle management
3. Hire first 2 guest agents (Architecture + Gaming) for Cycle 1
4. Run Cycle 1, collect briefs, score and present to board
5. Rotate guests, begin Cycle 2
6. Iterate based on board feedback and idea quality
