/**
 * react-dom, minus the one thing renderToString cannot do.
 *
 * `createPortal` throws on the server — it needs a real container, and there is
 * no DOM here. Several components use it for the toast layer, the mobile menu
 * and the payment sheet, so without this the smoke reports "Target container is
 * not a DOM element" for most pages and tells us nothing about the pages
 * themselves.
 *
 * Rendering the children inline instead is exactly right for this check: the
 * component body still runs, which is the thing being tested. Where the markup
 * lands is a question for a browser, and this is not one.
 */
export * from 'react-dom'
export { default } from 'react-dom'
export const createPortal = (children) => children
