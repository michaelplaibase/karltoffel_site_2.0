# Karltoffel — Scope

## What Karltoffel is

Karltoffel is an **AI agent that acts as a virtual employee for a Danish service business** (outdoor/gardening services — e.g. hækklipning, algerens — operating across locations such as Horsens). Plaibase is hired to build it; Karltoffel is the end client.

The core idea is a deliberate shift in mental model:

> **Stop thinking in "workflows." A workflow is something you design. An employee is something you ask.**

Instead of "find the right workflow," the experience is **"ask the AI agent."** Employees talk to it in Slack and it answers using live business data. Examples:

- *"Hvordan ser næste uge ud?"* → "Vi har 63% belægning. Horsens er underbooket. Jeg anbefaler en kampagne for algerens."
- *"Hvilke kunder skal vi kontakte?"* → "34 tidligere kunder har ikke købt i 12 måneder. 12 af dem har tidligere købt hækklipning."
- *"Hvorfor faldt vores leads?"* → "Google Ads faldt 18%. Søgevolumen faldt 7%. Landingpage-konverteringen faldt fra 8,2% til 5,6%."

## Strategic decision: Claude as the platform, not just the model

A key fork was discussed. One option was to build Karltoffel **model-agnostic** — a model-router adapter so Claude could later be swapped for GPT/Gemini/local models.

**This was explicitly rejected.** The chosen strategy is the opposite: deliberately build Karltoffel to be **dependent on Claude as the platform**, making Claude part of the value proposition and a commercial lock-in — not just an interchangeable model.

## Intended architecture

The interaction shape is the heart of the product:

```
Slack  →  @AI-agenten  →  Handling (action)
```

The full intended stack:

```
Claude Team/Enterprise
  ↓
Claude Project: "Karltoffel AI Agent"   ← the agent's "brain" / knowledge base
  ↓
Slack: @Claude                          ← employee interface
  ↓
MCP servers (the tool layer):
  - Workmaker (source of truth)
  - Gmail
  - Google Ads
  - Meta Ads
  - Website
  - Weather
  - Capacity / booking
  ↓
Browser fallback: Browserbase / cloud CDP browser
```

## Conceptual layers

1. **Business logic as files** — markdown "brain" docs living in the Claude Project. These are the agent's operating system:
   - `01_company_vision.md`
   - `02_tone_of_voice.md`
   - `03_services_and_packages.md`
   - `04_pricing_rules.md`
   - `05_support_rules.md`
   - `06_marketing_strategy.md`
   - `07_offer_engine_rules.md`
   - `08_capacity_strategy.md`
   - `09_learning_loop.md`
   - `10_tool_permissions.md`
   - plus `approval_rules.md`
2. **Tools as an API layer** — MCP servers connecting to the real systems, with **Workmaker as the source of truth**, plus Gmail, Google Ads, Meta Ads, website, weather, and calendar/capacity.
3. **Memory as a separate layer** — learnings that get updated when an employee corrects the agent (e.g. *"never give a fixed price without an address, service, and scope"*). Stored as the agent's persistent knowledge (`learnings.json`, `customer-service-rules.json`, `campaign-learnings.json`, `offer-learnings.json`).

## Learning loop

When an employee corrects a draft, the agent is expected to extract the learning and update the rules. Example:

```
@Claude Se forskellen på dit udkast og min rettelse.
Hvad skal du lære? Opdater kundeservice-reglerne.
```

→

```
Læring:
Vi må ikke give fast pris uden adresse.

Ny regel:
Ved prisforespørgsler skal der altid indhentes adresse, ydelse og omfang før fast pris.

Gælder for:
Tilbud, kundeservice, hækklipning, algerens.
```

## Safety / approval principles

- Sensitive actions (publishing campaigns, payments, budget changes, account access, deletions) should require **human approval** rather than full autonomous execution.
- Browser/agent control should be kept off the public internet and access restricted; prompt-injection and exposed-instance risks are real and must be guarded against.
- For any cloud/remote browser use, prefer a persistent profile, Danish residential proxy/IP where possible, and an approval layer before "dangerous actions."

## Where the lock-in lives

```
Claude Projects = virksomhedens AI-hukommelse
Claude Slack    = medarbejdernes AI-interface
Claude MCP      = værktøjslaget
Claude Code     = udviklings- og vedligeholdelsesmiljø
Claude API      = agentmotor
```

The goal is that Claude is not just "a tool we use" but becomes part of how the company works.
