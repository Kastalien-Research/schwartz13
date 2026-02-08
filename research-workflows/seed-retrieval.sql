-- Retrieval workflow orchestrations using Exa Search API (exa.* operations)
-- 20 patterns across 5 categories for the /research skill's MAP-Elites library

-- ============================================================
-- Category 1: Business Intelligence (5)
-- ============================================================

INSERT OR IGNORE INTO workflows (id, name, description, coord_scope, coord_domain_structure, coord_evidence_type, coord_time_horizon, coord_fidelity, archetype, status, notes) VALUES
  ('retrieval-company-profile', 'Company Profile', 'Build comprehensive company profile from web sources', 2, 2, 4, 2, 4, 'applied', 'seed', 'search(category:company) → getContents → findSimilar → answer(synthesis)'),
  ('retrieval-market-overview', 'Market Overview', 'Map market landscape with key players and sizing', 3, 2, 3, 3, 3, 'exploratory', 'seed', 'search(category:company) → getContents → answer(sizing)'),
  ('retrieval-trend-report', 'Industry Trend Report', 'Identify emerging trends via date-filtered search', 3, 2, 3, 4, 3, 'exploratory', 'seed', 'search(date-filtered) → getContents → answer(trend synthesis)'),
  ('retrieval-exec-background', 'Executive Background', 'Research individual executive or founder background', 2, 1, 4, 2, 4, 'applied', 'seed', 'search(category:people) → getContents → answer(summary)'),
  ('retrieval-investment-scan', 'Investment Scan', 'Scan financial reports and news for investment signals', 3, 2, 4, 3, 4, 'analytical', 'seed', 'search(financial report) → getContents → findSimilar → answer');

-- Company Profile steps
INSERT OR IGNORE INTO workflow_steps (workflow_id, step_order, name, description, rationale, tools_required, outputs) VALUES
  ('retrieval-company-profile', 1, 'search-company', 'Search for company with category:company filter', 'Category filter returns structured company data', 'exa.search', 'search results with company metadata'),
  ('retrieval-company-profile', 2, 'read-sources', 'Extract full content from top results', 'Need detailed text for comprehensive profile', 'exa.getContents', 'full page content with highlights'),
  ('retrieval-company-profile', 3, 'expand-coverage', 'Find similar pages to fill gaps', 'Discover press releases, blog posts, and coverage not in initial search', 'exa.findSimilar', 'additional related pages'),
  ('retrieval-company-profile', 4, 'synthesize', 'Generate structured company profile via answer', 'LLM synthesis creates coherent narrative from scattered sources', 'exa.answer', 'structured company profile');

-- Market Overview steps
INSERT OR IGNORE INTO workflow_steps (workflow_id, step_order, name, description, rationale, tools_required, outputs) VALUES
  ('retrieval-market-overview', 1, 'search-market', 'Search for companies in target market with category filter', 'Category:company returns structured player data', 'exa.search', 'market player list'),
  ('retrieval-market-overview', 2, 'read-details', 'Extract content from company pages and reports', 'Need revenue, headcount, product details for sizing', 'exa.getContents', 'company details'),
  ('retrieval-market-overview', 3, 'search-reports', 'Search for market research reports and analysis', 'Industry reports provide sizing and growth data', 'exa.search', 'market reports'),
  ('retrieval-market-overview', 4, 'synthesize-overview', 'Generate market overview with sizing via answer', 'Combine player data with report data for overview', 'exa.answer', 'market overview with sizing');

-- Industry Trend Report steps
INSERT OR IGNORE INTO workflow_steps (workflow_id, step_order, name, description, rationale, tools_required, outputs) VALUES
  ('retrieval-trend-report', 1, 'search-recent', 'Search with date filters for recent coverage', 'Date filtering isolates emerging vs established trends', 'exa.search', 'recent articles and news'),
  ('retrieval-trend-report', 2, 'search-historical', 'Search earlier period for baseline comparison', 'Trend detection requires comparing time periods', 'exa.search', 'historical baseline articles'),
  ('retrieval-trend-report', 3, 'read-key-articles', 'Extract content from most relevant results', 'Full text reveals nuance not captured in snippets', 'exa.getContents', 'article full text'),
  ('retrieval-trend-report', 4, 'synthesize-trends', 'Generate trend report comparing periods via answer', 'LLM identifies patterns across time periods', 'exa.answer', 'trend report with timeline');

