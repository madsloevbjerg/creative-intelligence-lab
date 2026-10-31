/** Turn demo file bytes into the same data URL the page and the cache use. */

export function demoFileDataUrl(name: string, bytes: Uint8Array): string {
  const file = name.split("/").pop() ?? name;
  if (file.endsWith(".svg")) {
    const text = new TextDecoder().decode(bytes);
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(text)}`;
  }
  const mime = file.endsWith(".webp")
    ? "image/webp"
    : file.endsWith(".jpg") || file.endsWith(".jpeg")
      ? "image/jpeg"
      : "image/png";
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return `data:${mime};base64,${btoa(binary)}`;
}
