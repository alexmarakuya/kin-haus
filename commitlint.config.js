export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "type-enum": [2, "always", ["feat", "fix", "ui", "refactor", "chore", "docs", "perf"]],
    "type-case": [2, "always", "lower-case"],
    "subject-case": [0],
    "header-max-length": [2, "always", 72],
    "body-leading-blank": [2, "always"],
  },
};
