# Playwright MCP Humanized - Full Context Document

## Overview

This document contains all context needed to understand and modify the Playwright MCP Humanized project - a fork of Microsoft's playwright-mcp that adds human-like mouse movements for anti-detection purposes.

## Project Goal

Create a drop-in replacement for `@playwright/mcp` that:
1. Adds human-like mouse movements using Bezier curves (via ghost-cursor-playwright)
2. Randomizes click positions within elements
3. Works with `--extension` mode (connecting to logged-in Chrome sessions)
4. Is fully compatible with the existing MCP tool API

## Repository Location

```
/home/njoppi2/projetos/pessoal/playwright-mcp-humanized/
```

Forked from: https://github.com/microsoft/playwright-mcp

## Architecture

### Original playwright-mcp Structure

The official playwright-mcp is a thin wrapper around Playwright's MCP implementation which lives in the main Playwright monorepo:

- `packages/playwright-mcp/cli.js` - Entry point, calls `decorateMCPCommand()` from playwright
- `packages/playwright-mcp/index.js` - Exports `createConnection()` from playwright
- The actual MCP implementation is in `node_modules/playwright/lib/mcp/`:
  - `browser/tools/mouse.js` - Vision capability tools (coordinate-based mouse)
  - `browser/tools/snapshot.js` - Core tools (click, hover, drag using locators)
  - `browser/tools/keyboard.js` - Typing tools
  - `browser/browserContextFactory.js` - Creates browser contexts (launch, CDP connect, etc.)

### Key Insight: How MCP Tools Work

MCP tools use `defineTabTool()` to register actions. For example, `browser_click` in `snapshot.js`:

```javascript
const click = defineTabTool({
  capability: "core",
  schema: { name: 'browser_click', ... },
  handle: async (tab, params, response) => {
    const { locator } = await tab.refLocator(params);
    await locator.click(options);  // <-- Playwright API call
  },
});
```

The `browser_mouse_move_xy` tool in `mouse.js` uses lower-level API:

```javascript
await tab.page.mouse.move(params.x, params.y);  // <-- Direct mouse API
```

### Our Approach: Monkey-Patching at Runtime

Instead of modifying Playwright's source (which is in node_modules), we:

1. **Patch Playwright's browser creation methods** (`launch`, `connectOverCDP`, etc.)
2. **Intercept new page creation** via `context.on('page')` and `context.newPage()`
3. **Replace `page.mouse`** with a humanized wrapper that uses ghost-cursor
4. **Wrap `page.locator()` and related methods** to humanize locator actions

This happens BEFORE the MCP server starts, so all MCP tools automatically use humanized movements.

## Files Created

### 1. `packages/playwright-mcp/humanize.js`

Core humanization logic:

