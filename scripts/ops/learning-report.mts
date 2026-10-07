/**
 * リーチの傾向を手で見る（読むだけ・誰にも送らない）。
 *   npx tsx scripts/ops/learning-report.mts [日数]
 */
const { loadLearningRows } = await import('../../server/learningReportJob');
const { learningReportText } = await import('../../shared/learningReport');
const days = Number(process.argv[2] || 21);
const { learning, all } = await loadLearningRows(days);
console.log(learningReportText({ learning, all, days }));
process.exit(0);
