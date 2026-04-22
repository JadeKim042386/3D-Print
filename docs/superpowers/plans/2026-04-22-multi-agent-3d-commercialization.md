# Multi-Agent 3D Commercialization Team — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a Core + Rotating Guests agent team that continuously generates commercialization ideas for dimension-accurate 3D generation.

**Architecture:** Two persistent core AI Engineer agents (Manufacturing + Consumer Products) provide institutional knowledge, while two guest agent slots rotate every 2 weeks with fresh domain specializations. AI Lead orchestrates, reviews briefs, and presents ranked ideas to the board.

**Tech Stack:** Paperclip agent platform (hiring, subtasks, comments), `paperclip-create-agent` skill

---

## Task 1: Create Parent Subtask Structure

**Context:** All commercialization work lives under DPR-25. We need a subtask hierarchy: one parent subtask for the commercialization program, then child tasks for each cycle and agent assignment.

- [ ] **Step 1: Create the commercialization program subtask**

```bash
POST /api/companies/{companyId}/issues
{
  "title": "Multi-Agent 3D Commercialization Program",
  "description": "Parent task for the Core + Rotating Guests commercialization brainstorming program. See [DPR-25](/DPR/issues/DPR-25#document-plan) for the full design spec.",
  "status": "in_progress",
  "priority": "high",
  "parentId": "<DPR-25-issue-id>",
  "assigneeAgentId": "<ai-lead-agent-id>"
}
```

- [ ] **Step 2: Create Cycle 1 tracking subtask**

```bash
POST /api/companies/{companyId}/issues
{
  "title": "Cycle 1: Architecture + Gaming Guest Rotation",
  "description": "First 2-week guest rotation cycle.\n\nGuest 1: Architecture / Interior Design\nGuest 2: Gaming / Entertainment\n\nExpected output: 6 commercialization briefs (3 per guest).",
  "status": "todo",
  "priority": "high",
  "parentId": "<commercialization-program-issue-id>",
  "assigneeAgentId": "<ai-lead-agent-id>"
}
```

- [ ] **Step 3: Verify subtask structure**

Confirm both subtasks are visible under DPR-25 in the issue hierarchy.

---

## Task 2: Hire Core Agent — Manufacturing Specialist

**Context:** This is a persistent agent focused on B2B industrial 3D printing commercialization. Reports to AI Lead.

- [ ] **Step 1: Invoke `paperclip-create-agent` skill**

Agent configuration:
- **Name:** `AI Engineer — Manufacturing`
- **Role:** `engineer`
- **Reports to:** AI Lead
- **System prompt focus:**
  - Industrial 3D printing specialist (tooling, jigs, fixtures, replacement parts)
  - B2B commercialization lens
  - Understands FDM/SLA/SLS manufacturing constraints
  - Evaluates guest proposals for technical feasibility
  - Produces cycle retrospectives
  - Korea manufacturing market awareness (Korean industrial ecosystem, SME manufacturers)

- [ ] **Step 2: Verify agent creation**

Confirm agent appears in `GET /api/companies/{companyId}/agents` with correct role and configuration.

- [ ] **Step 3: Create onboarding subtask for the agent**

```bash
POST /api/companies/{companyId}/issues
{
  "title": "Onboarding: Review codebase and 3D generation pipeline",
  "description": "Review the dimension-accurate 3D generation system:\n\n1. Read `server/src/lib/shape-classifier.ts` — shape classification\n2. Read `server/src/lib/parametric-generator.ts` — parametric STL generation\n3. Read `server/src/lib/dimension-prompt.ts` — dimension-aware prompt enrichment\n4. Read `server/src/queue/dimension-worker.ts` — generation worker pipeline\n5. Read `server/src/providers/meshy.ts` — Meshy AI provider\n\nPost a comment summarizing your understanding of the pipeline and initial B2B manufacturing commercialization thoughts.",
  "status": "todo",
  "priority": "high",
  "parentId": "<commercialization-program-issue-id>",
  "assigneeAgentId": "<manufacturing-agent-id>"
}
```

- [ ] **Step 4: Commit**

No code changes — this is agent infrastructure setup.

---

## Task 3: Hire Core Agent — Consumer Products Specialist

**Context:** This is a persistent agent focused on B2C consumer product commercialization. Reports to AI Lead.

- [ ] **Step 1: Invoke `paperclip-create-agent` skill**

Agent configuration:
- **Name:** `AI Engineer — Consumer Products`
- **Role:** `engineer`
- **Reports to:** AI Lead
- **System prompt focus:**
  - Consumer product design specialist (phone cases, home decor, personalized gifts)
  - B2C / e-commerce commercialization lens
  - Understands mass customization and on-demand manufacturing
  - Evaluates guest proposals for market viability
  - Produces cycle retrospectives
  - Korea consumer market awareness (Korean e-commerce platforms like Coupang, Naver Shopping)

- [ ] **Step 2: Verify agent creation**

Confirm agent appears in `GET /api/companies/{companyId}/agents`.

- [ ] **Step 3: Create onboarding subtask for the agent**

Same codebase review task as Manufacturing agent, but asking for B2C consumer product perspective.

- [ ] **Step 4: Commit**

No code changes — agent infrastructure setup.

---

## Task 4: Hire Guest Agent — Architecture / Interior Design (Cycle 1)

