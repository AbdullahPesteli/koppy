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
    },
});
