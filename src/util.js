export function isElementVisible(el, completelyVisible = false) {
    var rect = el.getBoundingClientRect(),
        vWidth = window.innerWidth || document.documentElement.clientWidth,
        vHeight = window.innerHeight || document.documentElement.clientHeight,
        efp = function (x, y) {
            return document.elementFromPoint(x, y);
        };

    // Return false if it's not in the viewport
    if (
        rect.right < 0 ||
        rect.bottom < 0 ||
        rect.left > vWidth ||
        rect.top > vHeight
    )
        return false;

    // Return true if any of its four corners are visible
    return completelyVisible
        ? el.contains(efp(rect.left + 1, rect.top + 1)) &&
              el.contains(efp(rect.right - 2, rect.top + 1)) &&
              el.contains(efp(rect.right - 2, rect.bottom - 2)) &&
              el.contains(efp(rect.left + 1, rect.bottom - 2))
        : el.contains(efp(rect.left + 1, rect.top + 1)) ||
              el.contains(efp(rect.right - 2, rect.top + 1)) ||
              el.contains(efp(rect.right - 2, rect.bottom - 2)) ||
              el.contains(efp(rect.left + 1, rect.bottom - 2));
}
