/**
 * Concept Glossary — Plain-language definitions for SkillForge concepts.
 * Used by TooltipTerm component to show inline help for non-expert users.
 */

export const CONCEPT_GLOSSARY: Record<string, string> = {
  // Core concepts
  'eval suite': 'A collection of test cases that check whether a skill works correctly across different scenarios.',
  'eval case': 'A single test scenario with an input prompt and expected outcome — like a unit test for your skill.',
  'eval run': 'One execution of all test cases in a suite, producing pass/fail results and metrics.',
  'assertion': 'A specific check applied to skill output — e.g., "output should contain a code block" or "response should be valid JSON."',
  'pass rate': 'The percentage of test cases that passed. Higher is better — 100% means every test passed.',

  // Comparison & grading
  'blind comparison': 'A side-by-side evaluation where the judge doesn\'t know which output came from which version — prevents bias.',
  'baseline': 'The reference version of a skill used for comparison. New versions are measured against this to check for improvement.',
  'rubric score': 'A numeric rating (1-10) assigned by the evaluator based on specific quality criteria.',
  'delta': 'The difference in scores between two versions. A positive delta means the new version is better.',

  // Skill authoring
  'SKILL.md': 'The markdown file that defines a skill — its description, instructions, and trigger conditions.',
  'skill version': 'A saved snapshot of a skill. Versions let you track changes and compare iterations over time.',
  'trigger description': 'The text that tells Claude when to activate this skill — like a matching rule for user requests.',
  'quality gate': 'An automated check that ensures a skill meets minimum quality standards before it\'s accepted.',
  'frontmatter': 'The YAML metadata at the top of a SKILL.md file (between --- markers) — contains the skill name, description, and settings.',

  // Optimization
  'iteration': 'One cycle of the improve loop: run tests → compare to baseline → analyze results → suggest changes.',
  'analyzer': 'The AI component that examines test results and suggests specific improvements to the skill.',
  'improver': 'The AI component that takes analyzer suggestions and rewrites parts of the SKILL.md to implement them.',

  // Trigger optimization
  'trigger query': 'A sample user message used to test whether the skill activates correctly.',
  'should trigger': 'Whether a given query is expected to activate this skill (true) or not (false).',
  'false positive': 'When a skill activates for a query it shouldn\'t have matched — the trigger is too broad.',
  'false negative': 'When a skill doesn\'t activate for a query it should have matched — the trigger is too narrow.',

  // Data & evaluation
  'train split': 'The subset of test cases used during development to improve the skill — not used for final scoring.',
  'test split': 'The held-out subset of test cases used only for final evaluation — prevents overfitting.',
  'non-discriminating': 'An assertion that always passes or always fails across all cases — it doesn\'t help distinguish good from bad output.',
  'high variance': 'An assertion with inconsistent results (passes sometimes, fails others) — may indicate a flaky test.',
}
