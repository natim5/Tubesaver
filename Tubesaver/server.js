const express = require("express");
const axios = require("axios");
const path = require("path");

const app = express();

const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: false, limit: "10kb" }));

// Static frontend
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

    // Direct 11-character ID
    if (validYouTubeId(input)) {
        return input;
    }

    try {
        const url = new URL(input);

        // youtube.com/watch?v=...
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
        time: new Date().toISOString()
    });
});

// -------------------------
// Get YouTube video info
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

        const title =
            cleanTitle(response.data?.title);

        const author =
            response.data?.author_name || "YouTube";

        const thumbnail =
            `https://img.youtube.com/vi/${id}/maxresdefault.jpg`;

        return res.json({
            success: true,
            id,
            title,
            author,
            thumbnail,
            url: youtubeUrl
        });

    } catch (error) {
        console.error(
            "getVideoInfo error:",
            error.response?.status || error.message
        );

        return res.status(502).json({
            error: "Unable to retrieve video information."
        });
    }
});

// -------------------------
// Video download
// -------------------------

app.get("/api/download/video", async (req, res) => {
    const input = req.query.id;

    const id = getYouTubeId(input);

    if (!id) {
        return res.status(400).json({
            error: "Invalid YouTube URL or video ID."
        });
    }

    /*
     * Connect your authorized media provider here.
     *
     * Do not put an API key directly in this file.
     * Use an environment variable instead.
     */

    return res.status(501).json({
        error: "Video downloading is not configured.",
        message:
            "Connect an authorized media provider/API to enable video downloads.",
        id
    });
});

// -------------------------
// Audio download
// -------------------------

app.get("/api/download/audio", async (req, res) => {
    const input = req.query.id;

    const id = getYouTubeId(input);

    if (!id) {
        return res.status(400).json({
            error: "Invalid YouTube URL or video ID."
        });
    }

    /*
     * Connect your authorized media provider here.
     */

    return res.status(501).json({
        error: "Audio downloading is not configured.",
        message:
            "Connect an authorized media provider/API to enable audio downloads.",
        id
    });
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
// Frontend fallback
// -------------------------

app.get("/{*splat}", (req, res) => {
    res.sendFile(
        path.join(__dirname, "public", "index.html")
    );
});

// -------------------------
// Error handler
// -------------------------

app.use((err, req, res, next) => {
    console.error("Server error:", err);

    res.status(500).json({
        error: "Internal server error."
    });
});

// -------------------------
// Start server
// -------------------------

app.listen(PORT, "0.0.0.0", () => {
    console.log(`TubeSaver running on port ${PORT}`);
});