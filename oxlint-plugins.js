/**
 * Advisory-only oxlint JS plugin (#1284).
 *
 * Ports `local/require-module-header` from `eslint.config.js` so the advisory
 * oxlint run covers the same rule set as the gating ESLint run. The rule body is
 * the same as the ESLint one; only the packaging differs (oxlint reads plugins
 * from `jsPlugins` in `.oxlintrc.json` rather than from a flat-config `plugins`
 * key). `eslint.config.js` remains the single source of truth: if the rule
 * changes there, change it here too, or delete this file along with the rest of
 * the advisory setup.
 *
 * The plugin is named `local` so the diagnostics read `local/require-module-header`
 * in both tools.
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
