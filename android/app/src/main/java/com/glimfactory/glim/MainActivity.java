package com.glimfactory.glim;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(GlimInsetsPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
