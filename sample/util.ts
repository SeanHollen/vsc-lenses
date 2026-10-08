export function debounce<A extends unknown[]>(
  fn: (...args: A) => void,
  ms: number,
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...args: A) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

export const formatMoney = (n: number) => `$${n.toFixed(2)}`;
