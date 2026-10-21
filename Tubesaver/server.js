const express = require("express");
const axios = require("axios");
const path = require("path");
const fs = require("fs");
const os = require("os");
const crypto = require("crypto");
const { spawn } = require("child_process");
const youtubeDl = require("youtube-dl-exec");
const ffmpegStatic = require("ffmpeg-static");
const ffprobeStatic = require("ffprobe-static");

const app = express();
const PORT = process.env.PORT || 3000;

// -------------------------
// Middleware
// -------------------------

app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: false, limit: "10kb" }));
app.use(express.static(path.join(__dirname, "public")));

// -------------------------
// Helpers
// -------------------------

function validYouTubeId(id) {
    return (
        typeof id === "string" &&
        /^[A-Za-z0-9_-]{11}$/.test(id)
    );
}

function cleanTitle(title) {
    if (typeof title !== "string") {
        return "video";
    }

    return title
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .substring(0, 150) || "video";
}

function getYouTubeId(input) {
    if (typeof input !== "string") {
        return null;
    }

    input = input.trim();

    if (validYouTubeId(input)) {
        return input;
    }

    try {
        const url = new URL(input);

        if (
            url.hostname === "youtube.com" ||
            url.hostname === "www.youtube.com" ||
            url.hostname === "m.youtube.com"
        ) {
            const id = url.searchParams.get("v");

            if (validYouTubeId(id)) {
                return id;
            }
        }

        if (
            url.hostname === "youtu.be" ||
            url.hostname === "www.youtu.be"
        ) {
            const id = url.pathname.substring(1);

            if (validYouTubeId(id)) {
                return id;
            }
        }

        if (url.pathname.startsWith("/shorts/")) {
            const id = url.pathname.split("/")[2];

            if (validYouTubeId(id)) {
                return id;
            }
        }

        if (url.pathname.startsWith("/embed/")) {
            const id = url.pathname.split("/")[2];

            if (validYouTubeId(id)) {
                return id;
            }
        }
    } catch (error) {
        return null;
    }

    return null;
}

// -------------------------
// Friendly yt-dlp errors
// -------------------------

function getFriendlyDownloadError(error) {
    const message = String(
        error?.stderr ||
        error?.message ||
        error ||
        ""
    );

    const lower = message.toLowerCase();

    // YouTube bot protection
    if (
        lower.includes("sign in to confirm") ||
        lower.includes("not a bot") ||
        lower.includes("confirm you're not a bot") ||
        lower.includes("confirm you’re not a bot") ||
        lower.includes("use --cookies-from-browser") ||
        lower.includes("use --cookies for the authentication")
    ) {
        return {
            status: 403,
            message:
                "YouTube is currently blocking this download request. Please try again later or try another video."
        };
    }

    // Private videos
    if (
        lower.includes("private video") ||
        lower.includes("this video is private")
    ) {
        return {
            status: 403,
            message:
                "This video is private and cannot be downloaded."
        };
    }

    // Unavailable videos
    if (
        lower.includes("video unavailable") ||
        lower.includes("video is unavailable") ||
        lower.includes("this video is not available")
    ) {
        return {
            status: 404,
            message:
                "This video is unavailable."
        };
    }

    // Age restricted
    if (
        lower.includes("age-restricted") ||
        lower.includes("age restricted")
    ) {
        return {
            status: 403,
            message:
                "This video is age-restricted and cannot be downloaded by the server."
        };
    }

    // Members only
    if (
        lower.includes("members-only") ||
        lower.includes("members only")
    ) {
        return {
            status: 403,
            message:
                "This video is available to channel members only."
        };
    }

    // Live streams
    if (
        lower.includes("live event") ||
        lower.includes("is a live")
    ) {
        return {
            status: 400,
            message:
                "Live videos may not be available for download."
        };
    }

    // Authentication
    if (
        lower.includes("login required") ||
        lower.includes("authentication required")
    ) {
        return {
            status: 403,
            message:
                "YouTube requires authentication for this video."
        };
    }

    // FFmpeg
    if (
        lower.includes("ffmpeg") ||
        lower.includes("ffprobe")
    ) {
        return {
            status: 500,
            message:
                "The server is missing a required media processing component. Please try again later."
        };
    }

    // JavaScript runtime
    if (
        lower.includes("javascript runtime") ||
        lower.includes("js runtime") ||
        lower.includes("no supported javascript")
    ) {
        return {
            status: 500,
            message:
                "The server's YouTube JavaScript runtime is unavailable. Please try again later."
        };
    }

    // Rate limiting / temporary blocking
    if (
        lower.includes("too many requests") ||
        lower.includes("rate limit")
    ) {
        return {
            status: 429,
            message:
                "YouTube is temporarily limiting requests. Please try again later."
        };
    }

    return {
        status: 500,
        message:
            "The video could not be downloaded. Please try again later."
    };
}

