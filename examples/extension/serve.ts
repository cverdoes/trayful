/**
 * Plays a folder of projects with the project cap on: `node serve.ts <folder> [max]`
 * (Node 22.18 or newer). See README.md.
 */
import { startServer } from 'trayful/server';
import { projectCap } from './extension.ts';

const [folder = '.', max = '3'] = process.argv.slice(2);
const server = await startServer({ projectDir: folder, extensions: [projectCap(Number(max))] });
console.log(`Trayful, with at most ${max} projects, at ${server.url}`);
