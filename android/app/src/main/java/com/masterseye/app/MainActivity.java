package com.masterseye.app;

import android.app.Activity;
import android.app.ActivityNotFoundException;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Message;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.ConsoleMessage;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.annotation.RequiresApi;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewClientCompat;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

public class MainActivity extends Activity {

    private static final int REQUEST_FILE_CHOOSER = 1001;
    private static final int REQUEST_WRITE_STORAGE = 1002;
    private static final String APP_ORIGIN = "https://appassets.androidplatform.net/";

    private WebView webView;
    private ValueCallback<Uri[]> fileCallback;

    private static class LocalContentWebViewClient extends WebViewClientCompat {
        private final WebViewAssetLoader assetLoader;
        private final MainActivity owner;

        LocalContentWebViewClient(WebViewAssetLoader assetLoader, MainActivity owner) {
            this.assetLoader = assetLoader;
            this.owner = owner;
        }

        @RequiresApi(21)
        @Override
        public WebResourceResponse shouldInterceptRequest(
                WebView view, WebResourceRequest request) {
            return withMimeType(
                    assetLoader.shouldInterceptRequest(request.getUrl()),
                    request.getUrl().getPath());
        }

        @Override
        public WebResourceResponse shouldInterceptRequest(
                WebView view, String url) {
            Uri uri = Uri.parse(url);
            return withMimeType(assetLoader.shouldInterceptRequest(uri), uri.getPath());
        }

        /* Anything that is not our own bundled content leaves the app —
           otherwise links (help pages, wa.me) navigate to a blank page. */
        @RequiresApi(21)
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            return owner.handleExternal(request.getUrl().toString());
        }

        @Override
        @SuppressWarnings("deprecation")
        public boolean shouldOverrideUrlLoading(WebView view, String url) {
            return owner.handleExternal(url);
        }

