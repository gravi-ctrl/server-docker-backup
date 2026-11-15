#!/usr/bin/env python3
"""Generate a Renovate preset allowing only n8n GitHub releases marked stable.

This deliberately does not resolve Docker digests. Renovate's built-in Docker
datasource remains responsible for both version discovery and digest lookup.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
OUTPUT_FILE = REPOSITORY_ROOT / "renovate-feed" / "n8n-stable.json"
RELEASES_API = "https://api.github.com/repos/n8n-io/n8n/releases?per_page=100&page={page}"
TAG_PATTERN = re.compile(r"^n8n@(?P<version>\d+\.\d+\.\d+)$")
CURRENT_IMAGE_PATTERN = re.compile(
    r"""(?m)^\s*image:\s*["']?n8nio/n8n:(?P<version>\d+\.\d+\.\d+)@sha256:[0-9a-f]{64}["']?\s*(?:#.*)?$"""
)


def fetch_releases() -> list[dict]:
    """Fetch every GitHub release page; fail closed on API/network errors."""
    releases: list[dict] = []
    page = 1

    while True:
        url = RELEASES_API.format(page=page)
        request = Request(
            url,
            headers={
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
                "User-Agent": "gravi-ctrl-n8n-stable-version-feed",
            },
        )

        try:
            with urlopen(request, timeout=30) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as exc:
            raise RuntimeError(f"Could not retrieve n8n releases from GitHub (page {page}): {exc}") from exc

        if not isinstance(payload, list):
            raise RuntimeError(f"Unexpected GitHub API response on page {page}: expected a list")

        releases.extend(payload)
        if len(payload) < 100:
            break
        page += 1

    if not releases:
        raise RuntimeError("GitHub returned no n8n releases; refusing to publish an empty allowlist")

    return releases


def stable_versions(releases: list[dict]) -> list[str]:
    versions: set[str] = set()

    for release in releases:
        if release.get("draft") is not False or release.get("prerelease") is not False:
            continue

        tag_name = release.get("tag_name", "")
        match = TAG_PATTERN.fullmatch(tag_name)
        if match:
            versions.add(match.group("version"))

    if not versions:
        raise RuntimeError("No stable SemVer n8n releases were found; refusing to publish an empty allowlist")

    # Numeric tuple ordering keeps the generated preset deterministic.
    return sorted(versions, key=lambda value: tuple(int(part) for part in value.split(".")))


def current_pinned_versions() -> set[str]:
    """Find pinned n8nio/n8n versions in Compose files and exclude archived stacks."""
    versions: set[str] = set()
    compose_names = {"compose.yml", "compose.yaml", "docker-compose.yml", "docker-compose.yaml"}

    for path in REPOSITORY_ROOT.rglob("*"):
        if not path.is_file() or path.name not in compose_names:
            continue
        relative = path.relative_to(REPOSITORY_ROOT)
        if any(part in {"_archive", ".git"} for part in relative.parts):
            continue

        try:
            content = path.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            continue

        versions.update(
            match.group("version")
            for match in CURRENT_IMAGE_PATTERN.finditer(content)
        )

    return versions


def build_preset(versions: list[str]) -> dict:
    # Docker tags are plain x.y.z; escaping dots makes the allowlist exact.
    version_alternation = "|".join(re.escape(version) for version in versions)
    return {
        "$schema": "https://docs.renovatebot.com/renovate-schema.json",
        "description": (
            "Generated allowlist of n8n versions whose GitHub Releases are marked "
            "stable. Do not edit manually."
        ),
        "packageRules": [
            {
                "description": "Only n8n releases marked stable on GitHub are eligible",
                "matchDatasources": ["docker"],
                "matchPackageNames": ["n8nio/n8n"],
                "allowedVersions": f"/^(?:{version_alternation})$/",
            }
        ],
    }


def main() -> int:
    releases = fetch_releases()
    versions = stable_versions(releases)

    current_versions = current_pinned_versions()
    if not current_versions:
        raise RuntimeError(
            "Could not find a pinned n8nio/n8n image in a Compose file; "
            "refusing to publish until the repository layout/image syntax is checked"
        )

    missing_current = sorted(current_versions - set(versions))
    if missing_current:
        raise RuntimeError(
            "The currently pinned n8n version(s) are not marked stable by GitHub: "
            + ", ".join(missing_current)
            + ". Refusing to replace the existing allowlist."
        )

    preset = build_preset(versions)
    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    rendered = json.dumps(preset, indent=2) + "\n"

    previous = OUTPUT_FILE.read_text(encoding="utf-8") if OUTPUT_FILE.exists() else None
    if previous == rendered:
        print(f"Stable n8n allowlist unchanged ({len(versions)} versions).")
        return 0

    OUTPUT_FILE.write_text(rendered, encoding="utf-8")
    print(
        f"Updated {OUTPUT_FILE.relative_to(REPOSITORY_ROOT)} with "
        f"{len(versions)} stable n8n versions; current pinned version(s): "
        f"{', '.join(sorted(current_versions))}"
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except RuntimeError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise SystemExit(1)