// -------------------------
// Rate limiting
// -------------------------

const requests = new Map();

function rateLimit(req, res, next) {
    const ip =
        req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
        req.socket.remoteAddress ||
        "unknown";

    const now = Date.now();
    const windowMs = 60 * 1000;
    const maxRequests = 30;

    let record = requests.get(ip);

    if (!record || now - record.start > windowMs) {
        record = {
            start: now,
            count: 0
        };
    }

    record.count++;

    requests.set(ip, record);

    if (record.count > maxRequests) {
        return res.status(429).json({
            error: "Too many requests. Please wait a minute."
        });
    }

    next();
}

app.use("/api", rateLimit);

// -------------------------
// Health check
// -------------------------

app.get("/api/health", (req, res) => {
    res.json({
        status: "ok",
        service: "TubeSaver",
        ytdlp: true,
        jsRuntime: "node",
        nodeVersion: process.version,
        time: new Date().toISOString()
    });
});

// -------------------------
// Video information
// -------------------------

app.get("/api/getVideoInfo", async (req, res) => {
    const input = req.query.id;
    const id = getYouTubeId(input);

    if (!id) {
        return res.status(400).json({
            error: "Invalid YouTube URL or video ID."
        });
    }

    try {
        const youtubeUrl =
            `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`;

        const response = await axios.get(
            "https://www.youtube.com/oembed",
            {
                params: {
                    url: youtubeUrl,
                    format: "json"
                },
                timeout: 10000,
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36"
                }
            }
        );

        return res.json({
            success: true,
            id: id,
            title: cleanTitle(response.data?.title),
            author: response.data?.author_name || "YouTube",
            thumbnail:
                `https://img.youtube.com/vi/${id}/maxresdefault.jpg`,
            url: youtubeUrl
        });

    } catch (error) {
        console.error(
            "getVideoInfo error:",
            error.message
        );

        return res.status(502).json({
            error:
                "Unable to retrieve information for this YouTube video."
        });
    }
});

// -------------------------
// Resolve the ffmpeg location
// -------------------------
//
// yt-dlp needs ffmpeg to merge separate video/audio streams
// (YouTube now serves DASH formats where video and audio are
// separate) and to convert audio to mp3.
//
// ffmpeg-static and ffprobe-static ship their binaries in
// different directories, but yt-dlp expects both inside the
// single directory passed to --ffmpeg-location, so we copy
// ffprobe next to ffmpeg when needed.

function resolveFfmpegLocation() {
    try {
        if (!ffmpegStatic || !fs.existsSync(ffmpegStatic)) {
            return null;
        }

        const ffmpegDir =
            path.dirname(ffmpegStatic);

        const ffprobePath = ffprobeStatic?.path;

        if (ffprobePath && fs.existsSync(ffprobePath)) {
            const target =
                path.join(
                    ffmpegDir,
                    path.basename(ffprobePath)
                );

            if (!fs.existsSync(target)) {
                fs.copyFileSync(ffprobePath, target);
            }
        }

        return ffmpegDir;
    } catch (error) {
        console.error(
            "Could not resolve ffmpeg location:",
            error.message
        );

        return null;
    }
}

const ffmpegLocation =
    resolveFfmpegLocation();

// -------------------------
// Optional cookie authentication
// -------------------------
//
// YouTube increasingly requires authentication to avoid the
// "Sign in to confirm you're not a bot" / HTTP 429 responses.
// Cookies can be supplied in two ways:
//
//   YTDLP_COOKIES_FROM_BROWSER=chrome|edge|firefox|brave|...
//   YTDLP_COOKIES=C:\path\to\cookies.txt
//
// Both are optional. When neither is set, yt-dlp runs without
// cookies, which is fine for most videos.

const cookiesFromBrowser =
    (process.env.YTDLP_COOKIES_FROM_BROWSER || "").trim();

const cookiesFile =
    (process.env.YTDLP_COOKIES || "").trim();

function buildCookieOptions() {
    if (cookiesFile && fs.existsSync(cookiesFile)) {
        return { cookies: cookiesFile };
    }

    if (cookiesFromBrowser) {
        return { cookiesFromBrowser };
    }

    return {};
}

