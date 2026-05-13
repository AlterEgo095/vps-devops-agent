/**
 * Checkpoints Module Entry Point
 * @module Checkpoints
 */

export { default as checkpointManager } from './manager.js';
export default (await import('./manager.js')).default;
