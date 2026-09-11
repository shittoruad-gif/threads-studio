const t0 = Date.now();
const { processAutoPostGeneration } = await import("../../server/autoPostScheduler");
const r = await processAutoPostGeneration({} as any);
console.log("RESULT", JSON.stringify(r), "minutes", ((Date.now() - t0) / 60000).toFixed(1));
process.exit(0);
