# Playwright MCP Humanized

A fork of [microsoft/playwright-mcp](https://github.com/microsoft/playwright-mcp) with human-like mouse movements using [ghost-cursor-playwright](https://github.com/reaz1995/ghost-cursor-playwright).

## What's Different

This fork patches the Playwright mouse and locator methods to use Bezier curves and randomized movements that mimic human behavior:

- **Human-like mouse movements**: Uses Bezier curves instead of straight lines
- **Randomized click positions**: Clicks at random points within elements instead of dead center
- **Variable movement speed**: Based on distance and target size (Fitts's Law)
- **Natural overshoot and correction**: Mimics how humans slightly overshoot targets

## Installation

```bash
npm install @playwright/mcp-humanized
```

## Usage

### As MCP Server

Same as the original playwright-mcp:

```json
{
  "mcpServers": {
    "playwright-humanized": {
      "command": "npx",
      "args": ["@playwright/mcp-humanized@latest"]
    }
  }
}
```

### With Chrome Extension

Works with the `--extension` flag to connect to your existing browser:

```json
{
  "mcpServers": {
    "playwright-humanized-extension": {
      "command": "npx",
      "args": ["@playwright/mcp-humanized@latest", "--extension"],
      "env": {
        "PLAYWRIGHT_MCP_EXTENSION_TOKEN": "your-token-here"
      }
    }
  }
}
```

## How It Works

The humanization patches the following Playwright methods at runtime:

### Mouse Methods
- `page.mouse.move()` - Uses ghost-cursor for Bezier curve paths
- `page.mouse.click()` - Adds natural delays between down/up

### Locator Methods
- `locator.click()` - Moves to random point within element before clicking
- `locator.dblclick()` - Adds delay between clicks
- `locator.hover()` - Uses human-like movement

## Configuration

The humanization behavior can be tuned in `humanize.js`:

```javascript
const cursor = await createCursor(page, {
  overshootSpread: 10,    // Randomness in path
  overshootRadius: 120,   // Overshoot distance
});
```

## License

Apache-2.0 (same as original playwright-mcp)