```javascript
"use strict";

const { createCursor } = require('ghost-cursor-playwright');

// WeakMaps/WeakSets for tracking state without memory leaks
const cursors = new WeakMap();           // page -> cursor instance
const cursorPromises = new WeakMap();    // page -> cursor creation promise (race condition prevention)
const cursorPages = new WeakMap();       // page -> proxy page (recursion prevention)
const pageStates = new WeakMap();        // page -> { queue, originalMouse }
const humanizedPages = new WeakSet();    // pages already humanized
const humanizedLocators = new WeakSet(); // locators already humanized

// Queue mouse actions per page to prevent race conditions
function enqueuePageMouseAction(page, fn) {
  const state = getPageState(page);
  const run = state.queue.then(fn, fn);
  state.queue = run.catch(() => {});
  return run;
}

// Create a proxy page that exposes ORIGINAL mouse to ghost-cursor
// This prevents infinite recursion (ghost-cursor calls page.mouse internally)
function getCursorPage(page) {
  if (!cursorPages.has(page)) {
    const cursorPage = new Proxy(page, {
      get(target, prop) {
        if (prop === 'mouse') {
          return getPageState(target).originalMouse || target.mouse;
        }
        const value = Reflect.get(target, prop, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    cursorPages.set(page, cursorPage);
  }
  return cursorPages.get(page);
}

// Thread-safe cursor creation with race condition handling
async function getOrCreateCursor(page) {
  if (cursors.has(page)) return cursors.get(page);
  if (cursorPromises.has(page)) return cursorPromises.get(page);

  const createPromise = createCursor(getCursorPage(page), {
    overshootSpread: 10,    // Randomness in path
    overshootRadius: 120,   // How far to overshoot
    debug: false,           // Don't show visual cursor overlay
  }).then(cursor => {
    cursors.set(page, cursor);
    return cursor;
  }).finally(() => {
    cursorPromises.delete(page);
  });

  cursorPromises.set(page, createPromise);
  return createPromise;
}

// Replace page.mouse with humanized version
function humanizeMouse(page) {
  if (humanizedPages.has(page)) return page;
  humanizedPages.add(page);

  const state = getPageState(page);
  const originalMouse = page.mouse;
  state.originalMouse = originalMouse;

  const humanizedMouse = {
    _original: originalMouse,
    
    async move(x, y, options) {
      return enqueuePageMouseAction(page, async () => {
        try {
          const cursor = await getOrCreateCursor(page);
          await cursor.actions.move({ x, y }, { paddingPercentage: 0 });
        } catch (e) {
          await originalMouse.move(x, y, options);
        }
      });
    },

    async click(x, y, options) {
      return enqueuePageMouseAction(page, async () => {
        try {
          const cursor = await getOrCreateCursor(page);
          await cursor.actions.move({ x, y });
        } catch (e) {
          await originalMouse.move(x, y);
        }
        await originalMouse.click(x, y, options);
      });
    },
    // ... down, up, dblclick, wheel similarly wrapped
  };

  Object.defineProperty(page, 'mouse', {
    value: humanizedMouse,
    writable: false,
    configurable: true
  });

  return page;
}

// Wrap locator methods to move to random point before clicking
function humanizeLocator(locator, page) {
  if (humanizedLocators.has(locator)) return locator;
  humanizedLocators.add(locator);

  const originalClick = locator.click.bind(locator);
  // ... store originals

  async function getRandomPointInLocator() {
    const box = await locator.boundingBox();
    if (!box) return null;
    const cursor = await getOrCreateCursor(page);
    // Random point in 20-80% of element dimensions
    const x = box.x + box.width * (0.2 + Math.random() * 0.6);
    const y = box.y + box.height * (0.2 + Math.random() * 0.6);
    return { x, y, cursor };
  }

  locator.click = async function(options) {
    return enqueuePageMouseAction(page, async () => {
      try {
        const result = await getRandomPointInLocator();
        if (result) {
          const { x, y, cursor } = result;
          await cursor.actions.move({ x, y });
          await new Promise(r => setTimeout(r, 20 + Math.random() * 80)); // Natural delay
          await getPageState(page).originalMouse.click(x, y, options);
          return;
        }
      } catch (e) {}
      await originalClick(options);
    });
  };

  // Similar for dblclick and hover
  return locator;
}

module.exports = { humanizeMouse, humanizeLocator, getOrCreateCursor };
```

### 2. `packages/playwright-mcp/patch.js`

Monkey-patches Playwright to intercept browser/context/page creation:

```javascript
"use strict";

const { humanizeMouse, humanizeLocator } = require('./humanize');

// Idempotence guards - prevent double-patching
const patchedPlaywrightModules = new WeakSet();
const patchedBrowserTypes = new WeakSet();
const patchedBrowsers = new WeakSet();
const patchedContexts = new WeakSet();
const patchedPages = new WeakSet();

function patchBrowserType(browserType) {
  if (!browserType || patchedBrowserTypes.has(browserType)) return;
  patchedBrowserTypes.add(browserType);

  // Wrap launch, connectOverCDP, connect, launchPersistentContext
  if (typeof browserType.connectOverCDP === 'function') {
    const original = browserType.connectOverCDP.bind(browserType);
    browserType.connectOverCDP = async function(...args) {
      const browser = await original(...args);
      patchBrowser(browser);
      return browser;
    };
  }
  // ... similar for launch, connect, launchPersistentContext
}

function patchPlaywrightModule(moduleName) {
  try {
    const playwright = require(moduleName);
    if (patchedPlaywrightModules.has(playwright)) return;
    patchedPlaywrightModules.add(playwright);

    patchBrowserType(playwright.chromium);
    patchBrowserType(playwright.firefox);
    patchBrowserType(playwright.webkit);
  } catch (e) {
    console.error(`Failed to patch ${moduleName}:`, e);
  }
}

function patchPlaywright() {
  patchPlaywrightModule('playwright-core');
  patchPlaywrightModule('playwright');
}

function patchBrowser(browser) {
  if (!browser || patchedBrowsers.has(browser)) return;
  patchedBrowsers.add(browser);

  // Wrap browser.newContext()
  const originalNewContext = browser.newContext.bind(browser);
  browser.newContext = async function(...args) {
    const context = await originalNewContext(...args);
    patchContext(context);
    return context;
  };

  // Patch existing contexts
  for (const context of browser.contexts()) {
    patchContext(context);
  }
}

function patchContext(context) {
  if (!context || patchedContexts.has(context)) return;
  patchedContexts.add(context);

  // Patch existing pages
  for (const page of context.pages()) {
    patchPage(page);
  }

  // Listen for new pages
  context.on('page', (page) => {
    patchPage(page);
  });

  // Wrap context.newPage()
  const originalNewPage = context.newPage.bind(context);
  context.newPage = async function(...args) {
    const page = await originalNewPage(...args);
    patchPage(page);
    return page;
  };
}

function patchPage(page) {
  if (!page || patchedPages.has(page)) return;
  patchedPages.add(page);

  humanizeMouse(page);
  
  // Wrap all locator factory methods
  for (const methodName of [
    'locator', 'getByRole', 'getByText', 'getByLabel',
    'getByPlaceholder', 'getByTestId', 'getByAltText', 'getByTitle',
  ]) {
    if (typeof page[methodName] !== 'function') continue;
    const originalMethod = page[methodName].bind(page);
    page[methodName] = function(...args) {
      const locator = originalMethod(...args);
      humanizeLocator(locator, page);
      return locator;
    };
  }
}

module.exports = { patchPlaywright, patchBrowser, patchContext, patchPage };
```

