# Semantic Crons

A pattern for detecting fuzzy events that don't exist as structured metrics anywhere, by composing narrow self-updating datasets into composite signals.

## The Problem

Some things you want to know about are hard to search for directly. "Is this company about to launch a major product?" doesn't have a URL or a database row. But it has *proxies* — observable patterns that, taken together, strongly suggest the thing is happening.

No single proxy is sufficient. A hiring surge could mean anything. Press mentions could be routine. But a hiring surge *and* press mentions *and* new patent filings *and* executive conference appearances — all for the same company, all within the same month — that's a signal.

## Who This Is For

This pattern favors **domain expertise**. A single Webset with the right query, criteria, and enrichments can extract very specific information — but knowing *which* specific information to extract, and knowing that *this* pattern in *this* data combined with *that* pattern in *that* data means something actionable — that's domain knowledge.

A semiconductor analyst who's spent 15 years watching foundry cycles knows that when TSMC starts hiring lithography process engineers *and* ASML reports certain equipment delivery patterns *and* specific academic groups publish on a particular node geometry — those signals, taken together, mean a process node transition is coming. Maybe 50 people in the world would recognize that composite. Each individual signal is public. The insight is knowing which signals to watch and how they combine.

The semantic cron codifies this tacit knowledge. The enrichments extract exactly what the expert knows to look for. The shapes encode exactly what matters. The join rules encode the compositional logic that previously existed only as intuition. Once configured, it runs continuously — the expert gets forewarning *faster* than peers who are watching the same domain but holding the pattern in their heads instead of in an automated sensor array.

The agent's role is **translation, not invention**. The expert describes the signals and the composition. The agent turns that into lenses, shapes, and join rules. The domain knowledge must come from the user.

## The Pattern

Each Webset is a **lens** — a narrow search tuned to one observable pattern. Criteria define what passes through the lens. Enrichments extract specific properties from each item that passes.

An item's enrichment values give it a **shape** — a specific data profile. "Company with > 10 open ML roles" is a shape. "Article in a tier-1 publication mentioning product launch" is a shape.

The signal emerges when you **join items across lenses** and find that the composite — items with specific shapes from different lenses, correlated by entity identity or temporal proximity — satisfies a pattern that no individual lens could detect.

This composite pattern is your **proxy** for the fuzzy event.

```
Lens A: hiring patterns     → items with shape M
Lens B: press coverage      → items with shape N
Lens C: patent filings      → items with shape O
                               ↓
                         join by entity + time
                               ↓
                    composite signal = proxy for
                    "imminent product launch"
```

### Two modes of correlation

**Entity correlation.** The same entity (company, person, URL) appears across multiple lenses with complementary shapes. Company X shows up in the hiring lens *and* the funding lens *and* the patent lens. The signal is about Company X specifically.

**Co-occurrence.** Different items appear across lenses within a time window. A wave of AI hiring posts appears in Lens A while a wave of AI funding announcements appears in Lens B. The entities may be different — the signal is about the *market*, not any single entity.

Both are valid. Many real semantic crons use a hybrid: some lenses join by entity, others contribute co-occurrence context.

## Vocabulary

| Term | Meaning |
|------|---------|
| **Lens** | A Webset configured to observe one narrow signal. Defined by query, criteria, enrichments. |
| **Shape** | Item-level conditions on enrichment values. What makes an item "count" as evidence within a lens. |
| **Join** | The operation that correlates items across lenses — by entity identity, temporal proximity, or both. |
| **Composite signal** | The emergent finding from joined, shaped items across lenses. |
| **Proxy** | What the composite signal stands for — the fuzzy event you actually care about. |
| **Snapshot** | A point-in-time capture of all lens states, shaped items, and the composite determination. |
| **Delta** | What changed between two snapshots — new items, signal transitions, emerging or fading composites. |

## Configuration Schema

A semantic cron configuration has four parts: lenses, shapes, join rules, and the composite signal definition.

### Lenses

Each lens defines a Webset that observes one narrow concern.

