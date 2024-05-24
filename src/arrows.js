import {default as Configurable, STANDARD_EXIT, ESCAPE_EXIT, FINISHED_EXIT} from "./configurable";
import { debounce } from "goodcore/Util";
import { isElementVisible } from "./util";
import { findAll } from "goodcore/Dom";

export default class Arrows extends Configurable {
    config = {
        maxMargin: 50,
        mode: "single", // "single" | "multi"
        maskColor: "#000000",
        maskOpacity: 0.4,
        animationTime: 700,
        escapeToExit: true,
        overlayType: "partial", // "blocking" | "partial" | "clickthrough" | none (not implemented yet)
        shadowTargets: true,
        textTransitionTime: 0.3,
        clickToProgress: true,
        bindKeys: true,
        exitFn: null,
        overlayId: "infooverlay",
        scrollIntoView: true,
        onExit: async ({exitReason, progress}) => null,
        onProgress: async ({progress}) => null,
    };
    originalQuiver = []
    styled = false;
    exitPromise = null;
    exitResolver = null;
    past = [];
    future = [];
    current = null;
    arrows = {};
    forceRedraw = false;
    disableAnimationTime = false;
    noReset = false;
    partialCover = {
        top: null,
        left: null,
        right: null,
        bottom: null,
    };

    constructor() {
        super();
        this._addKeyListeners();
    }

        /* Public methods */
    
        add(id, text, targetElement) {
            this._validateId(id);
            this.future.push([id, text, targetElement]);
            return this;
        }
    
        clear() {
            this.reset(true);
        }

        async draw(id, text, targetElement) {
            await this._prepDraw(id, targetElement);
            return this._drawArrow(id, text, targetElement);
        }

        getProgress() {
            return this.past.length + (this.current ? 1 : 0);
        }

        load(quiver, progress = 0) {
            if ("string" === typeof quiver) {
                quiver = JSON.parse(quiver);
            }
            this.originalQuiver = quiver.slice();
            if(quiver && quiver.length > 0) {
                this.future = quiver.slice();
            }
            this.past = this.future.splice(0, progress);
            this.current = null;
            this.noReset = true;
            return this;
        }

        next() {
            if (this.future.length > 0) {
                if (this.config.mode === "single") {
                    this._show(...this.future.shift());
                } else {
                    while (this.future.length > 0) {
                        this._show(...this.future.shift());
                    }
                }
                this.config.onProgress({progress: this.getProgress() - 1});
            } else {
                this.exit({ exitReason: FINISHED_EXIT });
            }
        }
    
        previous() {
            if (this.config.mode === "single") {
                if (this.past.length > 0) {
                    this.future.unshift(this.current);
                    this.current = null;
                    this._show(...this.past.pop());
                    this.config.onProgress({progress: this.getProgress()  - 1});
                }
            }
        }
    
        reset(empty) {
            this._removeShadowing();
            this._createAndAttachInfoOverlay(this.config.overlayId ?? null, true);
            this._addCssClassToStyleSheet();
            if(!this.noReset) {
                var future = [];
                if (this.past && !empty) future = [...this.past];
                if (this.current && !empty) future.push(this.current);
                if (this.future && !empty) future = [...future, ...this.future];
                this.past = [];
                this.current = null;
                this.future = future;
            } else {
                this.noReset = false;
            }
            this._clearArrows();
            this.forceRedraw = false;
            this.isShowing = true;
        }

        fire() {
            this.reset();
            this.next();
            return this.onExit();
        }

        exit({exitReason} = { exitReason: STANDARD_EXIT }) {
            const progress = this.getProgress() - 1;
            super.exit({ exitReason, progress });
        }

        /* Private methods */

        
    _appendPartialCover(overlay) {
        if (this.config.overlayType !== "partial") {
            return;
        }
        overlay.innerHTML = `<div class="cover top" style="width: 100%;"></div>
<div class="cover left" style="height: 100%;"></div>
<div class="cover right" style="height: 100%;"></div>
<div class="cover bottom" style="width: 100%;"></div>`;

        this.partialCover.top = overlay.querySelector(".cover.top");
        this.partialCover.left = overlay.querySelector(".cover.left");
        this.partialCover.right = overlay.querySelector(".cover.right");
        this.partialCover.bottom = overlay.querySelector(".cover.bottom");
    }