-- Executive Background steps
INSERT OR IGNORE INTO workflow_steps (workflow_id, step_order, name, description, rationale, tools_required, outputs) VALUES
  ('retrieval-exec-background', 1, 'search-person', 'Search with category:people for the executive', 'People category returns LinkedIn, bios, interviews', 'exa.search', 'person search results'),
  ('retrieval-exec-background', 2, 'read-profiles', 'Extract content from profile and interview pages', 'Full content reveals career history and quotes', 'exa.getContents', 'profile content'),
  ('retrieval-exec-background', 3, 'synthesize-bio', 'Generate executive summary via answer', 'Structured synthesis of career, achievements, quotes', 'exa.answer', 'executive background summary');

-- Investment Scan steps
INSERT OR IGNORE INTO workflow_steps (workflow_id, step_order, name, description, rationale, tools_required, outputs) VALUES
  ('retrieval-investment-scan', 1, 'search-financials', 'Search for financial reports with category filter', 'Financial report category targets SEC filings, earnings', 'exa.search', 'financial report results'),
  ('retrieval-investment-scan', 2, 'read-reports', 'Extract content from financial reports', 'Full text needed for quantitative data extraction', 'exa.getContents', 'report content'),
  ('retrieval-investment-scan', 3, 'find-related', 'Find similar financial coverage', 'Discover analyst reports and commentary', 'exa.findSimilar', 'related financial coverage'),
  ('retrieval-investment-scan', 4, 'synthesize-signals', 'Generate investment signal summary via answer', 'Identify bullish/bearish signals across sources', 'exa.answer', 'investment signal summary');

-- ============================================================
-- Category 2: Competitive Analysis (4)
-- ============================================================

INSERT OR IGNORE INTO workflows (id, name, description, coord_scope, coord_domain_structure, coord_evidence_type, coord_time_horizon, coord_fidelity, archetype, status, notes) VALUES
  ('retrieval-competitor-map', 'Competitor Mapping', 'Map competitive landscape starting from one company', 3, 2, 3, 2, 3, 'exploratory', 'seed', 'search → findSimilar(competitors) → getContents → answer(comparison)'),
  ('retrieval-product-compare', 'Product Comparison', 'Side-by-side comparison of competing products', 2, 2, 4, 2, 4, 'analytical', 'seed', 'search(product A) + search(product B) → getContents → answer(matrix)'),
  ('retrieval-swot', 'SWOT Analysis', 'Structured SWOT analysis from web evidence', 3, 2, 4, 3, 4, 'analytical', 'seed', 'search(strengths) + search(weaknesses) + search(opportunities) + search(threats) → answer(synthesis)'),
  ('retrieval-digital-audit', 'Digital Presence Audit', 'Audit a company''s web presence and content', 2, 1, 4, 2, 4, 'applied', 'seed', 'search(domain-filtered) → getContents(subpages) → findSimilar → answer');

-- Competitor Mapping steps
INSERT OR IGNORE INTO workflow_steps (workflow_id, step_order, name, description, rationale, tools_required, outputs) VALUES
  ('retrieval-competitor-map', 1, 'search-company', 'Search for the target company', 'Need the company''s own pages as seeds for similarity', 'exa.search', 'company pages'),
  ('retrieval-competitor-map', 2, 'find-competitors', 'Use findSimilar on company homepage to discover competitors', 'Similar pages often belong to direct competitors', 'exa.findSimilar', 'competitor pages'),
  ('retrieval-competitor-map', 3, 'read-competitor-pages', 'Extract content from competitor sites', 'Need product/pricing details for comparison', 'exa.getContents', 'competitor details'),
  ('retrieval-competitor-map', 4, 'synthesize-map', 'Generate competitive landscape map via answer', 'Structured comparison across key dimensions', 'exa.answer', 'competitive landscape map');

