package br.com.engecom.dssmac;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.view.View;
import android.webkit.*;
import android.widget.EditText;
import android.widget.FrameLayout;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;

import java.io.File;
import java.io.IOException;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

public class MainActivity extends AppCompatActivity {

    private static final String BASE_SERVER = "https://engecom-dssmac-production.up.railway.app";
    private static final String PREFS_NAME   = "dssmac_prefs";
    private static final String KEY_TEAM_URL = "team_url";
    private static final int    REQ_FILE     = 1;
    private static final int    REQ_PERMS    = 2;

    private WebView webView;
    private ValueCallback<Uri[]> filePathCallback;
    private Uri cameraImageUri;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Fullscreen WebView
        webView = new WebView(this);
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT);
        webView.setLayoutParams(lp);
        setContentView(webView);

        setupWebView();
        requestPermissionsIfNeeded();

        // First launch: ask for team URL
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        String teamUrl = prefs.getString(KEY_TEAM_URL, null);

        if (teamUrl == null) {
            showUrlDialog(prefs, null);
        } else {
            webView.loadUrl(teamUrl);
        }
    }

    private void setupWebView() {
        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                String url = req.getUrl().toString();
                if (url.startsWith(BASE_SERVER)) return false;
                // External links → browser
                startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
                return true;
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView wv,
                    ValueCallback<Uri[]> cb, FileChooserParams params) {
                if (filePathCallback != null) filePathCallback.onReceiveValue(null);
                filePathCallback = cb;
                openFileChooser();
                return true;
            }
        });
    }

    // ── URL SETUP DIALOG ──────────────────────────────────────────
    private void showUrlDialog(SharedPreferences prefs, String currentUrl) {
        EditText input = new EditText(this);
        input.setHint("Cole o link da sua equipe aqui");
        input.setSingleLine(true);
        input.setPadding(48, 32, 48, 32);
        if (currentUrl != null) input.setText(currentUrl);
        else input.setText(BASE_SERVER + "/equipe/");

        new AlertDialog.Builder(this)
            .setTitle("Link da Equipe")
            .setMessage("Cole o link completo da sua equipe:")
            .setView(input)
            .setCancelable(currentUrl != null)
            .setPositiveButton("Abrir", (d, w) -> {
                String url = input.getText().toString().trim();
                if (!url.isEmpty()) {
                    prefs.edit().putString(KEY_TEAM_URL, url).apply();
                    webView.loadUrl(url);
                }
            })
            .show();
    }

    // ── FILE CHOOSER ───────────────────────────────────────────────
    private void openFileChooser() {
        // Camera intent
        Intent cam = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
        File photo = createImageFile();
        if (photo != null) {
            cameraImageUri = FileProvider.getUriForFile(this,
                    getPackageName() + ".fileprovider", photo);
            cam.putExtra(MediaStore.EXTRA_OUTPUT, cameraImageUri);
        }

        // Gallery / files intent
        Intent pick = new Intent(Intent.ACTION_GET_CONTENT);
        pick.setType("*/*");
        pick.putExtra(Intent.EXTRA_MIME_TYPES,
                new String[]{"image/jpeg","image/png","image/webp","image/heic","application/pdf"});
        pick.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);

        Intent chooser = Intent.createChooser(pick, "Selecionar arquivo");
        chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS, new Intent[]{cam});
        startActivityForResult(chooser, REQ_FILE);
    }

    private File createImageFile() {
        try {
            String ts = new SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(new Date());
            File dir = getExternalFilesDir(Environment.DIRECTORY_PICTURES);
            return File.createTempFile("DSSMAC_" + ts, ".jpg", dir);
        } catch (IOException e) {
            return null;
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != REQ_FILE || filePathCallback == null) return;

        Uri[] results = null;
        if (resultCode == Activity.RESULT_OK) {
            if (data == null || data.getData() == null) {
                if (cameraImageUri != null) results = new Uri[]{cameraImageUri};
            } else if (data.getClipData() != null) {
                int n = data.getClipData().getItemCount();
                results = new Uri[n];
                for (int i = 0; i < n; i++) results[i] = data.getClipData().getItemAt(i).getUri();
            } else {
                results = new Uri[]{data.getData()};
            }
        }
        filePathCallback.onReceiveValue(results);
        filePathCallback = null;
        cameraImageUri = null;
    }

    // ── PERMISSIONS ────────────────────────────────────────────────
    private void requestPermissionsIfNeeded() {
        String[] perms = Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
            ? new String[]{Manifest.permission.CAMERA, Manifest.permission.READ_MEDIA_IMAGES}
            : new String[]{Manifest.permission.CAMERA, Manifest.permission.READ_EXTERNAL_STORAGE};

        boolean allOk = true;
        for (String p : perms)
            if (ContextCompat.checkSelfPermission(this, p) != PackageManager.PERMISSION_GRANTED)
            { allOk = false; break; }

        if (!allOk) ActivityCompat.requestPermissions(this, perms, REQ_PERMS);
    }

    // ── BACK & MENU ────────────────────────────────────────────────
    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    @Override
    public boolean onCreateOptionsMenu(android.view.Menu menu) {
        menu.add(0, 1, 0, "Trocar link da equipe");
        return true;
    }

    @Override
    public boolean onOptionsItemSelected(android.view.MenuItem item) {
        if (item.getItemId() == 1) {
            SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
            showUrlDialog(prefs, prefs.getString(KEY_TEAM_URL, null));
            return true;
        }
        return super.onOptionsItemSelected(item);
    }
}
