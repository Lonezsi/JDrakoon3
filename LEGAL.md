# Legal & responsible use

JDrakoon3 is licensed under the [MIT License](LICENSE). This document covers the
parts that need more than a license header — chiefly the optional media queue.

## The media queue / `yt-dlp`

The video/music queue can, **only when you explicitly enable it**, use
[`yt-dlp`](https://github.com/yt-dlp/yt-dlp) to fetch media from online sources.

- **Off by default.** Extraction is gated behind the `media.allowExtraction`
  setting, which ships **disabled**. With it off, the queue accepts only
  **direct media URLs** (`.mp4`, `.mp3`, `.m4a`, `.webm`, …) and local files.
- **DRM-protected services are rejected outright** (Spotify, Apple Music, Tidal,
  Deezer, Netflix, Max, Disney+, Prime, …) — their streams can't be extracted,
  and attempting to would circumvent access controls.
- **You are responsible** for what you queue. Only add content you own, have a
  licence for, or are otherwise authorised to play, and comply with each source
  platform's Terms of Service and your local copyright law.
- JDrakoon3 does not host, bundle, or distribute any media. `yt-dlp` is fetched
  at runtime from its official releases and is the user's tool, run on the user's
  machine, at the user's direction.

Enabling `media.allowExtraction` is an explicit acknowledgement of the above.

## Launched applications & their icons

The dashboard launches programs you point it at and may display each program's
own icon (extracted locally for display only). Those applications, their names,
icons, and trademarks belong to their respective owners; JDrakoon3 is not
affiliated with or endorsed by them.

## Third-party components

- **yt-dlp** — Unlicense/public-domain (fetched at runtime, not bundled).
- **WebView2 Runtime** — Microsoft; used to host the dashboard on Windows.
- npm/runtime dependencies retain their own licenses.

## No warranty

As stated in the MIT License, the software is provided "as is", without warranty
of any kind. You assume all risk for how you use it, including the media queue.
