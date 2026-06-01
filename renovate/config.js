module.exports = {
  platform: "forgejo",
  endpoint: "https://codeberg.org",
  token: process.env.RENOVATE_TOKEN,
  gitAuthor: process.env.RENOVATE_GIT_AUTHOR,
  autodiscover: false,
  repositories: [
    "gravi-ctrl/server-docker-backup",
  ],
  enabledManagers: ["docker-compose"],
  packageRules: [
    {
      matchDatasources: ["docker"],
      automerge: false,
      stabilityDays: 3,
      pinDigests: true,
    },
    {
      matchUpdateTypes: ["patch"],
      stabilityDays: 1,
    },
    {
      matchUpdateTypes: ["minor"],
      stabilityDays: 3,
    },
    {
      matchUpdateTypes: ["major"],
      stabilityDays: 7,
      labels: ["major-update", "review-carefully"],
    }
  ],
  labels: ["renovate", "dependencies"],
};
