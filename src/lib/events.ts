import { EventEmitter } from "node:events";

// instrumentation and route handlers are bundled separately, so shared state lives on globalThis
const shared = globalThis as unknown as { dataEvents?: EventEmitter; syncRunning?: Promise<void> | null };

shared.dataEvents ??= new EventEmitter().setMaxListeners(0);

export const dataEvents = shared.dataEvents;
export const syncState = shared;

export function notifyChange() {
  dataEvents.emit("change");
}
