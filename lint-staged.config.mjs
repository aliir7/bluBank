import path from 'node:path';

const root = import.meta.dirname;

// Source files inside an app. ESLint 10 resolves each file's nearest eslint.config.*,
// so one root-level invocation lints every app with its own preset.
const LINTABLE = /^apps\/[^/]+\/.+\.(?:[cm]?[jt]sx?)$/;

const quote = (files) => files.map((file) => JSON.stringify(file)).join(' ');

/**
 * Commands returned in an array run sequentially, so ESLint's --fix and
 * Prettier's --write never race on the same file.
 *
 * @param {string[]} stagedFiles absolute paths of staged files
 * @returns {string[]}
 */
export default (stagedFiles) => {
  const lintable = stagedFiles.filter((file) =>
    LINTABLE.test(path.relative(root, file).split(path.sep).join('/')),
  );

  return [
    ...(lintable.length > 0
      ? [`eslint --fix --max-warnings=0 --no-warn-ignored ${quote(lintable)}`]
      : []),
    `prettier --write --ignore-unknown ${quote(stagedFiles)}`,
  ];
};
