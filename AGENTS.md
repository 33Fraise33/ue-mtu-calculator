# Repository guidance

## Project

- This is a React and TypeScript browser app for calculating mobile transport packet overhead and UE MTU. The calculation model is in `src/calculator.ts`; the interface is in `src/App.tsx` and `src/styles.css`.
- Consult `README.md` and `references.md` for the modeled encapsulations, assumptions, limitations, and standards references. Preserve the relative Vite base path needed by GitHub Pages.
- When changing calculation assumptions or packet arithmetic, add regression tests in `src/calculator.test.ts` and update the documentation and references where appropriate. Do not present the results as authoritative network or security guidance.
- Keep the bundled joke dataset's attribution in `THIRD_PARTY_NOTICES.md` intact.

## Development workflow

- Develop in a dedicated Git worktree and branch for each independent task. Start from the appropriate base branch, and check the repository and worktree status before making changes. If the user explicitly requests work in the current checkout or asks to continue existing changes, respect that instead of moving or discarding those changes.
- Preserve existing uncommitted work and stashes. Do not reset, clean, force-remove a worktree, or delete a branch containing work without explicit permission. Report the worktree path and branch when handing off changes.
- Run Node, npm, and the development server in Docker rather than installing or using an ad hoc host runtime. The project requires Node.js 22.12 or newer; use the `node:22` image to match CI. Mount the worktree at `/app` and use a separate dependency volume so container packages do not overwrite host `node_modules`.
- For a development server, run `docker run --rm -it -p 127.0.0.1:5173:5173 -v "$PWD:/app" -v /app/node_modules -w /app node:22 sh -c 'npm ci && npm run dev -- --host 0.0.0.0'` from the worktree. The server is exposed only on the host's loopback interface.
- Keep changes focused and consistent with the surrounding code. Test boundary cases and padding/alignment changes in the calculator, not just the default configuration. Update relevant documentation when behavior or assumptions change.

## Dependencies and verification

- CI uses `npm ci`, `npm test`, and `npm run build`; the security workflow runs `npm audit --audit-level=low`. Run these checks in Docker after relevant changes, for example: `docker run --rm -v "$PWD:/app" -v /app/node_modules -w /app node:22 sh -c 'npm ci && npm test && npm run build && npm audit --audit-level=low'`.
- The anonymous dependency volume is removed with the container, so install dependencies in each new container invocation. Note any checks that could not be run and why.
- Keep `package.json` and `package-lock.json` consistent. Review dependency and lockfile changes, and do not use `npm audit fix --force` without approval.
- `node_modules/`, `dist/`, and TypeScript build-info files are generated and ignored; do not commit them.
