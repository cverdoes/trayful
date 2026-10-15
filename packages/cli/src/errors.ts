/** A problem the person can fix, such as a port in use: the CLI prints it and exits with 1. */
export class CliError extends Error {}

/** Arguments the command does not understand: the CLI prints the command's usage and exits with 2. */
export class UsageError extends Error {}
