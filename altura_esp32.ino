/*
  Medidor de altura - Colegio Comfandi
  ESP32 + HC-SR04 montado en el techo/marco a ALTURA_SENSOR_CM del piso, apuntando hacia abajo.

  Conexiones:
    HC-SR04 VCC  -> VIN (5V)       HC-SR04 GND -> GND
    HC-SR04 TRIG -> GPIO 5
    HC-SR04 ECHO -> GPIO 18  A TRAVÉS DE UN DIVISOR DE VOLTAJE (ECHO saca 5V, el ESP32 tolera 3.3V):
                     ECHO --[1kΩ]--+--[2kΩ]-- GND   y el punto central (+) va al GPIO 18

  Funcionamiento: cada segundo pregunta al servidor si hay una medición pendiente
  (la que se crea al pulsar "Medir altura"). Si la hay, mide y envía el resultado.
*/
#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>

const char* WIFI_SSID = "WORKINGVIRUS";
const char* WIFI_PASS = "Mandraque4619";
const char* SERVIDOR  = "https://nutriescolar-yx5b.onrender.com/";   // sin "/" final
const char* API_KEY   = "MiClaveSuperSecretaParaElEsp32_987";        // igual a ESP32_KEY del .env

const float ALTURA_SENSOR_CM = 200.0;   // distancia fija sensor -> piso (medirla con flexómetro)
const int TRIG = 5, ECHO = 18;
const int MUESTRAS = 15;

float leerDistanciaCm() {
  digitalWrite(TRIG, LOW);  delayMicroseconds(3);
  digitalWrite(TRIG, HIGH); delayMicroseconds(10);
  digitalWrite(TRIG, LOW);
  long us = pulseIn(ECHO, HIGH, 30000);        // máx ~5 m
  return us == 0 ? -1 : us * 0.0343 / 2.0;     // velocidad del sonido ~343 m/s
}

// Mediana de varias lecturas para filtrar ruido
float distanciaMediana() {
  float v[MUESTRAS]; int n = 0;
  for (int i = 0; i < MUESTRAS; i++) {
    float d = leerDistanciaCm();
    if (d > 2 && d < 400) v[n++] = d;
    delay(60);
  }
  if (n < MUESTRAS / 2) return -1;
  for (int i = 1; i < n; i++) { float k = v[i]; int j = i - 1; while (j >= 0 && v[j] > k) { v[j + 1] = v[j]; j--; } v[j + 1] = k; }
  return v[n / 2];
}

void conectarWiFi() {
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) { delay(500); Serial.print("."); }
  Serial.println("\nWiFi OK: " + WiFi.localIP().toString());
}

void setup() {
  Serial.begin(115200);
  pinMode(TRIG, OUTPUT); pinMode(ECHO, INPUT);
  conectarWiFi();
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) conectarWiFi();

  WiFiClientSecure client; client.setInsecure();   // para producción: usar setCACert()
  HTTPClient http;
  http.begin(client, String(SERVIDOR) + "/api/esp32/pendiente");
  http.addHeader("x-api-key", API_KEY);
  int code = http.GET();
  String body = code == 200 ? http.getString() : "";
  http.end();

  int p = body.indexOf("\"id\":");
  if (p >= 0) {
    int id = body.substring(p + 5).toInt();
    float dist = distanciaMediana();
    float altura = dist < 0 ? 0 : ALTURA_SENSOR_CM - dist;   // altura = distancia fija - lectura
    Serial.printf("Solicitud %d -> distancia %.1f cm, altura %.1f cm\n", id, dist, altura);

    WiFiClientSecure c2; c2.setInsecure();
    HTTPClient h2;
    h2.begin(c2, String(SERVIDOR) + "/api/esp32/resultado");
    h2.addHeader("Content-Type", "application/json");
    h2.addHeader("x-api-key", API_KEY);
    h2.POST("{\"id\":" + String(id) + ",\"altura_cm\":" + String(altura, 1) + "}");
    h2.end();
  }
  delay(1000);
}
