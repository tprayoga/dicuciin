import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';

@Processor('iot-command')
export class IotCommandProcessor extends WorkerHost {
  private readonly logger = new Logger(IotCommandProcessor.name);

  async process(job: Job) {
    this.logger.log(`Processing IoT command job: ${job.name}`);

    switch (job.name) {
      case 'publish-command':
        await this.publishCommand(job.data);
        break;
      case 'print-receipt':
        await this.printReceipt(job.data);
        break;
      case 'print-label':
        await this.printLabel(job.data);
        break;
      case 'open-locker':
        await this.openLocker(job.data);
        break;
      default:
        this.logger.warn(`Unknown IoT command job: ${job.name}`);
    }
  }

  private async publishCommand(data: { deviceCode: string; command: string; payload: any }) {
    this.logger.log(`[MQTT] Publish to laundry/device/${data.deviceCode}/command`);
    // TODO: inject MqttService and publish to broker
  }

  private async printReceipt(data: { deviceCode: string; orderId: string }) {
    this.logger.log(`[PRINTER] Print receipt for order ${data.orderId} on device ${data.deviceCode}`);
  }

  private async printLabel(data: { deviceCode: string; orderId: string }) {
    this.logger.log(`[PRINTER] Print label for order ${data.orderId} on device ${data.deviceCode}`);
  }

  private async openLocker(data: { deviceCode: string; lockerId: string }) {
    this.logger.log(`[LOCKER] Open locker ${data.lockerId} on device ${data.deviceCode}`);
  }
}
