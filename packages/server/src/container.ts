import { readFileSync } from 'node:fs';

/**
 * The container's default gateway: the address Docker's published ports forward the
 * computer's own requests from. Read from Linux's routing table; undefined when there
 * is no default route or the table cannot be read (not Linux, not a container).
 */
export function containerGateway(routes = '/proc/net/route'): string | undefined {
  let table: string;
  try {
    table = readFileSync(routes, 'utf8');
  } catch {
    return undefined;
  }
  for (const line of table.split('\n').slice(1)) {
    const [, destination, gateway] = line.trim().split(/\s+/);
    if (destination === '00000000' && gateway && gateway !== '00000000') return ipv4(gateway);
  }
  return undefined;
}

/** The routing table writes addresses as hex in the machine's byte order: little-endian. */
function ipv4(hex: string): string {
  const bytes = hex.match(/../g) ?? [];
  return bytes
    .reverse()
    .map((b) => parseInt(b, 16))
    .join('.');
}
