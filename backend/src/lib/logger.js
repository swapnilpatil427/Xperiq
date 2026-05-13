const pino = require('pino');

const isProd = process.env.NODE_ENV === 'production';
const lokiUrl = process.env.LOKI_URL;

const baseOptions = {
  level: process.env.LOG_LEVEL || 'info',
  base: {
    service: 'experient-api',
    env: process.env.NODE_ENV || 'development',
    backend: process.env.BACKEND || 'firebase',
  },
};

function buildTransports() {
  const targets = [];

  // Stdout — pretty in dev, JSON in prod
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

  // Loki push — enabled whenever LOKI_URL is set (local docker, Grafana Cloud, or Fly.io)
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
        // Grafana Cloud requires basic auth: set LOKI_USER and LOKI_PASSWORD
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
