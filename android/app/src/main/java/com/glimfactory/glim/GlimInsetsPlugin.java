package com.glimfactory.glim;

import android.os.Build;
import android.util.DisplayMetrics;
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
            int[] webViewLocation = new int[2];
            webView.getLocationOnScreen(webViewLocation);
            int webViewBottom = webViewLocation[1] + webView.getHeight();
            int windowBottom = getWindowBottomPixels();
            bottomPixels = calculateBottomOverlap(
                webViewBottom,
                windowBottom,
                navigationBars.bottom
            );
        }

        float density = webView.getResources().getDisplayMetrics().density;
        JSObject result = new JSObject();
        result.put("bottom", Math.round(bottomPixels / density));
        call.resolve(result);
    }

    private int getWindowBottomPixels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            return getActivity()
                .getWindowManager()
                .getCurrentWindowMetrics()
                .getBounds()
                .bottom;
        }

        DisplayMetrics metrics = new DisplayMetrics();
        getActivity().getWindowManager().getDefaultDisplay().getRealMetrics(metrics);
        return metrics.heightPixels;
    }

    static int calculateBottomOverlap(
        int webViewBottom,
        int windowBottom,
        int navigationInsetBottom
    ) {
        int navigationBarTop = windowBottom - navigationInsetBottom;
        return Math.max(0, Math.min(navigationInsetBottom, webViewBottom - navigationBarTop));
    }
}