    _appendFocusSvg(overlay) {
        let svg = `
<svg id="mask" xmlns="http://www.w3.org/2000/svg" role="none" height="100%" width="100%" preserveAspectRatio="none" style="position: absolute; top: 0; left: 0;">
<defs>
  <mask id="circles_mask">
    <rect width="100%" height="100%" fill="white" stroke="white"></rect>
    <circle id="focus_field_circle" class="focus_field" fill="black" stroke="black" cx="0" cy="0" r="0"></circle>  
    <rect id="focus_field_rect" class="focus_field" fill="black" stroke="black" x="0" y="0" rx="8"></rect>
  </mask>
</defs>
<rect width="100%" height="100%" fill="${this.config.maskColor}"
fill-opacity="${this.config.maskOpacity}" mask="url(#circles_mask)"></rect>
</svg>`;
        const svgEl = new DOMParser().parseFromString(svg, "image/svg+xml");

        overlay.appendChild(
            overlay.ownerDocument.importNode(svgEl.documentElement, true)
        );
    }
    _createInfoCanvas(parent) {
        // Create canvas element
        let canvas = parent.querySelector("canvas");
        if (!canvas) {
            canvas = document.createElement("canvas");
            canvas.id = "infocanvas";
            canvas.style.position = "absolute";
            canvas.style.top = "0";
            canvas.style.left = "0";
            canvas.style.width = "100%";
            canvas.style.height = "100%";
            canvas.style.zIndex = "9999";
            canvas.style.pointerEvents = "none"; // Make canvas non-clickable

            parent.appendChild(canvas);

            // Initialize canvas size
            this._setCanvasSize(canvas);

            // Resize canvas when window size changes
            window.addEventListener("resize", this._resize);
            window.addEventListener("scroll", this._resize);
        }

        return canvas;
    }
    _createOverlay(id) {
        let overlay = document.getElementById(id);
        if (!overlay) {
            // Create canvas element
            overlay = document.createElement("div");
            overlay.id = this.config.overlayId ?? "infooverlay";
            overlay.className = "arr overlay";
            overlay.style.position = "fixed";
            overlay.style.top = "0";
            overlay.style.left = "0";
            overlay.style.width = "100%";
            overlay.style.height = "100%";
            overlay.style.zIndex = "9999";
            overlay.style.pointerEvents =
                this.config.overlayType == "blocking" ? "auto" : "none";
            if (this.config.overlayType) {
                overlay.addEventListener("pointerup", (event) => {
                    if (!this.config.clickToProgress) {
                        return;
                    }
                    event.stopPropagation();
                    event.preventDefault();
                    this.next();
                });
            }

            // Attach canvas to body
            document.body.appendChild(overlay);
        }

        if (this.config.mode === "multi") {
            this.config.maskOpacity ??= 0;
        }

        this._appendPartialCover(overlay);

        this._appendFocusSvg(overlay);

        return overlay;
    }

    _setCanvasSize(canvas) {
        const rect = canvas.parentElement.getBoundingClientRect();
        canvas.width = rect.width;
        canvas.height = rect.height;
    }

    _resize = debounce(async () => {
        if (!this.isShowing) return;
        const [overlay, canvas] = this._getOverlay();
        overlay.classList.add("disable-animation");
        this.disableAnimationTime = true;
        this._setCanvasSize(canvas);
        await this._redraw(canvas);
        overlay.classList.remove("disable-animation");
        this.disableAnimationTime = false;
    });

    _getMaxZIndex(target, excludeTarget = true) {
        const siblings =
            target?.parentElement?.children ?? document.body.children;
        let maxZIndex = 0;
        for (let i = 0; i < siblings.length; i++) {
            if (excludeTarget && siblings[i] === target) continue;
            const zIndex = window.getComputedStyle(siblings[i]).zIndex | 0;
            if (zIndex > maxZIndex) {
                maxZIndex = zIndex;
            }
        }
        return maxZIndex;
    }

    _getOverlay() {
        const overlay = document.getElementById(
            this.config.overlayId ?? "infooverlay"
        );
        return [overlay, overlay.querySelector("canvas")];
    }