```json
{
  "id": "hiring-surge",
  "source": {
    "query": "{{subject}} hiring machine learning engineers",
    "entity": {"type": "company"},
    "criteria": [
      {"description": "Job posting is for a technical ML/AI role"},
      {"description": "Posted within the last 60 days"}
    ],
    "enrichments": [
      {"description": "Number of similar open roles at this company", "format": "number"},
      {"description": "Seniority level of the role", "format": "options",
       "options": [{"label": "Junior"}, {"label": "Mid"}, {"label": "Senior"}, {"label": "Lead/Staff"}]}
    ],
    "count": 50
  }
}
```

A lens can also reference an existing Webset instead of creating a new one:

```json
{
  "id": "existing-hiring-data",
  "source": {"websetId": "ws_abc123"}
}
```

**Ask the user** before deciding whether to create new Websets or bind to existing ones. Existing Websets preserve accumulated data; new Websets start fresh with exact search parameters.

### Shapes

Each lens has a shape — item-level conditions that determine which items constitute evidence.

```json
{
  "lensId": "hiring-surge",
  "conditions": [
    {"enrichment": "Number of similar open roles at this company", "operator": "gte", "value": 10},
    {"enrichment": "Seniority level of the role", "operator": "oneOf", "value": ["Senior", "Lead/Staff"]}
  ],
  "logic": "all"
}
```

**Condition operators:**

| Operator | Enrichment format | Meaning |
|----------|------------------|---------|
| `gte`, `gt`, `lte`, `lt`, `eq` | number | Numeric comparison (parses string result to number) |
| `contains` | text | Result string contains the value as substring (case-insensitive) |
| `matches` | text | Result string matches regex pattern |
| `oneOf` | options, text | Result is one of the listed values |
| `exists` | any | Enrichment has a non-empty result |
| `withinDays` | date | Date is within N days of evaluation time |

`logic` controls how multiple conditions combine:
- `"all"` — every condition must be satisfied (AND)
- `"any"` — at least one condition must be satisfied (OR)

**Tolerant parsing.** Number enrichments may return `"~500"`, `"500-1000"`, or `"approximately 500"`. The evaluator extracts the first parseable number. If parsing fails, the condition evaluates to `false` (not an error).

### Join Rules

How items from different lenses are correlated.

```json
{
  "join": {
    "by": "entity",
    "entityMatch": {
      "method": "url+name",
      "nameThreshold": 0.85
    },
    "temporal": {
      "window": "within_days",
      "days": 30
    },
    "minLensOverlap": 2
  }
}
```

**Join types:**

| `by` value | Behavior |
|------------|----------|
| `"entity"` | Same entity must appear across lenses. Matched by URL (exact) or name (fuzzy, Dice coefficient). |
| `"temporal"` | Items across lenses must fall within the time window. No entity identity required. |
| `"entity+temporal"` | Both: same entity, within the time window. |
| `"cooccurrence"` | Each lens just needs to have *some* shaped items. The composite fires when all (or enough) lenses have evidence, regardless of entity overlap. |

`minLensOverlap` — for entity joins, how many lenses must contain the entity for it to count. Default: 2 (at least two lenses agree).

### Composite Signal

What the joined result means.

```json
{
  "signal": {
    "proxy": "Company is likely preparing a major product launch",
    "requires": {
      "type": "combination",
      "sufficient": [
        ["hiring-surge", "press-coverage"],
        ["hiring-surge", "patent-filings", "exec-activity"]
      ]
    }
  }
}
```

`requires` defines when the composite signal fires:

| `type` | Behavior |
|--------|----------|
| `"all"` | Every lens must have shaped items in the joined set |
| `"any"` | At least one lens must have shaped items |
| `"threshold"` | At least N lenses must have shaped items (`min` field) |
| `"combination"` | Any one of the listed combinations is sufficient (`sufficient` field) |

### Monitors

Each lens gets a monitor for periodic refresh.

```json
{
  "monitor": {
    "cron": "0 9 * * 1",
    "timezone": "America/New_York"
  }
}
```

Monitors are created on each lens's Webset shortly after the initial search is dispatched. The `cron` expression defines the refresh cadence (5-field format: `minute hour day month weekday`). All lenses share the same schedule by default.

