#!/usr/bin/env node
/**
 * The `plurimath` bin entry (package.json `bin`). Wires `run` (`./run.ts`)
 * to the real process via `nodeIo` (`./node-io.ts`).
 */

import { nodeIo } from "./node-io";
import { run } from "./run";

const exitCode = await run(process.argv.slice(2), nodeIo);

process.exitCode = exitCode;
