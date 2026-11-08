/**
 * oxlint JS plugin for Astraya's one custom lint rule (#1284, gating since #1329).
 *
 * `require-module-header` enforces the `@module` JSDoc tag CLAUDE.md's Code Standards section
 * requires on every `src/`, `server/` and `tools/` file (test/e2e/scripts/config are exempt).
 * oxlint reads plugins from `jsPlugins` in `.oxlintrc.json` rather than from a flat-config
 * `plugins` key, which is the only reason this lives in its own file instead of inline.
 *
 * The plugin is named `local` so the diagnostic reads `local/require-module-header`.
 */
export default {
  meta: { name: 'local' },
  rules: {
    'require-module-header': {
      meta: { type: 'problem', docs: { description: 'require a @module JSDoc tag' } },
      create(context) {
        return {
          Program() {
            const hasModuleTag = context.sourceCode.getAllComments().some((comment) => /@module\b/.test(comment.value));
            if (!hasModuleTag) {
              context.report({
                loc: { line: 1, column: 0 },
                message:
                  'Missing @module JSDoc header (CLAUDE.md Code Standards). Add @module/@purpose/@conventions/@exports to a top-of-file comment.',
              });
            }
          },
        };
      },
    },
  },
};