## Snapshot and Re-evaluation

### Snapshot structure

Every evaluation produces a snapshot — a complete record of the composite signal state at a point in time.

```json
{
  "evaluatedAt": "2025-03-15T14:30:00Z",
  "lenses": {
    "hiring-surge": {
      "websetId": "ws_abc",
      "totalItems": 47,
      "shapedItems": 12,
      "shapes": [
        {"name": "Acme Corp", "url": "https://...", "enrichments": {"open_roles": 15, "seniority": "Senior"}}
      ]
    },
    "press-coverage": {
      "websetId": "ws_def",
      "totalItems": 23,
      "shapedItems": 5,
      "shapes": [
        {"name": "Acme Corp", "url": "https://...", "enrichments": {"publication": "TechCrunch"}}
      ]
    }
  },
  "joins": [
    {
      "entity": "Acme Corp",
      "url": "https://acme.com",
      "presentInLenses": ["hiring-surge", "press-coverage"],
      "lensCount": 2,
      "shapes": {
        "hiring-surge": {"open_roles": 15, "seniority": "Senior"},
        "press-coverage": {"publication": "TechCrunch"}
      }
    }
  ],
  "signal": {
    "fired": true,
    "satisfiedBy": ["hiring-surge", "press-coverage"],
    "rule": "combination",
    "matchedCombination": ["hiring-surge", "press-coverage"],
    "entities": ["Acme Corp"]
  }
}
```

### Delta computation

On re-evaluation, pass the previous snapshot as `previousSnapshot` in args. The workflow computes what changed:

```json
{
  "delta": {
    "newShapedItems": {
      "hiring-surge": 3,
      "press-coverage": 1
    },
    "newJoins": [
      {"entity": "Beta Inc", "lenses": ["hiring-surge", "press-coverage", "patent-filings"]}
    ],
    "lostJoins": [],
    "signalTransition": {
      "was": true,
      "now": true,
      "changed": false,
      "newEntities": ["Beta Inc"],
      "lostEntities": []
    },
    "timeSinceLastEval": "7d 2h"
  }
}
```

The delta tells the agent (or a downstream cron) what's *moving* — not just the current state, but the trajectory.

## Examples

### Example 1: Imminent Series B (entity correlation)

**Proxy:** "This startup is about to raise a Series B"

```json
{
  "name": "series-b-detector",
  "proxy": "Startup is likely raising or about to raise a Series B round",
  "lenses": [
    {
      "id": "hiring-surge",
      "source": {
        "query": "{{subject}} hiring VP Engineering, Head of Product",
        "entity": {"type": "company"},
        "criteria": [{"description": "Executive or VP-level role at a startup"}],
        "enrichments": [
          {"description": "Number of open leadership roles", "format": "number"},
          {"description": "Company employee count", "format": "number"}
        ],
        "count": 30
      }
    },
    {
      "id": "board-expansion",
      "source": {
        "query": "{{subject}} new board member advisor appointment",
        "entity": {"type": "company"},
        "criteria": [{"description": "Appointment of a new board member or advisor with VC background"}],
        "enrichments": [
          {"description": "Name of the new board member/advisor", "format": "text"},
          {"description": "Their VC firm or investment background", "format": "text"}
        ],
        "count": 30
      }
    },
    {
      "id": "product-traction",
      "source": {
        "query": "{{subject}} customer growth ARR revenue milestone",
        "entity": {"type": "company"},
        "criteria": [{"description": "Reports specific revenue, customer count, or growth metrics"}],
        "enrichments": [
          {"description": "Revenue or ARR figure mentioned", "format": "text"},
          {"description": "Customer count or growth percentage", "format": "text"}
        ],
        "count": 30
      }
    }
  ],
  "shapes": [
    {"lensId": "hiring-surge", "conditions": [{"enrichment": "Number of open leadership roles", "operator": "gte", "value": 2}], "logic": "all"},
    {"lensId": "board-expansion", "conditions": [{"enrichment": "Their VC firm or investment background", "operator": "exists"}], "logic": "all"},
    {"lensId": "product-traction", "conditions": [{"enrichment": "Revenue or ARR figure mentioned", "operator": "exists"}], "logic": "all"}
  ],
  "join": {
    "by": "entity+temporal",
    "entityMatch": {"method": "url+name", "nameThreshold": 0.85},
    "temporal": {"window": "within_days", "days": 90},
    "minLensOverlap": 2
  },
  "signal": {
    "proxy": "Startup is likely raising or about to raise a Series B round",
    "requires": {
      "type": "combination",
      "sufficient": [
        ["hiring-surge", "board-expansion"],
        ["hiring-surge", "product-traction"],
        ["board-expansion", "product-traction"]
      ]
    }
  },
  "monitor": {"cron": "0 9 * * 1", "timezone": "America/New_York"}
}
```