    _createAndAttachInfoOverlay(overlayId, maxZ = false) {
        // Create canvas if it doesn't exist
        const infooverlay = this._createOverlay(overlayId);
        const canvas = this._createInfoCanvas(infooverlay);

        // Ensure canvas has highest z-index among its siblings
        this._maximizeOverlayZIndex(infooverlay);

        return [infooverlay, canvas];
    }

    _maximizeOverlayZIndex(infooverlay) {
        infooverlay.style.zIndex = Math.max(
            this._getMaxZIndex(infooverlay, true) + 1,
            infooverlay.style.zIndex || 0
        );
    }

    _removeInfoOverlay() {
        let infooverlay = document.getElementById("infooverlay");
        if (infooverlay) {
            infooverlay.remove();
        }
    }

    _calculatePositiveCurvature(startPoint, targetPoint, isWide) {
        const fromLeft = startPoint.x < targetPoint.x;
        const fromAbove = startPoint.y < targetPoint.y;
        return !(
            (fromAbove && fromLeft && isWide) ||
            (fromAbove && !fromLeft && !isWide) ||
            (!fromAbove && fromLeft && !isWide) ||
            (!fromAbove && !fromLeft && isWide)
        );
    }

    _drawCurvedArrowOnCanvas(
        canvas,
        startPoint,
        targetPoint,
        positiveCurvature = true
    ) {
        const context = canvas.getContext("2d");
        const curvature = 20;
        // adjust this value for the curvature of the arrow

        const dx = targetPoint.x - startPoint.x;
        const dy = targetPoint.y - startPoint.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // Calculate control point
        const cx =
            (startPoint.x + targetPoint.x) / 2 +
            ((positiveCurvature ? 1 : -1) *
                (curvature * (startPoint.y - targetPoint.y))) /
                distance;
        const cy =
            (startPoint.y + targetPoint.y) / 2 +
            ((positiveCurvature ? 1 : -1) *
                (curvature * (targetPoint.x - startPoint.x))) /
                distance;

        // Draw curved arrow
        context.beginPath();
        context.moveTo(startPoint.x, startPoint.y);
        context.quadraticCurveTo(cx, cy, targetPoint.x, targetPoint.y);
        context.strokeStyle = "black";
        context.lineWidth = 2;
        context.stroke();

        // Draw arrowhead
        const angle = Math.atan2(targetPoint.y - cy, targetPoint.x - cx);
        context.beginPath();
        context.moveTo(targetPoint.x, targetPoint.y);
        context.lineTo(
            targetPoint.x - 10 * Math.cos(angle - Math.PI / 6),
            targetPoint.y - 10 * Math.sin(angle - Math.PI / 6)
        );
        context.lineTo(
            targetPoint.x - 10 * Math.cos(angle + Math.PI / 6),
            targetPoint.y - 10 * Math.sin(angle + Math.PI / 6)
        );
        context.closePath();
        context.fill();
    }

    _calculateTextElementPosition(
        targetElement,
        textSize,
        targetMidpoint,
        targetSize,
        margin,
        canvasPadding
    ) {
        let textLeft;
        let textTop;

        if (!targetElement) {
            // Calculate position based on window dimensions
            textLeft = window.innerWidth / 2 - textSize.x / 2;
            textTop = window.innerHeight / 2 - textSize.y / 2;
            return { x: textLeft, y: textTop };
        }

        // Calculate position based on relative position of target and text elements
        if (targetMidpoint.x < window.innerWidth / 2) {
            // Text element should be placed to the right of the target element
            textLeft = targetMidpoint.x + targetSize.x / 2 + margin;
        } else {
            // Text element should be placed to the left of the target element
            textLeft =
                targetMidpoint.x - targetSize.x / 2 - textSize.x - margin;
        }

        if (targetMidpoint.y < window.innerHeight / 2) {
            // Text element should be placed to the right of the target element
            textTop = targetMidpoint.y + targetSize.y / 2 + margin;
        } else {
            // Text element should be placed to the left of the target element
            textTop = targetMidpoint.y - targetSize.y / 2 - textSize.y - margin;
        }

        // Adjust if the text element would fall outside the window
        textLeft = Math.min(
            Math.max(textLeft, canvasPadding),
            window.innerWidth - textSize.x - canvasPadding
        );
        textTop = Math.min(
            Math.max(textTop, canvasPadding),
            window.innerHeight - textSize.y - canvasPadding
        );

        return { x: textLeft, y: textTop };
    }

