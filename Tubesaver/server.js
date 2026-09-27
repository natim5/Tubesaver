const express = require("express");
const axios = require("axios");
const path = require("path");
const fs = require("fs");
const os = require("os");

const youtubeDl = require("youtube-dl-exec");

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
// Convert yt-dlp errors
// -------------------------

function getFriendlyDownloadError(error) {
    const message = String(
        error?.stderr ||
        error?.message ||
        error ||
        ""
    );

    const lower = message.toLowerCase();

    if (
        lower.includes("sign in to confirm") ||
        lower.includes("not a bot") ||
        lower.includes("confirm you're not a bot") ||
        lower.includes("confirm you’re not a bot")
    ) {
        return {
            status: 403,
            message:
                "YouTube is currently blocking this download request. Please try again later or try another video."
        };
    }

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

    if (
        lower.includes("video unavailable") ||
        lower.includes("video is unavailable")
    ) {
        return {
            status: 404,
            message:
                "This video is unavailable."
        };
    }

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

    if (
        lower.includes("private") ||
        lower.includes("login required") ||
        lower.includes("authentication required")
    ) {
        return {
            status: 403,
            message:
                "YouTube requires authentication for this video."
        };
    }

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

    if (
        lower.includes("javascript runtime") ||
        lower.includes("js runtime")
    ) {
        return {
            status: 500,
            message:
                "The server's YouTube extraction runtime is unavailable. Please try again later."
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
        jsRuntime: "deno",
        time: new Date().toISOString()
    });
});

// -------------------------
// Get video information
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
                timeout: 10000
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
// Run yt-dlp
// -------------------------

function runYtDlp(url, options = {}) {
    return youtubeDl(url, {
        ...options,
        jsRuntimes: "deno",
        noPlaylist: true
    });

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

    try {
        console.log(
            `Starting video download: ${id}`
        );

        await runYtDlp(url, {
            format: "bestvideo+bestaudio/best",
            mergeOutputFormat: "mp4",
            restrictFilenames: true,
            output: outputTemplate
        });

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

        res.download(
            filePath,
            cleanTitle(
                path.parse(file).name
            ) + ".mp4",
            error => {
                fs.rmSync(
                    tempDir,
                    {
                        recursive: true,
                        force: true
                    }
                );

                if (error) {
                    console.error(
                        "Video send error:",
                        error.message
                    );
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

        fs.rmSync(
            tempDir,
            {
                recursive: true,
                force: true
            }
        );

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

    try {
        console.log(
            `Starting audio download: ${id}`
        );

        await runYtDlp(url, {
            extractAudio: true,
            audioFormat: "mp3",
            audioQuality: "192K",
            restrictFilenames: true,
            output: outputTemplate
        });

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

        res.download(
            filePath,
            cleanTitle(
                path.parse(file).name
            ) + ".mp3",
            error => {
                fs.rmSync(
                    tempDir,
                    {
                        recursive: true,
                        force: true
                    }
                );

                if (error) {
                    console.error(
                        "Audio send error:",
                        error.message
                    );
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

        fs.rmSync(
            tempDir,
            {
                recursive: true,
                force: true
            }
        );

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
            "youtube-dl-exec enabled"
        );

        console.log(
            "Deno JavaScript runtime enabled"
        );
    }
);