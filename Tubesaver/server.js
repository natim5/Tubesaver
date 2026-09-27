const express = require("express");
const axios = require("axios");
const path = require("path");

const app = express();

const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: false, limit: "10kb" }));

app.use(express.static(path.join(__dirname, "public")));

function validYouTubeId(id) {
    return typeof id === "string" &&
        /^[A-Za-z0-9_-]{11}$/.test(id);
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

app.get("/api/getVideoInfo", async (req, res) => {
    const id = req.query.id;

    if (!validYouTubeId(id)) {
        return res.status(400).json({
            error: "Invalid YouTube video ID."
        });
    }

    try {
        const youtubeUrl =
            https://www.youtube.com/watch?v=${encodeURIComponent(id)};

        const response = await axios.get(
            "https://www.youtube.com/oembed",
            {
                params: {
                    url: youtubeUrl,
                    format: "json"
                },
                timeout: 5000
            }
        );

        return res.json({
            title: response.data.title || "YouTube Video",
            author: response.data.author_name || "YouTube",
            thumbnail: https://img.youtube.com/vi/${id}/maxresdefault.jpg
        });

    } catch (error) {
        return res.status(502).json({
            error: "Unable to retrieve video information."
        });
    }
});

app.get("/api/download/video", (req, res) => {
    const id = req.query.id;

    if (!validYouTubeId(id)) {
        return res.status(400).json({
            error: "Invalid YouTube video ID."
        });
    }

    return res.status(501).json({
        error: "Video downloading is not configured.",
        message:
            "Connect an authorized media provider/API to enable this feature."
    });
});

app.get("/api/download/audio", (req, res) => {
    const id = req.query.id;

    if (!validYouTubeId(id)) {
        return res.status(400).json({
            error: "Invalid YouTube video ID."
        });
    }

    return res.status(501).json({
        error: "Audio downloading is not configured.",
        message:
            "Connect an authorized media provider/API to enable this feature."
    });
});

app.get("/api/health", (req, res) => {
    res.json({
        status: "ok"
    });
});

// Serve index.html for other routes
app.get("/{*splat}", (req, res) => {
    res.sendFile(
        path.join(__dirname, "public", "index.html")
    );
});

// Error handler
app.use((err, req, res, next) => {
    console.error(err);

    res.status(500).json({
        error: "Internal server error."
    });
});

app.listen(PORT, "0.0.0.0", () => {
    console.log(TubeSaver running on port ${PORT});
});