    _positionTextElement(textElement, textPos) {
        textElement.style.left = textPos.x + "px";
        textElement.style.top = textPos.y + "px";
    }

    _createTextElement() {
        const existingTextElement = document.querySelector(".arr.text");
        const textElement =
            this.config.mode === "single"
                ? existingTextElement ?? document.createElement("div")
                : document.createElement("div");
        textElement.className = "arr text";
        textElement.style.opacity = 1;
        if (!existingTextElement) {
            textElement.addEventListener("pointerup", async (event) => {
                event.stopPropagation();
                if (!this.config.clickToProgress) {
                    return;
                }
                this.next();
                event.preventDefault();
            });
        }
        return textElement;
    }

    _addCssClassToStyleSheet() {
        if (this.styled) {
            return;
        }
        const textRule = `.arr.text {
    white-space: pre-wrap;
    border-radius: 8px;
    border: 8px solid transparent;
    background-color: rgba(0, 48, 96, 0.753);
    color: white;
    position: absolute;
    word-break: break-word;
    font-size: large;
    pointer-events: all;
    max-width: 40vw;
    pointer-events: auto;
    transition: opacity ${this.config.textTransitionTime}s;
}`;
        const focusRule = `.focus_field {
    transition: all ${this.config.animationTime}ms;
}`;
        const partialCoverRule = `.cover {
    pointer-events: all;
    transition: all ${this.config.animationTime}ms;
    position: absolute;
}`;
        const topCoverRule = `.cover.top {
    top: 0;
}`;
        const rightCoverRule = `.cover.right {
    right: 0;
}`;
        const bottomCoverRule = `.cover.bottom {
    bottom: 0;
}`;
        const leftCoverRule = `.cover.top {
    left: 0;
}`;
        const focusedElementRule = `.arrowed {
    box-shadow: 0px 0px 10px #606060;
}`;
        const disableAnimationRule = `.disable-animation .focus_field, .disable-animation .cover, .disable-animation .arr.text {
    transition: none !important;
}`;
        var style = document.createElement("style");
        document.head.appendChild(style);
        const firstSheet = style.sheet;
        if (
            Array.from(firstSheet.rules)
                .filter((x) => x.selectorText)
                .some((x) => x.selectorText.startsWith(".arr"))
        ) {
            return;
        }
        firstSheet.insertRule(disableAnimationRule, 0);
        firstSheet.insertRule(textRule, 0);
        firstSheet.insertRule(focusRule, 0);
        firstSheet.insertRule(focusedElementRule, 0);
        firstSheet.insertRule(partialCoverRule, 0);
        firstSheet.insertRule(topCoverRule, 0);
        firstSheet.insertRule(rightCoverRule, 0);
        firstSheet.insertRule(bottomCoverRule, 0);
        firstSheet.insertRule(leftCoverRule, 0);
        this.styled = true;
    }

    _keyPressHandler(event) {
        if (!this.isShowing) {
            return;
        }
        if (!this.config.bindKeys) {
            return;
        }
        switch (event.key) {
            case "Escape":
                if (this.config.escapeToExit) {
                    this.exit({exitReason: ESCAPE_EXIT});
                }
                break;
            case " ":
            case "ArrowRight":
                this.next();
                break;
            case "ArrowLeft":
                this.previous();
                break;
        }
    }

    _addKeyListeners() {
        window.addEventListener("keyup", this._keyPressHandler.bind(this));
    }

    _calculateElementDimensions(el) {
        if (!el) {
            const dimensions = { x: window.innerWidth, y: window.innerHeight };
            return [
                { x: 0, y: 0 },
                { x: dimensions.x / 2, y: dimensions.y / 2 },
            ];
        }
        const rect = el.getBoundingClientRect();
        const size = { x: rect.width, y: rect.height };
        const midpoint = {
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
        };
        return [size, midpoint];
    }

    _attachTextElement(text, parent) {
        const existingTextElement = document.querySelector(".arr.text");
        const textElement = this._createTextElement();
        // Create text element
        textElement.innerHTML = text;
        if (!existingTextElement && this.config.mode === "single") {
            (parent ?? document.body).appendChild(textElement);
        }
        return textElement;
    }

