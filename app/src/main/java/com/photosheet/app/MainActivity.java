package com.photosheet.app;

import android.Manifest;
import android.annotation.SuppressLint;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Parcelable;
import android.print.PrintAttributes;
import android.print.PrintManager;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.view.Display;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;

public class MainActivity extends AppCompatActivity {

    private static final int FILE_CHOOSER_REQUEST_CODE = 1001;
    private static final int PERMISSION_REQUEST_CODE = 1002;

    private WebView webView;
    private ValueCallback<Uri[]> filePathCallback;
    private Uri cameraPhotoUri;
    private int systemTopInset;
    private int systemBottomInset;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        configureSystemBars();
        requestHighestRefreshRate();

        FrameLayout layout = new FrameLayout(this);
        layout.setLayoutParams(new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT));

        webView = new WebView(this);
        webView.setLayoutParams(new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT));
        // Keep WebView rendering on the hardware compositor. This lets scrolling
        // follow the display refresh rate instead of falling back to software work.
        webView.setLayerType(WebView.LAYER_TYPE_HARDWARE, null);
        // This is an APK surface, not a document reader: suppress WebView's
        // long-press selection affordance and its context menu.
        webView.setLongClickable(false);
        webView.setHapticFeedbackEnabled(false);
        webView.setOnLongClickListener(view -> true);

        layout.addView(webView);
        setContentView(layout);
        applySystemBarInsets();

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                applyWebInsets();
            }
        });
        webView.setWebChromeClient(new CustomWebChromeClient());

        // Attach native bridge
        webView.addJavascriptInterface(new PPSBridgeInterface(this), "PPSBridge");

        // Request camera and storage permissions if needed
        checkAndRequestPermissions();

        // Load app
        webView.loadUrl("file:///android_asset/index.html");
    }

    /**
     * Give devices with a high-refresh panel permission to use its fastest native
     * mode. The system still makes the final choice for battery and thermal policy.
     */
    @SuppressWarnings("deprecation")
    private void requestHighestRefreshRate() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return;

        Display display = getWindowManager().getDefaultDisplay();
        if (display == null) return;

        Display.Mode currentMode = display.getMode();
        Display.Mode fastestMode = null;
        for (Display.Mode mode : display.getSupportedModes()) {
            // Keep the panel's native resolution so a high-refresh request never
            // trades visual quality for a different display mode.
            if (mode.getPhysicalWidth() != currentMode.getPhysicalWidth()
                    || mode.getPhysicalHeight() != currentMode.getPhysicalHeight()) {
                continue;
            }
            if (fastestMode == null || mode.getRefreshRate() > fastestMode.getRefreshRate()) {
                fastestMode = mode;
            }
        }

        if (fastestMode != null && fastestMode.getModeId() != currentMode.getModeId()) {
            WindowManager.LayoutParams attributes = getWindow().getAttributes();
            attributes.preferredDisplayModeId = fastestMode.getModeId();
            getWindow().setAttributes(attributes);
        }
    }

    /** Lets the app background run behind both system bars, like a native app surface. */
    private void configureSystemBars() {
        Window window = getWindow();
        WindowCompat.setDecorFitsSystemWindows(window, false);
        window.setStatusBarColor(Color.TRANSPARENT);
        window.setNavigationBarColor(Color.TRANSPARENT);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            window.setNavigationBarDividerColor(Color.TRANSPARENT);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            window.setStatusBarContrastEnforced(false);
            window.setNavigationBarContrastEnforced(false);
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            int flags = window.getDecorView().getSystemUiVisibility()
                    | View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                flags |= View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
            }
            window.getDecorView().setSystemUiVisibility(flags);
        }
    }

    /**
     * CSS does not receive Android's system-bar dimensions reliably on every
     * WebView version. Send the measured insets in after the page has loaded.
     */
    private void applySystemBarInsets() {
        ViewCompat.setOnApplyWindowInsetsListener(webView, (view, insets) -> {
            Insets bars = insets.getInsets(
                    WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            systemTopInset = bars.top;
            systemBottomInset = bars.bottom;
            applyWebInsets();
            return insets;
        });
        ViewCompat.requestApplyInsets(webView);
    }

    private void applyWebInsets() {
        if (webView == null) return;
        // Insets arrive in physical display pixels; CSS uses WebView pixels.
        // Convert in the page so a 3x-density phone does not get 3x the padding.
        String script = "(function(){var root=document.documentElement,scale="
                + "Math.max(1,window.devicePixelRatio||1),top=(" + systemTopInset
                + "/scale),bottom=(" + systemBottomInset + "/scale);"
                // Some WebView/OEM combinations transiently report zero insets.
                // Keep the CSS safe-area fallback in that case instead of pinning
                // the sticky controls under the status bar.
                + "if(top>0)root.style.setProperty('--system-top',top+'px');"
                + "if(bottom>0)root.style.setProperty('--system-bottom',bottom+'px');})();";
        webView.evaluateJavascript(script, null);
    }

    private void checkAndRequestPermissions() {
        List<String> permissionsNeeded = new ArrayList<>();
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            permissionsNeeded.add(Manifest.permission.CAMERA);
        }
        if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.P) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
                permissionsNeeded.add(Manifest.permission.WRITE_EXTERNAL_STORAGE);
            }
        }
        if (!permissionsNeeded.isEmpty()) {
            ActivityCompat.requestPermissions(this, permissionsNeeded.toArray(new String[0]), PERMISSION_REQUEST_CODE);
        }
    }

    private class CustomWebChromeClient extends WebChromeClient {
        @Override
        public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> callback, FileChooserParams fileChooserParams) {
            if (filePathCallback != null) {
                filePathCallback.onReceiveValue(null);
            }
            filePathCallback = callback;

            Intent takePictureIntent = null;
            cameraPhotoUri = null;

            // Prepare camera capture
            try {
                File photoFile = createImageFile();
                if (photoFile != null) {
                    cameraPhotoUri = FileProvider.getUriForFile(
                            MainActivity.this,
                            getPackageName() + ".fileprovider",
                            photoFile
                    );
                    takePictureIntent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
                    takePictureIntent.putExtra(MediaStore.EXTRA_OUTPUT, cameraPhotoUri);
                    takePictureIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
                }
            } catch (Exception e) {
                e.printStackTrace();
            }

            boolean isCapture = fileChooserParams != null && fileChooserParams.isCaptureEnabled();

            if (isCapture && takePictureIntent != null) {
                try {
                    startActivityForResult(takePictureIntent, FILE_CHOOSER_REQUEST_CODE);
                    return true;
                } catch (Exception ignored) {}
            }

            // Gallery / Document picker
            Intent galleryIntent = new Intent(Intent.ACTION_GET_CONTENT);
            galleryIntent.addCategory(Intent.CATEGORY_OPENABLE);
            galleryIntent.setType("image/*");

            Intent chooserIntent = Intent.createChooser(galleryIntent, "Select Photo");
            if (takePictureIntent != null) {
                chooserIntent.putExtra(Intent.EXTRA_INITIAL_INTENTS, new Parcelable[]{takePictureIntent});
            }

            try {
                startActivityForResult(chooserIntent, FILE_CHOOSER_REQUEST_CODE);
            } catch (Exception e) {
                if (filePathCallback != null) {
                    filePathCallback.onReceiveValue(null);
                    filePathCallback = null;
                }
                return false;
            }
            return true;
        }
    }

    private File createImageFile() throws IOException {
        String timeStamp = new SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(new Date());
        String imageFileName = "JPEG_" + timeStamp + "_";
        File storageDir = getExternalFilesDir(Environment.DIRECTORY_PICTURES);
        if (storageDir == null) {
            storageDir = getCacheDir();
        }
        return File.createTempFile(imageFileName, ".jpg", storageDir);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, @Nullable Intent data) {
        super.onActivityResult(requestCode, resultCode, data);

        if (requestCode == FILE_CHOOSER_REQUEST_CODE) {
            if (filePathCallback == null) return;

            Uri[] results = null;
            if (resultCode == RESULT_OK) {
                if (data != null && data.getData() != null) {
                    results = new Uri[]{data.getData()};
                } else if (cameraPhotoUri != null) {
                    // Check if file exists and has size
                    results = new Uri[]{cameraPhotoUri};
                }
            }

            filePathCallback.onReceiveValue(results);
            filePathCallback = null;
        }
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    // JavaScript Bridge class
    public class PPSBridgeInterface {
        private final Context context;

        public PPSBridgeInterface(Context context) {
            this.context = context;
        }

        @JavascriptInterface
        public void printPdf(String base64Pdf) {
            if (base64Pdf == null || base64Pdf.isEmpty()) return;

            try {
                final byte[] pdfBytes = Base64.decode(base64Pdf, Base64.DEFAULT);
                runOnUiThread(() -> {
                    PrintManager printManager = (PrintManager) context.getSystemService(Context.PRINT_SERVICE);
                    if (printManager != null) {
                        String jobName = "Photosheet_Passport_Photos";
                        PrintAttributes attributes = new PrintAttributes.Builder()
                                .setMediaSize(PrintAttributes.MediaSize.ISO_A4)
                                .setColorMode(PrintAttributes.COLOR_MODE_COLOR)
                                .setMinMargins(PrintAttributes.Margins.NO_MARGINS)
                                .build();

                        printManager.print(jobName, new PdfPrintDocumentAdapter(context, pdfBytes, "passport-photo-sheet-A4.pdf"), attributes);
                    } else {
                        Toast.makeText(context, "Print service not available", Toast.LENGTH_SHORT).show();
                    }
                });
            } catch (Exception e) {
                e.printStackTrace();
                runOnUiThread(() -> Toast.makeText(context, "Failed to prepare print document: " + e.getMessage(), Toast.LENGTH_SHORT).show());
            }
        }

        @JavascriptInterface
        public void savePdf(String base64Pdf, String fileName) {
            if (base64Pdf == null || base64Pdf.isEmpty()) return;

            if (fileName == null || fileName.isEmpty()) {
                fileName = "passport-photo-sheet-A4.pdf";
            }
            final String finalFileName = fileName;

            try {
                final byte[] pdfBytes = Base64.decode(base64Pdf, Base64.DEFAULT);

                // Save to downloads
                Uri savedUri = savePdfToDownloads(pdfBytes, finalFileName);

                runOnUiThread(() -> {
                    Toast.makeText(context, "PDF saved to Downloads folder", Toast.LENGTH_SHORT).show();

                    // Trigger share dialog so user can immediately open or send
                    if (savedUri != null) {
                        try {
                            Intent shareIntent = new Intent(Intent.ACTION_SEND);
                            shareIntent.setType("application/pdf");
                            shareIntent.putExtra(Intent.EXTRA_STREAM, savedUri);
                            shareIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                            context.startActivity(Intent.createChooser(shareIntent, "Share or Open PDF"));
                        } catch (Exception ignored) {}
                    }
                });
            } catch (Exception e) {
                e.printStackTrace();
                runOnUiThread(() -> Toast.makeText(context, "Failed to save PDF: " + e.getMessage(), Toast.LENGTH_SHORT).show());
            }
        }

        private Uri savePdfToDownloads(byte[] pdfBytes, String fileName) throws IOException {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentValues contentValues = new ContentValues();
                contentValues.put(MediaStore.MediaColumns.DISPLAY_NAME, fileName);
                contentValues.put(MediaStore.MediaColumns.MIME_TYPE, "application/pdf");
                contentValues.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);

                Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, contentValues);
                if (uri != null) {
                    try (OutputStream os = getContentResolver().openOutputStream(uri)) {
                        if (os != null) {
                            os.write(pdfBytes);
                            os.flush();
                        }
                    }
                    return uri;
                }
            } else {
                File downloadsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
                if (!downloadsDir.exists()) downloadsDir.mkdirs();
                File pdfFile = new File(downloadsDir, fileName);
                try (FileOutputStream fos = new FileOutputStream(pdfFile)) {
                    fos.write(pdfBytes);
                    fos.flush();
                }
                return FileProvider.getUriForFile(MainActivity.this, getPackageName() + ".fileprovider", pdfFile);
            }
            return null;
        }
    }
}
