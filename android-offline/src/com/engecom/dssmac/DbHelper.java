package com.engecom.dssmac;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;

import java.util.ArrayList;
import java.util.List;

public class DbHelper extends SQLiteOpenHelper {
    private static final String DB_NAME = "dssmac_offline.db";
    private static final int DB_VERSION = 1;

    public DbHelper(Context context) {
        super(context, DB_NAME, null, DB_VERSION);
    }

    @Override
    public void onCreate(SQLiteDatabase db) {
        db.execSQL("CREATE TABLE team (" +
                "id INTEGER PRIMARY KEY, " +
                "name TEXT, " +
                "district TEXT, " +
                "updated_at INTEGER)");
        db.execSQL("CREATE TABLE assignments (" +
                "id INTEGER PRIMARY KEY, " +
                "session_id INTEGER, " +
                "title TEXT, " +
                "date TEXT, " +
                "week TEXT, " +
                "month_year TEXT, " +
                "time_start TEXT, " +
                "time_end TEXT, " +
                "description TEXT, " +
                "instructor_name TEXT, " +
                "status TEXT, " +
                "sub_count INTEGER DEFAULT 0, " +
                "updated_at INTEGER)");
        db.execSQL("CREATE TABLE queue (" +
                "id INTEGER PRIMARY KEY AUTOINCREMENT, " +
                "assignment_id INTEGER NOT NULL, " +
                "file_path TEXT NOT NULL, " +
                "original_name TEXT, " +
                "mime_type TEXT, " +
                "status TEXT DEFAULT 'pending', " +
                "error TEXT, " +
                "created_at INTEGER)");
        db.execSQL("CREATE INDEX idx_queue_assignment ON queue(assignment_id)");
        db.execSQL("CREATE INDEX idx_queue_status ON queue(status)");
    }

