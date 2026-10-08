export interface User {
  id: string;
  name: string;
  email?: string;
}

const users = new Map<string, User>();

export async function fetchUser(id: string): Promise<User | undefined> {
  if (!id) throw new Error("missing id");
  return users.get(id);
}
