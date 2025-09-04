# Cursor Rules for Rugs Research

## Hard Rules (Never Violate)

1. **Stay aligned to Main Goal**: Observe client-visible events (WebSocket + DOM) from rugs.fun, store in SQLite, analyze hazard of rug, output simple guidance.

2. **Never modify or interfere with the site**: No automation of betting. No ToS bypass. Read-only observation only.

3. **Keep selectors isolated**: All DOM selectors must be in `apps/collector/src/config/selectors.ts` with clear TODO comments for user updates.

4. **Prefer stable, testable modules**: Small, composable functions; typed data; clear interfaces.

5. **Ask for clarification**: If a requirement conflicts with these rules, ask for clarification in a single sentence and propose the minimal change.

6. **Always update docs/TODO.md**: When adding new tasks, mark what's done and add new items.

## Development Guidelines

- Use TypeScript strict mode everywhere
- Write tests for critical functions
- Log warnings for schema drift and selector failures
- Keep dependencies minimal and well-documented
- Follow conventional commits
- Document all configuration options

## Scope Boundaries

✅ **In Scope**:
- Data collection from public client-side events
- Statistical analysis and modeling
- Risk assessment and timing guidance
- Export and visualization tools

❌ **Out of Scope**:
- Automated betting or trading
- Site modification or interference
- ToS violations or security bypass
- Real-time trading signals
- Financial advice or recommendations