// -------------------------
// Download progress tracking
// -------------------------
//
// yt-dlp emits progress lines such as:
//
//   [download]  42.3% of   49.26MiB at  7.84MiB/s ETA 00:06
//   [download] Destination: <file>
//   [Merger] Merging formats into "<file>"
//
// We parse those to power the progress bar shown in the UI.
// Each download gets an in-memory job which the browser reads
// over Server-Sent Events (/api/progress?job=...).

const DOWNLOAD_JOBS = new Map();

const JOB_TTL_MS = 60 * 1000;

function createDownloadJob(kind) {
    const id =
        crypto.randomBytes(8).toString("hex");

    const job = {
        id,
        kind,
        percent: 0,
        phase: "Preparing download…",
        speed: "",
        eta: "",
        status: "starting", // starting|downloading|postprocessing|done|error
        message: "",
        fileIndex: 0,
        destinations: 0,
        updatedAt: Date.now()
    };

    DOWNLOAD_JOBS.set(id, job);

    // Safety net: drop abandoned jobs (e.g. the user closed the
    // tab mid-download) so the map cannot grow unbounded.
    const safety =
        setTimeout(
            () => DOWNLOAD_JOBS.delete(id),
            10 * 60 * 1000
        );

    if (typeof safety.unref === "function") {
        safety.unref();
    }

    return job;
}

function getOrCreateJob(id, kind) {
    if (id && DOWNLOAD_JOBS.has(id)) {
        return DOWNLOAD_JOBS.get(id);
    }

    const job =
        createDownloadJob(kind || "video");

    if (id) {
        DOWNLOAD_JOBS.delete(job.id);
        job.id = id;
        DOWNLOAD_JOBS.set(id, job);
    }

    return job;
}

function scheduleJobCleanup(job) {
    const timer =
        setTimeout(
            () => DOWNLOAD_JOBS.delete(job.id),
            JOB_TTL_MS
        );

    if (typeof timer.unref === "function") {
        timer.unref();
    }
}

function finishJob(job, status, message) {
    if (!job) {
        return;
    }

    job.status = status;

    if (status === "done") {
        job.percent = 100;
        job.phase = "Download complete";
        job.speed = "";
        job.eta = "";
    }

    if (message) {
        job.message = message;
    }

    job.updatedAt = Date.now();

    scheduleJobCleanup(job);
}

// Map an individual stream's progress (0-100) onto the overall
// progress bar. Video downloads pull a video stream and usually
// an audio stream, then merge; audio downloads pull one stream
// and convert it to mp3.

function overallPercent(job, streamPercent) {
    if (job.kind === "audio") {
        return Math.min(99, streamPercent * 0.88);
    }

    const base =
        Math.min(job.fileIndex, 1) * 45;

    return Math.min(
        99,
        base + streamPercent * 0.45
    );
}

function applyProgressLine(job, line) {
    if (!job) {
        return;
    }

    const trimmed = line.trim();

    if (!trimmed) {
        return;
    }

    // New stream begins (video stream, then audio stream)
    const destination =
        trimmed.match(/^\[download\]\s+Destination:\s*(.+)$/);

    if (destination) {
        job.destinations += 1;
        job.fileIndex =
            Math.max(0, job.destinations - 1);
        job.updatedAt = Date.now();

        return;
    }

    // Percentage updates
    const percentMatch =
        trimmed.match(
            /^\[download\]\s+([\d.]+)%\s+of\s+~?\s*[\d.]+\s*\w+/
        );

    if (percentMatch) {
        const streamPercent =
            parseFloat(percentMatch[1]);

        job.percent =
            Math.max(
                job.percent,
                overallPercent(job, streamPercent)
            );

        job.status = "downloading";

        job.phase =
            job.kind === "audio"
                ? "Downloading audio…"
                : (job.fileIndex === 0
                    ? "Downloading video…"
                    : "Downloading audio…");

        const speedMatch =
            trimmed.match(
                /at\s+([\d.]+\s*\w+\/s)/i
            );

        const etaMatch =
            trimmed.match(/ETA\s+([\d:]+)/i);

        job.speed =
            speedMatch ? speedMatch[1] : "";

        job.eta =
            etaMatch ? etaMatch[1] : "";

        job.updatedAt = Date.now();

        return;
    }

    // Post-processing phases
    if (/^\[Merger\]/i.test(trimmed)) {
        job.status = "postprocessing";
        job.phase = "Merging video + audio…";
        job.percent = Math.max(job.percent, 96);
        job.updatedAt = Date.now();

        return;
    }

    if (/^\[ExtractAudio\]/i.test(trimmed)) {
        job.status = "postprocessing";
        job.phase = "Converting audio to MP3…";
        job.percent = Math.max(job.percent, 90);
        job.updatedAt = Date.now();

        return;
    }

    if (/^\[ffmpeg\]|^\[Fixup\w*\]/i.test(trimmed)) {
        job.status = "postprocessing";
        job.phase = "Finalizing file…";
        job.percent = Math.max(job.percent, 97);
        job.updatedAt = Date.now();
    }
}