-- Product Comparison steps
INSERT OR IGNORE INTO workflow_steps (workflow_id, step_order, name, description, rationale, tools_required, outputs) VALUES
  ('retrieval-product-compare', 1, 'search-product-a', 'Search for product A reviews and documentation', 'Gather evidence for first product', 'exa.search', 'product A sources'),
  ('retrieval-product-compare', 2, 'search-product-b', 'Search for product B reviews and documentation', 'Gather evidence for second product', 'exa.search', 'product B sources'),
  ('retrieval-product-compare', 3, 'read-sources', 'Extract content from top sources for both products', 'Need detailed feature and pricing information', 'exa.getContents', 'detailed product information'),
  ('retrieval-product-compare', 4, 'compare', 'Generate comparison matrix via answer', 'Structured side-by-side on features, pricing, pros/cons', 'exa.answer', 'comparison matrix');

-- SWOT Analysis steps
INSERT OR IGNORE INTO workflow_steps (workflow_id, step_order, name, description, rationale, tools_required, outputs) VALUES
  ('retrieval-swot', 1, 'search-strengths', 'Search for company strengths and advantages', 'Positive coverage reveals competitive advantages', 'exa.search', 'strength evidence'),
  ('retrieval-swot', 2, 'search-weaknesses', 'Search for company challenges and criticisms', 'Critical coverage reveals vulnerabilities', 'exa.search', 'weakness evidence'),
  ('retrieval-swot', 3, 'search-opportunities', 'Search for market opportunities and growth areas', 'Industry trends reveal expansion opportunities', 'exa.search', 'opportunity evidence'),
  ('retrieval-swot', 4, 'search-threats', 'Search for competitive threats and market risks', 'Competitor moves and market shifts reveal threats', 'exa.search', 'threat evidence'),
  ('retrieval-swot', 5, 'synthesize-swot', 'Generate SWOT matrix via answer with all evidence', 'Structured synthesis across all four quadrants', 'exa.answer', 'SWOT analysis matrix');

-- Digital Presence Audit steps
INSERT OR IGNORE INTO workflow_steps (workflow_id, step_order, name, description, rationale, tools_required, outputs) VALUES
  ('retrieval-digital-audit', 1, 'search-domain', 'Search filtered to company domain', 'includeDomains filter scopes to owned content', 'exa.search', 'domain pages'),
  ('retrieval-digital-audit', 2, 'read-subpages', 'Extract content with subpage crawling', 'Subpages option reveals site structure and content depth', 'exa.getContents', 'site content map'),
  ('retrieval-digital-audit', 3, 'find-mentions', 'Find similar pages on external domains', 'Discover third-party mentions and backlinks', 'exa.findSimilar', 'external mentions'),
  ('retrieval-digital-audit', 4, 'synthesize-audit', 'Generate digital presence report via answer', 'Content quality, coverage gaps, SEO signals', 'exa.answer', 'digital presence audit report');

-- ============================================================
-- Category 3: Knowledge & Academic (4)
-- ============================================================

