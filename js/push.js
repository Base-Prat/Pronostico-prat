// push.js — Suscripción a notificaciones push (Meteo Prat)
// Blindado para iOS/PWA y para repositorios en subdirectorio (GitHub Pages).
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js";
import { getMessaging, getToken, onMessage, isSupported } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-messaging.js";

const firebaseConfig = {
  apiKey: "AIzaSyD8Z0ECQwRxsFG7988dmOxEFGzdfRkZIVQ",
  authDomain: "meteo-prat.firebaseapp.com",
  projectId: "meteo-prat",
  storageBucket: "meteo-prat.firebasestorage.app",
  messagingSenderId: "1021164708009",
  appId: "1:1021164708009:web:c1025702782e6a973d49b8"
};

const VAPID_KEY = "BHbX9YA38rFauI5ZjDUv9LIeZOxegZg6AnxUCT5flgvQaNznoUjVXpVI2G8-hf0UHvCFnnhj3RDKP1vUSKiz9dc";

const app = initializeApp(firebaseConfig);

// Botón flotante para activar alertas
const btn = document.createElement("button");
btn.id = "btn-push";
btn.textContent = "🔔 Activar alertas de tormenta";
btn.style.cssText =
  "position:fixed;bottom:16px;left:16px;z-index:9999;padding:10px 14px;" +
  "background:#0a4d8c;color:#fff;border:none;border-radius:8px;font-size:14px;" +
  "cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.3)";
document.body.appendChild(btn);

btn.addEventListener("click", async () => {
  try {
    // 1) Verifica soporte (iOS solo soporta push si está instalada como app)
    const soportado = await isSupported().catch(() => false);
    if (!soportado || !("serviceWorker" in navigator) || !("Notification" in window)) {
      alert("Este dispositivo no soporta notificaciones push.\n\nEn iPhone debes abrir la app desde el ícono de la pantalla de inicio (no desde Safari).");
      return;
    }

    // 2) Pide permiso
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      alert("Permiso de notificaciones denegado.");
      return;
    }

    // 3) Registra NOSOTROS el service worker con ruta relativa correcta
    //    (funciona aunque el sitio viva en /Pronostico-prat/)
    const swReg = await navigator.serviceWorker.register("firebase-messaging-sw.js");
    await navigator.serviceWorker.ready;

    // 4) Inicializa messaging y pide el token usando ESE registro
    const messaging = getMessaging(app);
    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: swReg
    });

    if (token) {
      console.log("Token FCM:", token);
      alert("✅ Alertas activadas correctamente.");
      btn.textContent = "🔔 Alertas activadas";
      btn.disabled = true;
      btn.style.background = "#2e7d32";

      // Escucha mensajes cuando la app está abierta
      onMessage(messaging, (payload) => {
        const t = payload.notification?.title || "Alerta meteorológica";
        const b = payload.notification?.body || "";
        new Notification(t, { body: b, icon: "assets/icon-192.png" });
      });
    } else {
      alert("No se pudo obtener el token. Revisa el service worker.");
    }
  } catch (err) {
    console.error("Error al activar push:", err);
    alert("Error: " + err.message);
  }
});