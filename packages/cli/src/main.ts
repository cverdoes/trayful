/** The `trayful` command's entry point: runs the CLI and exits with its code. */
import { argv, exit } from 'node:process';
import { run } from './index.js';

exit(await run(argv.slice(2)));
