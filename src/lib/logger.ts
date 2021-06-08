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
        const argsStr = args.map((arg) => typeof arg === 'object' ? (arg instanceof Error ? `Error message : ${arg.message} | Error stack : ${arg.stack}` : JSON.stringify(arg)) : arg);
        Logger.logger.log(type, argsStr.join(' | '));
    };
}

export default Logger;