import { workerData } from 'node:worker_threads';
import { runResearchJob, type ResearchJob } from './research-jobs.ts';

const job = workerData as ResearchJob;
void runResearchJob(job).catch((error: unknown) => {
  console.error('[research-runner]', error);
  process.exitCode = 1;
});
