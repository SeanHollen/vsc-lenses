import { debounce, formatMoney } from "./util";
import { readFile } from "./storage";
import { fetchUser, type User } from "./api";

const TAX_RATE = 0.08;

export interface Order {
  id: string;
  items: { sku: string; price: number; qty: number }[];
  coupon?: string;
}

export function subtotal(order: Order): number {
  return order.items.reduce((sum, item) => sum + item.price * item.qty, 0);
}

export function total(order: Order, discount: number): number {
  const base = subtotal(order);
  const discounted = base * (1 - discount);
  let shipping = 5;
  if (discounted > 100) {
    shipping = 0;
  } else if (order.items.length > 3) {
    shipping = 2.5;
  }
  return discounted * (1 + TAX_RATE) + shipping;
}

export function parseOrder(raw: string): Order {
  const data = JSON.parse(raw);
  if (!data.id) throw new Error("order has no id");
  return { id: String(data.id), items: data.items ?? [], coupon: data.coupon };
}

export async function loadOrders(path: string): Promise<Order[]> {
  const text = await readFile(path, "utf8");
  return text
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      try {
        return parseOrder(line);
      } catch (err) {
        console.warn("skipping bad order", err);
        return null;
      }
    })
    .filter((o): o is Order => o !== null);
}

export async function ownerOf(order: Order): Promise<User | undefined> {
  const user = await fetchUser(order.id.split("-")[0]);
  return user ?? undefined;
}

export const refresh = debounce(
  (orders: Order[]) => orders.map((o) => total(o, 0)),
  250,
);

export function receipt(order: Order): string {
  const lines = order.items.map(
    (i) => `${i.qty} x ${i.sku}: ${formatMoney(i.price * i.qty)}`,
  );
  return [
    ...lines,
    `Total: ${formatMoney(total(order, order.coupon ? 0.1 : 0))}`,
  ].join("\n");
}