INSERT OR IGNORE INTO workflows (id, name, description, coord_scope, coord_domain_structure, coord_evidence_type, coord_time_horizon, coord_fidelity, archetype, status, notes) VALUES
  ('retrieval-fact-check', 'Fact-Check Pipeline', 'Verify a claim by searching for supporting and opposing evidence', 2, 2, 5, 2, 5, 'confirmatory', 'seed', 'search(claim) → getContents → search(counter) → answer(verdict)'),
  ('retrieval-lit-review', 'Literature Review', 'Survey academic literature on a topic', 4, 3, 4, 3, 4, 'exploratory', 'seed', 'search(research paper) → getContents → findSimilar(expand) → answer(synthesis)'),
  ('retrieval-deep-qa', 'Deep Q&A', 'Answer a question then validate with independent search', 2, 1, 4, 2, 5, 'confirmatory', 'seed', 'answer(question) → search(validate citations) → getContents(verify)'),
  ('retrieval-timeline', 'Historical Timeline', 'Construct timeline from date-windowed searches', 3, 2, 4, 4, 3, 'analytical', 'seed', 'search(date-windowed, multiple periods) → getContents → answer(timeline)');

-- Fact-Check Pipeline steps
INSERT OR IGNORE INTO workflow_steps (workflow_id, step_order, name, description, rationale, tools_required, outputs) VALUES
  ('retrieval-fact-check', 1, 'search-supporting', 'Search for evidence supporting the claim', 'Gather the strongest case for the claim', 'exa.search', 'supporting sources'),
  ('retrieval-fact-check', 2, 'read-supporting', 'Extract content from supporting sources', 'Need full context to assess evidence quality', 'exa.getContents', 'supporting evidence text'),
  ('retrieval-fact-check', 3, 'search-opposing', 'Search for evidence against the claim', 'Steel-man the opposition for balanced assessment', 'exa.search', 'opposing sources'),
  ('retrieval-fact-check', 4, 'verdict', 'Generate fact-check verdict via answer', 'Weigh both sides with source quality assessment', 'exa.answer', 'fact-check verdict with confidence');

-- Literature Review steps
INSERT OR IGNORE INTO workflow_steps (workflow_id, step_order, name, description, rationale, tools_required, outputs) VALUES
  ('retrieval-lit-review', 1, 'search-papers', 'Search for research papers on the topic', 'category:research paper targets academic sources', 'exa.search', 'paper list'),
  ('retrieval-lit-review', 2, 'read-abstracts', 'Extract content with summary option', 'Summaries give efficient overview of each paper', 'exa.getContents', 'paper summaries'),
  ('retrieval-lit-review', 3, 'expand-refs', 'Find similar papers to expand coverage', 'Citation-like expansion discovers related work', 'exa.findSimilar', 'additional papers'),
  ('retrieval-lit-review', 4, 'synthesize-review', 'Generate literature review via answer', 'Identify themes, gaps, and consensus across papers', 'exa.answer', 'literature review synthesis');

-- Deep Q&A steps
INSERT OR IGNORE INTO workflow_steps (workflow_id, step_order, name, description, rationale, tools_required, outputs) VALUES
  ('retrieval-deep-qa', 1, 'initial-answer', 'Get answer with citations via exa.answer', 'Fast initial answer with source attribution', 'exa.answer', 'answer with citations'),
  ('retrieval-deep-qa', 2, 'validate-search', 'Independent search to find corroborating sources', 'Sources found independently are stronger validation', 'exa.search', 'validation sources'),
  ('retrieval-deep-qa', 3, 'verify-content', 'Read validation sources to check consistency', 'Cross-reference answer claims against independent sources', 'exa.getContents', 'verification evidence');

-- Historical Timeline steps
INSERT OR IGNORE INTO workflow_steps (workflow_id, step_order, name, description, rationale, tools_required, outputs) VALUES
  ('retrieval-timeline', 1, 'search-periods', 'Search across multiple date windows', 'Date filters isolate events by time period', 'exa.search', 'results by time period'),
  ('retrieval-timeline', 2, 'read-events', 'Extract content from key event pages', 'Full text reveals dates, causes, and consequences', 'exa.getContents', 'event details'),
  ('retrieval-timeline', 3, 'synthesize-timeline', 'Generate chronological timeline via answer', 'Order events and identify causal relationships', 'exa.answer', 'structured timeline');

-- ============================================================
-- Category 4: Technical & Developer (4)
-- ============================================================