### 3. `packages/playwright-mcp/cli-humanized.js`

Entry point that patches before starting MCP:

```javascript
#!/usr/bin/env node
const { patchPlaywright } = require('./patch');

// MUST patch before importing Playwright MCP modules
patchPlaywright();

const { program } = require('playwright-core/lib/utilsBundle');
const { decorateMCPCommand } = require('playwright/lib/mcp/program');
const packageJSON = require('./package.json');

const p = program.version('Version ' + packageJSON.version)
  .name('Playwright MCP (Humanized)');
decorateMCPCommand(p, packageJSON.version);
void program.parseAsync(process.argv);
```

### 4. `packages/playwright-mcp/package.json` (modified)

```json
{
  "name": "@playwright/mcp-humanized",
  "version": "0.0.68",
  "description": "Playwright Tools for MCP with human-like mouse movements",
  "bin": {
    "playwright-mcp": "cli-humanized.js",
    "playwright-mcp-humanized": "cli-humanized.js"
  },
  "dependencies": {
    "ghost-cursor-playwright": "^2.1.0",
    "playwright": "1.59.0-alpha-1771104257000",
    "playwright-core": "1.59.0-alpha-1771104257000"
  }
}
```

## Issues Found by Codex and Fixed

### Critical: Infinite Recursion
**Problem:** ghost-cursor internally calls `page.mouse.move()`, which we had replaced with a wrapper that calls ghost-cursor → infinite loop.

**Solution:** Create a proxy page for ghost-cursor that returns the ORIGINAL mouse:
```javascript
function getCursorPage(page) {
  const cursorPage = new Proxy(page, {
    get(target, prop) {
      if (prop === 'mouse') {
        return getPageState(target).originalMouse; // NOT the wrapped one
      }
      // ...
    },
  });
}
```

### High: Non-Idempotent Patching
**Problem:** Calling `patchBrowser()` twice would wrap methods twice, creating nested wrappers.

**Solution:** WeakSet guards at every level:
```javascript
const patchedBrowsers = new WeakSet();
function patchBrowser(browser) {
  if (patchedBrowsers.has(browser)) return;
  patchedBrowsers.add(browser);
  // ...
}
```

### High: Race Condition in Cursor Creation
**Problem:** Two concurrent `getOrCreateCursor(page)` calls could create two cursors.

**Solution:** Cache the creation promise:
```javascript
if (cursorPromises.has(page)) return cursorPromises.get(page);
const createPromise = createCursor(...).finally(() => {
  cursorPromises.delete(page);
});
cursorPromises.set(page, createPromise);
```

### Medium: Invalid Browser Event
**Problem:** Original code used `browser.on('context')` but Playwright Browser doesn't emit that event.

**Solution:** Removed. Instead, wrap `browser.newContext()` and patch existing contexts via `browser.contexts()`.

### Medium: Click Ignored Playwright Options
**Problem:** Custom `click()` implementation ignored `delay`, `clickCount`, etc.

