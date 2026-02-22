"use strict";

const { humanizeMouse, humanizeLocator } = require('./humanize');

const patchedPlaywrightModules = new WeakSet();
const patchedBrowserTypes = new WeakSet();
const patchedBrowsers = new WeakSet();
const patchedContexts = new WeakSet();
const patchedPages = new WeakSet();

function patchBrowserType(browserType) {
  if (!browserType || patchedBrowserTypes.has(browserType)) {
    return;
  }
  patchedBrowserTypes.add(browserType);

  if (typeof browserType.connectOverCDP === 'function') {
    const originalConnectOverCDP = browserType.connectOverCDP.bind(browserType);
    browserType.connectOverCDP = async function(...args) {
      const browser = await originalConnectOverCDP(...args);
      patchBrowser(browser);
      return browser;
    };
  }

  if (typeof browserType.launch === 'function') {
    const originalLaunch = browserType.launch.bind(browserType);
    browserType.launch = async function(...args) {
      const browser = await originalLaunch(...args);
      patchBrowser(browser);
      return browser;
    };
  }

  if (typeof browserType.launchPersistentContext === 'function') {
    const originalLaunchPersistentContext = browserType.launchPersistentContext.bind(browserType);
    browserType.launchPersistentContext = async function(...args) {
      const context = await originalLaunchPersistentContext(...args);
      patchContext(context);
      return context;
    };
  }

  if (typeof browserType.connect === 'function') {
    const originalConnect = browserType.connect.bind(browserType);
    browserType.connect = async function(...args) {
      const browser = await originalConnect(...args);
      patchBrowser(browser);
      return browser;
    };
  }
}

function patchPlaywrightModule(moduleName) {
  try {
    const playwright = require(moduleName);
    if (patchedPlaywrightModules.has(playwright)) {
      return;
    }
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
  if (!browser || patchedBrowsers.has(browser)) {
    return;
  }
  patchedBrowsers.add(browser);

  const originalNewContext = browser.newContext.bind(browser);
  browser.newContext = async function(...args) {
    const context = await originalNewContext(...args);
    patchContext(context);
    return context;
  };

  if (typeof browser.newPage === 'function') {
    const originalNewPage = browser.newPage.bind(browser);
    browser.newPage = async function(...args) {
      const page = await originalNewPage(...args);
      patchPage(page);
      return page;
    };
  }

  for (const context of browser.contexts()) {
    patchContext(context);
  }
}

function patchContext(context) {
  if (!context || patchedContexts.has(context)) {
    return;
  }
  patchedContexts.add(context);

  for (const page of context.pages()) {
    patchPage(page);
  }

  context.on('page', (page) => {
    patchPage(page);
  });

  const originalNewPage = context.newPage.bind(context);
  context.newPage = async function(...args) {
    const page = await originalNewPage(...args);
    patchPage(page);
    return page;
  };
}

function patchPage(page) {
  if (!page || patchedPages.has(page)) {
    return;
  }
  patchedPages.add(page);

  humanizeMouse(page);
  
  const methodsToPatch = [
    'locator',
    'getByRole',
    'getByText',
    'getByLabel',
    'getByPlaceholder',
    'getByTestId',
    'getByAltText',
    'getByTitle',
  ];

  for (const methodName of methodsToPatch) {
    if (typeof page[methodName] !== 'function') {
      continue;
    }
    const originalMethod = page[methodName].bind(page);
    page[methodName] = function(...args) {
      const locator = originalMethod(...args);
      humanizeLocator(locator, page);
      return locator;
    };
  }

  if (typeof page.frameLocator === 'function') {
    const originalFrameLocator = page.frameLocator.bind(page);
    page.frameLocator = function(...args) {
      const fl = originalFrameLocator(...args);
      for (const methodName of methodsToPatch) {
        if (typeof fl[methodName] === 'function') {
          const origMethod = fl[methodName].bind(fl);
          fl[methodName] = function(...mArgs) {
            const newLocator = origMethod(...mArgs);
            return humanizeLocator(newLocator, page);
          };
        }
      }
      return fl;
    };
  }
}

module.exports = {
  patchPlaywright,
  patchBrowser,
  patchContext,
  patchPage,
  humanizeMouse,
  humanizeLocator,
};
