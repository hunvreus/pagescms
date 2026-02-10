# Agent Operational Rules

## npm / npx execution
- The agent must not run `npm` or `npx` commands in this repository.
- The agent must ask the user to run any `npm`/`npx` command and wait for the result.
- This includes (non-exhaustive): `npm install`, `npm uninstall`, `npm run *`, `npx *`, `npm view`, `npm ls`.

## Reason
- Prevent npm cache ownership/permission issues on the user's machine.
