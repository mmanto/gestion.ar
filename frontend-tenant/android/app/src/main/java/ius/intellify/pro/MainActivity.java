package ius.intellify.pro;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.os.Build;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    // El plugin BiometricAuth (login con huella) no se autoregistra en builds
    // multidex: Capacitor descubre los plugins de la app escaneando el dex
    // primario (DexFile) y la clase quedaba en classes11.dex → isAvailable()
    // tiraba "plugin not registered" en el puente y la app reportaba "sin
    // huella configurada" sin reason y sin log nativo. Registro explícito
    // antes de crear el bridge.
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BiometricAuthPlugin.class);
        super.onCreate(savedInstanceState);

        // IMPORTANCE_HIGH explícito: si el canal referenciado por
        // com.google.firebase.messaging.default_notification_channel_id (ver
        // AndroidManifest.xml) no existe todavía cuando llega el primer mensaje,
        // el SDK de Firebase lo crea con importancia DEFAULT — alcanza para el
        // shade pero no siempre dispara heads-up/sonido en todos los fabricantes.
        // Creándolo acá, antes de cualquier mensaje, queda con la prioridad
        // correcta desde el arranque.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                getString(R.string.default_notification_channel_id),
                "Mensajes de clientes",
                NotificationManager.IMPORTANCE_HIGH
            );
            channel.setDescription("Avisos cuando un cliente escribe al bot");
            NotificationManager manager = getSystemService(NotificationManager.class);
            manager.createNotificationChannel(channel);
        }
    }
}