"use strict";

const { createCursor } = require('ghost-cursor-playwright');

const cursors = new WeakMap();
const cursorPromises = new WeakMap();
const cursorPages = new WeakMap();
const pageStates = new WeakMap();
const humanizedPages = new WeakSet();
const humanizedLocators = new WeakSet();

function getPageState(page) {
  let state = pageStates.get(page);
  if (!state) {
    state = { queue: Promise.resolve(), originalMouse: null };
    pageStates.set(page, state);
  }
  return state;
}

function enqueuePageMouseAction(page, fn) {
  const state = getPageState(page);
  const run = state.queue.then(fn, fn);
  state.queue = run.catch(() => {});
  return run;
}

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

async function getOrCreateCursor(page) {
  if (cursors.has(page)) {
    return cursors.get(page);
  }
  if (cursorPromises.has(page)) {
    return cursorPromises.get(page);
  }

  const createPromise = createCursor(getCursorPage(page), {
    overshootSpread: 10,
    overshootRadius: 120,
    debug: false,
  }).then(cursor => {
    cursors.set(page, cursor);
    return cursor;
  }).finally(() => {
    cursorPromises.delete(page);
  });

  cursorPromises.set(page, createPromise);
  return createPromise;
}

function humanizeMouse(page) {
  if (humanizedPages.has(page)) {
    return page;
  }
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
          await cursor.actions.move({ x, y }, {
            paddingPercentage: 0,
          });
        } catch (e) {
          await originalMouse.move(x, y, options);
        }
      });
    },

    async down(options) {
      return enqueuePageMouseAction(page, () => originalMouse.down(options));
    },

    async up(options) {
      return enqueuePageMouseAction(page, () => originalMouse.up(options));
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

    async dblclick(x, y, options) {
      return enqueuePageMouseAction(page, async () => {
        try {
          const cursor = await getOrCreateCursor(page);
          await cursor.actions.move({ x, y });
        } catch (e) {
          await originalMouse.move(x, y);
        }
        await originalMouse.dblclick(x, y, options);
      });
    },

    async wheel(deltaX, deltaY) {
      return enqueuePageMouseAction(page, () => originalMouse.wheel(deltaX, deltaY));
    }
  };

  Object.defineProperty(page, 'mouse', {
    value: humanizedMouse,
    writable: false,
    configurable: true
  });

  return page;
}

async function humanScrollIntoView(locator, page) {
  try {
    const scrollInfo = await locator.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight;
      if (rect.top >= 0 && rect.bottom <= vh) return null;
      let amount = 0;
      if (rect.top < 0) amount = rect.top - (vh * 0.2);
      else amount = rect.bottom - (vh * 0.8);
      return amount;
    }).catch(() => null);
    
    if (scrollInfo) {
      const steps = Math.max(1, Math.ceil(Math.abs(scrollInfo) / 100));
      const state = getPageState(page);
      for (let i = 0; i < steps; i++) {
        await state.originalMouse.wheel(0, scrollInfo / steps);
        await new Promise(r => setTimeout(r, 20 + Math.random() * 40));
      }
      await new Promise(r => setTimeout(r, 100 + Math.random() * 100));
    }
  } catch (e) {
    // Ignore errors, element might be detached
  }
}

