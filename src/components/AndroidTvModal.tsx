import React, { useState } from 'react';
import { X, Download, Code, Smartphone, Cpu, ShieldCheck } from 'lucide-react';

interface AndroidTvModalProps {
  onClose: () => void;
}

export const AndroidTvModal: React.FC<AndroidTvModalProps> = ({ onClose }) => {
  const [activeTab, setActiveTab] = useState<'java' | 'xml' | 'manifest'>('java');

  const javaCode = `package com.neshtv.iptv;

import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.ProgressBar;
import androidx.appcompat.app.AppCompatActivity;

public class MainActivity extends AppCompatActivity {
    private WebView webView;
    private ProgressBar progressBar;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        webView = findViewById(R.id.webView);
        progressBar = findViewById(R.id.progressBar);

        WebSettings settings = webView.getSettings();

        // 1. COMPATIBILIDAD CON ALMACENAMIENTO Y ES6
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);

        // 2. FORZAR MIXED CONTENT EN ANDROID 5.0+ (LOLLIPOP Y SUPERIOR)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        }

        // 3. USER AGENT DE NAVEGADOR MODERNO
        settings.setUserAgentString("Mozilla/5.0 (Linux; Android 10; TV Box) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36");

        // 4. CLIENTE WEB VIEW CON INDICADOR DE CARGA Y CONTROL DE ERRORES
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                // Ocultar cargador automáticamente al terminar la carga
                if (progressBar != null) {
                    progressBar.setVisibility(View.GONE);
                }
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                // Previene congelamientos silenciosos en pantalla negra
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    Log.e("NeshTV", "Error WebView: " + error.getDescription());
                }
            }
        });

        // 5. MANEJO DE SILENCIAR ERRORES CRÍTICOS EN CONSOLA JS
        webView.setWebChromeClient(new WebChromeClient());

        // Carga la app NeshTV IPTV desde tu servidor
        String appUrl = getIntent().getStringExtra("SERVER_URL");
        if (appUrl == null || appUrl.isEmpty()) {
            appUrl = "http://" + getLocalIpAddress() + ":3000"; // Reemplaza con la IP de tu servidor
        }
        webView.loadUrl(appUrl);
    }

    private String getLocalIpAddress() {
        return "192.168.1.100"; // Servidor por defecto
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }
}`;

  const xmlCode = `<?xml version="1.0" encoding="utf-8"?>
<FrameLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:background="#0F172A">

    <WebView
        android:id="@+id/webView"
        android:layout_width="match_parent"
        android:layout_height="match_parent" />

    <ProgressBar
        android:id="@+id/progressBar"
        style="?android:attr/progressBarStyleLarge"
        android:layout_width="64dp"
        android:layout_height="64dp"
        android:layout_gravity="center"
        android:indeterminateTint="#F59E0B" />
</FrameLayout>`;

  const manifestCode = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="com.neshtv.iptv">

    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
    <uses-feature android:name="android.hardware.type.television" android:required="false" />
    <uses-feature android:name="android.software.leanback" android:required="false" />

    <application
        android:hardwareAccelerated="true"
        android:usesCleartextTraffic="true"
        android:icon="@mipmap/ic_launcher"
        android:label="NeshTV IPTV"
        android:theme="@style/Theme.AppCompat.NoActionBar">
        
        <activity
            android:name=".MainActivity"
            android:configChanges="orientation|screenSize|keyboardHidden"
            android:hardwareAccelerated="true"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
                <category android:name="android.intent.category.LEANBACK_LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>`;

  const downloadFile = (filename: string, text: string) => {
    const element = document.createElement('a');
    const file = new Blob([text], { type: 'text/plain' });
    element.href = URL.createObjectURL(file);
    element.download = filename;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-400">
              <Smartphone className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                NeshTV IPTV APK Android TV Box
                <span className="text-xs bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-mono">
                  Android 6.0, 7.0 - 14+
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Código nativo optimizado para WebView de bajo recurso (1GB / 2GB RAM sin pantalla negra)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors tv-focusable"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Feature Badges */}
        <div className="px-6 py-3 bg-slate-950/30 border-b border-slate-800/60 flex flex-wrap gap-4 text-xs">
          <span className="flex items-center gap-1.5 text-slate-300">
            <Cpu className="w-3.5 h-3.5 text-amber-400" /> Aceleración por Hardware activada
          </span>
          <span className="flex items-center gap-1.5 text-slate-300">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> Mixed Content Always Allow (HTTP en HTTPS)
          </span>
          <span className="flex items-center gap-1.5 text-slate-300">
            <Code className="w-3.5 h-3.5 text-sky-400" /> D-Pad Leanback Launcher Nativo
          </span>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-800 bg-slate-900/80 px-6 pt-2">
          {[
            { id: 'java', label: 'MainActivity.java' },
            { id: 'xml', label: 'activity_main.xml' },
            { id: 'manifest', label: 'AndroidManifest.xml' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-2.5 font-mono text-xs font-semibold border-b-2 transition-colors mr-2 tv-focusable ${
                activeTab === tab.id
                  ? 'border-amber-400 text-amber-400 bg-amber-500/10 rounded-t-lg'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Code Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-950/80 font-mono text-xs text-slate-300">
          <pre className="whitespace-pre-wrap leading-relaxed select-text bg-slate-900/60 p-4 rounded-xl border border-slate-800">
            {activeTab === 'java' && javaCode}
            {activeTab === 'xml' && xmlCode}
            {activeTab === 'manifest' && manifestCode}
          </pre>
        </div>

        {/* Footer actions */}
        <div className="p-4 border-t border-slate-800 bg-slate-950 flex items-center justify-between">
          <span className="text-xs text-slate-400">
            Copia estos archivos en tu proyecto Android Studio para generar el archivo <strong className="text-amber-400">.APK</strong> nativo.
          </span>
          <div className="flex gap-3">
            <button
              onClick={() => {
                if (activeTab === 'java') downloadFile('MainActivity.java', javaCode);
                if (activeTab === 'xml') downloadFile('activity_main.xml', xmlCode);
                if (activeTab === 'manifest') downloadFile('AndroidManifest.xml', manifestCode);
              }}
              className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-2 transition-all tv-focusable"
            >
              <Download className="w-4 h-4" /> Descargar {activeTab === 'java' ? 'MainActivity.java' : activeTab === 'xml' ? 'activity_main.xml' : 'AndroidManifest.xml'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