    _calculateArrowPoints(targetMidpoint, targetSize, textMidpoint, textSize) {
        const targetOnTheLeft = targetMidpoint.x < textMidpoint.x;
        const targetOnTop = targetMidpoint.y < textMidpoint.y;
        const isWide = targetSize.x > targetSize.y;
        const targetX = isWide
            ? targetMidpoint.x
            : targetMidpoint.x +
              (targetOnTheLeft ? targetSize.x / 2 : -targetSize.x / 2);
        const targetY = isWide
            ? targetMidpoint.y +
              (targetOnTop ? targetSize.y / 2 : -targetSize.y / 2)
            : targetMidpoint.y;

        const textX = isWide
            ? textMidpoint.x +
              (targetOnTheLeft ? -textSize.x / 2 : textSize.x / 2)
            : textMidpoint.x;
        const textY = isWide
            ? textMidpoint.y
            : textMidpoint.y + (targetOnTop ? -textSize.y / 2 : textSize.y / 2);

        const startPoint = {
            x: textX,
            y: textY,
        };
        const targetPoint = {
            x: targetX,
            y: targetY,
        };

        return [startPoint, targetPoint];
    }

    _validateId(id) {
        if (!id.match("[a-z][a-z0-9]*")) {
            throw new Error("Invalid id");
        }
    }

    _removeArrow(id) {
        if (!this.arrows[id]) {
            return;
        }
        this.forceRedraw = true;
        const textElement = this.arrows[id].textElement;
        textElement.style.opacity = 0;
        if (this.config.mode !== "single") {
            setTimeout(
                () => textElement.remove(),
                this.config.textTransitionTime
            );
        }
        this.arrows[id].textElement = null;
        delete this.arrows[id];
    }
    _clearArrows() {
        if (Object.keys(this.arrows).length === 0) {
            return;
        }
        this.forceRedraw = true;
        Object.keys(this.arrows).forEach((id) => this._removeArrow(id));
    }

    async _show(id, text, targetElement) {
        this._validateId(id);

        if ("string" === typeof targetElement) {
            targetElement = document.querySelector(targetElement);
        }

        if (this.current) {
            this.past.push(this.current);
        }
        this.current = [id, text, targetElement];

        return this.draw(...this.current);
    }
    async _scrollIntoView(targetElement) {
        if (!this.config.scrollIntoView) {
            return;
        }
        let [overlay, _] = this._getOverlay();
        const covers = [overlay, ...findAll('.cover')];
        const settings = covers.map(el => ({el, pointerEvents: el.style.pointerEvents}));
        covers.forEach((el) => el.style.pointerEvents = "none")
        let isVisible = isElementVisible(targetElement, true);
        settings.forEach((s) => s.el.style.pointerEvents = s.pointerEvents);
        if (!isVisible) {
            await new Promise((resolve) => {
                targetElement.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
                setTimeout(() => {
                    resolve();
                }, 500);
            })
        }
    }

    _removeShadowing() {
        if (this.config.shadowTargets) {
            document.querySelectorAll(".arrowed").forEach((el) => {
                el.classList.remove("arrowed");
            });
        }
    }

    async _focusOnTarget(targetElement, targetSize, targetMidpoint) {
        if (this.config.mode === "single") {
            this._removeShadowing();
            const useCircle = await this._moveFocusToTarget(
                targetSize,
                targetMidpoint
            );
            if (this.config.overlayType === "partial") {
                this.partialCover.top.style.height =
                    targetMidpoint.y - targetSize.y / 2 + "px";
                this.partialCover.left.style.width =
                    targetMidpoint.x - targetSize.x / 2 + "px";
                this.partialCover.right.style.width =
                    window.innerWidth - targetMidpoint.x - targetSize.x + "px";
                this.partialCover.bottom.style.height =
                    window.innerHeight - targetMidpoint.y - targetSize.y + "px";
            }
            if (targetElement && this.config.shadowTargets && !useCircle) {
                targetElement.classList.add("arrowed");
            }
        }
    }

    async _prepDraw(id, targetElement) {
        const [_, canvas] = this._getOverlay(true);

        // Clear out colliding arrows
        if (this.config.mode === "single") {
            this._clearArrows();
            this._setCanvasSize(canvas);
        } else {
            this._removeArrow(id);
        }

        await this._scrollIntoView(targetElement);


        if (this.forceRedraw) {
            // Redraw old arrows if showing multiple
            this._redraw(canvas);
        }
    }

