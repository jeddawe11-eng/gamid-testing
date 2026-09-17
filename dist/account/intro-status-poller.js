export const INTRO_STATUS_POLL_INTERVAL_MS = 3000;
export const INTRO_STATUS_POLL_MAX_MS = 5 * 60 * 1000;
const TERMINAL_STATES = new Set(["ready","failed","cancelled"]);
const scheduleBrowserTimer = (callback,delay) => globalThis.setTimeout(callback,delay);
const clearBrowserTimer = timer => globalThis.clearTimeout(timer);

export const isTerminalIntroState = intro => TERMINAL_STATES.has(intro?.latest_job_state);
export const isProcessingIntroState = intro => ["pending","processing"].includes(intro?.latest_job_state);

export class IntroStatusPoller {
  constructor({ load, onState, intervalMs=INTRO_STATUS_POLL_INTERVAL_MS, maxDurationMs=INTRO_STATUS_POLL_MAX_MS, now=Date.now, setTimer=scheduleBrowserTimer, clearTimer=clearBrowserTimer }) {
    this.load=load; this.onState=onState; this.intervalMs=intervalMs; this.maxDurationMs=maxDurationMs;
    this.now=now; this.setTimer=setTimer; this.clearTimer=clearTimer;
    this.timer=null; this.deadline=0; this.generation=0; this.inFlight=null; this.active=false;
  }

  start() {
    if (this.active) return false;
    this.active=true; this.deadline=this.now()+this.maxDurationMs; this.generation+=1;
    this.schedule();
    return true;
  }

  stop() {
    this.active=false; this.deadline=0; this.generation+=1;
    if (this.timer !== null) this.clearTimer(this.timer);
    this.timer=null;
  }

  schedule() {
    if (!this.active) return;
    if (this.now() >= this.deadline) { this.stop(); return; }
    if (this.timer !== null) this.clearTimer(this.timer);
    const generation=this.generation;
    this.timer=this.setTimer(() => this.tick(generation),this.intervalMs);
  }

  async tick(generation=this.generation) {
    if (!this.active || generation !== this.generation) return;
    this.timer=null;
    if (this.now() >= this.deadline) { this.stop(); return; }
    try { await this.refreshNow(generation); }
    catch { /* A later poll or foreground refresh can recover a transient read. */ }
    if (this.active && generation === this.generation) this.schedule();
  }

  async refreshNow(generation=this.generation) {
    if (this.inFlight) return this.inFlight;
    const operation=(async () => {
      const intro=await this.load();
      if (generation !== this.generation) return intro;
      await this.onState(intro);
      if (isTerminalIntroState(intro)) this.stop();
      return intro;
    })();
    this.inFlight=operation;
    try { return await operation; }
    finally { if (this.inFlight === operation) this.inFlight=null; }
  }
}
