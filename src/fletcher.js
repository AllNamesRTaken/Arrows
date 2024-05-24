import {default as Configurable, STANDARD_EXIT, ESCAPE_EXIT, FINISHED_EXIT} from "./configurable";
import { debounce } from "goodcore/Util";
import { find, findAll, get, is, findParent } from "goodcore/Dom";
import Arrows from "./arrows";

export default class Fletcher extends Configurable {
    config = {
        escapeToExit: true,
        selector: "[id]",
        onExit: async ({exitReason, progress, quiver}) => null,
        onProgress: async ({progress, quiver}) => null,
    };
    exitPromise = null;
    exitResolver = null;
    selected = null;
    overlay = null;
    currentText = "";
    quiver = [];
    quiverIndex = 0;
    arrows = new Arrows().configure({
        maskOpacity: 0.2, 
        animationTime: 300, 
        escapeToExit: false, 
        overlayType: "clickthrough",
        clickToProgress: false,
        bindKeys: false,
        overlayId: "fletcher-overlay",
    });

    /* Constructor */
    constructor() {
        super();
        this._addKeyListeners();
    }

    /* Public Methods */

    exit({exitReason} = {exitReason: STANDARD_EXIT}) {
        console.log(JSON.stringify(this.quiver).replaceAll('\\', '\\\\'));
        super.exit({exitReason, progress: this.quiverIndex, quiver: this.quiver});
        this.arrows.exit();
        document.body.classList.remove("fletchered");
    }

    init() {
        if (this.overlay) return this.overlay;
        this.overlay = this._createOverlay();
        this._addCssClassToStyleSheet();
        document.body.classList.add("fletchered");
    }

    next() {
        if (this.quiverIndex >= this.quiver.length - 1) {
            return;
        }
        this.quiverIndex++;
        this.config.onProgress({progress: this.quiverIndex, quiver: this.quiver});
        this._showArrow(...this.quiver[this.quiverIndex]);
    }

    previous() {
        if (this.quiverIndex <= 0) {
            return;
        }
        this.quiverIndex--;
        this.config.onProgress({progress: this.quiverIndex, quiver: this.quiver});
        this._showArrow(...this.quiver[this.quiverIndex]);
    }

    createArrows(quiver) {
        this.init();
        this.arrows.reset();
        this.isShowing = true;
        if (quiver) {
            this._load(quiver);
            this._showArrow(...this.quiver[this.quiverIndex]);
        }
        return this.onExit();
    }

    /* Private Methods */

    _addKeyListeners() {
        window.addEventListener("keyup", this._keyPressHandler.bind(this));
    }
    _keyPressHandler(event) {
        if (!this.isShowing) {
            return;
        }
        switch (event.key) {
            case "Escape":
                if (this.config.escapeToExit) {
                    this.exit();
                }
                break;
            case "ArrowRight":
                if (event.ctrlKey) {
                    this.next();
                }
                break;
            case "ArrowLeft":
                if (event.ctrlKey) {
                    this.previous();
                }
                break;    
        }
    }
    _createOverlay() {
        // Create canvas element
        const overlay = document.createElement("div");
        overlay.id = "fletcher-overlay";
        overlay.className = "arr overlay";
        overlay.style.position = "fixed";
        overlay.style.top = "0";
        overlay.style.left = "0";
        overlay.style.width = "100%";
        overlay.style.height = "100%";
        overlay.style.zIndex = "9999";
        overlay.style.pointerEvents = "auto";

        this._addEventListeners(overlay);
        // Attach canvas to body
        document.body.appendChild(overlay);

        return overlay;
    }
    
