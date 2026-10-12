#!/usr/bin/env node
// Runs the TypeScript CLI directly, so `trayful` works from a checkout without a build step.
import { register } from 'tsx/esm/api';

register();
await import('../src/main.ts');
