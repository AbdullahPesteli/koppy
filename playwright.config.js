const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
    testDir: "./tests/e2e",
    timeout: 30000,
    fullyParallel: false,
    workers: 1,
    reporter: "list",
    use: {
        headless: true,
        channel: "chrome",
        permissions: ["clipboard-read", "clipboard-write"],
        screenshot: "only-on-failure",
        launchOptions: {
            args: [
                // Settings UI lives in a sandboxed data: iframe. As an out-of-process child
                // frame its input is routed via the browser process; under host CPU
                // contention focus/click/keyup get dropped. Keep frames in-process.
                "--disable-site-isolation-trials",
                "--disable-features=IsolateOrigins,site-per-process",
            ],
        },
    },
});