// -------------------------
// Run yt-dlp
// -------------------------
//
// Spawns the bundled yt-dlp binary directly so we can stream its
// stdout/stderr to update the download job in real time.

function runYtDlp(url, options = {}, job) {
    const nodeRuntime =
        `node:${process.execPath}`;

    const flags = {
        ...options,

        // Use Node.js for YouTube JavaScript challenges
        jsRuntimes: nodeRuntime,

        // Allow EJS scripts to be retrieved from GitHub
        remoteComponents: "ejs:github",

        // Never download playlists
        noPlaylist: true,

        // Emit one progress update per line so it is easy to parse
        newline: true,

        // Let yt-dlp find the bundled ffmpeg/ffprobe
        ...(ffmpegLocation
            ? { ffmpegLocation }
            : {}),

        // Optional cookie authentication (recommended by yt-dlp
        // when YouTube asks you to confirm you're not a bot)
        ...buildCookieOptions(),

        // Be resilient to transient network / rate-limit errors
        retries: 5,
        fragmentRetries: 5,
        extractorRetries: 3,

        // Normal browser user agent
        userAgent:
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
            "AppleWebKit/537.36 (KHTML, like Gecko) " +
            "Chrome/140.0.0.0 Safari/537.36",

        // Add referer and accept headers to mimic browser behavior
        addHeader: [
            "referer:youtube.com",
            "accept-language:en-US,en;q=0.9",
            "accept:text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
            "sec-ch-ua:\"Not A;Brand\";v=\"99\", \"Chromium\";v=\"124\", \"Google Chrome\";v=\"124\"",
            "sec-ch-ua-mobile:?0",
            "sec-ch-ua-platform:\"Windows\""
        ]
    };

    const binary =
        youtubeDl.constants.YOUTUBE_DL_PATH;

    const args = [
        ...youtubeDl.args(flags),
        "--",
        url
    ];

    return new Promise((resolve, reject) => {
        const child = spawn(
            binary,
            args,
            { windowsHide: true }
        );

        let stdout = "";
        let stderr = "";

        const handleChunk = chunk => {
            const text = chunk.toString();

            for (const line of text.split(/\r?\n/)) {
                applyProgressLine(job, line);
            }
        };

        child.stdout.on("data", chunk => {
            stdout += chunk.toString();
            handleChunk(chunk);
        });

        child.stderr.on("data", chunk => {
            stderr += chunk.toString();
            handleChunk(chunk);
        });

        child.on("error", reject);

        child.on("close", code => {
            if (code === 0) {
                resolve(stdout);
                return;
            }

            reject(
                Object.assign(
                    new Error(
                        stderr ||
                        `yt-dlp exited with code ${code}`
                    ),
                    { stderr, stdout, code }
                )
            );
        });
    });
}

// -------------------------
// YouTube bot-protection fallback
// -------------------------
//
// YouTube sometimes rate-limits the regular "web" client with
// HTTP 429 or "Sign in to confirm you're not a bot". When that
// happens, yt-dlp can usually still reach the video through the
// lightweight "mweb" client while skipping the blocked webpage.
//
// That fallback path typically only exposes a pre-merged 360p MP4
// (format 18), but it keeps downloads working instead of failing.

const YOUTUBE_FALLBACK_ARGS =
    "youtube:player_client=mweb;player_skip=webpage";

function isBotProtectionError(error) {
    const message = String(
        error?.stderr ||
        error?.message ||
        error ||
        ""
    ).toLowerCase();

    return (
        message.includes("not a bot") ||
        message.includes("sign in to confirm") ||
        message.includes("too many requests") ||
        message.includes("http error 429") ||
        message.includes("http error 403") ||
        message.includes("page needs to be reloaded") ||
        message.includes("requested format is not available") ||
        message.includes("no video formats found")
    );
}

