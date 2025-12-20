import * as sandboxExecutor from './sandbox-executor.js';
import * as mediaGenerator from './media-generator.js';
import * as webTools from './web-tools.js';
import * as gitTools from './git-tools.js';

export {
  sandboxExecutor,
  mediaGenerator,
  webTools,
  gitTools
};

export const {
  executeSandboxed,
  executeSandboxedWithMount,
  ensureImage
} = sandboxExecutor;

export const {
  generateImage,
  generateAudio,
  generateImageVariation,
  getAvailableVoices,
  validateImageParams
} = mediaGenerator;

export const {
  searchWeb,
  searchWebAdvanced,
  fetchWebPage,
  searchNews,
  checkUrl
} = webTools;

export const {
  initRepository,
  cloneRepository,
  commitChanges,
  pushChanges,
  pullChanges,
  getStatus,
  listBranches,
  createBranch,
  checkoutBranch,
  getLog,
  configureRepository,
  commitAndPush
} = gitTools;

export default {
  sandboxExecutor,
  mediaGenerator,
  webTools,
  gitTools
};
