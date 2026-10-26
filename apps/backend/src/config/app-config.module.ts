import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AppConfigService } from './app-config.service.js';
import { envFilePaths, validateEnv } from './env.schema.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: envFilePaths(),
      isGlobal: true,
      validate: validateEnv,
    }),
  ],
  providers: [AppConfigService],
  exports: [AppConfigService],
})
export class AppConfigModule {}
