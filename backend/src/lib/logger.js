const pino = require('pino');

const isProd = process.env.NODE_ENV === 'production';
const lokiUrl = process.env.LOKI_URL;

// GCP Cloud Logging expects a `severity` string field rather than pino's
// numeric `level`. Only applied in production so pino-pretty works locally.
const gcpSeverity = { trace: 'DEBUG', debug: 'DEBUG', info: 'INFO', warn: 'WARNING', error: 'ERROR', fatal: 'CRITICAL' };

const baseOptions = {
  level: process.env.LOG_LEVEL || 'info',
  base: {
    service: 'experient-api',
    env: process.env.NODE_ENV || 'development',
    backend: process.env.BACKEND || 'firebase',
  },
  ...(isProd && {
    formatters: {
      level(label) {
        return { severity: gcpSeverity[label] || 'DEFAULT' };
      },
    },
  }),
};

function buildTransports() {
  const targets = [];

  targets.push(
    isProd
      ? { target: 'pino/file', options: { destination: 1 }, level: baseOptions.level }
      : {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:HH:MM:ss.l',
            ignore: 'pid,hostname,service,backend,env',
            messageFormat: '{msg}',
          },
          level: baseOptions.level,
        }
  );

  if (lokiUrl) {
    targets.push({
      target: 'pino-loki',
      options: {
        host: lokiUrl,
        labels: {
          service: 'experient-api',
          env: process.env.NODE_ENV || 'development',
          backend: process.env.BACKEND || 'firebase',
        },
        replaceTimestamp: true,
        ...(process.env.LOKI_USER && {
          basicAuth: {
            username: process.env.LOKI_USER,
            password: process.env.LOKI_PASSWORD,
          },
        }),
      },
      level: baseOptions.level,
    });
  }

  return targets;
}

const logger = pino(baseOptions, pino.transport({ targets: buildTransports() }));

module.exports = logger;
