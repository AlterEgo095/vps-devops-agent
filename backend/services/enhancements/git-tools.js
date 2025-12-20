import simpleGit from 'simple-git';

export async function initRepository(repoPath) {
  try {
    const git = simpleGit(repoPath);
    await git.init();
    
    return {
      success: true,
      path: repoPath,
      message: 'Repository initialized'
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

export async function cloneRepository(repoUrl, destPath, options = {}) {
  try {
    const { branch = 'main', depth = null } = options;
    
    const git = simpleGit();
    const cloneOptions = [];
    
    if (branch) cloneOptions.push('--branch', branch);
    if (depth) cloneOptions.push('--depth', depth.toString());
    
    await git.clone(repoUrl, destPath, cloneOptions);
    
    return {
      success: true,
      repoUrl,
      destPath,
      branch
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

export async function commitChanges(repoPath, message, options = {}) {
  try {
    const git = simpleGit(repoPath);
    const { addAll = true, author = null } = options;
    
    if (addAll) {
      await git.add('.');
    }
    
    const commitOptions = {};
    if (author) {
      commitOptions['--author'] = `${author.name} <${author.email}>`;
    }
    
    const result = await git.commit(message, undefined, commitOptions);
    
    return {
      success: true,
      commit: result.commit,
      summary: result.summary,
      branch: result.branch,
      message
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

export async function pushChanges(repoPath, options = {}) {
  try {
    const git = simpleGit(repoPath);
    const { 
      remote = 'origin', 
      branch = 'main',
      force = false 
    } = options;
    
    const pushOptions = [];
    if (force) pushOptions.push('--force');
    
    await git.push(remote, branch, pushOptions);
    
    return {
      success: true,
      remote,
      branch,
      message: `Pushed to ${remote}/${branch}`
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

export async function pullChanges(repoPath, options = {}) {
  try {
    const git = simpleGit(repoPath);
    const { remote = 'origin', branch = 'main' } = options;
    
    const result = await git.pull(remote, branch);
    
    return {
      success: true,
      summary: result.summary,
      files: result.files,
      insertions: result.insertions,
      deletions: result.deletions
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

export async function getStatus(repoPath) {
  try {
    const git = simpleGit(repoPath);
    const status = await git.status();
    
    return {
      success: true,
      current: status.current,
      tracking: status.tracking,
      ahead: status.ahead,
      behind: status.behind,
      modified: status.modified,
      created: status.created,
      deleted: status.deleted,
      renamed: status.renamed,
      staged: status.staged,
      conflicted: status.conflicted
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

export async function listBranches(repoPath) {
  try {
    const git = simpleGit(repoPath);
    const branches = await git.branch();
    
    return {
      success: true,
      current: branches.current,
      all: branches.all,
      branches: branches.branches
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

export async function createBranch(repoPath, branchName, checkout = false) {
  try {
    const git = simpleGit(repoPath);
    
    if (checkout) {
      await git.checkoutBranch(branchName, 'HEAD');
    } else {
      await git.branch([branchName]);
    }
    
    return {
      success: true,
      branch: branchName,
      checkedOut: checkout
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

export async function checkoutBranch(repoPath, branchName) {
  try {
    const git = simpleGit(repoPath);
    await git.checkout(branchName);
    
    return {
      success: true,
      branch: branchName,
      message: `Switched to ${branchName}`
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

export async function getLog(repoPath, maxCount = 10) {
  try {
    const git = simpleGit(repoPath);
    const log = await git.log({ maxCount });
    
    return {
      success: true,
      total: log.total,
      commits: log.all.map(commit => ({
        hash: commit.hash,
        date: commit.date,
        message: commit.message,
        author: commit.author_name,
        email: commit.author_email
      }))
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

export async function configureRepository(repoPath, config) {
  try {
    const git = simpleGit(repoPath);
    
    if (config.userName) {
      await git.addConfig('user.name', config.userName);
    }
    
    if (config.userEmail) {
      await git.addConfig('user.email', config.userEmail);
    }
    
    if (config.remote) {
      const remotes = await git.getRemotes();
      const hasOrigin = remotes.some(r => r.name === 'origin');
      
      if (!hasOrigin) {
        await git.addRemote('origin', config.remote);
      } else {
        await git.remote(['set-url', 'origin', config.remote]);
      }
    }
    
    return {
      success: true,
      configured: Object.keys(config)
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

export async function commitAndPush(repoPath, message, options = {}) {
  try {
    const commitResult = await commitChanges(repoPath, message, options);
    if (!commitResult.success) {
      return commitResult;
    }
    
    const pushResult = await pushChanges(repoPath, options);
    if (!pushResult.success) {
      return pushResult;
    }
    
    return {
      success: true,
      commit: commitResult.commit,
      message: commitResult.message,
      pushed: true,
      remote: pushResult.remote,
      branch: pushResult.branch
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

export default {
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
};