    @Override
    public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
        db.execSQL("DROP TABLE IF EXISTS queue");
        db.execSQL("DROP TABLE IF EXISTS assignments");
        db.execSQL("DROP TABLE IF EXISTS team");
        onCreate(db);
    }

    public void saveTeam(long id, String name, String district) {
        SQLiteDatabase db = getWritableDatabase();
        ContentValues values = new ContentValues();
        values.put("id", id);
        values.put("name", name);
        values.put("district", district);
        values.put("updated_at", System.currentTimeMillis());
        db.replace("team", null, values);
    }

    public TeamInfo getTeam() {
        Cursor c = getReadableDatabase().rawQuery("SELECT id, name, district, updated_at FROM team LIMIT 1", null);
        try {
            if (!c.moveToFirst()) return null;
            TeamInfo info = new TeamInfo();
            info.id = c.getLong(0);
            info.name = c.getString(1);
            info.district = c.getString(2);
            info.updatedAt = c.getLong(3);
            return info;
        } finally {
            c.close();
        }
    }

    public void replaceAssignments(List<Assignment> assignments) {
        SQLiteDatabase db = getWritableDatabase();
        db.beginTransaction();
        try {
            db.delete("assignments", null, null);
            for (Assignment a : assignments) {
                ContentValues values = new ContentValues();
                values.put("id", a.id);
                values.put("session_id", a.sessionId);
                values.put("title", a.title);
                values.put("date", a.date);
                values.put("week", a.week);
                values.put("month_year", a.monthYear);
                values.put("time_start", a.timeStart);
                values.put("time_end", a.timeEnd);
                values.put("description", a.description);
                values.put("instructor_name", a.instructorName);
                values.put("status", a.status);
                values.put("sub_count", a.subCount);
                values.put("updated_at", System.currentTimeMillis());
                db.replace("assignments", null, values);
            }
            db.setTransactionSuccessful();
        } finally {
            db.endTransaction();
        }
    }

    public List<Assignment> getAssignments() {
        ArrayList<Assignment> list = new ArrayList<>();
        Cursor c = getReadableDatabase().rawQuery(
                "SELECT id, session_id, title, date, week, month_year, time_start, time_end, " +
                        "description, instructor_name, status, sub_count FROM assignments ORDER BY date DESC, id DESC",
                null
        );
        try {
            while (c.moveToNext()) {
                Assignment a = new Assignment();
                a.id = c.getLong(0);
                a.sessionId = c.getLong(1);
                a.title = c.getString(2);
                a.date = c.getString(3);
                a.week = c.getString(4);
                a.monthYear = c.getString(5);
                a.timeStart = c.getString(6);
                a.timeEnd = c.getString(7);
                a.description = c.getString(8);
                a.instructorName = c.getString(9);
                a.status = c.getString(10);
                a.subCount = c.getInt(11);
                list.add(a);
            }
        } finally {
            c.close();
        }
        return list;
    }

    public long addQueueItem(long assignmentId, String filePath, String originalName, String mimeType) {
        ContentValues values = new ContentValues();
        values.put("assignment_id", assignmentId);
        values.put("file_path", filePath);
        values.put("original_name", originalName);
        values.put("mime_type", mimeType);
        values.put("status", "pending");
        values.put("created_at", System.currentTimeMillis());
        return getWritableDatabase().insert("queue", null, values);
    }

    public List<QueueItem> getPendingQueue() {
        ArrayList<QueueItem> list = new ArrayList<>();
        Cursor c = getReadableDatabase().rawQuery(
                "SELECT id, assignment_id, file_path, original_name, mime_type, status, error FROM queue " +
                        "WHERE status IN ('pending','error') ORDER BY created_at",
                null
        );
        try {
            while (c.moveToNext()) list.add(readQueueItem(c));
        } finally {
            c.close();
        }
        return list;
    }

    public int getQueueCount() {
        Cursor c = getReadableDatabase().rawQuery("SELECT COUNT(*) FROM queue", null);
        try {
            return c.moveToFirst() ? c.getInt(0) : 0;
        } finally {
            c.close();
        }
    }

    public int getQueueCountForAssignment(long assignmentId) {
        Cursor c = getReadableDatabase().rawQuery(
                "SELECT COUNT(*) FROM queue WHERE assignment_id=?",
                new String[] { String.valueOf(assignmentId) }
        );
        try {
            return c.moveToFirst() ? c.getInt(0) : 0;
        } finally {
            c.close();
        }
    }

    public void markUploading(long id) {
        ContentValues values = new ContentValues();
        values.put("status", "uploading");
        values.putNull("error");
        getWritableDatabase().update("queue", values, "id=?", new String[] { String.valueOf(id) });
    }

    public void markError(long id, String error) {
        ContentValues values = new ContentValues();
        values.put("status", "error");
        values.put("error", error);
        getWritableDatabase().update("queue", values, "id=?", new String[] { String.valueOf(id) });
    }

    public void deleteQueueItem(long id) {
        getWritableDatabase().delete("queue", "id=?", new String[] { String.valueOf(id) });
    }

    private QueueItem readQueueItem(Cursor c) {
        QueueItem item = new QueueItem();
        item.id = c.getLong(0);
        item.assignmentId = c.getLong(1);
        item.filePath = c.getString(2);
        item.originalName = c.getString(3);
        item.mimeType = c.getString(4);
        item.status = c.getString(5);
        item.error = c.getString(6);
        return item;
    }

    public static class TeamInfo {
        public long id;
        public String name;
        public String district;
        public long updatedAt;
    }

    public static class Assignment {
        public long id;
        public long sessionId;
        public String title;
        public String date;
        public String week;
        public String monthYear;
        public String timeStart;
        public String timeEnd;
        public String description;
        public String instructorName;
        public String status;
        public int subCount;
    }

    public static class QueueItem {
        public long id;
        public long assignmentId;
        public String filePath;
        public String originalName;
        public String mimeType;
        public String status;
        public String error;
    }
}
