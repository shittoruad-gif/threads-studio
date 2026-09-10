const { processAutoPostGeneration } = await import("../../server/autoPostScheduler");
const users = [556, 2768, 3521, 4667, 5002, 5443, 5131, 78];
for (const u of users) {
  const r = await processAutoPostGeneration({ onlyUserId: u, fillToday: true } as any);
  console.log(`FILL user=${u} ${JSON.stringify(r)}`);
}
process.exit(0);
