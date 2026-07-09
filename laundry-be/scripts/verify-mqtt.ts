/**
 * Verifikasi runtime MQTT (READ-ONLY untuk mesin). Hanya memakai test topic
 * (default dicuciin/test/verify): connect → subscribe → publish → tunggu echo.
 *
 * TIDAK mengirim command ke mesin real, TIDAK start mesin, TIDAK menyentuh DB.
 *
 * Jalankan: npm run verify:mqtt
 * Bila MQTT_URL belum diset / broker mati: output error jelas + exit code 1.
 */
import { connect } from 'mqtt';

// Best-effort load .env (script standalone tidak auto-load seperti app NestJS).
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('dotenv').config();
} catch {
  // dotenv opsional; lanjut pakai process.env / default.
}

async function main() {
  // Default ke broker docker-compose (sejalan dgn verify:redis-scheduler).
  const url = process.env.MQTT_URL || 'mqtt://localhost:1883';
  const verifyTopic = process.env.MQTT_VERIFY_TOPIC ?? 'dicuciin/test/verify';

  const result: Record<string, unknown> = {
    mqtt: { url, reachable: false },
    subscribe: false,
    publish: false,
    roundtrip: false,
  };

  const client = connect(url, {
    username: process.env.MQTT_USERNAME || undefined,
    password: process.env.MQTT_PASSWORD || undefined,
    clientId: (process.env.MQTT_CLIENT_ID || 'dicuciin-verify') + '-' + Date.now(),
    connectTimeout: 8000,
    reconnectPeriod: 0,
  });

  await new Promise<void>((resolve) => {
    const timeout = setTimeout(resolve, 10000);
    const token = `verify-${Date.now()}`;

    client.on('connect', () => {
      (result.mqtt as any).reachable = true;
      client.subscribe(verifyTopic, (err) => {
        if (err) {
          clearTimeout(timeout);
          return resolve();
        }
        result.subscribe = true;
        client.publish(verifyTopic, token, { qos: 1 }, (perr) => {
          if (!perr) result.publish = true;
        });
      });
    });

    client.on('message', (topic, message) => {
      if (topic === verifyTopic && message.toString() === token) {
        // Menerima echo = publish pasti berhasil (hindari race dgn callback PUBACK).
        result.publish = true;
        result.roundtrip = true;
        clearTimeout(timeout);
        resolve();
      }
    });

    client.on('error', () => {
      clearTimeout(timeout);
      resolve();
    });
  });

  client.end(true);

  const reachable = (result.mqtt as any).reachable as boolean;
  const ok = reachable && result.subscribe === true && result.publish === true;
  if (!ok && !reachable) {
    (result as any).hint = 'Broker tidak terjangkau. Cek MQTT_URL / jalankan broker.';
  }
  console.log(JSON.stringify({ ok, ...result }, null, 2));
  if (!ok) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
