/* Bridge to the Android shell.
   WebView does not honour <a download> for blob URLs, so exports have to be
   handed to native code. Outside the app (plain browser) this is a no-op and
   the caller falls back to the normal anchor download. */

type Bridge = { saveFile?: (name: string, base64: string) => void };

const bridge = (): Bridge | undefined => (window as any).MastersEye;

export const canSaveNatively = (): boolean => typeof bridge()?.saveFile === 'function';

export async function saveBlob(blob: Blob, name: string): Promise<boolean> {
  const target = bridge();
  if (typeof target?.saveFile !== 'function') return false;
  try {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      binary += String.fromCharCode.apply(
        null,
        Array.from(bytes.subarray(i, i + CHUNK)) as unknown as number[]
      );
    }
    target.saveFile(name, btoa(binary));
    return true;
  } catch {
    return false;
  }
}