async function downloadWithFallback(url, options, job) {
    try {
        return await runYtDlp(url, options, job);
    } catch (error) {
        if (!isBotProtectionError(error)) {
            throw error;
        }

        console.warn(
            "Primary YouTube client was blocked; " +
            "retrying with the mweb fallback client..."
        );

        if (job) {
            job.percent = 0;
            job.fileIndex = 0;
            job.destinations = 0;
            job.speed = "";
            job.eta = "";
            job.status = "downloading";
            job.phase = "Retrying with fallback client…";
            job.updatedAt = Date.now();
        }

        return await runYtDlp(
            url,
            {
                ...options,
                extractorArgs: YOUTUBE_FALLBACK_ARGS
            },
            job
        );
    }
}

// -------------------------
// Find downloaded file
// -------------------------

function findFile(directory, extensions) {
    const files = fs.readdirSync(directory);

    return files.find(file => {
        const lower = file.toLowerCase();

        return extensions.some(ext =>
            lower.endsWith(ext)
        );
    });
}

// -------------------------
// Safe temporary directory cleanup
// -------------------------

function cleanupDirectory(directory) {
    try {
        if (directory && fs.existsSync(directory)) {
            fs.rmSync(directory, {
                recursive: true,
                force: true
            });
        }
    } catch (error) {
        console.error(
            "Cleanup error:",
            error.message
        );
    }
}

// -------------------------
// Download progress (SSE)
// -------------------------
//
// Streams live progress for a download job to the browser. The
// page opens this before starting a download and closes it once
// the job reports "done" or "error".

app.get("/api/progress", (req, res) => {
    const jobId =
        String(req.query.job || "");

    res.writeHead(200, {
        "Content-Type":
            "text/event-stream; charset=utf-8",
        "Cache-Control":
            "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no"
    });

    if (typeof res.flushHeaders === "function") {
        res.flushHeaders();
    }

    let lastPayload = "";

    const tick = () => {
        const job =
            DOWNLOAD_JOBS.get(jobId);

        const payload = job
            ? {
                percent: Math.round(job.percent),
                phase: job.phase,
                status: job.status,
                speed: job.speed,
                eta: job.eta,
                message: job.message
            }
            : {
                percent: 0,
                phase: "Preparing download…",
                status: "waiting",
                speed: "",
                eta: "",
                message: ""
            };

        const serialized =
            JSON.stringify(payload);

        if (serialized !== lastPayload) {
            res.write(`data: ${serialized}\n\n`);
            lastPayload = serialized;
        } else {
            // Comment frame keeps the connection alive
            res.write(": keep-alive\n\n");
        }

        if (
            job &&
            (job.status === "done" ||
                job.status === "error")
        ) {
            clearInterval(timer);
            res.end();
        }
    };

    const timer = setInterval(tick, 350);

    tick();

    req.on("close", () => clearInterval(timer));
});

// -------------------------
// Video download
// -------------------------

app.get("/api/download/video", async (req, res) => {
    const id = getYouTubeId(req.query.id);

    if (!id) {
        return res.status(400).json({
            error: "Invalid YouTube URL or video ID."
        });
    }

    const url =
        `https://www.youtube.com/watch?v=${id}`;

    const tempDir = fs.mkdtempSync(
        path.join(
            os.tmpdir(),
            "tubesaver-"
        )
    );

    const outputTemplate =
        path.join(
            tempDir,
            "%(title).150s [%(id)s].%(ext)s"
        );

    const job =
        getOrCreateJob(
            String(req.query.job || ""),
            "video"
        );

    job.status = "downloading";
    job.phase = "Starting download…";
    job.updatedAt = Date.now();

    try {
        console.log(
            `Starting video download: ${id}`
        );

        await downloadWithFallback(
            url,
            {
                format:
                    "bestvideo+bestaudio/best",
                mergeOutputFormat: "mp4",
                restrictFilenames: true,
                output: outputTemplate
            },
            job
        );

        const file = findFile(
            tempDir,
            [
                ".mp4",
                ".mkv",
                ".webm"
            ]
        );

        if (!file) {
            throw new Error(
                "Download completed but no video file was created."
            );
        }

        const filePath =
            path.join(tempDir, file);

        const fileName =
            // Try to get clean title from filename, fallback to video ID
            path.parse(file).name.replace(/\[.*\]/, "").trim() ||
            "TubeSaver-video";

        job.percent = 100;
        job.phase = "Sending file…";
        job.updatedAt = Date.now();

        res.download(
            filePath,
            fileName + ".mp4",
            error => {
                cleanupDirectory(tempDir);

                if (error) {
                    console.error(
                        "Video send error:",
                        error.message
                    );

                    finishJob(
                        job,
                        "error",
                        "The file could not be sent."
                    );
                } else {
                    finishJob(job, "done");
                }
            }
        );

    } catch (error) {
        console.error(
            "Video download error:",
            error?.stderr ||
            error?.message ||
            error
        );

        const friendly =
            getFriendlyDownloadError(error);

        finishJob(job, "error", friendly.message);

        cleanupDirectory(tempDir);

        return res.status(friendly.status).json({
            error: friendly.message
        });
    }
});

