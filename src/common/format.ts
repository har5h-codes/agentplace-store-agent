export const money = (cents: number, currency: string) => ({
  amount: (cents / 100).toFixed(2),
  currency,
  display: new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100),
});

/** "2026-11-26" or a full ISO timestamp -> "Thursday, November 26". Dates are read in UTC. */
export const humanDate = (value: string) =>
  new Date(value.length === 10 ? `${value}T12:00:00Z` : value).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