    _addEventListeners(overlay) {
        let timer = null;
        overlay.addEventListener('pointermove', async (event) => {
            if (!this.isShowing || event.buttons > 0) return;
            this.overlay.style.pointerEvents = "none";
        });
        document.addEventListener('pointerdown', async (event) => {
            if (!this.isShowing) return;
            this.overlay.style.pointerEvents = "auto";
        }, true);
        overlay.addEventListener('pointerup', async (event) => {
            if (!this.isShowing) return;
            await this._selectElement(event);
            event.stopPropagation();
            event.preventDefault();
        });
    }
    _addCssClassToStyleSheet() {
        const selectableRule = `.fletchered ${this.config.selector}:not(.arr.overlay, .arr.overlay *) {
    outline: 1px dashed #FF69B480;
}`;
        const hoverRule = `.fletchered ${this.config.selector}:not(.arr.overlay, .fletcher-selected, .arr.overlay *):hover {
    outline: 1px solid hotpink;
}`;
        var style = document.createElement("style");
        document.head.appendChild(style);
        const firstSheet = style.sheet;
        if (
            Array.from(firstSheet.rules)
                .filter((x) => x.selectorText)
                .some((x) => x.selectorText.startsWith(".fletcher"))
        ) {
            return;
        }
        firstSheet.insertRule(hoverRule, 0);
        // firstSheet.insertRule(selectedRule, 0);
        firstSheet.insertRule(selectableRule, 0);
    }
    async _selectElement(event) {
        const el = this._detectElement(event);
        if (el) {
            await this._showArrow(null, null, el);
        }
        this.selected = el;
    }
    async _showArrow(id, text, el) {
        if ("string" === typeof el) {
            el = find(el);
        }
        this.currentId = id ??= `text${Object.keys(this.quiver).length}`;
        this.currentText = text ??= "Click to Edit\nCtrl+S to save";
        await this._highlightElement(el);
        await this.arrows.draw(this.currentId, this.currentText, el);
        this._makeTextEditable(id, el);
    }
    _makeTextEditable(id, el) {
        find(".arr.text")?.focus();
        setTimeout(() => find(".arr.text")?.focus());
        const textEl = get(`arrow_${id}`);
        if (!textEl) return;
        textEl.contentEditable = true;
        textEl.addEventListener("keyup", debounce((event) => {
            this.currentText = event.target.innerHTML;
        }));
        textEl.addEventListener("keydown", (event) => {
            if (event.ctrlKey && event.key === "s") {
                this._save(this.currentId, this.currentText, el);
                event.preventDefault();
                event.stopPropagation();
            }
        });
    }
    _detectElement(mouseEvent) {
        let match;
        this.overlay.style.pointerEvents = "none";
        let el = document.elementFromPoint(
            mouseEvent.clientX,
            mouseEvent.clientY
        );
        this.overlay.style.pointerEvents = "auto";

        if (is(".fletcher-selected, .fletcher-selected *", el)) {
            el = findParent(el, ".fletcher-selected") ?? el;
        } else if (is(this.config.selector, el)) {
            return el;
        }

        match = findParent(el, this.config.selector);
        return match;
    }
    async _highlightElement(el) {
        findAll('.fletcher-selected').forEach(x => x.classList.remove("fletcher-selected"));
        el.classList.add("fletcher-selected");
    }
    _save = debounce((id, text, el) => {
        const index = this.quiver.findIndex((x) => x[0] === id);
        if (index > -1) {
            this.quiver[index] = [id, text, "#" + el.id];
            this.config.onProgress({progress: index, quiver: this.quiver});
        } else {
            this.quiverIndex = this.quiver.push([id, text, "#" + el.id]) - 1;
            this.config.onProgress({progress: this.quiver.length - 1, quiver: this.quiver});
        }
    });
    _clearSelection() {
        const el = findAll(".fletcher-selected");
        el.forEach((el) => {
            el.style.outline = "";
            el.classList.remove("fletcher-selected");
        });
        this.selected = null;
    }
    _load(quiver) {
        if (!quiver) {
            return;
        }
        if ("string" === typeof quiver) {
            quiver = JSON.parse(quiver);
        }
        this.quiver = quiver;
        this.quiverIndex = 0;
    }
    _nextEl(el) {
        return findParent(el, selector);
    }
    _cleanup() {
        super._cleanup();
        findAll('.fletcher-selected').forEach(x => x.classList.remove("fletcher-selected"));
        if (this.overlay) {
            this.arrows.clear();
            this.overlay.remove();
            this.overlay = null;
        }
        this.quiver = [];
        this.quiverIndex = 0;
    }

    static #instance = null;
    static get instance() {
        Fletcher.#instance ??= new Fletcher();
        return Fletcher.#instance;
    }
}
