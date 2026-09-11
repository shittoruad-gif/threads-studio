const { processAutoPostGeneration } = await import("../../server/autoPostScheduler");
for (const u of [2768, 78]) {
  const r = await processAutoPostGeneration({ onlyUserId: u, fillToday: true } as any);
  console.log(`FILL user=${u} ${JSON.stringify(r)}`);
}
process.exit(0);
