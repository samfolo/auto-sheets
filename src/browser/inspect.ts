/**
 * Ways to look at a page without knowing its structure in advance. Use them to explore a new
 * target: they show the controls a screen reader would find, which is usually the most stable
 * way to drive and read an application. Playwright does the work: one accessibility snapshot
 * covers the page and its iframes, with each element's reference and position.
 */
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { Page } from 'playwright';
import * as z from 'zod';
import { attempt, fail, ok, PATHS, type Result, validate } from '../kernel/index.ts';
import { ariaNodeSchema, type AriaNode } from './contract.ts';

/** The roles Playwright knows, as its own `getByRole` declares them. */
type AriaRole = Parameters<Page['getByRole']>[0];

/** Roles worth listing when exploring: things a person can read or operate. */
const CONTROL_ROLES: ReadonlySet<string> = new Set<AriaRole>([
  'alert',
  'alertdialog',
  'button',
  'checkbox',
  'columnheader',
  'combobox',
  'dialog',
  'grid',
  'gridcell',
  'heading',
  'link',
  'menuitem',
  'rowheader',
  'status',
  'tab',
  'textbox',
]);

const SNAPSHOT_TIMEOUT_MS = 5_000;

/** A control found on the page, without the nodes inside it. */
export type Control = Omit<AriaNode, 'children'>;

const controlsIn = (nodes: readonly AriaNode[]): Control[] =>
  nodes.flatMap(({ children = [], ...node }) => [
    ...(CONTROL_ROLES.has(node.role) ? [node] : []),
    ...controlsIn(children),
  ]);

/** Lists the controls on the page and in its iframes, with their references and positions. */
export const listControls = async (page: Page): Promise<Result<Control[]>> => {
  const snapshot = await attempt(
    () => page.ariaSnapshotJSON({ mode: 'ai', boxes: true, timeout: SNAPSHOT_TIMEOUT_MS }),
    (reason) =>
      fail('BROWSER_ACTION_FAILED', 'Could not read the page’s accessibility tree.', {
        details: [reason],
      }),
  );
  if (!snapshot.success) return snapshot;
  const nodes = validate(z.array(ariaNodeSchema), snapshot.data, 'the accessibility snapshot');
  if (!nodes.success) return nodes;
  return ok(controlsIn(nodes.data));
};

/** One control as a line, in the style of Playwright's own snapshots. */
export const formatControl = ({ role, name, text, ref, box }: Control): string =>
  [
    role,
    name === undefined ? '' : ` "${name}"`,
    ref === undefined ? '' : ` [ref=${ref}]`,
    box === undefined ? '' : ` [box=${box.x},${box.y},${box.width},${box.height}]`,
    text === undefined || text === '' ? '' : `: ${text}`,
  ].join('');

/** Saves a screenshot of the page and returns its path. */
export const screenshot = async (page: Page, name: string): Promise<Result<string>> => {
  const stamp = new Date().toISOString().replaceAll(/[:.]/g, '-');
  const file = join(PATHS.browser.screenshots, `${stamp}-${name}.png`);
  return attempt(
    async () => {
      await mkdir(PATHS.browser.screenshots, { recursive: true });
      await page.screenshot({ path: file });
      return file;
    },
    (reason) =>
      fail('BROWSER_ACTION_FAILED', 'Could not take a screenshot.', { details: [reason] }),
  );
};