function humanizeLocator(locator, page) {
  if (humanizedLocators.has(locator)) {
    return locator;
  }
  humanizedLocators.add(locator);

  const originalClick = locator.click.bind(locator);
  const originalDblclick = locator.dblclick.bind(locator);
  const originalHover = locator.hover.bind(locator);
  const originalFill = locator.fill ? locator.fill.bind(locator) : null;
  const originalPressSequentially = locator.pressSequentially ? locator.pressSequentially.bind(locator) : null;

  async function getRandomPointInLocator() {
    const box = await locator.boundingBox();
    if (!box) {
      return null;
    }
    const cursor = await getOrCreateCursor(page);
    const x = box.x + box.width * (0.2 + Math.random() * 0.6);
    const y = box.y + box.height * (0.2 + Math.random() * 0.6);
    return { x, y, cursor };
  }

  locator.click = async function(options) {
    return enqueuePageMouseAction(page, async () => {
      try {
        await humanScrollIntoView(locator, page);
        const result = await getRandomPointInLocator();
        if (result) {
          const { x, y, cursor } = result;
          await cursor.actions.move({ x, y });
          await new Promise(r => setTimeout(r, 20 + Math.random() * 80));
          const state = getPageState(page);
          await state.originalMouse.click(x, y, options);
          return;
        }
      } catch (e) {
      }
      await originalClick(options);
    });
  };

  locator.dblclick = async function(options) {
    return enqueuePageMouseAction(page, async () => {
      try {
        await humanScrollIntoView(locator, page);
        const result = await getRandomPointInLocator();
        if (result) {
          const { x, y, cursor } = result;
          await cursor.actions.move({ x, y });
          await new Promise(r => setTimeout(r, 20 + Math.random() * 80));
          const state = getPageState(page);
          await state.originalMouse.click(x, y, { ...options, clickCount: 1 });
          await new Promise(r => setTimeout(r, 50 + Math.random() * 100));
          await state.originalMouse.click(x, y, { ...options, clickCount: 2 });
          return;
        }
      } catch (e) {
      }
      await originalDblclick(options);
    });
  };

  locator.hover = async function(options) {
    return enqueuePageMouseAction(page, async () => {
      try {
        await humanScrollIntoView(locator, page);
        const result = await getRandomPointInLocator();
        if (result) {
          const { x, y, cursor } = result;
          await cursor.actions.move({ x, y });
          const state = getPageState(page);
          await state.originalMouse.move(x, y, options);
          return;
        }
      } catch (e) {
      }
      await originalHover(options);
    });
  };

  if (originalFill && originalPressSequentially) {
    locator.fill = async function(value, options) {
      return enqueuePageMouseAction(page, async () => {
        try {
          await humanScrollIntoView(locator, page);
          const result = await getRandomPointInLocator();
          if (result) {
            const { x, y, cursor } = result;
            await cursor.actions.move({ x, y });
            await new Promise(r => setTimeout(r, 20 + Math.random() * 80));
            
            const state = getPageState(page);
            await state.originalMouse.click(x, y);
            await new Promise(r => setTimeout(r, 20 + Math.random() * 50));
            
            await originalFill('', options);
            await new Promise(r => setTimeout(r, 50 + Math.random() * 100));
            
            const filteredOptions = options ? { ...options } : {};
            delete filteredOptions.force;
            delete filteredOptions.delay;
            
            for (const char of value) {
              const isSpace = char === ' ';
              const delay = isSpace 
                ? 100 + Math.random() * 200 
                : 30 + (Math.random() * Math.random() * 100);
              
              await originalPressSequentially(char, { ...filteredOptions, delay: 0 });
              await new Promise(r => setTimeout(r, delay));
            }
            return;
          }
        } catch (e) {
        }
        await originalFill(value, options);
      });
    };
  }

  const originalSelectOption = locator.selectOption ? locator.selectOption.bind(locator) : null;
  if (originalSelectOption) {
    locator.selectOption = async function(values, options) {
      return enqueuePageMouseAction(page, async () => {
        try {
          await humanScrollIntoView(locator, page);
          const result = await getRandomPointInLocator();
          if (result) {
            const { x, y, cursor } = result;
            await cursor.actions.move({ x, y });
            await new Promise(r => setTimeout(r, 20 + Math.random() * 80));
            
            const state = getPageState(page);
            await state.originalMouse.click(x, y);
            await new Promise(r => setTimeout(r, 150 + Math.random() * 200));
          }
        } catch (e) {
        }
        return await originalSelectOption(values, options);
      });
    };
  }

  for (const methodName of [
    'locator',
    'getByRole',
    'getByText',
    'getByLabel',
    'getByPlaceholder',
    'getByTestId',
    'getByAltText',
    'getByTitle',
    'filter',
    'first',
    'last',
    'nth',
    'and',
    'or',
    'describe',
    'frameLocator'
  ]) {
    if (typeof locator[methodName] === 'function') {
      const originalMethod = locator[methodName].bind(locator);
      locator[methodName] = function(...args) {
        const newLocator = originalMethod(...args);
        return humanizeLocator(newLocator, page);
      };
    }
  }

  return locator;
}

module.exports = {
  humanizeMouse,
  humanizeLocator,
  getOrCreateCursor,
};
