import { describe, it } from 'mocha';
import { Job, JobStatus } from '../../app/models/job';
import { hookTransaction } from '../helpers/db';
import { assert, expect } from 'chai';
import { baseResultsLimitedMessage } from '../../app/middleware/cmr-granule-locator';
import TurboService from '../../app/models/services/turbo-service';
import DataOperation from '../../app/models/data-operation';
import env from '../../app/util/env';
import { v4 as uuid } from 'uuid';


const config = {
  name: 'first-service',
  type: { name: 'turbo' },
  collections: [{ id: 'collection' }],
  capabilities: {
    output_formats: ['image/tiff', 'application/x-netcdf4'],
    subsetting: {
    },
  },
};
const originalPreviewThreshold = env.previewThreshold;

/**
 * Build an operation for the tests.
 * @returns DataOperation
 */
function buildOperation(message: string): DataOperation {
  const operation = new DataOperation();
  operation.requestId = uuid().toString();
  operation.user = 'Bo';
  operation.granuleIds = ['g1'];
  operation.requireSynchronous = false;
  operation.maxResults = 10;
  operation.cmrHits = 100;
  operation.scrollIDs = [];
  operation.cmrQueryLocations = [];
  operation.message = message;
  operation.requestStartTime = new Date();
  operation.ignoreErrors = true;
  return operation;
}


