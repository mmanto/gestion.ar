package ius.intellify.pro;

import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyPermanentlyInvalidatedException;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import androidx.annotation.NonNull;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import androidx.fragment.app.FragmentActivity;
import androidx.lifecycle.Lifecycle;
import androidx.lifecycle.LifecycleEventObserver;
import androidx.lifecycle.LifecycleOwner;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.concurrent.Executor;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * Plugin Capacitor (Java) que envuelve el BiometricPrompt nativo de Android
 * y el Keystore para el login con huella.
 *
 * Seguridad: el secreto que habilita el login biométrico se genera en el
 * dispositivo, se cifra con una clave AES/GCM del Android Keystore creada
 * con setUserAuthenticationRequired(true) (solo se puede usar si el usuario
 * acaba de autenticarse con la huella) y setInvalidatedByBiometricEnrollment
 * (si el usuario agrega/quita una huella, la clave se invalida y hay que
 * re-enrolar). El texto cifrado queda en SharedPreferences; al autenticar
 * con huella, el callback desencripta y expone el secreto a JS una sola vez.
 *
 * Por eso tanto `enroll` como `authenticate` corren el BiometricPrompt: usar
 * la clave (cifrar/descifrar) siempre requiere una autenticación biométrica
 * reciente a nivel de Keystore.
 */
@CapacitorPlugin(name = "BiometricAuth")
public class BiometricAuthPlugin extends Plugin {

    private static final String ANDROID_KEYSTORE = "AndroidKeyStore";
    private static final String KEY_ALIAS = "biometric_device_secret";
    private static final String TRANSFORMATION = KeyProperties.KEY_ALGORITHM_AES + "/"
            + KeyProperties.BLOCK_MODE_GCM + "/" + KeyProperties.ENCRYPTION_PADDING_NONE;
    private static final String PREFS = "biometric_store";
    private static final String PREFS_SECRET_CT = "secret_ct";
    private static final String PREFS_SECRET_IV = "secret_iv";
    private static final String PREFS_DEVICE_ID = "device_id";

    // ── Utility ──────────────────────────────────────────────────────────
    private Context ctx() {
        return getContext();
    }

