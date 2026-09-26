#!/usr/bin/env node
/**
 * The factory's entry point: load settings, open the run log, then hand the command line to the
 * CLI. Everything else lives in the slices under src/.
 */
import { reportStartupFailure, runProgram } from './cli/index.ts';
import { loadEnvFile, readRuntime, openTelemetry } from './kernel/index.ts';

const argv = process.argv.slice(2);

loadEnvFile();
const runtime = readRuntime();
if (runtime.success) await runProgram(argv, openTelemetry(runtime.data));
else reportStartupFailure(runtime, argv);
