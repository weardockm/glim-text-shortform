package com.glimfactory.glim;

import org.junit.Test;

import static org.junit.Assert.assertEquals;

public class GlimInsetsPluginTest {
    @Test
    public void returnsZeroWhenWebViewAlreadyEndsAboveNavigationBar() {
        assertEquals(0, GlimInsetsPlugin.calculateBottomOverlap(1500, 1600, 100));
    }

    @Test
    public void returnsOnlyThePixelsThatActuallyOverlapTheWebView() {
        assertEquals(40, GlimInsetsPlugin.calculateBottomOverlap(1540, 1600, 100));
        assertEquals(100, GlimInsetsPlugin.calculateBottomOverlap(1600, 1600, 100));
    }
}
