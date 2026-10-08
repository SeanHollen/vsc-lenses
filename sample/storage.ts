const files = new Map<string, string>();

export async function readFile(
  path: string,
  _encoding: "utf8",
): Promise<string> {
  const text = files.get(path);
  if (text === undefined) throw new Error(`no such file: ${path}`);
  return text;
}
