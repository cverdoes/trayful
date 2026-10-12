import { argv, exit } from 'node:process';
import { run } from './index.js';

exit(await run(argv.slice(2)));