Any two of three lenses finding the same company with the right shapes → signal fires for that entity.

### Example 2: Emerging Technology Wave (co-occurrence)

**Proxy:** "A specific technology is crossing the enterprise adoption threshold"

```json
{
  "name": "enterprise-adoption-wave",
  "proxy": "Technology X is crossing from early-adopter to mainstream enterprise adoption",
  "lenses": [
    {
      "id": "enterprise-deployments",
      "source": {
        "query": "{{technology}} enterprise deployment production case study",
        "entity": {"type": "company"},
        "criteria": [{"description": "Company has deployed {{technology}} in production, not just piloting"}],
        "enrichments": [
          {"description": "Industry vertical of the company", "format": "text"},
          {"description": "Scale of deployment (users, transactions, etc.)", "format": "text"}
        ],
        "count": 50
      }
    },
    {
      "id": "talent-migration",
      "source": {
        "query": "{{technology}} hiring senior engineer team lead",
        "entity": {"type": "company"},
        "criteria": [{"description": "Hiring specifically for {{technology}} expertise, not general roles"}],
        "enrichments": [
          {"description": "Number of {{technology}}-specific open roles", "format": "number"}
        ],
        "count": 50
      }
    },
    {
      "id": "vendor-ecosystem",
      "source": {
        "query": "{{technology}} startup platform tooling raised funding",
        "entity": {"type": "company"},
        "criteria": [{"description": "Company builds tools, platforms, or services specifically for {{technology}}"}],
        "enrichments": [
          {"description": "Total funding raised", "format": "text"},
          {"description": "What they build for {{technology}}", "format": "text"}
        ],
        "count": 30
      }
    }
  ],
  "shapes": [
    {"lensId": "enterprise-deployments", "conditions": [{"enrichment": "Scale of deployment (users, transactions, etc.)", "operator": "exists"}], "logic": "all"},
    {"lensId": "talent-migration", "conditions": [{"enrichment": "Number of {{technology}}-specific open roles", "operator": "gte", "value": 3}], "logic": "all"},
    {"lensId": "vendor-ecosystem", "conditions": [{"enrichment": "Total funding raised", "operator": "exists"}], "logic": "all"}
  ],
  "join": {
    "by": "cooccurrence",
    "temporal": {"window": "within_days", "days": 60}
  },
  "signal": {
    "proxy": "Technology X is crossing from early-adopter to mainstream enterprise adoption",
    "requires": {"type": "all"}
  },
  "monitor": {"cron": "0 6 1 * *", "timezone": "UTC"}
}
```

Here no entity identity is needed across lenses. The signal fires when all three lenses independently find shaped items within the time window — the technology is being deployed, people are being hired to work on it, and companies are raising money to build tools for it.

### Example 3: Regulatory Shift (hybrid)

**Proxy:** "A regulatory change is about to materially impact a specific industry"

Two lenses do entity correlation (finding companies affected by both regulatory and market signals), one lens provides co-occurrence context (the regulatory activity itself).

