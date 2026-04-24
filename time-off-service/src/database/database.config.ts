import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';

export const getDatabaseConfig = (configService: ConfigService): TypeOrmModuleOptions => {
  const isProduction = configService.get<string>('NODE_ENV') === 'production';
  const isDevelopment = configService.get<string>('NODE_ENV') === 'development';

  return {
    type: 'sqlite',
    database: configService.get<string>('DATABASE_PATH', './data/timeoff.db'),
    entities: [__dirname + '/../**/*.entity{.ts,.js}'],
    synchronize: !isProduction,
    logging: isDevelopment,
    migrations: [__dirname + '/../migrations/*{.ts,.js}'],
    migrationsRun: false,

    // Connection pooling configuration
    // SQLite doesn't support traditional connection pooling, but we can optimize connection behavior
    maxQueryExecutionTime: configService.get<number>('DB_MAX_QUERY_TIME', 1000), // Log slow queries (ms)
    
    // Query result caching configuration
    cache: {
      type: 'database',
      duration: configService.get<number>('DB_CACHE_DURATION', 30000), // 30 seconds default
      tableName: 'query_result_cache',
    },

    // Additional SQLite optimizations
    extra: {
      // Enable Write-Ahead Logging for better concurrency
      // WAL mode allows readers to access the database while a write is in progress
      pragma: [
        'journal_mode = WAL',
        'synchronous = NORMAL',
        'cache_size = -64000', // 64MB cache (negative value = KB)
        'temp_store = MEMORY',
        'mmap_size = 30000000000', // 30GB memory-mapped I/O
        'page_size = 4096',
      ].join('; '),
    },
  };
};

