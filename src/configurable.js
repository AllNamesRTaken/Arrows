export default class Configurable {
    config = {
        escapeToExit: true,
        exitFn: null,
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
    exit(result) {
        this._cleanup();
        if (this.config.exitFn) {
            this.config.exitFn(result);
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
            this._setConfig("exitFn", fn);
        }
        this.exitPromise = this._createExitPromise();
        return this.exitPromise;
    }
}