    private android.content.SharedPreferences prefs() {
        return ctx().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private static String b64(byte[] bytes) {
        return Base64.encodeToString(bytes, Base64.NO_WRAP);
    }

    private static byte[] unb64(String s) {
        return Base64.decode(s, Base64.NO_WRAP);
    }

    private KeyStore getKeyStore() throws Exception {
        KeyStore ks = KeyStore.getInstance(ANDROID_KEYSTORE);
        ks.load(null);
        return ks;
    }

    private boolean hasKey() {
        try {
            return getKeyStore().containsAlias(KEY_ALIAS);
        } catch (Exception e) {
            return false;
        }
    }

    /**
     * Crea la clave AES/GCM ligada a autenticación biométrica. Devuelve false
     * si la clave existe pero quedó permanentemente invalidada (por ejemplo,
     * por un cambio de huellas) y es necesario re-enrolar.
     */
    private SecretKey createKey() throws Exception {
        KeyGenerator kg = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE);
        kg.init(new KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true)
                .setUserAuthenticationRequired(true)
                .setInvalidatedByBiometricEnrollment(true)
                .build());
        return kg.generateKey();
    }

    private SecretKey loadKey() throws Exception {
        return (SecretKey) getKeyStore().getKey(KEY_ALIAS, null);
    }

    private Cipher initCipherForDecrypt() {
        try {
            if (!hasKey()) {
                return null;
            }
            SecretKey key = loadKey();
            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(128, unb64(prefs().getString(PREFS_SECRET_IV, ""))));
            return cipher;
        } catch (KeyPermanentlyInvalidatedException e) {
            return null; // huellas cambiadas -> re-enrolar
        } catch (Exception e) {
            return null;
        }
    }

    // ── Utility ──────────────────────────────────────────────────────────

    /**
     * Ejecuta `action` en el main thread y recién cuando la activity esté
     * en RESUMED. Cubre dos exigencias de BiometricPrompt/FragmentManager:
     *
     * 1. **Thread:** Capacitor 8 ejecuta los métodos de plugin en un
     *    HandlerThread propio ("CapacitorPlugins"), y
     *    `FragmentManager.ensureExecReady()` exige
     *    `Looper.myLooper() == main` para añadir el BiometricFragment
     *    ("Must be called from main thread of fragment host").
     * 2. **Estado:** con la activity en STARTED el FragmentManager rechaza la
     *    transacción ("Can not perform this action after onSaveInstanceState"
     *    / "Cannot show biometric prompt when in background").
     */
    private void runWhenActivityReady(FragmentActivity activity, PluginCall call, Runnable action) {
        @NonNull final boolean[] done = {false};
        final Runnable fail = () -> {
            if (done[0]) {
                return;
            }
            done[0] = true;
            call.reject("PROMPT_ERROR", "La actividad se cerró antes de mostrar la autenticación biométrica");
        };
        final Runnable execute = () -> {
            if (done[0]) {
                return;
            }
            if (activity.isFinishing() || activity.isDestroyed()) {
                done[0] = true;
                call.reject("NO_ACTIVITY", "La actividad ya no está disponible");
            } else if (!activity.getLifecycle().getCurrentState().isAtLeast(Lifecycle.State.RESUMED)) {
                // Volvió a pausar durante el salto de thread: re-esperar.
                runWhenActivityReady(activity, call, action);
            } else {
                done[0] = true;
                action.run();
            }
        };
        if (activity.isFinishing() || activity.isDestroyed()) {
            call.reject("NO_ACTIVITY", "La actividad ya no está disponible");
            return;
        }
        if (!activity.getLifecycle().getCurrentState().isAtLeast(Lifecycle.State.RESUMED)) {
            activity.getLifecycle().addObserver(new LifecycleEventObserver() {
                @Override
                public void onStateChanged(@NonNull LifecycleOwner owner, @NonNull Lifecycle.Event event) {
                    if (done[0]) {
                        owner.getLifecycle().removeObserver(this);
                        return;
                    }
                    if (event == Lifecycle.Event.ON_DESTROY) {
                        owner.getLifecycle().removeObserver(this);
                        fail.run();
                    } else if (owner.getLifecycle().getCurrentState().isAtLeast(Lifecycle.State.RESUMED)) {
                        owner.getLifecycle().removeObserver(this);
                        execute.run(); // el observer siempre corre en el main thread
                    }
                }
            });
        } else {
            activity.runOnUiThread(execute);
        }
    }

    // ── Métodos expuestos a JS ───────────────────────────────────────────

    /** Chequea si hay biometría fuerte disponible y si ya hay credencial enrolada. */
    @PluginMethod
    public void isAvailable(PluginCall call) {
        int strong = BiometricManager.BIOMETRIC_ERROR_UNSUPPORTED;
        boolean available = false;
        try {
            BiometricManager bm = BiometricManager.from(ctx());
            strong = bm.canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG);
            available = strong == BiometricManager.BIOMETRIC_SUCCESS;
            android.util.Log.i("BiometricAuth", "isAvailable: canAuthenticate(BIOMETRIC_STRONG)=" + strong);
        } catch (Exception e) {
            android.util.Log.e("BiometricAuth", "isAvailable error", e);
            available = false;
        }
        JSObject ret = new JSObject();
        ret.put("available", available);
        ret.put("enrolled", hasKey() && prefs().getString(PREFS_SECRET_CT, null) != null);
        if (!available) {
            // Solo diagnóstico: expone el código de BiometricManager.canAuthenticate
            // para saber por qué no hay biometría fuerte (1 hw no disp, 11 sin
            // enrollar, 12 sin hardware, 13 no soportado).
            ret.put("reason", strong);
        }
        call.resolve(ret);
    }

    /**
     * Genera una nueva credencial: crea la clave de autenticación, pide la
     * huella y cifra el `secret` recibido bajo esa clave.
     */
    @PluginMethod
    public void enroll(PluginCall call) {
        String secret = call.getString("secret");
        if (secret == null || secret.isEmpty()) {
            call.reject("MISSING_SECRET", "Falta el secreto a enrolar");
            return;
        }
        String deviceId = call.getString("deviceId", "");

        FragmentActivity activity = (FragmentActivity) getActivity();
        if (activity == null) {
            call.reject("NO_ACTIVITY", "No hay actividad disponible");
            return;
        }

        Executor executor = ContextCompat.getMainExecutor(ctx());
        BiometricPrompt prompt = new BiometricPrompt(activity, executor,
                new BiometricPrompt.AuthenticationCallback() {
                    private boolean resolved = false;

                    @Override
                    public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result) {
                        if (resolved) {
                            return;
                        }
                        resolved = true;
                        try {
                            Cipher encryptCipher = result.getCryptoObject().getCipher();
                            byte[] ciphertext = encryptCipher.doFinal(secret.getBytes(StandardCharsets.UTF_8));
                            prefs().edit()
                                    .putString(PREFS_SECRET_CT, b64(ciphertext))
                                    .putString(PREFS_SECRET_IV, b64(encryptCipher.getIV()))
                                    .putString(PREFS_DEVICE_ID, deviceId)
                                    .apply();
                            call.resolve(new JSObject());
                        } catch (Exception e) {
                            call.reject("ENCRYPT_FAILED", "No se pudo cifrar la credencial: " + e.getMessage());
                        }
                    }

                    @Override
                    public void onAuthenticationError(int errorCode, CharSequence errString) {
                        if (resolved) {
                            return;
                        }
                        resolved = true;
                        call.reject(String.valueOf(errorCode), errString != null ? errString.toString() : "Autenticación cancelada");
                    }

                    @Override
                    public void onAuthenticationFailed() {
                        // Huella incorrecta: el prompt sigue abierto, no se resuelve.
                    }
                });

        runWhenActivityReady(activity, call, () -> {
            try {
                SecretKey key = createKey();
                Cipher cipher = Cipher.getInstance(TRANSFORMATION);
                cipher.init(Cipher.ENCRYPT_MODE, key);
                BiometricPrompt.PromptInfo info = new BiometricPrompt.PromptInfo.Builder()
                        .setTitle(call.getString("promptTitle", "Configurar huella"))
                        .setSubtitle(call.getString("promptSubtitle", "Confirmá con tu huella para habilitar el acceso rápido"))
                        .setNegativeButtonText(call.getString("negativeButtonText", "Cancelar"))
                        .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG)
                        .build();
                prompt.authenticate(info, new BiometricPrompt.CryptoObject(cipher));
            } catch (Exception e) {
                call.reject("ENROLL_FAILED", "No se pudo inicializar la credencial: " + e.getMessage());
            }
        });
    }

    /**
     * Pide la huella y, si es válida, desencripta y devuelve el secreto a JS.
     * Si la clave se invalidó por cambio de huellas, rechaza con NEED_REENROLL.
     */
    @PluginMethod
    public void authenticate(PluginCall call) {
        FragmentActivity activity = (FragmentActivity) getActivity();
        if (activity == null) {
            call.reject("NO_ACTIVITY", "No hay actividad disponible");
            return;
        }

        Cipher decryptCipher = initCipherForDecrypt();
        if (decryptCipher == null) {
            call.reject("NEED_REENROLL", "La huella cambió o no hay credencial. Reconfigurá el acceso con tu contraseña");
            return;
        }

        Executor executor = ContextCompat.getMainExecutor(ctx());
        BiometricPrompt prompt = new BiometricPrompt(activity, executor,
                new BiometricPrompt.AuthenticationCallback() {
                    private boolean resolved = false;

                    @Override
                    public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result) {
                        if (resolved) {
                            return;
                        }
                        resolved = true;
                        try {
                            Cipher c = result.getCryptoObject().getCipher();
                            byte[] plain = c.doFinal(unb64(prefs().getString(PREFS_SECRET_CT, "")));
                            String secret = new String(plain, StandardCharsets.UTF_8);
                            JSObject ret = new JSObject();
                            ret.put("secret", secret);
                            ret.put("deviceId", prefs().getString(PREFS_DEVICE_ID, ""));
                            call.resolve(ret);
                        } catch (Exception e) {
                            call.reject("DECRYPT_FAILED", "No se pudo recuperar la credencial: " + e.getMessage());
                        }
                    }

                    @Override
                    public void onAuthenticationError(int errorCode, CharSequence errString) {
                        if (resolved) {
                            return;
                        }
                        resolved = true;
                        call.reject(String.valueOf(errorCode), errString != null ? errString.toString() : "Autenticación cancelada");
                    }

                    @Override
                    public void onAuthenticationFailed() {
                        // Huella incorrecta: sigue el prompt.
                    }
                });

        runWhenActivityReady(activity, call, () -> {
            try {
                BiometricPrompt.PromptInfo info = new BiometricPrompt.PromptInfo.Builder()
                        .setTitle(call.getString("promptTitle", "Iniciar sesión"))
                        .setSubtitle(call.getString("promptSubtitle", "Usá tu huella para entrar"))
                        .setNegativeButtonText(call.getString("negativeButtonText", "Cancelar"))
                        .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG)
                        .build();
                prompt.authenticate(info, new BiometricPrompt.CryptoObject(decryptCipher));
            } catch (Exception e) {
                // Fallback defensivo: si aún así no se pudo mostrar el prompt,
                // loguear la excepción real — el UI solo muestra el message,
                // la causa queda en el campo code de la rejection.
                android.util.Log.e("BiometricAuth", "authenticate: prompt.authenticate() threw", e);
                call.reject("PROMPT_ERROR", "No se pudo mostrar la autenticación biométrica: " + e.getMessage());
            }
        });
    }

    /**
    /** Borra la credencial local (texto cifrado + clave del Keystore).
     * Se usa al desactivar la huella o al revocar el dispositivo. La clave se
     * elimina del Keystore para que el secreto quede irrecuperable.
     */
    @PluginMethod
    public void clear(PluginCall call) {
        prefs().edit().remove(PREFS_SECRET_CT).remove(PREFS_SECRET_IV).remove(PREFS_DEVICE_ID).apply();
        try {
            if (hasKey()) {
                getKeyStore().deleteEntry(KEY_ALIAS);
            }
            call.resolve(new JSObject());
        } catch (Exception e) {
            call.reject("CLEAR_FAILED", "No se pudo limpiar la credencial local: " + e.getMessage());
        }
    }
}