```json
{
  "name": "regulatory-impact-detector",
  "proxy": "Upcoming regulation will materially impact companies in {{industry}}",
  "lenses": [
    {
      "id": "regulatory-activity",
      "source": {
        "query": "{{industry}} new regulation proposed rule compliance requirement 2025",
        "entity": {"type": "company"},
        "criteria": [{"description": "References a specific proposed or enacted regulation"}],
        "enrichments": [
          {"description": "Name of the regulation or regulatory body", "format": "text"},
          {"description": "Expected effective date", "format": "date"}
        ],
        "count": 30
      }
    },
    {
      "id": "compliance-hiring",
      "source": {
        "query": "{{industry}} hiring compliance officer regulatory affairs",
        "entity": {"type": "company"},
        "criteria": [{"description": "Hiring specifically for regulatory compliance roles"}],
        "enrichments": [
          {"description": "Number of compliance roles open", "format": "number"},
          {"description": "Specific regulation mentioned in job posting", "format": "text"}
        ],
        "count": 30
      }
    },
    {
      "id": "market-repositioning",
      "source": {
        "query": "{{industry}} company pivot strategy change regulatory pressure",
        "entity": {"type": "company"},
        "criteria": [{"description": "Company is changing strategy or product due to regulatory pressure"}],
        "enrichments": [
          {"description": "What strategic change is being made", "format": "text"},
          {"description": "Which regulation is driving the change", "format": "text"}
        ],
        "count": 30
      }
    }
  ],
  "shapes": [
    {"lensId": "regulatory-activity", "conditions": [{"enrichment": "Expected effective date", "operator": "withinDays", "value": 180}], "logic": "all"},
    {"lensId": "compliance-hiring", "conditions": [{"enrichment": "Number of compliance roles open", "operator": "gte", "value": 2}], "logic": "all"},
    {"lensId": "market-repositioning", "conditions": [{"enrichment": "Which regulation is driving the change", "operator": "exists"}], "logic": "all"}
  ],
  "join": {
    "by": "entity+temporal",
    "entityMatch": {"method": "url+name", "nameThreshold": 0.85},
    "temporal": {"window": "within_days", "days": 90},
    "minLensOverlap": 2
  },
  "signal": {
    "proxy": "Upcoming regulation will materially impact companies in {{industry}}",
    "requires": {"type": "threshold", "min": 2}
  },
  "monitor": {"cron": "0 8 * * 1", "timezone": "America/New_York"}
}
```

## Agent Guidance

You have four roles across the semantic cron lifecycle:

1. **Elicitor** (setup): Draw out the expert's tacit knowledge. Ask the right questions in the right order.
2. **Translator** (configuration): Convert natural language descriptions into precise config JSON. Ask for thresholds — don't guess.
3. **Interpreter** (evaluation): Present snapshot/delta results in domain-relevant language. Not "Entity appeared in 3 lenses" but "Acme Corp now shows hiring surge (15 open ML roles), press coverage (TechCrunch), AND patent activity (3 filings) — the composite signal for imminent product launch is firing."
4. **Calibration partner** (refinement): Track patterns across evaluations and suggest improvements. "In the last 3 evaluations, 60% of false positives came from Lens B matching adjacent industries. Would you like to add an industry filter?"

**Critical distinction:** In roles 1 and 2, do NOT add domain knowledge. In roles 3 and 4, you CAN observe patterns in the data and present those observations. Domain *configuration* comes from the expert; data *observation* can come from you.

### Eliciting the configuration

1. **Identify the proxy.** What is the thing they actually want to know? Have them state it as a sentence. Don't paraphrase it into something more generic — their specificity is the point.

2. **Ask what they watch for.** "What would you expect to see happening if this were true?" Let them describe the signals in their own terms. Each observable pattern becomes a lens. Aim for 2-5 lenses — enough for triangulation, not so many that the search budget explodes.

3. **Extract the shapes.** For each signal they describe, ask: "How would you know you're looking at a real instance of this, versus noise?" The answer defines the shape conditions. The more specific they are, the better the signal. Domain experts tend to know exactly what distinguishes a meaningful data point from a false positive — draw that out.

4. **Clarify the composition.** Ask: "If you saw signal A and signal B but not signal C, would that still be meaningful?" Walk through combinations. The answer defines the composite signal rules. Experts often have nuanced views here — certain pairs are sufficient, others aren't.

