// Query key conventions (plan.md): one place, use everywhere.
export const queryKeys = {
  me: ["me"] as const,
  categories: ["categories"] as const,
  animes: (categoryId: number) => ["animes", categoryId] as const,
  search: (q: string) => ["search", q] as const,
  share: ["share"] as const,
  shareData: (token: string) => ["shareData", token] as const,
};
