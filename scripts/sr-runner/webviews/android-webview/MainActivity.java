package dev.a11ied.srwebview;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

public class MainActivity extends Activity {
   private WebView webView;

   @Override
   protected void onCreate(Bundle savedInstanceState) {
      super.onCreate(savedInstanceState);
      webView = new WebView(this);
      WebSettings settings = webView.getSettings();
      settings.setJavaScriptEnabled(true);
      settings.setDomStorageEnabled(true);
      webView.setWebViewClient(new WebViewClient());
      setContentView(webView);
      loadIntentUrl(getIntent());
   }

   @Override
   protected void onNewIntent(Intent intent) {
      super.onNewIntent(intent);
      setIntent(intent);
      loadIntentUrl(intent);
   }

   private void loadIntentUrl(Intent intent) {
      if (intent == null) {
         return;
      }
      Uri data = intent.getData();
      if (data != null) {
         webView.loadUrl(data.toString());
      } else {
         webView.loadData("<!doctype html><html><body><p>Ready</p></body></html>", "text/html", "utf-8");
      }
   }
}
