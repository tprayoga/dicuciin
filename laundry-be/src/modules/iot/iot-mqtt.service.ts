import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { MqttClient } from 'mqtt';
import { connect } from 'mqtt';

/** Event masuk dari device (di-parse dari topic events). */
export interface IncomingDeviceEvent {
  deviceCode: string;
  eventType: string;
  payload?: Record<string, unknown>;
  commandId?: string;
}

export type DeviceEventHandler = (event: IncomingDeviceEvent) => Promise<unknown>;

/**
 * Transport MQTT untuk IoT. HANYA mengurus koneksi/publish/subscribe — lifecycle
 * command ada di `IotMachineService`. Resilient: bila `MQTT_URL` kosong atau broker
 * mati, service tetap hidup (boot tidak gagal) dan `publish` jadi no-op (command tetap
 * tercatat di DB sebagai source of truth). Pola sama dengan scheduler (tidak gagalkan boot).
 */
@Injectable()
export class IotMqttService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(IotMqttService.name);
  private client?: MqttClient;

  /** Di-set oleh IotMachineService.onModuleInit (hindari circular DI). */
  eventHandler?: DeviceEventHandler;

  get commandPrefix(): string {
    return process.env.MQTT_COMMAND_PREFIX ?? 'dicuciin/machines';
  }

  get eventPrefix(): string {
    return process.env.MQTT_EVENT_PREFIX ?? 'dicuciin/machines';
  }

  get connected(): boolean {
    return this.client?.connected ?? false;
  }

  commandTopic(deviceCode: string): string {
    return `${this.commandPrefix}/${deviceCode}/commands`;
  }

  onModuleInit() {
    const url = process.env.MQTT_URL;
    if (!url) {
      this.logger.warn('MQTT_URL tidak diset — IoT MQTT nonaktif (publish no-op).');
      return;
    }
    try {
      this.client = connect(url, {
        username: process.env.MQTT_USERNAME || undefined,
        password: process.env.MQTT_PASSWORD || undefined,
        clientId:
          (process.env.MQTT_CLIENT_ID || 'dicuciin-be') +
          '-' +
          Math.random().toString(16).slice(2, 8),
        reconnectPeriod: 5000,
        connectTimeout: 8000,
      });
      this.client.on('connect', () => {
        this.logger.log(`MQTT terhubung ke ${url}`);
        const sub = `${this.eventPrefix}/+/events`;
        this.client!.subscribe(sub, (err) => {
          if (err) this.logger.error(`Gagal subscribe ${sub}: ${err.message}`);
          else this.logger.log(`Subscribe events: ${sub}`);
        });
      });
      this.client.on('error', (err) =>
        this.logger.error(`MQTT error: ${err.message}`),
      );
      this.client.on('message', (topic, message) =>
        this.handleMessage(topic, message),
      );
    } catch (err) {
      this.logger.error(`Gagal inisialisasi MQTT: ${(err as Error).message}`);
    }
  }

  onModuleDestroy() {
    this.client?.end(true);
  }

  /** Publish command ke device. Best-effort: false bila broker tak terhubung. */
  publishCommand(
    deviceCode: string,
    command: string,
    payload: Record<string, unknown>,
  ): boolean {
    const topic = this.commandTopic(deviceCode);
    if (!this.client || !this.client.connected) {
      this.logger.warn(
        `MQTT tidak terhubung — command ${command} untuk ${deviceCode} tidak terkirim (tercatat di DB).`,
      );
      return false;
    }
    this.client.publish(
      topic,
      JSON.stringify({ command, ...payload }),
      { qos: 1 },
      (err) => {
        if (err) this.logger.error(`Gagal publish ${topic}: ${err.message}`);
      },
    );
    return true;
  }

  /** Parse `prefix/<deviceCode>/events` lalu teruskan ke handler bila ada. */
  private async handleMessage(topic: string, message: Buffer) {
    const parts = topic.split('/');
    const deviceCode = parts.length >= 2 ? parts[parts.length - 2] : '';
    let body: Record<string, unknown> = {};
    try {
      body = JSON.parse(message.toString()) as Record<string, unknown>;
    } catch {
      this.logger.warn(`Event MQTT bukan JSON valid dari topic ${topic}`);
      return;
    }
    const eventType = String(body['eventType'] ?? body['type'] ?? '').toUpperCase();
    if (!deviceCode || !eventType) return;
    if (!this.eventHandler) return;
    try {
      await this.eventHandler({
        deviceCode,
        eventType,
        payload: body,
        commandId: body['commandId'] as string | undefined,
      });
    } catch (err) {
      this.logger.error(`Gagal proses event ${eventType}: ${(err as Error).message}`);
    }
  }
}
