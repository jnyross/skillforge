/**
 * Skill Writing Guide — Expert principles extracted from Claude Code's skill-creator methodology.
 *
 * These principles are injected into the generation prompt so that SkillForge produces
 * SKILL.md files with the same quality as skill-creator: domain expertise, pushy descriptions,
 * theory of mind, anti-patterns, and personality.
 *
 * PR 2: Expert SKILL.md Generation
 */

// ─── Boilerplate Phrases to Reject ────────────────────────────────────────────
// If any of these appear in generated output, the quality gate rejects it.

export const FORBIDDEN_PHRASES = [
  'Analyze the request',
  'Execute the task',
  'Verify the output',
  'Follow best practices',
  'Handle edge cases appropriately',
  'Ensure quality',
  'Process the data',
  'Implement the solution',
  'Review and validate',
  'Apply standard procedures',
  'Use appropriate methods',
  'Conduct thorough analysis',
  'Perform necessary checks',
  'Handle errors gracefully',
  'Optimize as needed',
  'Document the results',
  'Maintain code quality',
  'Ensure compliance',
  'Address all requirements',
  'Implement robust error handling',
  'Follow industry standards',
  'Leverage best practices',
  'Ensure scalability',
  'Maintain consistency',
]

// ─── Expert Writing Principles ────────────────────────────────────────────────
// Injected into system prompt for generation.

export const SKILL_WRITING_PRINCIPLES = `
## Expert Skill Writing Principles

These principles come from extensive experience building production skills. Follow them strictly.

### 1. Pushy Descriptions (CRITICAL)

The description frontmatter field is the PRIMARY triggering mechanism. Claude tends to "undertrigger" —
it won't use a skill even when it should. Combat this by making descriptions assertive and broad:

BAD: "A skill for generating haiku poems."
GOOD: "Generate haiku poems with proper 5-7-5 syllable structure, seasonal imagery, and emotional resonance. Use this skill whenever the user mentions haiku, poetry, short poems, Japanese poetry, syllable-based poems, or asks for something creative and concise. Also trigger when the user wants to write something brief and poetic, even if they don't explicitly say 'haiku'."

The description MUST include:
- What the skill does (1 sentence)
- Specific trigger phrases and contexts (2-3 sentences)
- Near-miss scenarios where it should still trigger
- All descriptions must be under 1024 characters

### 2. Theory of Mind — Explain the WHY

Don't write heavy-handed MUSTs and NEVERs. Instead, explain WHY things matter so the model
understands and can generalize. Today's LLMs are smart — they respond better to reasoning than commands.

BAD: "NEVER use abstract nouns in haiku. ALWAYS use concrete imagery."
GOOD: "Haiku gain their power from concrete, sensory imagery — a reader should be able to see, hear, or feel what the poem describes. Abstract nouns ('happiness', 'freedom', 'wisdom') create distance between the reader and the moment. Instead, find the specific physical detail that evokes the emotion: not 'sadness' but 'empty chair at dinner'."

If you find yourself writing ALWAYS or NEVER in all caps, reframe with reasoning.

### 3. Domain Expertise — Teach the Craft

The skill must demonstrate genuine expertise in its domain. Don't just wrap the user's intent
in generic instructions. Research and encode real knowledge:

BAD: "Write a haiku about the given topic."
GOOD: "Traditional haiku follow specific craft principles beyond the 5-7-5 syllable count:
- **Kigo (seasonal reference)**: Include a word or phrase that evokes a specific season. Spring: cherry blossoms, thawing. Summer: cicadas, heat shimmer. Autumn: harvest moon, falling leaves. Winter: frost, bare branches.
- **Kireji (cutting word)**: Create a pause or juxtaposition between two images. In English, use an em dash, ellipsis, or line break to create this effect.
- **Syllable counting pitfalls**: Technical terms and compound words are tricky. 'Algorithm' is 4 syllables, not 3. 'Fire' can be 1 or 2 syllables depending on pronunciation. When in doubt, use a simpler word."

### 4. Anti-Patterns and Pitfalls

Include SPECIFIC mistakes that are common in this domain. Not generic warnings, but real gotchas
that demonstrate deep knowledge:

BAD: "Avoid common mistakes."
GOOD: "Common haiku mistakes to avoid:
- **Forced syllable padding**: Don't add filler words ('very', 'really', 'just') to hit the count. Restructure the image instead.
- **Statement poems**: 'I love the sunset / It is beautiful to see / Nature is so great' — this states feelings instead of evoking them. Show the sunset, don't tell about it.
- **Mixed metaphors in 17 syllables**: With so few words, every image must cohere. Don't combine 'ocean waves' with 'mountain peaks' unless the juxtaposition is intentional."

### 5. Output Format with Full Examples

Don't just describe the format — show a COMPLETE example of good output AND bad output
so the model can pattern-match:

BAD: "Output should be a haiku in 5-7-5 format."
GOOD: "## Output Examples

**Good output** (for prompt 'write a haiku about coding'):
\`\`\`
semicolon lost—
the whole program holds its breath
until dawn finds it
\`\`\`
Why it works: Concrete (semicolon, breath, dawn), emotional resonance without stating emotions, proper kireji (em dash), seasonal hint (dawn).

**Bad output** (same prompt):
\`\`\`
Programming is fun
Writing code all day is great
I love computers
\`\`\`
Why it fails: Abstract statements, no imagery, no kireji, no seasonal reference, tells instead of shows."

### 6. Progressive Disclosure Structure

Keep SKILL.md under 500 lines. Use three-level loading:
1. **Metadata** (name + description) — Always in context (~100 words)
2. **SKILL.md body** — Loaded when skill triggers (<500 lines ideal)
3. **Bundled resources** — Referenced as needed (scripts/, references/, assets/)

If content exceeds 500 lines, split into references/ files with clear pointers.

### 7. Personality and Tone

Skills should have personality appropriate to their domain. Not dry templates, not overly chatty.
The tone should match what an expert practitioner would use:

- Code skills: precise, efficient, with occasional dry humor
- Creative skills: evocative, with examples that inspire
- Process skills: methodical, with clear checkpoints
- Research skills: thorough, with citation patterns

### 8. Writing Patterns

Use imperative form: "Run X", "Check Y", "If Z then do W"
Be concrete: show exact file paths, command patterns, expected outputs
Scope to the build task: no motivational text, no general advice

**Defining output formats:**
\`\`\`markdown
## Report structure
ALWAYS use this exact template:
# [Title]
## Executive summary
## Key findings
## Recommendations
\`\`\`

**Examples pattern:**
\`\`\`markdown
## Commit message format
**Example 1:**
Input: Added user authentication with JWT tokens
Output: feat(auth): implement JWT-based authentication
\`\`\`
`