// -------------------------
// Audio download
// -------------------------

app.get("/api/download/audio", async (req, res) => {
    const id = getYouTubeId(req.query.id);

    if (!id) {
        return res.status(400).json({
            error: "Invalid YouTube URL or video ID."
        });
    }

    const url =
        `https://www.youtube.com/watch?v=${id}`;

    const tempDir = fs.mkdtempSync(
        path.join(
            os.tmpdir(),
            "tubesaver-"
        )
    );

    const outputTemplate =
        path.join(
            tempDir,
            "%(title).150s [%(id)s].%(ext)s"
        );

    const job =
        getOrCreateJob(
            String(req.query.job || ""),
            "audio"
        );

    job.status = "downloading";
    job.phase = "Starting download…";
    job.updatedAt = Date.now();

    try {
        console.log(
            `Starting audio download: ${id}`
        );

        await downloadWithFallback(
            url,
            {
                extractAudio: true,
                audioFormat: "mp3",
                audioQuality: "192K",
                restrictFilenames: true,
                output: outputTemplate
            },
            job
        );

        const file = findFile(
            tempDir,
            [".mp3"]
        );

        if (!file) {
            throw new Error(
                "Download completed but no MP3 file was created."
            );
        }

        const filePath =
            path.join(tempDir, file);

        const fileName =
            // Try to get clean title from filename, fallback to video ID
            path.parse(file).name.replace(/\[.*\]/, "").trim() ||
            "TubeSaver-audio";

        job.percent = 100;
        job.phase = "Sending file…";
        job.updatedAt = Date.now();

        res.download(
            filePath,
            fileName + ".mp3",
            error => {
                cleanupDirectory(tempDir);

                if (error) {
                    console.error(
                        "Audio send error:",
                        error.message
                    );

                    finishJob(
                        job,
                        "error",
                        "The file could not be sent."
                    );
                } else {
                    finishJob(job, "done");
                }
            }
        );

    } catch (error) {
        console.error(
            "Audio download error:",
            error?.stderr ||
            error?.message ||
            error
        );

        const friendly =
            getFriendlyDownloadError(error);

        finishJob(job, "error", friendly.message);

        cleanupDirectory(tempDir);

        return res.status(friendly.status).json({
            error: friendly.message
        });
    }
});

// -------------------------
// API 404
// -------------------------

app.use("/api", (req, res) => {
    res.status(404).json({
        error: "API endpoint not found."
    });
});

// -------------------------
// Frontend
// -------------------------

app.get("*", (req, res) => {
    res.sendFile(
        path.join(
            __dirname,
            "public",
            "index.html"
        )
    );
});

// -------------------------
// Error handler
// -------------------------

app.use((err, req, res, next) => {
    console.error(
        "Server error:",
        err
    );

    res.status(500).json({
        error: "Internal server error."
    });
});

// -------------------------
// Start server
// -------------------------

app.listen(
    PORT,
    "0.0.0.0",
    () => {
        console.log(
            `TubeSaver running on port ${PORT}`
        );

        console.log(
            `Node.js version: ${process.version}`
        );

        console.log(
            `yt-dlp JavaScript runtime: ${process.execPath}`
        );

        console.log(
            "yt-dlp EJS remote components enabled"
        );

        console.log(
            ffmpegLocation
                ? `yt-dlp ffmpeg location: ${ffmpegLocation}`
                : "yt-dlp ffmpeg not found (merging/conversion may fail)"
        );

        if (cookiesFromBrowser) {
            console.log(
                `yt-dlp cookies-from-browser: ${cookiesFromBrowser}`
            );
        } else if (cookiesFile) {
            console.log(
                `yt-dlp cookies file: ${cookiesFile}`
            );
        } else {
            console.log(
                "yt-dlp cookies: none (set YTDLP_COOKIES_FROM_BROWSER to enable)"
            );
        }
    }
);