/**
 * DOM utility helpers shared across page modules.
 */

window.OsuExpertPlus = window.OsuExpertPlus || {};

OsuExpertPlus.dom = (() => {
  /**
   * Shorthand for document.querySelector.
   * @param {string} selector
   * @param {Element} [root=document]
   */
  function qs(selector, root = document) {
    return root.querySelector(selector);
  }

  /**
   * Shorthand for document.querySelectorAll (returns an Array).
   * @param {string} selector
   * @param {Element} [root=document]
   */
  function qsa(selector, root = document) {
    return Array.from(root.querySelectorAll(selector));
  }

  /**
   * Create an element with optional attributes and children.
   * @param {string} tag
   * @param {Object} [attrs={}]
   * @param {...(string|Element)} children
   */
  function el(tag, attrs = {}, ...children) {
    const element = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (key === 'class') {
        element.className = value;
      } else if (key.startsWith('on') && typeof value === 'function') {
        element.addEventListener(key.slice(2).toLowerCase(), value);
      } else {
        element.setAttribute(key, value);
      }
    }
    for (const child of children) {
      if (typeof child === 'string') {
        element.appendChild(document.createTextNode(child));
      } else if (child instanceof Element) {
        element.appendChild(child);
      }
    }
    return element;
  }

  /**
   * If a matching element currently exists in `root`, waits until it is
   * disconnected from the document (i.e. Inertia/React has torn down the
   * previous page component after SPA navigation).  Resolves immediately if
   * no matching element is present.
   *
   * Use this before waitForElement on SPA re-navigations to avoid resolving
   * with stale elements that belong to the previous page.
   *
   * @param {string} selector
   * @param {number} [timeout=8000]
   * @param {Element} [root=document.body]
   * @returns {Promise<void>}
   */
  function waitForStaleElementToLeave(selector, timeout = 8000, root = document.documentElement) {
    return new Promise((resolve) => {
      const stale = root.querySelector(selector);
      if (!stale || !stale.isConnected) {
        console.debug(`[osu! Expert+] waitForStaleElementToLeave("${selector}"): nothing to wait for`);
        return resolve();
      }

      console.debug(`[osu! Expert+] waitForStaleElementToLeave("${selector}"): waiting for stale element to leave…`);
      const t0 = Date.now();
      const observer = new MutationObserver(() => {
        if (!stale.isConnected) {
          observer.disconnect();
          console.debug(`[osu! Expert+] waitForStaleElementToLeave("${selector}"): gone after ${Date.now() - t0}ms`);
          resolve();
        }
      });
      observer.observe(root, { childList: true, subtree: true });
      setTimeout(() => {
        observer.disconnect();
        console.debug(`[osu! Expert+] waitForStaleElementToLeave("${selector}"): timed out after ${timeout}ms`);
        resolve();
      }, timeout);
    });
  }

  /**
   * Wait for an element matching `selector` to appear in the DOM.
   * Resolves with the element or rejects after `timeout` ms.
   * @param {string} selector
   * @param {number} [timeout=10000]
   * @param {Element} [root=document.body]
   * @returns {Promise<Element>}
   */
  function waitForElement(selector, timeout = 10000, root = document.documentElement) {
    return new Promise((resolve, reject) => {
      const existing = root.querySelector(selector);
      if (existing) return resolve(existing);

      const observer = new MutationObserver(() => {
        const found = root.querySelector(selector);
        if (found) {
          observer.disconnect();
          resolve(found);
        }
      });

      observer.observe(root, { childList: true, subtree: true });

      setTimeout(() => {
        observer.disconnect();
        reject(new Error(`waitForElement: "${selector}" not found within ${timeout}ms`));
      }, timeout);
    });
  }

  /**
   * Manages a <style> element lifecycle.  inject() is idempotent.
   * @param {string} id   Unique element id for deduplication.
   * @param {string} css  Stylesheet text content.
   * @returns {{ inject: () => void, remove: () => void }}
   */
  function manageStyle(id, css) {
    const inject = () => {
      if (document.getElementById(id)) return;
      const s = document.createElement('style');
      s.id = id;
      s.textContent = css;
      document.head.appendChild(s);
    };
    const remove = () => document.getElementById(id)?.remove();
    return { inject, remove };
  }

  /**
   * Collects cleanup / unsubscribe functions and disposes them all at once.
   * Each function is called inside try/catch so one failure never blocks
   * the rest.  Functions execute in reverse-registration (LIFO) order.
   * @returns {{ add: (...fns: Function[]) => void, dispose: () => void }}
   */
  function createCleanupBag() {
    const fns = [];
    return {
      add(...args) { fns.push(...args); },
      dispose() {
        while (fns.length) { try { fns.pop()(); } catch (_) {} }
      },
    };
  }

  return { qs, qsa, el, waitForElement, waitForStaleElementToLeave, manageStyle, createCleanupBag };
})();