// ─── Mode-Specific Expert Prompts ─────────────────────────────────────────────

export const EXPERT_MODE_PROMPTS: Record<string, string> = {
  extract: `You are an expert skill architect extracting a reusable Claude Code skill from real task experience.

Your job is NOT to wrap the task in generic instructions. Your job is to:
1. Identify the REPEATABLE PATTERN — what would make this task successful every time, not just this once
2. Extract DECISION POINTS — where did the user make choices? What were the criteria?
3. Capture CORRECTIONS as anti-patterns — what went wrong and how was it fixed?
4. Design TRIGGER CONDITIONS that are broad enough to catch variations but narrow enough to avoid false positives
5. Encode DOMAIN EXPERTISE that goes beyond what the task transcript shows — what would an expert practitioner add?

Write like someone who has done this task 100 times and knows all the gotchas.`,

  synthesize: `You are an expert skill architect synthesizing a Claude Code skill from documentation and artifacts.

Your job is NOT to summarize the docs. Your job is to:
1. Identify the COHERENT UNIT OF WORK — what single capability does this skill enable?
2. Translate documentation into ACTIONABLE INSTRUCTIONS — the model needs to DO things, not know things
3. Design BOUNDARIES — when should this skill trigger? When should it NOT trigger?
4. Preserve CRITICAL DETAILS in references/ files — what info is needed at execution time?
5. Add PRACTITIONER WISDOM — what do the docs not say that an expert would know?

Turn passive documentation into active skill instructions.`,

  hybrid: `You are an expert skill architect combining real task experience with reference documentation.

Your job is to create something BETTER than either source alone:
1. Use REAL EXPERIENCE to ground the skill in practical behavior (what actually works)
2. Use DOCUMENTATION to ensure completeness and accuracy (what should work)
3. Resolve CONFLICTS between practice and docs — when they disagree, explain why and choose the better approach
4. Build COMPREHENSIVE TRIGGERS from both real user phrasing and documented use cases
5. Create EVAL CASES that test both the practical workflow and edge cases from docs

The skill should feel like it was written by someone who read the manual AND did the job.`,

  scratch: `You are an expert skill architect creating a Claude Code skill from a description of intent.

WARNING: This skill is being generated without real artifacts. You must:
1. RESEARCH THE DOMAIN — don't just wrap the intent in generic instructions. Think about what an expert would know.
2. Include SPECIFIC anti-patterns and pitfalls for this domain (not generic warnings)
3. Generate a PUSHY DESCRIPTION that triggers broadly on related requests
4. Add CONCRETE EXAMPLES of good and bad output (not just format descriptions)
5. Flag that this skill should be GROUNDED WITH REAL EXAMPLES before serious use

Write like an expert practitioner, not a template filler.`,
}

// ─── Generation Instruction Template ──────────────────────────────────────────

export const GENERATION_INSTRUCTIONS = `
## Skill Generation Requirements

Generate a SKILL.md that follows ALL of these requirements:

### Frontmatter (YAML)
- \`name\`: kebab-case identifier
- \`description\`: PUSHY description (see principles above). Include what it does, when to trigger, and near-miss scenarios. Under 1024 chars.

### Body Structure
1. **Title and overview** — 1-2 sentences explaining the skill's purpose
2. **When to use** — Specific trigger scenarios with examples of user messages
3. **Instructions** — Step-by-step with concrete commands, file paths, expected outputs
4. **Anti-patterns / Pitfalls** — Domain-specific mistakes with explanations of WHY they're wrong
5. **Output format** — Template OR full good/bad examples (not just format description)
6. **Examples** — At least one COMPLETE input→output example showing the skill in action

### Quality Standards
- NO boilerplate phrases (see forbidden list)
- Description MUST include near-miss trigger scenarios
- Instructions use imperative form ("Run X", "Check Y")
- Anti-patterns are SPECIFIC to this domain (not generic "handle errors" advice)
- At least one full example output is shown
- Total body under 500 lines
- Theory of mind: explain WHY, not just WHAT
`
