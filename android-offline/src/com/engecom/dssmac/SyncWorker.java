package com.engecom.dssmac;

import android.app.job.JobInfo;
import android.app.job.JobScheduler;
import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;
import android.net.ConnectivityManager;
import android.net.NetworkInfo;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

public class SyncWorker {
    public static final String SERVER = "https://engecom-dssmac-production.up.railway.app";
    public static final String PREFS = "engecom_dssmac";
    public static final String KEY_SERVER_URL = "server_url";
    public static final String KEY_TEAM_ID = "team_id";
    private static final int JOB_ID = 590013;

    public static String get(String url) throws Exception {
        return request("GET", url, null, null);
    }

    public static SyncResult syncAll(Context context) {
        SyncResult result = new SyncResult();
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String server = SERVER;
        long teamId = prefs.getLong(KEY_TEAM_ID, 0);
        if (teamId <= 0) {
            result.message = "Equipe não configurada.";
            return result;
        }
        if (!isOnline(context)) {
            result.message = "Sem internet. Os documentos continuam na fila.";
            result.pending = new DbHelper(context).getQueueCount();
            return result;
        }

        DbHelper db = new DbHelper(context);
        try {
            fetchPortal(db, server, teamId);
            result.downloaded = true;
        } catch (Exception e) {
            result.message = "Não foi possível atualizar treinamentos: " + e.getMessage();
        }

        int uploaded = 0;
        for (DbHelper.QueueItem item : db.getPendingQueue()) {
            try {
                db.markUploading(item.id);
                uploadOne(server, teamId, item);
                File f = new File(item.filePath);
                if (f.exists()) f.delete();
                db.deleteQueueItem(item.id);
                uploaded++;
            } catch (Exception e) {
                db.markError(item.id, e.getMessage());
            }
        }
        result.uploaded = uploaded;
        result.pending = db.getQueueCount();
        if (result.message == null) {
            if (uploaded > 0) result.message = uploaded + " documento(s) enviado(s).";
            else if (result.pending > 0) result.message = result.pending + " documento(s) ainda na fila.";
            else result.message = "Sincronização concluída.";
        }
        if (result.pending > 0) schedule(context);
        return result;
    }

    public static void schedule(Context context) {
        JobScheduler scheduler = (JobScheduler) context.getSystemService(Context.JOB_SCHEDULER_SERVICE);
        if (scheduler == null) return;
        ComponentName component = new ComponentName(context, SyncJobService.class);
        JobInfo job = new JobInfo.Builder(JOB_ID, component)
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .setBackoffCriteria(5 * 60 * 1000L, JobInfo.BACKOFF_POLICY_LINEAR)
                .setPersisted(true)
                .build();
        scheduler.schedule(job);
    }

    public static boolean isOnline(Context context) {
        ConnectivityManager manager = (ConnectivityManager) context.getSystemService(Context.CONNECTIVITY_SERVICE);
        if (manager == null) return false;
        NetworkInfo info = manager.getActiveNetworkInfo();
        return info != null && info.isConnected();
    }

    private static void fetchPortal(DbHelper db, String server, long teamId) throws Exception {
        String body = request("GET", server + "/api/portal/" + teamId, null, null);
        JSONObject json = new JSONObject(body);
        if (json.has("error")) throw new Exception(json.optString("error"));

        JSONObject team = json.getJSONObject("team");
        db.saveTeam(team.optLong("id", teamId), team.optString("name"), firstNonEmpty(
                team.optString("district_city"),
                team.optString("district_name")
        ));

        JSONArray arr = json.getJSONArray("assignments");
        List<DbHelper.Assignment> assignments = new ArrayList<>();
        for (int i = 0; i < arr.length(); i++) {
            JSONObject item = arr.getJSONObject(i);
            DbHelper.Assignment a = new DbHelper.Assignment();
            a.id = item.optLong("id");
            a.sessionId = item.optLong("session_id");
            a.title = item.optString("title", "Treinamento");
            a.date = item.optString("date");
            a.week = item.optString("week");
            a.monthYear = item.optString("month_year");
            a.timeStart = item.optString("time_start");
            a.timeEnd = item.optString("time_end");
            a.description = item.optString("description");
            a.instructorName = item.optString("instructor_name");
            a.status = item.optString("status", "pending");
            a.subCount = item.optInt("sub_count", 0);
            assignments.add(a);
        }
        db.replaceAssignments(assignments);
    }

