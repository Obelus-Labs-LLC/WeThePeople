/**
 * Batch async requests to avoid overwhelming the server.
 * Processes items in chunks of `batchSize`, awaiting each chunk before starting the next.
 */
export async function batchRequests<T>(
  items: T[],
  fn: (item: T) => Promise<any>,
  batchSize = 10,
): Promise<PromiseSettledResult<any>[]> {
  const results: PromiseSettledResult<any>[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.allSettled(batch.map(fn));
    results.push(...batchResults);
  }
  return results;
}
