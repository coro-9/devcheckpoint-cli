import fs from 'node:fs';
import path from 'node:path';
import { strictGit, git } from './process.mjs';
import { requireThat, noLinksInPath, ns, relativeKey } from './common.mjs';

export function repository(root) {
  root = noLinksInPath(path.resolve(root));
  requireThat(fs.lstatSync(ns(path.join(root, '.git'))).isDirectory(), 'UNSUPPORTED', 'A self-contained .git directory is required (no linked worktrees or submodules)');
  requireThat(path.resolve(strictGit(root, ['rev-parse', '--show-toplevel']).trim()) === root, 'UNSUPPORTED', 'Specify the repository root');
  requireThat(strictGit(root, ['rev-parse', '--is-bare-repository']).trim() === 'false', 'UNSUPPORTED', 'Bare repositories are unsupported');
  const local = strictGit(root, ['config', '--local', '--list']);
  requireThat(!/^(?:include(?:if\.[^=]+)?\.path|filter\.[^=]+|core\.(?:worktree|hooksPath|fsmonitor|attributesFile|excludesFile|sparseCheckout)|extensions\.(?:worktreeConfig|partialClone))=/im.test(local), 'UNSUPPORTED', 'External Git filters/configuration or special repository layout is unsupported');
  for (const rel of ['.git/objects/info/alternates', '.git/commondir', '.git/shallow', '.git/modules', '.git/worktrees', '.git/info/sparse-checkout'])
    requireThat(!fs.existsSync(ns(path.join(root, rel))), 'UNSUPPORTED', 'Repository has external or incomplete Git storage');
  const files = strictGit(root, ['ls-files', '--stage', '-z']);
  requireThat(!/(?:^|\0)160000 /.test(files), 'UNSUPPORTED', 'Submodules are unsupported');
  const head = strictGit(root, ['rev-parse', '--verify', 'HEAD']).trim();
  const status = strictGit(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--ignored']);
  return { root, head, statusSha256Input: status, status: { modified: status.split('\0').filter(x => x && !x.startsWith('??') && !x.startsWith('!!')).length,
    untracked: status.split('\0').filter(x => x.startsWith('??')).length, ignored: status.split('\0').filter(x => x.startsWith('!!')).length } };
}
export function patchPaths(repo, patch, log) {
  const out = git(repo, ['apply', '--numstat', '-z', '--', patch], { log }).stdout;
  const paths = [];
  for (const line of out.split('\0').filter(Boolean)) {
    const match = /^(?:\d+|-)\t(?:\d+|-)\t(.+)$/.exec(line);
    requireThat(match, 'UNSUPPORTED', 'Empty, renamed, or unsupported patch path');
    const p = relativeKey(match[1]);
    requireThat(!p.split('/').some(x => x.toLowerCase() === '.git') && !/(^|\/)(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p), 'UNSUPPORTED', 'Patch targets a protected or device-named path');
    paths.push(p);
  }
  requireThat(paths.length > 0, 'GIT', 'Patch has no file changes');
  const text = fs.readFileSync(ns(patch), 'utf8');
  requireThat(!/^(?:old mode|new mode|new file mode|deleted file mode) (?:120000|160000)/m.test(text)
    && !/^index .* (?:120000|160000)$/m.test(text) && !/^(?:rename|copy) (?:from|to) /m.test(text), 'UNSUPPORTED', 'Link, submodule, rename and copy patches are unsupported');
  return [...new Set(paths)];
}
