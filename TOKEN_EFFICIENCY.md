# Token Efficiency

## Commands — pipe verbose output through distill
```bash
tsc --noEmit 2>&1 | distill "any TypeScript errors?"
npm run build 2>&1 | distill "did the build succeed? summarize errors"
npm test 2>&1 | distill "did tests pass? summarize failures"
npm run lint 2>&1 | distill "summarize any lint errors"
git diff 2>&1 | distill "what changed?"
```

## Workflow
- Use `Shift+Tab` (plan mode) before any multi-file change — prevents re-work
- Use `/clear` when switching to an unrelated task
- Use `/compact Focus on code changes and errors` before context gets large
- Run `/cost` or `/context` to check usage when sessions feel heavy
- Give specific file paths in prompts (`src/app/api/events/route.ts`) — avoids broad scanning

## Compact instructions
When compacting, preserve: current task state, recent errors, key file paths touched, DB schema changes. Drop: earlier resolved errors, tool call details, verbose command output.
