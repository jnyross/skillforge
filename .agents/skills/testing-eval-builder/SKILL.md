# Testing: AI-Guided Eval Builder

## Overview
The Eval Builder (`/eval-builder`) is a conversational AI interface that guides users through creating eval suites from a knowledge corpus. It uses the Anthropic Claude API for real-time conversation.

## Devin Secrets Needed
- `ANTHROPIC_API_KEY` — Required for real Claude API responses. Without it, the service falls back to mock responses.

## Prerequisites
- Dev server running: `ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY npm run dev`
- Prisma schema synced: `npx prisma db push`
- At least one skill repo in the database (needed for commit flow)

## Test Flows

### 1. Full Flow (Happy Path)
1. Navigate to `/eval-builder`
2. Click "New Conversation", select a skill repo, click "Start"
3. Verify: Session appears in sidebar, AI greeting mentions repo name, phase shows "Understanding your skill"
4. Send a message describing the skill (what it does, triggers, expected output)
5. Verify: AI responds with follow-up questions, phase may advance to "Ingesting knowledge"
6. Click the book icon (Paste Knowledge), paste corpus text (>200 chars), click "Send Knowledge"
7. Verify: AI analyzes corpus and proposes test cases with accept/reject/edit buttons
8. Test case controls: Accept (green check), Reject (red X removes case), Edit (pencil opens form)
9. Click "Accept All" to accept remaining cases
10. Click "Commit to Evals"
11. Verify: Success message "Successfully committed X test cases to Y eval suite(s)", phase shows "Complete"
12. Navigate to `/evals` and verify suites appear with "AI-Guided" prefix, correct case counts, linked to repo

### 2. Session Without Repo (Error Path)
1. Create session without selecting a repo (leave as "No repo")
2. Chat to get cases proposed, accept them
3. Click "Commit to Evals"
4. Verify: Error message "Session not found or no skill repo selected" — commit blocked gracefully

## Key Observations
- Claude API calls take 5-20 seconds depending on response length. Wait at least 15-20 seconds after sending messages.
- The phase transitions automatically based on conversation content: understanding → corpus → analysis → generation → refinement → committed
- Long messages (>200 chars) in the "understanding" phase may auto-trigger corpus ingestion phase
- Test cases are split into trigger and output types, creating 2 separate eval suites on commit
- Suite names include session ID suffix for uniqueness (e.g., "AI-Guided Trigger Suite — Repo Name (abc12345)")
- The "Commit to Evals" button only appears after at least one case is accepted
- Committed sessions show "committed" status in the sidebar and cannot be re-committed (double-commit guard)

## Common Issues
- If Claude doesn't output structured `|||PROPOSED_CASES|||` delimiters, no cases are extracted — the conversation continues without cases appearing. This is a known limitation of the delimiter-based parsing approach.
- Port 3000 conflicts: Kill existing processes with `fuser -k 3000/tcp` before starting dev server
- If the conversation history starts with an assistant message (greeting), the service skips it to satisfy Anthropic API's requirement that the first message must have role "user"