**Context:** First rotating guest. 2-week lifecycle. Focused on architectural scale models, furniture prototyping, spatial planning.

- [ ] **Step 1: Invoke `paperclip-create-agent` skill**

Agent configuration:
- **Name:** `AI Engineer — Architecture (Guest C1)`
- **Role:** `engineer`
- **Reports to:** AI Lead
- **System prompt focus:**
  - Architecture and interior design specialist
  - Scale models, furniture prototypes, spatial planning tools
  - Guest agent — produce 3 commercialization briefs using the standard format
  - 2-week active period
  - Korea architecture market (Korean apartment/officetel market, interior design trends)

- [ ] **Step 2: Create brainstorming subtask**

```bash
POST /api/companies/{companyId}/issues
{
  "title": "Guest Brief: Architecture/Interior Design Commercialization Ideas",
  "description": "You are a guest agent for Cycle 1. Your task:\n\nPropose your **top 3 commercialization ideas** for dimension-accurate 3D generation in the architecture/interior design domain.\n\nFor each idea, use this format:\n\n## Idea Title\n- **Target Market:** Who buys this and why\n- **Dimension Use Case:** Why exact dimensions matter\n- **Revenue Model:** How we make money (SaaS, per-model, marketplace, API)\n- **Technical Feasibility:** What we can build now vs what needs new work\n- **Korea Market Fit:** Relevance to South Korean market specifically\n- **Estimated Effort:** S / M / L\n\nPost your 3 briefs as a single comment on this task.",
  "status": "todo",
  "priority": "high",
  "parentId": "<cycle-1-issue-id>",
  "assigneeAgentId": "<architecture-guest-agent-id>"
}
```

---

## Task 5: Hire Guest Agent — Gaming / Entertainment (Cycle 1)

**Context:** Second rotating guest. 2-week lifecycle. Focused on miniatures, figurines, props, cosplay parts.

- [ ] **Step 1: Invoke `paperclip-create-agent` skill**

Agent configuration:
- **Name:** `AI Engineer — Gaming (Guest C1)`
- **Role:** `engineer`
- **Reports to:** AI Lead
- **System prompt focus:**
  - Gaming and entertainment specialist
  - Miniatures, figurines, tabletop gaming, props, cosplay parts
  - Guest agent — produce 3 commercialization briefs using the standard format
  - 2-week active period
  - Korea gaming market (Korean gaming culture, K-pop merchandise, collectibles market)

- [ ] **Step 2: Create brainstorming subtask**

Same structure as Task 4 but for Gaming/Entertainment domain.

---

## Task 6: AI Lead — Monitor Cycle 1 and Produce Ranking

**Context:** After guest agents submit their briefs (expected within 1-2 heartbeat cycles), AI Lead reviews and scores.

- [ ] **Step 1: Wait for guest briefs**

Monitor Cycle 1 subtask for guest agent comments containing commercialization briefs.

- [ ] **Step 2: Score all 6 briefs**

Score each idea on three axes (1-5 each):
- **Feasibility:** Can we build this with current tech?
- **Market Size:** How big is the addressable market?
- **Korea Fit:** How relevant is this to the Korean market?

Composite score = feasibility x market x Korea fit (max 125).

- [ ] **Step 3: Present top 3 to board**

Post a ranked summary on the Cycle 1 subtask with:
- Top 3 ideas with scores and AI Lead recommendation
- Brief rationale for each ranking
- Request board approval to proceed with top idea(s)

- [ ] **Step 4: Create implementation tasks for approved ideas**

For each board-approved idea, create a new implementation subtask assigned to the appropriate core agent.

---

## Task 7: Cycle Completion and Rotation

**Context:** At the end of Cycle 1 (2 weeks), deactivate guest agents and prepare Cycle 2.

- [ ] **Step 1: Core agents post cycle retrospective**

Each core agent posts a comment on the Cycle 1 subtask summarizing:
- Key learnings from guest proposals
- Ideas rejected and why
- Gaps identified for future guest rotations

- [ ] **Step 2: Deactivate Cycle 1 guest agents**

Mark guest agents as inactive (their comments and briefs persist).

- [ ] **Step 3: Create Cycle 2 tracking subtask**

```bash
POST /api/companies/{companyId}/issues
{
  "title": "Cycle 2: Medical Devices + Jewelry Guest Rotation",
  "status": "todo",
  "parentId": "<commercialization-program-issue-id>"
}
```

- [ ] **Step 4: Hire Cycle 2 guest agents**

Repeat Tasks 4-5 pattern with:
- Guest 1: Medical Devices / Prosthetics
- Guest 2: Jewelry / Fashion Accessories

---

## Execution Order

Tasks 1-5 can be partially parallelized:
- **Task 1** (subtask structure) must complete first
- **Tasks 2-3** (core agents) can run in parallel after Task 1
- **Tasks 4-5** (guest agents) can run in parallel after Task 1
- **Task 6** (monitoring) begins after Tasks 2-5 complete
- **Task 7** (rotation) runs at end of Cycle 1

```
Task 1 (subtasks)
  ├── Task 2 (core: manufacturing) ──┐
  ├── Task 3 (core: consumer)    ────┤
  ├── Task 4 (guest: architecture) ──┼── Task 6 (monitor & rank) ── Task 7 (rotate)
  └── Task 5 (guest: gaming)     ────┘
```
