/** Attachments are single file names, never paths or encoded URLs. */
export function assertAttachmentName(name: unknown): asserts name is string {
  if (typeof name !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name)) {
    throw new Error('Invalid attachment file name.');
  }
}
