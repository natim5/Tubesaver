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

    // Direct video ID
    if (validYouTubeId(input)) {
        return input;
    }

    try {
        const url = new URL(input);

        // youtube.com/watch?v=
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

        // youtu.be/VIDEO_ID
        if (url.hostname === "youtu.be") {
            const id = url.pathname.substring(1);

            if (validYouTubeId(id)) {
                return id;
            }
        }

        // youtube.com/shorts/VIDEO_ID
        if (url.pathname.startsWith("/shorts/")) {
            const id = url.pathname.split("/")[2];

            if (validYouTubeId(id)) {
                return id;
            }
        }

        // youtube.com/embed/VIDEO_ID
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
            error: "Unable to retrieve video information."
        });
    }
});

// -------------------------
// Run youtube-dl
// -------------------------

function runYtDlp(args) {
    return new Promise((resolve, reject) => {
        if (!args || args.length === 0) {
            return reject(
                new Error("No download arguments supplied.")
            );
        }

        const url = args[args.length - 1];

        const customArgs = args.slice(0, -1);

        youtubeDl(url, {
            customArgs: customArgs
        })
            .then(stdout => {
                resolve({
                    stdout: stdout || "",
                    stderr: ""
                });
            })
            .catch(error => {
                reject(error);
            });
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

        await runYtDlp([
            "--no-playlist",
            "-f",
            "bestvideo+bestaudio/best",
            "--merge-output-format",
            "mp4",
            "--restrict-filenames",
            "-o",
            outputTemplate,
            url
        ]);

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
            error.message
        );

        fs.rmSync(
            tempDir,
            {
                recursive: true,
                force: true
            }
        );

        return res.status(500).json({
            error: "Video download failed.",
            message: error.message
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

        await runYtDlp([
            "--no-playlist",
            "-x",
            "--audio-format",
            "mp3",
            "--audio-quality",
            "192K",
            "--restrict-filenames",
            "-o",
            outputTemplate,
            url
        ]);

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
            error.message
        );

        fs.rmSync(
            tempDir,
            {
                recursive: true,
                force: true
            }
        );

        return res.status(500).json({
            error: "Audio download failed.",
            message: error.message
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
    }
);