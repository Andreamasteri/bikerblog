import "@testing-library/jest-dom/vitest";

// jsdom non implementa Element.scrollTo (usato per l'autoscroll della chat).
if (!window.HTMLElement.prototype.scrollTo) {
  window.HTMLElement.prototype.scrollTo = () => {};
}
