package com.engecom.dssmac;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) {
            DbHelper db = new DbHelper(context);
            if (db.getQueueCount() > 0) SyncWorker.schedule(context);
        }
    }
}