INSERT OR IGNORE INTO workflows (id, name, description, coord_scope, coord_domain_structure, coord_evidence_type, coord_time_horizon, coord_fidelity, archetype, status, notes) VALUES
  ('retrieval-framework-eval', 'Framework Evaluation', 'Compare technical frameworks or libraries', 2, 2, 4, 2, 4, 'analytical', 'seed', 'search(framework A) + search(framework B) → findSimilar → answer(comparison)'),
  ('retrieval-api-discovery', 'API Documentation Discovery', 'Find and summarize API documentation', 2, 1, 4, 2, 4, 'applied', 'seed', 'search(API docs) → getContents(subpages) → answer(summary)'),
  ('retrieval-vuln-research', 'Vulnerability Research', 'Research security vulnerabilities and mitigations', 2, 2, 5, 2, 5, 'confirmatory', 'seed', 'search(CVE/vuln) → getContents → findSimilar(related) → answer(assessment)'),
  ('retrieval-oss-scan', 'Open Source Activity Scan', 'Scan open source ecosystem activity and discussions', 3, 2, 3, 3, 3, 'exploratory', 'seed', 'search(category:tweet+news) → getContents → answer(landscape)');

-- Framework Evaluation steps
INSERT OR IGNORE INTO workflow_steps (workflow_id, step_order, name, description, rationale, tools_required, outputs) VALUES
  ('retrieval-framework-eval', 1, 'search-framework-a', 'Search for framework A benchmarks and reviews', 'Gather performance data and developer experience reports', 'exa.search', 'framework A evidence'),
  ('retrieval-framework-eval', 2, 'search-framework-b', 'Search for framework B benchmarks and reviews', 'Parallel evidence gathering for fair comparison', 'exa.search', 'framework B evidence'),
  ('retrieval-framework-eval', 3, 'find-comparisons', 'Find existing comparison articles via findSimilar', 'Existing comparisons provide structured analysis', 'exa.findSimilar', 'comparison articles'),
  ('retrieval-framework-eval', 4, 'synthesize-eval', 'Generate evaluation matrix via answer', 'Structured comparison on performance, DX, ecosystem, maturity', 'exa.answer', 'framework evaluation matrix');

-- API Documentation Discovery steps
INSERT OR IGNORE INTO workflow_steps (workflow_id, step_order, name, description, rationale, tools_required, outputs) VALUES
  ('retrieval-api-discovery', 1, 'search-docs', 'Search for API documentation pages', 'Find official docs, guides, and references', 'exa.search', 'documentation pages'),
  ('retrieval-api-discovery', 2, 'read-with-subpages', 'Extract content with subpage crawling enabled', 'Subpages capture full API reference structure', 'exa.getContents', 'API documentation content'),
  ('retrieval-api-discovery', 3, 'summarize', 'Generate API summary via answer', 'Distill endpoints, auth, rate limits, key patterns', 'exa.answer', 'API documentation summary');

-- Vulnerability Research steps
INSERT OR IGNORE INTO workflow_steps (workflow_id, step_order, name, description, rationale, tools_required, outputs) VALUES
  ('retrieval-vuln-research', 1, 'search-vuln', 'Search for the vulnerability or CVE', 'Find advisories, patches, and analysis', 'exa.search', 'vulnerability sources'),
  ('retrieval-vuln-research', 2, 'read-advisories', 'Extract content from security advisories', 'Full text reveals severity, affected versions, mitigations', 'exa.getContents', 'advisory details'),
  ('retrieval-vuln-research', 3, 'find-related', 'Find similar vulnerabilities via findSimilar', 'Related vulns reveal attack patterns and broader risk', 'exa.findSimilar', 'related vulnerabilities'),
  ('retrieval-vuln-research', 4, 'assess', 'Generate risk assessment via answer', 'Severity rating, affected systems, mitigation steps', 'exa.answer', 'vulnerability assessment');

