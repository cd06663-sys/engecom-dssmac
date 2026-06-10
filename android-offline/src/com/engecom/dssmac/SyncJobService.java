package com.engecom.dssmac;

import android.app.job.JobParameters;
import android.app.job.JobService;

public class SyncJobService extends JobService {
    @Override
    public boolean onStartJob(JobParameters params) {
        new Thread(() -> {
            SyncWorker.SyncResult result = SyncWorker.syncAll(this);
            jobFinished(params, result.pending > 0);
        }).start();
        return true;
    }

    @Override
    public boolean onStopJob(JobParameters params) {
        return true;
    }
}