describe('skipPreview, pause, resume, and updateStatus job message handling', async function () {
  describe('for a RUNNING job', function () {
    describe('with a default running message', function () {
      let job: Job;
      hookTransaction();
      before(async function () {
        env.previewThreshold = 100; // ensure initial job state is RUNNING
        const requestString = 'http://localhost:3000/C1233800302-EEDTEST/ogc-api-coverages/1.0.0/collections/all/coverage/rangeset?maxResults=10';
        job = (new TurboService(config, buildOperation(undefined)))._createJob(requestString);
        assert(job.status === JobStatus.RUNNING);
        await job.save(this.trx);
      });
      after(async function () {
        env.previewThreshold = originalPreviewThreshold;
      });
      it('sets the appropriate message when paused', async function () {
        job.pause();
        await job.save(this.trx);
        const updatedJob = await Job.byJobID(this.trx, job.jobID);
        expect(updatedJob.message).to.eq('The job is paused and may be resumed using the provided link');
      });
      it('sets the appropriate message when resumed', async function () {
        job.resume();
        await job.save(this.trx);
        const updatedJob = await Job.byJobID(this.trx, job.jobID);
        expect(updatedJob.message).to.eq('The job is being processed');
      });
    });
    describe('with a results limited running message', function () {
      let job: Job;
      let limitedMessage: string;
      hookTransaction();
      before(async function () {
        env.previewThreshold = 100; // ensure initial job state is RUNNING
        limitedMessage = `${baseResultsLimitedMessage(100, 10)}.`;
        const requestString = 'http://localhost:3000/C1233800302-EEDTEST/ogc-api-coverages/1.0.0/collections/all/coverage/rangeset?maxResults=10';
        job = (new TurboService(config, buildOperation(limitedMessage)))._createJob(requestString);
        assert(job.status === JobStatus.RUNNING);
        await job.save(this.trx);
      });
      it('sets the appropriate message when paused', async function () {
        job.pause();
        await job.save(this.trx);
        const updatedJob = await Job.byJobID(this.trx, job.jobID);
        expect(updatedJob.message).to.eq('The job is paused and may be resumed using the provided link');
      });
      it('sets the appropriate message when resumed', async function () {
        job.resume();
        await job.save(this.trx);
        const updatedJob = await Job.byJobID(this.trx, job.jobID);
        expect(updatedJob.message).to.eq(limitedMessage);
      });
    });
  });
  describe('for a PREVIEWING job', function () {
    describe('with a default previewing message', function () {
      let job: Job;
      let skipJob: Job;
      hookTransaction();
      before(async function () {
        env.previewThreshold = 5; // ensure initial job state is PREVIEWING
        const requestString = 'http://localhost:3000/C1233800302-EEDTEST/ogc-api-coverages/1.0.0/collections/all/coverage/rangeset?maxResults=10';
        job = (new TurboService(config, buildOperation(undefined)))._createJob(requestString);
        await job.save(this.trx);
        assert(job.status === JobStatus.PREVIEWING);
        skipJob = (new TurboService(config, buildOperation(undefined)))._createJob(requestString);
        await skipJob.save(this.trx);
        assert(skipJob.status === JobStatus.PREVIEWING);
      });
      describe('which is paused, then resumed', function () {
        it('sets the appropriate message when paused', async function () {
          job.pause();
          await job.save(this.trx);
          const updatedJob = await Job.byJobID(this.trx, job.jobID);
          expect(updatedJob.message).to.eq('The job is paused and may be resumed using the provided link');
        });
        it('sets the appropriate message when resumed', async function () {
          job.resume();
          await job.save(this.trx);
          const updatedJob = await Job.byJobID(this.trx, job.jobID);
          expect(updatedJob.message).to.eq('The job is being processed');
        });
      });
      describe('which skips preview, pauses, and then resumes', function () {
        it('sets the appropriate message when skipping preview', async function () {
          skipJob.skipPreview();
          await skipJob.save(this.trx);
          const updatedJob = await Job.byJobID(this.trx, skipJob.jobID);
          expect(updatedJob.message).to.eq('The job is being processed');
        });
        it('sets the appropriate message when paused', async function () {
          skipJob.pause();
          await skipJob.save(this.trx);
          const updatedJob = await Job.byJobID(this.trx, skipJob.jobID);
          expect(updatedJob.message).to.eq('The job is paused and may be resumed using the provided link');
        });
        it('sets the appropriate message when resumed', async function () {
          skipJob.resume();
          await skipJob.save(this.trx);
          const updatedJob = await Job.byJobID(this.trx, skipJob.jobID);
          expect(updatedJob.message).to.eq('The job is being processed');
        });
      });
    });
    describe('with a results limited previewing message', function () {
      let job: Job;
      let skipJob: Job;
      let completeJob: Job;
      let limitedMessage: string;
      hookTransaction();
      before(async function () {
        env.previewThreshold = 5; // ensure initial job state is PREVIEWING
        const requestString = 'http://localhost:3000/C1233800302-EEDTEST/ogc-api-coverages/1.0.0/collections/all/coverage/rangeset?maxResults=10';
        limitedMessage = `${baseResultsLimitedMessage(100, 10)}.`;        
        job = (new TurboService(config, buildOperation(limitedMessage)))._createJob(requestString);
        await job.save(this.trx);
        assert(job.status === JobStatus.PREVIEWING);
        skipJob = (new TurboService(config, buildOperation(limitedMessage)))._createJob(requestString);
        await skipJob.save(this.trx);
        assert(skipJob.status === JobStatus.PREVIEWING);
        completeJob = (new TurboService(config, buildOperation(limitedMessage)))._createJob(requestString);
        await completeJob.save(this.trx);
        assert(completeJob.status === JobStatus.PREVIEWING);
      });
      after(async function () {
        env.previewThreshold = originalPreviewThreshold;
      });
      describe('which is paused, then resumed', function () {
        it('sets the appropriate message when paused', async function () {
          job.pause();
          await job.save(this.trx);
          const updatedJob = await Job.byJobID(this.trx, job.jobID);
          expect(updatedJob.message).to.eq('The job is paused and may be resumed using the provided link');
        });
        it('sets the appropriate message when resumed', async function () {
          job.resume();
          await job.save(this.trx);
          const updatedJob = await Job.byJobID(this.trx, job.jobID);
          expect(updatedJob.message).to.eq(limitedMessage);
        });
      });
      describe('which skips preview, pauses, and then resumes', function () {
        it('sets the appropriate message when skipping preview', async function () {
          skipJob.skipPreview();
          await skipJob.save(this.trx);
          const updatedJob = await Job.byJobID(this.trx, skipJob.jobID);
          expect(updatedJob.message).to.eq(limitedMessage);
        });
        it('sets the appropriate message when paused', async function () {
          skipJob.pause();
          await skipJob.save(this.trx);
          const updatedJob = await Job.byJobID(this.trx, skipJob.jobID);
          expect(updatedJob.message).to.eq('The job is paused and may be resumed using the provided link');
        });
        it('sets the appropriate message when resumed', async function () {
          skipJob.resume();
          await skipJob.save(this.trx);
          const updatedJob = await Job.byJobID(this.trx, skipJob.jobID);
          expect(updatedJob.message).to.eq(limitedMessage);
        });
      });
      describe('which is paused, then completed', function () {
        it('sets the appropriate message when paused', async function () {
          completeJob.pause();
          await completeJob.save(this.trx);
          const updatedJob = await Job.byJobID(this.trx, completeJob.jobID);
          expect(updatedJob.message).to.eq('The job is paused and may be resumed using the provided link');
        });
        it('sets the appropriate message when completed', async function () {
          completeJob.updateStatus(JobStatus.SUCCESSFUL);
          await completeJob.save(this.trx);
          const updatedJob = await Job.byJobID(this.trx, completeJob.jobID);
          expect(updatedJob.message).to.eq(limitedMessage);
        });
      });
    });
  });
});