-- Open Source Activity Scan steps
INSERT OR IGNORE INTO workflow_steps (workflow_id, step_order, name, description, rationale, tools_required, outputs) VALUES
  ('retrieval-oss-scan', 1, 'search-discussions', 'Search tweets and news about the topic', 'category:tweet and category:news capture community signal', 'exa.search', 'community discussions'),
  ('retrieval-oss-scan', 2, 'read-content', 'Extract content from top discussions', 'Full text reveals sentiment, adoption signals, pain points', 'exa.getContents', 'discussion content'),
  ('retrieval-oss-scan', 3, 'synthesize-landscape', 'Generate ecosystem activity report via answer', 'Identify momentum, key voices, emerging tools', 'exa.answer', 'OSS activity landscape');

-- ============================================================
-- Category 5: Meta Patterns (3)
-- ============================================================

INSERT OR IGNORE INTO workflows (id, name, description, coord_scope, coord_domain_structure, coord_evidence_type, coord_time_horizon, coord_fidelity, archetype, status, notes) VALUES
  ('retrieval-search-expand', 'Search & Expand', 'Search then expand coverage via findSimilar', 2, 1, 3, 2, 3, 'exploratory', 'seed', 'search → findSimilar(top N) → deduplicate'),
  ('retrieval-search-deepread', 'Search & Deep Read', 'Search then extract full content with highlights', 2, 1, 4, 2, 4, 'applied', 'seed', 'search → getContents(top N, highlights+summary) → synthesize'),
  ('retrieval-multi-verify', 'Multi-Angle Verification', 'Verify a claim from multiple independent search angles', 2, 2, 5, 2, 5, 'confirmatory', 'seed', 'search(angle1) + search(angle2) + search(angle3) → answer(consensus)');

-- Search & Expand steps
INSERT OR IGNORE INTO workflow_steps (workflow_id, step_order, name, description, rationale, tools_required, outputs) VALUES
  ('retrieval-search-expand', 1, 'initial-search', 'Run initial search query', 'Seed results for expansion', 'exa.search', 'initial results'),
  ('retrieval-search-expand', 2, 'expand-similar', 'findSimilar on top N results', 'Discover related pages not captured by keyword search', 'exa.findSimilar', 'expanded results'),
  ('retrieval-search-expand', 3, 'deduplicate', 'Remove duplicate URLs from combined results', 'Clean merged result set', 'analyze', 'deduplicated results');

-- Search & Deep Read steps
INSERT OR IGNORE INTO workflow_steps (workflow_id, step_order, name, description, rationale, tools_required, outputs) VALUES
  ('retrieval-search-deepread', 1, 'search', 'Search for relevant pages', 'Find candidate pages to read deeply', 'exa.search', 'search results'),
  ('retrieval-search-deepread', 2, 'deep-read', 'Extract full text with highlights and summary', 'highlights + summary give both detail and overview', 'exa.getContents', 'page contents with highlights'),
  ('retrieval-search-deepread', 3, 'synthesize', 'Combine findings into structured output', 'Merge highlights and summaries into coherent report', 'exa.answer', 'synthesized findings');

-- Multi-Angle Verification steps
INSERT OR IGNORE INTO workflow_steps (workflow_id, step_order, name, description, rationale, tools_required, outputs) VALUES
  ('retrieval-multi-verify', 1, 'search-angle-1', 'Search from first angle or framing', 'Different framings surface different evidence', 'exa.search', 'angle 1 results'),
  ('retrieval-multi-verify', 2, 'search-angle-2', 'Search from second angle or framing', 'Independent search reduces confirmation bias', 'exa.search', 'angle 2 results'),
  ('retrieval-multi-verify', 3, 'search-angle-3', 'Search from third angle or framing', 'Three independent angles provide triangulation', 'exa.search', 'angle 3 results'),
  ('retrieval-multi-verify', 4, 'consensus', 'Generate consensus assessment via answer', 'Identify where angles agree (high confidence) vs diverge (uncertainty)', 'exa.answer', 'consensus verdict with confidence');
