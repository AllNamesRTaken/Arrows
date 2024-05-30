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
        storePreparation: false,
    };
    mission = "default";
    goblin = null;

    get quiver() { 
        return this.arrows.future;
    }
    get originalQuiver() { 
        return this.arrows.originalQuiver;
    }
    get progress() {
        return this.arrows.getProgress();
    }
    _summonSidekick() {
        this.goblin ??= getMonster({
            name: this.config.name,
            localStorage: true,
            defaults: { targets: {}, enabled: true },
        });
        return this.goblin;
    }

    async prepare(quiver, mission = "default", progress = 0) {
        await this._storeMission({quiver, mission, progress});
        this.load(quiver, progress);
        return this;
    }
    async _storeMission({target = null, quiver, progress = 0, mission = "default"}) {
        target ??= await this.config.spotFn();
        let {targets, missions} = await this.getMission(mission, target);
        missions ??= [];
        targets ??= {};
        targets[target] = missions;
        let missionData = missions.find(data => data.mission === mission);
        if (!missionData) {
            missionData = { mission };
            missions.push(missionData);
        }
        missionData.quiver = quiver;
        missionData.progress = progress;
        const goblin = this._summonSidekick();
        goblin.setCookie("targets", clone(targets));
    }

    async run(mission = "default") {
        const target = await this.config.spotFn();
        const {targets, missions, quiver, progress: startProgress} = await this.getMission(mission, target);
        if (!quiver) {
            throw new Error(`No quiver found for mission ${mission} on target ${target}`);
        }
        window.addEventListener("beforeunload", () => {
            const progress = this.arrows.getProgress(mission, target);
            this.setProgress(progress, mission, target);
        });
        if (await this.hasUnfinishedBusiness(mission, target)) {
            let show = true;
            if (startProgress === 0) {
                show = await this.config.tutorialFn();
            } else {
                show = await this.config.continueFn();
            }
            if (!show) {
                return;
            }
            this.mission = mission;
            let { progress } = await this.arrows
                .configure({
                    ...{
                        onExit: async ({exitReason, progress}) => {
                            await this.setProgress(progress, mission, target);
                            await this.config.onExit({exitReason, progress, archer: this})
                        },
                        onProgress: async ({progress}) => {
                            await this.setProgress(progress, mission, target);
                            await this.config.onProgress({progress, archer: this})
                        },
                        onEscape: async ({progress, arrows}) => {
                            return this.config.onEscape( {progress, archer: this})
                        },
                    },
                    ...this.config.arrowsConfig,
                })
                .load(quiver, startProgress)
                .fire();
            this.setProgress(progress, mission, target)
        }
    }

    async hasMissions(target = null) {
        const {missions} = await this.getMission("default", target);
        return !!missions;
    }

    async getMissions(target = null) {
        const {missions} = await this.getMission("default", target);
        return missions || [];
    }

    async hasMission(mission = "default", target = null) {
        const {missions} = await this.getMission(mission, target);
        return !!missions.find(m => m.mission === mission);
    }

    async hasUnfinishedBusiness(mission, target) {
        mission ??= "default";
        const {quiver, progress} = await this.getMission(mission, target);
        return !progress || progress < quiver.length;
    }

    load(quiver, progress = 0) {
        return this.arrows.load(quiver, progress);
    }

    async createArrows() {
        const { exitReason, progress, quiver } = await this.fletcher.configure(this.config.fletcherConfig).createArrows();
        this.load(quiver, progress);
        return this;
    }
    async getMission(mission = null, target = null) {
        mission ??= this.mission || "default";
        target ??= await this.config.spotFn();
        const goblin = this._summonSidekick();
        const targets = goblin.getCookie("targets");
        const missions = targets && targets[target] || null;
        const {quiver, progress} = missions && missions.find(data => data.mission === mission) || {quiver: null, progress: 0};
        return {targets, missions, quiver, progress};
    }
    async getProgress(mission, target = null) {
        mission ??= this.mission || "default";
        if (mission === this.mission) {
            return this.progress;
        }
        const {progress} = await this.getMission(mission, target);
        return progress;
    }

    async reset(mission, target) {
        await this.setProgress(0, mission, target);
        await this.config.onReset({progress: 0, archer: this, target});
        return this;
    }

    async setProgress(progress = 0, mission = null, target = null) {
        mission ??= this.mission || "default";
        target ??= await this.config.spotFn();
        const {targets, missions} = await this.getMission(mission, target);
        const missionData = missions.find(m => m.mission === mission);
        if(!missionData) {
            throw new Error(`Mission ${mission} not found on target ${target}`);
        }
        missionData.progress = progress;
        const goblin = this._summonSidekick();
        goblin.setCookie("targets", targets);
        await this.arrows.setProgress(progress);
        return this;
    }
    async removeAllTargets() {
        const goblin = this._summonSidekick();
        goblin.removeCookies("targets");
    }
    async removeTarget(target = null) {
        target ??= await this.config.spotFn();
        const {targets} = await this.getMission("default", target);
        if (!targets) {
            return;
        }
        delete targets[target];
        const goblin = this._summonSidekick();
        goblin.setCookie("targets", targets);
    }
    async removeMission(mission = "default", target = null) {
        target ??= await this.config.spotFn();
        const {targets, missions} = await this.getMission(mission, target);
        if (!missions) {
            return;
        }
        const goblin = this._summonSidekick();
        delete missions[mission];
        goblin.setCookie("targets", targets);
    }

    static #instance = null;
    static get instance() {
        Archer.#instance ??= new Archer();
        return Archer.#instance;
    }
    static get hero() {
        return Archer.instance;
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