5. **Choose the join type.** Is this about a specific entity being detected across lenses (entity correlation)? Or about a market/trend where different actors are doing different things simultaneously (co-occurrence)? Or a hybrid? The user often knows this implicitly — ask whether they're tracking specific entities or tracking a wave.

6. **Ask the user** about:
   - Whether to create new Websets or bind to existing ones
   - The refresh cadence (how often should monitors check?)
   - The temporal window for joins (how close in time must items be?)
   - Whether they want the initial evaluation now or just the setup

7. **Set up monitors.** After the initial search is dispatched on each lens, create a monitor with the agreed cron schedule.

8. **On re-evaluation**, always pass the previous snapshot. Report the *delta* prominently — what changed matters more than the absolute state.

### What not to do

- Don't invent domain knowledge. If the user says "watch for lithography hiring at TSMC," don't expand that to "also watch for general semiconductor news." The specificity is the value.
- Don't simplify shapes. If the user says an enrichment value needs to be above 10, don't round to "exists." The threshold encodes their expertise.
- Don't add lenses the user didn't describe. Each lens costs a Webset and search budget. The user chose their signals deliberately.

### Template variables

Configurations can use `{{variable}}` placeholders:
- `{{subject}}` — the entity or topic being investigated (e.g., a company name)
- `{{technology}}` — a technology being tracked
- `{{industry}}` — an industry vertical

These are expanded at evaluation time, allowing one semantic cron configuration to be reused across subjects.

## Workflow Operations

The semantic cron workflow registers as `semantic.cron` and supports two modes:

### `tasks.create` with `type: "semantic.cron"`

**Setup + initial evaluation.** Creates lenses (or binds existing Websets), waits for searches, evaluates shapes, performs joins, computes composite signal, sets up monitors, returns snapshot.

**Args:**
- `config` — the full semantic cron configuration (lenses, shapes, join, signal, monitor)
- `variables` — template variable values (e.g., `{"subject": "Tesla", "technology": "robotics"}`)
- `timeout` — max time to wait for searches (default: 300000ms / 5 min)

**Returns:** Full snapshot including per-lens state, shaped items, joins, composite signal, and the webset/monitor IDs for future reference.

### Re-evaluation

