import Fletcher from "./fletcher";
import Arrows from "./arrows";
import Configurable from "./configurable";
import { getMonster } from "goodcore/Cookie";
import { clone } from "goodcore/Obj"

export default class Archer extends Configurable {
    static Arrows = Arrows;
    static Fletcher = Fletcher;

    arrows = new Arrows();
    fletcher = new Fletcher();
    constructor() {
        super();
    }
    config = {
        name: "Robin Hood",
        spotFn: async () => _W.PageId,
        tutorialFn: async () => true,
        continueFn: async () => true,
        onExit: async ({exitReason, progress, archer}) => null,
        onProgress: async ({progress, archer}) => null,
        onReset: async ({progress, archer, target}) => null,
        onEscape: async ({progress, archer}) => false,
        arrowsConfig: {},
        fletcherConfig: {},
    };
    goblin = null;

    get quiver() { 
        return this.arrows.future;
    }
    get originalQuiver() { 
        return this.arrows.originalQuiver;
    }
    _summonSidekick() {
        this.goblin ??= getMonster({
            name: this.config.name,
            localStorage: true,
            defaults: { progress: {}, quivers: {}, enabled: true },
        });
        return this.goblin;
    }
    async run() {
        const goblin = this._summonSidekick();
        const progresses = goblin.getCookie("progress");
        const quivers = goblin.getCookie("quivers");
        const areEnabled = goblin.getCookie("enabled");
        var target = await this.config.spotFn();
        window.addEventListener("beforeunload", () => {
            const progress = this.arrows.getProgress();
            this.storeQuiver(target, quivers[target], progress);
        });
        if (
            target in quivers &&
            areEnabled &&
            progresses[target] < quivers[target].length - 1
        ) {
            let show = true;
            if (progresses[target] === 0) {
                show = await this.config.tutorialFn();
            } else {
                show = await this.config.continueFn();
            }
            if (!show) {
                return;
            }
            let { exitReason, progress } = await this.arrows
                .configure({
                    ...{
                        onExit: ({exitReason, progress}) => this.config.onExit({exitReason, progress, archer: this}),
                        onProgress: ({progress}) => this.config.onProgress({progress, archer: this}),
                    },
                    ...this.config.arrowsConfig,
                })
                .load(quivers[target], progresses[target])
                .fire();
            if (exitReason === "escape") {
                const continueLater = await this.config.onEscape({progress, archer: this});
                if (!continueLater) {
                    progress = quivers[target].length;
                }
            }
            this.storeQuiver(target, quivers[target], progress)
        }
    }
    async storeQuiver(target, quiver, progress = 0) {
        if (!target) {
            throw new Error("No target provided");
        }
        const goblin = this._summonSidekick();
        const quivers = goblin.getCookie("quivers");
        const progresses = goblin.getCookie("progress");
        progresses[target] = progress;
        quivers[target] = quiver;
        goblin.setCookie("quivers", clone(quivers));
        goblin.setCookie("progress", clone(progresses));
        // goblin.setCookie("enabled", true);
    }
    async prepare() {
        const { exitReason, progress, quiver } = await this.fletcher.configure(this.config.fletcherConfig).createArrows();
        const goblin = this._summonSidekick();
        if (quiver?.length) {
            const target = await this.config.spotFn();
            await this.storeQuiver(target, quiver);
        }
        return this;
    }
    async getProgress() {
        const target = await this.config.spotFn();
        const goblin = this._summonSidekick();
        const progresses = goblin.getCookie("progress");
        return progresses[target] ?? 0;
    }

    async reset(target) {
        await this.setProgress(0, target);
        return this;
    }

    async setProgress(progress = 0, target) {
        target ??= await this.config.spotFn();
        const goblin = this._summonSidekick();
        const progresses = goblin.getCookie("progress");
        progresses[target] = progress;
        goblin.setCookie("progress", progresses);
        this.config.onReset({progress, archer: this, target});
        return this;
    }

    static #instance = null;
    static get instance() {
        Archer.#instance ??= new Archer();
        return Archer.#instance;
    }
}

/*
// Example usage with tutorialFn

// To set up a tutorial
Archer.instance.configure({
    fletcherConfig: {
        onProgress: ({progress, quiver}) => console.log(`Fletcher Progress: ${progress + 1}/${quiver.length}`),
        onExit: ({exitReason, progress, quiver}) => console.log(`Fletcher Exit reason: ${exitReason}, Progress: ${progress + 1}/${quiver.length}`),
    }
}).prepare();

// To run the tutorial with configuration
Archer.instance.configure({
    onExit: ({exitReason, progress, archer}) => {
        console.log(`Archer Exit reason: ${exitReason}, Progress: ${progress + 1}/${archer.originalQuiver.length} remaining ${archer.quiver.length}`);
    },
    onProgress: ({progress, archer}) => {
        console.log(`Archer Progress: ${progress + 1}/${archer.originalQuiver.length} remaining ${archer.quiver.length}`);
    },
    onReset: ({progress, archer, target}) => {
        console.log(`Archer onReset Progress: ${progress + 1}/${archer.originalQuiver.length} on Target: ${target} remaining ${archer.quiver.length}`);
    },
    onEscape: ({progress, archer}) => {
        if (progress >= archer.originalQuiver.length - 1) {
            return false;
        }
        return new Promise(async (resolve, reject) => {
            var msg = await _W.Ask({title: "Done?", content: "The tutorial is not yet done, do you want to continue later?", formData: [] });
            resolve(msg.kind === 'action');
        })
    },
    tutorialFn: async () => {
        return new Promise(async (resolve, reject) => {
            var msg = await _W.Ask({title: "Tutorial available", content: "There is a tutorial available, do you want to run it?", formData: [] });
            resolve(msg.kind === 'action');
        })
    },
    continueFn: async () => {
        return new Promise(async (resolve, reject) => {
            var msg = await _W.Ask({title: "Tutorial available", content: "There is an unfinished tutorial available, do you want to continue?", formData: [] });
            resolve(msg.kind === 'action');
        })
    },
}).run();



*/