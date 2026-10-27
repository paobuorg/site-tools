import { loadContent, defaultContentRoots } from '@paobu/core/content';

const content = loadContent({ roots: defaultContentRoots(), allowUnreviewed: false });
const tools = content.visible('tool');
if (tools.length === 0) {
  console.error('Production content guard failed: no published tool is available.');
  process.exit(1);
}
console.log(`Production content guard passed: tool=${tools.length}.`);
