// firebase-messaging-sw.js — Recibe alertas con la app cerrada (Meteo Prat)
importScripts("https://www.gstatic.com/firebasejs/12.17.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.17.1/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyD8Z0ECQwRxsFG7988dmOxEFGzdfRkZIVQ",
  authDomain: "meteo-prat.firebaseapp.com",
  projectId: "meteo-prat",
  storageBucket: "meteo-prat.firebasestorage.app",
  messagingSenderId: "1021164708009",
  appId: "1:1021164708009:web:c1025702782e6a973d49b8"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || "Alerta meteorológica";
  const options = {
    body: payload.notification?.body || "",
    icon: "assets/icon-192.png",
    badge: "assets/icon-192.png"
  };
  self.registration.showNotification(title, options);
});