**Solution:** Delegate actual click to Playwright's original method:
```javascript
await cursor.actions.move({ x, y });  // Human-like movement first
await originalMouse.click(x, y, options);  // Then use Playwright's click
```

### Medium: Debug Overlay Visible
**Problem:** ghost-cursor defaults `debug: true`, showing a visual cursor overlay.

**Solution:** Set `debug: false` in `createCursor()` options.

## Test Results

Headless test (`node test-humanized.js`) passed:

```
1. Testing page.mouse.move()...
   Mouse events captured: 66
   X range: 809 to 1268 (variance: 459)
   Y range: 257 to 592 (variance: 335)
   Curved path detected: ✅ YES (human-like)

2. Testing locator.click()...
   Click success: ✅

3. Testing locator.hover()...
   Hover success: ✅

4. Testing humanized click coordinates...
   Click coordinates: 145,125 | 317,163 | 279,170
   Randomized positions: ✅ YES (human-like)
```

## Usage Configuration

### Basic MCP Server
```json
{
  "mcpServers": {
    "playwright-humanized": {
      "command": "node",
      "args": ["/path/to/playwright-mcp-humanized/packages/playwright-mcp/cli-humanized.js"]
    }
  }
}
```

### With --extension (connect to logged-in Chrome)
```json
{
  "mcpServers": {
    "playwright-humanized-extension": {
      "command": "node",
      "args": ["/path/to/playwright-mcp-humanized/packages/playwright-mcp/cli-humanized.js", "--extension"],
      "env": {
        "PLAYWRIGHT_MCP_EXTENSION_TOKEN": "your-token-here"
      }
    }
  }
}
```

### OpenCode Format
```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "playwright-humanized": {
      "type": "local",
      "command": ["node", "/path/to/playwright-mcp-humanized/packages/playwright-mcp/cli-humanized.js"],
      "enabled": true
    }
  }
}
```

## Known Limitations

1. **Chained locators not humanized**: `page.locator().locator()` - only page-level locator methods are wrapped
2. **Silent error swallowing**: Errors in humanization are caught silently (for robustness)
3. **No humanized typing yet**: Only mouse movements are humanized, not keyboard input
4. **Headless testing limited**: Can't visually verify movements without a display

## ghost-cursor-playwright API Reference

```javascript
const { createCursor } = require('ghost-cursor-playwright');

const cursor = await createCursor(page, {
  overshootSpread: 10,    // Randomness in Bezier control points
  overshootRadius: 120,   // Max overshoot distance
  debug: false,           // Show visual cursor overlay
});

// Move to coordinates
await cursor.actions.move({ x: 500, y: 300 });

// Move to element (by selector)
await cursor.actions.move('#my-button', { paddingPercentage: 20 });

// Click at current position
await cursor.actions.click({
  waitBeforeClick: [100, 500],    // Random delay before click
  waitBetweenClick: [20, 50],     // Delay between down/up
  doubleClick: false
});

// Click with target (moves first)
await cursor.actions.click({ target: '#submit-btn' });

// Random movement
await cursor.actions.randomMove(0.5);  // 50% of viewport
```

## Future Improvements

1. Add `--caps=human-cursor` option instead of always-on
2. Humanize keyboard typing with variable delays
3. Add debug logging behind env flag
4. Contribute upstream to microsoft/playwright-mcp
5. Add integration tests

## Dependencies

- `ghost-cursor-playwright@^2.1.0` - Human-like cursor movements
- `playwright@1.59.0-alpha-*` - Browser automation
- `playwright-core@1.59.0-alpha-*` - Playwright core

## File Structure

```
playwright-mcp-humanized/
├── packages/
│   └── playwright-mcp/
│       ├── cli-humanized.js      # NEW: Entry point with patching
│       ├── cli.js                # ORIGINAL: Unmodified entry
│       ├── humanize.js           # NEW: Mouse/locator humanization
│       ├── patch.js              # NEW: Playwright monkey-patching
│       ├── package.json          # MODIFIED: Added dependency, changed name
│       ├── index.js              # ORIGINAL: Unmodified
│       ├── test-humanized.js     # NEW: Headless test script
│       ├── test-linkedin.js      # NEW: LinkedIn visual test
│       └── README-HUMANIZED.md   # NEW: Documentation
├── package.json                  # Root workspace config
└── package-lock.json            # Lockfile with ghost-cursor
```