    private static void uploadOne(String server, long teamId, DbHelper.QueueItem item) throws Exception {
        File file = new File(item.filePath);
        if (!file.exists()) throw new Exception("Arquivo local não encontrado.");

        String boundary = "----DSSMAC" + System.currentTimeMillis();
        HttpURLConnection conn = (HttpURLConnection) new URL(server + "/api/submissions").openConnection();
        conn.setConnectTimeout(20000);
        conn.setReadTimeout(60000);
        conn.setRequestMethod("POST");
        conn.setDoOutput(true);
        conn.setRequestProperty("Content-Type", "multipart/form-data; boundary=" + boundary);

        OutputStream out = new BufferedOutputStream(conn.getOutputStream());
        writeField(out, boundary, "assignment_id", String.valueOf(item.assignmentId));
        writeField(out, boundary, "team_id", String.valueOf(teamId));
        writeFile(out, boundary, "files", item.originalName, item.mimeType, file);
        out.write(("--" + boundary + "--\r\n").getBytes(StandardCharsets.UTF_8));
        out.flush();
        out.close();

        int code = conn.getResponseCode();
        String response = readStream(code >= 400 ? conn.getErrorStream() : conn.getInputStream());
        if (code < 200 || code >= 300) throw new Exception(response.isEmpty() ? "HTTP " + code : response);
        if (response.contains("\"error\"")) throw new Exception(response);
    }

    private static String request(String method, String url, byte[] body, String contentType) throws Exception {
        HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
        conn.setConnectTimeout(15000);
        conn.setReadTimeout(30000);
        conn.setRequestMethod(method);
        if (body != null) {
            conn.setDoOutput(true);
            if (contentType != null) conn.setRequestProperty("Content-Type", contentType);
            OutputStream out = conn.getOutputStream();
            out.write(body);
            out.close();
        }
        int code = conn.getResponseCode();
        String response = readStream(code >= 400 ? conn.getErrorStream() : conn.getInputStream());
        if (code < 200 || code >= 300) throw new Exception(response.isEmpty() ? "HTTP " + code : response);
        return response;
    }

    private static void writeField(OutputStream out, String boundary, String name, String value) throws Exception {
        out.write(("--" + boundary + "\r\n").getBytes(StandardCharsets.UTF_8));
        out.write(("Content-Disposition: form-data; name=\"" + name + "\"\r\n\r\n").getBytes(StandardCharsets.UTF_8));
        out.write((value == null ? "" : value).getBytes(StandardCharsets.UTF_8));
        out.write("\r\n".getBytes(StandardCharsets.UTF_8));
    }

    private static void writeFile(OutputStream out, String boundary, String name, String fileName, String mimeType, File file) throws Exception {
        String safeName = fileName == null || fileName.trim().isEmpty() ? file.getName() : fileName;
        String type = mimeType == null || mimeType.trim().isEmpty() ? "application/octet-stream" : mimeType;
        out.write(("--" + boundary + "\r\n").getBytes(StandardCharsets.UTF_8));
        out.write(("Content-Disposition: form-data; name=\"" + name + "\"; filename=\"" + safeName.replace("\"", "_") + "\"\r\n").getBytes(StandardCharsets.UTF_8));
        out.write(("Content-Type: " + type + "\r\n\r\n").getBytes(StandardCharsets.UTF_8));
        InputStream in = new BufferedInputStream(new FileInputStream(file));
        byte[] buffer = new byte[32 * 1024];
        int read;
        while ((read = in.read(buffer)) != -1) out.write(buffer, 0, read);
        in.close();
        out.write("\r\n".getBytes(StandardCharsets.UTF_8));
    }

    private static String readStream(InputStream stream) throws Exception {
        if (stream == null) return "";
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        int read;
        while ((read = stream.read(buffer)) != -1) out.write(buffer, 0, read);
        stream.close();
        return new String(out.toByteArray(), StandardCharsets.UTF_8);
    }

    private static String firstNonEmpty(String a, String b) {
        if (a != null && !a.trim().isEmpty()) return a;
        return b == null ? "" : b;
    }

    public static class SyncResult {
        public boolean downloaded;
        public int uploaded;
        public int pending;
        public String message;
    }
}
