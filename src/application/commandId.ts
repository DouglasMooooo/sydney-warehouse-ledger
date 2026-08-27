/** Browser- and Node-safe command identity generator. The ID is issued at preview
 * time, then the exact same value must be supplied to the confirm endpoint. */
export function newCommandId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (!uuid) throw new Error('COMMAND_ID_GENERATION_UNAVAILABLE');
  return `CMD-${uuid}`;
}
