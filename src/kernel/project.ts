import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import packageJson from '../../package.json' with { type: 'json' };

const root = fileURLToPath(new URL('../../', import.meta.url));
const artifacts = join(root, 'artifacts');
const browser = join(artifacts, 'browser');

/** Facts about the factory itself. Other modules read them from here instead of repeating them. */
export const PROJECT = {
  /** The command people and agents type. The type check keeps it in step with package.json. */
  cli: 'factory' satisfies keyof typeof packageJson.bin,
  version: packageJson.version,
  /** Node runs the TypeScript directly, which needs type stripping. Read from package.json. */
  minimumNodeMajor: Number(/\d+/.exec(packageJson.engines.node)?.[0]),
} as const;

/** Every location the factory reads or writes, resolved from the repository root. */
export const PATHS = {
  root,
  /** The CLI's entry point, for anything that needs to run the factory as a process. */
  cli: join(root, 'src', 'main.ts'),
  /** Local settings and secrets. Gitignored. */
  envFile: join(root, '.env'),
  /** Local outputs such as logs, videos and traces. Gitignored. */
  artifacts,
  /** Where telemetry goes when no build has set FACTORY_LOG. */
  defaultLog: join(artifacts, 'factory.jsonl'),
  /** The long-lived browser session. See src/browser/session.ts. */
  browser: {
    /** The process that launches and owns the browser. */
    host: join(root, 'src', 'browser', 'host.ts'),
    /** Chromium's own state, including the Microsoft sign-in cookies. Never commit it. */
    profile: join(browser, 'profile'),
    /** Which session is running: its process and port. */
    session: join(browser, 'session.json'),
    /** What the host process printed, for when the browser fails to start. */
    hostLog: join(browser, 'host.log'),
    screenshots: join(browser, 'screenshots'),
  },
  /** Recorded cases for Excel: steps, what Excel did, and optional seed workbooks. */
  excelCases: join(root, 'targets', 'excel', 'cases'),
  /** What was learned about Excel while recording. */
  excelKnowledge: join(root, 'targets', 'excel', 'knowledge'),
  /** Notes from Microsoft's documentation of Excel, with their sources. */
  excelDocs: join(root, 'targets', 'excel', 'docs'),
  /** What a clone of Excel must provide: the brief a build's workspace starts with. */
  cloneSpec: join(root, 'targets', 'excel', 'clone', 'spec.md'),
  /** Agent definitions: each folder holds one agent's settings and prompts. */
  agents: join(root, 'agents'),
  /** What good work looks like, for every agent and target. */
  standards: {
    /** The judgement that tooling can't enforce, given to agents as context. */
    code: join(root, 'standards', 'code.md'),
    /** What tooling can enforce: the configuration every workspace starts with. */
    scaffold: join(root, 'standards', 'scaffold'),
  },
  /** One folder per build: the agent's events, its sessions and the summary. Gitignored. */
  runs: join(artifacts, 'runs'),
  /**
   * Where build workspaces go by default: beside the factory, never inside it, so an agent
   * can't see the factory's files.
   */
  builds: join(root, '..', `${packageJson.name}-builds`),
} as const;
