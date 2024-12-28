// Some DOM helpers (partial credit to @ShamesBond and @alainbryden)
import { log } from './utils';

const SLEEP_FIND = 10;
const SLEEP_CLICK = 5;

let doc: Document = eval("document");

/* Used to search for an element in the document. This can fail if the dom isn't fully re-rendered yet. */
function find_xpath(xpath: string) {
    return doc.evaluate(xpath, doc, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
}

/** Try to find an element, with retries.
 * This is tricky - in some cases we are just checking if the element exists, but expect that it might not
 * (expectFailure = true) - in this case we want some retries in case we were just too fast to detect the element
 * but we don't want to retry too much. We also don't want to be too noisy if we fail to find the element.
 * In other cases, we always expect to find the element we're looking for, and if we don't it's an error.
 * @param {NS} ns
 * @param {string} xpath The xpath 1.0 expression to use to find the element.
 * @param {boolean} expectFailure Changes the behaviour when an item cannot be found.
 *                                If false, failing to find the element is treated as an error.
 *                                If true, we simply return null indicating that no such element was found.
 * @param {null|number} maxRetries (defaults to 5) The number of times to retry.
 * @param {string?} customErrorMessage (optional) A custom error message to replace the default on failure. */
export async function find_xpath_with_retry(ns: NS, xpath: string, expectFailure: boolean, maxRetries: null | number, customErrorMessage: string | null = null) {
    maxRetries = maxRetries || 5; // If not specified or is 0, default to 5
    await ns.sleep(SLEEP_FIND);
    try {
        const logSafeXpath = xpath.substring(2, 20) + "...";
        let retries = 0;
        while (retries === 0 || (maxRetries !== null && retries < maxRetries)) {
            const elem = find_xpath(xpath);
            if (elem !== null) return elem;
            retries++;
            await ns.sleep(Math.min(1 << retries, 200)); // Wait for the DOM to load; 200ms is one tick.
        }
        if (!expectFailure) {
            // Log a truncated version of the xpath so we don't accidentally find the logged version!
            throw new Error(customErrorMessage ?? `Failed to find element with xpath: ${logSafeXpath}`);
        }
    } catch (e) {
        if (!expectFailure) throw e;
    }
    return null;
}

export async function click(ns: NS, button: Node) {
    if (button === null || button === undefined)
        throw new Error("click was called on a null reference. This means the prior button detection failed, but was assumed to have succeeded.");
    await ns.sleep(SLEEP_CLICK);
    // Find the onclick method on the button
    let fnOnClick = button[Object.keys(button)[1]].onClick; // This is voodoo to me. Apparently it's function on the first property of this button?
    if (!fnOnClick)
        throw new Error(`Odd, we found a button, but couldn't find its onclick method!`);
    // Click the button. The "secret" to this working is just to pass any object containing isTrusted:true
    await fnOnClick({ isTrusted: true });
    await ns.sleep(SLEEP_CLICK);
}

export async function setText(ns: NS, input: Node, text: string, verbose: boolean = false) {
    if (input === null || input === undefined)
        throw new Error("setText was called on a null reference. This means the prior input detection failed, but was assumed to have succeeded.");
    await ns.sleep(SLEEP_CLICK);
    if (verbose) {
        log(ns, `Setting text: ${text} on input.`, true);
    }
    await input[Object.keys(input)[1]].onChange({ isTrusted: true, currentTarget: { value: text } });
    await ns.sleep(SLEEP_CLICK);
}