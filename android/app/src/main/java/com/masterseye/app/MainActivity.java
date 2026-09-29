package com.masterseye.app;

import android.app.Activity;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.ConsoleMessage;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;

import androidx.annotation.RequiresApi;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewClientCompat;

public class MainActivity extends Activity {

    private WebView webView;

    private static class LocalContentWebViewClient extends WebViewClientCompat {
        private final WebViewAssetLoader assetLoader;

        LocalContentWebViewClient(WebViewAssetLoader assetLoader) {
            this.assetLoader = assetLoader;
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

        WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/",
                        new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        webView.setWebViewClient(new LocalContentWebViewClient(assetLoader));

        // Surface JavaScript errors in logcat instead of silently showing a blank screen.
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(ConsoleMessage message) {
                android.util.Log.e(
                        "MastersEyeWebView",
                        message.message() + " -- line " + message.lineNumber()
                );
                return true;
            }
        });

        webView.loadUrl(
                "https://appassets.androidplatform.net/assets/www/index.html"
        );
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
