# Playwright MCP Humanized 🤖

A 100% drop-in replacement for Microsoft's [@playwright/mcp](https://github.com/microsoft/playwright-mcp) that adds **stealth anti-bot capabilities** to AI agents.

By default, AI agents utilizing Playwright MCP operate completely like bots: cursor movements instantly teleport to coordinates, scrolling happens abruptly via CDP, and typing fills inputs in `0ms`. This gets your agent immediately blocked by Cloudflare, DataDome, PerimeterX, and generic bot protection systems.

This project wraps Playwright's `browser` and `context` at runtime to automatically inject human-like behavior into the MCP layer:

✅ **Curved Mouse Movements:** Injects Bezier-curve cursor paths using `ghost-cursor-playwright`.
✅ **Humanized Typing (`fill()` override):** Types character-by-character with a log-normal distribution (30-150ms per keystroke) + longer pauses at word boundaries.
✅ **Randomized Clicks:** Clicks inside the element's bounding box are varied dynamically.
✅ **Auto-Scroll Fix:** Manual, chunked `mouse.wheel()` scroll-to-reveal overrides Playwright's instantaneous CDP leaps.
✅ **Dropdown Scanning:** `selectOption()` pauses for 150-350ms to simulate the user visually scanning options before clicking.
✅ **Complete Scope Penetration:** The humanized locators recursively propagate through `page.locator()`, `filter()`, `nth()`, and even penetrate `frameLocator()`.

## 🧪 Verified Stealth (Live Test Results)

This library has been tested against the most common bot-detection suites with 100% success:

- **Google reCAPTCHA v2 (Checkbox):** Passed with an instant green checkmark (no image grid popped up), proving successful mouse path spoofing.
- **Google reCAPTCHA v3 (Scores):** Consistently achieves a **0.9 Human Score** (0.0 = Bot, 1.0 = Human).
- **Cloudflare Turnstile:** Bypasses "Managed Challenges" by simulating natural focus and movement patterns.

## 🔌 Using with Playwright Extension (Real Browser Navigation)

One of the most powerful features of this project is its integration with Microsoft's **Playwright Chrome Extension**.

When used with the `--extension` flag, your AI agent (Claude, Codex, OpenCode) doesn't just launch a "clean" headless browser—it **connects to your actual, logged-in Chrome session**. This allows your agent to:
- Navigate and interact with your **existing open tabs**.
- Bypass logins by using your active session cookies.
- Act as a true "copilot" inside your real workspace, but with the added safety of humanized mouse movements so your real account doesn't get flagged.

## ⚡ Setup / Installation

Because this tool shares the same API as `@playwright/mcp`, all you have to do is change the `command` pointing to your MCP configuration in **Claude Desktop, OpenCode, or Cursor**.

### With `npx` (Recommended)

Just change your config command to point to `playwright-mcp-humanized`:

```json
{
  "mcpServers": {
    "playwright-humanized": {
      "command": "npx",
      "args": ["-y", "playwright-mcp-humanized"]
    }
  }
}
```

### With Playwright Bridge Extension (Connect to your real browser session)

If you're using Microsoft's Playwright Chrome Extension to connect to your actively logged-in Chrome session, this works perfectly out-of-the-box! Just pass the `--extension` flag and your token as usual:

```json
{
  "mcpServers": {
    "playwright-extension": {
      "command": "npx",
      "args": [
        "-y",
        "playwright-mcp-humanized",
        "--extension"
      ],
      "env": {
        "PLAYWRIGHT_MCP_EXTENSION_TOKEN": "YOUR_EXTENSION_TOKEN"
      }
    }
  }
}
```

## How It Works

This project **does not** fork the internal protocol engine of Microsoft's MCP server. Doing so would mean missing out on upstream updates to the core MCP layer.

Instead, we **monkey-patch Playwright at runtime**. Before the MCP server initializes:
1. We intercept `playwright.chromium.launch()`, `connect()`, and `connectOverCDP()`.
2. We wrap new `Contexts` and `Pages`.
3. We override the raw `page.mouse` and `page.locator()` APIs with `humanize.js`.
4. The MCP protocol handles standard parsing, while our interceptors translate its final actions into stealthy ones.

## Credits & Dependencies

- Original MCP Protocol Architecture by [Microsoft / playwright-mcp](https://github.com/microsoft/playwright-mcp).
- Mouse humanization algorithms powered by [ghost-cursor-playwright](https://github.com/Xetera/ghost-cursor).

---
*Built out of necessity to stop our AI agents from getting instantly IP banned.*
