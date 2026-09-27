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
            `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`;

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
            thumbnail: `https://img.youtube.com/vi/${id}/maxresdefault.jpg`
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

app.get("*", (req, res) => {
    res.sendFile(
        path.join(__dirname, "public", "index.html")
    );
});

app.use((err, req, res, next) => {
    console.error(err);

    res.status(500).json({npn@n-Lenovo-ideapad-120S-11IAP:~/Desktop/Tubesaver$ npm install
        npm error code EJSONPARSE
        npm error JSON.parse Invalid package.json: JSONParseError: Unexpected end of JSON input while parsing empty string
        npm error JSON.parse Failed to parse JSON data.
        npm error JSON.parse Note: package.json must be actual JSON, not just JavaScript.
        npm error A complete log of this run can be found in: /home/n/.npm/_logs/2026-09-27T11_53_58_932Z-debug-0.log
        n@n-Lenovo-ideapad-120S-11IAP:~/Desktop/Tubesaver$ npm start
        npm error code EJSONPARSE
        npm error JSON.parse Invalid package.json: JSONParseError: Unexpected end of JSON input while parsing empty string
        npm error JSON.parse Failed to parse JSON data.
        npm error JSON.parse Note: package.json must be actual JSON, not just JavaScript.
        npm error A complete log of this run can be found in: /home/n/.npm/_logs/2026-09-27T11_54_15_155Z-debug-0.log
        n@n-Lenovo-ideapad-120S-11IAP:~/Desktop/Tubesaver$ git init
        hint: Using 'master' as the name for the initial branch. This default branch name
        hint: is subject to change. To configure the initial branch name to use in all
        hint: of your new repositories, which will suppress this warning, call:
        hint: 
        hint:   git config --global init.defaultBranch <name>
        hint: 
        hint: Names commonly chosen instead of 'master' are 'main', 'trunk' and
        hint: 'development'. The just-created branch can be renamed via this command:
        hint: 
        hint:   git branch -m <name>
        Initialized empty Git repository in /home/n/Desktop/Tubesaver/.git/
        n@n-Lenovo-ideapad-120S-11IAP:~/Desktop/Tubesaver$ git branch -M main
        n@n-Lenovo-ideapad-120S-11IAP:~/Desktop/Tubesaver$ git status
        On branch main
        
        No commits yet
        
        Untracked files:
          (use "git add <file>..." to include in what will be committed)
                .gitignore
                package.json
                public/
                server.js
        
        nothing added to commit but untracked files present (use "git add" to track)
        n@n-Lenovo-ideapad-120S-11IAP:~/Desktop/Tubesaver$ npm install
        npm error code EJSONPARSE
        npm error JSON.parse Invalid package.json: JSONParseError: Unexpected end of JSON input while parsing empty string
        npm error JSON.parse Failed to parse JSON data.
        npm error JSON.parse Note: package.json must be actual JSON, not just JavaScript.
        npm error A complete log of this run can be found in: /home/n/.npm/_logs/2026-09-27T12_11_25_375Z-debug-0.log
        n@n-Lenovo-ideapad-120S-11IAP:~/Desktop/Tubesaver$ npm install
        
        added 68 packages, and audited 69 packages in 51s
        
        16 packages are looking for funding
          run `npm fund` for details
        
        found 0 vulnerabilities
        n@n-Lenovo-ideapad-120S-11IAP:~/Desktop/Tubesaver$ npm install
        npm warn ancient lockfile
        npm warn ancient lockfile The package-lock.json file was created with an old version of npm,
        npm warn ancient lockfile so supplemental metadata must be fetched from the registry.
        npm warn ancient lockfile
        npm warn ancient lockfile This is a one-time fix-up, please be patient...
        npm warn ancient lockfile
        
        up to date, audited 69 packages in 10s
        
        16 packages are looking for funding
          run `npm fund` for details
        
        found 0 vulnerabilities
        n@n-Lenovo-ideapad-120S-11IAP:~/Desktop/Tubesaver$ npm start
        
        > tubesaver@1.0.0 start
        > node server.js
        
        /home/n/Desktop/Tubesaver/server.js:77
                    https://www.youtube.com/watch?v=${encodeURIComponent(id)};
                         ^
        
        SyntaxError: Unexpected token ':'
            at wrapSafe (node:internal/modules/cjs/loader:1804:18)
            at Module._compile (node:internal/modules/cjs/loader:1845:20)
            at Object..js (node:internal/modules/cjs/loader:2002:10)
            at Module.load (node:internal/modules/cjs/loader:1594:32)
            at Module._load (node:internal/modules/cjs/loader:1396:12)
            at wrapModuleLoad (node:internal/modules/cjs/loader:255:19)
            at Module.executeUserEntryPoint [as runMain] (node:internal/modules/run_main:154:5)
            at node:internal/main/run_main_module:33:47
        
        Node.js v24.18.0
        n@n-Lenovo-ideapad-120S-11IAP:~/Desktop/Tubesaver$ npm start
        
        > tubesaver@1.0.0 start
        > node server.js
        
        /home/n/Desktop/Tubesaver/server.js:77
                    https://www.youtube.com/watch?v=${encodeURIComponent(id)};
                         ^
        
        SyntaxError: Unexpected token ':'
            at wrapSafe (node:internal/modules/cjs/loader:1804:18)
            at Module._compile (node:internal/modules/cjs/loader:1845:20)
            at Object..js (node:internal/modules/cjs/loader:2002:10)
            at Module.load (node:internal/modules/cjs/loader:1594:32)
            at Module._load (node:internal/modules/cjs/loader:1396:12)
            at wrapModuleLoad (node:internal/modules/cjs/loader:255:19)
            at Module.executeUserEntryPoint [as runMain] (node:internal/modules/run_main:154:5)
            at node:internal/main/run_main_module:33:47
        
        Node.js v24.18.0
        n@n-Lenovo-ideapad-120S-11IAP:~/Desktop/Tubesaver$ npm start
        
        > tubesaver@1.0.0 start
        > node server.js
        
        /home/n/Desktop/Tubesaver/server.js:77
                    https://www.youtube.com/watch?v=${encodeURIComponent(id)};
                         ^
        
        SyntaxError: Unexpected token ':'
            at wrapSafe (node:internal/modules/cjs/loader:1804:18)
            at Module._compile (node:internal/modules/cjs/loader:1845:20)
            at Object..js (node:internal/modules/cjs/loader:2002:10)
            at Module.load (node:internal/modules/cjs/loader:1594:32)
            at Module._load (node:internal/modules/cjs/loader:1396:12)
            at wrapModuleLoad (node:internal/modules/cjs/loader:255:19)
            at Module.executeUserEntryPoint [as runMain] (node:internal/modules/run_main:154:5)
            at node:internal/main/run_main_module:33:47
        
        Node.js v24.18.0
        n@n-Lenovo-ideapad-120S-11IAP:~/Desktop/Tubesaver$ npm start
        
        > tubesaver@1.0.0 start
        > node server.js
        
        /home/n/Desktop/Tubesaver/server.js:94
                        https://img.youtube.com/vi/${id}/maxresdefault.jpg
                             ^
        
        SyntaxError: Unexpected token ':'
            at wrapSafe (node:internal/modules/cjs/loader:1804:18)
            at Module._compile (node:internal/modules/cjs/loader:1845:20)
            at Object..js (node:internal/modules/cjs/loader:2002:10)
            at Module.load (node:internal/modules/cjs/loader:1594:32)
            at Module._load (node:internal/modules/cjs/loader:1396:12)
            at wrapModuleLoad (node:internal/modules/cjs/loader:255:19)
            at Module.executeUserEntryPoint [as runMain] (node:internal/modules/run_main:154:5)
            at node:internal/main/run_main_module:33:47
        
        Node.js v24.18.0
        n@n-Lenovo-ideapad-120S-11IAP:~/Desktop/Tubesaver$ npm install
        
        up to date, audited 69 packages in 4s
        
        16 packages are looking for funding
          run `npm fund` for details
        
        found 0 vulnerabilities
        n@n-Lenovo-ideapad-120S-11IAP:~/Desktop/Tubesaver$ node server.js
        /home/n/Desktop/Tubesaver/server.js:94
                        https://img.youtube.com/vi/${id}/maxresdefault.jpg
                             ^
        
        SyntaxError: Unexpected token ':'
            at wrapSafe (node:internal/modules/cjs/loader:1804:18)
            at Module._compile (node:internal/modules/cjs/loader:1845:20)
            at Object..js (node:internal/modules/cjs/loader:2002:10)
            at Module.load (node:internal/modules/cjs/loader:1594:32)
            at Module._load (node:internal/modules/cjs/loader:1396:12)
            at wrapModuleLoad (node:internal/modules/cjs/loader:255:19)
            at Module.executeUserEntryPoint [as runMain] (node:internal/modules/run_main:154:5)
            at node:internal/main/run_main_module:33:47
        
        Node.js v24.18.0
        n@n-Lenovo-ideapad-120S-11IAP:~/Desktop/Tubesaver$ node server.js
        /home/n/Desktop/Tubesaver/server.js:94
                        https://img.youtube.com/vi/${id}/maxresdefault.jpg
                             ^
        
        SyntaxError: Unexpected token ':'
            at wrapSafe (node:internal/modules/cjs/loader:1804:18)
            at Module._compile (node:internal/modules/cjs/loader:1845:20)
            at Object..js (node:internal/modules/cjs/loader:2002:10)
            at Module.load (node:internal/modules/cjs/loader:1594:32)
            at Module._load (node:internal/modules/cjs/loader:1396:12)
            at wrapModuleLoad (node:internal/modules/cjs/loader:255:19)
            at Module.executeUserEntryPoint [as runMain] (node:internal/modules/run_main:154:5)
            at node:internal/main/run_main_module:33:47
        
        Node.js v24.18.0
        n@n-Lenovo-ideapad-120S-11IAP:~/Desktop/Tubesaver$ npm install
        
        up to date, audited 69 packages in 4s
        
        16 packages are looking for funding
          run `npm fund` for details
        
        found 0 vulnerabilities
        n@n-Lenovo-ideapad-120S-11IAP:~/Desktop/Tubesaver$ node server.js
        /home/n/Desktop/Tubesaver/server.js:94
                        https://img.youtube.com/vi/${id}/maxresdefault.jpg
                             ^
        
        SyntaxError: Unexpected token ':'
            at wrapSafe (node:internal/modules/cjs/loader:1804:18)
            at Module._compile (node:internal/modules/cjs/loader:1845:20)
            at Object..js (node:internal/modules/cjs/loader:2002:10)
            at Module.load (node:internal/modules/cjs/loader:1594:32)
            at Module._load (node:internal/modules/cjs/loader:1396:12)
            at wrapModuleLoad (node:internal/modules/cjs/loader:255:19)
            at Module.executeUserEntryPoint [as runMain] (node:internal/modules/run_main:154:5)
            at node:internal/main/run_main_module:33:47
        
        Node.js v24.18.0
        n@n-Lenovo-ideapad-120S-11IAP:~/Desktop/Tubesaver$ node server.js
        /home/n/Desktop/Tubesaver/server.js:94
                        https://img.youtube.com/vi/${id}/maxresdefault.jpg
                             ^
        
        SyntaxError: Unexpected token ':'
            at wrapSafe (node:internal/modules/cjs/loader:1804:18)
            at Module._compile (node:internal/modules/cjs/loader:1845:20)
            at Object..js (node:internal/modules/cjs/loader:2002:10)
            at Module.load (node:internal/modules/cjs/loader:1594:32)
            at Module._load (node:internal/modules/cjs/loader:1396:12)
            at wrapModuleLoad (node:internal/modules/cjs/loader:255:19)
            at Module.executeUserEntryPoint [as runMain] (node:internal/modules/run_main:154:5)
            at node:internal/main/run_main_module:33:47
        
        Node.js v24.18.0
        n@n-Lenovo-ideapad-120S-11IAP:~/Desktop/Tubesaver$ node server.js
        /home/n/Desktop/Tubesaver/server.js:94
                        https://img.youtube.com/vi/${id}/maxresdefault.jpg
                             ^
        
        SyntaxError: Unexpected token ':'
            at wrapSafe (node:internal/modules/cjs/loader:1804:18)
            at Module._compile (node:internal/modules/cjs/loader:1845:20)
            at Object..js (node:internal/modules/cjs/loader:2002:10)
            at Module.load (node:internal/modules/cjs/loader:1594:32)
            at Module._load (node:internal/modules/cjs/loader:1396:12)
            at wrapModuleLoad (node:internal/modules/cjs/loader:255:19)
            at Module.executeUserEntryPoint [as runMain] (node:internal/modules/run_main:154:5)
            at node:internal/main/run_main_module:33:47
        
        Node.js v24.18.0
        n@n-Lenovo-ideapad-120S-11IAP:~/Desktop/Tubesaver$ node server.js
        /home/n/Desktop/Tubesaver/server.js:94
                        https://img.youtube.com/vi/${id}/maxresdefault.jpg
                             ^
        
        SyntaxError: Unexpected token ':'
            at wrapSafe (node:internal/modules/cjs/loader:1804:18)
            at Module._compile (node:internal/modules/cjs/loader:1845:20)
            at Object..js (node:internal/modules/cjs/loader:2002:10)
            at Module.load (node:internal/modules/cjs/loader:1594:32)
            at Module._load (node:internal/modules/cjs/loader:1396:12)
            at wrapModuleLoad (node:internal/modules/cjs/loader:255:19)
            at Module.executeUserEntryPoint [as runMain] (node:internal/modules/run_main:154:5)
            at node:internal/main/run_main_module:33:47
        
        Node.js v24.18.0
        n@n-Lenovo-ideapad-120S-11IAP:~/Desktop/Tubesaver$ node server.js
        /home/n/Desktop/Tubesaver/server.js:90
                rreturn res.json({
                        ^^^
        
        SyntaxError: Unexpected identifier 'res'
            at wrapSafe (node:internal/modules/cjs/loader:1804:18)
            at Module._compile (node:internal/modules/cjs/loader:1845:20)
            at Object..js (node:internal/modules/cjs/loader:2002:10)
            at Module.load (node:internal/modules/cjs/loader:1594:32)
            at Module._load (node:internal/modules/cjs/loader:1396:12)
            at wrapModuleLoad (node:internal/modules/cjs/loader:255:19)
            at Module.executeUserEntryPoint [as runMain] (node:internal/modules/run_main:154:5)
            at node:internal/main/run_main_module:33:47
        
        Node.js v24.18.0
        n@n-Lenovo-ideapad-120S-11IAP:~/Desktop/Tubesaver$ node server.js
        /home/n/Desktop/Tubesaver/server.js:156
            console.log(TubeSaver running on port ${PORT});
                        ^^^^^^^^^
        
        SyntaxError: missing ) after argument list
            at wrapSafe (node:internal/modules/cjs/loader:1804:18)
            at Module._compile (node:internal/modules/cjs/loader:1845:20)
            at Object..js (node:internal/modules/cjs/loader:2002:10)
            at Module.load (node:internal/modules/cjs/loader:1594:32)
            at Module._load (node:internal/modules/cjs/loader:1396:12)
            at wrapModuleLoad (node:internal/modules/cjs/loader:255:19)
            at Module.executeUserEntryPoint [as runMain] (node:internal/modules/run_main:154:5)
            at node:internal/main/run_main_module:33:47
        
        Node.js v24.18.0
        n@n-Lenovo-ideapad-120S-11IAP:~/Desktop/Tubesaver$ node server.js
        node:internal/modules/cjs/loader:1520
          throw err;
          ^
        
        Error: Cannot find module 'axios'
        Require stack:
        - /home/n/Desktop/Tubesaver/server.js
            at Module._resolveFilename (node:internal/modules/cjs/loader:1517:15)
            at wrapResolveFilename (node:internal/modules/cjs/loader:1071:27)
            at defaultResolveImplForCJSLoading (node:internal/modules/cjs/loader:1095:10)
            at resolveForCJSWithHooks (node:internal/modules/cjs/loader:1122:12)
            at Module._load (node:internal/modules/cjs/loader:1294:5)
            at wrapModuleLoad (node:internal/modules/cjs/loader:255:19)
            at Module.require (node:internal/modules/cjs/loader:1617:12)
            at require (node:internal/modules/helpers:153:16)
            at Object.<anonymous> (/home/n/Desktop/Tubesaver/server.js:2:15)
            at Module._compile (node:internal/modules/cjs/loader:1871:14) {
          code: 'MODULE_NOT_FOUND',
          requireStack: [ '/home/n/Desktop/Tubesaver/server.js' ]
        }
        
        Node.js v24.18.0
        n@n-Lenovo-ideapad-120S-11IAP:~/Desktop/Tubesaver$ npm install axios
        
        added 15 packages, and audited 84 packages in 22s
        
        18 packages are looking for funding
          run `npm fund` for details
        
        found 0 vulnerabilities
        n@n-Lenovo-ideapad-120S-11IAP:~/Desktop/Tubesaver$ node server.js
        node:events:487
              throw er; // Unhandled 'error' event
              ^
        
        Error: listen EADDRINUSE: address already in use 0.0.0.0:3000
            at Server.setupListenHandle [as _listen2] (node:net:2009:16)
            at listenInCluster (node:net:2066:12)
            at node:net:2275:7
            at process.processTicksAndRejections (node:internal/process/task_queues:90:21)
        Emitted 'error' event on Server instance at:
            at emitErrorNT (node:net:2045:8)
            at process.processTicksAndRejections (node:internal/process/task_queues:90:21) {
          code: 'EADDRINUSE',
          errno: -98,
          syscall: 'listen',
        error: "Internal server error."
    });
});

app.listen(PORT, "0.0.0.0", () => {
    console.log(`TubeSaver running on port ${PORT}`);
});