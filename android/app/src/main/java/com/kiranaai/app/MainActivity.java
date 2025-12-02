package com.kiranaai.app;

import com.getcapacitor.BridgeActivity;

import android.os.Bundle;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebView;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        handleIntent(getIntent());
    }

    @Override
    public void onStart() {
        super.onStart();
        // Ensure the WebView grants permissions for audio/video
        WebView webView = getBridge().getWebView();
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                request.grant(request.getResources());
            }
        });
    }

    @Override
    protected void onNewIntent(android.content.Intent intent) {
        super.onNewIntent(intent);
        handleIntent(intent);
    }

    private void handleIntent(android.content.Intent intent) {
        if (android.content.Intent.ACTION_SEARCH.equals(intent.getAction())
                || "com.google.android.gms.actions.SEARCH_ACTION".equals(intent.getAction())) {
            String query = intent.getStringExtra(android.app.SearchManager.QUERY);
            if (query != null) {
                // Construct deep link URL
                String url = "kiranaai://query?q=" + android.net.Uri.encode(query);
                // Use bridge to load URL or trigger intent
                // Since we can't easily access bridge from here to loadUrl directly without
                // context issues sometimes,
                // we'll rely on the fact that if this activity is launched, Capacitor handles
                // the intent if it's a VIEW intent.
                // But this is a SEARCH intent. We need to convert it to a VIEW intent or handle
                // it manually.

                android.content.Intent viewIntent = new android.content.Intent(android.content.Intent.ACTION_VIEW,
                        android.net.Uri.parse(url));
                viewIntent.setPackage(getPackageName());
                startActivity(viewIntent);
            }
        }
    }
}
