import { atomic, json } from './common.mjs';

// Supported Node test-runner events; no parsing decorative console output.
export default async function* reporter(events) {
  let summary, summaries = 0, fileSummaries = 0, passed = 0, failed = 0, skipped = 0, todo = 0;
  for await (const event of events) {
    const d = event.data;
    if ((event.type === 'test:pass' || event.type === 'test:fail') && d.details?.type !== 'suite' && d.name !== d.file) {
      if (d.skip) skipped++; else if (d.todo) todo++;
      else if (event.type === 'test:pass') passed++; else failed++;
    }
    if (event.type === 'test:summary' && d.file === undefined) { summary = d; summaries++; }
    if (event.type === 'test:summary' && d.file !== undefined) fileSummaries++;
    if (event.type === 'test:fail') yield `Test failed: ${d.name}\n`;
  }
  const counts = summary?.counts;
  const complete = summaries === 1 && fileSummaries > 0 && !!counts && passed === counts.passed && skipped === counts.skipped && todo === counts.todo
    && failed === counts.failed + counts.cancelled;
  if (process.env.DCP_EVIDENCE) atomic(process.env.DCP_EVIDENCE, json({ version: 1, complete,
    total: counts?.tests ?? 0, passed: counts?.passed ?? 0, failed: counts?.failed ?? 0,
    skipped: counts?.skipped ?? 0, cancelled: counts?.cancelled ?? 0, todo: counts?.todo ?? 0 }));
  yield complete ? `Test evidence: ${counts.passed}/${counts.tests} passed\n` : 'Test evidence incomplete\n';
}
