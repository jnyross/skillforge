'use client'

import { Wand2, ArrowRight } from 'lucide-react'

export default function WizardPage() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Wand2 className="h-6 w-6" />
          Skill Creation Wizard
        </h1>
        <p className="text-muted-foreground mt-1">
          Create new skills from artifacts, conversations, and intent descriptions
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="border border-border rounded-lg p-6 hover:bg-accent transition-colors cursor-pointer">
          <h3 className="text-lg font-medium mb-2">Extract from Task</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Turn a successful hands-on Claude task into a reusable skill.
            Provide conversation transcripts, code outputs, and corrections.
          </p>
          <div className="flex items-center gap-2 text-primary text-sm">
            Start <ArrowRight className="h-4 w-4" />
          </div>
        </div>

        <div className="border border-border rounded-lg p-6 hover:bg-accent transition-colors cursor-pointer">
          <h3 className="text-lg font-medium mb-2">Synthesize from Artifacts</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Build a skill from existing docs, runbooks, style guides,
            APIs, schemas, and example outputs.
          </p>
          <div className="flex items-center gap-2 text-primary text-sm">
            Start <ArrowRight className="h-4 w-4" />
          </div>
        </div>

        <div className="border border-border rounded-lg p-6 hover:bg-accent transition-colors cursor-pointer">
          <h3 className="text-lg font-medium mb-2">Hybrid</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Combine task extraction with artifact synthesis for the most
            grounded result.
          </p>
          <div className="flex items-center gap-2 text-primary text-sm">
            Start <ArrowRight className="h-4 w-4" />
          </div>
        </div>

        <div className="border border-border rounded-lg p-6 hover:bg-accent transition-colors cursor-pointer">
          <h3 className="text-lg font-medium mb-2">From Scratch</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Describe your intent and let the wizard generate an initial
            skill draft with evals and benchmarks.
          </p>
          <div className="flex items-center gap-2 text-primary text-sm">
            Start <ArrowRight className="h-4 w-4" />
          </div>
        </div>
      </div>

      <div className="text-sm text-muted-foreground border border-border rounded-lg p-4">
        <p className="font-medium mb-1">Wizard outputs:</p>
        <ul className="list-disc list-inside space-y-1">
          <li>Valid SKILL.md with frontmatter</li>
          <li>Recommended references/, scripts/, and assets/</li>
          <li>Trigger eval suite + output eval suite</li>
          <li>Baseline assertions and initial judge prompts</li>
          <li>First-run smoke benchmark</li>
        </ul>
      </div>
    </div>
  )
}
