export async function resolveSecret(rawVal: any): Promise<string> {
  if (!rawVal) return "";
  if (typeof rawVal === "object" && rawVal !== null && "get" in rawVal) {
    return await rawVal.get();
  }
  return String(rawVal);
}
