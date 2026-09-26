/**
 * Pi's file tools, confined to the workspace. They run inside the factory's own process, not
 * the sandbox, so each one checks its path first: a path outside the workspace, even one reached
 * through a link inside it, is refused.
 */
import {
  createEditToolDefinition,
  createGrepToolDefinition,
  createLsToolDefinition,
  createReadToolDefinition,
  createWriteToolDefinition,
  defineTool,
  type ToolDefinition,
} from '@earendil-works/pi-coding-agent';
import { existsSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';

/** The real location of a path, or of its nearest existing folder when it doesn't exist yet. */
const realLocation = (path: string): string =>
  existsSync(path) || dirname(path) === path ? realpathSync(path) : realLocation(dirname(path));

/** Whether a path, as the agent gave it, resolves to somewhere inside the workspace. */
export const isInsideWorkspace = (workspace: string, path: string): boolean => {
  const inside = relative(realpathSync(workspace), realLocation(resolve(workspace, path)));
  return inside === '' || (!inside.startsWith('..') && !isAbsolute(inside));
};

/** A tool that refuses any path outside the workspace before doing anything. */
const confine = <T extends ToolDefinition>(tool: T, workspace: string): T => ({
  ...tool,
  execute: (toolCallId, params, signal, onUpdate, context) => {
    const path =
      typeof params === 'object' && params !== null && 'path' in params ? params.path : null;
    if (typeof path === 'string' && !isInsideWorkspace(workspace, path)) {
      throw new Error(`${path} is outside the workspace; only files inside it are available.`);
    }
    return tool.execute(toolCallId, params, signal, onUpdate, context);
  },
});

/** Pi's read, write, edit, grep and ls tools, each confined to the workspace. */
export const createFileTools = (workspace: string) => ({
  read: defineTool(confine(defineTool(createReadToolDefinition(workspace)), workspace)),
  write: defineTool(confine(defineTool(createWriteToolDefinition(workspace)), workspace)),
  edit: defineTool(confine(defineTool(createEditToolDefinition(workspace)), workspace)),
  grep: defineTool(confine(defineTool(createGrepToolDefinition(workspace)), workspace)),
  ls: defineTool(confine(defineTool(createLsToolDefinition(workspace)), workspace)),
});
