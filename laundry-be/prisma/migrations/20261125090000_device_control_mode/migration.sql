-- Mode kontrol mesin: IOT (default, perilaku lama) atau MANUAL (tanpa IoT —
-- kondisi diatur admin, scan QR langsung menandai booking dipakai). Aditif.
ALTER TABLE "iot_devices" ADD COLUMN "controlMode" TEXT NOT NULL DEFAULT 'IOT';