Call `tasks.create` again with:
- `type: "semantic.cron"`
- Same `config`
- `previousSnapshot` — the snapshot from the last evaluation
- `existingWebsets` — map of lens ID to webset ID (from previous result, so we don't recreate)

The workflow skips creation, collects fresh items, evaluates, and returns both new snapshot and delta.

## Design Principles

**Narrow lenses, rich composition.** Each lens should be focused enough that its items are interpretable on their own. The complexity lives in the composition, not in any single search.

**Shapes are the contract.** The shape definition is what turns raw search results into structured signals. Poorly defined shapes produce noise. Invest time here.

**The signal is in the join.** Individual lenses finding items is unsurprising — that's what search does. The proxy relationship only exists in the correlation across lenses. If a single lens is sufficient, you don't need a semantic cron — you need a monitor.

**Deltas over absolutes.** After the first evaluation, what matters is *change*. New entities entering the join, entities dropping out, signal transitions. The snapshot/delta pattern makes temporal dynamics visible.

**Monitors are infrastructure, evaluation is the product.** Monitors keep the underlying data fresh. The semantic cron evaluation is the analytical layer that gives the data meaning. These are separate concerns running on different cadences — monitors refresh data (cron), evaluation synthesizes meaning (on-demand or scheduled).

**Conjunction over compensation.** When combining signals, prefer "all of these must be present" over "enough of these add up." Additive aggregation lets a strong signal in one lens mask a critical absence in another. Humanitarian early warning systems (IPC, FEWS NET) learned this the hard way — arithmetic means hide the dimension that kills you. Our `requires` types (`all`, `combination`) are conjunction-based by design.

**Specificity is the moat.** A semantic cron's defensibility is inversely proportional to how generic its configuration is. "Watch for companies hiring" is not defensible — anyone can configure that. "Watch for companies hiring 15+ senior lithography process engineers from ASML or Tokyo Electron within 90 days of an EUV-related patent filing" is defensible — only a semiconductor expert would configure that. The value is in the expert's specificity.

## The Learning Loop

A semantic cron is not a static detector. Over evaluation cycles, it becomes a learning instrument.

**Calibration.** The expert reviews output and notices false positives. "That entity matched the shapes but it's irrelevant — it's in an adjacent industry." They tighten the shape conditions. Over 3-5 cycles, the shapes converge toward the expert's *actual* decision criteria — criteria they couldn't fully articulate upfront but can recognize when they see the output.

**Discovery.** The delta surfaces entities the expert didn't expect. "I was watching for Series B signals and Company X appeared across 3 lenses — but I've never heard of Company X." The tool found something the expert would have found eventually, but the tool found it first because it monitors exhaustively.

**Sensitivity intuition.** Over time, the expert learns: "When this cron fires on 3+ lenses, it's always real. When it fires on exactly 2, it's 50/50." This is the expert building a mental model of the tool's signal-to-noise ratio.

**Composition evolution.** After months, the expert realizes "Lens C never contributes useful signals independently — but when it fires in combination with Lens A, the hit rate is 90%." They restructure the composite rules. The config evolves from initial specification toward empirically validated composition.

The learning loop is what transforms a semantic cron from "automated alert" into "knowledge externalization technology." The config becomes inspectable, testable, shareable, and improvable — a form of explicit, operational domain knowledge that survives the expert's departure and can be refined by successors.

## Failure Modes

**Configuration overfitting.** Lenses tuned to how the *last* instance manifested may miss the *next* one. Mitigation: configure for necessary preconditions, not sufficient surface patterns. "Hiring for leadership roles" (precondition for scaling) is more robust than "posted VP Engineering role" (specific manifestation).

**False confidence.** A composite signal that fires produces a binary-looking output, which can bypass the expert's own uncertainty. Mitigation: snapshots should surface uncertainty indicators — borderline shape matches, low item counts, enrichment parsing failures. A signal depending on 1-2 items is fragile; one depending on 15 items is robust.

**Streetlight effect.** You can only detect what you configured lenses for. A Series B detector might miss an acquisition. Mitigation: the agent should periodically ask "What events *outside* this semantic cron's scope could produce similar signals?"

**Temporal aliasing.** Signals that appear and disappear between evaluation windows are missed. Mitigation: Websets are self-updating, so items that entered the dataset persist even if the source changes. But signals that never enter any Webset are invisible. Match cadence to signal velocity.

**Alarm fatigue.** Repeated false positives reduce the expert's response readiness. Mitigation: the calibration loop is essential, not optional. If the expert doesn't tighten shapes after false positives, they'll learn to ignore the tool.

## Three-Tier Monitoring

Every mature early warning system — WHO EWARN, FEWS NET, OFR Financial Stress Index, OSCE election observation — uses 3-4 temporal tiers spanning 2-3 orders of magnitude. This maps to three decision types:

| Tier | Cadence | Decision | Semantic cron layer |
|------|---------|----------|-------------------|
| 1. Detect | Continuous | "Something happened, flag it" | Webset search + criteria |
| 2. Assess | Periodic | "Is this real? What does it mean?" | Monitor-triggered shape evaluation |
| 3. Decide | On-demand | "What do we do about this?" | Expert reviews delta, applies judgment |

Each tier filters noise for the next. Tier 1 catches everything (high sensitivity). Tier 2 filters to plausible signals. Tier 3 filters to actionable intelligence. The **shapes layer** is the critical middle tier — poor shapes mean too much noise reaches the expert.

## Beyond Detection

While event detection is the natural entry point, semantic crons support additional modes as users develop fluency:

**Diagnostic mode.** Instrument a theory of change as lenses. "Why isn't regulation X passing?" becomes a config with lenses for public opinion, industry acquiescence, political will, and trigger events. The output shows which preconditions are met and which aren't — telling the user where to focus effort.

**Exploration mode.** Configure diverse lenses without a specific proxy, to see what emerges at their intersection. This is a serendipity engine — surfacing unexpected connections between domains that the expert wouldn't find by monitoring any stream individually.