        /* AssetsPathHandler guesses the MIME type from the file extension and falls
           back to "text/plain" — module scripts are then rejected outright, which
           shows up as a completely blank screen. Pin the known types down. */
        private static WebResourceResponse withMimeType(
                WebResourceResponse response, String path) {
            if (response == null || path == null) return response;
            String p = path.toLowerCase(java.util.Locale.US);
            String mime = null;
            if (p.endsWith(".js") || p.endsWith(".mjs")) mime = "text/javascript";
            else if (p.endsWith(".css")) mime = "text/css";
            else if (p.endsWith(".html") || p.endsWith(".htm")) mime = "text/html";
            else if (p.endsWith(".json")) mime = "application/json";
            else if (p.endsWith(".svg")) mime = "image/svg+xml";
            else if (p.endsWith(".png")) mime = "image/png";
            else if (p.endsWith(".jpg") || p.endsWith(".jpeg")) mime = "image/jpeg";
            if (mime != null && !mime.equals(response.getMimeType())) {
                response.setMimeType(mime);
            }
            return response;
        }
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        webView = findViewById(R.id.webview);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        // without these two, window.open() (the WhatsApp buttons) is silently dropped
        settings.setSupportMultipleWindows(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(true);

        WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/",
                        new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        webView.setWebViewClient(new LocalContentWebViewClient(assetLoader, this));

        // Surface JavaScript errors in logcat instead of silently showing a blank screen.
        // onShowFileChooser is mandatory: without it <input type="file"> silently
        // does nothing in a WebView, so photo upload never opens the picker.
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(ConsoleMessage message) {
                android.util.Log.e(
                        "MastersEyeWebView",
                        message.message() + " -- line " + message.lineNumber()
                );
                return true;
            }

            @Override
            public boolean onShowFileChooser(
                    WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                try {
                    startActivityForResult(params.createIntent(), REQUEST_FILE_CHOOSER);
                } catch (ActivityNotFoundException e) {
                    fileCallback = null;
                    callback.onReceiveValue(null);
                    return false;
                }
                return true;
            }

            /* window.open() / target="_blank" land here. Off-app URLs go to the
               system (WhatsApp, browser); our own blob/asset URLs stay in-app. */
            @Override
            public boolean onCreateWindow(WebView view, boolean isDialog,
                                          boolean isUserGesture, Message resultMsg) {
                WebView temp = new WebView(view.getContext());
                temp.getSettings().setJavaScriptEnabled(true);
                final boolean[] handled = {false};
                WebViewClient client = new WebViewClient() {
                    @RequiresApi(21)
                    @Override
                    public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest request) {
                        return route(request.getUrl().toString(), handled);
                    }

                    @Override
                    @SuppressWarnings("deprecation")
                    public boolean shouldOverrideUrlLoading(WebView v, String url) {
                        return route(url, handled);
                    }

                    @Override
                    public void onPageStarted(WebView v, String url, android.graphics.Bitmap favicon) {
                        route(url, handled);
                    }
                };
                temp.setWebViewClient(client);
                WebView.WebViewTransport transport = (WebView.WebViewTransport) resultMsg.obj;
                transport.setWebView(temp);
                resultMsg.sendToTarget();
                return true;
            }
        });

        if (Build.VERSION.SDK_INT < 29
                && checkSelfPermission(android.Manifest.permission.WRITE_EXTERNAL_STORAGE)
                        != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(
                    new String[]{android.Manifest.permission.WRITE_EXTERNAL_STORAGE},
                    REQUEST_WRITE_STORAGE);
        }

        webView.addJavascriptInterface(new NativeBridge(), "MastersEye");

        webView.loadUrl(APP_ORIGIN + "assets/www/index.html");
    }

    /** true = the request was consumed and the WebView must not load it. */
    private boolean handleExternal(String url) {
        if (url == null || isInApp(url)) return false;
        String scheme = Uri.parse(url).getScheme();
        if (scheme == null || scheme.isEmpty()) return false;
        return openExternally(url);
    }

    /** routing for popups: our own content stays inside the app, the rest leaves it. */
    private boolean route(String url, boolean[] handled) {
        if (url == null || handled[0]) return true;
        handled[0] = true;
        if (isInApp(url)) webView.loadUrl(url);
        else openExternally(url);
        return true;
    }

    private boolean isInApp(String url) {
        return url.startsWith(APP_ORIGIN) || url.startsWith("blob:") || url.startsWith("data:");
    }

    private boolean openExternally(String url) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
        } catch (ActivityNotFoundException e) {
            toast("No app on this phone can open that link.");
        }
        return true;
    }

    private void toast(final String message) {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                Toast.makeText(MainActivity.this, message, Toast.LENGTH_LONG).show();
            }
        });
    }

    /** Downloads work through this bridge — <a download> + blob URLs are a no-op in WebView. */
    private class NativeBridge {
        @JavascriptInterface
        public void saveFile(String name, String base64) {
            try {
                byte[] data = Base64.decode(base64, Base64.NO_WRAP);
                String path = writeDownloads(safeName(name), data);
                toast("Saved " + safeName(name) + "\n" + path);
            } catch (Exception e) {
                String detail = e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage();
                toast("Could not save the file: " + detail);
            }
        }
    }

    private static String safeName(String name) {
        String n = (name == null || name.trim().isEmpty()) ? "masters-eye-file" : name.trim();
        return n.replaceAll("[^A-Za-z0-9._ -]", "_");
    }

    private String writeDownloads(String name, byte[] data) throws Exception {
        if (Build.VERSION.SDK_INT >= 29) {
            ContentValues values = new ContentValues();
            values.put(MediaStore.Downloads.DISPLAY_NAME, name);
            values.put(MediaStore.Downloads.MIME_TYPE, mimeFor(name));
            values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
            values.put(MediaStore.Downloads.IS_PENDING, 1);
            Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
            if (uri == null) throw new IllegalStateException("could not create the download entry");
            OutputStream out = getContentResolver().openOutputStream(uri);
            if (out == null) throw new IllegalStateException("could not open the download entry");
            out.write(data);
            out.close();
            values.clear();
            values.put(MediaStore.Downloads.IS_PENDING, 0);
            getContentResolver().update(uri, values, null, null);
            return Environment.DIRECTORY_DOWNLOADS;
        }
        try {
            File dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
            if (!dir.exists() && !dir.mkdirs()) throw new IllegalStateException("Downloads folder unavailable");
            File file = new File(dir, name);
            FileOutputStream out = new FileOutputStream(file);
            out.write(data);
            out.close();
            MediaScannerConnection.scanFile(this, new String[]{file.getAbsolutePath()}, null, null);
            return file.getAbsolutePath();
        } catch (SecurityException noPermission) {
            File dir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
            if (dir == null) throw noPermission;
            File file = new File(dir, name);
            FileOutputStream out = new FileOutputStream(file);
            out.write(data);
            out.close();
            return file.getAbsolutePath();
        }
    }

    private static String mimeFor(String name) {
        String n = name.toLowerCase(java.util.Locale.US);
        if (n.endsWith(".pdf")) return "application/pdf";
        if (n.endsWith(".xlsx") || n.endsWith(".xls")) return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
        if (n.endsWith(".csv")) return "text/csv";
        if (n.endsWith(".png")) return "image/png";
        if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "image/jpeg";
        return "application/json";
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == REQUEST_FILE_CHOOSER) {
            ValueCallback<Uri[]> callback = fileCallback;
            fileCallback = null;
            if (callback == null) return;
            Uri[] results = null;
            if (resultCode == RESULT_OK && data != null) {
                String[] paths =
                        WebChromeClient.FileChooserParams.parseResult(resultCode, data);
                if (paths != null) {
                    results = new Uri[paths.length];
                    for (int i = 0; i < paths.length; i++) results[i] = Uri.parse(paths[i]);
                }
            }
            callback.onReceiveValue(results);
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }
}
