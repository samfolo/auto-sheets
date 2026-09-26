import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import { AGENT } from '../agent/index.ts';
import {
  childEnvironment,
  readCredentials,
  PATHS,
  PROJECT,
  fail,
  ok,
  type Result,
  readStamp,
} from '../kernel/index.ts';

/** One prerequisite, and whether it's in place. */
export interface Check {
  readonly name: string;
  readonly passed: boolean;
  /** What was found, or what's wrong. */
  readonly detail: string;
}

const formatCheck = (check: Check): string =>
  `${check.passed ? '✔' : '✖'} ${check.name}: ${check.detail}`;

export const renderChecks = (checks: readonly Check[]): string =>
  checks.map(formatCheck).join('\n');

const checkNode = (): Check => {
  const version = process.versions.node;
  const passed = Number(version.split('.')[0]) >= PROJECT.minimumNodeMajor;
  return {
    name: 'Node.js',
    passed,
    detail: passed ? version : `found ${version}; need ${PROJECT.minimumNodeMajor} or later`,
  };
};

const checkGit = (): Check => {
  const { commit, dirty } = readStamp();
  if (commit === null) {
    return {
      name: 'Git',
      passed: false,
      detail: 'not a Git checkout with a commit, so runs cannot be matched to a factory version',
    };
  }
  return {
    name: 'Git',
    passed: true,
    detail: `${commit.slice(0, 7)}${dirty ? ' with uncommitted changes' : ''}`,
  };
};

const checkCredentials = (): Check => {
  const credentials = readCredentials();
  if (credentials.success) {
    return { name: 'Credentials', passed: true, detail: 'all required credentials are set' };
  }
  const { details = [], message } = credentials.error;
  return { name: 'Credentials', passed: false, detail: details.join('; ') || message };
};

/**
 * Pi is installed, and its OpenRouter catalogue offers the model the agent uses. Pi lists a
 * provider's models only when it has that provider's key; listing is offline, so no model is
 * called.
 */
const checkAgent = (): Check => {
  if (!existsSync(AGENT.cli)) {
    return { name: 'Agent', passed: false, detail: 'Pi is not installed; run `npm install`' };
  }
  const credentials = readCredentials();
  if (!credentials.success) {
    return { name: 'Agent', passed: false, detail: 'needs OPENROUTER_API_KEY to list models' };
  }
  const listed = spawnSync(
    process.execPath,
    [AGENT.cli, '--offline', '--provider', AGENT.provider, '--list-models', AGENT.model],
    {
      encoding: 'utf8',
      env: {
        ...childEnvironment(),
        OPENROUTER_API_KEY: credentials.data.openRouterApiKey,
        PI_CODING_AGENT_DIR: join(PATHS.artifacts, 'pi'),
        PI_TELEMETRY: '0',
      },
    },
  );
  const offered = stripVTControlCharacters(listed.stdout)
    .split('\n')
    .some((line) => line.split(/\s+/).includes(AGENT.model));
  return offered
    ? { name: 'Agent', passed: true, detail: `Pi with ${AGENT.provider}/${AGENT.model}` }
    : {
        name: 'Agent',
        passed: false,
        detail: `Pi's ${AGENT.provider} catalogue has no ${AGENT.model}`,
      };
};

/**
 * Checks everything the factory needs before it runs. Each stage adds its own check
 * here when it's built: the browser, the Excel session, the agent runtime.
 */
export const doctor = async (): Promise<Result<Check[]>> => {
  const checks = [checkNode(), checkGit(), checkCredentials(), checkAgent()];
  const failed = checks.filter((check) => !check.passed);
  if (failed.length === 0) return ok(checks);
  return fail('ENVIRONMENT_NOT_READY', `${failed.length} of ${checks.length} checks failed.`, {
    details: checks.map(formatCheck),
    hint: `Fix the failed checks, then run \`${PROJECT.cli} doctor\` again.`,
  });
};
