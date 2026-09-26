import { readCredentials } from '../contracts/environment.ts';
import { project } from '../core/project.ts';
import { fail, ok, type Result } from '../core/result.ts';
import { readStamp } from '../core/stamp.ts';

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
  const passed = Number(version.split('.')[0]) >= project.minimumNodeMajor;
  return {
    name: 'Node.js',
    passed,
    detail: passed ? version : `found ${version}; need ${project.minimumNodeMajor} or later`,
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
 * Checks everything the factory needs before it runs. Each stage adds its own check
 * here when it's built: the browser, the Excel session, the agent runtime.
 */
export const doctor = async (): Promise<Result<Check[]>> => {
  const checks = [checkNode(), checkGit(), checkCredentials()];
  const failed = checks.filter((check) => !check.passed);
  if (failed.length === 0) return ok(checks);
  return fail('ENVIRONMENT_NOT_READY', `${failed.length} of ${checks.length} checks failed.`, {
    details: checks.map(formatCheck),
    hint: `Fix the failed checks, then run \`${project.cli} doctor\` again.`,
  });
};