    async _drawArrow(id, text, targetElement) {
        const [overlay, canvas] = this._getOverlay(true);

        // Step 1: Find the center and dimensions of the target element
        const [targetSize, targetMidpoint] =
            this._calculateElementDimensions(targetElement);

        // Focus on target
        await this._focusOnTarget(targetElement, targetSize, targetMidpoint);
        if (
            this.config.mode === "single" &&
            this.current &&
            id !== this.current[0]
        ) {
            return;
        }

        // Step 2: Create text element
        const textElement = this._attachTextElement(text, overlay);
        textElement.id = "arrow_" + id;
        this.arrows[id] = { text, targetElement, textElement };

        // Step 3: Calculate position for the text element
        let [textSize] = this._calculateElementDimensions(textElement);
        const margin = Math.min(
            this.config.maxMargin,
            Math.max(10, document.body.clientWidth / 10)
        );
        // Margin between text element and target element
        const canvasPadding = 10;
        // Padding around canvas to prevent arrow from going outside
        const textPos = this._calculateTextElementPosition(
            targetElement,
            textSize,
            targetMidpoint,
            targetSize,
            margin,
            canvasPadding
        );
        this._positionTextElement(textElement, textPos);

        // Step 4: Find dimensions of the text element
        let [, textMidpoint] = this._calculateElementDimensions(textElement);

        // Step 5: Draw arrow from text element to target element
        if (targetElement) {
            const [startPoint, targetPoint] = this._calculateArrowPoints(
                targetMidpoint,
                targetSize,
                textMidpoint,
                textSize
            );
            const isWide = targetSize.x > targetSize.y;
            const positiveCurvature = this._calculatePositiveCurvature(
                startPoint,
                targetPoint,
                isWide
            );

            this._drawCurvedArrowOnCanvas(
                canvas,
                startPoint,
                targetPoint,
                positiveCurvature
            );
        }
    }

    async _moveFocusToTarget(targetSize, targetMidpoint) {
        if (!this.config.mode == "single") {
            return;
        }
        const maxDimension = Math.max(targetSize.x, targetSize.y);
        const maxSpace = Math.min(window.innerWidth, window.innerHeight);
        const useCircle = maxDimension * 1.4 < maxSpace * 0.4;
        const focusFieldCircle = document.getElementById("focus_field_circle");
        const focusFieldRect = document.getElementById("focus_field_rect");

        if (focusFieldCircle) {
            focusFieldCircle.setAttribute("cx", targetMidpoint.x);
            focusFieldCircle.setAttribute("cy", targetMidpoint.y);
            focusFieldCircle.setAttribute(
                "r",
                useCircle ? (maxDimension / 2) * 1.4 : 0
            );
        }
        if (focusFieldRect) {
            focusFieldRect.setAttribute(
                "x",
                useCircle
                    ? targetMidpoint.x
                    : targetMidpoint.x - targetSize.x / 2
            );
            focusFieldRect.setAttribute(
                "y",
                useCircle
                    ? targetMidpoint.y
                    : targetMidpoint.y - targetSize.y / 2
            );
            focusFieldRect.setAttribute("width", useCircle ? 0 : targetSize.x);
            focusFieldRect.setAttribute("height", useCircle ? 0 : targetSize.y);
        }

        return new Promise((resolve) => {
            setTimeout(
                () => resolve(useCircle),
                this.disableAnimationTime || maxDimension === 0
                    ? 0
                    : this.config.animationTime || 0
            );
        });
    }

    _redraw(canvas) {
        this._setCanvasSize(canvas);
        return Promise.all(
            Object.keys(this.arrows).map((key) =>
                this._drawArrow(
                    key,
                    this.arrows[key].text,
                    this.arrows[key].targetElement
                )
            )
        );
    }

    _cleanup() {
        super._cleanup();
        this._clearArrows();
        this._removeShadowing();
        // var future = [];
        // this.past = [];
        // this.current = null;
        this._removeInfoOverlay();
    }

    static #instance = null;
    static get instance() {
        Arrows.#instance ??= new Arrows();
        return Arrows.#instance;
    }
}
