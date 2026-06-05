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
  hostRules: [
    {
      matchHost: "github.com",
      token: process.env.GITHUB_TOKEN,
    }
  ],
  packageRules: [
    {
      matchDatasources: ["docker"],
      automerge: false,
      minimumReleaseAge: "3 days",
      pinDigests: true,
    },
    {
      matchUpdateTypes: ["patch"],
      automerge: true,
      minimumReleaseAge: "1 day",
    },
    {
      matchUpdateTypes: ["minor"],
      minimumReleaseAge: "3 days",
    },
    {
      matchUpdateTypes: ["major"],
      minimumReleaseAge: "7 days",
      labels: ["major-update", "review-carefully"],
    }
  ],
  labels: ["renovate", "dependencies"],
};
