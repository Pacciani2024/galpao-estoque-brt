module.exports = {
    apps: [
        {
            name: "brt-server",
            script: "server.js",
            cwd: "./",
            watch: false,
            env: {
                NODE_ENV: "production",
                PORT: 3000
            }
        },
        {
            name: "brt-scheduler",
            script: "scheduler.js",
            cwd: "./",
            watch: false,
            autorestart: true
        },
        {
            name: "brt-voice",
            script: "mark_ears.py",
            cwd: "./",
            interpreter: "python3",
            watch: false,
            autorestart: true
        }
    ]
};
