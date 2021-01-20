import winston from 'winston';

type LogLevel = 'error' | 'warn' | 'info' | 'http' | 'verbose' | 'debug' | 'silly';

class Logger {
    static logger: winston.Logger;
    constructor(opt: { level: LogLevel }) {
        Logger.logger = winston.createLogger({
            level: opt.level,
            format: winston.format.simple(),
            defaultMeta: { service: 'user-service' },
            transports: [
                new winston.transports.Console(),
            ],
        });
    }

    static log = (type: 'error' | 'warn' | 'info' | 'http' | 'verbose' | 'debug' | 'silly', ...args: any[]) => {

        Logger.logger.log(type, args.join(' | '));
    };
}

export default Logger;