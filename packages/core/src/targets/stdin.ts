/** Reads all of stdin as a UTF-8 string. Used for the `-` document target. */
export async function readStdin(): Promise<string> {
   const chunks: Buffer[] = [];
   for await (const chunk of process.stdin) {
      chunks.push(Buffer.from(chunk as Buffer | string));
   }
   return Buffer.concat(chunks).toString('utf8');
}
