# TubeSaver

A self-hosted YouTube video (MP4) and audio (MP3) downloader built with
Node.js, Express, and yt-dlp, with a live progress bar powered by
Server-Sent Events.

## Features

- Download any YouTube video as MP4 (best video + audio, merged with ffmpeg)
- Convert & download audio as MP3 (192K)
- Real-time download progress (phase, percentage, speed, ETA)
- Friendly error messages for private, age-restricted, and rate-limited videos
- Automatic fallback for YouTube bot-protection errors
- Basic per-IP rate limiting (30 requests/minute)

## Running locally

```bash
npm install
npm start
```

Open http://localhost:3000

## Deploying to Railway

1. Push this repository to GitHub (already done: `d3fau1t11/Tubesaver`).
2. Go to https://railway.com/new and choose "Deploy from GitHub repo".
3. Select `Tubesaver`. Railway reads `nixpacks.toml` (Node 22 + ffmpeg) and
   `railway.json` (health check at `/api/health`).
4. Deploy - no environment variables are required.
5. Generate a public domain under Settings > Networking.

### Environment variables (all optional)

| Variable | Description |
|----------|-------------|
| `PORT` | Set automatically by Railway |
| `YTDLP_COOKIES_FROM_BROWSER` | Only useful locally (e.g. `chrome`). Servers have no browser. |
| `YTDLP_COOKIES` | Path to a Netscape-format `cookies.txt`. On Railway, add the file to the repo (e.g. `cookies.txt`) and set this to an absolute path like `/app/cookies.txt`, or mount it with a Railway volume. |

If YouTube starts replying "Sign in to confirm you're not a bot" with HTTP 429
at scale, provide cookies with `YTDLP_COOKIES`.

## How it works

- `server.js` - Express API + static frontend
- `youtube-dl-exec` - bundled yt-dlp binary for extracting/downloading streams
- `ffmpeg-static` / `ffprobe-static` - bundled media tools for merging and MP3 conversion
- `/api/getVideoInfo` - video metadata via YouTube oEmbed
- `/api/download/video`, `/api/download/audio` - server-side download + streaming response
- `/api/progress` - SSE stream for live progress
