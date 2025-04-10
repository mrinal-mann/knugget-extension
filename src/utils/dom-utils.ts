/**
 * DOM utilities for Knugget extension
 * Contains helper functions for DOM manipulation, element finding, and attribute handling
 */

/**
 * Creates an element with specified attributes and children
 * @param tag HTML element tag name
 * @param attributes Object containing element attributes
 * @param children Array of child elements or strings
 * @returns The created HTML element
 */
export function createElement<T extends HTMLElement>(
  tag: string,
  attributes: Record<string, string> = {},
  children: (HTMLElement | string)[] = []
): T {
  const element = document.createElement(tag) as T;

  // Set attributes
  Object.entries(attributes).forEach(([key, value]) => {
    if (key === "className") {
      element.className = value;
    } else if (key === "innerHTML") {
      element.innerHTML = value;
    } else {
      element.setAttribute(key, value);
    }
  });

  // Append children
  children.forEach((child) => {
    if (typeof child === "string") {
      element.appendChild(document.createTextNode(child));
    } else {
      element.appendChild(child);
    }
  });

  return element;
}

/**
 * Find an element with retries
 * Useful for finding elements that might not be immediately available in the DOM
 * @param selector CSS selector for the element
 * @param maxRetries Maximum number of retries
 * @param intervalMs Interval between retries in milliseconds
 * @returns Promise resolving to the found element or null if not found
 */
export function findElementWithRetry(
  selector: string,
  maxRetries: number = 10,
  intervalMs: number = 300
): Promise<Element | null> {
  return new Promise((resolve) => {
    let retries = 0;

    const findElement = () => {
      const element = document.querySelector(selector);

      if (element) {
        resolve(element);
        return;
      }

      retries++;

      if (retries >= maxRetries) {
        resolve(null);
        return;
      }

      setTimeout(findElement, intervalMs);
    };

    findElement();
  });
}

/**
 * Create and mount a MutationObserver to watch for DOM changes
 * @param targetNode Node to observe
 * @param config MutationObserver configuration
 * @param callback Callback to be executed on DOM changes
 * @returns The created MutationObserver instance
 */
export function createObserver(
  targetNode: Node,
  config: MutationObserverInit,
  callback: (mutations: MutationRecord[], observer: MutationObserver) => void
): MutationObserver {
  const observer = new MutationObserver(callback);
  observer.observe(targetNode, config);
  return observer;
}

/**
 * Safely insert an element after a target element
 * @param newElement Element to insert
 * @param targetElement Element after which to insert the new element
 * @returns True if insertion was successful, false otherwise
 */
export function insertAfter(
  newElement: HTMLElement,
  targetElement: HTMLElement
): boolean {
  try {
    if (targetElement && targetElement.parentNode) {
      targetElement.parentNode.insertBefore(
        newElement,
        targetElement.nextSibling
      );
      return true;
    }
    return false;
  } catch (error) {
    console.error("Error inserting element:", error);
    return false;
  }
}

/**
 * Create and add CSS styles to the document
 * @param cssText CSS text to add
 * @param id Optional ID for the style element
 * @returns The created style element
 */
export function addStyles(cssText: string, id?: string): HTMLStyleElement {
  const style = document.createElement("style");
  style.textContent = cssText;

  if (id) {
    style.id = id;
  }

  document.head.appendChild(style);
  return style;
}

/**
 * Toggle a class on an element
 * @param element Element to toggle class on
 * @param className Class name to toggle
 * @param force Force add or remove if boolean is provided
 * @returns True if class is added, false if removed
 */
export function toggleClass(
  element: HTMLElement,
  className: string,
  force?: boolean
): boolean {
  if (force !== undefined) {
    if (force) {
      element.classList.add(className);
      return true;
    } else {
      element.classList.remove(className);
      return false;
    }
  } else {
    return element.classList.toggle(className);
  }
}

/**
 * Wait for an element to appear in the DOM
 * @param selector CSS selector for the element
 * @param timeoutMs Timeout in milliseconds
 * @returns Promise resolving to the found element or null if timeout
 */
export function waitForElement(
  selector: string,
  timeoutMs: number = 5000
): Promise<Element | null> {
  return new Promise((resolve) => {
    // Check if element already exists
    const element = document.querySelector(selector);
    if (element) {
      resolve(element);
      return;
    }

    // Set timeout
    const timeoutId = setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, timeoutMs);

    // Create observer
    const observer = new MutationObserver((mutations, obs) => {
      const element = document.querySelector(selector);
      if (element) {
        obs.disconnect();
        clearTimeout(timeoutId);
        resolve(element);
      }
    });

    // Start observing
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  });
}

/**
 * Remove all children from an element
 * @param element Element to clear
 */
export function clearElement(element: HTMLElement): void {
  while (element.firstChild) {
    element.removeChild(element.firstChild);
  }
}

/**
 * Check if an element is visible in viewport
 * @param element Element to check
 * @returns True if element is in viewport
 */
export function isInViewport(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();

  return (
    rect.top >= 0 &&
    rect.left >= 0 &&
    rect.bottom <=
      (window.innerHeight || document.documentElement.clientHeight) &&
    rect.right <= (window.innerWidth || document.documentElement.clientWidth)
  );
}

/**
 * Scroll element into view if not already visible
 * @param element Element to scroll to
 * @param behavior Scroll behavior
 */
export function scrollIntoViewIfNeeded(
  element: HTMLElement,
  behavior: ScrollBehavior = "smooth"
): void {
  if (!isInViewport(element)) {
    element.scrollIntoView({ behavior, block: "nearest" });
  }
}
