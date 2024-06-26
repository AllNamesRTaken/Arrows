export const STANDARD_EXIT = "standard";
export const ESCAPE_EXIT = "escape";
export const FINISHED_EXIT = "finished";
export const ERROR_EXIT = "error";

export default class Configurable {
    config = {
        onExit: async (result) => null,
    };
    isShowing = false;

    constructor() {
    }

    _setConfig(property, value) {
        if (!Object.keys(this.config).includes(property)) {
            throw new Error(
                `Illegal configuration property. Valid properties are:${Object.keys(
                    this.config
                )}`
            );
        }
        const propType = typeof this.config[property];
        if (propType != null && propType !== typeof value) {
            throw new Error(
                `Invalid configuration property value type.${property} is of type${typeof this
                    .config[property]}`
            );
        }
        this.config[property] = value;
    }

    configure(config) {
        if (!config) {
            return this;
        }
        Object.keys(config).forEach((key) => this._setConfig(key, config[key]));
        return this;
    }

    _cleanup() {
        this.isShowing = false;
    }
    async exit(result) {
        this._cleanup();
        if (this.config.onExit) {
            await this.config.onExit(result);
        }
        if (this.exitResolver) {
            var resolver = this.exitResolver;
            this.exitPromise = null;
            this.exitResolver = null;
            resolver(result);
        }
    }

    _createExitPromise() {
        if (this.exitPromise) {
            return this.exitPromise;
        }
        this.exitPromise = new Promise((resolve) => {
            this.exitResolver = resolve;
        });
        return this.exitPromise;
    }

    onExit(fn) {
        if (fn) {
            this._setConfig("onExit", fn);
        }
        this.exitPromise = this._createExitPromise();
        return this.exitPromise;
    }
}
