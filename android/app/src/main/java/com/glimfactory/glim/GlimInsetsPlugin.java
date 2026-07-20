package com.glimfactory.glim;

import android.view.View;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "GlimInsets")
public class GlimInsetsPlugin extends Plugin {

    @PluginMethod
    public void getNavigationBarInset(PluginCall call) {
        View webView = getBridge().getWebView();
        WindowInsetsCompat windowInsets = ViewCompat.getRootWindowInsets(webView);
        int bottomPixels = 0;

        if (windowInsets != null) {
            Insets navigationBars = windowInsets.getInsets(
                WindowInsetsCompat.Type.navigationBars()
            );
            bottomPixels = navigationBars.bottom;
        }

        float density = webView.getResources().getDisplayMetrics().density;
        JSObject result = new JSObject();
        result.put("bottom", Math.round(bottomPixels / density));
        call.resolve(result);
    }
}
