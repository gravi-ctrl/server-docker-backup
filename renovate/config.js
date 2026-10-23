module.exports = {
  platform: "github",
  endpoint: "https://api.github.com",
  token: process.env.GITHUB_RENOVATE_TOKEN,
  gitAuthor: process.env.RENOVATE_GIT_AUTHOR,
  persistRepoData: true,
  autodiscover: false,
  repositories: [
    "gravi-ctrl/server-docker-backup",
  ],
  enabledManagers: ["docker-compose"],
  packageRules: [
    {
      matchDatasources: ["docker"],
      automerge: false,
      minimumReleaseAge: "3 days",
      pinDigests: true,
    },
    {
      matchUpdateTypes: ["patch"],
      automerge: false,
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
    },
    {
      matchPackageNames: ["lscr.io/linuxserver/qbittorrent"],
      allowedVersions: "/^\\d+\\.\\d+\\.\\d+$/",
    },
  ],
  labels: ["renovate", "dependencies"],
};
