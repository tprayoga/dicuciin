import { Module } from '@nestjs/common';
import { IotController } from './iot.controller';
import { IotService } from './iot.service';
import { IotMqttService } from './iot-mqtt.service';
import { IotMachineService } from './iot-machine.service';

@Module({
  controllers: [IotController],
  providers: [IotService, IotMqttService, IotMachineService],
  exports: [IotService, IotMachineService],
})
export class IotModule {}
