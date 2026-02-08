-- Exa-backed workflow archetypes for the Websets MCP server
-- These complement the generic seed workflows with Exa-specific implementations

INSERT OR IGNORE INTO workflows (id, name, description, coord_scope, coord_domain_structure, coord_evidence_type, coord_time_horizon, coord_fidelity, archetype, status, notes) VALUES
  ('workflow-webset-lifecycle', 'Lifecycle Harvest', 'Create webset, search, enrich, collect all items in one task', 2, 2, 3, 2, 3, 'applied', 'seed', 'Simplest end-to-end: search + enrich + collect'),
  ('workflow-webset-convergent', 'Convergent Search', 'N queries from different angles, deduplicate, find intersection for high-confidence discovery', 3, 3, 4, 3, 4, 'confirmatory', 'seed', 'Multi-angle triangulation for high-confidence entity discovery'),
  ('workflow-webset-adversarial', 'Adversarial Verify', 'Thesis vs antithesis websets with optional synthesis for bias testing', 3, 3, 5, 3, 5, 'analytical', 'seed', 'Dialectical evidence gathering with optional Research API synthesis'),
  ('workflow-webset-verified', 'Verified Collection', 'Entity collection + per-entity deep research via Exa Research API', 3, 4, 4, 4, 4, 'exploratory', 'seed', 'Webset collection + per-entity deep research'),
  ('workflow-webset-qd-winnow', 'QD Winnow', 'Quality-diversity search: criteria as behavioral coordinates, enrichments as fitness', 4, 4, 4, 3, 5, 'analytical', 'seed', 'MAP-Elites inspired quality-diversity analysis');

-- Lifecycle Harvest steps
INSERT OR IGNORE INTO workflow_steps (workflow_id, step_order, name, description, rationale, tools_required, outputs) VALUES
  ('workflow-webset-lifecycle', 1, 'validate', 'Validate query and entity parameters', 'Catch format errors early with helpful hints', 'manage_websets', 'validated args'),
  ('workflow-webset-lifecycle', 2, 'create', 'Create webset with search + enrichments', 'Single API call creates webset with all configuration', 'manage_websets', 'websetId'),
  ('workflow-webset-lifecycle', 3, 'poll', 'Poll until webset is idle', 'Wait for search + enrichment processing to complete', 'manage_websets', 'final webset state'),
  ('workflow-webset-lifecycle', 4, 'collect', 'Collect all items via auto-pagination', 'Gather enriched items for return', 'manage_websets', 'items array');

-- Convergent Search steps
INSERT OR IGNORE INTO workflow_steps (workflow_id, step_order, name, description, rationale, tools_required, outputs) VALUES
  ('workflow-webset-convergent', 1, 'validate', 'Validate queries array (2-5) and entity', 'Ensure multiple angles provided for triangulation', 'manage_websets', 'validated queries'),
  ('workflow-webset-convergent', 2, 'create', 'Create N websets, one per query', 'Each query searches from a different angle', 'manage_websets', 'websetIds array'),
  ('workflow-webset-convergent', 3, 'poll', 'Poll all websets until idle', 'Wait for all searches to complete', 'manage_websets', 'final webset states'),
  ('workflow-webset-convergent', 4, 'collect', 'Collect items from all websets', 'Gather raw results before deduplication', 'manage_websets', 'items by query'),
  ('workflow-webset-convergent', 5, 'deduplicate', 'Deduplicate by URL + fuzzy name match', 'Dice coefficient similarity finds same entities across queries', 'analyze', 'intersection + unique sets'),
  ('workflow-webset-convergent', 6, 'analyze', 'Compute overlap matrix and intersection', 'Quantify agreement between search angles', 'analyze', 'overlap matrix, confidence scores');

-- Adversarial Verify steps
INSERT OR IGNORE INTO workflow_steps (workflow_id, step_order, name, description, rationale, tools_required, outputs) VALUES
  ('workflow-webset-adversarial', 1, 'validate', 'Validate thesis, thesisQuery, antithesisQuery', 'Both sides of the argument must be specified', 'manage_websets', 'validated args'),
  ('workflow-webset-adversarial', 2, 'create-thesis', 'Create thesis webset', 'Search for supporting evidence', 'manage_websets', 'thesis websetId'),
  ('workflow-webset-adversarial', 3, 'create-antithesis', 'Create antithesis webset', 'Search for counter-evidence', 'manage_websets', 'antithesis websetId'),
  ('workflow-webset-adversarial', 4, 'poll', 'Poll both websets until idle', 'Wait for both evidence-gathering searches', 'manage_websets', 'final states'),
  ('workflow-webset-adversarial', 5, 'collect', 'Collect items from both websets', 'Gather evidence from both sides', 'manage_websets', 'thesis + antithesis items'),
  ('workflow-webset-adversarial', 6, 'synthesize', 'Optional: synthesize via Exa Research API', 'Balanced assessment from both evidence sets', 'manage_websets', 'synthesis verdict');

-- Verified Collection steps
INSERT OR IGNORE INTO workflow_steps (workflow_id, step_order, name, description, rationale, tools_required, outputs) VALUES
  ('workflow-webset-verified', 1, 'validate', 'Validate query, entity, researchPrompt', 'Research prompt template must include {{name}} placeholder', 'manage_websets', 'validated args'),
  ('workflow-webset-verified', 2, 'create', 'Create webset with search', 'Discover entities to research', 'manage_websets', 'websetId'),
  ('workflow-webset-verified', 3, 'poll', 'Poll until idle', 'Wait for entity discovery', 'manage_websets', 'idle webset'),
  ('workflow-webset-verified', 4, 'collect', 'Collect items', 'Select top N for research', 'manage_websets', 'selected items'),
  ('workflow-webset-verified', 5, 'research', 'Per-entity deep research with concurrency limit', 'Semaphore-limited parallel research via Exa Research API', 'manage_websets', 'per-entity research results');

-- QD Winnow steps
INSERT OR IGNORE INTO workflow_steps (workflow_id, step_order, name, description, rationale, tools_required, outputs) VALUES
  ('workflow-webset-qd-winnow', 1, 'validate', 'Validate criteria, enrichments, query or seedWebsetId', 'Both behavioral coordinates (criteria) and fitness (enrichments) required', 'manage_websets', 'validated args'),
  ('workflow-webset-qd-winnow', 2, 'create', 'Create webset with criteria + enrichments', 'Criteria define niche space, enrichments define fitness', 'manage_websets', 'websetId'),
  ('workflow-webset-qd-winnow', 3, 'poll', 'Poll until idle', 'Wait for search + enrichment processing', 'manage_websets', 'idle webset'),
  ('workflow-webset-qd-winnow', 4, 'collect', 'Collect items with evaluations + enrichment data', 'Need full item data for classification and scoring', 'manage_websets', 'items with evaluations'),
  ('workflow-webset-qd-winnow', 5, 'classify', 'Classify items into niches by criteria vector', 'Each item mapped to binary niche by criteria satisfaction', 'analyze', 'classified items with niche keys'),
  ('workflow-webset-qd-winnow', 6, 'score', 'Score fitness from enrichment completeness', 'Enrichment data quality indicates entity information richness', 'analyze', 'fitness scores'),
  ('workflow-webset-qd-winnow', 7, 'select', 'Select elites by strategy (diverse/all/any)', 'Best item per niche (diverse) or filtered by criteria match', 'analyze', 'elite items'),
  ('workflow-webset-qd-winnow', 8, 'critique', 'Optional: Research API critique of results', 'External validation of coverage gaps and blind spots', 'manage_websets', 'critique assessment');
