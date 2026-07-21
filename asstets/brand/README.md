<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./agentforge-logo-dark.svg">
    <source media="(prefers-color-scheme: light)" srcset="./agentforge-logo-light.svg">
    <img src="./agentforge-logo-light.svg" alt="AgentForge" width="520">
  </picture>
</p>

# AgentForge brand assets

This directory contains the repository's visual identity assets. Prefer SVG for
documentation and scalable interfaces, and use PNG only where a platform or
metadata field requires raster artwork.

## Asset guide

| Asset | Intended use |
| --- | --- |
| `agentforge-logo-dark.svg` | Wordmark on dark or dark-aware surfaces |
| `agentforge-logo-light.svg` | Wordmark on light surfaces and fallback rendering |
| `agentforge-mark.svg` | Standalone transparent brand mark |
| `agentforge-master.svg` | Master standalone mark artwork |
| `readme-banner.svg` / `.png` | Wide repository and documentation banner |
| `github-social-preview.png` | GitHub repository social preview |
| `banner-background.png` | Raster banner background without documentation layout |
| `agentforge-logo-concept.png` | Original visual concept reference |
| `favicon.svg` | Scalable browser or application icon |
| `favicons/*` | Common browser, Apple touch, and application icon sizes |
| `package-icons/*.svg` | Package-specific README and catalog icons |

Documentation uses relative paths so forks and offline repository views do not
depend on an external image host. Keep meaningful `alt` text wherever an asset
is embedded.
